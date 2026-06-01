/**
 * serverGeneratedReceivedEventPusher.ts
 *
 * Expo/React Native client-side port of:
 *   com/projectgoth/fusion/chatsync/ServerGeneratedReceivedEventPusher.java
 *   (and its base: MessageStatusEventPersistable / MessageStatusEvent)
 *
 * ─── Java flow recap ───────────────────────────────────────────────────────
 * 1. Client A sends a message to Client B.
 * 2. Server saves the message and creates:
 *      new ServerGeneratedReceivedEventPusher(msg, RECEIVED, serverGenerated=true, regy)
 * 3. pusher.store(stores):
 *    a) super.store() → writes RECEIVED event to Redis sorted set (CV:{key}:E)
 *       via MessageStatusEventPersistable.storePipeline()
 *         → pipelineStore.zadd(this, messageTimestamp, getValue())
 *    b) messageSender.putMessageStatusEvent(toIceObject())
 *       → pushes real-time "pkt 505" RECEIVED event to Client A (the sender)
 * 4. Client A receives the event and updates its UI:
 *    ✓ (sending/optimistic) → ✓ (delivered to server, RECEIVED)
 * 5. When Client B later reads the message:
 *    Server pushes status=READ (FusionPktMessageStatusEvent pkt 505)
 *    → ✓ RECEIVED → ✓✓ READ
 *
 * ─── MessageStatusEventTypeEnum (mirrors Java Enums.java) ──────────────────
 *   COMPOSING = 0   (user is typing — not stored, only transient)
 *   RECEIVED  = 1   (server received / delivered to device)
 *   READ      = 2   (recipient opened and read the message)
 *
 * ─── This file exports ─────────────────────────────────────────────────────
 * • MessageStatusEventType  — union type for the three statuses
 * • MessageStatusEvent      — shape of an incoming MESSAGE_STATUS WS payload
 * • getHigherStatus()       — helper that returns the "winning" status when two
 *                            events arrive out of order (mirrors Java loadPipeline
 *                            highest-status logic in MessageStatusEventPersistable)
 * • useMessageStatusTracker — React hook that:
 *     - Accepts the WebSocket ref used by PrivateChatTab
 *     - Maintains a Map<msgId, MessageStatusEventType> of per-message delivery state
 *     - Merges incoming MESSAGE_STATUS (RECEIVED) and READ_RECEIPT (READ) events
 *     - Exposes helpers to seed initial state from already-read messages loaded from DB
 * • getTickInfo()           — derives the display tick from the tracked status
 */

import { useCallback, useRef, useState } from 'react';

// ─── Types (mirror Java Enums.MessageStatusEventTypeEnum) ────────────────────

/** Ordered by ascending "value" — mirrors Java enum ordinal */
export type MessageStatusEventType = 'COMPOSING' | 'RECEIVED' | 'READ';

const STATUS_RANK: Record<MessageStatusEventType, number> = {
  COMPOSING: 0,
  RECEIVED:  1,
  READ:      2,
};

/**
 * Returns the higher-priority status of the two.
 * Mirrors MessageStatusEventPersistable.loadPipeline():
 *   if (mse.getMessageStatus().value() > highestStatusForMsg.value()) { ... }
 */
export function getHigherStatus(
  a: MessageStatusEventType,
  b: MessageStatusEventType,
): MessageStatusEventType {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

// ─── Incoming WS event shape (mirrors FusionPktMessageStatusEvent pkt 505) ───

/** Shape of a MESSAGE_STATUS WebSocket event (server → client) */
export interface MessageStatusEvent {
  type: 'MESSAGE_STATUS';
  conversationId: string;
  messageId: string;
  /** RECEIVED = server ack (serverGenerated=true); READ = recipient read it */
  status: 'RECEIVED' | 'READ';
  serverGenerated: boolean;
  timestamp: number;
}

/** Shape of a READ_RECEIPT WebSocket event (already handled in PrivateChatTab) */
export interface ReadReceiptEvent {
  type: 'READ_RECEIPT';
  conversationId: string;
  messageIds: string[];
  readByUsername: string;
  readAt: string;
}

// ─── Tick display helper ──────────────────────────────────────────────────────

export interface TickInfo {
  /** '✓' or '✓✓' */
  symbol:    string;
  /**
   * Semantic colour category:
   *  'sending'   – optimistic, not yet server-ack'd  (grey clock / single thin ✓)
   *  'received'  – server received (RECEIVED, serverGenerated=true)  (grey ✓)
   *  'read'      – recipient read it (READ)                          (blue ✓✓)
   */
  colorKey:  'sending' | 'received' | 'read';
}

/**
 * Derives the TickInfo for a single outbound message.
 *
 * Maps the Java MessageStatusEventTypeEnum values to visual ticks:
 *   no status (optimistic temp msg) → ✓ sending (clock/grey)
 *   RECEIVED (1, serverGenerated)   → ✓ received (grey single tick)
 *   READ (2)                        → ✓✓ read (blue double tick)
 *
 * Mirrors Android client behaviour in ChatSyncMessageListAdapter where the
 * status icon is chosen based on the message's current MessageStatusEventTypeEnum.
 */
export function getTickInfo(status: MessageStatusEventType | null): TickInfo {
  if (!status || status === 'COMPOSING') {
    return { symbol: '✓', colorKey: 'sending' };
  }
  if (status === 'RECEIVED') {
    return { symbol: '✓', colorKey: 'received' };
  }
  return { symbol: '✓✓', colorKey: 'read' };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface MessageStatusTracker {
  /**
   * Map<messageId, MessageStatusEventType> — the "highest" status seen for
   * each outbound message this session.
   * Mirrors Java: Enums.MessageStatusEventTypeEnum highestStatusForMsg
   */
  statusMap: Map<string, MessageStatusEventType>;

  /**
   * Call when a MESSAGE_STATUS WS event arrives.
   * Mirrors ServerGeneratedReceivedEventPusher: only update if new status
   * is higher than what we already have (idempotent, out-of-order safe).
   */
  handleMessageStatus: (event: MessageStatusEvent) => void;

  /**
   * Call when a READ_RECEIPT WS event arrives (already stored in PrivateChatTab).
   * Upgrades the tracked status to READ for all included messageIds.
   * Mirrors MessageStatusEventPersistable.storePipeline():
   *   if (status == READ) zrem(RECEIVED) → only READ survives in the sorted set.
   */
  handleReadReceipt: (event: ReadReceiptEvent) => void;

  /**
   * Seeds the tracker from messages already loaded from the DB (e.g. on mount).
   * Call with the array of loaded messages — any that have readAt set are
   * immediately promoted to READ status.
   */
  seedFromMessages: (messages: Array<{ id: string; readAt?: string | null }>) => void;

  /** Convenience: getTickInfo for a specific messageId */
  getTickForMessage: (messageId: string) => TickInfo;
}

/**
 * useMessageStatusTracker
 *
 * React hook that tracks per-message delivery state for a single conversation.
 * Intended to be used inside PrivateChatTab — replaces the simple Set<string>
 * readMessageIds with a richer Map that understands RECEIVED vs READ.
 *
 * Usage:
 *   const tracker = useMessageStatusTracker(conversationId);
 *   // In WS onmessage:
 *   if (payload.type === 'MESSAGE_STATUS') tracker.handleMessageStatus(payload);
 *   if (payload.type === 'READ_RECEIPT')   tracker.handleReadReceipt(payload);
 *   // On mount after loadMessages():
 *   tracker.seedFromMessages(messages);
 *   // In renderMessage:
 *   const tick = tracker.getTickForMessage(item.id);
 */
export function useMessageStatusTracker(conversationId: string): MessageStatusTracker {
  // Internal mutable map — we use a ref for the map so we never trigger
  // unnecessary re-renders on every WS event, and a tiny counter to trigger
  // React re-renders only when state actually changes.
  const mapRef = useRef<Map<string, MessageStatusEventType>>(new Map());
  const [, setVersion] = useState(0);

  const bump = useCallback(() => setVersion(v => v + 1), []);

  const setStatus = useCallback((msgId: string, incoming: MessageStatusEventType) => {
    const current = mapRef.current.get(msgId) ?? 'COMPOSING';
    const winner  = getHigherStatus(current, incoming);
    if (winner !== current) {
      mapRef.current.set(msgId, winner);
      bump();
    }
  }, [bump]);

  const handleMessageStatus = useCallback((event: MessageStatusEvent) => {
    if (event.conversationId !== conversationId) return;
    setStatus(event.messageId, event.status as MessageStatusEventType);
  }, [conversationId, setStatus]);

  const handleReadReceipt = useCallback((event: ReadReceiptEvent) => {
    if (event.conversationId !== conversationId) return;
    let changed = false;
    for (const msgId of event.messageIds) {
      const current = mapRef.current.get(msgId) ?? 'COMPOSING';
      const winner  = getHigherStatus(current, 'READ');
      if (winner !== current) {
        mapRef.current.set(msgId, winner);
        changed = true;
      }
    }
    if (changed) bump();
  }, [conversationId, bump]);

  const seedFromMessages = useCallback(
    (messages: Array<{ id: string; readAt?: string | null }>) => {
      let changed = false;
      for (const m of messages) {
        // Any message with readAt already confirmed as READ
        const incoming: MessageStatusEventType = m.readAt ? 'READ' : 'RECEIVED';
        const current = mapRef.current.get(m.id) ?? 'COMPOSING';
        const winner  = getHigherStatus(current, incoming);
        if (winner !== current) {
          mapRef.current.set(m.id, winner);
          changed = true;
        }
      }
      if (changed) bump();
    },
    [bump],
  );

  const getTickForMessage = useCallback((messageId: string): TickInfo => {
    return getTickInfo(mapRef.current.get(messageId) ?? null);
  }, []);

  return {
    statusMap:          mapRef.current,
    handleMessageStatus,
    handleReadReceipt,
    seedFromMessages,
    getTickForMessage,
  };
}
