import { Platform } from 'react-native';
import { saveSession, getSession, clearSession, saveUser, saveAuthToken, getAuthToken, type StoredUser } from './storage';
import { API_BASE as _API_BASE, Connection } from '../config/connection';
import { sendLogoutSignal } from './wsManager';
import { globalGatewayService } from './globalGatewayService';

// Re-export so all existing imports of API_BASE from this file keep working
export const API_BASE = _API_BASE;
export { Connection };

export async function buildHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (Platform.OS !== 'web') {
    // Prefer JWT Bearer token (works reliably on native without cookie jar)
    const authToken = await getAuthToken();
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else {
      // Fallback: try session cookie (may not work on all React Native versions)
      const cookie = await getSession();
      if (cookie) headers['Cookie'] = cookie;
    }
  }
  return headers;
}

function getFetchOptions(method: string): RequestInit {
  return Platform.OS === 'web'
    ? { credentials: 'include' as RequestCredentials }
    : {};
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  isAdmin?: boolean;
}

export interface AuthResponse {
  user?: AuthUser;
  message?: string;
  errors?: unknown;
  tcpToken?: string;
  authToken?: string;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
    ...getFetchOptions('POST'),
  });

  if (Platform.OS !== 'web') {
    const rawCookie = res.headers.get('set-cookie');
    if (rawCookie) {
      const sid = rawCookie.split(';')[0];
      await saveSession(sid);
    }
  }

  let data: AuthResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error('Server tidak merespons dengan benar. Periksa koneksi dan coba lagi.');
  }

  if (res.ok && data.user) {
    await saveUser(data.user as StoredUser);

    // Save JWT authToken for all subsequent HTTP API requests (replaces cookie approach).
    // authToken is a 30-day JWT that works reliably on React Native without a cookie jar.
    if (Platform.OS !== 'web' && data.authToken) {
      await saveAuthToken(data.authToken);
      globalGatewayService.start(data.authToken);
    }
  }

  if (!res.ok) {
    throw new Error(data.message || 'Login gagal');
  }

  return data;
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ idToken }),
    ...getFetchOptions('POST'),
  });

  if (Platform.OS !== 'web') {
    const rawCookie = res.headers.get('set-cookie');
    if (rawCookie) {
      const sid = rawCookie.split(';')[0];
      await saveSession(sid);
    }
  }

  let data: AuthResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error('Server tidak merespons. Coba lagi.');
  }

  if (res.ok && data.user) {
    await saveUser(data.user as StoredUser);
    if (Platform.OS !== 'web' && data.authToken) {
      await saveAuthToken(data.authToken);
      globalGatewayService.start(data.authToken);
    }
  }

  if (!res.ok) {
    throw new Error(data.message || 'Login Google gagal');
  }

  return data;
}

export async function register(
  username: string,
  email: string,
  password: string,
  displayName?: string,
  deviceId?: string | null,
): Promise<AuthResponse> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username,
      email,
      password,
      displayName: displayName || username,
      device_id: deviceId || undefined,
    }),
    ...getFetchOptions('POST'),
  });

  const data: AuthResponse = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Registrasi gagal');
  }

  return data;
}

export async function logout(): Promise<void> {
  // Step 1 — Mirror the Migers Java HomeNavigationActivity logout: explicitly
  // leave every chatroom the user is currently subscribed to BEFORE the socket
  // is torn down. Each open RoomChatModal registers its WebSocket in the
  // activeRoomsRegistry; here we send an UNSUBSCRIBE (LeaveRoomPacket
  // equivalent) on every one so the server immediately broadcasts
  // "[username] has left" to all participants — no grace window, no
  // disconnect-timeout dependency.
  try {
    const { leaveAllActiveRooms, clearActiveRoomsRegistry } = await import('./activeRoomsRegistry');
    leaveAllActiveRooms();
    // Give the WS a brief moment to flush UNSUBSCRIBE frames before LOGOUT
    // closes the connection.
    await new Promise(resolve => setTimeout(resolve, 120));
    clearActiveRoomsRegistry();
  } catch {
    // best-effort — never block logout on this
  }

  // Step 2 — Send LOGOUT signal over WebSocket so the gateway broadcasts
  // "[username] has left" without waiting for the grace period.
  await sendLogoutSignal();

  // Stop global gateway (personal event WS)
  globalGatewayService.stop();

  const headers = await buildHeaders();
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers,
    ...getFetchOptions('POST'),
  });
  await clearSession();

  // Sign out from Google (if user logged in via Google) so the native account
  // picker shows again on next login instead of auto-selecting the same account.
  if (Platform.OS !== 'web') {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      const isSignedIn = await GoogleSignin.getCurrentUser();
      if (isSignedIn) await GoogleSignin.signOut();
    } catch {
      // best-effort — never block logout on this
    }
  }

  // Wipe in-memory chat caches so the next account that signs in does not
  // see the previous account's chats when entering the same room.
  try {
    const { clearRoomMessageCache } = await import('../components/RoomChatModal');
    clearRoomMessageCache();
  } catch {}
}

export async function forgotPassword(emailOrUsername: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrUsername }),
    ...getFetchOptions('POST'),
  });
  let data: { message?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('Server tidak merespons dengan benar. Periksa koneksi dan coba lagi.');
  }
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan. Coba lagi.');
  return data;
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers,
      ...getFetchOptions('GET'),
    });
    if (!res.ok) return null;
    const data: AuthResponse = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}
