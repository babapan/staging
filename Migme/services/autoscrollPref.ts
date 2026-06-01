import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTOSCROLL_STORAGE_KEY = 'mig_chat_autoscroll';

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

let cached = true;
let loaded = false;

export async function loadAutoScrollPref(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(AUTOSCROLL_STORAGE_KEY);
    cached = v === null ? true : v === 'true';
  } catch {
    cached = true;
  }
  loaded = true;
  return cached;
}

export function getAutoScrollPrefSync(): boolean {
  return cached;
}

export function isAutoScrollPrefLoaded(): boolean {
  return loaded;
}

export async function setAutoScrollPref(enabled: boolean): Promise<void> {
  cached = enabled;
  loaded = true;
  try { await AsyncStorage.setItem(AUTOSCROLL_STORAGE_KEY, String(enabled)); } catch {}
  listeners.forEach((l) => { try { l(enabled); } catch {} });
}

export function subscribeAutoScrollPref(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
