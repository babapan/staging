/**
 * partyService.ts
 *
 * Service khusus untuk Live Party — terpisah total dari classic chatroom.
 * Audio via LiveKit SDK (react-native-livekit).
 *
 * Graceful degrade: kalau LiveKit native SDK tidak bisa di-load
 * (Expo Go / web), app tetap jalan tanpa audio.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { API_BASE } from '../config/connection';
import { getAuthToken } from './storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PartySeat {
  seat_index: number;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_muted: boolean;
  is_hand_raised: boolean;
  livekit_identity: string | null;
  joined_at: string | null;
  diamond_balance?: number;
  seat_diamonds?: number;
  seat_coins?: number;
}

export interface PartyRoomState {
  maxSeats?: number;
  roomId: string;
  seats: PartySeat[];
  lockedSeats?: number[];
  backgroundImage?: string | null;
}

export interface LiveKitTokenInfo {
  token: string;
  url: string;
  provider: 'cloud' | 'selfhosted';
  roomName: string;
  identity: string;
  role: 'publisher' | 'audience';
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: 'include',
  });
}

// ─── Party Room API ───────────────────────────────────────────────────────────

function normalizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE.replace(/\/$/, '');
  const path = /\/api\/imageserver\/image\/[^/]+$/.test(url) ? url + '/data' : url;
  return `${base}${path}`;
}

export async function fetchPartyRooms(): Promise<any[]> {
  try {
    const res = await authedFetch('/api/party/rooms');
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.rooms)) return [];
    return data.rooms.map((r: any) => ({
      ...r,
      creatorAvatar: normalizeAvatarUrl(r.creatorAvatar),
    }));
  } catch {
    return [];
  }
}

export async function createPartyRoom(payload: {
  name: string;
  description?: string;
  color?: string;
}): Promise<{ ok: boolean; room?: any; error?: string }> {
  try {
    const res = await authedFetch('/api/party/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, room: data.room };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function fetchPartyRoom(roomId: string): Promise<any | null> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.room ?? null;
  } catch {
    return null;
  }
}

export async function setPartyRoomLock(
  roomId: string,
  password: string | null,
): Promise<{ ok: boolean; isLocked?: boolean; error?: string }> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/lock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, isLocked: data.isLocked };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function setPartySeatCount(roomId: string, count: number): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/seat-count`, {
      method: 'PATCH',
      body: JSON.stringify({ count }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updatePartySeatMode(roomId: string, freeSeat: boolean): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/seat-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ freeSeat }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updatePartyRoom(
  roomId: string,
  payload: { name?: string; description?: string; backgroundImage?: string | null },
): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadPartyBackground(
  roomId: string,
  base64Data: string,
  mimeType: string,
): Promise<{ ok: boolean; backgroundImage?: string; error?: string }> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/upload-background`, {
      method: 'POST',
      body: JSON.stringify({ base64Data, mimeType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, backgroundImage: data.backgroundImage };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function deletePartyRoom(roomId: string): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPartyState(roomId: string): Promise<PartyRoomState | null> {
  const safeId = (roomId || '').trim();
  if (!safeId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/party/rooms/${encodeURIComponent(safeId)}/state`);
    if (!res.ok) return null;
    return (await res.json()) as PartyRoomState;
  } catch (err) {
    console.warn('[party] state fetch failed:', err);
    return null;
  }
}

export async function fetchLiveKitToken(
  roomId: string,
  role: 'publisher' | 'audience' = 'audience',
  password?: string,
): Promise<LiveKitTokenInfo | null> {
  try {
    const body: Record<string, any> = { role };
    if (password) body.password = password;
    const res = await authedFetch(`/api/party/rooms/${encodeURIComponent(roomId)}/token`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[party] token fetch failed:', data?.error || res.status);
      return null;
    }
    return (await res.json()) as LiveKitTokenInfo;
  } catch (err) {
    console.warn('[party] token fetch error:', err);
    return null;
  }
}

export async function takePartySeat(
  roomId: string,
  seatIndex: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/seats/${seatIndex}/take`,
      { method: 'POST' },
    );
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function leavePartySeat(
  roomId: string,
  seatIndex: number,
): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/seats/${seatIndex}/leave`,
      { method: 'POST' },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function mutePartySeat(
  roomId: string,
  seatIndex: number,
  muted: boolean,
): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/seats/${seatIndex}/mute`,
      { method: 'POST', body: JSON.stringify({ muted }) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Mic permission ──────────────────────────────────────────────────────────

export async function ensurePartyMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (has) return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Izin Mikrofon',
        message: 'Live Party butuh mikrofon supaya kamu bisa ngomong di kursi.',
        buttonPositive: 'Izinkan',
        buttonNegative: 'Tolak',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[party] mic permission error:', err);
    return false;
  }
}

// ─── LiveKit SDK wrapper ──────────────────────────────────────────────────────
//
// @livekit/react-native  → native module (registerGlobals, AudioSession)
// livekit-client         → Room, RoomEvent, Track, createLocalAudioTrack
//
// Keduanya harus tersedia. Kalau salah satu gagal (Expo Go / web),
// audio tidak aktif tapi app tetap jalan (gracefully degrade).

let livekitRoom: any = null;
let livekitReady     = false;
let localAudioTrack: any = null;
let isPublishing     = false;   // true kalau kita sedang jadi publisher (duduk di kursi)

interface LiveKitSDKBundle {
  rnSdk: any;       // @livekit/react-native
  client: any;      // livekit-client
}

let LiveKitSDK: LiveKitSDKBundle | null = null;

function loadLiveKitSdk(): LiveKitSDKBundle | null {
  if (LiveKitSDK) return LiveKitSDK;
  if (Platform.OS === 'web') return null;

  let rnSdk: any = null;
  let client: any = null;

  // 1️⃣ Load native module (@livekit/react-native)
  try {
    rnSdk = require('@livekit/react-native');
  } catch (err) {
    console.warn('[party] @livekit/react-native tidak bisa di-load:', err);
    return null;
  }

  if (!rnSdk || typeof rnSdk.registerGlobals !== 'function') {
    console.warn('[party] @livekit/react-native tidak valid — native module belum siap.');
    return null;
  }

  // 1b️⃣ Patch global WebRTC objects untuk React Native — WAJIB sebelum livekit-client dipakai.
  //     Tanpa ini, livekit-client masih pakai browser WebSocket/RTCPeerConnection yang
  //     tidak ada di RN → "Cannot read property 'Closing' of undefined".
  try {
    rnSdk.registerGlobals();
    console.log('[party] registerGlobals() called — WebRTC patched for RN');
  } catch (rgErr) {
    console.warn('[party] registerGlobals() error (non-fatal):', rgErr);
  }

  // 1c️⃣ Matikan verbose log dari react-native-webrtc (rn-webrtc:pc:DEBUG, dll).
  //     react-native-webrtc pakai npm package `debug` dengan namespace rn-webrtc:*.
  //     Tanpa ini, SDP / ICE candidates / fingerprint dicetak mentah di Metro.
  try {
    const dbg = require('debug');
    if (dbg && typeof dbg.disable === 'function') {
      // Disable semua namespace debug — aman di production RN
      dbg.disable();
    }
  } catch { /* non-fatal — debug package mungkin tidak tersedia */ }

  // 2️⃣ Load JS SDK (livekit-client) — Room, RoomEvent, Track ada di sini
  try {
    client = require('livekit-client');
  } catch (err) {
    console.warn('[party] livekit-client tidak bisa di-load:', err);
    return null;
  }

  if (!client || typeof client.Room !== 'function') {
    console.warn('[party] livekit-client tidak valid — Room bukan function.');
    return null;
  }

  // Matikan log DEBUG + WARN livekit-client (SDP munging, ICE candidates, dll) —
  // terlalu verbose dan mengekspos IP/session-key di Metro console.
  // Hanya tampilkan level error ke atas agar WARN "not able to set offer" juga hilang.
  try {
    if (typeof client.setLogLevel === 'function' && client.LogLevel) {
      client.setLogLevel(client.LogLevel.error);
    }
  } catch { /* non-fatal */ }

  console.log('[party] ✅ LiveKit SDK loaded (rnSdk + livekit-client)');
  LiveKitSDK = { rnSdk, client };
  return LiveKitSDK;
}

export async function connectLiveKitRoom(
  url: string,
  token: string,
  asPublisher: boolean,
  onUnexpectedDisconnect?: () => void,
): Promise<boolean> {
  if (!url || !token) {
    console.warn('[party] connectLiveKit: url atau token kosong');
    return false;
  }
  const bundle = loadLiveKitSdk();
  if (!bundle) return false;

  // Aktifkan AudioSession — wajib di @livekit/react-native.
  //
  // URUTAN PENTING (khusus Samsung & Android OEM):
  //   1. startAudioSession() dulu — inisialisasi audio focus
  //   2. setAndroidAudioConfiguration() SETELAH start — Samsung sering reset
  //      routing ke speaker saat session dimulai, jadi konfigurasi ulang setelahnya
  //   3. Re-apply setelah 300ms — beberapa Samsung model butuh delay
  //
  // defaultToSpeaker: false → routing ke headset wired/BT kalau terpasang,
  //                           bukan ke loudspeaker
  try {
    if (bundle.rnSdk?.AudioSession) {
      const AudioSession = bundle.rnSdk.AudioSession;

      if (Platform.OS === 'ios') {
        // iOS: konfigurasi SEBELUM start (perilaku normal iOS)
        try {
          if (typeof AudioSession.setIOSAudioConfiguration === 'function') {
            await AudioSession.setIOSAudioConfiguration({
              iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
              iosCategory:        'playAndRecord',
              iosMode:            'default',
              defaultToSpeaker:   false,
            });
          }
        } catch (cfgErr) {
          console.warn('[party] setIOSAudioConfiguration error (non-fatal):', cfgErr);
        }
      }

      // Start session (Android & iOS)
      await AudioSession.startAudioSession();
      console.log('[party] AudioSession started');

      if (Platform.OS === 'android') {
        // Android: konfigurasi SETELAH start — fix Samsung routing ke speaker
        const applyAndroidRouting = async () => {
          try {
            if (typeof AudioSession.setAndroidAudioConfiguration === 'function') {
              await AudioSession.setAndroidAudioConfiguration({
                audioMode:          'inCommunication',
                audioFocusMode:     'gain',
                defaultToSpeaker:   false,  // jangan paksa loudspeaker
                preferSpeakerphone: false,  // pakai headset kalau terpasang
              });
              console.log('[party] Android audio routing applied (headset mode)');
            }
          } catch (cfgErr) {
            console.warn('[party] setAndroidAudioConfiguration error (non-fatal):', cfgErr);
          }
        };

        // Apply langsung
        await applyAndroidRouting();

        // Re-apply setelah 300ms — fix Samsung yang reset routing saat session start
        setTimeout(applyAndroidRouting, 300);
      }
    }
  } catch (asErr) {
    console.warn('[party] AudioSession.startAudioSession error (non-fatal):', asErr);
  }

  try {
    // Room, RoomEvent, Track, createLocalAudioTrack → livekit-client
    const { Room, RoomEvent, createLocalAudioTrack } = bundle.client;

    // Disconnect room lama kalau masih ada
    if (livekitRoom) {
      try { await livekitRoom.disconnect(); } catch { }
      livekitRoom = null;
      localAudioTrack = null;
    }

    // Helper re-apply routing — dipanggil setiap kali LiveKit mereset audio session.
    // Samsung mereset ke speaker saat: connect, TrackSubscribed, publishTrack.
    const reapplyAndroidRouting = async () => {
      if (Platform.OS !== 'android') return;
      try {
        const AudioSession = bundle.rnSdk?.AudioSession;
        if (AudioSession && typeof AudioSession.setAndroidAudioConfiguration === 'function') {
          await AudioSession.setAndroidAudioConfiguration({
            audioMode:          'inCommunication',
            audioFocusMode:     'gain',
            defaultToSpeaker:   false,
            preferSpeakerphone: false,
          });
        }
      } catch { /* non-fatal */ }
    };

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      reconnectPolicy: {
        nextRetryDelayInMs: (context: any) => {
          // Retry agresif sampai 10x, lalu setiap 5 detik
          if (context.retryCount < 10) return 1000 + context.retryCount * 500;
          return 5000;
        },
      },
    });

    room.on(RoomEvent.Connected, () => {
      console.log('[party] ✅ LiveKit CONNECTED room=' + room.name);
      // Re-apply setelah connect — Samsung reset routing saat session etablished
      reapplyAndroidRouting();
      setTimeout(reapplyAndroidRouting, 300);
    });
    room.on(RoomEvent.Reconnecting, () => {
      console.log('[party] 🔄 LiveKit RECONNECTING...');
    });
    room.on(RoomEvent.Reconnected, async () => {
      console.log('[party] ✅ LiveKit RECONNECTED — re-publishing mic if needed');
      livekitReady = true;
      reapplyAndroidRouting();
      setTimeout(reapplyAndroidRouting, 300);

      // Re-publish mic jika kita adalah publisher dan tidak di-mute user
      if (isPublishing) {
        try {
          // Cek apakah mic track masih ada dan dipublish
          const micPub = room.localParticipant.getTrackPublication
            ? (room.localParticipant as any).getTrackPublication?.('audio')
              ?? (room.localParticipant as any).audioTrackPublications?.values().next().value
            : null;

          if (!micPub || micPub.isMuted === true) {
            // Tidak ada track atau di-mute OS — re-enable
            await room.localParticipant.setMicrophoneEnabled(true);
            console.log('[party] 🎤 Mic re-enabled after reconnect');
          }

          if (localAudioTrack) {
            await localAudioTrack.unmute().catch(() => {});
          }

          // Re-apply audio session setelah reconnect
          const AudioSession = bundle.rnSdk?.AudioSession;
          if (AudioSession) {
            await AudioSession.startAudioSession();
            if (Platform.OS === 'android') {
              if (typeof AudioSession.setAndroidAudioConfiguration === 'function') {
                await AudioSession.setAndroidAudioConfiguration({
                  audioMode:          'inCommunication',
                  audioFocusMode:     'gain',
                  defaultToSpeaker:   false,
                  preferSpeakerphone: false,
                });
              }
            } else if (Platform.OS === 'ios') {
              if (typeof AudioSession.setIOSAudioConfiguration === 'function') {
                await AudioSession.setIOSAudioConfiguration({
                  iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
                  iosCategory:        'playAndRecord',
                  iosMode:            'default',
                  defaultToSpeaker:   false,
                });
              }
            }
          }
        } catch (reconnectMicErr) {
          console.warn('[party] Reconnect mic re-publish error (non-fatal):', reconnectMicErr);
        }
      }
    });
    room.on(RoomEvent.Disconnected, (reason: any) => {
      console.log('[party] 👋 LiveKit DISCONNECTED reason=' + reason);
      livekitReady = false;
      // CLIENT_INITIATED = 4 (enum value) atau string 'CLIENT_INITIATED' — disconnect disengaja
      // Selain itu (network drop, server shutdown, dll) → beritahu modal untuk reconnect
      const isIntentional = reason === 4 || reason === 'CLIENT_INITIATED';
      if (!isIntentional && typeof onUnexpectedDisconnect === 'function') {
        onUnexpectedDisconnect();
      }
    });
    room.on(RoomEvent.ParticipantConnected, (p: any) => {
      console.log('[party] 🟢 PARTICIPANT_JOINED identity=' + p.identity);
    });
    room.on(RoomEvent.ParticipantDisconnected, (p: any) => {
      console.log('[party] 🔴 PARTICIPANT_LEFT identity=' + p.identity);
    });
    room.on(RoomEvent.TrackSubscribed, (_track: any, pub: any, p: any) => {
      console.log('[party] 🔊 TRACK_SUBSCRIBED participant=' + p.identity);
      // Re-apply saat remote audio track masuk — ini titik utama Samsung reset ke speaker
      reapplyAndroidRouting();
      setTimeout(reapplyAndroidRouting, 300);
    });

    await room.connect(url, token, {
      autoSubscribe: true,
    });

    livekitRoom = room;
    livekitReady = true;

    isPublishing = asPublisher;

    if (asPublisher) {
      try {
        localAudioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        });
        await room.localParticipant.publishTrack(localAudioTrack);
        console.log('[party] 🎤 Local audio published');
        // Re-apply setelah publish mic — Samsung juga reset saat local track diterbitkan
        await reapplyAndroidRouting();
        setTimeout(reapplyAndroidRouting, 300);
      } catch (pubErr) {
        console.warn('[party] Failed to publish audio track:', pubErr);
      }
    }

    return true;
  } catch (err) {
    console.warn('[party] connectLiveKitRoom error:', err);
    livekitReady = false;
    return false;
  }
}

/**
 * restorePartyAudioSession
 *
 * Re-applies LiveKit's audio routing after expo-av plays a sound (notification,
 * gift, music). expo-av's setAudioModeAsync overrides LiveKit's audio session
 * which causes voice audio to jump to loudspeaker even when a headset is connected.
 *
 * Call this after any expo-av playback starts inside a party room.
 */
export async function restorePartyAudioSession(): Promise<void> {
  const bundle = loadLiveKitSdk();
  if (!bundle?.rnSdk?.AudioSession) return;
  const AudioSession = bundle.rnSdk.AudioSession;
  try {
    if (Platform.OS === 'android') {
      if (typeof AudioSession.setAndroidAudioConfiguration === 'function') {
        await AudioSession.setAndroidAudioConfiguration({
          audioMode:          'inCommunication',
          audioFocusMode:     'gain',
          defaultToSpeaker:   false,
          preferSpeakerphone: false,
        });
      }
    } else if (Platform.OS === 'ios') {
      if (typeof AudioSession.setIOSAudioConfiguration === 'function') {
        await AudioSession.setIOSAudioConfiguration({
          iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
          iosCategory:        'playAndRecord',
          iosMode:            'default',
          defaultToSpeaker:   false,
        });
      }
    }
  } catch { /* non-fatal */ }
}

export async function disconnectLiveKitRoom(): Promise<void> {
  isPublishing = false;
  try {
    if (localAudioTrack) {
      try { localAudioTrack.stop(); } catch { }
      localAudioTrack = null;
    }
    if (livekitRoom) {
      try { await livekitRoom.disconnect(); } catch { }
      livekitRoom = null;
    }
  } catch {
    /* ignore */
  }
  livekitReady = false;

  // Stop AudioSession setelah disconnect
  try {
    const bundle = LiveKitSDK;
    if (bundle?.rnSdk?.AudioSession) {
      await bundle.rnSdk.AudioSession.stopAudioSession();
    }
  } catch {
    /* ignore */
  }
}

/**
 * reactivatePartyAudioSession
 *
 * Dipanggil setiap kali app kembali ke foreground (AppState → 'active')
 * saat pengguna sedang ada di party room.
 *
 * OS (Android/iOS) bisa menginterupsi audio focus saat app ke background:
 *   - Android: AUDIOFOCUS_LOSS mematikan mic recording
 *   - iOS: AVAudioSession interruption menghentikan audio session
 *
 * Fungsi ini:
 *   1. Re-start AudioSession untuk merebut kembali audio focus dari OS
 *   2. Re-apply konfigurasi routing (headset/speaker)
 *   3. Jika kita publisher (duduk di kursi) dan TIDAK di-mute oleh user,
 *      aktifkan kembali mic track supaya pengguna lain bisa kembali mendengar
 *
 * @param userIsMuted  true kalau user sendiri yang mute (bukan OS)
 */
export async function reactivatePartyAudioSession(userIsMuted: boolean): Promise<void> {
  const bundle = loadLiveKitSdk();
  if (!bundle?.rnSdk?.AudioSession) return;
  // Tetap jalankan re-start AudioSession meski livekitReady=false (sedang reconnect)
  // agar audio focus kembali dipegang saat LiveKit selesai reconnect.
  // Hanya skip jika tidak ada room sama sekali.
  if (!livekitRoom) return;

  const AudioSession = bundle.rnSdk.AudioSession;

  try {
    // 1️⃣ Re-start audio session — merebut kembali audio focus yang diambil OS
    await AudioSession.startAudioSession();
    console.log('[party] 🔄 AudioSession re-started after foreground');

    // 2️⃣ Re-apply routing platform setelah session start
    if (Platform.OS === 'android') {
      if (typeof AudioSession.setAndroidAudioConfiguration === 'function') {
        await AudioSession.setAndroidAudioConfiguration({
          audioMode:          'inCommunication',
          audioFocusMode:     'gain',
          defaultToSpeaker:   false,
          preferSpeakerphone: false,
        });
        // Samsung kadang butuh delay
        setTimeout(async () => {
          try {
            await AudioSession.setAndroidAudioConfiguration({
              audioMode:          'inCommunication',
              audioFocusMode:     'gain',
              defaultToSpeaker:   false,
              preferSpeakerphone: false,
            });
          } catch { /* non-fatal */ }
        }, 300);
      }
    } else if (Platform.OS === 'ios') {
      if (typeof AudioSession.setIOSAudioConfiguration === 'function') {
        await AudioSession.setIOSAudioConfiguration({
          iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
          iosCategory:        'playAndRecord',
          iosMode:            'default',
          defaultToSpeaker:   false,
        });
      }
    }

    // 3️⃣ Jika publisher (duduk di kursi) dan user tidak mute sendiri,
    //    paksa re-enable mic — OS mungkin sudah mematikan track saat background
    if (isPublishing && !userIsMuted) {
      try {
        // Re-enable via localParticipant (LiveKit level)
        await livekitRoom.localParticipant.setMicrophoneEnabled(true);
        console.log('[party] 🎤 Mic re-enabled after foreground restore');

        // Jika localAudioTrack masih ada, pastikan tidak di-mute
        if (localAudioTrack) {
          await localAudioTrack.unmute();
        }
      } catch (micErr) {
        console.warn('[party] reactivate mic error (non-fatal):', micErr);
      }
    }
  } catch (err) {
    console.warn('[party] reactivatePartyAudioSession error (non-fatal):', err);
  }
}

/**
 * handlePartyAppBackground
 *
 * Dipanggil saat app masuk ke background (AppState → 'background'/'inactive').
 * Memastikan audio session tetap aktif di background agar LiveKit tidak
 * kehilangan audio focus sebelum OS sempat menginterupsi.
 *
 * Pada Android, kita request audio focus mode 'gainTransientMayDuck' dahulu
 * sebelum OS mungkin mencabutnya — ini mempertahankan koneksi WebRTC mic.
 */
export async function handlePartyAppBackground(): Promise<void> {
  const bundle = loadLiveKitSdk();
  if (!bundle?.rnSdk?.AudioSession) return;
  if (!livekitRoom) return;

  const AudioSession = bundle.rnSdk.AudioSession;

  try {
    // Pastikan audio session masih aktif sebelum ke background
    await AudioSession.startAudioSession();

    if (Platform.OS === 'android') {
      if (typeof AudioSession.setAndroidAudioConfiguration === 'function') {
        // Gunakan 'gain' (bukan transient) agar kita tetap punya focus
        // saat app di background — WhatsApp message notification tidak
        // akan mencabut focus kita karena kita sudah hold 'gain'
        await AudioSession.setAndroidAudioConfiguration({
          audioMode:          'inCommunication',
          audioFocusMode:     'gain',
          defaultToSpeaker:   false,
          preferSpeakerphone: false,
        });
        console.log('[party] 🔇 Background: audio focus dipertahankan (gain)');
      }
    } else if (Platform.OS === 'ios') {
      if (typeof AudioSession.setIOSAudioConfiguration === 'function') {
        // iOS: mixWithOthers memungkinkan audio kita tetap berjalan
        // bersamaan dengan audio lain (notif WhatsApp, dll)
        await AudioSession.setIOSAudioConfiguration({
          iosCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers'],
          iosCategory:        'playAndRecord',
          iosMode:            'default',
          defaultToSpeaker:   false,
        });
        console.log('[party] 🔇 Background: iOS audio session dipertahankan');
      }
    }
  } catch (err) {
    console.warn('[party] handlePartyAppBackground error (non-fatal):', err);
  }
}

export async function muteLocalLiveKit(muted: boolean): Promise<void> {
  if (!livekitRoom || !livekitReady) return;
  try {
    if (localAudioTrack) {
      if (muted) {
        await localAudioTrack.mute();
      } else {
        await localAudioTrack.unmute();
      }
    }
    // Also set via localParticipant
    await livekitRoom.localParticipant.setMicrophoneEnabled(!muted);
  } catch (err) {
    console.warn('[party] muteLocalLiveKit error:', err);
  }
}

export function isLiveKitReady(): boolean {
  return livekitReady;
}

export function setRoomAudioMuted(muted: boolean): void {
  if (!livekitRoom) return;
  try {
    const participants = livekitRoom.remoteParticipants;
    if (!participants) return;
    participants.forEach((participant: any) => {
      try {
        const pubs = participant.audioTrackPublications ?? participant.getTrackPublications?.() ?? [];
        const pubValues = pubs instanceof Map ? Array.from(pubs.values()) : Array.isArray(pubs) ? pubs : [];
        pubValues.forEach((pub: any) => {
          if (pub?.track) {
            pub.track.setVolume?.(muted ? 0 : 1);
          }
        });
      } catch { /* non-fatal */ }
    });
    console.log(`[party] 🔇 Room audio ${muted ? 'MUTED' : 'UNMUTED'}`);
  } catch (err) {
    console.warn('[party] setRoomAudioMuted error:', err);
  }
}

export async function raisePartyHand(
  roomId: string,
  seatIndex: number,
  raised: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch(
      `/api/party/rooms/${encodeURIComponent(roomId)}/seats/${seatIndex}/raise-hand`,
      { method: 'POST', body: JSON.stringify({ raised }) },
    );
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

// ─── Audio Route Detection ────────────────────────────────────────────────────

export type AudioRouteType = 'headset' | 'speaker' | 'unknown';

/**
 * Deteksi audio output route saat ini via LiveKit AudioSession.
 * Mengembalikan 'headset' jika wired/BT terpasang & aktif,
 * 'speaker' jika output ke loudspeaker, atau 'unknown' jika tidak bisa
 * dideteksi (Expo Go / native module belum tersedia).
 */
export async function getAudioRoute(): Promise<AudioRouteType> {
  try {
    const bundle = loadLiveKitSdk();
    if (!bundle?.rnSdk?.AudioSession) return 'unknown';

    const AudioSession = bundle.rnSdk.AudioSession;
    if (typeof AudioSession.getDevices !== 'function') return 'unknown';

    const devices: any[] = await AudioSession.getDevices();
    if (!Array.isArray(devices) || devices.length === 0) return 'unknown';

    // Cari device yang sedang aktif/dipilih
    const active = devices.find((d: any) => d.selected || d.isDefault || d.isCurrent)
      ?? devices[0];

    const type: string = active?.type ?? active?.deviceType ?? '';
    const name: string = (active?.name ?? '').toLowerCase();

    const HEADSET_TYPES = [
      // iOS
      'bluetoothHFP', 'bluetoothLE', 'bluetoothA2DP',
      'headphones', 'headphonesBuiltIn', 'headsetMic',
      // Android
      'BLUETOOTH_HEADSET', 'WIRED_HEADSET', 'WIRED_HEADPHONES', 'BLUETOOTH_A2DP',
    ];
    const SPEAKER_TYPES = ['builtInSpeaker', 'SPEAKER_PHONE'];

    if (HEADSET_TYPES.includes(type) || name.includes('headset') || name.includes('bluetooth') || name.includes('headphone')) {
      return 'headset';
    }
    if (SPEAKER_TYPES.includes(type) || name.includes('speaker')) {
      return 'speaker';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Subscribe ke event ActiveSpeakersChanged dari LiveKit.
 * Callback dipanggil dengan array identity (= username) yang sedang berbicara.
 * Returns unsubscribe function — panggil saat cleanup.
 */
export function subscribeToSpeaking(cb: (identities: string[]) => void): () => void {
  const bundle = loadLiveKitSdk();
  if (!bundle || !livekitRoom) return () => {};
  const { RoomEvent } = bundle.client;

  const handler = (speakers: any[]) => {
    cb(speakers.map((p: any) => String(p.identity)));
  };

  livekitRoom.on(RoomEvent.ActiveSpeakersChanged, handler);
  return () => {
    try { livekitRoom?.off(RoomEvent.ActiveSpeakersChanged, handler); } catch { }
  };
}
