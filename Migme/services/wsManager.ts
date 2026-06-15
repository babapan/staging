/**
 * wsManager — singleton WebSocket reference tracker.
 *
 * RoomChatModal registers its active WS here after AUTH_OK, and clears it
 * when the socket closes.  The logout flow calls sendLogoutSignal() so the
 * gateway receives an explicit LOGOUT message (immediate "has left" broadcast,
 * no 15-second grace period) before the HTTP session is destroyed.
 *
 * Mirrors the fusion SSO logout path in SSOResource.java which calls
 * userPrx.disconnect() / onLeaveChatRoom before invalidating the session.
 */

let activeWS: WebSocket | null = null;

/** Called by RoomChatModal when AUTH_OK is received. */
export function registerWS(ws: WebSocket): void {
  activeWS = ws;
}

/** Called by RoomChatModal when the socket closes or the modal unmounts. */
export function unregisterWS(ws: WebSocket): void {
  if (activeWS === ws) {
    activeWS = null;
  }
}

/**
 * Send a LOGOUT packet on the active WS connection and wait for LOGOUT_OK
 * (or timeout after 3 seconds).
 *
 * Mirrors FusionPktLeaveChatRoomOld.execute() → MSB.onLeaveChatRoom()
 * which sends the "has left" admin message before the session is destroyed.
 */
export function sendLogoutSignal(): Promise<void> {
  return new Promise((resolve) => {
    const ws = activeWS;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, 3_000);

    function onMessage(e: MessageEvent) {
      try {
        const payload = JSON.parse(e.data as string);
        if (payload.type === 'LOGOUT_OK') {
          cleanup();
          resolve();
        }
      } catch {
        // ignore parse errors
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      ws!.removeEventListener('message', onMessage);
    }

    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ type: 'LOGOUT' }));
  });
}
