import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SESSION_KEY  = 'migchat_session_cookie';
const USER_KEY     = 'migchat_user';
const AUTH_TOKEN_KEY = 'migchat_auth_token';

export interface StoredUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
}

export async function saveSession(cookie: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await AsyncStorage.setItem(SESSION_KEY, cookie);
  }
}

export async function getSession(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    return AsyncStorage.getItem(SESSION_KEY);
  }
  return null;
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_KEY, USER_KEY, AUTH_TOKEN_KEY]);
}

export async function saveAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function saveUser(user: StoredUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<StoredUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}
