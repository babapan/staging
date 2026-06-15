import { Platform } from 'react-native';
import { getSession } from './storage';
import { API_BASE } from './auth';

export interface DiamondBalance {
  balance: number;
  formatted: string;
  withdrawableIdr: number;
  minWithdrawDiamond: number;
  ratePerDiamond: number;
}

export interface DiamondTransaction {
  id: string;
  amount: number;
  type: string;
  reference: string | null;
  description: string | null;
  runningBalance: number;
  createdAt: string;
}

export interface DiamondRates {
  idrToCoin: number;
  coinToDiamond: number;
  diamondToIdr: number;
  minWithdrawDiamond: number;
  minWithdrawIdr: number;
  example: {
    buy100kIdr_getCoins: number;
    gift150kCoin_getDiamond: number;
    wd15kDiamond_getIdr: number;
  };
}

export interface WithdrawResult {
  success: boolean;
  refId: string;
  message: string;
  newBalance: number;
  estimatedIdr: number;
}

export interface WithdrawRequest {
  id: string;
  refId: string;
  amount: number;
  idrValue: number;
  method: 'bank' | 'ewallet' | 'usdt_trc20';
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  notes: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface CancelWithdrawResult {
  success: boolean;
  refId: string;
  diamondRefunded: number;
  newBalance: number;
  message: string;
}

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}

function fetchOptions(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' } : {};
}

export async function getDiamondBalance(): Promise<DiamondBalance | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/diamonds/balance`, { headers, ...fetchOptions() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getDiamondTransactions(limit = 50, offset = 0): Promise<DiamondTransaction[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(
      `${API_BASE}/api/diamonds/history?limit=${limit}&offset=${offset}`,
      { headers, ...fetchOptions() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.transactions ?? [];
  } catch {
    return [];
  }
}

export async function getDiamondRates(): Promise<DiamondRates | null> {
  try {
    const res = await fetch(`${API_BASE}/api/diamonds/rates`, fetchOptions());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function withdrawDiamonds(params: {
  amount: number;
  method: 'bank' | 'ewallet' | 'usdt_trc20';
  bankName: string;
  accountNumber: string;
  accountName: string;
}): Promise<WithdrawResult> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/diamonds/withdraw`, {
    method: 'POST',
    headers,
    ...fetchOptions(),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Withdraw gagal.');
  return data;
}

export async function getWithdrawRequests(limit = 20, offset = 0): Promise<WithdrawRequest[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(
      `${API_BASE}/api/diamonds/withdraw-requests?limit=${limit}&offset=${offset}`,
      { headers, ...fetchOptions() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Map snake_case DB columns → camelCase
    return (data.requests ?? []).map((r: any) => ({
      id:            r.id,
      refId:         r.ref_id,
      amount:        Number(r.amount),
      idrValue:      Number(r.idr_value),
      bankName:      r.bank_name,
      accountNumber: r.account_number,
      accountName:   r.account_name,
      status:        r.status,
      notes:         r.notes ?? null,
      createdAt:     r.created_at,
      method:        r.method ?? 'bank',
      processedAt:   r.processed_at ?? null,
    }));
  } catch {
    return [];
  }
}

export async function cancelWithdrawRequest(refId: string): Promise<CancelWithdrawResult> {
  const headers = await buildHeaders();
  const res = await fetch(
    `${API_BASE}/api/diamonds/withdraw-requests/${encodeURIComponent(refId)}/cancel`,
    { method: 'POST', headers, ...fetchOptions() },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Pembatalan gagal.');
  return data;
}

export function formatDiamond(amount: number): string {
  return `💎 ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function formatDiamondToIdr(diamond: number, rate = 2): string {
  const idr = Math.floor(diamond * rate);
  return `Rp ${idr.toLocaleString('id-ID')}`;
}
