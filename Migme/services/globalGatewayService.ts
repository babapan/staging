/**
 * globalGatewayService.ts
 *
 * Persistent WebSocket ke backend gateway untuk menerima personal real-time events:
 *   - DIAMOND_WITHDRAW_STATUS (withdraw approved/rejected)
 *   - ALERT (server notification push)
 *   - GIFT (gift diterima)
 *   - CONTACT_REQUEST / CONTACT_ACCEPTED
 *
 * Setiap event yang masuk:
 *   1. Diteruskan ke diamondEventBus (untuk DIAMOND_WITHDRAW_STATUS)
 *   2. Memutar notification sound
 *   3. Memanggil onPushNotification callback → layout refresh unread count segera
 *
 * Auth: kirim { type: "AUTH", token: jwt } → backend replies AUTH_OK / AUTH_FAIL
 * Auto-reconnect dengan exponential backoff.
 */

import { Platform } from 'react-native';
import { WS_URL } from '../config/connection';
import { diamondEventBus } from './diamondEventBus';
import { playNotificationSound } from './notificationSound';

const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS       = 25_000;

type PushCallback = () => void;

class GlobalGatewayService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout>   | null = null;
  private pingTimer:      ReturnType<typeof setInterval>  | null = null;
  private reconnectDelay = 2_000;
  private authToken: string | null = null;
  private stopped = false;
  private authenticated = false;

  // Callbacks — layout subscribes so it can refresh unread badge immediately
  private pushCallbacks: PushCallback[] = [];

  onPushNotification(cb: PushCallback): () => void {
    this.pushCallbacks.push(cb);
    return () => {
      const i = this.pushCallbacks.indexOf(cb);
      if (i >= 0) this.pushCallbacks.splice(i, 1);
    };
  }

  private firePushCallbacks(): void {
    this.pushCallbacks.forEach(cb => { try { cb(); } catch {} });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(token: string): void {
    if (Platform.OS === 'web') return;
    this.stopped   = false;
    this.authToken = token;
    this.clearTimers();
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.authenticated = false;
    this.connect();
  }

  stop(): void {
    this.stopped   = true;
    this.authToken = null;
    this.authenticated = false;
    this.clearTimers();
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  private connect(): void {
    if (this.stopped || !this.authToken) return;

    try {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectDelay = 2_000;
        this.authenticated  = false;
        // Send JWT auth — backend returns AUTH_OK with username, migLevel
        ws.send(JSON.stringify({ type: 'AUTH', token: this.authToken }));
        this.startPing(ws);
      };

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data as string);
          this.handleEvent(payload);
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        this.clearTimers();
        this.ws = null;
        this.authenticated = false;
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  // ── Event handling ─────────────────────────────────────────────────────────

  private handleEvent(payload: any): void {
    if (!payload?.type) return;

    switch (payload.type) {

      // ── Auth responses ──────────────────────────────────────────────────────
      case 'AUTH_OK':
        this.authenticated = true;
        break;

      case 'AUTH_FAIL':
        // Token expired or invalid — stop reconnecting
        this.stop();
        break;

      // ── Diamond withdraw status ─────────────────────────────────────────────
      case 'DIAMOND_WITHDRAW_STATUS':
        diamondEventBus.emit({
          type:          'DIAMOND_WITHDRAW_STATUS',
          status:        payload.status,
          refId:         payload.refId    ?? '',
          amount:        payload.amount   ?? 0,
          idrValue:      payload.idrValue ?? 0,
          bankName:      payload.bankName,
          accountNumber: payload.accountNumber,
          accountName:   payload.accountName,
          notes:         payload.notes,
        });
        // Approved → success tone; Rejected → error tone
        playNotificationSound(payload.status === 'approved' ? 'success' : 'error').catch(() => {});
        this.firePushCallbacks();
        break;

      // ── Server alert / in-app notification push ────────────────────────────
      case 'ALERT':
        playNotificationSound('default').catch(() => {});
        this.firePushCallbacks();
        break;

      // ── Gift received ───────────────────────────────────────────────────────
      case 'GIFT':
        playNotificationSound('success').catch(() => {});
        this.firePushCallbacks();
        break;

      // ── Contact / friend requests ───────────────────────────────────────────
      case 'CONTACT_REQUEST':
      case 'CONTACT_ACCEPTED':
        playNotificationSound('default').catch(() => {});
        this.firePushCallbacks();
        break;

      default:
        break;
    }
  }

  // ── Ping ───────────────────────────────────────────────────────────────────

  private startPing(ws: WebSocket): void {
    this.clearTimers();
    this.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'PING' })); } catch {}
      }
    }, PING_INTERVAL_MS);
  }

  // ── Reconnect ──────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.stopped || !this.authToken) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      this.connect();
    }, this.reconnectDelay);
  }

  private clearTimers(): void {
    if (this.pingTimer)      { clearInterval(this.pingTimer);   this.pingTimer      = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

export const globalGatewayService = new GlobalGatewayService();
