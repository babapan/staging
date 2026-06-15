import { API_BASE } from '../config/connection';
import { getAuthToken } from './storage';

async function authedFetch(path: string, opts?: RequestInit) {
  const token = await getAuthToken();
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PKBattle {
  id:                   number;
  challengerStreamId:   string;
  opponentStreamId:     string;
  challengerUsername:   string;
  opponentUsername:     string;
  challengerDisplayName: string | null;
  opponentDisplayName:   string | null;
  challengerAvatar:     string | null;
  opponentAvatar:       string | null;
  challengerScore:      number;
  opponentScore:        number;
  durationSeconds:      number;
  endAt:                string | null;
  winner:               'challenger' | 'opponent' | 'tie' | null;
  status:               'pending' | 'active' | 'ended';
}

export interface LiveHost {
  id:          string;
  username:    string;
  displayName: string | null;
  avatarUrl:   string | null;
  viewerCount: number;
  title:       string;
}

// ── API functions ─────────────────────────────────────────────────────────────
export async function getLiveHosts(): Promise<LiveHost[]> {
  try {
    const res = await authedFetch('/api/live/pk/live-hosts');
    if (!res.ok) return [];
    const data = await res.json();
    return data.hosts ?? [];
  } catch { return []; }
}

export async function getPKState(streamId: string): Promise<{ active: boolean; pending: boolean; battle: PKBattle | null }> {
  try {
    const res = await authedFetch(`/api/live/streams/${streamId}/pk/state`);
    if (!res.ok) return { active: false, pending: false, battle: null };
    const data = await res.json();
    return {
      active:  data.active  ?? false,
      pending: data.pending ?? false,
      battle:  data.battle  ? normaliseBattle(data.battle) : null,
    };
  } catch { return { active: false, pending: false, battle: null }; }
}

export async function challengePK(myStreamId: string, opponentStreamId: string): Promise<{ ok: boolean; battleId?: number; message?: string }> {
  try {
    const res = await authedFetch(`/api/live/streams/${myStreamId}/pk/challenge`, {
      method: 'POST', body: JSON.stringify({ opponentStreamId }),
    });
    const data = await res.json();
    return { ok: res.ok, battleId: data.battleId, message: data.message };
  } catch { return { ok: false }; }
}

export async function acceptPK(myStreamId: string, battleId: number): Promise<{ ok: boolean; battle?: PKBattle }> {
  try {
    const res = await authedFetch(`/api/live/streams/${myStreamId}/pk/accept`, {
      method: 'POST', body: JSON.stringify({ battleId }),
    });
    const data = await res.json();
    return { ok: res.ok, battle: data.battle ? normaliseBattle(data.battle) : undefined };
  } catch { return { ok: false }; }
}

export async function declinePK(myStreamId: string, battleId: number): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`/api/live/streams/${myStreamId}/pk/decline`, {
      method: 'POST', body: JSON.stringify({ battleId }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function cancelPK(myStreamId: string, battleId: number): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch(`/api/live/streams/${myStreamId}/pk/cancel`, {
      method: 'POST', body: JSON.stringify({ battleId }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

function normaliseBattle(b: any): PKBattle {
  return {
    id:                   Number(b.id),
    challengerStreamId:   b.challenger_stream_id ?? b.challengerStreamId,
    opponentStreamId:     b.opponent_stream_id   ?? b.opponentStreamId,
    challengerUsername:   b.challenger_username  ?? b.challengerUsername  ?? '',
    opponentUsername:     b.opponent_username    ?? b.opponentUsername    ?? '',
    challengerDisplayName: b.challenger_display_name ?? b.challengerDisplayName ?? null,
    opponentDisplayName:   b.opponent_display_name   ?? b.opponentDisplayName   ?? null,
    challengerAvatar:     b.challenger_avatar ?? b.challengerAvatar ?? null,
    opponentAvatar:       b.opponent_avatar   ?? b.opponentAvatar   ?? null,
    challengerScore:      Number(b.challenger_score ?? b.challengerScore ?? 0),
    opponentScore:        Number(b.opponent_score   ?? b.opponentScore   ?? 0),
    durationSeconds:      Number(b.duration_seconds ?? b.durationSeconds ?? 300),
    endAt:                b.endAt ?? null,
    winner:               b.winner ?? null,
    status:               b.status ?? 'pending',
  };
}

export { normaliseBattle };
