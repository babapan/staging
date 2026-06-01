/**
 * fusionTcpClient.ts
 *
 * TypeScript port of BlockingTCPFusionConnection.java + FusionService.java.
 *
 * Provides a raw TCP connection to the Fusion gateway (port 9119) with:
 *   - Full binary FusionPacket encode/decode
 *   - Login challenge/response handshake (SHA-1 hash)
 *   - Automatic PING keepalive every 60 s
 *   - Exponential-backoff reconnect (5 s → 10 s max foreground)
 *   - EventEmitter-style listener API
 *
 * Requires react-native-tcp-socket (EAS Development Build or production build).
 * Falls back gracefully on Web / Expo Go (emits 'error' event).
 *
 * Usage:
 *   const client = FusionTcpClient.getInstance();
 *   client.on('loginOk',  (pkt) => { ... });
 *   client.on('packet',   (pkt) => { ... });
 *   client.on('disconnected', () => { ... });
 *   await client.connect({ host, port, username, password });
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import {
  FusionPacket,
  PacketStreamBuffer,
  PacketType,
  Packets,
  sha1PasswordHash,
  javaStringHashCode,
} from './fusionPacket';

// ─── Constants (mirrors DefaultConfig.java) ───────────────────────────────────
const CONNECT_TIMEOUT_MS          = 6_000;
const PING_INTERVAL_MS            = 60_000;
const INITIAL_RECONNECT_DELAY_MS  = 5_000;
const MAX_RECONNECT_DELAY_MS      = 10_000;
const MAX_SOCKET_IDLE_MS          = 60_000;
const ENABLE_SHA1_LOGIN           = true;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ConnectOptions {
  host: string;
  port: number;
  username: string;
  password: string;
}

type EventMap = {
  connected:    () => void;
  loginOk:      (pkt: FusionPacket) => void;
  loginError:   (message: string) => void;
  packet:       (pkt: FusionPacket) => void;
  disconnected: () => void;
  error:        (err: Error) => void;
};

type Listener<K extends keyof EventMap> = EventMap[K];

// ─── State machine ────────────────────────────────────────────────────────────
const enum State {
  IDLE,
  CONNECTING,
  LOGGING_IN,
  LOGGED_IN,
  DISCONNECTING,
}

// ─── FusionTcpClient ──────────────────────────────────────────────────────────
export class FusionTcpClient {
  private static _instance: FusionTcpClient | null = null;

  static getInstance(): FusionTcpClient {
    if (!FusionTcpClient._instance) {
      FusionTcpClient._instance = new FusionTcpClient();
    }
    return FusionTcpClient._instance;
  }

  // ── Internal state ─────────────────────────────────────────────────────────
  private state: State = State.IDLE;
  private socket: any   = null;  // TcpSocket from react-native-tcp-socket
  private opts: ConnectOptions | null = null;

  private streamBuf = new PacketStreamBuffer();
  private sendQueue: FusionPacket[] = [];

  private pingTimer:      ReturnType<typeof setInterval>  | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout>   | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  private lastRxTimestamp = Date.now();
  private lastTxTimestamp = Date.now();

  // ── Listeners ──────────────────────────────────────────────────────────────
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
    if (arr) arr.forEach((cb) => cb(...args));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Connect and start login sequence. Safe to call multiple times. */
  async connect(opts: ConnectOptions): Promise<void> {
    if (this.state !== State.IDLE) return;
    this.opts = opts;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.openSocket();
  }

  /** Graceful logout then disconnect. */
  async logout(): Promise<void> {
    if (this.state === State.LOGGED_IN) {
      this.sendPacket(Packets.logout());
      await new Promise<void>((r) => setTimeout(r, 500));
    }
    this.disconnect(false);
  }

  /** Send a FusionPacket over the TCP socket (queues if not yet connected). */
  sendPacket(pkt: FusionPacket): void {
    if (this.state === State.LOGGED_IN && this.socket) {
      this.writeToSocket(pkt);
    } else {
      this.sendQueue.push(pkt);
    }
  }

  get isLoggedIn(): boolean {
    return this.state === State.LOGGED_IN;
  }

  get currentUsername(): string | null {
    return this.opts?.username ?? null;
  }

  // ── Internal: socket lifecycle ─────────────────────────────────────────────

  private openSocket(): void {
    if (!this.opts) return;

    // react-native-tcp-socket is a native module — not available on web or Expo Go.
    if (Platform.OS === 'web') {
      this.emit('error', new Error('TCP sockets are not supported on web. Use WebSocket transport.'));
      return;
    }

    let TcpSocket: any;
    try {
      TcpSocket = require('react-native-tcp-socket');
    } catch {
      this.emit(
        'error',
        new Error(
          'react-native-tcp-socket is not available. ' +
          'Build a Development Build via EAS (expo run:android / expo run:ios).',
        ),
      );
      return;
    }

    this.state = State.CONNECTING;
    this.streamBuf.clear();

    const { host, port } = this.opts;

    const socket = TcpSocket.createConnection(
      {
        host,
        port,
        tls: false,
        timeout: CONNECT_TIMEOUT_MS,
      },
      () => this.onConnected(),
    );

    socket.on('data',  (data: Buffer | Uint8Array) => this.onData(data));
    socket.on('error', (err: Error)                => this.onSocketError(err));
    socket.on('close', ()                          => this.onSocketClose());

    this.socket = socket;

    // Register AppState listener to reconnect on foreground
    AppState.addEventListener('change', this.handleAppState);
  }

  private handleAppState = (nextState: AppStateStatus): void => {
    if (nextState === 'active' && this.state === State.IDLE && this.opts) {
      this.openSocket();
    }
  };

  private async onConnected(): Promise<void> {
    this.emit('connected');
    this.state = State.LOGGING_IN;
    await this.sendLoginPacket();
  }

  private async sendLoginPacket(): Promise<void> {
    if (!this.opts) return;
    const pkt = Packets.login(this.opts.username);
    this.writeToSocket(pkt);
  }

  private async onPacketReceived(pkt: FusionPacket): Promise<void> {
    this.lastRxTimestamp = Date.now();

    switch (pkt.type) {
      case PacketType.LOGIN_CHALLENGE:
      case PacketType.SLIM_LOGIN_CHALLENGE:
        await this.handleLoginChallenge(pkt);
        break;

      case PacketType.LOGIN_OK:
      case PacketType.SLIM_LOGIN_OK:
        this.handleLoginOk(pkt);
        break;

      case PacketType.PING:
        this.writeToSocket(Packets.pong());
        break;

      case PacketType.PONG:
        // keepalive acknowledged
        break;

      case PacketType.ERROR:
        this.handleError(pkt);
        break;

      case PacketType.LOGOUT:
      case PacketType.SESSION_TERMINATED:
        this.handleServerLogout();
        break;

      default:
        this.emit('packet', pkt);
        break;
    }
  }

  /** LOGIN_CHALLENGE → compute hash → send LOGIN_RESPONSE */
  private async handleLoginChallenge(pkt: FusionPacket): Promise<void> {
    if (!this.opts) return;

    const challenge = pkt.getString(1) ?? '';
    // field 2 = sessionId (save it if needed in future)

    let passwordHash: number;
    if (ENABLE_SHA1_LOGIN) {
      passwordHash = await sha1PasswordHash(challenge, this.opts.password);
    } else {
      passwordHash = javaStringHashCode(challenge + this.opts.password.toLowerCase());
    }

    this.writeToSocket(Packets.loginResponse(passwordHash));
  }

  private handleLoginOk(pkt: FusionPacket): void {
    this.state = State.LOGGED_IN;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS; // reset on successful login
    this.startPingTimer();

    // Flush queued packets
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      this.writeToSocket(queued);
    }

    this.emit('loginOk', pkt);
  }

  private handleError(pkt: FusionPacket): void {
    // Wire format: field 1 = error code (int16), field 2 = error message (string).
    // Mirrors FusionPacket.java buildError() — do NOT read field 1 as string.
    const msg = pkt.getString(2) ?? 'Unknown error';
    if (this.state === State.LOGGING_IN) {
      this.emit('loginError', msg);
    }
  }

  private handleServerLogout(): void {
    this.disconnect(true);
  }

  // ── Raw data from TCP ──────────────────────────────────────────────────────
  private onData(data: Uint8Array | { buffer: ArrayBuffer; byteOffset: number; byteLength: number }): void {
    const bytes = data instanceof Uint8Array
      ? data
      : new Uint8Array((data as any).buffer, (data as any).byteOffset, (data as any).byteLength);
    const packets = this.streamBuf.feed(bytes);
    for (const pkt of packets) {
      this.onPacketReceived(pkt);
    }
  }

  private onSocketError(err: Error): void {
    this.emit('error', err);
    this.scheduleReconnect();
  }

  private onSocketClose(): void {
    this.cleanupSocket();
    if (this.state !== State.DISCONNECTING) {
      this.scheduleReconnect();
    } else {
      this.state = State.IDLE;
      this.emit('disconnected');
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  private writeToSocket(pkt: FusionPacket): void {
    if (!this.socket) return;
    try {
      const bytes = pkt.toBytes();
      this.socket.write(Buffer.from(bytes));
      this.lastTxTimestamp = Date.now();
    } catch (e) {
      // socket may have closed
    }
  }

  // ── Ping keepalive ─────────────────────────────────────────────────────────
  private startPingTimer(): void {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      const now = Date.now();
      if (now - this.lastRxTimestamp > MAX_SOCKET_IDLE_MS * 2) {
        // Socket is dead
        this.onSocketError(new Error('Socket idle timeout'));
        return;
      }
      this.writeToSocket(Packets.ping());
    }, PING_INTERVAL_MS);
  }

  private stopPingTimer(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
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
  private disconnect(shouldReconnect: boolean): void {
    this.state = State.DISCONNECTING;
    this.cleanupSocket();
    if (shouldReconnect && this.opts) {
      this.scheduleReconnect();
    } else {
      this.state = State.IDLE;
      this.emit('disconnected');
    }
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
    this.streamBuf.clear();
  }
}

// ─── Singleton shortcut ───────────────────────────────────────────────────────
export const fusionTcp = FusionTcpClient.getInstance();
