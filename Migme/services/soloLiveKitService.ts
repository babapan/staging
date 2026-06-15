/**
 * soloLiveKitService — LiveKit video+audio untuk Solo Live.
 * State modul terpisah dari partyService agar tidak konflik.
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

let soloRoom: any          = null;
let soloLocalVideoTrack: any = null;

export function getSoloLocalVideoTrack(): any { return soloLocalVideoTrack; }
export function getSoloRoom(): any { return soloRoom; }

export async function connectSoloLiveKit(
  url: string,
  token: string,
  asPublisher: boolean,
  onRemoteVideoTrack?: (track: any | null) => void,
  onLocalVideoTrack?: (track: any | null) => void,
  onDisconnect?: () => void,
): Promise<boolean> {
  if (!url || !token) return false;
  const bundle = loadSdk();
  if (!bundle) { console.warn('[soloLK] SDK tidak tersedia'); return false; }

  if (soloRoom) {
    try { await soloRoom.disconnect(); } catch { }
    soloRoom = null;
    soloLocalVideoTrack = null;
  }

  try {
    const { Room, RoomEvent, Track } = bundle.client;

    const room = new Room({ adaptiveStream: true, dynacast: true });

    room.on(RoomEvent.Disconnected, (reason: any) => {
      const ok = reason === 4 || reason === 'CLIENT_INITIATED';
      if (!ok) onDisconnect?.();
    });

    // Viewer: remote video track siap
    room.on(RoomEvent.TrackSubscribed, (track: any) => {
      if (track.kind === Track.Kind.Video) {
        console.log('[soloLK] 📹 Remote video subscribed');
        onRemoteVideoTrack?.(track);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (track.kind === Track.Kind.Video) onRemoteVideoTrack?.(null);
    });

    // Host: local track published → notify
    room.on(RoomEvent.LocalTrackPublished, (pub: any) => {
      if (pub.kind === Track.Kind.Video) {
        const t = pub.videoTrack ?? pub.track ?? null;
        soloLocalVideoTrack = t;
        console.log('[soloLK] 🎬 Local video published');
        onLocalVideoTrack?.(t);
      }
    });

    // ── Audio session ────────────────────────────────────────────────────────
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
    soloRoom = room;
    console.log('[soloLK] ✅ Connected room=' + room.name + ' asPublisher=' + asPublisher);

    if (asPublisher) {
      try {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        // Track mungkin langsung tersedia sebelum event LocalTrackPublished terpanggil
        const camPub = typeof room.localParticipant.getTrackPublication === 'function'
          ? room.localParticipant.getTrackPublication(Track.Source.Camera)
          : Array.from(
              (room.localParticipant.videoTrackPublications
                ?? room.localParticipant.trackPublications
                ?? new Map()
              ).values(),
            ).find((p: any) => p.kind === Track.Kind.Video);
        const t = camPub?.videoTrack ?? camPub?.track ?? null;
        if (t) {
          soloLocalVideoTrack = t;
          console.log('[soloLK] 🎬 Local video track ready immediately');
          onLocalVideoTrack?.(t);
        }
      } catch (pubErr) {
        console.warn('[soloLK] publish camera/mic error:', pubErr);
      }
    }

    return true;
  } catch (err) {
    console.warn('[soloLK] connect error:', err);
    return false;
  }
}

export async function setLocalMicEnabled(enabled: boolean): Promise<void> {
  try {
    await soloRoom?.localParticipant?.setMicrophoneEnabled(enabled);
  } catch { /* non-fatal */ }
}

export async function disconnectSoloLiveKit(): Promise<void> {
  const room = soloRoom;
  soloRoom = null;
  soloLocalVideoTrack = null;
  try { await room?.disconnect(); } catch { }
  try {
    const bundle = loadSdk();
    if (bundle?.rnSdk?.AudioSession?.stopAudioSession) {
      await bundle.rnSdk.AudioSession.stopAudioSession();
    }
  } catch { }
  console.log('[soloLK] 👋 Disconnected');
}
