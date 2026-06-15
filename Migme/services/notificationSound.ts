/**
 * notificationSound.ts
 *
 * Centralized sound & haptic feedback for all incoming notifications.
 * - Web     : AudioContext synthetic beep (no network needed)
 * - Native  : bundled local MP3 via expo-av (no network dependency)
 *             falls back to expo-haptics if audio unavailable
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_KEY = 'mig_sound_enabled';

export async function isSoundEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(SOUND_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

export async function setSoundEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false');
}

// ── Web: AudioContext synthetic tones ────────────────────────────────────────

type SoundType = 'default' | 'success' | 'error';

function playWebBeep(type: SoundType = 'default'): void {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx  = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    if (type === 'success') {
      // Short ascending ding-ding
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'error') {
      // Low descending tone
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Default: descending ding
      osc.frequency.setValueAtTime(960, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }

    setTimeout(() => { try { ctx.close(); } catch {} }, 700);
  } catch {}
}

// ── Native: local bundled MP3 via expo-av ────────────────────────────────────

// Caches the last loaded sound object to avoid re-creating every time
let _soundObj: any = null;

async function playNativeHaptic(): Promise<void> {
  try {
    const Haptics = require('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

async function playNativeSound(): Promise<void> {
  try {
    const { Audio } = require('expo-av');
    // NOTE: Do NOT call setAudioModeAsync here.
    // Calling it overrides LiveKit's audio session (which correctly routes to
    // headset/BT when connected). Without setAudioModeAsync the sound plays
    // through whatever route is already active — which is exactly what we want
    // inside a party room.

    // Unload previous sound if still around
    if (_soundObj) {
      try { await _soundObj.unloadAsync(); } catch {}
      _soundObj = null;
    }

    // Local bundled asset — works offline, no network request
    const { sound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../assets/sounds/notification.mp3'),
      { shouldPlay: true, volume: 0.85 },
    );
    _soundObj = sound;

    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        _soundObj = null;
      }
    });
  } catch {
    // expo-av not available (e.g. Expo Go without native module) → haptic fallback
    await playNativeHaptic();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Play a notification sound/beep. type: 'default' | 'success' | 'error' */
export async function playNotificationSound(type: SoundType = 'default'): Promise<void> {
  const enabled = await isSoundEnabled();
  if (!enabled) return;

  if (Platform.OS === 'web') {
    playWebBeep(type);
  } else {
    await playNativeSound(); // native: same bundled file for all types
  }
}
