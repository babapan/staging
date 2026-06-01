/**
 * PartyContext.tsx
 *
 * Global state untuk Party Room — memungkinkan floating bubble
 * muncul di semua tab (Home, Feed, dll) saat room diminimalkan.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { API_BASE, buildHeaders, getMe } from '../services/auth';
import { fetchPartyRooms, createPartyRoom } from '../services/partyService';
import type { PartyRoom } from '../components/PartyRoomModal';

interface CurrentUser {
  username: string;
  displayName?: string | null;
  migLevel?: number;
}

interface PartyContextValue {
  openRoom:          PartyRoom | null;
  isMinimized:       boolean;
  currentUser:       CurrentUser | null;
  openPartyRoom:     (room: PartyRoom) => void;
  closePartyRoom:    () => void;
  minimizeParty:     () => void;
  restoreParty:      () => void;
  onRoomUpdated:     (updated: PartyRoom) => void;
  navigateToRoom:    (roomId: string, roomName: string) => void;
  rooms:             PartyRoom[];
  setRooms:          React.Dispatch<React.SetStateAction<PartyRoom[]>>;
}

const PartyContext = createContext<PartyContextValue | null>(null);

export function useParty(): PartyContextValue {
  const ctx = useContext(PartyContext);
  if (!ctx) throw new Error('useParty must be used inside PartyProvider');
  return ctx;
}

const SEAT_COLORS = [
  '#7C3AED','#A855F7','#EC4899','#F43F5E',
  '#F59E0B','#10B981','#3B82F6','#6366F1',
];

export function PartyProvider({ children }: { children: ReactNode }) {
  const [openRoom,    setOpenRoom]    = useState<PartyRoom | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [rooms,       setRooms]       = useState<PartyRoom[]>([]);

  const openRoomRef = useRef<PartyRoom | null>(null);
  openRoomRef.current = openRoom;

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe();
        if (!u) return;
        const headers = await buildHeaders();
        const profileRes = await fetch(`${API_BASE}/api/profile/me`, {
          headers: headers as Record<string, string>,
          credentials: Platform.OS === 'web' ? 'include' : undefined,
        });
        let migLevel = 1;
        if (profileRes.ok) {
          const d = await profileRes.json();
          migLevel = d?.profile?.migLevel ?? 1;
        }
        setCurrentUser({ username: u.username, displayName: u.displayName, migLevel });
      } catch {}
    })();
  }, []);

  const openPartyRoom = useCallback((room: PartyRoom) => {
    setIsMinimized(false);
    setOpenRoom(room);
  }, []);

  const closePartyRoom = useCallback(() => {
    setOpenRoom(null);
    setIsMinimized(false);
  }, []);

  const minimizeParty = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const restoreParty = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const onRoomUpdated = useCallback((updated: PartyRoom) => {
    setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
    setOpenRoom(updated);
  }, []);

  const navigateToRoom = useCallback(async (roomId: string, _roomName: string) => {
    const existing = openRoomRef.current?.id === roomId
      ? openRoomRef.current
      : null;
    if (existing) { setIsMinimized(false); return; }
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/rooms/${roomId}`, {
        headers: headers as Record<string, string>,
        credentials: Platform.OS === 'web' ? 'include' : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        const room = data.room ?? data;
        if (room?.id) { setIsMinimized(false); setOpenRoom(room); }
      }
    } catch {}
  }, []);

  return (
    <PartyContext.Provider value={{
      openRoom, isMinimized, currentUser,
      openPartyRoom, closePartyRoom, minimizeParty, restoreParty,
      onRoomUpdated, navigateToRoom,
      rooms, setRooms,
    }}>
      {children}
    </PartyContext.Provider>
  );
}
