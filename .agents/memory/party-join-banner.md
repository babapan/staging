---
name: Party Room Join Banner Bug
description: Why join notifications (Bergabung 🎊) didn't appear in party room chat
---

## The Rule
Party room fast-path in `gateway.ts` must broadcast a "has entered" MESSAGE packet on genuine join, not just SUBSCRIBED + HISTORY.

## Why
The `JOIN_ROOM` handler in `gateway.ts` has two branches:
1. Classic chatroom (room found in chatrooms table) — full flow including join message broadcast ✓
2. Party room fast-path (room NOT found in chatrooms → falls back to party_rooms table) — was a "simplified flow" that only sent SUBSCRIBED + HISTORY, with NO join message broadcast ✗

Result: The chat banner "Bergabung 🎊" never appeared (no MESSAGE packet), but the self-entry animation still showed (triggered by visible effect, not WS).

## How to Apply
- Any "has entered" or "has left" style notifications in party rooms must be explicitly broadcast via `broadcastToRoom` in the party fast-path.
- Check `isBackgroundReturn` flag from the JOIN_ROOM msg to avoid duplicate banners on minimize/restore.
- Check `partyAlreadyInRoom` (before roomClientsAdd) to detect reconnects.
- Use `withLevel(username, migLevel)` helper from gateway.ts for the text format.
- Message format: `"${partyRoomRow.name}::${joinDisplayName} has entered"` — matches `parseSystemText` on client.
