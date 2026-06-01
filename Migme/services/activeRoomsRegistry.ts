/**
 * activeRoomsRegistry
 * ──────────────────────────────────────────────────────────────────────────
 * Each RoomChatModal instance registers its WebSocket here while the user is
 * subscribed to a chatroom. On logout we walk the registry and send an
 * explicit UNSUBSCRIBE (LeaveRoomPacket equivalent) for every room so the
 * server immediately broadcasts "[username] has left" to every participant
 * — without waiting for the 8h grace window or for the socket disconnect
 * timeout to elapse.
 *
 * Mirrors the Migers Java client behaviour: HomeNavigationActivity logout →
 * leaves all joined rooms via chat.room.leave packets BEFORE tearing down
 * the SocketService.
 */

type RegistryEntry = {
  roomId: string;
  getSocket: () => WebSocket | null;
};

const entries = new Map<string, RegistryEntry>();

export function registerActiveRoom(roomId: string, getSocket: () => WebSocket | null): () => void {
  entries.set(roomId, { roomId, getSocket });
  return () => {
    // Only delete if the entry still belongs to this caller.
    const cur = entries.get(roomId);
    if (cur && cur.getSocket === getSocket) entries.delete(roomId);
  };
}

export function unregisterActiveRoom(roomId: string) {
  entries.delete(roomId);
}

export function getActiveRoomIds(): string[] {
  return Array.from(entries.keys());
}

/**
 * Send an UNSUBSCRIBE packet on every active room WebSocket. Best-effort:
 * any errors per-room are swallowed because we still want logout to proceed.
 */
export function leaveAllActiveRooms(): void {
  for (const entry of Array.from(entries.values())) {
    try {
      const ws = entry.getSocket();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'UNSUBSCRIBE', roomId: entry.roomId }));
      }
    } catch {
      // ignore — logout should not be blocked by per-room failures
    }
  }
}

export function clearActiveRoomsRegistry() {
  entries.clear();
}
