/**
 * komalAudioService — Audio-only LiveKit connection for Komal seat guests.
 * Separate module from soloLiveKitService to avoid state conflicts.
 */
import { Platform } from 'react-native';

interface LKBundle { rnSdk: any; client: any }
let LKSdk: LKBundle | null = null;

function loadSdk(): LKBundle | null {
  if (LKSdk) return LKSdk;
  if (Platform.OS === 'web') return null;
  try {
    const rnSdk = require('@livekit/react-native');
    if (!rnSdk?.registerGlobals) return null;
    try { rnSdk.registerGlobals(); } catch { }
    try { const d = require('debug'); if (d?.disable) d.disable(); } catch { }
    const client = require('livekit-client');
    if (!client?.Room) return null;
    try {
      if (client.setLogLevel && client.LogLevel) client.setLogLevel(client.LogLevel.error);
    } catch { }
    LKSdk = { rnSdk, client };
    return LKSdk;
  } catch {
    return null;
  }
}

let komalRoom: any = null;
let komalMicMuted = false;

export function isKomalConnected(): boolean { return !!komalRoom; }
export function isKomalMicMuted(): boolean { return komalMicMuted; }

export async function connectKomalAudio(
  url: string,
  token: string,
  onRemoteVideoTrack?: (track: any | null) => void,
  onDisconnect?: () => void,
): Promise<boolean> {
  if (!url || !token) return false;
  const bundle = loadSdk();
  if (!bundle) {
    console.warn('[komalLK] SDK tidak tersedia');
    return false;
  }

  if (komalRoom) {
    try { await komalRoom.disconnect(); } catch { }
    komalRoom = null;
  }

  try {
    const { Room, RoomEvent, Track } = bundle.client;
    const room = new Room({ adaptiveStream: true, dynacast: true });

    room.on(RoomEvent.Disconnected, (reason: any) => {
      const ok = reason === 4 || reason === 'CLIENT_INITIATED';
      if (!ok) onDisconnect?.();
    });

    // Subscribe to remote video (host video) + other audio
    room.on(RoomEvent.TrackSubscribed, (track: any) => {
      if (track.kind === Track.Kind.Video) {
        onRemoteVideoTrack?.(track);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (track.kind === Track.Kind.Video) onRemoteVideoTrack?.(null);
    });

    // Audio session
    try {
      const AS = bundle.rnSdk?.AudioSession;
      if (AS) {
        if (Platform.OS === 'ios') {
          if (typeof AS.setIOSAudioConfiguration === 'function') {
            await AS.setIOSAudioConfiguration({
              iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
              iosCategory:        'playAndRecord',
              iosMode:            'videoChat',
              defaultToSpeaker:   true,
            });
          }
        }
        await AS.startAudioSession();
        if (Platform.OS === 'android') {
          if (typeof AS.setAndroidAudioConfiguration === 'function') {
            await AS.setAndroidAudioConfiguration({
              audioMode:          'inCommunication',
              audioFocusMode:     'gain',
              defaultToSpeaker:   true,
              preferSpeakerphone: true,
            });
          }
        }
      }
    } catch { /* non-fatal */ }

    await room.connect(url, token, { autoSubscribe: true });
    komalRoom = room;
    komalMicMuted = false;
    console.log('[komalLK] ✅ Connected, publishing mic');

    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (pubErr) {
      console.warn('[komalLK] mic publish error:', pubErr);
    }

    return true;
  } catch (err) {
    console.warn('[komalLK] connect error:', err);
    return false;
  }
}

export async function muteKomalAudio(): Promise<void> {
  if (!komalRoom) return;
  try {
    await komalRoom.localParticipant.setMicrophoneEnabled(false);
    komalMicMuted = true;
    console.log('[komalLK] 🔇 Mic muted');
  } catch { }
}

export async function unmuteKomalAudio(): Promise<void> {
  if (!komalRoom) return;
  try {
    await komalRoom.localParticipant.setMicrophoneEnabled(true);
    komalMicMuted = false;
    console.log('[komalLK] 🔊 Mic unmuted');
  } catch { }
}

export async function disconnectKomalAudio(): Promise<void> {
  const room = komalRoom;
  komalRoom = null;
  komalMicMuted = false;
  try { await room?.disconnect(); } catch { }
  try {
    const bundle = loadSdk();
    if (bundle?.rnSdk?.AudioSession?.stopAudioSession) {
      await bundle.rnSdk.AudioSession.stopAudioSession();
    }
  } catch { }
  console.log('[komalLK] 👋 Disconnected');
}
