import { API_BASE } from '../config/connection';
import { getAuthToken } from './storage';

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: 'include',
  });
}

export interface PartyMemberEntry {
  user_id: string;
  username: string;
  avatar_url: string;
  muted_by_username?: string;
  muted_at?: string;
  kicked_by_username?: string;
  kicked_at?: string;
  added_at?: string;
}

export async function fetchPartyMuted(roomId: string): Promise<PartyMemberEntry[]> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/muted`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.muted ?? [];
  } catch { return []; }
}

export async function mutePartyUser(
  roomId: string,
  userId: string,
  username: string,
  avatarUrl?: string,
): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/muted`, {
      method: 'POST',
      body: JSON.stringify({ userId, username, avatarUrl }),
    });
    return res.ok;
  } catch { return false; }
}

export async function unmutePartyUser(roomId: string, userId: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/muted/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    return res.ok;
  } catch { return false; }
}

export async function fetchPartyKicked(roomId: string): Promise<PartyMemberEntry[]> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/kicked`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.kicked ?? [];
  } catch { return []; }
}

export async function kickPartyUser(
  roomId: string,
  userId: string,
  username: string,
  avatarUrl?: string,
): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/kicked`, {
      method: 'POST',
      body: JSON.stringify({ userId, username, avatarUrl }),
    });
    return res.ok;
  } catch { return false; }
}

export async function unkickPartyUser(roomId: string, userId: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/kicked/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    return res.ok;
  } catch { return false; }
}

export async function fetchPartyAdmins(roomId: string): Promise<PartyMemberEntry[]> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/admins`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.admins ?? [];
  } catch { return []; }
}

export async function addPartyAdmin(roomId: string, username: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/admins`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function removePartyAdmin(roomId: string, userId: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/admins/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    return res.ok;
  } catch { return false; }
}
