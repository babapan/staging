/**
 * messageQueue.ts
 *
 * Mirrors ChatController.resendAllFailedMessages() from Android NetworkService:
 *   onLoggedIn() → resendAllFailedChatMessages() → ChatController.resendAllFailedMessages()
 *
 * When a SEND_MESSAGE fails (socket closed, network drop, etc.) the caller
 * enqueues the message here. On the next successful LOGIN_OK from the server
 * (triggered by tcpGatewayClient) all queued messages are retried in order.
 *
 * Storage: AsyncStorage key "migchat_failed_messages" — array of FailedMessage.
 *
 * Usage:
 *   // On send failure:
 *   await messageQueue.enqueue({ conversationId, text, senderUsername });
 *
 *   // Automatically called by tcpGatewayClient on loginOk:
 *   await messageQueue.resendAll(sendFn);
 *
 *   // Check pending count:
 *   const count = await messageQueue.count();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'migchat_failed_messages';
const MAX_RETRIES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FailedMessage {
  id:             string;
  conversationId: string;
  text:           string;
  senderUsername: string;
  timestamp:      number;
  retries:        number;
}

// ─── MessageQueue ─────────────────────────────────────────────────────────────

class MessageQueue {

  // ── Load / Save ────────────────────────────────────────────────────────────

  private async _load(): Promise<FailedMessage[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as FailedMessage[];
    } catch {
      return [];
    }
  }

  private async _save(msgs: FailedMessage[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(msgs));
    } catch {}
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Add a message to the failed-message queue. */
  async enqueue(params: {
    conversationId: string;
    text:           string;
    senderUsername: string;
  }): Promise<void> {
    const msgs = await this._load();
    const msg: FailedMessage = {
      id:             `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      conversationId: params.conversationId,
      text:           params.text,
      senderUsername: params.senderUsername,
      timestamp:      Date.now(),
      retries:        0,
    };
    msgs.push(msg);
    await this._save(msgs);
  }

  /** Remove a specific message from the queue (after successful resend). */
  async remove(id: string): Promise<void> {
    const msgs = await this._load();
    await this._save(msgs.filter((m) => m.id !== id));
  }

  /** Number of pending failed messages. */
  async count(): Promise<number> {
    const msgs = await this._load();
    return msgs.length;
  }

  /** Get all pending failed messages. */
  async getAll(): Promise<FailedMessage[]> {
    return this._load();
  }

  /** Clear the entire queue (e.g. on logout). */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }

  /**
   * Resend all queued failed messages.
   * Mirrors ChatController.resendAllFailedMessages().
   *
   * @param sendFn - async function that sends one message; resolves true on success.
   */
  async resendAll(
    sendFn: (msg: FailedMessage) => Promise<boolean>,
  ): Promise<{ sent: number; dropped: number }> {
    const msgs = await this._load();
    if (msgs.length === 0) return { sent: 0, dropped: 0 };

    let sent    = 0;
    let dropped = 0;
    const remaining: FailedMessage[] = [];

    for (const msg of msgs) {
      const updated: FailedMessage = { ...msg, retries: msg.retries + 1 };
      try {
        const ok = await sendFn(updated);
        if (ok) {
          sent++;
        } else if (updated.retries >= MAX_RETRIES) {
          dropped++;
        } else {
          remaining.push(updated);
        }
      } catch {
        if (updated.retries >= MAX_RETRIES) {
          dropped++;
        } else {
          remaining.push(updated);
        }
      }
    }

    await this._save(remaining);
    return { sent, dropped };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const messageQueue = new MessageQueue();
