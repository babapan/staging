import { Platform } from 'react-native';
import { getSession } from './storage';
import { API_BASE } from './auth';

export interface CreditBalance {
  username: string;
  currency: string;
  balance: number;
  fundedBalance: number;
  formatted: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  username: string;
  type: number;
  typeName: string;
  reference: string | null;
  description: string | null;
  currency: string;
  amount: number;
  fundedAmount: number;
  tax: number;
  runningBalance: number;
  createdAt: string;
}

export interface TransferResult {
  success: boolean;
  fromUsername: string;
  toUsername: string;
  transferAmount: number;
  fee: number;
  netReceived: number;
  fromBalance: number;
  toBalance: number;
  currency: string;
}

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}

function fetchOptions(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' } : {};
}

export async function getCreditBalance(username: string): Promise<CreditBalance | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(
      `${API_BASE}/api/credit/balance/${encodeURIComponent(username)}`,
      { headers, ...fetchOptions() },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getCreditTransactions(
  username: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(
      `${API_BASE}/api/credit/transactions?username=${encodeURIComponent(username)}&limit=${limit}`,
      { headers, ...fetchOptions() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.transactions ?? [];
  } catch {
    return [];
  }
}

export async function transferCredit(
  _fromUsername: string,
  toUsername: string,
  amount: number,
  pin: string,
): Promise<TransferResult> {
  // fromUsername is intentionally NOT sent — the server derives it from the session.
  // _fromUsername param kept for call-site compatibility but is ignored here.
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/credit/transfer`, {
    method: 'POST',
    headers,
    ...fetchOptions(),
    body: JSON.stringify({ toUsername, amount, pin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Transfer failed');
  return data;
}

export function idrToCoin(idr: number): number {
  return Math.floor(idr);
}

export function formatCredit(amount: number, _currency?: string): string {
  return `🪙 ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function formatIDR(amount: number): string {
  return `🪙 ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function formatCoin(amount: number): string {
  const coin = Math.floor(amount);
  if (coin >= 1000000) return `🪙 ${(coin / 1000000).toFixed(2)}M`;
  if (coin >= 1000)    return `🪙 ${(coin / 1000).toFixed(2)}K`;
  return `🪙 ${coin.toLocaleString('id-ID')}`;
}
