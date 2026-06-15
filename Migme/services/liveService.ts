import { API_BASE } from '../config/connection';
import { getAuthToken } from './storage';

export interface LiveStream {
  id: string;
  hostUsername: string;
  hostDisplayName: string | null;
  hostAvatar: string | null;
  title: string;
  category: string;
  thumbnailUrl: string | null;
  viewerCount: number;
  totalGifts: number;
  startedAt: string;
}

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

export async function uploadLiveThumbnail(localUri: string): Promise<string | null> {
  try {
    const token = await getAuthToken();
    const form  = new FormData();
    const filename = localUri.split('/').pop() ?? 'thumbnail.jpg';
    const ext      = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    form.append('thumbnail', { uri: localUri, name: filename, type: mimeType } as any);
    const res = await fetch(`${API_BASE}/api/live/thumbnail`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ? normalizeUrl(data.url) : null;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE.replace(/\/$/, '')}${url}`;
}

export async function fetchLiveStreams(): Promise<LiveStream[]> {
  try {
    const res = await authedFetch('/api/live/streams');
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.streams)) return [];
    return data.streams.map((s: any) => ({
      ...s,
      hostAvatar:   normalizeUrl(s.hostAvatar),
      thumbnailUrl: normalizeUrl(s.thumbnailUrl),
    }));
  } catch {
    return [];
  }
}

export async function startLiveStream(payload: {
  title?: string;
  category?: string;
  thumbnailUrl?: string;
}): Promise<{ ok: boolean; streamId?: string; resumed?: boolean; agencyName?: string | null; message?: string }> {
  try {
    const res = await authedFetch('/api/live/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message ?? 'Gagal memulai live' };
    return { ok: true, streamId: data.streamId, resumed: data.resumed, agencyName: data.agencyName ?? null };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function endLiveStream(streamId: string): Promise<{ ok: boolean; totalGifts?: number; totalViewers?: number }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/end`, { method: 'POST' });
    const data = await res.json();
    return { ok: !!data.ok, totalGifts: data.totalGifts, totalViewers: data.totalViewers };
  } catch {
    return { ok: false };
  }
}

export async function getLiveStreamDetail(streamId: string): Promise<any | null> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getLiveSoloToken(streamId: string): Promise<{ token: string; url: string; provider: string; role: string } | null> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/token`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function joinStream(streamId: string): Promise<{ ok: boolean; blocked?: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/join`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, blocked: !!data.blocked, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function leaveStream(streamId: string): Promise<void> {
  await authedFetch(`/api/live/streams/${streamId}/leave`, { method: 'POST' }).catch(() => {});
}

export interface LiveViewer {
  username:       string;
  displayName:    string;
  avatarUrl:      string | null;
  avatarFrameUrl?: string | null;
  vipLevel?:      number;
  migLevel?:      number;
  giftTotal?:     number;
  agencyName?:    string | null;
  isAdmin?:       boolean;
  isHost?:        boolean;
  isBot?:         boolean;
}

export async function getLiveViewers(streamId: string): Promise<LiveViewer[]> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/viewers`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.viewers ?? []) as LiveViewer[];
  } catch {
    return [];
  }
}

export interface LiveBlockedUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export async function getBlockedLiveUsers(streamId: string): Promise<LiveBlockedUser[]> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/blocked`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.blocked ?? []) as LiveBlockedUser[];
  } catch {
    return [];
  }
}

export async function blockLiveViewer(streamId: string, username: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/block`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function unblockLiveUser(streamId: string, userId: string): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/blocked/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function kickLiveViewer(streamId: string, username: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/kick`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export interface LiveAdmin {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  addedAt?: string;
}

export async function getLiveAdmins(streamId: string): Promise<LiveAdmin[]> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/admins`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.admins ?? []).map((a: any) => ({
      username:    a.username,
      displayName: a.display_name ?? null,
      avatarUrl:   normalizeUrl(a.avatar_url),
      addedAt:     a.added_at,
    }));
  } catch {
    return [];
  }
}

export async function addLiveAdmin(streamId: string, username: string): Promise<{ ok: boolean; message?: string; admin?: LiveAdmin }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/admins`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return {
      ok: true,
      admin: data.admin ? {
        username:    data.admin.username,
        displayName: data.admin.displayName ?? null,
        avatarUrl:   normalizeUrl(data.admin.avatarUrl),
      } : undefined,
    };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function removeLiveAdmin(streamId: string, username: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/admins/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

// ─── Komal Seats ─────────────────────────────────────────────────────────────

export interface KomalSeat {
  seatNum:     number;
  username:    string | null;
  displayName: string | null;
  avatarUrl:   string | null;
  isMuted:     boolean;
}

export async function getKomalState(streamId: string): Promise<{ active: boolean; seats: KomalSeat[] }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal`);
    if (!res.ok) return { active: false, seats: [] };
    const data = await res.json();
    return {
      active: !!data.active,
      seats: (data.seats ?? []).map((s: any) => ({
        seatNum:     s.seatNum,
        username:    s.username    ?? null,
        displayName: s.displayName ?? null,
        avatarUrl:   normalizeUrl(s.avatarUrl),
        isMuted:     !!s.isMuted,
      })),
    };
  } catch {
    return { active: false, seats: [] };
  }
}

export async function activateKomal(streamId: string): Promise<{ ok: boolean; seats: KomalSeat[]; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return { ok: false, seats: [], message: data.message };
    return { ok: true, seats: data.seats ?? [] };
  } catch {
    return { ok: false, seats: [], message: 'Koneksi bermasalah' };
  }
}

export async function deactivateKomal(streamId: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/deactivate`, { method: 'POST' });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function getKomalToken(streamId: string): Promise<{ token: string; url: string; provider: string } | null> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/token`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? { token: data.token, url: data.url, provider: data.provider } : null;
  } catch {
    return null;
  }
}

export async function joinKomalSeat(streamId: string, seatNum: number): Promise<{ ok: boolean; seats: KomalSeat[]; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/seats/${seatNum}/join`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return { ok: false, seats: [], message: data.message };
    return { ok: true, seats: data.seats ?? [] };
  } catch {
    return { ok: false, seats: [], message: 'Koneksi bermasalah' };
  }
}

export async function leaveKomalSeat(streamId: string, seatNum: number): Promise<{ ok: boolean; seats: KomalSeat[] }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/seats/${seatNum}/leave`, { method: 'POST' });
    if (!res.ok) return { ok: false, seats: [] };
    const data = await res.json();
    return { ok: true, seats: data.seats ?? [] };
  } catch {
    return { ok: false, seats: [] };
  }
}

export async function muteKomalSeat(streamId: string, seatNum: number, muted: boolean): Promise<{ ok: boolean; seats: KomalSeat[] }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/seats/${seatNum}/mute`, {
      method: 'POST',
      body: JSON.stringify({ muted }),
    });
    if (!res.ok) return { ok: false, seats: [] };
    const data = await res.json();
    return { ok: true, seats: data.seats ?? [] };
  } catch {
    return { ok: false, seats: [] };
  }
}

// ── Komal Hand-Raise ─────────────────────────────────────────────────────────
export interface KomalHandRaiseRequest {
  username:    string;
  displayName: string | null;
  avatarUrl:   string | null;
}

export async function raiseKomalHand(streamId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/raise-hand`, { method: 'POST' });
    const data = await res.json();
    return { ok: res.ok, message: data.message };
  } catch {
    return { ok: false };
  }
}

export async function approveKomalHand(streamId: string, username: string): Promise<{ ok: boolean; seatNum?: number }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/raise-hand/approve`, {
      method: 'POST',
      body:   JSON.stringify({ username }),
    });
    const data = await res.json();
    return { ok: res.ok, seatNum: data.seatNum };
  } catch {
    return { ok: false };
  }
}

export async function rejectKomalHand(streamId: string, username: string): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/komal/raise-hand/reject`, {
      method: 'POST',
      body:   JSON.stringify({ username }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function sendGift(streamId: string, giftName: string, amountCoins: number): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/gift`, {
      method: 'POST',
      body: JSON.stringify({ giftName, amountCoins }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}
