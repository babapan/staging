/**
 * tcpGatewayClient.ts
 *
 * JSON-over-TCP client for the max99 gateway (port 9119).
 *
 * Protocol: Newline-delimited JSON — each packet is a single JSON object
 * followed by "\n". Mirrors the server's tcp.ts implementation which in
 * turn mirrors the binary Fusion protocol packet types from the Android app.
 *
 * Client → Server packets:
 *   LOGIN        { type, username, password }
 *   JOIN_ROOM    { type, roomId }
 *   LEAVE_ROOM   { type }
 *   SEND_MESSAGE { type, roomId, text }
 *   CMD          { type, cmd, roomId, ...opts }
 *   PING         { type }
 *   LOGOUT       { type }
 *
 * Server → Client packets:
 *   LOGIN_OK     { type, sessionId, user, migLevel, theme }
 *   JOIN_OK      { type, roomId, room, participants, history, isReconnect }
 *   LEAVE_OK     { type, roomId }
 *   MESSAGE      { type, roomId, message }
 *   USER_JOINED  { type, roomId, username }
 *   USER_LEFT    { type, roomId, username }
 *   PARTICIPANTS { type, roomId, participants }
 *   ANNOUNCEMENT { type, roomId, text }
 *   ANNOUNCEMENT_OFF { type, roomId }
 *   BUMPED       { type, roomId, by }
 *   KICKED       { type, roomId, by }
 *   BANNED       { type, roomId, by }
 *   WARNED       { type, roomId, by, message }
 *   MOD          { type, roomId, username }
 *   UNMOD        { type, roomId, username }
 *   COLOR_LIST   { type, colors }
 *   COLOR_CHANGED { type, roomId, userId, color }
 *   PONG         { type, timestamp }
 *   ERROR        { type, code, message }
 *
 * Requires react-native-tcp-socket (native EAS/Development Build only).
 * On web or Expo Go it emits an 'unsupported' event — fall back to WebSocket.
 *
 * Usage:
 *   import { tcpGateway } from './tcpGatewayClient';
 *   tcpGateway.on('loginOk',  (payload) => { ... });
 *   tcpGateway.on('message',  (payload) => { ... });
 *   tcpGateway.connect({ host, port, username, password });
 */

import { Platform, AppState, AppStateStatus, Dimensions } from 'react-native';
import { messageQueue, type FailedMessage } from './messageQueue';
import { API_BASE } from '../config/connection';
import { networkMonitor } from './networkMonitor';

// ─── Packet shapes ────────────────────────────────────────────────────────────

export interface TcpLoginOkPayload {
  sessionId: string;
  user: { id: string; username: string; displayName: string | null };
  migLevel: number;
  theme: Record<string, unknown>;
}

export interface TcpMessage {
  id: string;
  text: string;
  senderId?: string;
  senderUsername: string;
  senderColor: string;
  isSystem: boolean;
  createdAt: string;
}

export interface TcpJoinOkPayload {
  roomId: string;
  room: Record<string, unknown>;
  participants: Record<string, unknown>;
  history: TcpMessage[];
  /** True when this is a transparent reconnect — no "has entered" was broadcast */
  isReconnect: boolean;
}

export interface TcpMessagePayload {
  roomId: string;
  message: TcpMessage;
}

export interface TcpUserEventPayload {
  roomId: string;
  username: string;
}

export interface TcpParticipantsPayload {
  type: string;
  roomId: string;
  roomName?: string;
  participants: Array<{
    id: string;
    username: string;
    color: string;
    role: string;
    migLevel: number;
    displayName?: string;
  }>;
}

export interface TcpModerationPayload {
  roomId: string;
  by?: string;
  username?: string;
  message?: string;
}

export interface TcpColorChangedPayload {
  roomId: string;
  userId: string;
  color: string;
}

export interface TcpErrorPayload {
  code: number;
  message: string;
}

// ─── EventMap ─────────────────────────────────────────────────────────────────

type EventMap = {
  connected:      () => void;
  loginOk:        (p: TcpLoginOkPayload) => void;
  loginError:     (p: TcpErrorPayload) => void;
  joinOk:         (p: TcpJoinOkPayload) => void;
  leaveOk:        (roomId: string) => void;
  message:        (p: TcpMessagePayload) => void;
  userJoined:     (p: TcpUserEventPayload) => void;
  userLeft:       (p: TcpUserEventPayload) => void;
  participants:   (p: TcpParticipantsPayload) => void;
  announce:       (p: { roomId: string; text: string }) => void;
  announceOff:    (p: { roomId: string }) => void;
  bumped:         (p: TcpModerationPayload) => void;
  kicked:         (p: TcpModerationPayload) => void;
  banned:         (p: TcpModerationPayload) => void;
  warned:         (p: TcpModerationPayload) => void;
  mod:            (p: TcpModerationPayload) => void;
  unmod:          (p: TcpModerationPayload) => void;
  colorList:      (p: { colors: string[] }) => void;
  colorChanged:   (p: TcpColorChangedPayload) => void;
  pong:           (timestamp: number) => void;
  error:          (p: TcpErrorPayload) => void;
  disconnected:   () => void;
  unsupported:    (reason: string) => void;
};

type Listener<K extends keyof EventMap> = EventMap[K];

// ─── Connection options ───────────────────────────────────────────────────────

export interface TcpConnectOptions {
  host: string;
  port: number;
  username: string;
  password: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const enum State { IDLE, CONNECTING, LOGGING_IN, LOGGED_IN, DISCONNECTING }

const CONNECT_TIMEOUT_MS         = 6_000;
const PING_INTERVAL_MS           = 60_000;
const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS     = 30_000;

// ─── TcpGatewayClient ─────────────────────────────────────────────────────────

export class TcpGatewayClient {
  private static _instance: TcpGatewayClient | null = null;

  static getInstance(): TcpGatewayClient {
    if (!TcpGatewayClient._instance) {
      TcpGatewayClient._instance = new TcpGatewayClient();
    }
    return TcpGatewayClient._instance;
  }

  // ── Internal state ─────────────────────────────────────────────────────────
  private state           = State.IDLE;
  private socket: any     = null;
  private opts: TcpConnectOptions | null = null;
  private lineBuffer      = '';

  private pingTimer:       ReturnType<typeof setInterval> | null = null;
  private reconnectTimer:  ReturnType<typeof setTimeout>  | null = null;
  private reconnectDelay   = INITIAL_RECONNECT_DELAY_MS;

  /** The room the local client has joined via JOIN_ROOM (tracks server-side state). */
  private _currentRoomId: string | null = null;

  /**
   * Room to rejoin after automatic TCP reconnect (network drop + re-login).
   * Set on socket close, cleared after rejoining.
   */
  private _pendingRejoinRoomId: string | null = null;

  // ── Listener registry ──────────────────────────────────────────────────────
  private listeners: { [K in keyof EventMap]?: Array<Listener<K>> } = {};

  on<K extends keyof EventMap>(event: K, cb: Listener<K>): this {
    if (!this.listeners[event]) (this.listeners[event] as any) = [];
    (this.listeners[event] as any[]).push(cb);
    return this;
  }

  off<K extends keyof EventMap>(event: K, cb: Listener<K>): this {
    const arr = this.listeners[event] as any[] | undefined;
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
    return this;
  }

  private emit<K extends keyof EventMap>(event: K, ...args: Parameters<Listener<K>>): void {
    const arr = this.listeners[event] as Array<(...a: any[]) => void> | undefined;
    if (arr) arr.slice().forEach((cb) => cb(...args));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isLoggedIn(): boolean { return this.state === State.LOGGED_IN; }
  get isConnecting(): boolean { return this.state === State.CONNECTING || this.state === State.LOGGING_IN; }

  /**
   * The room the TCP client is currently subscribed to on the server.
   * Null if not in any room.
   */
  get currentRoomId(): string | null { return this._currentRoomId; }

  /**
   * Returns true if the TCP client is currently subscribed to the given room.
   * Used by RoomChatModal to decide whether to send JOIN_ROOM or just reattach
   * listeners when the UI is re-opened.
   */
  isInRoom(roomId: string): boolean {
    return this._currentRoomId === roomId && this.state === State.LOGGED_IN;
  }

  /** Start TCP connection. Safe to call multiple times (noop if already connecting). */
  connect(opts: TcpConnectOptions): void {
    if (this.state !== State.IDLE) return;
    this.opts = opts;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.openSocket();

    // Mirrors NetworkService.updateNetworkStatus(): when network goes from offline
    // back online, trigger reconnect (setNetworkAvailable → startServerConnectionService).
    networkMonitor.on('online', this._handleNetworkOnline);
  }

  /** @internal Called by networkMonitor when connectivity is restored. */
  private _handleNetworkOnline = (): void => {
    if (this.state === State.IDLE && this.opts) {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.openSocket();
    }
  };

  /** Graceful LOGOUT then disconnect. */
  async logout(): Promise<void> {
    if (this.state === State.LOGGED_IN) {
      this.send({ type: 'LOGOUT' });
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    this._currentRoomId = null;
    this.disconnectClean();
  }

  /** Join a chatroom. Server will do a silent rejoin if already subscribed. */
  joinRoom(roomId: string): void {
    this._currentRoomId = roomId;
    this.send({ type: 'JOIN_ROOM', roomId });
  }

  /** Explicitly leave current chatroom (broadcasts "has left" to the room). */
  leaveRoom(): void {
    this._currentRoomId = null;
    this.send({ type: 'LEAVE_ROOM' });
  }

  /** Send a text message to a chatroom. */
  sendMessage(roomId: string, text: string): void {
    this.send({ type: 'SEND_MESSAGE', roomId, text });
  }

  /**
   * Send a CMD packet (slash commands: announce, announce_off, getmyluck, etc.).
   * Mirrors chatSource.sendCommand() from the Java client.
   *
   * @example
   *   tcpGateway.sendCmd('announce', { roomId, message: 'Hello!', waitTime: 120 });
   *   tcpGateway.sendCmd('announce_off', { roomId });
   */
  sendCmd(cmd: string, opts: Record<string, unknown> = {}): void {
    this.send({ type: 'CMD', cmd, ...opts });
  }

  /**
   * Request message history for a room.
   * Maps to GET_MESSAGES on the server.
   */
  getHistory(roomId: string, before?: string): void {
    this.send({ type: 'GET_MESSAGES', roomId, ...(before ? { before } : {}) });
  }

  /** Send PING keepalive manually. */
  ping(): void {
    this.send({ type: 'PING' });
  }

  // ── Internal: socket lifecycle ─────────────────────────────────────────────

  private openSocket(): void {
    if (!this.opts) return;

    if (Platform.OS === 'web') {
      this.emit('unsupported', 'TCP sockets are not supported on web. WebSocket is used instead.');
      return;
    }

    let TcpSocket: any;
    try {
      TcpSocket = require('react-native-tcp-socket');
    } catch {
      this.emit(
        'unsupported',
        'react-native-tcp-socket not available. ' +
        'Run `eas build` or `expo run:android` to use a Development Build.',
      );
      return;
    }

    this.state = State.CONNECTING;
    this.lineBuffer = '';

    const { host, port } = this.opts;

    const socket = TcpSocket.createConnection(
      { host, port, tls: false, timeout: CONNECT_TIMEOUT_MS },
      () => this.onConnected(),
    );

    socket.on('data',  (chunk: Buffer | Uint8Array) => this.onData(chunk));
    socket.on('error', (err: Error)                 => this.onSocketError(err));
    socket.on('close', ()                           => this.onSocketClose());

    this.socket = socket;

    AppState.addEventListener('change', this.handleAppState);
  }

  private handleAppState = (nextState: AppStateStatus): void => {
    if (nextState === 'active' && this.state === State.IDLE && this.opts) {
      this.openSocket();
    }
  };

  private onConnected(): void {
    this.emit('connected');
    this.state = State.LOGGING_IN;

    // Build LoginConfig — mirrors NetworkService.createLoginConfig()
    // Includes device/screen/platform metadata so the server can adapt responses.
    const { width, height } = Dimensions.get('screen');
    let appVersion = '1.0.0';
    try {
      const Constants = require('expo-constants').default;
      appVersion = Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0';
    } catch {}

    // clientType: 8 = Android, 9 = iOS, 10 = Web (mirrors DefaultConfig.java CLIENT_TYPE)
    const clientType = Platform.OS === 'android' ? 8
                     : Platform.OS === 'ios'     ? 9
                     : 10;

    this.send({
      type:         'LOGIN',
      username:     this.opts!.username,
      password:     this.opts!.password,
      // LoginConfig fields (mirrors createLoginConfig())
      clientType,
      versionNumber: appVersion,
      userAgent:     `Max99Expo/${appVersion} (${Platform.OS})`,
      screenWidth:   Math.round(width),
      screenHeight:  Math.round(height),
      language:      'en',
      platform:      Platform.OS,
    });
  }

  // ── Data handling ──────────────────────────────────────────────────────────

  private onData(chunk: Buffer | Uint8Array): void {
    const str = typeof (chunk as any).toString === 'function'
      ? (chunk as any).toString('utf8')
      : new TextDecoder('utf-8').decode(chunk as Uint8Array);

    this.lineBuffer += str;

    // Split on newlines (server sends one JSON object per line)
    const lines = this.lineBuffer.split('\n');
    // Last element is incomplete — keep in buffer
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const packet = JSON.parse(trimmed);
        this.handlePacket(packet);
      } catch {
        // Ignore malformed line
      }
    }
  }

  private handlePacket(packet: Record<string, unknown>): void {
    const type = packet.type as string;

    switch (type) {
      case 'LOGIN_OK': {
        this.state = State.LOGGED_IN;
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this.startPingTimer();
        this.emit('loginOk', packet as unknown as TcpLoginOkPayload);
        // Mirrors NetworkService.onLoggedIn() → resendAllFailedChatMessages()
        this._resendFailedMessages();
        // Auto-rejoin previous room after network drop reconnect
        if (this._pendingRejoinRoomId) {
          const roomToRejoin = this._pendingRejoinRoomId;
          this._pendingRejoinRoomId = null;
          // Small delay so login processing completes on server
          setTimeout(() => this.joinRoom(roomToRejoin), 300);
        }
        break;
      }

      case 'ERROR': {
        const errPayload = packet as unknown as TcpErrorPayload;
        if (this.state === State.LOGGING_IN) {
          this.emit('loginError', errPayload);
        } else {
          this.emit('error', errPayload);
        }
        break;
      }

      case 'JOIN_OK': {
        // Server updated _currentRoomId may differ if reconnecting — sync here
        const roomId = packet.roomId as string;
        if (roomId) this._currentRoomId = roomId;
        this.emit('joinOk', packet as unknown as TcpJoinOkPayload);
        break;
      }

      case 'LEAVE_OK': {
        const roomId = packet.roomId as string;
        if (this._currentRoomId === roomId) this._currentRoomId = null;
        this.emit('leaveOk', roomId ?? '');
        break;
      }

      case 'MESSAGE':
        this.emit('message', packet as unknown as TcpMessagePayload);
        break;

      case 'USER_JOINED':
        this.emit('userJoined', packet as unknown as TcpUserEventPayload);
        break;

      case 'USER_LEFT':
        this.emit('userLeft', packet as unknown as TcpUserEventPayload);
        break;

      case 'PARTICIPANTS':
        this.emit('participants', packet as unknown as TcpParticipantsPayload);
        break;

      case 'ANNOUNCEMENT':
        this.emit('announce', { roomId: packet.roomId as string, text: packet.text as string });
        break;

      case 'ANNOUNCEMENT_OFF':
        this.emit('announceOff', { roomId: packet.roomId as string });
        break;

      case 'BUMPED':
        this.emit('bumped', packet as unknown as TcpModerationPayload);
        break;

      case 'KICKED':
        this.emit('kicked', packet as unknown as TcpModerationPayload);
        break;

      case 'BANNED':
        this.emit('banned', packet as unknown as TcpModerationPayload);
        break;

      case 'WARNED':
        this.emit('warned', packet as unknown as TcpModerationPayload);
        break;

      case 'MOD':
        this.emit('mod', packet as unknown as TcpModerationPayload);
        break;

      case 'UNMOD':
        this.emit('unmod', packet as unknown as TcpModerationPayload);
        break;

      case 'COLOR_LIST':
        this.emit('colorList', { colors: (packet.colors as string[]) ?? [] });
        break;

      case 'COLOR_CHANGED':
        this.emit('colorChanged', packet as unknown as TcpColorChangedPayload);
        break;

      case 'PONG':
        this.emit('pong', (packet.timestamp as number) ?? Date.now());
        break;

      default:
        break;
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  private send(data: Record<string, unknown>): void {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(JSON.stringify(data) + '\n');
    } catch {
      // Socket may have closed
    }
  }

  // ── Ping keepalive ─────────────────────────────────────────────────────────

  private startPingTimer(): void {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'PING' });
    }, PING_INTERVAL_MS);
  }

  private stopPingTimer(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ── Resend failed messages ─────────────────────────────────────────────────

  /**
   * Mirrors ChatController.resendAllFailedMessages().
   * Called immediately after LOGIN_OK so any messages that failed during
   * a network drop are retried over HTTP (REST API is always available even
   * when the TCP socket was temporarily down).
   */
  private _resendFailedMessages(): void {
    messageQueue.resendAll(async (msg: FailedMessage) => {
      try {
        const res = await fetch(`${API_BASE}/api/chatsync/conversations/${msg.conversationId}/messages`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text: msg.text }),
          credentials: 'include',
        });
        return res.ok;
      } catch {
        return false;
      }
    }).catch(() => {});
  }

  // ── Error / close ──────────────────────────────────────────────────────────

  private onSocketError(err: Error): void {
    this.emit('error', { code: 0, message: err.message });
    this.scheduleReconnect();
  }

  private onSocketClose(): void {
    // When TCP socket drops (network blip), save the current room so we can
    // automatically rejoin it after reconnect+login.  The server-side grace
    // period (120s) means the rejoin will be silent (no "has entered" message).
    if (this._currentRoomId) {
      this._pendingRejoinRoomId = this._currentRoomId;
      this._currentRoomId = null;
    }
    this.cleanupSocket();
    if (this.state !== State.DISCONNECTING) {
      this.emit('disconnected');
      this.scheduleReconnect();
    } else {
      this.state = State.IDLE;
      this.emit('disconnected');
    }
  }

  // ── Reconnect backoff ──────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (!this.opts) return;
    this.cleanupSocket();
    this.state = State.IDLE;

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);

    this.reconnectTimer = setTimeout(() => {
      if (this.opts) this.openSocket();
    }, delay);
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  private disconnectClean(): void {
    this.state = State.DISCONNECTING;
    this.opts = null;
    networkMonitor.off('online', this._handleNetworkOnline);
    this.cleanupSocket();
    this.state = State.IDLE;
    this.emit('disconnected');
  }

  private cleanupSocket(): void {
    this.stopPingTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
    this.lineBuffer = '';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const tcpGateway = TcpGatewayClient.getInstance();
