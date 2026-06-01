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
}): Promise<{ ok: boolean; streamId?: string; resumed?: boolean; message?: string }> {
  try {
    const res = await authedFetch('/api/live/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message ?? 'Gagal memulai live' };
    return { ok: true, streamId: data.streamId, resumed: data.resumed };
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

export async function joinStream(streamId: string): Promise<void> {
  await authedFetch(`/api/live/streams/${streamId}/join`, { method: 'POST' }).catch(() => {});
}

export async function leaveStream(streamId: string): Promise<void> {
  await authedFetch(`/api/live/streams/${streamId}/leave`, { method: 'POST' }).catch(() => {});
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

export interface StreamViewer {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface StreamBlock {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

export async function fetchStreamViewers(streamId: string): Promise<StreamViewer[]> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/viewers`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.viewers ?? []).map((v: any) => ({
      ...v,
      avatarUrl: normalizeUrl(v.avatarUrl),
    }));
  } catch {
    return [];
  }
}

export async function kickStreamViewer(
  streamId: string,
  targetUserId: string,
  targetUsername: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/kick`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId, targetUsername }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function blockStreamViewer(
  streamId: string,
  targetUserId: string,
  targetUsername: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/block`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId, targetUsername }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function unblockStreamViewer(
  streamId: string,
  targetUserId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/block/${targetUserId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}

export async function fetchStreamBlocks(streamId: string): Promise<StreamBlock[]> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/blocks`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.blocks ?? []).map((b: any) => ({
      ...b,
      avatarUrl: normalizeUrl(b.avatarUrl),
    }));
  } catch {
    return [];
  }
}

export async function sendStreamAnnouncement(
  streamId: string,
  text: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/announce`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi bermasalah' };
  }
}
