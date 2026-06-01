/**
 * fusionTcpContext.tsx
 *
 * React context wrapping TcpGatewayClient so any component can:
 *   - Read TCP connection / login status
 *   - Send messages and join/leave chatrooms over raw TCP (port 9119)
 *   - Subscribe to incoming messages
 *
 * The TCP gateway speaks JSON-over-TCP (newline-delimited), mirroring the
 * binary Fusion packet protocol from the Android client.
 *
 * Mount <FusionTcpProvider> at the root (app/_layout.tsx).
 * On web / Expo Go the provider is a no-op — WebSocket stays active instead.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  tcpGateway,
  type TcpLoginOkPayload,
  type TcpJoinOkPayload,
  type TcpMessage,
  type TcpMessagePayload,
  type TcpUserEventPayload,
  type TcpErrorPayload,
} from './tcpGatewayClient';
import { GATEWAY_HOST, GATEWAY_PORT } from '../config/connection';

// ─── Context value types ──────────────────────────────────────────────────────

export interface TcpChatMessage extends TcpMessage {
  roomId: string;
}

export interface FusionTcpContextValue {
  /** True when TCP is fully logged in */
  isLoggedIn:   boolean;
  /** True while connecting or authenticating */
  isConnecting: boolean;
  /** Last login or connection error */
  error: string | null;
  /** Whether TCP is available (native only; false on web) */
  isTcpSupported: boolean;

  /** Connect TCP gateway. Call after HTTP auth succeeds. */
  connect: (username: string, password: string) => void;
  /** Graceful logout + disconnect */
  logout: () => void;

  /** Join a chatroom */
  joinRoom: (roomId: string) => void;
  /** Leave current chatroom */
  leaveRoom: () => void;
  /** Send a text message to a chatroom */
  sendMessage: (roomId: string, text: string) => void;

  /** Received chatroom messages (accumulated) */
  messages: TcpChatMessage[];
  /** Clear message history */
  clearMessages: () => void;

  /** Logged-in user info returned by LOGIN_OK */
  sessionUser: TcpLoginOkPayload['user'] | null;
  /** Current room info from the last JOIN_OK */
  currentRoom: TcpJoinOkPayload | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FusionTcpContext = createContext<FusionTcpContextValue | null>(null);

export function useFusionTcp(): FusionTcpContextValue {
  const ctx = useContext(FusionTcpContext);
  if (!ctx) throw new Error('useFusionTcp must be used inside <FusionTcpProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FusionTcpProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn,   setLoggedIn]   = useState(false);
  const [isConnecting, setConnecting] = useState(false);
  const [error,        setError]      = useState<string | null>(null);
  const [messages,     setMessages]   = useState<TcpChatMessage[]>([]);
  const [sessionUser,  setSessionUser] = useState<TcpLoginOkPayload['user'] | null>(null);
  const [currentRoom,  setCurrentRoom] = useState<TcpJoinOkPayload | null>(null);

  // On web TCP is not supported — gracefully degrade
  const isTcpSupported = Platform.OS !== 'web';

  // Keep tracked listeners so we can clean them up on unmount
  const attached = useRef(false);

  useEffect(() => {
    if (!isTcpSupported || attached.current) return;
    attached.current = true;

    // ── connected ─────────────────────────────────────────────────────────────
    const onConnected = () => {
      setConnecting(true);
      setError(null);
    };

    // ── loginOk ───────────────────────────────────────────────────────────────
    const onLoginOk = (p: TcpLoginOkPayload) => {
      setLoggedIn(true);
      setConnecting(false);
      setSessionUser(p.user);
    };

    // ── loginError ────────────────────────────────────────────────────────────
    const onLoginError = (p: TcpErrorPayload) => {
      setLoggedIn(false);
      setConnecting(false);
      setError(p.message);
    };

    // ── joinOk ────────────────────────────────────────────────────────────────
    const onJoinOk = (p: TcpJoinOkPayload) => {
      setCurrentRoom(p);
      // Seed message history from JOIN_OK
      const historyMsgs: TcpChatMessage[] = p.history.map((m) => ({
        ...m,
        roomId: p.roomId,
      }));
      setMessages(historyMsgs);
    };

    // ── leaveOk ───────────────────────────────────────────────────────────────
    const onLeaveOk = (_roomId: string) => {
      setCurrentRoom(null);
    };

    // ── message ───────────────────────────────────────────────────────────────
    const onMessage = (p: TcpMessagePayload) => {
      setMessages((prev) => [...prev, { ...p.message, roomId: p.roomId }]);
    };

    // ── userJoined / userLeft ─────────────────────────────────────────────────
    const onUserJoined = (_p: TcpUserEventPayload) => { /* could update participants list */ };
    const onUserLeft   = (_p: TcpUserEventPayload) => { /* could update participants list */ };

    // ── disconnected ─────────────────────────────────────────────────────────
    const onDisconnected = () => {
      setLoggedIn(false);
      setConnecting(false);
      setCurrentRoom(null);
    };

    // ── error ─────────────────────────────────────────────────────────────────
    const onError = (p: TcpErrorPayload) => {
      setError(p.message);
    };

    // ── unsupported ───────────────────────────────────────────────────────────
    const onUnsupported = (reason: string) => {
      setError(reason);
    };

    tcpGateway.on('connected',    onConnected);
    tcpGateway.on('loginOk',     onLoginOk);
    tcpGateway.on('loginError',  onLoginError);
    tcpGateway.on('joinOk',      onJoinOk);
    tcpGateway.on('leaveOk',     onLeaveOk);
    tcpGateway.on('message',     onMessage);
    tcpGateway.on('userJoined',  onUserJoined);
    tcpGateway.on('userLeft',    onUserLeft);
    tcpGateway.on('disconnected', onDisconnected);
    tcpGateway.on('error',       onError);
    tcpGateway.on('unsupported', onUnsupported);

    return () => {
      tcpGateway.off('connected',    onConnected);
      tcpGateway.off('loginOk',     onLoginOk);
      tcpGateway.off('loginError',  onLoginError);
      tcpGateway.off('joinOk',      onJoinOk);
      tcpGateway.off('leaveOk',     onLeaveOk);
      tcpGateway.off('message',     onMessage);
      tcpGateway.off('userJoined',  onUserJoined);
      tcpGateway.off('userLeft',    onUserLeft);
      tcpGateway.off('disconnected', onDisconnected);
      tcpGateway.off('error',       onError);
      tcpGateway.off('unsupported', onUnsupported);
    };
  }, [isTcpSupported]);

  // ── API ───────────────────────────────────────────────────────────────────

  const connect = useCallback((username: string, password: string) => {
    if (!isTcpSupported) return;
    setConnecting(true);
    setError(null);
    tcpGateway.connect({ host: GATEWAY_HOST, port: GATEWAY_PORT, username, password });
  }, [isTcpSupported]);

  const logout = useCallback(() => {
    if (!isTcpSupported) return;
    tcpGateway.logout();
  }, [isTcpSupported]);

  const joinRoom = useCallback((roomId: string) => {
    tcpGateway.joinRoom(roomId);
  }, []);

  const leaveRoom = useCallback(() => {
    tcpGateway.leaveRoom();
  }, []);

  const sendMessage = useCallback((roomId: string, text: string) => {
    tcpGateway.sendMessage(roomId, text);
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const value: FusionTcpContextValue = {
    isLoggedIn,
    isConnecting,
    error,
    isTcpSupported,
    connect,
    logout,
    joinRoom,
    leaveRoom,
    sendMessage,
    messages,
    clearMessages,
    sessionUser,
    currentRoom,
  };

  return (
    <FusionTcpContext.Provider value={value}>
      {children}
    </FusionTcpContext.Provider>
  );
}
