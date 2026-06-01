import { API_BASE, buildHeaders } from './auth';

export interface ShopFrame {
  id: string;
  name: string;
  image_url: string;
  category: string;
  price_1d: number;
  price_7d: number;
  price_30d: number;
  sort_order: number;
  frame_type?: 'image' | 'lottie';
}

export interface UserFrame {
  id: string;
  frame_id: string;
  name: string;
  image_url: string;
  category: string;
  expires_at: string;
  is_equipped: boolean;
  purchased_at: string;
  frame_type?: 'image' | 'lottie';
}

/** Ensure relative /api/... URLs are prefixed with API_BASE for mobile */
function normalizeFrameUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
}

export interface PurchaseResult {
  success: boolean;
  message: string;
  frameUrl?: string;
  newBalance?: number;
  expiresAt?: string;
}

export async function getShopFrames(): Promise<ShopFrame[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/frames`, { headers });
    const data = await res.json();
    return (data.frames ?? []).map((f: ShopFrame) => ({
      ...f,
      image_url: normalizeFrameUrl(f.image_url),
    }));
  } catch {
    return [];
  }
}

export async function getMyFrames(): Promise<UserFrame[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/my-frames`, { headers });
    const data = await res.json();
    return (data.frames ?? []).map((f: UserFrame) => ({
      ...f,
      image_url: normalizeFrameUrl(f.image_url),
    }));
  } catch {
    return [];
  }
}

export async function getActiveFrame(): Promise<string | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/active-frame`, { headers });
    const data = await res.json();
    return data.frameUrl ?? null;
  } catch {
    return null;
  }
}

export async function getUserActiveFrame(username: string): Promise<string | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/active-frame/${encodeURIComponent(username)}`, { headers });
    const data = await res.json();
    return data.frameUrl ?? null;
  } catch {
    return null;
  }
}

export async function purchaseFrame(frameId: string, duration: 1 | 7 | 30): Promise<PurchaseResult> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/frames/${frameId}/purchase`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ duration }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message ?? 'Pembelian gagal' };
    return data;
  } catch (e: any) {
    return { success: false, message: e.message ?? 'Koneksi gagal' };
  }
}

export async function equipFrame(userFrameId: string): Promise<{ success: boolean }> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/frames/equip/${userFrameId}`, { method: 'POST', headers });
    return await res.json();
  } catch {
    return { success: false };
  }
}

export async function unequipFrame(): Promise<{ success: boolean }> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/frames/unequip`, { method: 'DELETE', headers });
    return await res.json();
  } catch {
    return { success: false };
  }
}

export function formatCoin(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return amount.toLocaleString('id-ID');
}

// ── Entry Effects ─────────────────────────────────────────────────────────────

export interface ShopEntryEffect {
  id: string;
  name: string;
  lottie_url: string;
  price_1d: number;
  price_7d: number;
  price_30d: number;
  sort_order: number;
}

export interface UserEntryEffect {
  id: string;
  effect_id: string;
  name: string;
  lottie_url: string;
  expires_at: string;
  is_equipped: boolean;
  purchased_at: string;
}

function normalizeEffectUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
}

export async function getShopEntryEffects(): Promise<ShopEntryEffect[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/entry-effects`, { headers });
    const data = await res.json();
    return (data.effects ?? []).map((e: ShopEntryEffect) => ({
      ...e,
      lottie_url: normalizeEffectUrl(e.lottie_url),
    }));
  } catch {
    return [];
  }
}

export async function getMyEntryEffects(): Promise<UserEntryEffect[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/my-entry-effects`, { headers });
    const data = await res.json();
    return (data.effects ?? []).map((e: UserEntryEffect) => ({
      ...e,
      lottie_url: normalizeEffectUrl(e.lottie_url),
    }));
  } catch {
    return [];
  }
}

export async function getActiveEntryEffect(): Promise<string | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/active-entry-effect`, { headers });
    const data = await res.json();
    const url = data.effectUrl ?? null;
    return url ? normalizeEffectUrl(url) : null;
  } catch {
    return null;
  }
}

export async function getUserActiveEntryEffect(username: string): Promise<string | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/active-entry-effect/${encodeURIComponent(username)}`, { headers });
    const data = await res.json();
    const url = data.effectUrl ?? null;
    return url ? normalizeEffectUrl(url) : null;
  } catch {
    return null;
  }
}

export async function purchaseEntryEffect(effectId: string, duration: 1 | 7 | 30): Promise<PurchaseResult> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/entry-effects/${effectId}/purchase`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ duration }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message ?? 'Pembelian gagal' };
    return { success: true, message: data.message, newBalance: data.newBalance, expiresAt: data.expiresAt };
  } catch (e: any) {
    return { success: false, message: e.message ?? 'Koneksi gagal' };
  }
}

export async function equipEntryEffect(userEffectId: string): Promise<{ success: boolean }> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/entry-effects/equip/${userEffectId}`, { method: 'POST', headers });
    return await res.json();
  } catch {
    return { success: false };
  }
}

export async function unequipEntryEffect(): Promise<{ success: boolean }> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/shop/entry-effects/unequip`, { method: 'DELETE', headers });
    return await res.json();
  } catch {
    return { success: false };
  }
}
