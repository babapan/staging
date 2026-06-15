/**
 * PartyRoomModal.tsx
 *
 * Full-screen party room UI — bubble seat style.
 * Real-time chat via shared WebSocket gateway.
 * Audio via LiveKit (terpisah dari classic chatroom).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WS_URL } from '../config/connection';
import { API_BASE, buildHeaders } from '../services/auth';
import { getAuthToken, getSession } from '../services/storage';
import {
  fetchPartyState,
  fetchPartyRoom,
  fetchLiveKitToken,
  takePartySeat,
  leavePartySeat,
  mutePartySeat,
  ensurePartyMicPermission,
  connectLiveKitRoom,
  disconnectLiveKitRoom,
  muteLocalLiveKit,
  updatePartyRoom,
  uploadPartyBackground,
  deletePartyRoom,
  subscribeToSpeaking,
  raisePartyHand,
  updatePartySeatMode,
  setPartyRoomLock,
  restorePartyAudioSession,
  reactivatePartyAudioSession,
  handlePartyAppBackground,
  getAudioRoute,
  setRoomAudioMuted,
  type AudioRouteType,
} from '../services/partyService';
import PartyGiftModal from './PartyGiftModal';
import PartyLuckyBagModal from './PartyLuckyBagModal';
import PartyRoomSettingsSheet from './PartyRoomSettingsSheet';
import PartyRoomManagementSheet from './PartyRoomManagementSheet';
import PartyMemberManagementSheet from './PartyMemberManagementSheet';
import PartyLockPasswordModal from './PartyLockPasswordModal';
import PartyRoomModeModal from './PartyRoomModeModal';
import PartySeatActionSheet, { SeatActionTarget } from './PartySeatActionSheet';
import ViewProfileModal from './ViewProfileModal';
import PartyMusicPickerSheet, { MusicTrack } from './PartyMusicPickerSheet';
import AvatarWithFrame from './AvatarWithFrame';
import { Audio } from 'expo-av';
import { useVideoPlayerSafe, VideoViewSafe, VIDEO_SUPPORTED } from '../utils/videoPlayer';
import GiftWebmFullscreen from './GiftWebmFullscreen';
import LottieView from 'lottie-react-native';
import { WebView } from 'react-native-webview';
import PartyEntryEffect from './PartyEntryEffect';
import { getUserActiveEntryEffect, getActiveEntryEffect } from '../services/shopService';
import Slider from '@react-native-community/slider';

const PARTY_BG       = require('../assets/images/party_bg.jpg');
const LUXURY_BANNER  = require('../assets/images/luxury_banner.png');

const LOCAL_STICKER_SOURCES: Record<string, object> = {
  LMAO:  require('../assets/stickers/LMAO.json'),
  Money: require('../assets/stickers/Money.json'),
};
const LOCAL_STICKERS = [
  { id: 'LMAO',  label: 'LMAO'  },
  { id: 'Money', label: 'Money' },
];

const { width: SW, height: SH } = Dimensions.get('window');

const PARTY_PURPLE = '#7C3AED';
const PARTY_PINK   = '#EC4899';
const SEAT_BG      = 'rgba(255,255,255,0.12)';
const SEAT_BORDER  = 'rgba(255,255,255,0.25)';

// 4 kursi per baris, ukuran dibatasi maksimal 64px
// SEAT_GAP lebih besar supaya frame avatar tidak tumpang tindih antar kursi
const SEAT_COLS       = 4;
const SEAT_GAP        = 20;
const SEAT_H_PAD      = 14;
const SEAT_SIZE       = Math.min(64, Math.floor((SW - SEAT_H_PAD * 2 - SEAT_GAP * (SEAT_COLS - 1)) / SEAT_COLS));
// Ukuran frame = 1.45× avatar — dipakai untuk fixed-height wrap agar semua kursi rata
const SEAT_FRAME_SIZE = Math.round(SEAT_SIZE * 1.45);

const PING_MS      = 25_000;
const SEAT_POLL_MS = 4_000;

const SEAT_COLORS = [
  '#7C3AED','#A855F7','#EC4899','#F43F5E',
  '#F59E0B','#10B981','#3B82F6','#6366F1',
  '#14B8A6','#F97316','#8B5CF6','#06B6D4',
];

const CHAT_TABS = ['Semua','Obrolan','Hadiah'] as const;
type ChatTab = typeof CHAT_TABS[number];

type AudioStatus = 'idle' | 'connecting' | 'connected' | 'error';
type LiveKitProvider = 'cloud' | 'selfhosted' | null;

type Tier = { bg: string; border: string; text: string; glow: string };
function levelTier(lv: number): Tier {
  if (lv <= 0)   return { bg: '#374151', border: '#6B7280', text: '#9CA3AF', glow: '#6B7280' };
  if (lv <= 10)  return { bg: '#1D4ED8', border: '#3B82F6', text: '#BFDBFE', glow: '#3B82F6' };
  if (lv <= 20)  return { bg: '#065F46', border: '#10B981', text: '#A7F3D0', glow: '#10B981' };
  if (lv <= 30)  return { bg: '#78350F', border: '#F59E0B', text: '#FDE68A', glow: '#F59E0B' };
  if (lv <= 100) return { bg: '#7C2D12', border: '#F97316', text: '#FED7AA', glow: '#F97316' };
  if (lv <= 200) return { bg: '#831843', border: '#EC4899', text: '#FBCFE8', glow: '#EC4899' };
  return               { bg: '#7F1D1D', border: '#EF4444', text: '#FECACA', glow: '#EF4444' };
}

function LevelBadge({ level }: { level: number }) {
  const t = levelTier(level);
  return (
    <View style={[badgeStyles.pill, { backgroundColor: t.bg, borderColor: t.border, shadowColor: t.glow }]}>
      <Text style={[badgeStyles.bolt, { color: t.border }]}>⚡</Text>
      <Text style={[badgeStyles.num, { color: t.text }]}>{level}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 1,
    marginHorizontal: 3, gap: 1,
    elevation: 3, shadowOpacity: 0.7,
    shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  bolt: { fontSize: 9, lineHeight: 14 },
  num:  { fontSize: 10, fontWeight: '900', lineHeight: 14, letterSpacing: 0.3 },
});

function toColor(raw: string | undefined | null, fallback: string): string {
  if (!raw) return fallback;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function parseSystemText(text: string): { username: string; level: number; suffix: string } | null {
  const stripped = text.includes('::') ? text.replace(/^.+?::/, '') : text;
  const m = stripped.match(/^(.+?)(?:\[(\d+)\])?\s+(has (?:entered|left).*)$/);
  if (!m) return null;
  return { username: m[1].trim(), level: m[2] ? parseInt(m[2], 10) : 0, suffix: m[3] };
}

export interface PartyRoom {
  id: string;
  name: string;
  description: string | null;
  color: string;
  currentParticipants: number;
  maxParticipants: number;
  creatorUsername?: string | null;
  creatorAvatar?: string | null;
  isLocked?: boolean;
  totalCoins?: number;
  backgroundImage?: string | null;
}

// ── Background URL normalizer ──────────────────────────────────────────────────
// Uploaded backgrounds may be stored as relative paths (/uploads/...)
// when PUBLIC_API_URL is not set on the server. Prepend API_BASE in that case.
function normalizeBgUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith('/uploads/') || (uri.startsWith('/') && !uri.startsWith('//'))) {
    return `${(API_BASE ?? '').replace(/\/$/, '')}${uri}`;
  }
  return uri;
}

interface Seat {
  index: number;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  avatarFrameUrl?: string | null;
  isMuted?: boolean;
  isHandRaised?: boolean;
  diamonds?: number;
}

interface ChatMessage {
  id: string;
  username: string;
  displayName?: string | null;
  migLevel: number;
  text: string;
  color: string;
  isSystem: boolean;
  isGameWin?: boolean;
  gameWinData?: { gameName: string; gameEmoji: string; amount: number; slotEmoji: string; isGlobal?: boolean };
  isJackpot?: boolean;
  jackpotData?: JackpotData;
  ts: number;
  isHost?: boolean;
  avatarUrl?: string | null;
  agencyName?: string | null;
}

function AudioDot({ status }: { status: AudioStatus }) {
  const color =
    status === 'connected'  ? '#22C55E' :
    status === 'connecting' ? '#F59E0B' :
    status === 'error'      ? '#EF4444' : 'rgba(255,255,255,0.3)';
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginLeft: 4 }} />;
}

function ProviderBadge({ provider }: { provider: LiveKitProvider }) {
  if (!provider) return null;
  const isCloud = provider === 'cloud';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: isCloud ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.25)',
      borderRadius: 6, borderWidth: 1,
      borderColor: isCloud ? '#6366F1' : '#10B981',
      paddingHorizontal: 5, paddingVertical: 1, marginLeft: 5,
    }}>
      <Text style={{ fontSize: 8, fontWeight: '700', color: isCloud ? '#A5B4FC' : '#6EE7B7', letterSpacing: 0.3 }}>
        {isCloud ? '☁ Cloud' : '⚙ Self'}
      </Text>
    </View>
  );
}

function WsDot({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) {
  const c = status === 'connected' ? '#22C55E' : status === 'connecting' ? '#F59E0B' : '#EF4444';
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c, marginLeft: 6 }} />;
}

function AudioRouteBadge({ route }: { route: AudioRouteType }) {
  if (route === 'unknown') return null;
  const isHeadset = route === 'headset';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: isHeadset ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.18)',
      borderRadius: 6, borderWidth: 1,
      borderColor: isHeadset ? '#EAB308' : '#EF4444',
      paddingHorizontal: 5, paddingVertical: 1, marginLeft: 5,
    }}>
      <Text style={{ fontSize: 9, color: isHeadset ? '#FDE047' : '#FCA5A5', fontWeight: '700', letterSpacing: 0.2 }}>
        {isHeadset ? '🎧' : '🔊'}
      </Text>
    </View>
  );
}

// Avatar lingkaran — gunakan foto profil + frame jika tersedia
// ─── Gift Banner ──────────────────────────────────────────────────────────────
interface GiftBannerData {
  sender: string;
  senderAvatarUrl?: string | null;
  emoji: string;
  giftImageUrl?: string | null;
  qty: number;
  giftName: string;
  roomColor?: string;
  price?: number;
  unitPrice?: number;
  lottieUrl?: string | null;
  videoUrl?: string | null;
}

function GiftBanner({ banner, qty, exiting, onExited }: {
  banner: GiftBannerData; qty: number; exiting: boolean; onExited: () => void;
}) {
  const [bannerVideoErr, setBannerVideoErr] = useState(false);
  const bannerPlayer = useVideoPlayerSafe(
    banner.videoUrl ? { uri: banner.videoUrl } : null,
    (p: any) => {
      p.loop = true;
      p.muted = true;
      if (banner.videoUrl) p.play();
    },
  );

  useEffect(() => {
    if (!banner.videoUrl) return;
    const sub = bannerPlayer.addListener('statusChange', ({ status }: { status: string }) => {
      if (status === 'error') setBannerVideoErr(true);
    });
    return () => sub.remove();
  }, [bannerPlayer]);

  const slideX    = useRef(new Animated.Value(-SW)).current;
  const slideY    = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const qtyScale  = useRef(new Animated.Value(1)).current;
  const qtyColor  = useRef(new Animated.Value(0)).current;
  const isFirstQtyRender = useRef(true);
  const exitIdRef = useRef(0);

  // Slide in from left on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 90, friction: 13 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // Exit: slide UP + fade out
  useEffect(() => {
    if (!exiting) {
      exitIdRef.current++;
      Animated.parallel([
        Animated.spring(slideX,   { toValue: 0,  useNativeDriver: true, tension: 90, friction: 13 }),
        Animated.timing(slideY,   { toValue: 0,  duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1,  duration: 150, useNativeDriver: true }),
      ]).start();
      return;
    }
    const myId = ++exitIdRef.current;
    Animated.parallel([
      Animated.timing(slideY,   { toValue: -80, duration: 340, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0,   duration: 300, useNativeDriver: true }),
    ]).start(() => {
      if (exitIdRef.current === myId) {
        slideY.setValue(0);
        onExited();
      }
    });
  }, [exiting]);

  // Bounce + flash on qty increment (skip first render)
  useEffect(() => {
    if (isFirstQtyRender.current) { isFirstQtyRender.current = false; return; }
    Animated.sequence([
      Animated.parallel([
        Animated.spring(qtyScale, { toValue: 1.7, useNativeDriver: true, tension: 300, friction: 5 }),
        Animated.timing(qtyColor, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(qtyScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }),
        Animated.timing(qtyColor, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();
  }, [qty]);

  const color       = banner.roomColor ?? PARTY_PURPLE;
  const initials    = (banner.sender ?? '?').slice(0, 2).toUpperCase();
  const bgColor     = color + '55';
  const borderColor = color + 'AA';

  const qtyTextColor = qtyColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FCD34D', '#FFFFFF'],
  });

  return (
    <Animated.View style={[giftBannerSt.outerRow, { transform: [{ translateX: slideX }, { translateY: slideY }], opacity: fadeAnim }]}>
      {/* ── Left pill: avatar + sender name + "mengirim X" ── */}
      <View style={[giftBannerSt.pill, { backgroundColor: bgColor, borderColor, shadowColor: color }]}>
        <AvatarWithFrame
          size={34} displayPicture={banner.senderAvatarUrl}
          initial={initials} backgroundColor={color}
          style={{ borderRadius: 17 }}
        />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text style={giftBannerSt.senderName} numberOfLines={1}>{banner.sender}</Text>
          <Text style={giftBannerSt.subText} numberOfLines={1}>
            mengirim {banner.giftName || 'hadiah'}
          </Text>
        </View>
        {/* ── Gift visual — video > lottie > image > emoji hotkey ── */}
        {banner.videoUrl && !bannerVideoErr ? (
          <VideoViewSafe
            player={bannerPlayer}
            style={[giftBannerSt.giftLottie, { backgroundColor: 'transparent' }]}
            contentFit="contain"
            nativeControls={false}
          />
        ) : banner.lottieUrl ? (
          <LottieView
            source={{ uri: banner.lottieUrl }}
            autoPlay
            loop
            style={giftBannerSt.giftLottie}
          />
        ) : banner.giftImageUrl ? (
          <Image source={{ uri: banner.giftImageUrl }} style={giftBannerSt.giftImg} resizeMode="contain" />
        ) : (
          <Text style={giftBannerSt.emoji}>{banner.emoji}</Text>
        )}
      </View>

      {/* ── x{qty} counter — hanya tampil kalau qty > 1 ── */}
      {qty > 1 && (
        <Animated.Text style={[
          giftBannerSt.qty,
          { color: qtyTextColor, transform: [{ scale: qtyScale }] },
        ]}>
          x{qty}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

const giftBannerSt = StyleSheet.create({
  outerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingLeft: 5,
    paddingRight: 14,
    paddingVertical: 5,
    borderWidth: 1.2,
    elevation: 12,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    flex: 1,
  },
  senderName: {
    fontSize: 12, fontWeight: '700', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  subText: {
    fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  giftImg:    { width: 38, height: 38, borderRadius: 6 },
  giftLottie: { width: 46, height: 46 },
  emoji: { fontSize: 28 },
  qty: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#FCD34D',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

// ─── JackpotBanner (X3/X9/X99/X199 — masuk kanan, keluar kiri, marquee) ──────
interface JpBannerData {
  milestoneKey: string;
  label:        string;
  emoji:        string;
  winner:       string;
  reward:       number;
}

const JP_BANNER_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  'X199':  { bg: '#78350F', border: '#F59E0B', accent: '#FDE68A' },
  'X99':   { bg: '#3B0764', border: '#C084FC', accent: '#EDE9FE' },
  'X9':    { bg: '#1E1B4B', border: '#818CF8', accent: '#C7D2FE' },
  'X3':    { bg: '#713F12', border: '#FCD34D', accent: '#FEF3C7' },
  'X1_500':{ bg: '#064E3B', border: '#34D399', accent: '#D1FAE5' },
};

function JackpotBanner({ data, onDone }: { data: JpBannerData; onDone: () => void }) {
  const slideX   = useRef(new Animated.Value(SW + 20)).current;
  const marqueeX = useRef(new Animated.Value(SW * 0.6)).current;
  const glowOp   = useRef(new Animated.Value(0.6)).current;

  const c = JP_BANNER_COLORS[data.milestoneKey] ?? JP_BANNER_COLORS['X1_500'];
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString('id-ID');

  const marqueeText =
    `🏆 ${data.winner} menang ${data.label}!  +${fmt(data.reward)} coins  •  ` +
    `Kirim Lucky Gift untuk ikut serta!  •  Selamat pemenang!  ${data.emoji}  `;

  useEffect(() => {
    // 1. Slide banner masuk dari kanan
    Animated.spring(slideX, {
      toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
    }).start();

    // 2. Marquee: loop kanan → kiri
    Animated.loop(
      Animated.sequence([
        Animated.timing(marqueeX, {
          toValue: -(SW * 2.2), duration: 8500, useNativeDriver: true,
        }),
        Animated.timing(marqueeX, {
          toValue: SW * 0.6, duration: 0, useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOp, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(glowOp, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // 4. Setelah 8 detik, slide keluar ke kiri
    const exitTimer = setTimeout(() => {
      Animated.timing(slideX, {
        toValue: -(SW + 20), duration: 550, useNativeDriver: true,
      }).start(() => onDone());
    }, 8500);

    return () => clearTimeout(exitTimer);
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:  'absolute',
        top:       Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44,
        left:      0,
        right:     0,
        zIndex:    9998,
        transform: [{ translateX: slideX }],
      }}
    >
      {/* Glow border top */}
      <Animated.View style={{ height: 2, backgroundColor: c.border, opacity: glowOp }} />

      <View style={{
        backgroundColor: c.bg,
        flexDirection:   'row',
        alignItems:      'center',
        overflow:        'hidden',
        paddingVertical: 7,
        elevation:       16,
        shadowColor:     c.border,
        shadowOpacity:   0.7,
        shadowRadius:    12,
        shadowOffset:    { width: 0, height: 2 },
      }}>
        {/* Pill label kiri — tetap tidak bergerak */}
        <View style={{
          backgroundColor: c.border,
          paddingHorizontal: 10,
          paddingVertical:   4,
          marginLeft:        10,
          marginRight:       8,
          borderRadius:      6,
          alignItems:        'center',
          justifyContent:    'center',
        }}>
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 10, letterSpacing: 0.4 }}>
            {data.emoji} JACKPOT
          </Text>
        </View>

        {/* Marquee container — overflow:hidden memotong teks di luar box */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.Text
            numberOfLines={1}
            style={{
              color:      c.accent,
              fontWeight: '700',
              fontSize:   13,
              width:      SW * 4,
              transform:  [{ translateX: marqueeX }],
              textShadowColor:  'rgba(0,0,0,0.8)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
          >
            {marqueeText}
          </Animated.Text>
        </View>

        {/* Reward badge kanan */}
        <View style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          paddingHorizontal: 10,
          paddingVertical:   4,
          marginRight:       10,
          marginLeft:        6,
          borderRadius:      6,
          borderWidth:       1,
          borderColor:       c.border,
        }}>
          <Text style={{ color: c.border, fontWeight: '900', fontSize: 11 }}>
            +{fmt(data.reward)} 🪙
          </Text>
        </View>
      </View>

      {/* Glow border bottom */}
      <Animated.View style={{ height: 2, backgroundColor: c.border, opacity: glowOp }} />
    </Animated.View>
  );
}

// ─── LuxuryBroadcastBanner (slide masuk kiri → diam 4s → keluar kanan) ────────
interface LuxBannerData {
  senderDisplayName:    string;
  recipientDisplayName: string;
  giftName:             string;
  giftImageUrl?:        string;
  giftEmoji:            string;
}

function LuxuryBroadcastBanner({
  data,
  onDone,
  bannerTop,
}: {
  data:      LuxBannerData;
  onDone:    () => void;
  bannerTop: number;
}) {
  const slideX   = useRef(new Animated.Value(-(SW + 20))).current;
  const marqueeX = useRef(new Animated.Value(0)).current;

  const marqueeText =
    `✨ ${data.senderDisplayName}  sent  ${data.giftName} ${data.giftEmoji}  to  ${data.recipientDisplayName}  ✨  `;

  useEffect(() => {
    // 1. Slide in dari kiri
    Animated.timing(slideX, {
      toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      // 2. Mulai marquee setelah banner berhenti
      Animated.timing(marqueeX, {
        toValue: -(SW * 1.4), duration: 4200, easing: Easing.linear, useNativeDriver: true,
      }).start();
    });

    // 3. Setelah 5s total, slide keluar ke kanan
    const exitTimer = setTimeout(() => {
      Animated.timing(slideX, {
        toValue: SW + 20, duration: 430, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }).start(() => onDone());
    }, 5100);

    return () => clearTimeout(exitTimer);
  }, []);

  const BANNER_H = 62;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:  'absolute',
        top:       bannerTop,
        left:      0,
        right:     0,
        zIndex:    9997,
        transform: [{ translateX: slideX }],
      }}
    >
      <View style={{ width: SW, height: BANNER_H }}>
        {/* Banner image — stretched to fill */}
        <Image
          source={LUXURY_BANNER}
          style={{ position: 'absolute', width: SW, height: BANNER_H, resizeMode: 'stretch' }}
        />
        {/* Content — posisi di area biru banner (skip ornamen kiri ~22%) */}
        <View
          style={{
            position:      'absolute',
            left:          SW * 0.22,
            right:         SW * 0.03,
            top:           0,
            bottom:        0,
            flexDirection: 'row',
            alignItems:    'center',
            overflow:      'hidden',
          }}
        >
          {/* Gift thumbnail */}
          {data.giftImageUrl ? (
            <Image
              source={{ uri: data.giftImageUrl }}
              style={{ width: 38, height: 38, borderRadius: 8, marginRight: 7, flexShrink: 0 }}
            />
          ) : (
            <Text style={{ fontSize: 28, marginRight: 7, flexShrink: 0 }}>{data.giftEmoji}</Text>
          )}
          {/* Marquee — teks berjalan, dipotong di batas banner */}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.Text
              numberOfLines={1}
              style={{
                color:            '#FFF8E1',
                fontWeight:       '800',
                fontSize:         12,
                width:            SW * 4,
                transform:        [{ translateX: marqueeX }],
                textShadowColor:  'rgba(0,0,0,0.9)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
                letterSpacing:    0.3,
              }}
            >
              {marqueeText}
            </Animated.Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Gift Splash Overlay (fullscreen premium gift animation) ──────────────────
const SPARK_EMOJIS = ['✨', '⭐', '💫', '🌟', '✨', '💥', '🌟', '✨'];
const SPARK_COUNT  = 8;
const SPARK_RADIUS = 115;

// ─── JackpotSplashOverlay ─────────────────────────────────────────────────────
interface JackpotData {
  tier: string;
  tierEmoji: string;
  multiplier: number;
  milestone: number;
  milestoneKey?: string;
  counter: number;
  winner: string;
  winners?: string[];
  reward: number;
  giftPrice: number;
  giftName: string;
  giftEmoji: string;
  triggeredBy: string;
  isGlobal?: boolean;
  totalCoin?: number;
  queueIdx?: number;
  queueTotal?: number;
}

const JP_SPARK_COUNT  = 14;
const JP_SPARK_RADIUS = 145;
const JP_SPARK_EMOJIS = ['🌟','✨','💫','⭐','🎊','🎉','🍀','💎','🌟','✨','💫','⭐','🎊','🎉'];

function JackpotSplashOverlay({ data, onDone }: { data: JackpotData; onDone: () => void }) {
  const bgOpacity    = useRef(new Animated.Value(0)).current;
  const badgeScale   = useRef(new Animated.Value(0.2)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const winnerOp     = useRef(new Animated.Value(0)).current;
  const winnerY      = useRef(new Animated.Value(30)).current;
  const rewardOp     = useRef(new Animated.Value(0)).current;
  const rewardScale  = useRef(new Animated.Value(0.5)).current;
  const glowScale    = useRef(new Animated.Value(0.3)).current;
  const glowOp       = useRef(new Animated.Value(0)).current;

  const sparks = useRef(
    Array.from({ length: JP_SPARK_COUNT }, () => ({
      dist:    new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  const mk = data.milestoneKey ?? '';
  const isJackpotBesar = mk === 'X199' || mk === 'X99' || data.milestone >= 500;
  const accentColor    = mk === 'X199'   ? '#F59E0B'   // X199 — gold/jackpot
    : mk === 'X99'              ? '#A855F7'   // X99  — purple
    : mk === 'X9'               ? '#818CF8'   // X9   — indigo
    : mk === 'X3'               ? '#FCD34D'   // X3   — amber
    : mk === 'X1_500'           ? '#34D399'   // X1   — green
    : data.milestone >= 9000    ? '#C4B5FD'   // SUPER — violet (legacy)
    : data.milestone >= 500     ? '#F59E0B'   // 500x — gold (legacy)
    : data.milestone >= 300     ? '#A855F7'   // 300x — purple (legacy)
    : data.milestone >= 200     ? '#818CF8'   // 200x — indigo (legacy)
    : data.milestone >= 100     ? '#FCD34D'   // 100x — amber (legacy)
    : data.milestone >= 50      ? '#F97316'   // 50x  — orange (legacy)
    : data.milestone >= 20      ? '#60A5FA'   // 20x  — blue (legacy)
    :                             '#34D399';  // 10x  — green (legacy)

  useEffect(() => {
    const duration = isJackpotBesar ? 5500 : 3800;

    Animated.parallel([
      Animated.timing(bgOpacity,    { toValue: isJackpotBesar ? 0.82 : 0.7, duration: 250, useNativeDriver: true }),
      Animated.spring(badgeScale,   { toValue: 1, tension: 55, friction: 6, useNativeDriver: true }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(glowScale,    { toValue: 1.25, tension: 32, friction: 7, useNativeDriver: true }),
      Animated.timing(glowOp,       { toValue: 0.35, duration: 350, useNativeDriver: true }),
      ...sparks.map((p, i) =>
        Animated.sequence([
          Animated.delay(60 + i * 40),
          Animated.parallel([
            Animated.timing(p.dist,    { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(p.opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
              Animated.timing(p.opacity, { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
            ]),
          ]),
        ])
      ),
    ]).start();

    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(winnerOp,    { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(winnerY,     { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.spring(rewardScale, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
        Animated.timing(rewardOp,    { toValue: 1, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bgOpacity,    { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(badgeOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(winnerOp,     { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(rewardOp,     { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(glowOp,       { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start(() => onDone());
    }, duration);

    return () => clearTimeout(t);
  }, []);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Dark overlay */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: bgOpacity }]} />

      {/* Glow */}
      <Animated.View style={{
        position: 'absolute',
        width: SW * 0.75, height: SW * 0.75, borderRadius: SW * 0.375,
        backgroundColor: accentColor,
        transform: [{ scale: glowScale }],
        opacity: glowOp,
      }} />

      {/* Spark particles */}
      {sparks.map((p, i) => {
        const angle = (i / JP_SPARK_COUNT) * Math.PI * 2;
        const tx = p.dist.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * JP_SPARK_RADIUS] });
        const ty = p.dist.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * JP_SPARK_RADIUS] });
        return (
          <Animated.Text key={i} style={{ position: 'absolute', fontSize: 20, opacity: p.opacity, transform: [{ translateX: tx }, { translateY: ty }] }}>
            {JP_SPARK_EMOJIS[i % JP_SPARK_EMOJIS.length]}
          </Animated.Text>
        );
      })}

      {/* Badge tier */}
      <Animated.View style={{
        alignItems: 'center',
        transform: [{ scale: badgeScale }],
        opacity: badgeOpacity,
      }}>
        <Text style={{ fontSize: isJackpotBesar ? 72 : 60 }}>{data.tierEmoji}</Text>
        <View style={{
          marginTop: 8, paddingHorizontal: 22, paddingVertical: 7,
          borderRadius: 999, backgroundColor: accentColor,
          shadowColor: accentColor, shadowOpacity: 0.8, shadowRadius: 18, elevation: 12,
        }}>
          <Text style={{ fontSize: isJackpotBesar ? 22 : 17, fontWeight: '900', color: '#fff', letterSpacing: 1 }}>
            {data.tier.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
          {data.giftEmoji} {data.giftName} · #{data.counter}× sent
        </Text>
      </Animated.View>

      {/* Winner(s) */}
      <Animated.View style={{ alignItems: 'center', marginTop: 20, opacity: winnerOp, transform: [{ translateY: winnerY }] }}>
        {data.winners && data.winners.length > 1 ? (
          <>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              {data.winners.length} Lucky Winners
            </Text>
            {data.winners.map((w, i) => (
              <Text key={i} style={{ fontSize: 18, fontWeight: '900', color: '#fff', marginTop: 3,
                textShadowColor: accentColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 }}>
                🏆 {w}
              </Text>
            ))}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Lucky winner</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4,
              textShadowColor: accentColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 }}>
              🏆 {data.winner}
            </Text>
          </>
        )}
      </Animated.View>

      {/* Reward */}
      <Animated.View style={{
        marginTop: 18, paddingHorizontal: 28, paddingVertical: 10,
        borderRadius: 999, backgroundColor: '#1a1a2e', borderWidth: 2, borderColor: accentColor,
        transform: [{ scale: rewardScale }], opacity: rewardOp,
        shadowColor: accentColor, shadowOpacity: 0.6, shadowRadius: 12, elevation: 10,
      }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: accentColor }}>
          +{data.reward.toLocaleString()} 🪙 /person
        </Text>
      </Animated.View>

      {/* Triggered by */}
      <Animated.Text style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)', opacity: winnerOp }}>
        {data.isGlobal && data.queueIdx && data.queueTotal
          ? `🌐 Global JP · Pemenang ${data.queueIdx}/${data.queueTotal}`
          : data.isGlobal
          ? `🌐 Global JP · 1 Juta coin tercapai!`
          : (data.milestoneKey === 'X3' || data.milestoneKey === 'X9' || data.milestoneKey === 'X99' || data.milestoneKey === 'X199')
          ? `🏠 Room Jackpot · 50 Juta coin tercapai!`
          : `triggered by ${data.triggeredBy} · ${data.multiplier}× multiplier`}
      </Animated.Text>
    </View>
  );
}

// ─── LuckyTapButton ───────────────────────────────────────────────────────────
// Tombol bulat mengambang yang muncul setelah user kirim Lucky gift.
// Tap berulang = spam kirim Lucky gift langsung tanpa buka modal.
// Multiplier dikontrol oleh parent (optimistic — update instan tanpa roundtrip).
interface LuckyTapInfo {
  giftName:    string;
  giftEmoji:   string;
  giftImageUrl?: string | null;
  lottieUrl:   string | null;
  price:       number;
  recipient:   string;
  qty:         number;
  roomId:      string;
}

function LuckyTapButton({
  info, multiplier, balance, costPerTap, onTap, onDismiss,
}: {
  info: LuckyTapInfo; multiplier: number;
  balance: number | null; costPerTap: number;
  onTap: () => void; onDismiss: () => void;
}) {
  const scaleAnim    = useRef(new Animated.Value(0)).current;
  const tapScale     = useRef(new Animated.Value(1)).current;
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const badgeScale   = useRef(new Animated.Value(1)).current;
  const prevMult     = useRef(multiplier);
  // Balance flash: 0=normal, 1=white flash (on deduction)
  const balFlash     = useRef(new Animated.Value(0)).current;
  const prevBal      = useRef(balance);

  // Entry spring + pulse ring loop
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1.55, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,    duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Badge pop on multiplier increment
  useEffect(() => {
    if (multiplier !== prevMult.current) {
      prevMult.current = multiplier;
      badgeScale.setValue(1.7);
      Animated.spring(badgeScale, { toValue: 1, tension: 260, friction: 7, useNativeDriver: true }).start();
    }
  }, [multiplier]);

  // Balance flash on deduction
  useEffect(() => {
    if (balance !== null && prevBal.current !== null && balance < prevBal.current) {
      balFlash.setValue(1);
      Animated.timing(balFlash, { toValue: 0, duration: 500, useNativeDriver: false }).start();
    }
    prevBal.current = balance;
  }, [balance]);

  const isDanger  = balance !== null && costPerTap > 0 && balance < costPerTap;
  const isLow     = balance !== null && costPerTap > 0 && balance < costPerTap * 5;
  const balColor  = isDanger ? '#EF4444' : isLow ? '#F59E0B' : '#4ADE80';
  const ringColor = isDanger ? '#EF4444' : isLow ? '#F59E0B' : '#22C55E';
  const btnBg     = isDanger ? '#450a0a' : '#14532d';
  const btnBorder = isDanger ? '#EF4444' : isLow ? '#F59E0B' : '#22C55E';

  const handleTap = useCallback(() => {
    onTap();
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.78, duration: 80, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, tension: 200, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [onTap]);

  const dismiss = useCallback(() => {
    Animated.timing(scaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDismiss());
  }, [onDismiss]);

  // Interpolate balance text color: flashes white on deduction
  const balTextColor = balFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [balColor, '#ffffff'],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: 110,
        right: 18,
        zIndex: 8000,
        alignItems: 'center',
        transform: [{ scale: scaleAnim }],
      }}
    >
      {/* Pulse ring — color reflects balance level */}
      <Animated.View style={{
        position: 'absolute',
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 2.5, borderColor: ringColor,
        transform: [{ scale: pulseScale }],
        opacity: pulseOpacity,
      }} />

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: tapScale }] }}>
        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={isDanger ? 0.5 : 0.85}
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: btnBg,
            borderWidth: 2.5, borderColor: btnBorder,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: btnBorder, shadowOpacity: 0.7, shadowRadius: 14, elevation: 12,
          }}
        >
          {info.giftImageUrl ? (
            <Image source={{ uri: info.giftImageUrl }} style={{ width: 38, height: 38, borderRadius: 6 }} resizeMode="contain" />
          ) : (
            <Text style={{ fontSize: 28 }}>{info.giftEmoji}</Text>
          )}
          <Text style={{ fontSize: 9, fontWeight: '900', color: isDanger ? '#FCA5A5' : '#4ADE80', letterSpacing: 1, marginTop: -2 }}>
            {isDanger ? 'HABIS' : 'TAP!'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Multiplier badge */}
      <Animated.View style={{
        marginTop: 5, paddingHorizontal: 9, paddingVertical: 2,
        borderRadius: 999, backgroundColor: isDanger ? '#EF4444' : '#22C55E',
        transform: [{ scale: badgeScale }],
      }}>
        <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>×{multiplier}</Text>
      </Animated.View>

      {/* Live coin balance — flashes white on each deduction */}
      {balance !== null && (
        <Animated.View style={{
          marginTop: 3, paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: 999,
          backgroundColor: isDanger ? 'rgba(239,68,68,0.18)' : isLow ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.35)',
          borderWidth: 1, borderColor: balColor,
        }}>
          <Animated.Text style={{ fontSize: 10, fontWeight: '800', color: balTextColor }}>
            🪙 {Math.max(0, balance).toLocaleString()}
          </Animated.Text>
        </Animated.View>
      )}

      {/* Gift name */}
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3, maxWidth: 88, textAlign: 'center' }} numberOfLines={1}>
        {info.giftName} · 🪙{costPerTap > 0 ? costPerTap.toLocaleString() : info.price}/tap
      </Text>

      {/* Close */}
      <TouchableOpacity onPress={dismiss} style={{ marginTop: 4, padding: 4 }}>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>✕ tutup</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function PopularVideoView({ videoUrl, style }: { videoUrl: string; style: object }) {
  const player = useVideoPlayerSafe({ uri: videoUrl }, (p: any) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });
  return (
    <VideoViewSafe player={player} style={style} contentFit="contain" nativeControls={false} />
  );
}

function GiftSplashOverlay({ data, onDone }: { data: GiftBannerData; onDone: () => void }) {
  const bgOpacity    = useRef(new Animated.Value(0)).current;
  const emojiScale   = useRef(new Animated.Value(0.3)).current;
  const emojiOpacity = useRef(new Animated.Value(0)).current;
  const sparks = useRef(
    Array.from({ length: SPARK_COUNT }, () => ({
      dist:    new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  // GiftWebmFullscreen now uses WebView — transparent alpha channel works on
  // all builds without needing expo-video or VIDEO_SUPPORTED.
  const hasVideo  = !!data.videoUrl;
  const hasLottie = !hasVideo && !!data.lottieUrl;
  const hasFullscreen = hasLottie;

  useEffect(() => {
    // When video takes fullscreen, GiftWebmFullscreen manages its own lifecycle
    if (hasVideo) return;

    const bgTarget = hasLottie ? 0.15 : 0.6;
    const holdMs   = hasLottie ? 4800 : 2400;

    Animated.parallel([
      Animated.timing(bgOpacity,    { toValue: bgTarget, duration: 220, useNativeDriver: true }),
      Animated.spring(emojiScale,   { toValue: 1, tension: 65, friction: 7, useNativeDriver: true }),
      Animated.timing(emojiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ...sparks.map((p, i) =>
        Animated.sequence([
          Animated.delay(80 + i * 30),
          Animated.parallel([
            Animated.timing(p.dist,    { toValue: 1, duration: 650, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(p.opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
              Animated.timing(p.opacity, { toValue: 0, duration: 380, delay: 180, useNativeDriver: true }),
            ]),
          ]),
        ])
      ),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bgOpacity,    { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(emojiOpacity, { toValue: 0, duration: 340, useNativeDriver: true }),
      ]).start(() => onDone());
    }, holdMs);

    return () => clearTimeout(t);
  }, []);

  // ── When gift has a video: fullscreen with its own fade-in/out lifecycle ──
  if (hasVideo) {
    return (
      <GiftWebmFullscreen
        uri={data.videoUrl!}
        onFinish={onDone}
      />
    );
  }

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* dim background */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: bgOpacity }]} />

      {/* Lottie layer — card size (sama dengan sender), bukan fullscreen */}
      {hasLottie && (
        <View style={{ alignItems: 'center' }}>
          <LottieView
            source={{ uri: data.lottieUrl! }}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={{ width: 200, height: 200 }}
          />
          {!!data.giftName && (
            <Text style={{
              color: '#fff', fontWeight: '800', fontSize: 15, marginTop: 4,
              textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
            }}>
              {data.giftName}
            </Text>
          )}
        </View>
      )}

      {/* Sparkle particles — only show when no fullscreen video/lottie */}
      {!hasFullscreen && sparks.map((p, i) => {
        const angle = (i / SPARK_COUNT) * Math.PI * 2;
        const tx = p.dist.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * SPARK_RADIUS] });
        const ty = p.dist.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * SPARK_RADIUS] });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              fontSize: 22,
              opacity: p.opacity,
              transform: [{ translateX: tx }, { translateY: ty }],
            }}
          >
            {SPARK_EMOJIS[i % SPARK_EMOJIS.length]}
          </Animated.Text>
        );
      })}

      {/* Center image/emoji — only show when no fullscreen lottie */}
      {!hasFullscreen && (data.giftImageUrl ? (
        <Animated.Image
          source={{ uri: data.giftImageUrl }}
          style={{
            width: 120, height: 120, borderRadius: 16,
            transform: [{ scale: emojiScale }],
            opacity: emojiOpacity,
          }}
          resizeMode="contain"
        />
      ) : (
        <Animated.Text
          style={{
            fontSize: 82,
            transform: [{ scale: emojiScale }],
            opacity: emojiOpacity,
          }}
        >
          {data.emoji}
        </Animated.Text>
      ))}

    </View>
  );
}

// ─── AvatarCircle ─────────────────────────────────────────────────────────────
function AvatarCircle({ name, size, color, avatarUrl, frameUrl, username }: {
  name: string; size: number; color: string;
  avatarUrl?: string | null; frameUrl?: string | null;
  username?: string | null;
}) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  return (
    <AvatarWithFrame
      size={size}
      username={username}
      displayPicture={avatarUrl}
      avatarFrameUrl={frameUrl}
      initial={initials}
      backgroundColor={color}
      style={{
        shadowColor: color, shadowOpacity: 0.5, shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 }, elevation: 5,
      }}
    />
  );
}

const PARTICLE_EMOJIS = ['✨', '⭐', '💫', '🌟', '✦', '⭐', '✨', '💫', '🌟', '✦'];
const PARTICLE_COUNT  = 10;

function ParticleOverlay() {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: (Math.random() * SW * 0.9) + SW * 0.05,
      y: Math.random() * SH * 0.55,
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
      size: 7 + Math.random() * 9,
      duration: 3200 + Math.random() * 3800,
      delay: Math.random() * 3500,
    }))
  ).current;

  useEffect(() => {
    const anims = particles.map(p => {
      const fallDist = 25 + Math.random() * 55;
      const driftX   = (Math.random() - 0.5) * 18;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.parallel([
            Animated.sequence([
              Animated.timing(p.opacity, { toValue: 0.75, duration: p.duration * 0.3, useNativeDriver: true }),
              Animated.timing(p.opacity, { toValue: 0,    duration: p.duration * 0.7, useNativeDriver: true }),
            ]),
            Animated.timing(p.translateY, { toValue: fallDist, duration: p.duration, useNativeDriver: true }),
            Animated.timing(p.translateX, { toValue: driftX,   duration: p.duration, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(p.translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(p.translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    });
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            fontSize: p.size,
            opacity: p.opacity,
            transform: [{ translateY: p.translateY }, { translateX: p.translateX }],
          }}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

function NowSpeakingPill({ name, color, visible }: { name: string; color: string; visible: boolean }) {
  const slideY  = useRef(new Animated.Value(-28)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bars    = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.2))).current;
  const barLoops = useRef<Animated.CompositeAnimation[]>([]).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 130, friction: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      barLoops.length = 0;
      bars.forEach((bar, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 90),
            Animated.timing(bar, { toValue: 1,   duration: 280 + i * 50, useNativeDriver: true }),
            Animated.timing(bar, { toValue: 0.2, duration: 280 + i * 50, useNativeDriver: true }),
          ])
        );
        barLoops.push(loop);
        loop.start();
      });
    } else {
      barLoops.forEach(l => l.stop());
      barLoops.length = 0;
      bars.forEach(b => b.setValue(0.2));
      Animated.parallel([
        Animated.timing(slideY,  { toValue: -28, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:  'absolute',
        top:       0,
        left:      0,
        right:     0,
        alignItems: 'center',
        zIndex:    50,
        transform: [{ translateY: slideY }],
        opacity,
      }}
    >
      <View style={{
        flexDirection:    'row',
        alignItems:       'center',
        gap:              8,
        backgroundColor:  'rgba(12,6,36,0.90)',
        borderRadius:     999,
        paddingHorizontal: 16,
        paddingVertical:   7,
        borderWidth:      1.5,
        borderColor:      color + 'BB',
        shadowColor:      color,
        shadowOpacity:    0.75,
        shadowRadius:     14,
        shadowOffset:     { width: 0, height: 0 },
        elevation:        12,
      }}>
        {/* Mic icon */}
        <Ionicons name="mic" size={13} color={color} />

        {/* Name */}
        <Text numberOfLines={1} style={{
          color:       '#fff',
          fontSize:    12,
          fontWeight:  '700',
          letterSpacing: 0.3,
          maxWidth:    140,
          textShadowColor:  'rgba(0,0,0,0.8)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        }}>
          {name}
        </Text>

        {/* Sound wave bars */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 16 }}>
          {bars.map((bar, i) => (
            <Animated.View key={i} style={{
              width:        3,
              height:       14,
              borderRadius: 2,
              backgroundColor: color,
              transform: [{ scaleY: bar }],
            }} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Now Playing Mini-Bar ──────────────────────────────────────────────────────
// Strip kecil muncul di atas chat saat musik sedang diputar.
// Tetap terlihat meski sheet musik sudah ditutup.
function NowPlayingMiniBar({
  track,
  isPlaying,
  onStop,
  onPress,
  volume,
  onVolumeChange,
}: {
  track: MusicTrack | null;
  isPlaying: boolean;
  onStop: () => void;
  onPress: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}) {
  const [showVolume, setShowVolume] = useState(false);
  const slideY  = useRef(new Animated.Value(48)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bars    = useRef(Array.from({ length: 4 }, () => new Animated.Value(0.25))).current;
  const barLoops = useRef<Animated.CompositeAnimation[]>([]).current;

  const visible = !!track;

  // Slide in/out when track appears/disappears
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }),
        Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 48, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,  duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Animate waveform bars when playing
  useEffect(() => {
    barLoops.forEach(l => l.stop());
    barLoops.length = 0;
    bars.forEach(b => b.setValue(0.25));

    if (isPlaying && visible) {
      bars.forEach((bar, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 110),
            Animated.timing(bar, { toValue: 1,    duration: 300 + i * 60, useNativeDriver: true }),
            Animated.timing(bar, { toValue: 0.25, duration: 300 + i * 60, useNativeDriver: true }),
          ])
        );
        barLoops.push(loop);
        loop.start();
      });
    }
    return () => { barLoops.forEach(l => l.stop()); barLoops.length = 0; };
  }, [isPlaying, visible]);

  // Pulsing outer glow — berkedip pelan saat playing
  const glowPulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (isPlaying && visible) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1,   duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(glowPulse, { toValue: 0.4, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      glowPulse.setValue(0.4);
    }
  }, [isPlaying, visible]);

  if (!track) return null;

  return (
    <Animated.View
      style={{
        position:         'absolute',
        top:              0,
        left:             0,
        right:            0,
        zIndex:           20,
        transform:        [{ translateY: slideY }],
        opacity,
        marginHorizontal: 10,
        marginBottom:     4,
      }}
    >
      {/* Outer glow halo — lapisan paling luar */}
      <Animated.View
        pointerEvents="none"
        style={{
          position:      'absolute',
          top: -3, left: -3, right: -3, bottom: -3,
          borderRadius:  16,
          borderWidth:   1,
          borderColor:   '#5EEAD4',
          opacity:       glowPulse,
          shadowColor:   '#5EEAD4',
          shadowOpacity: 1,
          shadowRadius:  12,
          shadowOffset:  { width: 0, height: 0 },
          elevation:     0,
        }}
      />

      <Pressable onPress={onPress} style={{ borderRadius: 12, overflow: 'hidden' }}>
        {/* Gradient background — gelap bawah, ungu-teal di atas */}
        <LinearGradient
          colors={['rgba(30,12,60,0.97)', 'rgba(10,30,50,0.97)', 'rgba(8,22,40,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            paddingHorizontal: 10,
            paddingVertical:   6,
            gap:               8,
            borderRadius:      12,
            borderWidth:       1,
            borderColor:       'rgba(94,234,212,0.55)',
            shadowColor:       '#5EEAD4',
            shadowOpacity:     0.5,
            shadowRadius:      10,
            shadowOffset:      { width: 0, height: 0 },
            elevation:         10,
          }}
        >
          {/* Teal accent strip di kiri */}
          <View style={{
            width: 2.5, height: 26, borderRadius: 2,
            backgroundColor: '#5EEAD4',
            shadowColor: '#5EEAD4', shadowOpacity: 1, shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          }} />

          {/* Waveform bars — dengan glow teal */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 20, width: 22 }}>
            {bars.map((bar, i) => (
              <Animated.View
                key={i}
                style={{
                  width:           3,
                  height:          16,
                  borderRadius:    2,
                  backgroundColor: isPlaying ? '#5EEAD4' : 'rgba(94,234,212,0.4)',
                  shadowColor:     '#5EEAD4',
                  shadowOpacity:   isPlaying ? 0.9 : 0,
                  shadowRadius:    4,
                  shadowOffset:    { width: 0, height: 0 },
                  transform:       [{ scaleY: bar }],
                }}
              />
            ))}
          </View>

          {/* Track info */}
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                color:         '#5EEAD4',
                fontSize:      10,
                fontWeight:    '700',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                textShadowColor:  '#5EEAD4',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 6,
              }}
            >
              {isPlaying ? '♪  Sedang diputar' : '⏸  Dijeda'}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color:         '#fff',
                fontSize:      12,
                fontWeight:    '700',
                marginTop:     1,
                letterSpacing: 0.1,
                textShadowColor:  'rgba(94,234,212,0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 4,
              }}
            >
              {track.title}
              {track.artist ? (
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontWeight: '400', fontSize: 11 }}>
                  {'  ·  '}{track.artist}
                </Text>
              ) : null}
            </Text>
          </View>

          {/* Volume button — teal glowing */}
          <Pressable
            onPress={e => { e.stopPropagation?.(); setShowVolume(v => !v); }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 4 }}
            style={{
              width:           28,
              height:          28,
              borderRadius:    14,
              backgroundColor: showVolume ? 'rgba(94,234,212,0.25)' : 'rgba(94,234,212,0.1)',
              borderWidth:     1.5,
              borderColor:     showVolume ? 'rgba(94,234,212,0.9)' : 'rgba(94,234,212,0.4)',
              alignItems:      'center',
              justifyContent:  'center',
              shadowColor:     '#5EEAD4',
              shadowOpacity:   showVolume ? 0.9 : 0.3,
              shadowRadius:    8,
              shadowOffset:    { width: 0, height: 0 },
              elevation:       4,
            }}
          >
            <MaterialCommunityIcons
              name={volume === 0 ? 'volume-off' : volume < 0.4 ? 'volume-low' : volume < 0.75 ? 'volume-medium' : 'volume-high'}
              size={13}
              color="#5EEAD4"
            />
          </Pressable>

          {/* Stop button — merah glowing */}
          <Pressable
            onPress={e => { e.stopPropagation?.(); onStop(); }}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 8 }}
            style={{
              width:           28,
              height:          28,
              borderRadius:    14,
              backgroundColor: 'rgba(255,60,60,0.25)',
              borderWidth:     1.5,
              borderColor:     'rgba(255,80,80,0.7)',
              alignItems:      'center',
              justifyContent:  'center',
              shadowColor:     '#FF4040',
              shadowOpacity:   0.8,
              shadowRadius:    8,
              shadowOffset:    { width: 0, height: 0 },
              elevation:       6,
            }}
          >
            <MaterialCommunityIcons name="stop" size={13} color="#FF6060" />
          </Pressable>
        </LinearGradient>

        {/* Volume slider — muncul saat tombol volume ditekan */}
        {showVolume && (
          <LinearGradient
            colors={['rgba(10,30,50,0.97)', 'rgba(8,22,40,0.98)']}
            style={{
              flexDirection:     'row',
              alignItems:        'center',
              paddingHorizontal: 12,
              paddingVertical:   4,
              gap:               6,
              borderBottomLeftRadius:  12,
              borderBottomRightRadius: 12,
              borderLeftWidth:   1,
              borderRightWidth:  1,
              borderBottomWidth: 1,
              borderColor:       'rgba(94,234,212,0.55)',
            }}
          >
            <MaterialCommunityIcons name="volume-low" size={12} color="rgba(94,234,212,0.6)" />
            <Slider
              style={{ flex: 1, height: 28 }}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={volume}
              onValueChange={onVolumeChange}
              minimumTrackTintColor="#5EEAD4"
              maximumTrackTintColor="rgba(94,234,212,0.2)"
              thumbTintColor="#5EEAD4"
            />
            <MaterialCommunityIcons name="volume-high" size={12} color="rgba(94,234,212,0.6)" />
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

function SeatBubble({
  seat, color, isMe, isMuted, isSpeaking, isHandRaised, isLocked, onPress, onLongPress, seatSize, stickerData, remoteLottieJsonMap,
}: {
  seat: Seat;
  color: string;
  isMe: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isHandRaised: boolean;
  isLocked: boolean;
  onPress: () => void;
  onLongPress: () => void;
  seatSize?: number;
  stickerData?: { id: string; key: number };
  remoteLottieJsonMap?: Record<string, object>;
})
 {
  const pulse      = useRef(new Animated.Value(1)).current;
  const ring1      = useRef(new Animated.Value(0)).current;
  const ring2      = useRef(new Animated.Value(0)).current;
  const inviteGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (seat.username) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.setValue(1);
    }
  }, [seat.username]);

  useEffect(() => {
    if (!seat.username && !isLocked) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(inviteGlow, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(inviteGlow, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => { anim.stop(); inviteGlow.setValue(0); };
    } else {
      inviteGlow.setValue(0);
    }
  }, [seat.username, isLocked]);

  // Speaking wave rings
  useEffect(() => {
    if (isSpeaking && seat.username) {
      const makeWave = (val: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(val, { toValue: 0, duration: 0,   useNativeDriver: true }),
          ])
        );
      const a1 = makeWave(ring1, 0);
      const a2 = makeWave(ring2, 420);
      a1.start(); a2.start();
      return () => { a1.stop(); a2.stop(); ring1.setValue(0); ring2.setValue(0); };
    } else {
      ring1.setValue(0); ring2.setValue(0);
    }
  }, [isSpeaking, seat.username]);

  const ringScale1   = ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const ringOpacity1 = ring1.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.55, 0] });
  const ringScale2   = ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const ringOpacity2 = ring2.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.55, 0] });

  const sz        = seatSize ?? SEAT_SIZE;
  const szFrame   = Math.round(sz * 1.45);
  const szPad     = Math.round((szFrame - sz) / 2);

  const occupied  = !!seat.username;
  const initials  = occupied ? (seat.displayName ?? seat.username ?? '?').slice(0, 2).toUpperCase() : null;
  const seatColor = isMe ? '#F59E0B' : color;
  const speakColor = isMe ? '#F59E0B' : '#22C55E';

  return (
    <View style={[seatStyles.wrap, { width: sz, height: szFrame + 30 }]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.8}
          style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* Fixed-height container — keeps occupied & empty seats vertically aligned */}
          <View style={{ width: szFrame, height: szFrame, alignItems: 'center', justifyContent: 'center' }}>
            {occupied ? (
              <>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {/* Speaking wave rings — behind avatar */}
                <Animated.View style={[seatStyles.speakRing, {
                  width: sz, height: sz, borderRadius: sz / 2,
                  borderColor: speakColor,
                  transform: [{ scale: ringScale1 }],
                  opacity: ringOpacity1,
                }]} />
                <Animated.View style={[seatStyles.speakRing, {
                  width: sz, height: sz, borderRadius: sz / 2,
                  borderColor: speakColor,
                  transform: [{ scale: ringScale2 }],
                  opacity: ringOpacity2,
                }]} />
                <AvatarWithFrame
                  size={sz}
                  username={seat.username ?? undefined}
                  displayPicture={seat.avatarUrl}
                  avatarFrameUrl={seat.avatarFrameUrl}
                  initial={initials!}
                  backgroundColor={seatColor}
                  style={{
                    shadowColor: isSpeaking ? speakColor : seatColor,
                    shadowOpacity: isSpeaking ? 1 : (isMe ? 0.9 : 0.6),
                    shadowRadius: isSpeaking ? 18 : (isMe ? 14 : 10),
                    shadowOffset: { width: 0, height: 0 },
                    elevation: isSpeaking ? 12 : (isMe ? 8 : 5),
                  }}
                />
                {isMuted && (
                  <View style={[seatStyles.mutedBadge, { position: 'absolute', bottom: 2, right: 2 }]}>
                    <Ionicons name="mic-off" size={9} color="#fff" />
                  </View>
                )}
                {isHandRaised && (
                  <View style={seatStyles.handBadge}>
                    <Text style={{ fontSize: 10 }}>✋</Text>
                  </View>
                )}
                </View>
                {/* Sticker overlay — sibling inside szFrame×szFrame, centered on avatar */}
                {stickerData && (() => {
                  const isRemote = stickerData.id.startsWith('remote:');
                  const parts = isRemote ? stickerData.id.split(':') : [];
                  const remoteId = isRemote ? parts[1] : null;
                  const localSource = !isRemote ? LOCAL_STICKER_SOURCES[stickerData.id] : null;
                  const remoteJson = isRemote && remoteId && remoteLottieJsonMap ? remoteLottieJsonMap[remoteId] : null;
                  if (!isRemote && !localSource) return null;
                  if (isRemote && !remoteJson) return null;
                  const stickerSz = sz * 1.3;
                  const stickerOffset = (szFrame - stickerSz) / 2;
                  return (
                    <View pointerEvents="none" style={{
                      position: 'absolute',
                      top: stickerOffset,
                      left: stickerOffset,
                      width: stickerSz,
                      height: stickerSz,
                    }}>
                      <LottieView
                        key={stickerData.key}
                        source={(isRemote ? remoteJson : localSource) as any}
                        autoPlay
                        loop={false}
                        style={{ width: stickerSz, height: stickerSz }}
                      />
                    </View>
                  );
                })()}
              </>
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <View style={[
                  seatStyles.bubble,
                  { width: sz, height: sz, borderRadius: sz / 2,
                    backgroundColor: isLocked ? 'rgba(239,68,68,0.12)' : SEAT_BG,
                    borderColor: isLocked ? 'rgba(239,68,68,0.4)' : SEAT_BORDER },
                ]}>
                  {isLocked
                    ? <MaterialCommunityIcons name="lock-outline" size={sz * 0.38} color="rgba(239,68,68,0.75)" />
                    : <Image
                        source={require('../assets/images/party_seat.png')}
                        style={{ width: sz * 0.82, height: sz * 0.82 }}
                        resizeMode="contain"
                      />
                  }
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
      {/* Nomor kursi hanya untuk kursi kosong, username + coin untuk kursi terisi */}
      {!occupied
        ? <Text style={seatStyles.seatNum}>{seat.index}</Text>
        : (
          <>
            <Text style={seatStyles.seatName} numberOfLines={1}>{seat.displayName || seat.username}</Text>
            <View style={seatStyles.diamondRow}>
              <Text style={seatStyles.diamondIcon}>🪙</Text>
              <Text style={seatStyles.diamondCount}>
                {(seat.diamonds ?? 0) >= 1000
                  ? `${((seat.diamonds ?? 0) / 1000).toFixed(1)}K`
                  : (seat.diamonds ?? 0).toLocaleString()}
              </Text>
            </View>
          </>
        )
      }
    </View>
  );
}

function MsgRow({ item, meUsername, onPressUsername }: { item: ChatMessage; meUsername?: string; onPressUsername?: (username: string) => void }) {
  const isMe = item.username === meUsername;

  // ── Jackpot announcement — solid colored bubble ───────────────────────────
  if (item.isJackpot && item.jackpotData) {
    const jp  = item.jackpotData;
    const mk  = jp.milestoneKey ?? '';
    const fmt = (n: number) => n.toLocaleString('id-ID');

    // warna berdasarkan tier baru (X1_500/X3/X9/X99/X199) atau legacy
    const bgColor  = mk === 'X199'             ? '#78350F'
      : mk === 'X99'                           ? '#3B0764'
      : mk === 'X9'                            ? '#1E1B4B'
      : mk === 'X3'                            ? '#713F12'
      : mk === 'X1_500'                        ? '#064E3B'
      : jp.milestone >= 9000                   ? '#4C1D95'
      : jp.milestone >= 500                    ? '#B45309'
      : jp.milestone >= 300                    ? '#C2410C'
      : jp.milestone >= 200                    ? '#B91C1C'
      : jp.milestone >= 100                    ? '#92400E'
      :                                          '#064E3B';

    const topColor = mk === 'X199'             ? '#F59E0B'
      : mk === 'X99'                           ? '#C084FC'
      : mk === 'X9'                            ? '#818CF8'
      : mk === 'X3'                            ? '#FCD34D'
      : mk === 'X1_500'                        ? '#34D399'
      : jp.milestone >= 9000                   ? '#C4B5FD'
      : jp.milestone >= 500                    ? '#F59E0B'
      : jp.milestone >= 300                    ? '#F97316'
      : jp.milestone >= 200                    ? '#EF4444'
      : jp.milestone >= 100                    ? '#FCD34D'
      :                                          '#34D399';

    const isRoomTier = mk === 'X3' || mk === 'X9' || mk === 'X99' || mk === 'X199'
      || mk.startsWith('50X_') || mk.startsWith('100X_');

    const is50xTier  = mk.startsWith('50X_');
    const is100xTier = mk.startsWith('100X_');

    return (
      <View style={{
        backgroundColor: bgColor,
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: topColor,
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginVertical: 4,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '900', color: topColor, letterSpacing: 0.5, marginBottom: 3 }}>
          {jp.tierEmoji}{'  '}{jp.tier.toUpperCase()}
          {jp.isGlobal ? '  🌐 GLOBAL' : isRoomTier ? '  🏠 ROOM' : ''}
        </Text>
        <Text style={{ fontSize: 13, color: '#FFFFFF', lineHeight: 19, flexShrink: 1 }}>
          {'🏆 Congrats '}
          <Text style={{ fontWeight: '800', color: '#FDE68A' }}>{jp.winner}</Text>
          {' received '}
          <Text style={{ fontWeight: '700', color: topColor }}>+{fmt(jp.reward)} coins</Text>
          {'!'}
        </Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 3 }}>
          {jp.isGlobal && jp.queueIdx && jp.queueTotal
            ? `🌐 Global JP · Pemenang ${jp.queueIdx}/${jp.queueTotal}`
            : jp.isGlobal
            ? `🌐 Global JP`
            : is50xTier
            ? `🏠 Room JP · 50x Lucky Gift`
            : is100xTier
            ? `🏠 Room JP · 100x Lucky Gift`
            : isRoomTier
            ? `🏠 Room Jackpot · 500x Lucky Gift`
            : `triggered by ${jp.triggeredBy}`}
        </Text>
      </View>
    );
  }

  // ── Game Win announcement — gold global bubble ──────────────────────────
  if (item.isGameWin && item.gameWinData) {
    const { gameName, gameEmoji, amount, slotEmoji, isGlobal } = item.gameWinData;
    const fmt = (n: number) => n.toLocaleString('id-ID');
    if (isGlobal) {
      return (
        <View style={chatStyles.gameWinGlobalCard}>
          <View style={chatStyles.gameWinGlobalLeft}>
            <Text style={chatStyles.gameWinGlobalEmoji}>{gameEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={chatStyles.gameWinGlobalHeader}>
              <Text style={chatStyles.gameWinGlobalBadge}>🏆 MENANG BESAR</Text>
              <Text style={chatStyles.gameWinGlobalSlot}>{slotEmoji}</Text>
            </View>
            <Text style={chatStyles.gameWinGlobalUser} numberOfLines={1}>{item.username}</Text>
            <Text style={chatStyles.gameWinGlobalAmt}>+{fmt(amount)} koin</Text>
            <Text style={chatStyles.gameWinGlobalGame}>{gameName}  •  🌍 semua room</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={chatStyles.gameWinBox}>
        <Text style={chatStyles.gameWinText}>
          <Text style={chatStyles.gameWinUser}>{item.username}</Text>
          {' memenangkan '}
          <Text style={chatStyles.gameWinAmount}>{fmt(amount)} coin</Text>
          {' di '}
          <Text style={chatStyles.gameWinGame}>{gameEmoji} {gameName}</Text>
          {'  '}{slotEmoji}
        </Text>
      </View>
    );
  }

  if (item.isSystem) {
    const parsed = parseSystemText(item.text);

    // ── Join message renderer — compact single-line pill ──────────────
    const renderJoinMsg = (uname: string, lvl: number, _avatarUrl?: string | null, displayName?: string | null) => (
      <View style={chatStyles.joinNotif}>
        <View style={chatStyles.joinNotifInner}>
          <Text style={[chatStyles.joinNotifUsername, { color: levelTier(lvl).border }]} numberOfLines={1}>
            {displayName || uname}
          </Text>
          <LevelBadge level={lvl} />
          <Text style={chatStyles.joinNotifSub}>bergabung 🎊</Text>
        </View>
      </View>
    );

    if (parsed) {
      const isJoin = /has entered/.test(parsed.suffix);
      if (isJoin) return renderJoinMsg(parsed.username, parsed.level, item.avatarUrl, item.displayName);
      return (
        <View style={chatStyles.row}>
          <Text style={[chatStyles.sysUser, { color: levelTier(parsed.level).border }]}>
            {parsed.username}
          </Text>
          <LevelBadge level={parsed.level} />
          <Text style={chatStyles.sysAction}> {parsed.suffix}</Text>
        </View>
      );
    }
    // Fallback: raw text contains "has entered" but parseSystemText failed
    // — strip room prefix, extract username+level, show join box in Indonesian
    if (/has entered/.test(item.text)) {
      const raw = item.text.includes('::') ? item.text.replace(/^.+?::/, '') : item.text;
      const fallbackMatch = raw.match(/^(.+?)(?:\[(\d+)\])?\s+has entered/);
      const fbUsername = fallbackMatch ? fallbackMatch[1].trim() : (item.username ?? '?');
      const fbLevel    = fallbackMatch?.[2] ? parseInt(fallbackMatch[2], 10) : (item.migLevel ?? 0);
      return renderJoinMsg(fbUsername, fbLevel, item.avatarUrl, item.displayName);
    }
    // Lucky bag & colored system messages — styled pill
    if (item.color && item.color !== '#fff' && item.color !== 'rgba(255,255,255,0.55)') {
      const isGold  = item.color === '#F59E0B';
      const bgColor = isGold ? 'rgba(180,120,0,0.72)' : 'rgba(16,100,60,0.75)';
      const txtColor = isGold ? '#FDE68A' : '#A7F3D0';
      return (
        <View style={[chatStyles.lbPill, { backgroundColor: bgColor }]}>
          <Text style={[chatStyles.lbPillText, { color: txtColor }]}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={chatStyles.row}>
        <Text style={chatStyles.sysGeneric}>{item.text}</Text>
      </View>
    );
  }

  // ── Premium chat bubble — avatar + badge row + decorative message frame ──
  const initials = (item.username ?? '?').slice(0, 2).toUpperCase();
  const avatarColor = item.color && item.color !== '#fff' ? item.color : '#7C3AED';
  const hasAgency = !!item.agencyName;

  return (
    <View style={chatStyles.bubbleWrapper}>
      {/* Left: avatar circle — tappable to view profile */}
      <TouchableOpacity
        onPress={() => item.username && onPressUsername?.(item.username)}
        activeOpacity={0.75}
        disabled={!onPressUsername || !item.username}
      >
        <View style={[chatStyles.bubbleAvatar, { borderColor: avatarColor }]}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={chatStyles.bubbleAvatarImg} />
          ) : (
            <View style={[chatStyles.bubbleAvatarFallback, { backgroundColor: avatarColor }]}>
              <Text style={chatStyles.bubbleAvatarInitials}>{initials}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Right: badges + message bubble */}
      <View style={{ flex: 1 }}>
        {/* Badge row — varies by agency membership */}
        <View style={chatStyles.bubbleBadgeRow}>
          <TouchableOpacity
            onPress={() => item.username && onPressUsername?.(item.username)}
            activeOpacity={0.7}
            disabled={!onPressUsername || !item.username}
          >
            <Text style={[chatStyles.bubbleUsername, { color: item.color }]} numberOfLines={1}>
              {item.displayName || item.username}
            </Text>
          </TouchableOpacity>
          {hasAgency && (
            <View style={chatStyles.agencyBadge}>
              <Text style={chatStyles.agencyBadgeText}>{item.agencyName}</Text>
            </View>
          )}
          {item.isHost && (
            <View style={chatStyles.hostBadge}>
              <Text style={chatStyles.hostBadgeText}>🏠 Host</Text>
            </View>
          )}
          {item.migLevel > 0 && <LevelBadge level={item.migLevel} />}
        </View>

        {/* Decorative message bubble */}
        <View style={[chatStyles.bubbleFrame, isMe && chatStyles.bubbleFrameMe]}>
          {/* Corner sparkles */}
          <Text style={[chatStyles.bubbleCorner, { top: -4, left: 2 }]}>✦</Text>
          <Text style={[chatStyles.bubbleCorner, { top: -4, right: 2 }]}>✦</Text>
          <Text style={[chatStyles.bubbleCorner, { bottom: -4, left: 2 }]}>✦</Text>
          <Text style={[chatStyles.bubbleCorner, { bottom: -4, right: 2 }]}>✦</Text>
          <Text style={chatStyles.bubbleMsgText}>{item.text}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Grady Game Hub Component (native grid, in-app WebView per game) ──────────
const GRADY_GAMES = [
  { id: 'ferriswheel', name: 'Grady',           emoji: '🎡', badge: 'NEW', active: true,  thumb: '/games/grady/thumbnails/thumb_grady.png'      },
  { id: 'slot',        name: 'Slot Emas',       emoji: '🎰', badge: 'HOT', active: true,  thumb: '/games/grady/thumbnails/thumb_slot.png'       },
  { id: 'dragon',      name: 'Naga vs Harimau', emoji: '🐉', badge: 'HOT', active: true,  thumb: '/games/grady/thumbnails/thumb_dragon.png'     },
  { id: 'teenpatti',   name: 'Teen Patti',      emoji: '🃏', badge: 'NEW', active: true,  thumb: '/games/grady/thumbnails/thumb_teenpatti.png'  },
  { id: 'football',    name: 'Sepak Bola',      emoji: '⚽', badge: 'NEW', active: false, thumb: null },
  { id: 'tarot',       name: 'Kartu Tarot',     emoji: '🀄', badge: 'NEW', active: false, thumb: null },
];

// ── Grady Loading Overlay — rich purple gradient with glow ───────────────────
// ── LuckyBagBubble — floating claimable bag widget inside party room ─────────
const LUCKY_BAG_IMG_ROOM      = require('../assets/images/lucky_bag_icon.png');
const LUCKY_BAG_GLOBAL_BANNER = require('../assets/images/lucky_bag_global_banner.png');
function LuckyBagBubble({
  bag, claiming, claimResult, onClaim, onExpire,
}: {
  bag: { id: number; senderUsername: string; totalCoins: number; bagCount: number; bagsRemaining: number; expiresAt?: number };
  claiming: boolean;
  claimResult: number | null;
  onClaim: () => void;
  onExpire: () => void;
}) {
  const bounce  = useRef(new Animated.Value(1)).current;
  const shine   = useRef(new Animated.Value(0)).current;
  const [secsLeft, setSecsLeft] = useState<number>(() => {
    if (!bag.expiresAt) return 180;
    return Math.max(0, Math.floor((bag.expiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1.12, duration: 500, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0.96, duration: 400, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 1.0,  duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(shine, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(shine, { toValue: 0, duration: 0,   useNativeDriver: true }),
    ])).start();
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const left = bag.expiresAt ? Math.max(0, Math.floor((bag.expiresAt - Date.now()) / 1000)) : 0;
      setSecsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [bag.expiresAt]);

  const fmtCoins = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timerStr = `${mins}:${String(secs).padStart(2, '0')}`;
  const isUrgent = secsLeft <= 30;

  return (
    <TouchableOpacity onPress={onClaim} disabled={claiming} activeOpacity={0.85} style={lbBubSt.wrap}>
      {/* Glow background */}
      <View style={lbBubSt.glow} />

      {/* Bag icon */}
      <Animated.Image
        source={LUCKY_BAG_IMG_ROOM}
        style={[lbBubSt.bagImg, { transform: [{ scale: bounce }] }]}
        resizeMode="contain"
      />

      {/* Shine sweep overlay */}
      <Animated.View
        pointerEvents="none"
        style={[lbBubSt.shine, {
          opacity: shine.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, 0.7, 0.7, 0] }),
          transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-50, 80] }) }],
        }]}
      />

      {/* Bag count badge */}
      <View style={lbBubSt.badge}>
        <Text style={lbBubSt.badgeTxt}>{bag.bagsRemaining}</Text>
      </View>

      {/* Coin value label */}
      <View style={lbBubSt.coinRow}>
        <Text style={lbBubSt.coinTxt}>🪙 {fmtCoins(bag.totalCoins)}</Text>
      </View>

      {/* Sender */}
      <Text style={lbBubSt.senderTxt} numberOfLines={1}>@{bag.senderUsername}</Text>

      {/* Countdown timer */}
      <View style={[lbBubSt.timerRow, isUrgent && { backgroundColor: 'rgba(239,68,68,0.85)' }]}>
        <Text style={[lbBubSt.timerTxt, isUrgent && { color: '#fff' }]}>⏱ {timerStr}</Text>
      </View>

      {/* Claim result flash */}
      {claimResult !== null && (
        <View style={lbBubSt.claimFlash}>
          <Text style={lbBubSt.claimFlashTxt}>+{fmtCoins(claimResult)}!</Text>
        </View>
      )}

      {claiming && (
        <View style={lbBubSt.claimingOverlay}>
          <ActivityIndicator color="#FCD34D" size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const lbBubSt = StyleSheet.create({
  wrap: {
    width: 80,
    alignItems: 'center',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(220,100,0,0.28)',
    top: 4,
  },
  bagImg: {
    width: 68,
    height: 68,
  },
  shine: {
    position: 'absolute',
    top: 4, left: 0,
    width: 28, height: 68,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
    transform: [{ skewX: '-20deg' }],
  },
  badge: {
    position: 'absolute',
    top: 0, right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: '#fff',
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  coinRow: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 4,
  },
  coinTxt: { color: '#FCD34D', fontSize: 11, fontWeight: '800' },
  timerRow: {
    backgroundColor: 'rgba(220,50,0,0.78)',
    borderRadius: 7,
    paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 3,
  },
  timerTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  senderTxt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
    maxWidth: 80,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  claimFlash: {
    position: 'absolute',
    top: -12,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  claimFlashTxt: { color: '#FCD34D', fontSize: 14, fontWeight: '900' },
  claimingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ── GlobalBagBanner — full-width animated slide banner for global lucky bag ──
type GlobalBagInfo = {
  bagId: number; senderUsername: string; senderRoomId: string;
  senderRoomName: string; totalCoins: number; bagCount: number;
};

function GlobalBagBanner({
  bag, onGoToRoom, onDone, topY,
}: {
  bag: GlobalBagInfo;
  onGoToRoom?: () => void;
  onDone: () => void;
  topY?: number;
}) {
  const { width: SW } = require('react-native').Dimensions.get('window');
  const slideY   = useRef(new Animated.Value(-64)).current;
  const marqueeX = useRef(new Animated.Value(SW * 0.5)).current;
  const glowOp   = useRef(new Animated.Value(0.6)).current;

  const fmtC = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1000    ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
    : String(n);

  const marqueeText =
    `🎁 ${bag.senderUsername} kirim Lucky Bag ${bag.bagCount}x senilai ${fmtC(bag.totalCoins)} coin` +
    (bag.senderRoomName ? ` di room ${bag.senderRoomName}` : '') +
    `  •  Klik GO untuk klaim sekarang!  🌍  `;

  useEffect(() => {
    Animated.timing(slideY, { toValue: 0, duration: 420, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(marqueeX, { toValue: -(SW * 2.5), duration: 9000, useNativeDriver: true }),
        Animated.timing(marqueeX, { toValue: SW * 0.5,    duration: 0,    useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOp, { toValue: 1,   duration: 600, useNativeDriver: true }),
        Animated.timing(glowOp, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    const exitTimer = setTimeout(() => {
      Animated.timing(slideY, { toValue: -64, duration: 380, useNativeDriver: true }).start(() => onDone());
    }, 9500);

    return () => clearTimeout(exitTimer);
  }, []);

  // LEFT_PILL ≈ icon(30) + gap(4) + text(~24) + paddingH(16) + marginL(8) + marginR(8) = ~90
  // GO_BTN   ≈ paddingH(28) + text(~26) + marginL(8) + marginR(10) = ~72
  const LEFT_PILL_W = 90;
  const GO_BTN_SPACE = onGoToRoom ? 76 : 0;
  const MARQUEE_W = SW - LEFT_PILL_W - GO_BTN_SPACE - 8; // explicit width so Android clips correctly

  return (
    <Animated.View style={[gbBanSt.wrap, { transform: [{ translateY: slideY }], width: SW, top: topY ?? 0 }]}>
      {/* Banner image as background */}
      <Image source={LUCKY_BAG_GLOBAL_BANNER} style={gbBanSt.bgImg} resizeMode="cover" />

      {/* Overlay row — all children in flex flow so layout bounds are explicit */}
      <View style={gbBanSt.inner}>
        {/* Left: lucky bag icon + label */}
        <View style={gbBanSt.leftPill}>
          <Image source={LUCKY_BAG_IMG_ROOM} style={gbBanSt.bagIcon} resizeMode="contain" />
          <Text style={gbBanSt.leftLabel}>Lucky{'\n'}Bag</Text>
        </View>

        {/* Middle: scrolling marquee — explicit width so Android clips correctly */}
        <View style={[gbBanSt.marqueeClip, { width: MARQUEE_W }]}>
          <Animated.Text
            numberOfLines={1}
            style={[gbBanSt.marqueeText, { transform: [{ translateX: marqueeX }], width: SW * 4 }]}
          >
            {marqueeText}
          </Animated.Text>
        </View>

        {/* Right: GO button — in flex row so marquee is always capped before it */}
        {onGoToRoom && (
          <TouchableOpacity style={gbBanSt.goBtn} onPress={onGoToRoom} activeOpacity={0.8}>
            <Text style={gbBanSt.goBtnTxt}>GO!</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const gbBanSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    zIndex: 45,
    overflow: 'hidden',
  },
  bgImg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingRight: 10,
  },
  leftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bagIcon: { width: 30, height: 30, marginRight: 4 },
  leftLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
  },
  marqueeClip: { overflow: 'hidden', flexShrink: 0 },
  marqueeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  goBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 4,
    marginRight: 10,
    flexShrink: 0,
    shadowColor: '#F59E0B', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  goBtnTxt: { color: '#000', fontWeight: '900', fontSize: 13 },
});

// ── GlobalBagClaimBubble — global lucky bag floater, right side ───────────────
function GlobalBagClaimBubble({
  bag, claiming, claimResult, onClaim, onExpire,
}: {
  bag: GlobalBagInfo & { bagsRemaining: number };
  claiming: boolean;
  claimResult: number | null;
  onClaim: () => void;
  onExpire: () => void;
}) {
  const bounce = useRef(new Animated.Value(1)).current;
  const shine  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1.12, duration: 500, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0.96, duration: 400, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 1.0,  duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(shine, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();
  }, []);

  const fmtC = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);

  return (
    <TouchableOpacity
      onPress={onClaim}
      disabled={claiming}
      activeOpacity={0.85}
      style={lbBubSt.wrap}
    >
      <View style={[lbBubSt.glow, { backgroundColor: 'rgba(34,197,94,0.30)' }]} />
      <Animated.Image
        source={LUCKY_BAG_IMG_ROOM}
        style={[lbBubSt.bagImg, { transform: [{ scale: bounce }] }]}
        resizeMode="contain"
      />
      <Animated.View pointerEvents="none" style={[lbBubSt.shine, {
        opacity: shine.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, 0.7, 0.7, 0] }),
        transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-50, 80] }) }],
      }]} />
      <View style={[lbBubSt.badge, { backgroundColor: '#22C55E' }]}>
        <Text style={lbBubSt.badgeTxt}>{bag.bagsRemaining}</Text>
      </View>
      <View style={[lbBubSt.coinRow, { backgroundColor: 'rgba(21,128,61,0.80)' }]}>
        <Text style={lbBubSt.coinTxt}>🌍 {fmtC(bag.totalCoins)}</Text>
      </View>
      <Text style={lbBubSt.senderTxt} numberOfLines={1}>@{bag.senderUsername}</Text>
      {claimResult !== null && (
        <View style={lbBubSt.claimFlash}><Text style={lbBubSt.claimFlashTxt}>+{fmtC(claimResult)}!</Text></View>
      )}
      {claiming && (
        <View style={lbBubSt.claimingOverlay}><ActivityIndicator color="#86EFAC" size="small" /></View>
      )}
    </TouchableOpacity>
  );
}

function GradyLoadingOverlay({ name }: { name: string }) {
  const pulse1 = useRef(new Animated.Value(0.4)).current;
  const pulse2 = useRef(new Animated.Value(0.25)).current;
  const pulse3 = useRef(new Animated.Value(0.15)).current;
  const spinnerScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse1, { toValue: 0.75, duration: 1800, useNativeDriver: true }),
      Animated.timing(pulse1, { toValue: 0.4,  duration: 1800, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(600),
      Animated.timing(pulse2, { toValue: 0.55, duration: 2000, useNativeDriver: true }),
      Animated.timing(pulse2, { toValue: 0.25, duration: 2000, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(300),
      Animated.timing(pulse3, { toValue: 0.4,  duration: 2400, useNativeDriver: true }),
      Animated.timing(pulse3, { toValue: 0.15, duration: 2400, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(spinnerScale, { toValue: 1.1, duration: 700, useNativeDriver: true }),
      Animated.timing(spinnerScale, { toValue: 0.85, duration: 700, useNativeDriver: true }),
    ])).start();
    return () => {
      pulse1.stopAnimation(); pulse2.stopAnimation();
      pulse3.stopAnimation(); spinnerScale.stopAnimation();
    };
  }, []);

  return (
    <LinearGradient
      colors={['#1A0533', '#2D0A6E', '#4A1090', '#2D0A6E', '#1A0533']}
      locations={[0, 0.25, 0.5, 0.75, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={gradyLoadingStyles.overlay}
    >
      {/* Glow orb — top left */}
      <Animated.View style={[gradyLoadingStyles.glow, gradyLoadingStyles.glowTopLeft, { opacity: pulse1 }]} />
      {/* Glow orb — top right */}
      <Animated.View style={[gradyLoadingStyles.glow, gradyLoadingStyles.glowTopRight, { opacity: pulse2 }]} />
      {/* Glow orb — bottom center */}
      <Animated.View style={[gradyLoadingStyles.glow, gradyLoadingStyles.glowBottom, { opacity: pulse3 }]} />
      {/* Center glow halo behind spinner */}
      <Animated.View style={[gradyLoadingStyles.halo, { opacity: pulse2 }]} />

      {/* Spinner + text */}
      <Animated.View style={[gradyLoadingStyles.spinnerWrap, { transform: [{ scale: spinnerScale }] }]}>
        <ActivityIndicator size="large" color="#E879F9" style={gradyLoadingStyles.spinner} />
      </Animated.View>
      <Text style={gradyLoadingStyles.loadingName}>{name}</Text>
      <Text style={gradyLoadingStyles.loadingSub}>Memuat game...</Text>
    </LinearGradient>
  );
}

// ── Animated Marquee Banner ───────────────────────────────────────────────────
const MARQUEE_TEXT = 'Spin sekarang & menang besar!   •   Game baru tersedia setiap minggu!   •   Raih kemenangan terbesar di room ini!   •   Spin sekarang & menang besar!   •   Game baru tersedia setiap minggu!   •   Raih kemenangan terbesar di room ini!   •   ';
const MARQUEE_DURATION = 14000;

function MarqueeBanner() {
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scrollX, { toValue: -900, duration: MARQUEE_DURATION, useNativeDriver: true }),
        Animated.timing(scrollX, { toValue: 0,    duration: 0,               useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <LinearGradient
      colors={['#7C3AED', '#C026D3', '#EC4899']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={gradyStyles.marqueeWrap}
    >
      {/* Left fade mask */}
      <LinearGradient
        colors={['#8B3CF7', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={gradyStyles.marqueeFadeL}
        pointerEvents="none"
      />
      <View style={gradyStyles.marqueeClip}>
        <Animated.Text
          style={[gradyStyles.marqueeTxt, { transform: [{ translateX: scrollX }] }]}
          numberOfLines={1}
        >
          {MARQUEE_TEXT}
        </Animated.Text>
      </View>
      {/* Right fade mask */}
      <LinearGradient
        colors={['transparent', '#C026D3']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={gradyStyles.marqueeFadeR}
        pointerEvents="none"
      />
    </LinearGradient>
  );
}

function GradyHub({
  apiBase, roomId,
  onOpenGame,
}: {
  apiBase: string;
  roomId?: string;
  onOpenGame: (url: string, name: string, emoji: string) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);

  const openGame = async (gameId: string, gameName: string, gameEmoji: string) => {
    setOpening(gameId);
    try {
      const token = await getAuthToken();
      let url = `${apiBase}/games/grady/${gameId}?token=${encodeURIComponent(token ?? '')}`;
      if (roomId) url += `&roomId=${encodeURIComponent(roomId)}`;
      onOpenGame(url, gameName, gameEmoji);
    } catch (e) {
      console.warn('[Grady] Failed to build game URL:', e);
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={gradyStyles.container}>
      {/* Tabs */}
      <View style={gradyStyles.tabs}>
        <LinearGradient
          colors={['#7C3AED', '#A855F7']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={gradyStyles.tabActiveGrad}
        >
          <Text style={gradyStyles.tabActiveText}>🔥 Semua</Text>
        </LinearGradient>
        <View style={gradyStyles.tabInactive}>
          <Text style={gradyStyles.tabInactiveText}>⭐ Favorit</Text>
        </View>
      </View>

      {/* Marquee — inside modal, above grid */}
      <MarqueeBanner />

      {/* Grid — image-only cards, no name label */}
      <ScrollView contentContainerStyle={gradyStyles.grid} showsVerticalScrollIndicator={false}>
        {GRADY_GAMES.map(g => (
          <TouchableOpacity
            key={g.id}
            style={[gradyStyles.card, !g.active && gradyStyles.cardDisabled]}
            onPress={() => g.active && openGame(g.id, g.name, g.emoji)}
            activeOpacity={g.active ? 0.75 : 1}
          >
            {/* Thumbnail / emoji / loading */}
            <View style={gradyStyles.cardImg}>
              {opening === g.id
                ? <ActivityIndicator color="#fff" size="large" />
                : g.thumb
                  ? <Image
                      source={{ uri: apiBase + g.thumb }}
                      style={gradyStyles.cardThumb}
                      resizeMode="cover"
                    />
                  : (
                    <LinearGradient
                      colors={['#3B0764', '#6D28D9']}
                      style={StyleSheet.absoluteFill}
                    >
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={gradyStyles.cardEmoji}>{g.emoji}</Text>
                      </View>
                    </LinearGradient>
                  )
              }
              {!g.active && (
                <View style={gradyStyles.soonOverlay}>
                  <Text style={gradyStyles.soonText}>Soon</Text>
                </View>
              )}
              {/* Badge inside image overlay */}
              <View style={[gradyStyles.badge, g.badge === 'HOT' ? gradyStyles.badgeHot : gradyStyles.badgeNew]}>
                <Text style={gradyStyles.badgeText}>{g.badge}</Text>
              </View>
              {/* Bottom gradient name overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.78)']}
                style={gradyStyles.cardNameOverlay}
              >
                <Text style={gradyStyles.cardNameTxt} numberOfLines={1}>{g.name}</Text>
              </LinearGradient>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function PartyRoomModal({
  visible, room, currentUser, onClose, onMinimize, onRoomUpdated, onNavigateToRoom, onOpenPrivateChat,
  isMinimized,
}: {
  visible: boolean;
  isMinimized?: boolean;
  room: PartyRoom | null;
  currentUser: { username: string; displayName?: string | null; migLevel?: number } | null;
  onClose: () => void;
  onMinimize?: () => void;
  onRoomUpdated?: (updated: PartyRoom) => void;
  onNavigateToRoom?: (roomId: string, roomName: string) => void;
  onOpenPrivateChat?: (username: string, displayName: string) => void;
}) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const kbOffset  = useRef(new Animated.Value(0)).current;

  const [chatTab,     setChatTab]     = useState<ChatTab>('Semua');
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [inputText,   setInputText]   = useState('');
  const [toastMsg,    setToastMsg]    = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg({ text, type });
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);
  const [seats,       setSeats]       = useState<Seat[]>([]);
  const [wsStatus,    setWsStatus]    = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [myColor,     setMyColor]     = useState(PARTY_PURPLE);
  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [isMuted,       setIsMuted]       = useState(false);
  const [mutedByAdmin,  setMutedByAdmin]  = useState(false);
  const [myMutePopupVisible, setMyMutePopupVisible] = useState(false);
  const [lkProvider,  setLkProvider]  = useState<LiveKitProvider>(null);
  const [audioRoute,  setAudioRoute]  = useState<AudioRouteType>('unknown');

  const [localName, setLocalName] = useState('');
  const [localDesc, setLocalDesc] = useState<string | null>(null);

  const [editVisible,  setEditVisible]  = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editDesc,     setEditDesc]     = useState('');
  const [editLoading,  setEditLoading]  = useState(false);
  const [editNameErr,  setEditNameErr]  = useState('');
  const [luckyBagModalVisible,    setLuckyBagModalVisible]    = useState(false);
  const [roomLuckyBags, setRoomLuckyBags] = useState<Array<{
    id: number; senderUsername: string; totalCoins: number;
    bagCount: number; bagsRemaining: number; expiresAt?: number;
  }>>([]);
  const [claimingBagId,  setClaimingBagId]  = useState<number | null>(null);
  const [bagClaimResult, setBagClaimResult] = useState<{ bagId: number; coins: number } | null>(null);
  const [globalBanner,           setGlobalBanner]           = useState<GlobalBagInfo | null>(null);
  const [globalClaimBags,        setGlobalClaimBags]        = useState<Array<GlobalBagInfo & { bagsRemaining: number }>>([]);
  const [claimingGlobalBagId,    setClaimingGlobalBagId]    = useState<number | null>(null);
  const [globalBagClaimResult,   setGlobalBagClaimResult]   = useState<{ bagId: number; coins: number } | null>(null);
  const [seatsBotY,      setSeatsBotY]      = useState(0);
  const [seatTopY,       setSeatTopY]       = useState(0);
  const [headerBotY,     setHeaderBotY]     = useState(0);
  const [giftModalVisible,        setGiftModalVisible]        = useState(false);
  const [giftInitialRecipient,    setGiftInitialRecipient]    = useState<string | undefined>(undefined);
  const [giftSplash,              setGiftSplash]              = useState<GiftBannerData | null>(null);
  const [popularGiftSplash, setPopularGiftSplash] = useState<{ imageUrl?: string | null; emoji: string; lottieUrl?: string | null; videoUrl?: string | null; giftName?: string; isLuxury?: boolean } | null>(null);
  const popularSplashScale   = useRef(new Animated.Value(0)).current;
  const popularSplashOpacity = useRef(new Animated.Value(0)).current;
  const popularSplashTransX  = useRef(new Animated.Value(0)).current;
  const popularSplashTransY  = useRef(new Animated.Value(0)).current;
  const [luckyTapInfo,            setLuckyTapInfo]            = useState<LuckyTapInfo | null>(null);
  const luckyTapTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while user is in an active tap session — banner owned by optimistic tap handler
  const isLuckyTapSessionRef  = useRef(false);
  // Batching: accumulate taps, send one WS message after 400 ms of inactivity
  const pendingTapsRef        = useRef(0);
  const tapBatchTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const luckyTapInfoRef       = useRef<LuckyTapInfo | null>(null);
  // Real-time coin balance shown on TAP button
  const [tapCoinBalance,    setTapCoinBalance]    = useState<number | null>(null);
  const tapCoinBalanceRef   = useRef<number | null>(null);
  const [tapCoinCostPerTap, setTapCoinCostPerTap] = useState(0);
  const tapCoinCostRef      = useRef(0);
  const [gameModalVisible,        setGameModalVisible]        = useState(false);
  const [gradyGameWebView, setGradyGameWebView] = useState<{ url: string; name: string; emoji: string } | null>(null);
  const [gradyGameLoading, setGradyGameLoading] = useState(true);
  const [gradyLbVisible,   setGradyLbVisible]   = useState(false);
  const [gradyLbLoading,   setGradyLbLoading]   = useState(false);
  const [gradyLbData,      setGradyLbData]      = useState<{
    winners: { rank: number; username: string; amount: number; emoji: string }[];
    totalPaidOut: number; totalSpins: number;
  } | null>(null);
  const [selfEntryData,  setSelfEntryData]  = useState<{ username: string; displayName?: string | null; avatarUrl: string | null; effectUrl?: string | null } | null>(null);
  const [otherEntryData, setOtherEntryData] = useState<{ username: string; displayName?: string | null; avatarUrl: string | null; effectUrl?: string | null } | null>(null);
  const selfEntryUsernameRef  = useRef<string | null>(null);
  // Guard: only show self-entry banner ONCE per room session, not on reconnect/background-return
  const selfEntryShownRef     = useRef(false);
  // Ref updated synchronously in render — lets the effect cleanup know we're minimizing
  // (not doing a full close) so it skips the LiveKit/WS disconnect.
  const isMinimizedRef        = useRef(isMinimized);
  isMinimizedRef.current = isMinimized; // Always reflects latest render value
  const [exitModalVisible,        setExitModalVisible]        = useState(false);
  const [settingsSheetVisible,    setSettingsSheetVisible]    = useState(false);
  const [managementSheetVisible,  setManagementSheetVisible]  = useState(false);
  const [memberMgmtVisible,       setMemberMgmtVisible]       = useState(false);
  const [musicPickerVisible,      setMusicPickerVisible]      = useState(false);
  const [lockModalVisible,        setLockModalVisible]        = useState(false);
  const [pwEntryVisible,          setPwEntryVisible]          = useState(false);
  const [modeModalVisible,        setModeModalVisible]        = useState(false);
  const [sessionLbVisible,        setSessionLbVisible]        = useState(false);
  const [participantListVisible,  setParticipantListVisible]  = useState(false);

  // ── Session end summary (Siaran berakhir) ──────────────────────────────────
  const sessionStartRef        = useRef<number>(0);
  const endSummaryDurationRef  = useRef<number>(0);
  const [endSummaryVisible,  setEndSummaryVisible]  = useState(false);
  const [endSummaryLoading,  setEndSummaryLoading]  = useState(false);
  const [endSummaryData, setEndSummaryData] = useState<{
    spenders: { username: string; totalCoins: number; giftQty: number; avatarUrl?: string | null }[];
    totalCoins: number; totalDiamonds: number; spenderCount: number;
  } | null>(null);
  // ── Sticker panel ─────────────────────────────────────────────────────────
  const [stickerPanelVisible, setStickerPanelVisible] = useState(false);
  const [seatStickers, setSeatStickers] = useState<Record<number, { id: string; key: number }>>({});
  const [remoteStickers, setRemoteStickers] = useState<{ id: string; label: string; lottieUri: string; lottieJson?: object | null }[]>([]);
  const remoteLottieJsonMapRef = useRef<Record<string, object>>({});

  // ── Room Coin Leaderboard (Lucky Gift per-room) ───────────────────────────
  const [roomCoinLbVisible,   setRoomCoinLbVisible]   = useState(false);
  const [roomCoinLoading,     setRoomCoinLoading]     = useState(false);
  const [roomCoinTotal,       setRoomCoinTotal]       = useState(0);
  const [roomCoinTarget,      setRoomCoinTarget]      = useState(50_000_000);
  const [roomCoinParticipants, setRoomCoinParticipants] = useState<
    { username: string; total_gift_sent: number }[]
  >([]);
  const [participantCount,        setParticipantCount]        = useState(1);
  const participantSetRef    = useRef<Set<string>>(new Set());
  const participantLevelRef  = useRef<Map<string, number>>(new Map());
  const [seatActionTarget,        setSeatActionTarget]        = useState<SeatActionTarget | null>(null);
  const [profileUsername,         setProfileUsername]         = useState<string | null>(null);
  const [inviteAudienceVisible,   setInviteAudienceVisible]   = useState(false);
  const [inviteSelectedUser,      setInviteSelectedUser]      = useState<string | null>(null);
  const [isLocked,                setIsLocked]                = useState(room?.isLocked ?? false);
  const [currentSeatCount,        setCurrentSeatCount]        = useState(room?.maxParticipants ?? 8);
  const [customBgUri,             setCustomBgUri]             = useState<string | null>(room?.backgroundImage ?? null);
  const [isBgUploading,          setIsBgUploading]           = useState(false);
  const [isFreeSeat,              setIsFreeSeat]              = useState(true);
  const isFreeSeatRef = useRef(true);
  useEffect(() => { isFreeSeatRef.current = isFreeSeat; }, [isFreeSeat]);

  const [isMuteRoom,              setIsMuteRoom]              = useState(false);

  const [lockedSeats, setLockedSeats] = useState<Set<number>>(new Set());
  const lockedSeatsRef = useRef<Set<number>>(new Set());
  useEffect(() => { lockedSeatsRef.current = lockedSeats; }, [lockedSeats]);

  // ── Shared music playback state (lifted so music survives modal close) ──────
  const musicSoundRef   = useRef<Audio.Sound | null>(null);
  const [musicPlayingId,   setMusicPlayingId]   = useState<string | null>(null);
  const [musicIsPlaying,   setMusicIsPlaying]   = useState(false);
  const [musicCurrentTrack, setMusicCurrentTrack] = useState<MusicTrack | null>(null);
  const [musicVolume,       setMusicVolume]       = useState(0.75);
  const musicVolumeRef = useRef(0.75);
  // true hanya saat user ini yang memutar musik (bukan sync dari user lain)
  const [musicIsLocalPlayer, setMusicIsLocalPlayer] = useState(false);

  // ── Admin list for this room ─────────────────────────────────────────────
  const [roomAdmins, setRoomAdmins] = useState<string[]>([]);

  // Sync volume ke sound object setiap kali slider digeser
  useEffect(() => {
    musicVolumeRef.current = musicVolume;
    if (musicSoundRef.current) {
      musicSoundRef.current.setVolumeAsync(musicVolume).catch(() => {});
    }
  }, [musicVolume]);

  const [speakingUsers,    setSpeakingUsers]    = useState<Set<string>>(new Set());
  const [myHandRaised,     setMyHandRaised]     = useState(false);

  const hostGlowOpacity = useRef(new Animated.Value(0)).current;
  const giftBounceAnim  = useRef(new Animated.Value(0)).current;
  const gameBounceAnim  = useRef(new Animated.Value(0)).current;

  const flatRef              = useRef<FlatList>(null);
  const wsRef                = useRef<WebSocket | null>(null);
  const pingRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const seatPollRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef          = useRef(false);
  const hasJoinedRef         = useRef(false);
  const skipNextHistoryRef   = useRef(false);
  const speakingUnsubRef     = useRef<(() => void) | null>(null);
  const roomIdForReconnectRef = useRef<string | null>(null);
  const myLevelRef      = useRef<number>(currentUser?.migLevel ?? 1);
  const mySeatIndexRef  = useRef<number | null>(null);
  const audioInitRef    = useRef(false);
  const isMutedRef      = useRef(false);   // mirror isMuted tanpa closure stale

  // ── LiveKit auto-reconnect ─────────────────────────────────────────────────
  const lkReconnectTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lkReconnectAttemptsRef = useRef(0);
  const lkReconnectRoomIdRef   = useRef<string | null>(null);

  const currentUserRef  = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { luckyTapInfoRef.current = luckyTapInfo; }, [luckyTapInfo]);

  const profileCache    = useRef<Record<string, { avatarUrl: string | null; frameUrl: string | null; displayName: string | null }>>({});

  const addParticipant = useCallback((username: string, migLevel: number) => {
    if (!username || username === 'System') return;
    participantLevelRef.current.set(username, migLevel);
    if (!participantSetRef.current.has(username)) {
      participantSetRef.current.add(username);
      setParticipantCount(participantSetRef.current.size);
    }
  }, []);

  const removeParticipant = useCallback((username: string) => {
    if (!username || username === 'System') return;
    if (participantSetRef.current.has(username)) {
      participantSetRef.current.delete(username);
      participantLevelRef.current.delete(username);
      setParticipantCount(participantSetRef.current.size);
    }
  }, []);

  const [creatorAvatarUrl,    setCreatorAvatarUrl]    = useState<string | null>(null);
  const [creatorFrameUrl,     setCreatorFrameUrl]     = useState<string | null>(null);
  const [creatorDisplayName,  setCreatorDisplayName]  = useState<string | null>(null);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // ── Gift animation system ──────────────────────────────────────────────────
  // Single TapParticle system — flies from origin point to each occupied seat
  interface TapParticle {
    id: string; emoji: string; imageUrl?: string | null;
    startX: number; startY: number;
    translateX: Animated.Value; translateY: Animated.Value;
    opacity: Animated.Value; scale: Animated.Value;
  }
  const [tapParticles,  setTapParticles]  = useState<TapParticle[]>([]);
  // Optimistic multiplier — updates instantly on each tap, no server roundtrip
  const [luckyTapMultiplier,  setLuckyTapMultiplier]  = useState(1);
  const luckyTapMultiplierRef = useRef(1);
  const [giftBanner,         setGiftBanner]         = useState<GiftBannerData | null>(null);
  const [giftBannerQty,      setGiftBannerQty]      = useState(1);
  const [giftBannerExiting,  setGiftBannerExiting]  = useState(false);
  const giftBannerSessionRef  = useRef<string>('');   // "sender:giftName" untuk akumulasi qty
  const giftBannerActiveRef   = useRef(false);        // apakah banner sedang tampil (non-stale)
  // ── Jackpot Banner queue (X3/X9/X99/X199) ────────────────────────────────
  const [jpBannerQueue,    setJpBannerQueue]    = useState<JpBannerData[]>([]);
  const [jpBannerCurrent,  setJpBannerCurrent]  = useState<JpBannerData | null>(null);
  const jpBannerActiveRef = useRef(false);
  // ── Luxury Broadcast Banner queue ─────────────────────────────────────────
  const [luxBannerQueue,   setLuxBannerQueue]   = useState<LuxBannerData[]>([]);
  const [luxBannerCurrent, setLuxBannerCurrent] = useState<LuxBannerData | null>(null);
  const luxBannerActiveRef = useRef(false);
  const seatsRef        = useRef<Seat[]>([]);
  const seatsSectionYRef = useRef(0);
  const bannerTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomColorRef    = useRef<string>(PARTY_PURPLE);

  useEffect(() => { myLevelRef.current = currentUser?.migLevel ?? 1; }, [currentUser]);
  useEffect(() => { mySeatIndexRef.current = mySeatIndex; }, [mySeatIndex]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  // ── JackpotBanner queue drain ────────────────────────────────────────────────
  useEffect(() => {
    if (jpBannerCurrent) return;           // sudah tampil, tunggu selesai
    if (jpBannerQueue.length === 0) return;
    const [next, ...rest] = jpBannerQueue;
    setJpBannerQueue(rest);
    setJpBannerCurrent(next);
    jpBannerActiveRef.current = true;
  }, [jpBannerCurrent, jpBannerQueue]);

  // ── LuxuryBroadcastBanner queue drain ────────────────────────────────────────
  useEffect(() => {
    if (luxBannerCurrent) return;
    if (luxBannerQueue.length === 0) return;
    const [next, ...rest] = luxBannerQueue;
    setLuxBannerQueue(rest);
    setLuxBannerCurrent(next);
    luxBannerActiveRef.current = true;
  }, [luxBannerCurrent, luxBannerQueue]);

  // ── Fetch room coin leaderboard (reused by auto-load, button tap, pull-to-refresh) ──
  const fetchRoomCoinLb = useCallback(async (opts?: { showLoader?: boolean }) => {
    if (!room?.id) return;
    if (opts?.showLoader !== false) setRoomCoinLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/rooms/${room.id}/coin-total`, {
        credentials: 'include', headers,
      });
      if (!res.ok) return;
      const data = await res.json();
      setRoomCoinTotal(data.totalCoins ?? 0);
      setRoomCoinParticipants(
        (data.spenders ?? []).map((s: any) => ({ username: s.username, total_gift_sent: s.totalCoins }))
      );
    } catch {}
    setRoomCoinLoading(false);
  }, [room?.id]);

  // ── Auto-load room coin total saat room terbuka (semua kategori gift) ─────
  useEffect(() => {
    if (!room?.id || !visible) return;
    fetchRoomCoinLb({ showLoader: false });
  }, [room?.id, visible]);

  useEffect(() => {
    if (room) {
      setLocalName(room.name);
      setLocalDesc(room.description ?? null);
      setIsLocked(room.isLocked ?? false);
      if (room.maxParticipants) setCurrentSeatCount(room.maxParticipants);
    }
  }, [room?.id, room?.name, room?.description, room?.isLocked, room?.maxParticipants]);

  // ── Show password entry for non-owners entering locked rooms ───────────────
  useEffect(() => {
    if (!visible || !room) return;
    const owner = room.creatorUsername === currentUser?.username;
    if (room.isLocked && !owner) {
      setPwEntryVisible(true);
    }
  }, [visible, room?.id, room?.isLocked]);

  // ── Load follow status for room creator ────────────────────────────────────
  useEffect(() => {
    const creatorUsername = room?.creatorUsername;
    if (!creatorUsername || !currentUser || creatorUsername === currentUser.username) return;
    (async () => {
      try {
        const headers = await buildHeaders();
        const res = await fetch(`${API_BASE}/api/me/following`, { credentials: 'include', headers });
        if (!res.ok) return;
        const data = await res.json();
        const list: Array<{ username?: string; fusionUsername?: string }> = Array.isArray(data) ? data : (data.following ?? []);
        setIsFollowingCreator(list.some(u => (u.fusionUsername ?? u.username) === creatorUsername));
      } catch { }
    })();
  }, [room?.creatorUsername, currentUser?.username]);

  const handleFollowCreator = useCallback(async () => {
    const creatorUsername = room?.creatorUsername;
    if (!creatorUsername || followLoading) return;
    setFollowLoading(true);
    try {
      const headers = await buildHeaders();
      if (isFollowingCreator) {
        await fetch(`${API_BASE}/api/users/${encodeURIComponent(creatorUsername)}/follow`, {
          method: 'DELETE', credentials: 'include', headers,
        });
        setIsFollowingCreator(false);
      } else {
        await fetch(`${API_BASE}/api/users/${encodeURIComponent(creatorUsername)}/follow`, {
          method: 'POST', credentials: 'include',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        setIsFollowingCreator(true);
      }
    } catch { } finally {
      setFollowLoading(false);
    }
  }, [room?.creatorUsername, isFollowingCreator, followLoading]);

  // ── Fetch coin balance for Lucky Tap display ───────────────────────────────
  // ── Lucky Bag room claim handler ─────────────────────────────────────────
  const handleBagClaim = useCallback(async (bagId: number) => {
    if (!room?.id || claimingBagId !== null) return;
    setClaimingBagId(bagId);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/rooms/${room.id}/lucky-bag/${bagId}/claim`, {
        method: 'POST', credentials: 'include', headers,
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Gagal klaim', 'error'); return; }
      setBagClaimResult({ bagId, coins: data.coinEarned ?? 0 });
      setTimeout(() => setBagClaimResult(null), 2500);
      if (data.newBalance !== undefined) {
        tapCoinBalanceRef.current = data.newBalance;
        setTapCoinBalance(data.newBalance);
      }
    } catch { showToast('Gagal klaim, coba lagi', 'error'); }
    finally { setClaimingBagId(null); }
  }, [room?.id, claimingBagId]);

  // ── Global lucky bag claim handler ────────────────────────────────────────
  const handleGlobalBagClaim = useCallback(async (bagId: number) => {
    if (claimingGlobalBagId !== null) return;
    setClaimingGlobalBagId(bagId);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/lucky-bag-global/${bagId}/claim`, {
        method: 'POST', credentials: 'include', headers,
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Gagal klaim', 'error'); return; }
      setGlobalBagClaimResult({ bagId, coins: data.coinEarned ?? 0 });
      setTimeout(() => setGlobalBagClaimResult(null), 2500);
      if (data.newBalance !== undefined) {
        tapCoinBalanceRef.current = data.newBalance;
        setTapCoinBalance(data.newBalance);
      }
    } catch { showToast('Gagal klaim, coba lagi', 'error'); }
    finally { setClaimingGlobalBagId(null); }
  }, [claimingGlobalBagId]);

  const fetchTapBalance = useCallback(async () => {
    try {
      const username = currentUserRef.current?.username;
      if (!username) return;
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/credit/balance/${encodeURIComponent(username)}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      const bal = Number(data.balance ?? 0);
      tapCoinBalanceRef.current = bal;
      setTapCoinBalance(bal);
    } catch {}

  // ── Fetch Grady leaderboard ─────────────────────────────────────────────
  }, []);
  const fetchGradyLeaderboard = useCallback(async () => {
    try {
      setGradyLbLoading(true);
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/games/grady/top-winners`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setGradyLbData(data);
    } catch {} finally {
      setGradyLbLoading(false);
    }
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEv, e =>
      Animated.timing(kbOffset, { toValue: e.endCoordinates.height, duration: e.duration ?? 220, useNativeDriver: false }).start());
    const onHide = Keyboard.addListener(hideEv, e =>
      Animated.timing(kbOffset, { toValue: 0, duration: e.duration ?? 180, useNativeDriver: false }).start());
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // ── Refresh balance when Grady game opens ─────────────────────────────────
  useEffect(() => {
    if (gradyGameWebView) fetchTapBalance();
  }, [gradyGameWebView]);

  // ── Slide animation + self entry banner ───────────────────────────────────
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 55, friction: 11 }).start();
      const uname       = currentUserRef.current?.username ?? '';
      const selfDisplay = currentUserRef.current?.displayName ?? null;
      // Track username so WS handler won't double-trigger otherEntryData for self
      selfEntryUsernameRef.current = uname;
      // Only show entry banner ONCE per session (not on reconnect / background-return)
      if (selfEntryShownRef.current) return;
      selfEntryShownRef.current = true;
      const t = setTimeout(async () => {
        setSelfEntryData({ username: uname, displayName: selfDisplay, avatarUrl: null, effectUrl: null });
        try {
          const [p, effectUrl] = await Promise.all([
            fetchProfileAvatar(uname),
            getActiveEntryEffect(),
          ]);
          setSelfEntryData({ username: uname, displayName: p.displayName ?? selfDisplay, avatarUrl: p.avatarUrl, effectUrl });
        } catch {}
      }, 450);
      return () => clearTimeout(t);
    } else {
      Animated.timing(slideAnim, { toValue: SH, duration: 260, useNativeDriver: true }).start();
      selfEntryUsernameRef.current = null;
      selfEntryShownRef.current    = false;
      setSelfEntryData(null);
      setOtherEntryData(null);
    }
  }, [visible]);

  const pushMsg = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Unified gift particle: flies from a point to ALL occupied seats ──────
  // Used for both: TAP button bursts AND incoming WS GIFT events.
  // originX/Y = center of the launch point (gift button or TAP button).
  // targetSeatIndices = seats to animate to; defaults to all occupied.
  const triggerTapToAllSeats = useCallback((
    emoji: string,
    imageUrl?: string | null,
    originX?: number,
    originY?: number,
    targetSeatIndices?: number[],
  ) => {
    const currentSeats = seatsRef.current;
    const indices = targetSeatIndices ?? currentSeats.filter(s => !!s.username).map(s => s.index);
    if (indices.length === 0) return;

    // Default origin: gift icon area in toolbar (bottom-center-right)
    const ox = originX ?? SW * 0.64;
    const oy = originY ?? SH - 78;

    const now = Date.now();
    const newParticles: TapParticle[] = indices.map((seatIdx, i) => {
      const col = (seatIdx - 1) % 4;
      const row = Math.floor((seatIdx - 1) / 4);
      const targetX = SEAT_H_PAD + col * (SEAT_SIZE + SEAT_GAP) + SEAT_SIZE / 2 - 20;
      const targetY = seatsSectionYRef.current + 10 + row * (SEAT_FRAME_SIZE + 30 + 4)
                    + Math.round((SEAT_FRAME_SIZE - SEAT_SIZE) / 2) + SEAT_SIZE / 2 - 20;

      const deltaX    = targetX - ox;
      const deltaY    = targetY - oy;
      const delay     = i * 60;
      const travel    = 520;

      const id         = `gift-${now}-${seatIdx}-${i}`;
      const translateX = new Animated.Value(0);
      const translateY = new Animated.Value(0);
      const opacity    = new Animated.Value(0);
      const scale      = new Animated.Value(0.6);

      Animated.sequence([
        Animated.delay(delay),
        // Phase 1: pop in + fly to seat
        Animated.parallel([
          // Fade in quickly
          Animated.timing(opacity, {
            toValue: 1, duration: 120, useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          // Scale from small to normal
          Animated.timing(scale, {
            toValue: 1, duration: 200, useNativeDriver: true,
            easing: Easing.out(Easing.back(1.5)),
          }),
          // Fly to target seat with smooth deceleration
          Animated.timing(translateX, {
            toValue: deltaX, duration: travel, useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
          Animated.timing(translateY, {
            toValue: deltaY, duration: travel, useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
        ]),
        // Phase 2: pop burst on landing
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.5, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
            Animated.timing(scale, { toValue: 1.0, duration: 140, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
          ]),
        ]),
        // Phase 3: fade out
        Animated.timing(opacity, {
          toValue: 0, duration: 280, useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ]).start(() => {
        setTapParticles(prev => prev.filter(p => p.id !== id));
      });

      return { id, emoji, imageUrl, startX: ox, startY: oy, translateX, translateY, opacity, scale };
    });

    setTapParticles(prev => {
      const next = [...prev, ...newParticles];
      // Cap at 20 concurrent particles — drop oldest
      return next.length > 20 ? next.slice(next.length - 20) : next;
    });
  }, []);

  // ── Fetch foto profil + frame (dengan cache) ──────────────────────────────
  const fetchProfileAvatar = useCallback(async (username: string) => {
    if (profileCache.current[username]) return profileCache.current[username];
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/profile/${username}`, { headers });
      if (!res.ok) throw new Error('profile fetch failed');
      const data = await res.json();
      const result = {
        avatarUrl:   data.profile?.displayPicture ?? null,
        frameUrl:    data.avatarFrameUrl ?? null,
        displayName: data.user?.displayName ?? data.displayName ?? null,
      };
      profileCache.current[username] = result;
      return result;
    } catch {
      const fallback = { avatarUrl: null, frameUrl: null, displayName: null };
      profileCache.current[username] = fallback;
      return fallback;
    }
  }, []);

  // ── Sync seats dari party API ─────────────────────────────────────────────
  const syncSeats = useCallback(async (roomId: string) => {
    try {
      const state = await fetchPartyState(roomId);
      if (!state) return;
      const count = state.maxSeats ?? currentSeatCount;
      if (state.maxSeats && state.maxSeats !== currentSeatCount) {
        setCurrentSeatCount(state.maxSeats);
      }
      // Sync background dari state poll — pastikan semua user dapat background terbaru
      // bahkan jika mereka terputus dan melewatkan BG_CHANGE WebSocket message
      if (state.backgroundImage !== undefined) {
        setCustomBgUri(prev => {
          // Normalize (relative /uploads/... paths → full URL with API_BASE)
          const incoming = normalizeBgUrl(state.backgroundImage);
          return prev === incoming ? prev : incoming;
        });
      }
      // Init locked seats dari server state (kursi yang dikunci dan kosong)
      if (state.lockedSeats && state.lockedSeats.length > 0) {
        setLockedSeats(new Set(state.lockedSeats));
      }
      const rawSeats: Seat[] = Array.from({ length: count }, (_, i) => {
        const s = state.seats?.find((x: any) => x.seat_index === i + 1);
        return {
          index: i + 1,
          username: s?.username ?? null,
          displayName: s?.display_name ?? null,
          isMuted: s?.is_muted ?? false,
          isHandRaised: s?.is_hand_raised ?? false,
          // Tampilan pakai seat_coins (100% coin), bukan seat_diamonds
          diamonds: s?.username ? Number(s?.seat_coins ?? 0) : 0,
        };
      });
      // Preserve session-accumulated coins on top of DB balance (pick whichever is larger)
      setSeats(prev => rawSeats.map(s => {
        const existing = prev.find(p => p.index === s.index && p.username === s.username);
        const sessionCoins = existing?.diamonds ?? 0;
        return { ...s, diamonds: Math.max(s.diamonds ?? 0, sessionCoins) };
      }));
      // Fetch avatar + frame untuk semua kursi terisi (paralel)
      const occupied = rawSeats.filter(s => s.username);
      if (!occupied.length) return;
      const profiles = await Promise.all(
        occupied.map(s => fetchProfileAvatar(s.username!).then(p => ({ index: s.index, ...p })))
      );
      setSeats(prev => prev.map(s => {
        const p = profiles.find(r => r.index === s.index);
        return p ? { ...s, avatarUrl: p.avatarUrl, avatarFrameUrl: p.frameUrl } : s;
      }));
    } catch { }
  }, [fetchProfileAvatar]);

  // ── Connect LiveKit audio ─────────────────────────────────────────────────
  const connectAudio = useCallback(async (roomId: string, asPublisher: boolean, password?: string) => {
    // Batalkan reconnect timer lama sebelum koneksi baru
    if (lkReconnectTimerRef.current) {
      clearTimeout(lkReconnectTimerRef.current);
      lkReconnectTimerRef.current = null;
    }
    lkReconnectRoomIdRef.current = roomId;

    setAudioStatus('connecting');
    try {
      const role = asPublisher ? 'publisher' : 'audience';
      const tokenInfo = await fetchLiveKitToken(roomId, role, password);
      if (!tokenInfo) {
        console.warn('[party] token info null — LiveKit mungkin belum dikonfigurasi');
        setAudioStatus('error');
        return false;
      }
      if (!tokenInfo.url) {
        console.warn('[party] LiveKit URL kosong — set LIVEKIT_URL / LIVEKIT_CLOUD_URL di env server');
        setAudioStatus('error');
        return false;
      }

      if (asPublisher) {
        const hasMic = await ensurePartyMicPermission();
        if (!hasMic) {
          setAudioStatus('error');
          return false;
        }
      }

      setLkProvider(tokenInfo.provider ?? null);
      console.log(`[party] Connecting via ${tokenInfo.provider ?? 'unknown'}: ${tokenInfo.url}`);

      // ── Auto-reconnect handler — dipanggil partyService saat koneksi putus tak terduga ──
      const handleUnexpectedDisconnect = () => {
        if (!isActiveRef.current) return; // modal sudah ditutup — jangan reconnect

        if (lkReconnectAttemptsRef.current >= 5) {
          console.warn('[party] Auto-reconnect: max attempts reached');
          setAudioStatus('error');
          showToast('Koneksi audio terputus. Keluar dan masuk lagi ke kursi untuk terhubung.', 'error');
          return;
        }

        const attempt = lkReconnectAttemptsRef.current;
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s
        const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
        lkReconnectAttemptsRef.current += 1;

        console.log(`[party] Auto-reconnect attempt ${lkReconnectAttemptsRef.current}/5 in ${delay}ms`);
        setAudioStatus('connecting');
        showToast(`Audio terputus, mencoba ulang... (${lkReconnectAttemptsRef.current}/5)`, 'info');

        lkReconnectTimerRef.current = setTimeout(async () => {
          if (!isActiveRef.current) return;
          const rid = lkReconnectRoomIdRef.current;
          if (!rid) return;

          try {
            const isPublisher = mySeatIndexRef.current !== null;
            const newRole = isPublisher ? 'publisher' : 'audience';
            const newTokenInfo = await fetchLiveKitToken(rid, newRole);
            if (!newTokenInfo?.url) {
              // Token gagal diambil — coba lagi
              handleUnexpectedDisconnect();
              return;
            }
            setLkProvider(newTokenInfo.provider ?? null);
            const ok = await connectLiveKitRoom(
              newTokenInfo.url,
              newTokenInfo.token,
              isPublisher,
              handleUnexpectedDisconnect, // terus monitor disconnect berikutnya
            );
            if (ok) {
              lkReconnectAttemptsRef.current = 0;
              setAudioStatus('connected');
              showToast('Koneksi audio berhasil dipulihkan!', 'success');
              if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
              speakingUnsubRef.current = subscribeToSpeaking(ids => setSpeakingUsers(new Set(ids)));
            } else {
              handleUnexpectedDisconnect(); // connectLiveKitRoom gagal — coba lagi
            }
          } catch {
            handleUnexpectedDisconnect();
          }
        }, delay);
      };

      const connected = await connectLiveKitRoom(tokenInfo.url, tokenInfo.token, asPublisher, handleUnexpectedDisconnect);
      if (connected) {
        lkReconnectAttemptsRef.current = 0; // reset counter setiap connect sukses
      }
      setAudioStatus(connected ? 'connected' : 'error');

      if (connected) {
        // Cleanup unsubscribe lama kalau ada
        if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
        speakingUnsubRef.current = subscribeToSpeaking(identities => {
          setSpeakingUsers(new Set(identities));
        });
      }

      return connected;
    } catch (err) {
      console.warn('[party] connectAudio error:', err);
      setAudioStatus('error');
      return false;
    }
  }, [showToast]);

  // ── Init voice saat party room dibuka ─────────────────────────────────────
  const initVoice = useCallback(async (r: PartyRoom, me: typeof currentUser) => {
    if (!me || audioInitRef.current) return;
    audioInitRef.current = true;

    try {
      // Sync kursi dulu, cek apakah user sudah punya kursi dari session sebelumnya
      const state = await fetchPartyState(r.id);
      if (state) {
        const initCount = state.maxSeats ?? r.maxParticipants ?? 8;
        if (state.maxSeats) setCurrentSeatCount(state.maxSeats);
        // Init locked seats dari server — penting untuk user yang baru join
        if (state.lockedSeats && state.lockedSeats.length > 0) {
          setLockedSeats(new Set(state.lockedSeats));
        }
        const rawSeats: Seat[] = Array.from({ length: initCount }, (_, i) => {
          const s = state.seats?.find((x: any) => x.seat_index === i + 1);
          return {
            index: i + 1,
            username: s?.username ?? null,
            displayName: s?.display_name ?? null,
            isMuted: s?.is_muted ?? false,
            isHandRaised: s?.is_hand_raised ?? false,
          };
        });
        setSeats(rawSeats);

        // Cek apakah user sudah duduk dari session sebelumnya
        const myExistingSeat = state.seats?.find((s: any) => s.username === me.username);
        if (myExistingSeat) {
          const existingIdx = Number(myExistingSeat.seat_index);
          console.log(`[party] initVoice: user sudah di kursi ${existingIdx} — connect sebagai publisher`);
          setMySeatIndex(existingIdx);
          const myProfile = await fetchProfileAvatar(me.username);
          setSeats(prev => prev.map(s =>
            s.index === existingIdx
              ? { ...s, username: me.username, displayName: me.displayName ?? null,
                  avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
              : s,
          ));
          await connectAudio(r.id, true);
          return;
        }
      }

      const isHost = r.creatorUsername === me.username;

      if (isHost) {
        const result = await takePartySeat(r.id, 1);
        if (result.ok) {
          setMySeatIndex(1);
          const myProfile = await fetchProfileAvatar(me.username);
          setSeats(prev => prev.map(s =>
            s.index === 1
              ? { ...s, username: me.username, displayName: me.displayName ?? null,
                  avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
              : s,
          ));
          await connectAudio(r.id, true);
        } else if (result.error?.includes('sudah di kursi')) {
          // Seat sudah diambil user ini (409) — tetap connect sebagai publisher
          const match = result.error.match(/kursi (\d+)/);
          const existingSeat = match ? parseInt(match[1], 10) : 1;
          console.log(`[party] initVoice host: 409 sudah di kursi ${existingSeat} — connect sebagai publisher`);
          setMySeatIndex(existingSeat);
          const myProfile = await fetchProfileAvatar(me.username);
          setSeats(prev => prev.map(s =>
            s.index === existingSeat
              ? { ...s, username: me.username, displayName: me.displayName ?? null,
                  avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
              : s,
          ));
          await connectAudio(r.id, true);
        } else {
          await connectAudio(r.id, false);
        }
      } else {
        await connectAudio(r.id, false);
      }
    } catch (err) {
      console.warn('[party] initVoice error:', err);
      setAudioStatus('error');
    }
  }, [connectAudio, fetchProfileAvatar]);

  // ── WebSocket (chat) ───────────────────────────────────────────────────────
  const disconnectWS = useCallback(() => {
    isActiveRef.current = false;
    if (pingRef.current)     { clearInterval(pingRef.current);    pingRef.current     = null; }
    if (seatPollRef.current) { clearInterval(seatPollRef.current); seatPollRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch { } wsRef.current = null; }
    setWsStatus('disconnected');
  }, []);

  const connectWS = useCallback(async (roomId: string) => {
    disconnectWS();
    isActiveRef.current  = true;
    hasJoinedRef.current = false;
    roomIdForReconnectRef.current = roomId;
    setWsStatus('connecting');

    const authToken = await getAuthToken();
    const session   = await getSession();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = async (e) => {
      if (!isActiveRef.current) return;
      try {
        const p = JSON.parse(e.data);

        if (p.type === 'WELCOME') {
          if (authToken) {
            ws.send(JSON.stringify({ type: 'AUTH', token: authToken }));
          } else if (currentUserRef.current?.username) {
            // Fallback: kirim username dari currentUser (tidak ada JWT)
            // session dari getSession() adalah cookie string bukan object, jadi tidak bisa akses .userId/.username
            ws.send(JSON.stringify({ type: 'AUTH', username: currentUserRef.current.username }));
          }
          return;
        }

        if (p.type === 'AUTH_OK') {
          setWsStatus('connected');
          if (p.migLevel) myLevelRef.current = p.migLevel;
          ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, isBackgroundReturn: hasJoinedRef.current }));
          hasJoinedRef.current = true;
          pingRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
          }, PING_MS);
          return;
        }

        if (p.type === 'PONG') return;

        if (p.type === 'SUBSCRIBED' && p.roomId === roomId) {
          if (p.userColor) setMyColor(toColor(p.userColor, PARTY_PURPLE));
          // Sync background saat join/rejoin — pastikan semua user dapat state terbaru
          if (p.room?.backgroundImage !== undefined) {
            setCustomBgUri(normalizeBgUrl(p.room.backgroundImage));
          }
          return;
        }

        // ── PARTICIPANTS — authoritative member list from server ───────────────
        // Gateway broadcasts this on join/leave/mute/admin changes.
        // Use it as the ground truth for participant count — replaces the
        // message-based heuristic which misses silent listeners.
        if (p.type === 'PARTICIPANTS' && p.roomId === roomId) {
          const all: string[] = [
            ...(p.participants        ?? []),
            ...(p.administrators      ?? []),
            ...(p.mutedParticipants   ?? []),
          ];
          if (all.length > 0) {
            // Rebuild the set from the server list to stay fully in sync
            participantSetRef.current = new Set(all);
            setParticipantCount(participantSetRef.current.size);
          }
          return;
        }

        if ((p.type === 'MESSAGES' || p.type === 'HISTORY') && p.roomId === roomId) {
          // Saat masuk room pertama kali: skip history agar chat mulai bersih
          if (skipNextHistoryRef.current) {
            skipNextHistoryRef.current = false;
            return;
          }
          const hist: ChatMessage[] = (p.messages ?? [])
            .filter((m: any) => {
              const t: string = m.text ?? '';
              if (t.trimStart().startsWith('<<') && t.trimEnd().endsWith('>>')) return false;
              if (m.isSystem && /has left/.test(t)) return false;
              return true;
            })
            .map((m: any) => ({
              id:          m.id ?? `h-${Math.random()}`,
              username:    m.senderUsername ?? 'System',
              displayName: m.senderDisplayName ?? null,
              migLevel:    m.senderMigLevel ?? 0,
              text:        m.text ?? '',
              color:       toColor(m.senderColor, PARTY_PURPLE),
              isSystem:    !!m.isSystem,
              ts:          m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
              isHost:      m.senderUsername === room?.creatorUsername,
              avatarUrl:   m.senderAvatarUrl ?? null,
            }));
          hist.forEach(m => { if (!m.isSystem) addParticipant(m.username, m.migLevel); });
          setMessages(prev => {
            const ids = new Set(prev.map(m => m.id));
            return [...prev, ...hist.filter(m => !ids.has(m.id))];
          });
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 120);
          return;
        }

        if (p.type === 'MESSAGE' && p.roomId === roomId && p.message) {
          const m = p.message;
          const msgText: string = m.text ?? '';
          // Filter pesan gift (format << ... >>) — sudah ada banner + animasi gift
          if (msgText.trimStart().startsWith('<<') && msgText.trimEnd().endsWith('>>')) return;
          // "has left" system message — kurangi participant count lalu filter
          if (m.isSystem && /has left/.test(msgText)) {
            const parsed = parseSystemText(msgText);
            const leaver = parsed?.username ?? m.senderUsername ?? null;
            if (leaver) removeParticipant(leaver);
            return;
          }
          // ── Trigger sliding banner saat user lain masuk room ──────────────
          if (m.isSystem && /has entered/.test(msgText)) {
            const parsed = parseSystemText(msgText);
            const joiner = parsed?.username ?? m.senderUsername ?? null;
            // Guard: skip if joiner is self — checked via currentUserRef AND selfEntryUsernameRef
            // to prevent double effect (self banner already handled separately)
            const isSelfJoiner = joiner && (
              joiner === currentUserRef.current?.username ||
              joiner === selfEntryUsernameRef.current
            );
            if (joiner && !isSelfJoiner) {
              // Use displayName from message if available — avoids flash of username
              const joinerDisplay = (m as any).senderDisplayName ?? null;
              setOtherEntryData({ username: joiner, displayName: joinerDisplay, avatarUrl: null, effectUrl: null });
              Promise.all([
                fetchProfileAvatar(joiner),
                getUserActiveEntryEffect(joiner),
              ]).then(([p, effectUrl]) => {
                setOtherEntryData({ username: joiner, displayName: p.displayName ?? joinerDisplay, avatarUrl: p.avatarUrl, effectUrl });
              }).catch(() => {});
            }
          }
          if (!m.isSystem && m.senderUsername) addParticipant(m.senderUsername, m.senderMigLevel ?? 0);
          pushMsg({
            id:          m.id ?? `l-${Date.now()}`,
            username:    m.senderUsername ?? 'System',
            displayName: (m as any).senderDisplayName ?? null,
            migLevel:    m.senderMigLevel ?? 0,
            text:        msgText,
            color:       toColor(m.senderColor, PARTY_PURPLE),
            isSystem:    !!m.isSystem,
            ts:          m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
            isHost:      m.senderUsername === room?.creatorUsername,
            avatarUrl:   (m as any).senderAvatarUrl ?? null,
            agencyName:  (m as any).senderAgencyName ?? null,
          });
          return;
        }

        // ── Lucky Bag broadcast ──────────────────────────────────────────────
        if (p.type === 'LUCKY_BAG_SENT' && p.roomId === roomId) {
          const sender    = p.senderUsername ?? 'Seseorang';
          const coins     = p.totalCoins ?? 0;
          const count     = p.bagCount ?? 0;
          const bagId     = p.bagId;
          const expiresAt = p.expiresAt ? Number(p.expiresAt) : Date.now() + 3 * 60 * 1000;
          const msLeft    = Math.max(0, expiresAt - Date.now());
          // Tambah ke room overlay
          if (bagId) {
            setRoomLuckyBags(prev => {
              if (prev.find(b => b.id === bagId)) return prev;
              return [...prev, {
                id: bagId, senderUsername: sender,
                totalCoins: coins, bagCount: count,
                bagsRemaining: count,
                expiresAt,
              }];
            });
            // Auto-remove dari UI setelah expired
            if (msLeft > 0) {
              setTimeout(() => {
                setRoomLuckyBags(prev => prev.filter(b => b.id !== bagId));
                pushMsg({
                  id:       `lb-expired-${bagId}-${Date.now()}`,
                  username: 'System',
                  migLevel: 0,
                  text:     `⏰ Lucky Bag dari ${sender} sudah expired.`,
                  color:    '#9CA3AF',
                  isSystem: true,
                  ts:       Date.now(),
                });
              }, msLeft);
            }
          }
          pushMsg({
            id:       `lb-sent-${bagId}-${Date.now()}`,
            username: 'System',
            migLevel: 0,
            text:     `🎁 ${sender} mengirim Lucky Bag ${count}x senilai ${coins >= 1000 ? (coins/1000).toFixed(coins%1000===0?0:1)+'K' : coins} coin! Klik untuk klaim! (3 menit)`,
            color:    '#F59E0B',
            isSystem: true,
            ts:       Date.now(),
          });
          return;
        }

        // ── Lucky Bag expired broadcast ──────────────────────────────────────
        if (p.type === 'LUCKY_BAG_EXPIRED' && p.roomId === roomId) {
          if (p.bagId) {
            setRoomLuckyBags(prev => prev.filter(b => b.id !== p.bagId));
          }
          return;
        }

        if (p.type === 'LUCKY_BAG_CLAIMED' && p.roomId === roomId) {
          const claimer = p.claimerUsername ?? 'Seseorang';
          const earned  = p.coinEarned ?? 0;
          // Update bagsRemaining di room overlay
          if (p.bagId) {
            setRoomLuckyBags(prev =>
              prev.map(b => b.id === p.bagId
                ? { ...b, bagsRemaining: b.bagsRemaining - 1 }
                : b
              ).filter(b => b.bagsRemaining > 0)
            );
          }
          pushMsg({
            id:       `lb-claim-${p.bagId}-${Date.now()}`,
            username: 'System',
            migLevel: 0,
            text:     `🪙 ${claimer} mendapat ${earned >= 1000 ? (earned/1000).toFixed(1)+'K' : earned} coin dari Lucky Bag!`,
            color:    '#10B981',
            isSystem: true,
            ts:       Date.now(),
          });
          return;
        }

        // ── Lucky Bag GLOBAL broadcast ───────────────────────────────────────
        if (p.type === 'LUCKY_BAG_GLOBAL_SENT') {
          const sender    = p.senderUsername  ?? 'Seseorang';
          const coins     = p.totalCoins      ?? 0;
          const count     = p.bagCount        ?? 0;
          const roomName  = p.senderRoomName  ?? 'Party';
          const fmtC = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(n%1000===0?0:1)}K` : String(n);
          const bagInfo: GlobalBagInfo = {
            bagId:           p.bagId,
            senderUsername:  sender,
            senderRoomId:    p.senderRoomId   ?? '',
            senderRoomName:  roomName,
            totalCoins:      coins,
            bagCount:        count,
          };
          // Show animated banner
          setGlobalBanner(bagInfo);
          // Show claim bubble immediately
          setGlobalClaimBags(prev => {
            if (prev.find(b => b.bagId === bagInfo.bagId)) return prev;
            return [...prev, { ...bagInfo, bagsRemaining: count }];
          });
          pushMsg({
            id:       `lbg-sent-${p.bagId}-${Date.now()}`,
            username: 'System',
            migLevel: 0,
            text:     `🌍 ${sender} kirim Lucky Bag Global ${count}x senilai ${fmtC(coins)} coin di room ${roomName}! Klik untuk klaim!`,
            color:    '#22C55E',
            isSystem: true,
            ts:       Date.now(),
          });
          return;
        }

        if (p.type === 'LUCKY_BAG_GLOBAL_CLAIMED') {
          const claimer = p.claimerUsername ?? 'Seseorang';
          const earned  = p.coinEarned      ?? 0;
          const fmtC = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n);
          if (p.bagId) {
            setGlobalClaimBags(prev =>
              prev.map(b => b.bagId === p.bagId
                ? { ...b, bagsRemaining: p.bagsRemaining ?? b.bagsRemaining - 1 }
                : b
              ).filter(b => b.bagsRemaining > 0)
            );
          }
          pushMsg({
            id:       `lbg-claim-${p.bagId}-${Date.now()}`,
            username: 'System',
            migLevel: 0,
            text:     `🌍🪙 ${claimer} mendapat ${fmtC(earned)} coin dari Lucky Bag Global!`,
            color:    '#22C55E',
            isSystem: true,
            ts:       Date.now(),
          });
          return;
        }

        // ── Game Win announcement broadcast (global ≥50k or room-local) ──────
        if (p.type === 'GAME_WIN' && (p.isGlobal || p.roomId === roomId)) {
          pushMsg({
            id:          p.eventId ?? `gw-${p.username}-${p.amount}-${Math.floor(Date.now() / 3000)}`,
            username:    p.username ?? 'Unknown',
            migLevel:    0,
            text:        '',
            color:       '#F59E0B',
            isSystem:    false,
            isGameWin:   true,
            gameWinData: {
              gameName:  p.gameName  ?? 'Game',
              gameEmoji: p.gameEmoji ?? '🎮',
              amount:    Number(p.amount ?? 0),
              slotEmoji: p.slotEmoji ?? '🎰',
              isGlobal:  p.isGlobal ?? false,
            },
            ts: Date.now(),
          });
          return;
        }

        if (p.type === 'GIFT' && p.roomId === roomId) {
          const { sender, giftEmoji = '🎁', giftName = 'gift', recipient, qty = 1, price = 0, unitPrice = 0, lottieUrl = null, videoUrl = null, giftImageUrl = null, giftCategory = null } = p;
          const currentSeats = seatsRef.current;
          const isLucky = String(giftCategory ?? '').toLowerCase() === 'lucky';

          // Animate ONLY to the actual recipient seat(s).
          // Do NOT use isLucky to bypass recipient — Lucky gifts sent to a specific
          // user must fly only to that user's seat, not all occupied seats.
          let targetIndices: number[];
          if (String(recipient).toLowerCase() === 'all') {
            targetIndices = currentSeats.filter(s => !!s.username).map(s => s.index);
          } else {
            const found = currentSeats.find(s => s.username?.toLowerCase() === String(recipient ?? '').toLowerCase());
            targetIndices = found ? [found.index] : [];
          }
          triggerTapToAllSeats(giftEmoji, giftImageUrl, undefined, undefined, targetIndices);

          // Akumulasi coin per kursi untuk tampilan UI — selalu 100% nilai coin gift
          // (backend konversi ke diamond untuk WD, tapi UI tampilkan coin penuh)
          const coinsEarned = (unitPrice || price) * qty;
          if (targetIndices.length > 0 && coinsEarned > 0) {
            setSeats(prev => prev.map(s =>
              targetIndices.includes(s.index)
                ? { ...s, diamonds: (s.diamonds ?? 0) + coinsEarned }
                : s,
            ));
          }

          // Update room coin total real-time — semua kategori gift
          if (price > 0) {
            setRoomCoinTotal(prev => prev + price);
          }

          // During an active tap session, banner is owned by the optimistic tap handler.
          // Skip server echo banner update to prevent double-counting.
          const isMyLuckyEcho = isLuckyTapSessionRef.current
            && isLucky
            && sender === currentUserRef.current?.username;

          const isMyOwnGift = sender === currentUserRef.current?.username;

          if (!isMyLuckyEcho) {
            const senderAvatar = profileCache.current[sender]?.avatarUrl ?? null;
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);

            const sessionKey    = `${sender}:${giftName}`;
            const isSameSession = giftBannerSessionRef.current === sessionKey && giftBannerActiveRef.current;

            if (isSameSession) {
              setGiftBannerQty(prev => prev + qty);
              setGiftBannerExiting(false);
            } else {
              const giftData: GiftBannerData = { sender, senderAvatarUrl: senderAvatar, emoji: giftEmoji, giftImageUrl, qty, giftName, roomColor: roomColorRef.current, price, unitPrice: unitPrice || price, lottieUrl, videoUrl };
              giftBannerSessionRef.current = sessionKey;
              giftBannerActiveRef.current  = true;
              setGiftBannerQty(qty);
              setGiftBannerExiting(false);
              setGiftBanner(giftData);
              // Sender already sees their own mini-card — skip fullscreen splash echo for them
              if (!isLucky && !isMyOwnGift) setGiftSplash(giftData);
            }
            bannerTimerRef.current = setTimeout(() => setGiftBannerExiting(true), 3500);
          }
          return;
        }

        // ── LUCKY_JACKPOT (legacy per-room) ──────────────────────────────────
        if (p.type === 'LUCKY_JACKPOT' && p.roomId === roomId) {
          const jpData: JackpotData = {
            tier:        p.tier        ?? 'Lucky JP',
            tierEmoji:   p.tierEmoji   ?? '🍀',
            multiplier:  p.multiplier  ?? 10,
            milestone:   p.milestone   ?? 100,
            counter:     p.counter     ?? 0,
            winner:      p.winner      ?? '?',
            reward:      p.reward      ?? 0,
            giftPrice:   p.giftPrice   ?? 0,
            giftName:    p.giftName    ?? 'Lucky',
            giftEmoji:   p.giftEmoji   ?? '🍀',
            triggeredBy: p.triggeredBy ?? p.sender ?? '?',
          };
          pushMsg({
            id:          `jp-${Date.now()}-${Math.random()}`,
            username:    jpData.winner,
            migLevel:    0,
            text:        '',
            color:       '#fff',
            isSystem:    false,
            isJackpot:   true,
            jackpotData: jpData,
            ts:          Date.now(),
          });
          return;
        }

        // ── GIFT_BILLING — server confirms deduction, sync real balance ─────────
        if (p.type === 'GIFT_BILLING') {
          const real = Number(p.remainingBalance ?? 0);
          tapCoinBalanceRef.current = real;
          setTapCoinBalance(real);
          return;
        }

        // ── LUCKY_JACKPOT_GLOBAL — milestone baru (X1_500/X3/X9/X99/X199) ───
        if (p.type === 'LUCKY_JACKPOT_GLOBAL') {
          const winners: string[] = Array.isArray(p.winners) ? p.winners : [p.winners ?? '?'];
          const milestoneKey: string = (p.milestone as string) ?? 'X1_500';

          // Map milestone key → emoji & display label (terima dari server, fallback lokal)
          const emojiMap: Record<string, string> = {
            'X1_500': '🎊', 'X3': '🥉', 'X9': '🥈', 'X99': '🥇', 'X199': '👑',
            // legacy fallback
            '10x': '🍀', '20x': '🌟', '50x': '🔥',
            '100x': '🥉', '200x': '🥈', '300x': '🥇', '500x': '👑', 'SUPER': '💎',
          };
          // milestone num: hanya dipakai untuk logika warna legacy, baru pakai milestoneKey
          const numMap: Record<string, number> = {
            'X1_500': 1, 'X3': 3, 'X9': 9, 'X99': 99, 'X199': 199,
            '10x': 10, '20x': 20, '50x': 50,
            '100x': 100, '200x': 200, '300x': 300, '500x': 500, 'SUPER': 9999,
          };

          // isRoomTier: semua tier yang hanya broadcast ke room (bukan global)
          const isRoomTier = milestoneKey === 'X3' || milestoneKey === 'X9'
            || milestoneKey === 'X99' || milestoneKey === 'X199'
            || milestoneKey.startsWith('50X_') || milestoneKey.startsWith('100X_');

          // Gunakan flag eksplisit dari server (isGlobalBroadcast), fallback ke !isRoomTier
          const isGlobal = (p.isGlobalBroadcast as boolean | undefined) ?? !isRoomTier;

          const base = {
            tier:         p.label        ?? milestoneKey,
            tierEmoji:    p.emoji        ?? emojiMap[milestoneKey] ?? '🎊',
            milestoneKey,
            multiplier:   numMap[milestoneKey] ?? 1,
            milestone:    numMap[milestoneKey] ?? 1,
            counter:      0,
            reward:       (p.reward as number)      ?? 0,
            giftPrice:    (p.giftPrice as number)   ?? 100,
            giftName:     'Lucky Gift',
            giftEmoji:    '🎁',
            triggeredBy:  (p.triggeredBy as string) ?? '?',
            isGlobal,
            totalCoin:    (p.totalCoin as number)   ?? 0,
            queueIdx:     (p.queueIdx as number)    ?? 0,
            queueTotal:   (p.queueTotal as number)  ?? 0,
          };
          const now = Date.now();
          winners.forEach((winner, idx) => {
            pushMsg({
              id:          `jp-global-${now}-${milestoneKey}-${idx}-${Math.random()}`,
              username:    winner,
              migLevel:    0,
              text:        '',
              color:       '#fff',
              isSystem:    false,
              isJackpot:   true,
              jackpotData: { ...base, winner },
              ts:          now + idx,
            });
          });

          // ── Banner melayang (masuk kanan → keluar kiri) untuk semua tier ──
          const bannerEmoji = (base.tierEmoji as string) ?? '🎊';
          const bannerLabel = (p.label as string) ?? milestoneKey;
          winners.forEach((winner, idx) => {
            const bannerEntry: JpBannerData = {
              milestoneKey,
              label:  bannerLabel,
              emoji:  bannerEmoji,
              winner,
              reward: (p.reward as number) ?? 0,
            };
            // Jeda antar banner supaya tidak tumpang tindih
            setTimeout(() => {
              setJpBannerQueue(prev => [...prev, bannerEntry]);
            }, idx * 9500);
          });

          return;
        }

        // ── LUXURY_BROADCAST_GLOBAL — banner mewah ke semua room party ─────
        if (p.type === 'LUXURY_BROADCAST_GLOBAL') {
          const luxEntry: LuxBannerData = {
            senderDisplayName:    (p as any).senderDisplayName ?? '',
            recipientDisplayName: (p as any).recipientDisplayName ?? '',
            giftName:             (p as any).giftName ?? '',
            giftImageUrl:         (p as any).giftImageUrl ?? undefined,
            giftEmoji:            (p as any).giftEmoji ?? '🎁',
          };
          setLuxBannerQueue(prev => [...prev, luxEntry]);
          return;
        }

        // ── PARTY_MUSIC — sync music ke semua member room ─────────────────
        if (p.type === 'PARTY_MUSIC' && p.roomId === roomId) {
          const { action: pmAction, sender: pmSender, previewUrl, trackId, trackTitle, trackArtist, coverUri } = p;
          // Skip echo — pakai ref agar tidak stale closure
          if (pmSender === currentUserRef.current?.username) return;

          if (pmAction === 'stop') {
            if (musicSoundRef.current) {
              try { await musicSoundRef.current.stopAsync(); } catch {}
              try { await musicSoundRef.current.unloadAsync(); } catch {}
              musicSoundRef.current = null;
            }
            setMusicPlayingId(null);
            setMusicIsPlaying(false);
            setMusicCurrentTrack(null);
            return;
          }

          if (pmAction === 'pause') {
            if (musicSoundRef.current) {
              try { await musicSoundRef.current.pauseAsync(); } catch {}
              setMusicIsPlaying(false);
            }
            return;
          }

          if (pmAction === 'play') {
            const syncTrack = {
              id:         trackId ?? `sync_${Date.now()}`,
              title:      trackTitle ?? 'Unknown',
              artist:     trackArtist ?? pmSender,
              coverUri:   coverUri ?? '',
              previewUrl: previewUrl ?? '',
            };

            // Stop current before loading new
            if (musicSoundRef.current) {
              try { await musicSoundRef.current.stopAsync(); } catch {}
              try { await musicSoundRef.current.unloadAsync(); } catch {}
              musicSoundRef.current = null;
            }
            setMusicPlayingId(null);
            setMusicIsPlaying(false);
            setMusicCurrentTrack(null);

            // Jika previewUrl tidak ada atau berupa local path (dari HP pengirim),
            // hanya tampilkan info track tanpa memutar audio — file lokal tidak bisa
            // diakses oleh device lain.
            if (!previewUrl || !previewUrl.startsWith('http')) {
              setMusicCurrentTrack({ ...syncTrack, previewUrl: '' });
              return;
            }

            try {
              try {
                await Audio.setAudioModeAsync({
                  playsInSilentModeIOS:       true,
                  allowsRecordingIOS:         true,
                  staysActiveInBackground:    true,
                  playThroughEarpieceAndroid: false,
                });
              } catch {}
              const { sound } = await Audio.Sound.createAsync(
                { uri: previewUrl },
                { shouldPlay: false, volume: musicVolumeRef.current },
                (status) => {
                  if (status.isLoaded && status.didJustFinish) {
                    setMusicPlayingId(null);
                    setMusicIsPlaying(false);
                    setMusicCurrentTrack(null);
                  }
                },
              );
              await sound.playAsync();
              // Restore LiveKit audio routing — delay 200ms agar audio session
              // settle dulu sebelum di-override kembali ke headset/BT.
              setTimeout(() => restorePartyAudioSession().catch(() => {}), 200);
              // Retry setelah 1.5 detik untuk handle race condition Android
              setTimeout(() => restorePartyAudioSession().catch(() => {}), 1500);
              musicSoundRef.current = sound;
              setMusicPlayingId(syncTrack.id);
              setMusicIsPlaying(true);
              setMusicCurrentTrack(syncTrack);
            } catch (err) {
              console.error('[PARTY_MUSIC sync] playback error:', err);
            }
            return;
          }
          return;
        }

        // ── SEAT_MODE — sync kursi bebas toggle ke semua member ───────────
        if (p.type === 'SEAT_MODE' && p.roomId === roomId) {
          setIsFreeSeat(p.freeSeat !== false);
          return;
        }

        // ── PARTY_LOCKED — owner mengunci room saat ada pengguna di dalam ──
        if (p.type === 'PARTY_LOCKED' && p.roomId === roomId) {
          setIsLocked(true);
          const meIsOwner = room?.creatorUsername === currentUserRef.current?.username;
          if (!meIsOwner) {
            disconnectLiveKitRoom();
            setAudioStatus('idle');
            setMySeatIndex(null);
            setPwEntryVisible(true);
          }
          return;
        }

        // ── PARTY_UNLOCKED — owner membuka kunci room ────────────────────
        if (p.type === 'PARTY_UNLOCKED' && p.roomId === roomId) {
          setIsLocked(false);
          setPwEntryVisible(false);
          const me = currentUserRef.current;
          if (me && room) {
            audioInitRef.current = false;
            initVoice(room, me);
          }
          return;
        }

        // ── SEAT_LOCK — toggle kunci per-kursi, broadcast ke semua ────────
        if (p.type === 'SEAT_LOCK' && p.roomId === roomId) {
          const idx = Number(p.seatIndex);
          const locked = Boolean(p.locked);
          setLockedSeats(prev => {
            const next = new Set(prev);
            if (locked) next.add(idx); else next.delete(idx);
            return next;
          });
          return;
        }

        // ── SEAT_COUNT — live resize seat grid untuk semua member ─────────
        if (p.type === 'SEAT_COUNT' && p.roomId === roomId) {
          const newCount = Number(p.count);
          if (!newCount || newCount < 2) return;
          setCurrentSeatCount(newCount);
          if (p.reset) {
            // Reset: semua kursi dikosongkan dulu (perubahan jumlah kursi oleh owner)
            setSeats(Array.from({ length: newCount }, (_, i) => ({
              index: i + 1,
              username: null,
              displayName: null,
            })));
            // Keluarkan user dari kursinya
            setMySeatIndex(null);
            pushMsg({
              id:       `seat-reset-${Date.now()}`,
              username: 'System',
              migLevel: 0,
              text:     `⚙️ Jumlah kursi diubah menjadi ${newCount}. Semua pengguna telah dikeluarkan dari kursi.`,
              color:    'rgba(255,255,255,0.55)',
              isSystem: true,
              ts:       Date.now(),
            });
          } else {
            setSeats(prev => {
              if (newCount > prev.length) {
                // Expand: tambah kursi kosong
                const extra = Array.from({ length: newCount - prev.length }, (_, i) => ({
                  index: prev.length + i + 1,
                  username: null,
                  displayName: null,
                }));
                return [...prev, ...extra];
              } else {
                // Shrink: buang kursi terakhir
                return prev.slice(0, newCount);
              }
            });
          }
          return;
        }

        // ── SEAT_REQUEST — host/admin menerima permintaan kursi ──────────
        if (p.type === 'SEAT_REQUEST' && p.roomId === roomId) {
          const reqUser = p.requester;
          const reqSeat = p.seatIndex;
          const meIsOwnerOrAdmin = room?.creatorUsername === currentUserRef.current?.username;
          if (!meIsOwnerOrAdmin) return;
          Alert.alert(
            'Permintaan Kursi',
            `${reqUser} minta duduk di kursi ${reqSeat}. Setujui?`,
            [
              { text: 'Tolak', style: 'destructive', onPress: () => {
                  wsRef.current?.send(JSON.stringify({ type: 'SEAT_DENY', roomId, seatIndex: reqSeat, requester: reqUser }));
                },
              },
              { text: 'Setujui', onPress: () => {
                  wsRef.current?.send(JSON.stringify({ type: 'SEAT_APPROVE', roomId, seatIndex: reqSeat, requester: reqUser }));
                },
              },
            ],
          );
          return;
        }

        // ── SEAT_APPROVE — requester mendapat persetujuan → duduk ────────
        if (p.type === 'SEAT_APPROVE' && p.roomId === roomId) {
          if (p.requester !== currentUserRef.current?.username) return;
          const targetSeat = seatsRef.current.find(s => s.index === p.seatIndex);
          if (!targetSeat || targetSeat.username || !currentUserRef.current || !room) return;
          takePartySeat(room.id, p.seatIndex).then(async result => {
            if (!result.ok) { Alert.alert('Gagal', result.error ?? 'Kursi tidak tersedia'); return; }
            setMySeatIndex(p.seatIndex);
            const myProfile = await fetchProfileAvatar(currentUserRef.current!.username);
            setSeats(prev => prev.map(s =>
              s.index === p.seatIndex
                ? { ...s, username: currentUserRef.current!.username, displayName: currentUserRef.current!.displayName ?? null,
                    avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
                : s,
            ));
            const hasMic = await ensurePartyMicPermission();
            if (!hasMic) return;
            setAudioStatus('connecting');
            const tokenInfo = await fetchLiveKitToken(room.id, 'publisher');
            if (!tokenInfo?.url) { setAudioStatus('error'); return; }
            setLkProvider(tokenInfo.provider ?? null);
            await disconnectLiveKitRoom();
            const connected = await connectLiveKitRoom(tokenInfo.url, tokenInfo.token, true);
            setAudioStatus(connected ? 'connected' : 'error');
            if (connected) { setIsMuted(false); setMutedByAdmin(false); }
          });
          return;
        }

        // ── SEAT_DENY — permintaan kursi ditolak ─────────────────────────
        if (p.type === 'SEAT_DENY' && p.roomId === roomId) {
          if (p.requester !== currentUserRef.current?.username) return;
          Alert.alert('Ditolak', `Permintaan kursi ${p.seatIndex} ditolak oleh host.`);
          return;
        }

        if (p.type === 'PARTY_STICKER' && p.roomId === roomId) {
          const { stickerId, seatIndex } = p;
          if (seatIndex != null) {
            const key = Date.now();
            setSeatStickers(prev => ({ ...prev, [seatIndex]: { id: stickerId, key } }));
            setTimeout(() => {
              setSeatStickers(prev => {
                const next = { ...prev };
                if (next[seatIndex]?.key === key) delete next[seatIndex];
                return next;
              });
            }, 4500);
          }
          return;
        }

        if (p.type === 'JOIN_FAIL') setWsStatus('disconnected');

        // ── SEAT_MUTED — host/admin muted/unmuted a seat ─────────────────
        if (p.type === 'SEAT_MUTED' && p.roomId === roomId) {
          const { seatIndex: smIdx, muted: smMuted, targetUsername: smTarget } = p;
          // Update visual mute indicator on the seat for everyone
          setSeats(prev => prev.map(s =>
            s.index === smIdx ? { ...s, isMuted: smMuted } : s,
          ));
          // If this message targets the current user, actually mute/unmute LiveKit
          if (smTarget && smTarget === currentUserRef.current?.username) {
            setIsMuted(smMuted);
            setMutedByAdmin(smMuted);
            muteLocalLiveKit(smMuted).catch(() => {});
            if (smMuted) {
              Alert.alert('Mikrofon Dinonaktifkan', 'Host/admin telah menonaktifkan mikrofon Anda.');
            }
          }
          return;
        }

        // ── BG_CHANGE — owner mengubah latar belakang room ────────────────
        if (p.type === 'BG_CHANGE' && p.roomId === roomId) {
          setCustomBgUri(normalizeBgUrl(p.backgroundImage));
          return;
        }
      } catch { }
    };

    ws.onerror = () => { if (isActiveRef.current) setWsStatus('disconnected'); };
    ws.onclose = () => {
      if (!isActiveRef.current) return;
      setWsStatus('disconnected');
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      // Auto-reconnect after 2 seconds if modal still active
      setTimeout(() => {
        if (isActiveRef.current && wsRef.current?.readyState !== WebSocket.OPEN) {
          const currentRoom = roomIdForReconnectRef.current;
          if (currentRoom) connectWS(currentRoom);
        }
      }, 2000);
    };
  }, [disconnectWS, pushMsg, addParticipant, removeParticipant]);

  // ── Open / close / minimize ────────────────────────────────────────────────
  useEffect(() => {
    if (visible && room) {
      // ── Restore from minimize: WS + LiveKit still alive — skip full re-init ──
      // isActiveRef.current stays true while minimized (we never disconnected).
      if (isActiveRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        // Just restart the seat poll (was stopped on minimize to save resources)
        if (seatPollRef.current) clearInterval(seatPollRef.current);
        seatPollRef.current = setInterval(() => syncSeats(room.id), SEAT_POLL_MS);
        return () => {
          if (seatPollRef.current) { clearInterval(seatPollRef.current); seatPollRef.current = null; }
          // isMinimizedRef will be true if the next transition is minimize again
          if (isMinimizedRef.current) return;
          disconnectWS();
          disconnectLiveKitRoom();
          if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
        };
      }

      // ── Fresh open ──
      audioInitRef.current = false;
      setMySeatIndex(null);
      setAudioStatus('idle');
      setIsMuted(false);
      setMutedByAdmin(false);
      setLkProvider(null);
      setAudioRoute('unknown');
      setLockedSeats(new Set());
      participantSetRef.current = new Set();
      participantLevelRef.current = new Map();
      setParticipantCount(1);
      if (currentUser?.username) addParticipant(currentUser.username, currentUser.migLevel ?? 1);
      if (room.creatorUsername) addParticipant(room.creatorUsername, 0);
      setSeats(Array.from({ length: room.maxParticipants ?? currentSeatCount }, (_, i) => ({ index: i + 1, username: null, displayName: null })));
      setMessages([]);
      skipNextHistoryRef.current = true;

      // Set audio mode saat room dibuka.
      // staysActiveInBackground TIDAK diset di sini — LiveKit's AudioSession.startAudioSession
      // sudah menangani background audio. Mengeset staysActiveInBackground=true via expo-av
      // menyebabkan ExpoKeepAwake.activate dipanggil secara internal dan crash di Android
      // saat Activity belum fully active ("The current activity is no longer available").
      Audio.setAudioModeAsync({
        playsInSilentModeIOS:       true,
        allowsRecordingIOS:         true,   // harus true agar LiveKit bisa akses mic + headset routing iOS
        playThroughEarpieceAndroid: false,  // false = pakai speaker/headset, bukan earpiece kecil
      }).catch(() => {});

      connectWS(room.id);
      const meIsOwnerOnOpen = room.creatorUsername === currentUser?.username;
      if (!room.isLocked || meIsOwnerOnOpen) {
        initVoice(room, currentUser);
      }
      // Locked non-owner: initVoice will run after password is verified via onPasswordVerified

      // Fetch room detail untuk inisialisasi freeSeat
      fetchPartyRoom(room.id).then(detail => {
        if (detail && typeof detail.freeSeat === 'boolean') {
          setIsFreeSeat(detail.freeSeat);
        }
      }).catch(() => {});

      seatPollRef.current = setInterval(() => {
        syncSeats(room.id);
      }, SEAT_POLL_MS);

    } else if (isMinimized) {
      // ── MINIMIZE: stop seat poll (no UI = no need), keep WS + LiveKit alive ──
      if (seatPollRef.current) { clearInterval(seatPollRef.current); seatPollRef.current = null; }

    } else {
      // ── Full close ──
      setAudioRoute('unknown');
      // Batalkan reconnect timer LiveKit supaya tidak reconnect setelah modal ditutup
      if (lkReconnectTimerRef.current) {
        clearTimeout(lkReconnectTimerRef.current);
        lkReconnectTimerRef.current = null;
      }
      lkReconnectAttemptsRef.current = 0;
      lkReconnectRoomIdRef.current = null;
      disconnectWS();
      disconnectLiveKitRoom();
      audioInitRef.current = false;
      if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
      setSpeakingUsers(new Set());
      setMyHandRaised(false);
      // Hentikan musik saat room ditutup
      if (musicSoundRef.current) {
        const snd = musicSoundRef.current;
        musicSoundRef.current = null;
        snd.stopAsync().catch(() => {});
        snd.unloadAsync().catch(() => {});
      }
      setMusicPlayingId(null);
      setMusicIsPlaying(false);
      setMusicCurrentTrack(null);
      setMusicIsLocalPlayer(false);
      // Reset audio mode agar audio session dilepas oleh OS
      Audio.setAudioModeAsync({
        playsInSilentModeIOS:       false,
        allowsRecordingIOS:         false,
        staysActiveInBackground:    false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    }

    return () => {
      if (seatPollRef.current) { clearInterval(seatPollRef.current); seatPollRef.current = null; }
      // ── CRITICAL: skip disconnect when transitioning to minimize ──
      // isMinimizedRef.current is updated synchronously during render (before this
      // cleanup runs), so it already reflects the INCOMING isMinimized=true value.
      // This keeps WS + LiveKit alive when the user just minimizes the modal.
      if (isMinimizedRef.current) return;
      disconnectWS();
      disconnectLiveKitRoom();
      if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
      if (musicSoundRef.current) {
        const snd = musicSoundRef.current;
        musicSoundRef.current = null;
        snd.stopAsync().catch(() => {});
        snd.unloadAsync().catch(() => {});
      }
    };
  }, [visible, isMinimized, room?.id]);

  // ── Audio Route Polling — deteksi headset vs speaker setiap 5 detik ─────
  useEffect(() => {
    if (audioStatus !== 'connected') {
      setAudioRoute('unknown');
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const route = await getAudioRoute();
      if (!cancelled) setAudioRoute(route);
    };
    poll();
    const timer = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [audioStatus]);

  // ── AppState: restore audio + reconnect WS saat balik dari background ───────
  //
  // Masalah: saat app ke background (WhatsApp / minimize), OS menginterupsi
  // audio focus dan mematikan mic — pengguna lain di room tidak bisa mendengar.
  //
  // Fix:
  //   background/inactive → re-apply expo-av mode (pastikan staysActive=true)
  //   active              → re-start AudioSession + re-enable mic jika perlu
  //                         + reconnect WS jika putus
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (!visible || !isActiveRef.current) return;

      if (nextState === 'active') {
        // ── Kembali ke foreground ──────────────────────────────────────────
        // 1. Re-apply expo-av audio mode supaya LiveKit bisa rekam + play
        Audio.setAudioModeAsync({
          playsInSilentModeIOS:       true,
          allowsRecordingIOS:         true,
          staysActiveInBackground:    true,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});

        // 2. Re-start AudioSession LiveKit + re-enable mic jika duduk di kursi
        //    isMutedRef.current = mute yang dilakukan USER sendiri (bukan OS)
        reactivatePartyAudioSession(isMutedRef.current).catch(() => {});

        // 3. Reconnect WS jika putus
        const roomId = roomIdForReconnectRef.current;
        if (roomId && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
          connectWS(roomId);
        }

      } else if (nextState === 'background' || nextState === 'inactive') {
        // ── App ke background ─────────────────────────────────────────────
        // 1. Re-apply audio mode dengan staysActiveInBackground:true agar iOS
        //    tidak stop audio session saat layar mati / app suspend
        Audio.setAudioModeAsync({
          playsInSilentModeIOS:       true,
          allowsRecordingIOS:         true,
          staysActiveInBackground:    true,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});

        // 2. Pastikan LiveKit AudioSession tetap hold audio focus sebelum
        //    OS (WhatsApp notif / minimize) sempat mencabutnya
        handlePartyAppBackground().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [visible, connectWS]);

  // ── Tekan kursi ────────────────────────────────────────────────────────────
  const handleSeatPress = useCallback(async (seat: Seat) => {
    if (!currentUser || !room) return;

    // Tap kursi sendiri → tampilkan popup mute/unmute mic
    if (seat.username === currentUser.username) {
      setMyMutePopupVisible(true);
      return;
    }

    // Kursi terisi orang lain → action sheet
    if (seat.username) {
      const isMutedState = seats.find(s => s.index === seat.index)?.isMuted ?? false;
      setSeatActionTarget({
        seatIndex: seat.index,
        username: seat.username,
        displayName: seat.displayName ?? null,
        avatarUrl: seat.avatarUrl,
        avatarFrameUrl: seat.avatarFrameUrl,
        isMuted: isMutedState,
      });
      return;
    }

    // ── Kursi kosong ──────────────────────────────────────────────────────────
    const meIsOwner = room.creatorUsername === currentUser.username;

    // Jika sudah duduk → pindah langsung ke kursi baru tanpa popup
    if (mySeatIndexRef.current !== null) {
      const oldSeatIndex = mySeatIndexRef.current;
      // Tinggalkan kursi lama dulu
      await leavePartySeat(room.id, oldSeatIndex);
      setSeats(prev => prev.map(s =>
        s.index === oldSeatIndex
          ? { ...s, username: null, displayName: null, avatarUrl: null, avatarFrameUrl: null, diamonds: 0 }
          : s,
      ));
      // Duduk di kursi baru
      const result = await takePartySeat(room.id, seat.index);
      if (!result.ok) {
        setMySeatIndex(null);
        return;
      }
      setMySeatIndex(seat.index);
      const myProfile = await fetchProfileAvatar(currentUser.username);
      setSeats(prev => prev.map(s =>
        s.index === seat.index
          ? { ...s, username: currentUser.username, displayName: currentUser.displayName ?? null,
              avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
          : s,
      ));
      return;
    }

    // Kursi terkunci (per-seat atau global) → owner langsung duduk; user biasa kirim permintaan
    const isSeatLocked = lockedSeatsRef.current.has(seat.index) || !isFreeSeatRef.current;
    if (isSeatLocked && !meIsOwner) {
      wsRef.current?.send(JSON.stringify({ type: 'SEAT_REQUEST', roomId: room.id, seatIndex: seat.index }));
      return;
    }

    // Kursi bebas → duduk langsung
    const result = await takePartySeat(room.id, seat.index);
    if (!result.ok) {
      Alert.alert('Gagal', result.error ?? 'Kursi tidak tersedia');
      return;
    }

    setMySeatIndex(seat.index);
    const myProfile = await fetchProfileAvatar(currentUser.username);
    setSeats(prev => prev.map(s =>
      s.index === seat.index
        ? { ...s, username: currentUser.username, displayName: currentUser.displayName ?? null,
            avatarUrl: myProfile.avatarUrl, avatarFrameUrl: myProfile.frameUrl }
        : s,
    ));

    const hasMic = await ensurePartyMicPermission();
    if (!hasMic) {
      Alert.alert('Izin Mikrofon', 'Izin mikrofon diperlukan untuk berbicara di kursi.');
      return;
    }

    setAudioStatus('connecting');
    const tokenInfo = await fetchLiveKitToken(room.id, 'publisher');
    if (!tokenInfo || !tokenInfo.url) {
      setAudioStatus('error');
      return;
    }

    setLkProvider(tokenInfo.provider ?? null);
    await disconnectLiveKitRoom();
    const connected = await connectLiveKitRoom(tokenInfo.url, tokenInfo.token, true);
    setAudioStatus(connected ? 'connected' : 'error');
    if (connected) { setIsMuted(false); setMutedByAdmin(false); }
  }, [currentUser, room, fetchProfileAvatar, lockedSeats]);

  // ── Long-press kursi sendiri → berdiri; owner long-press kosong → toggle kunci ──
  const handleSeatLongPress = useCallback(async (seat: Seat) => {
    if (!currentUser || !room) return;

    // Owner long-press kursi kosong → toggle kunci kursi
    if (!seat.username && room.creatorUsername === currentUser.username) {
      const nowLocked = !lockedSeatsRef.current.has(seat.index);
      setLockedSeats(prev => {
        const next = new Set(prev);
        if (nowLocked) next.add(seat.index); else next.delete(seat.index);
        return next;
      });
      wsRef.current?.send(JSON.stringify({
        type: 'SEAT_LOCK', roomId: room.id, seatIndex: seat.index, locked: nowLocked,
      }));
      return;
    }

    if (seat.username !== currentUser.username) return;

    Alert.alert(
      'Berdiri dari Kursi',
      `Tinggalkan kursi ${seat.index}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Berdiri',
          style: 'destructive',
          onPress: async () => {
            await leavePartySeat(room.id, seat.index);
            setMySeatIndex(null);
            setSeats(prev => prev.map(s =>
              s.index === seat.index
                ? { ...s, username: null, displayName: null, avatarUrl: null, avatarFrameUrl: null, diamonds: 0 }
                : s,
            ));
            await disconnectLiveKitRoom();
            setAudioStatus('idle');
            await connectAudio(room.id, false);
          },
        },
      ],
    );
  }, [currentUser, room, connectAudio]);

  // ── Mute/unmute another user's seat (owner/admin action) ───────────────────
  const handleToggleOtherSeatMute = useCallback(async (seatIndex: number, currentlyMuted: boolean) => {
    if (!room) return;
    const newMuted = !currentlyMuted;
    const targetUsername = seatsRef.current.find(s => s.index === seatIndex)?.username ?? null;
    const ok = await mutePartySeat(room.id, seatIndex, newMuted);
    if (ok) {
      setSeats(prev => prev.map(s =>
        s.index === seatIndex ? { ...s, isMuted: newMuted } : s,
      ));
      // Broadcast mute event via WS so the target user's client mutes LiveKit
      if (targetUsername) {
        wsRef.current?.send(JSON.stringify({
          type: 'SEAT_MUTED',
          roomId: room.id,
          seatIndex,
          muted: newMuted,
          targetUsername,
        }));
      }
    } else {
      Alert.alert('Gagal', 'Tidak dapat mengubah status mic.');
    }
  }, [room]);

  // ── Kick user from seat (owner/admin action) ───────────────────────────────
  const handleKickFromSeat = useCallback(async (seatIndex: number) => {
    if (!room) return;
    Alert.alert(
      'Keluarkan dari Kursi',
      `Keluarkan pengguna dari kursi ${seatIndex}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluarkan',
          style: 'destructive',
          onPress: async () => {
            const ok = await leavePartySeat(room.id, seatIndex);
            if (ok) {
              setSeats(prev => prev.map(s =>
                s.index === seatIndex
                  ? { ...s, username: null, displayName: null, avatarUrl: null, avatarFrameUrl: null, isMuted: false, diamonds: 0 }
                  : s,
              ));
            }
          },
        },
      ],
    );
  }, [room]);

  const handleMuteToggle = useCallback(async () => {
    if (!room || mySeatIndexRef.current === null) return;
    // Block self-unmute if admin has force-muted this seat
    if (mutedByAdmin && isMuted) {
      Alert.alert('Mikrofon Dinonaktifkan', 'Host/admin telah menonaktifkan mikrofon Anda. Anda tidak dapat mengaktifkannya sendiri.');
      return;
    }
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await Promise.all([
      muteLocalLiveKit(newMuted),
      mutePartySeat(room.id, mySeatIndexRef.current, newMuted),
    ]);
  }, [isMuted, mutedByAdmin, room]);

  const handleRaiseHand = useCallback(async () => {
    if (!room || mySeatIndexRef.current === null) return;
    const newRaised = !myHandRaised;
    setMyHandRaised(newRaised);
    setSeats(prev => prev.map(s =>
      s.index === mySeatIndexRef.current ? { ...s, isHandRaised: newRaised } : s,
    ));
    await raisePartyHand(room.id, mySeatIndexRef.current, newRaised);
  }, [myHandRaised, room]);

  // Host lower tangan user lain dengan tap avatar kursi mereka
  const handleHostLowerHand = useCallback(async (seat: Seat) => {
    if (!room || !currentUser || !seat.username || !seat.isHandRaised) return;
    const isOwner = room.creatorUsername === currentUser?.username;
    if (!isOwner) return;
    setSeats(prev => prev.map(s => s.index === seat.index ? { ...s, isHandRaised: false } : s));
    await raisePartyHand(room.id, seat.index, false);
  }, [room, currentUser]);

  // ── Fetch admin list untuk room ini ──────────────────────────────────────
  useEffect(() => {
    if (!room?.id || !visible) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${API_BASE}/api/party/rooms/${room.id}/admins`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setRoomAdmins((data.admins ?? []).map((a: any) => a.username));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [room?.id, visible]);

  // ── Fetch remote stickers from API + pre-download their JSON ─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/party/stickers`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const raw = (data.stickers || []).filter((s: any) => !!s.lottie_url);
        const stickers = raw.map((s: any) => ({
          id: String(s.id), label: s.name, lottieUri: s.lottie_url, lottieJson: null,
        }));
        setRemoteStickers(stickers);
        // Download each Lottie JSON so LottieView gets a local object (URI source is unreliable)
        raw.forEach(async (s: any) => {
          try {
            const r = await fetch(s.lottie_url);
            if (!r.ok) return;
            const json = await r.json();
            if (cancelled) return;
            remoteLottieJsonMapRef.current[String(s.id)] = json;
            setRemoteStickers(prev =>
              prev.map(x => x.id === String(s.id) ? { ...x, lottieJson: json } : x)
            );
          } catch { /* keep null */ }
        });
      } catch { /* silently fallback to local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Send sticker ──────────────────────────────────────────────────────────
  const sendSticker = useCallback((stickerId: string) => {
    setStickerPanelVisible(false);
    const mySeat = seats.find(s => s.username === currentUser?.username);
    if (!mySeat) return;
    const key = Date.now();
    setSeatStickers(prev => ({ ...prev, [mySeat.index]: { id: stickerId, key } }));
    setTimeout(() => {
      setSeatStickers(prev => {
        const next = { ...prev };
        if (next[mySeat.index]?.key === key) delete next[mySeat.index];
        return next;
      });
    }, 4500);
    if (wsRef.current?.readyState === WebSocket.OPEN && room) {
      wsRef.current.send(JSON.stringify({ type: 'SEND_STICKER', roomId: room.id, stickerId, seatIndex: mySeat.index }));
    }
  }, [seats, currentUser, room]);

  // ── Send chat ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !room) return;
    // Block commands — / dan ! hanya berlaku di classic room, bukan party room
    if (text.startsWith('/') || text.startsWith('!')) {
      setInputText('');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'SEND_MESSAGE', roomId: room.id, text }));
    setInputText('');
  }, [inputText, room]);

  // ── Edit room ─────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditName(localName);
    setEditDesc(localDesc ?? '');
    setEditNameErr('');
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!room) return;
    const nm = editName.trim();
    if (!nm) { setEditNameErr('Nama tidak boleh kosong'); return; }
    if (nm.length > 60) { setEditNameErr('Maksimal 60 karakter'); return; }
    setEditLoading(true);
    const ok = await updatePartyRoom(room.id, { name: nm, description: editDesc.trim() || undefined });
    setEditLoading(false);
    if (!ok) { Alert.alert('Gagal', 'Tidak bisa menyimpan perubahan'); return; }
    setLocalName(nm);
    setLocalDesc(editDesc.trim() || null);
    onRoomUpdated?.({ ...room, name: nm, description: editDesc.trim() || null });
    setEditVisible(false);
  };

  const handleManagementSaveName = async (name: string): Promise<boolean> => {
    if (!room) return false;
    const ok = await updatePartyRoom(room.id, { name });
    if (ok) {
      setLocalName(name);
      onRoomUpdated?.({ ...room, name });
    }
    return !!ok;
  };

  const handleManagementSaveAnnouncement = async (text: string): Promise<boolean> => {
    if (!room) return false;
    const ok = await updatePartyRoom(room.id, { description: text || undefined });
    if (ok) {
      setLocalDesc(text || null);
      onRoomUpdated?.({ ...room, description: text || null });
    }
    return !!ok;
  };

  const handleDeleteRoom = () => {
    if (!room) return;
    Alert.alert(
      'Hapus Party Room',
      `Hapus "${localName}"? Tindakan ini tidak bisa dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const ok = await deletePartyRoom(room.id);
            if (!ok) { Alert.alert('Gagal', 'Tidak bisa menghapus room'); return; }
            setEditVisible(false);
            onClose();
          },
        },
      ],
    );
  };

  // ── Helper: fetch per-room gift summary for "Siaran berakhir" screen ───────
  const showEndSummary = useCallback(async (roomId: string) => {
    endSummaryDurationRef.current = sessionStartRef.current
      ? Date.now() - sessionStartRef.current
      : 0;
    setEndSummaryVisible(true);
    setEndSummaryLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/rooms/${roomId}/gift-summary`, { headers });
      const data = res.ok
        ? await res.json()
        : { spenders: [], totalCoins: 0, totalDiamonds: 0, spenderCount: 0 };
      setEndSummaryData(data);
    } catch {
      setEndSummaryData({ spenders: [], totalCoins: 0, totalDiamonds: 0, spenderCount: 0 });
    }
    setEndSummaryLoading(false);
  }, []);

  // ── Hentikan musik yang sedang diputar (helper) ───────────────────────────
  const stopMusicPlayback = useCallback(async () => {
    if (musicSoundRef.current) {
      try { await musicSoundRef.current.stopAsync(); } catch {}
      try { await musicSoundRef.current.unloadAsync(); } catch {}
      musicSoundRef.current = null;
    }
    setMusicPlayingId(null);
    setMusicIsPlaying(false);
    setMusicCurrentTrack(null);
    setMusicIsLocalPlayer(false);
  }, []);

  // ── Full exit: tinggal kursi + putus LiveKit + putus WS + bersih pesan ─────
  const handleFullExit = useCallback(async () => {
    setExitModalVisible(false);
    // Batalkan reconnect timer LiveKit supaya tidak reconnect setelah keluar
    if (lkReconnectTimerRef.current) {
      clearTimeout(lkReconnectTimerRef.current);
      lkReconnectTimerRef.current = null;
    }
    lkReconnectAttemptsRef.current = 0;
    lkReconnectRoomIdRef.current = null;
    const roomId = room?.id ?? '';
    // Tinggalkan kursi jika masih duduk
    if (mySeatIndexRef.current !== null && room) {
      await leavePartySeat(room.id, mySeatIndexRef.current).catch(() => {});
    }
    // Bersihkan semua state
    setMySeatIndex(null);
    setMessages([]);
    setSeats(Array.from({ length: currentSeatCount }, (_, i) => ({ index: i + 1, username: null, displayName: null })));
    setAudioStatus('idle');
    setIsMuted(false);
    setMutedByAdmin(false);
    setLkProvider(null);
    setSpeakingUsers(new Set());
    setMyHandRaised(false);
    // Hentikan musik
    await stopMusicPlayback();
    // Putus koneksi
    if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
    disconnectWS();
    await disconnectLiveKitRoom();
    // Tampilkan layar ringkasan sesi hanya untuk owner room
    const amOwner = room?.creatorUsername === currentUser?.username;
    if (roomId && amOwner) showEndSummary(roomId);
    else onClose();
  }, [room, currentUser, disconnectWS, onClose, showEndSummary, stopMusicPlayback]);

  // ── Minimalkan: sembunyikan modal tanpa putus koneksi ────────────────────
  const handleMinimize = useCallback(() => {
    setExitModalVisible(false);
    if (onMinimize) {
      onMinimize();
    } else {
      onClose();
    }
  }, [onMinimize, onClose]);

  // ── Tutup room (owner only): hapus room + full exit ───────────────────────
  const handleCloseRoom = useCallback(async () => {
    if (!room) return;
    setExitModalVisible(false);
    const roomId = room.id;
    const ok = await deletePartyRoom(room.id);
    if (!ok) { Alert.alert('Gagal', 'Tidak bisa menutup room'); return; }
    setMessages([]);
    await stopMusicPlayback();
    if (speakingUnsubRef.current) { speakingUnsubRef.current(); speakingUnsubRef.current = null; }
    disconnectWS();
    await disconnectLiveKitRoom();
    // Tampilkan layar ringkasan sesi
    showEndSummary(roomId);
  }, [room, disconnectWS, showEndSummary, stopMusicPlayback]);

  // ── Track session start time ───────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    } else if (!isMinimized) {
      // Hanya reset saat benar-benar keluar room, bukan saat minimize
      sessionStartRef.current = 0;
      setEndSummaryVisible(false);
      setEndSummaryData(null);
    }
  }, [visible, isMinimized]);

  // ── Fetch creator avatar + display name saat room pertama kali dibuka ───────
  useEffect(() => {
    const name = room?.creatorUsername;
    if (!name) return;
    fetchProfileAvatar(name).then(p => {
      setCreatorAvatarUrl(p.avatarUrl);
      setCreatorFrameUrl(p.frameUrl);
      setCreatorDisplayName(p.displayName ?? null);
    });
  }, [room?.creatorUsername, fetchProfileAvatar]);

  const isOwner = room?.creatorUsername === currentUser?.username;
  const isAdmin = !isOwner && !!currentUser?.username && roomAdmins.includes(currentUser.username);
  const canControlMusic = isOwner || isAdmin;
  const roomColor = toColor(room?.color, PARTY_PURPLE);
  roomColorRef.current = roomColor;
  const creatorName = creatorDisplayName ?? room?.creatorUsername ?? currentUser?.username ?? '??';

  const hostSpeaking = seats.length > 0 && !!seats[0].username && speakingUsers.has(seats[0].username ?? '');
  useEffect(() => {
    Animated.timing(hostGlowOpacity, {
      toValue: hostSpeaking ? 0.22 : 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [hostSpeaking]);

  useEffect(() => {
    if (!giftBanner) return;
    Animated.sequence([
      Animated.spring(giftBounceAnim, { toValue: -7, useNativeDriver: true, tension: 400, friction: 5 }),
      Animated.spring(giftBounceAnim, { toValue: 2,  useNativeDriver: true, tension: 200, friction: 6 }),
      Animated.spring(giftBounceAnim, { toValue: 0,  useNativeDriver: true, tension: 300, friction: 8 }),
    ]).start();
  }, [giftBanner]);

  useEffect(() => {
    if (!gameModalVisible) return;
    Animated.sequence([
      Animated.spring(gameBounceAnim, { toValue: -7, useNativeDriver: true, tension: 400, friction: 5 }),
      Animated.spring(gameBounceAnim, { toValue: 2,  useNativeDriver: true, tension: 200, friction: 6 }),
      Animated.spring(gameBounceAnim, { toValue: 0,  useNativeDriver: true, tension: 300, friction: 8 }),
    ]).start();
  }, [gameModalVisible]);
  const filteredMessages = chatTab === 'Semua' ? messages
    : chatTab === 'Obrolan' ? messages.filter(m => !m.isSystem || /has entered/.test(m.text))
    : messages.filter(m => m.text.toLowerCase().includes('gift') || m.text.toLowerCase().includes('hadiah'));

  if (!room) return null;

  return (
    <>
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => setExitModalVisible(true)}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Animated.View style={[{ flex: 1 }, { transform: [{ translateY: slideAnim }] }]}>

        {/* ── Entry banner: current user masuk room ── */}
        <PartyEntryEffect
          visible={!!selfEntryData}
          username={selfEntryData?.username ?? ''}
          displayName={selfEntryData?.displayName}
          avatarUrl={selfEntryData?.avatarUrl}
          effectUrl={selfEntryData?.effectUrl}
          mode="self"
          onDone={() => setSelfEntryData(null)}
        />

        {/* ── Entry banner: user lain masuk room ── */}
        <PartyEntryEffect
          visible={!!otherEntryData}
          username={otherEntryData?.username ?? ''}
          displayName={otherEntryData?.displayName}
          avatarUrl={otherEntryData?.avatarUrl}
          effectUrl={otherEntryData?.effectUrl}
          mode="other"
          onDone={() => setOtherEntryData(null)}
        />

        <ImageBackground
          source={normalizeBgUrl(customBgUri) ? { uri: normalizeBgUrl(customBgUri)! } : PARTY_BG}
          style={modalStyles.bgImage}
          resizeMode="cover"
        >

          {/* Upload background progress overlay */}
          {isBgUploading && (
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 5, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' as any }}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={{ color: '#fff', fontSize: 13, marginTop: 8, fontWeight: '600' }}>Mengupload latar belakang…</Text>
            </View>
          )}

          {/* Gradient overlay atas - untuk readability header */}
          <View style={modalStyles.topOverlay} />

          {/* Animated particles — falling stars */}
          <ParticleOverlay />

          {/* Host speaking glow — subtle color bloom when host is on mic */}
          {seats[0]?.username && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: roomColor, opacity: hostGlowOpacity },
              ]}
            />
          )}

          {/* Header — Avatar + username + follow + participant count + exit */}
          <View
            style={[modalStyles.header, { paddingTop: insets.top + 8 }]}
            onLayout={e => setHeaderBotY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
          >
            {/* Avatar column (avatar + trophy button) + username + status dots */}
            <View style={modalStyles.headerInfo}>
              <View style={modalStyles.avatarCol}>
                <AvatarCircle name={creatorName} size={44} color={roomColor}
                  username={room?.creatorUsername}
                  avatarUrl={creatorAvatarUrl} frameUrl={creatorFrameUrl} />
                {/* Trophy + Coin sebaris */}
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setSessionLbVisible(true)}
                    style={modalStyles.trophyBtn}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    activeOpacity={0.75}
                  >
                    <MaterialCommunityIcons name="trophy" size={14} color="#F59E0B" />
                  </TouchableOpacity>
                  {/* Coin total per-room — semua kategori gift */}
                  <TouchableOpacity
                    onPress={() => {
                      setRoomCoinLbVisible(true);
                      fetchRoomCoinLb();
                    }}
                    style={[modalStyles.trophyBtn, { flexDirection: 'row', alignItems: 'center', gap: 2 }]}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 12 }}>🪙</Text>
                    {roomCoinTotal > 0 && (
                      <Text style={{ fontSize: 9, color: '#FCD34D', fontWeight: '800' }}>
                        {roomCoinTotal >= 1_000_000
                          ? `${(roomCoinTotal / 1_000_000).toFixed(1)}M`
                          : roomCoinTotal >= 1_000
                          ? `${(roomCoinTotal / 1_000).toFixed(1)}K`
                          : roomCoinTotal.toLocaleString('id-ID')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              <View style={modalStyles.headerTexts}>
                {/* Username row — inline follow icon for non-owners */}
                <View style={modalStyles.creatorRow}>
                  <Text style={modalStyles.headerCreator} numberOfLines={1}>{creatorName}</Text>
                  {!isOwner && room?.creatorUsername && room.creatorUsername !== currentUser?.username && (
                    <TouchableOpacity
                      onPress={handleFollowCreator}
                      disabled={followLoading}
                      activeOpacity={0.7}
                      style={[modalStyles.inlineFollowBtn, isFollowingCreator && modalStyles.inlineFollowBtnActive]}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name={isFollowingCreator ? 'checkmark' : 'add'}
                        size={11}
                        color={isFollowingCreator ? '#A7F3D0' : '#C4B5FD'}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={modalStyles.headerMeta}>
                  <Text style={modalStyles.headerSub}>Livi Party</Text>
                  <AudioDot status={audioStatus} />
                  <WsDot status={wsStatus} />
                  <ProviderBadge provider={lkProvider} />
                  <AudioRouteBadge route={audioRoute} />
                </View>
              </View>
            </View>

            {/* Tombol kanan: Participant count + Exit */}
            <View style={modalStyles.headerRight}>
              <TouchableOpacity
                onPress={() => setParticipantListVisible(true)}
                style={modalStyles.iconBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View style={modalStyles.participantBtn}>
                  <Ionicons name="people" size={14} color="#C4B5FD" />
                  <Text style={modalStyles.participantBtnText}>{participantCount}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExitModalVisible(true)} style={modalStyles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={[modalStyles.iconBtnBg, modalStyles.exitBtnBg]}>
                  <Ionicons name="exit-outline" size={18} color="#FF6B6B" />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Gift particles: fly from launch point to all occupied seats */}
          {tapParticles.map(p => (
            <Animated.View
              key={p.id}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: p.startX - 20,
                top: p.startY - 20,
                transform: [
                  { translateX: p.translateX },
                  { translateY: p.translateY },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
                zIndex: 8002,
              }}
            >
              {p.imageUrl ? (
                <Image
                  source={{ uri: p.imageUrl }}
                  style={{ width: 40, height: 40, borderRadius: 8 }}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ fontSize: 28 }}>{p.emoji}</Text>
              )}
            </Animated.View>
          ))}

          {/* Seats grid */}
          <View
            style={[modalStyles.seatsSection, { position: 'relative' }]}
            onLayout={e => {
              seatsSectionYRef.current = e.nativeEvent.layout.y;
              setSeatTopY(e.nativeEvent.layout.y);
              setSeatsBotY(e.nativeEvent.layout.y + e.nativeEvent.layout.height);
            }}
          >
            {/* Now Speaking pill — floats above host seat when speaking */}
            <NowSpeakingPill
              visible={hostSpeaking}
              name={seats[0]?.displayName ?? seats[0]?.username ?? ''}
              color={roomColor}
            />

            {(() => {
              const is12 = seats.length === 12;

              const gap12 = 12;
              const sz12  = Math.min(SEAT_SIZE, Math.floor((SW - SEAT_H_PAD * 2 - gap12 * 4) / 5));

              const renderBubble = (seat: (typeof seats)[0]) => (
                <SeatBubble
                  key={seat.index}
                  seat={seat}
                  color={roomColor}
                  seatSize={is12 ? sz12 : SEAT_SIZE}
                  isMe={seat.username === currentUser?.username}
                  isMuted={seat.username === currentUser?.username ? isMuted : (seat.isMuted ?? false)}
                  isSpeaking={!!seat.username && speakingUsers.has(seat.username)}
                  isHandRaised={seat.isHandRaised ?? false}
                  isLocked={(lockedSeats.has(seat.index) || !isFreeSeat) && !seat.username}
                  stickerData={seatStickers[seat.index]}
                  remoteLottieJsonMap={remoteLottieJsonMapRef.current}
                  onPress={() => {
                    const isOwner = room?.creatorUsername === currentUser?.username;
                    if (isOwner && seat.isHandRaised && seat.username !== currentUser?.username) {
                      handleHostLowerHand(seat);
                    } else {
                      handleSeatPress(seat);
                    }
                  }}
                  onLongPress={() => handleSeatLongPress(seat)}
                />
              );

              if (is12) {
                return (
                  <View style={{ gap: 0 }}>
                    {/* Baris atas: 2 kursi berdampingan (host + 1), di tengah */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: gap12 }}>
                      {seats.slice(0, 2).map(renderBubble)}
                    </View>
                    {/* Baris 2: 5 kursi — naik lebih dekat ke baris atas */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: gap12, marginTop: -22 }}>
                      {seats.slice(2, 7).map(renderBubble)}
                    </View>
                    {/* Baris 3: 5 kursi — naik lebih dekat ke baris 2 */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: gap12, marginTop: -22 }}>
                      {seats.slice(7, 12).map(renderBubble)}
                    </View>
                  </View>
                );
              }

              // Default: 8 kursi → 4 kolom, 2 baris
              return (
                <View style={[seatStyles.grid, { columnGap: SEAT_GAP }]}>
                  {seats.map(renderBubble)}
                </View>
              );
            })()}

          </View>

          {/* Luxury Broadcast Banner — slide masuk kiri, diam 4s, keluar kanan */}
          {luxBannerCurrent && (
            <LuxuryBroadcastBanner
              data={luxBannerCurrent}
              bannerTop={insets.top + 56}
              onDone={() => {
                luxBannerActiveRef.current = false;
                setLuxBannerCurrent(null);
              }}
            />
          )}

          {/* Jackpot Banner — melayang masuk dari kanan, teks marquee, keluar ke kiri */}
          {jpBannerCurrent && (
            <JackpotBanner
              data={jpBannerCurrent}
              onDone={() => {
                jpBannerActiveRef.current = false;
                setJpBannerCurrent(null);
              }}
            />
          )}

          {/* Gift banner — absolute overlay, tidak menggeser layout */}
          {giftBanner && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: seatsSectionYRef.current + (SEAT_FRAME_SIZE + 30 + 4) * 2 + 12,
                zIndex: 600,
              }}
            >
              <GiftBanner
                banner={giftBanner}
                qty={giftBannerQty}
                exiting={giftBannerExiting}
                onExited={() => {
                  setGiftBanner(null);
                  giftBannerSessionRef.current = '';
                  giftBannerActiveRef.current  = false;
                }}
              />
            </View>
          )}

          {/* Gift splash overlay — fullscreen animation saat gift diterima */}
          {giftSplash && (
            <GiftSplashOverlay
              data={giftSplash}
              onDone={() => setGiftSplash(null)}
            />
          )}

          {/* Popular gift splash — lottie mini-card (sender) or fly-to-seat (no lottie) */}
          {popularGiftSplash && (() => {
            const isLux = !!popularGiftSplash.isLuxury;
            if (isLux) {
              /* ── LUXURY: fullscreen overlay, konten terpusat ── */
              // Ukuran konten: bujur sangkar paling besar yang muat di layar (80% lebar)
              const contentSize = Math.round(Math.min(SW * 0.92, SH * 0.72));
              return (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    opacity: popularSplashOpacity,
                    transform: [{ scale: popularSplashScale }],
                  }}
                >
                  {popularGiftSplash.videoUrl ? (
                    <GiftWebmFullscreen
                      uri={popularGiftSplash.videoUrl}
                      onFinish={() => setPopularGiftSplash(null)}
                    />
                  ) : popularGiftSplash.lottieUrl ? (
                    <LottieView
                      source={{ uri: popularGiftSplash.lottieUrl! }}
                      autoPlay loop={false}
                      style={{ width: contentSize, height: contentSize }}
                    />
                  ) : popularGiftSplash.imageUrl ? (
                    <Image
                      source={{ uri: popularGiftSplash.imageUrl }}
                      style={{ width: contentSize, height: contentSize }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={{ fontSize: 160, textAlign: 'center' }}>
                      {popularGiftSplash.emoji}
                    </Text>
                  )}
                  {!!popularGiftSplash.giftName && !popularGiftSplash.videoUrl && (
                    <Text style={{
                      marginTop: 20,
                      color: '#FFD700', fontWeight: '900', fontSize: 28,
                      letterSpacing: 2, textAlign: 'center',
                      textShadowColor: 'rgba(0,0,0,0.95)',
                      textShadowOffset: { width: 0, height: 2 },
                      textShadowRadius: 10,
                    }}>
                      {popularGiftSplash.giftName}
                    </Text>
                  )}
                </Animated.View>
              );
            }
            return (popularGiftSplash.lottieUrl || popularGiftSplash.videoUrl) ? (
              /* Popular video/lottie: small centered card — TIDAK berubah */
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: popularSplashOpacity,
                  transform: [{ scale: popularSplashScale }],
                }}
              >
                {popularGiftSplash.videoUrl ? (
                  <GiftWebmFullscreen
                    uri={popularGiftSplash.videoUrl}
                    onFinish={() => setPopularGiftSplash(null)}
                  />
                ) : (
                  <LottieView
                    source={{ uri: popularGiftSplash.lottieUrl! }}
                    autoPlay loop={false}
                    style={{ width: 200, height: 200 }}
                  />
                )}
                {!!popularGiftSplash.giftName && !popularGiftSplash.videoUrl && (
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, marginTop: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                    {popularGiftSplash.giftName}
                  </Text>
                )}
              </Animated.View>
            ) : (
              /* No lottie/video: fly-to-seat animation — TIDAK berubah */
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: popularSplashOpacity,
                  transform: [
                    { translateX: popularSplashTransX },
                    { translateY: popularSplashTransY },
                    { scale: popularSplashScale },
                  ],
                }}
              >
                {popularGiftSplash.imageUrl ? (
                  <Image
                    source={{ uri: popularGiftSplash.imageUrl }}
                    style={{ width: 220, height: 220 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ fontSize: 120 }}>{popularGiftSplash.emoji}</Text>
                )}
              </Animated.View>
            );
          })()}

          {/* Jackpot splash overlay removed — jackpot now shows as chat bubble */}

          {/* Lucky Tap Button — muncul setelah kirim Lucky gift */}
          {luckyTapInfo && (
            <LuckyTapButton
              info={luckyTapInfo}
              multiplier={luckyTapMultiplier}
              balance={tapCoinBalance}
              costPerTap={tapCoinCostPerTap}
              onTap={() => {
                // 1. Optimistic multiplier — instant, no server wait
                const tapStep = luckyTapInfoRef.current?.qty || 1;
                luckyTapMultiplierRef.current += tapStep;
                setLuckyTapMultiplier(luckyTapMultiplierRef.current);

                // 1b. Optimistic coin deduction — show balance drop instantly per tap
                if (tapCoinBalanceRef.current !== null && tapCoinCostRef.current > 0) {
                  tapCoinBalanceRef.current = Math.max(0, tapCoinBalanceRef.current - tapCoinCostRef.current);
                  setTapCoinBalance(tapCoinBalanceRef.current);
                }

                // 2. Optimistic banner — create on first tap, sync qty on every tap
                isLuckyTapSessionRef.current = true;
                const myUsername  = currentUserRef.current?.username ?? '';
                const sessionKey  = `${myUsername}:${luckyTapInfo.giftName}`;
                if (!giftBannerActiveRef.current || giftBannerSessionRef.current !== sessionKey) {
                  // First tap or new gift — create banner immediately
                  giftBannerSessionRef.current = sessionKey;
                  giftBannerActiveRef.current  = true;
                  setGiftBanner({
                    sender:         myUsername,
                    senderAvatarUrl: profileCache.current[myUsername]?.avatarUrl ?? null,
                    emoji:          luckyTapInfo.giftEmoji,
                    giftImageUrl:   luckyTapInfo.giftImageUrl ?? null,
                    qty:            1,
                    giftName:       luckyTapInfo.giftName,
                    roomColor:      roomColorRef.current,
                    price:          luckyTapInfo.price,
                    unitPrice:      luckyTapInfo.price,
                    lottieUrl:      luckyTapInfo.lottieUrl,
                  });
                }
                // Always sync banner qty to current tap multiplier
                setGiftBannerQty(luckyTapMultiplierRef.current);
                setGiftBannerExiting(false);

                // 3. Immediate tap particle: TAP button → only the selected recipient seats
                {
                  const isAllRec = luckyTapInfo.recipient?.toLowerCase() === 'all';
                  const snapSeats = seatsRef.current;
                  const tapTargetIndices: number[] = isAllRec
                    ? snapSeats.filter(s => !!s.username).map(s => s.index)
                    : (luckyTapInfo.recipient ?? '').split(',').map((r: string) => r.trim()).flatMap((r: string) => {
                        const found = snapSeats.find(
                          s => !!s.username && s.username.toLowerCase() === r.toLowerCase(),
                        );
                        return found ? [found.index] : [];
                      });
                  triggerTapToAllSeats(
                    luckyTapInfo.giftEmoji,
                    luckyTapInfo.giftImageUrl,
                    SW - 18 - 36,  // TAP button center X
                    SH - 110 - 36, // TAP button center Y
                    tapTargetIndices.length > 0 ? tapTargetIndices : undefined,
                  );
                }

                // 4. Debounced batch WS send — accumulate all rapid taps,
                //    send ONE message with qty = total taps after 100 ms quiet.
                //    Dikurangi dari 400ms → 100ms agar JP bubble muncul lebih cepat.
                pendingTapsRef.current += 1;
                if (tapBatchTimerRef.current) clearTimeout(tapBatchTimerRef.current);
                tapBatchTimerRef.current = setTimeout(() => {
                  const batchTaps = pendingTapsRef.current;
                  pendingTapsRef.current = 0;
                  const info = luckyTapInfoRef.current;
                  if (!batchTaps || !info) return;
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    // Split comma-separated recipients and send one WS message per recipient
                    // (same pattern as Popular/Luxury gifts)
                    const isAllRecipient = info.recipient?.toLowerCase() === 'all';
                    const recipientList = isAllRecipient
                      ? ['all']
                      : (info.recipient ?? '').split(',').map((r: string) => r.trim()).filter(Boolean);
                    for (const recipient of recipientList) {
                      wsRef.current.send(JSON.stringify({
                        type:         'SEND_GIFT',
                        roomId:       info.roomId,
                        recipient,
                        giftName:     info.giftName,
                        giftEmoji:    info.giftEmoji,
                        giftImageUrl: info.giftImageUrl ?? null,
                        lottieUrl:    info.lottieUrl,
                        qty:          batchTaps * (info.qty || 1),
                      }));
                    }
                  }
                }, 100);

                // 5. Reset auto-dismiss timer (3 s of inactivity hides button)
                if (luckyTapTimerRef.current) clearTimeout(luckyTapTimerRef.current);
                luckyTapTimerRef.current = setTimeout(() => {
                  setLuckyTapInfo(null);
                  isLuckyTapSessionRef.current = false;
                }, 3000);

                // 6. Keep banner alive; expires 3.5 s after last tap
                if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
                bannerTimerRef.current = setTimeout(() => setGiftBannerExiting(true), 3500);
              }}
              onDismiss={() => {
                if (luckyTapTimerRef.current) clearTimeout(luckyTapTimerRef.current);
                if (tapBatchTimerRef.current) clearTimeout(tapBatchTimerRef.current);
                pendingTapsRef.current = 0;
                isLuckyTapSessionRef.current = false;
                setLuckyTapInfo(null);
                setLuckyTapMultiplier(1);
                luckyTapMultiplierRef.current = 1;
                setTapParticles([]);
                tapCoinBalanceRef.current = null;
                setTapCoinBalance(null);
              }}
            />
          )}

          {/* ── Slim Toast Notification ────────────────────────────────────────── */}
          {toastMsg && (
            <View pointerEvents="none" style={{
              position: 'absolute',
              bottom: 90,
              left: 20, right: 20,
              zIndex: 9999,
              alignItems: 'center',
            }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor:
                  toastMsg.type === 'success' ? 'rgba(21,128,61,0.92)' :
                  toastMsg.type === 'error'   ? 'rgba(180,30,30,0.92)' :
                                               'rgba(30,30,50,0.92)',
                borderRadius: 22,
                paddingHorizontal: 18,
                paddingVertical: 10,
                maxWidth: SW - 40,
                shadowColor: '#000',
                shadowOpacity: 0.35,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 10,
                borderWidth: 1,
                borderColor:
                  toastMsg.type === 'success' ? 'rgba(74,222,128,0.4)' :
                  toastMsg.type === 'error'   ? 'rgba(248,113,113,0.4)' :
                                               'rgba(255,255,255,0.1)',
              }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600', lineHeight: 18, flexShrink: 1 }}>
                  {toastMsg.type === 'success' ? '✓ ' : toastMsg.type === 'error' ? '✕ ' : 'ℹ '}
                  {toastMsg.text}
                </Text>
              </View>
            </View>
          )}

              {/* ── Lucky Bag Global Banner ─────────────────────────────────────── */}
          {globalBanner && (
            <GlobalBagBanner
              bag={globalBanner}
              topY={insets.top}
              onGoToRoom={
                globalBanner.senderRoomId && globalBanner.senderRoomId !== String(room?.id)
                  ? () => { onNavigateToRoom?.(globalBanner.senderRoomId, globalBanner.senderRoomName); }
                  : undefined
              }
              onDone={() => setGlobalBanner(null)}
            />
          )}

          {/* ── Lucky Bag Room Floater ─────────────────────────────────────────── */}
          {roomLuckyBags.length > 0 && seatsBotY > 0 && (
            <View style={{ position: 'absolute', right: 12, top: seatsBotY + 6, zIndex: 30, gap: 10 }}>
              {roomLuckyBags.slice(0, 3).map(bag => (
                <LuckyBagBubble
                  key={bag.id}
                  bag={bag}
                  claiming={claimingBagId === bag.id}
                  claimResult={bagClaimResult?.bagId === bag.id ? bagClaimResult.coins : null}
                  onClaim={() => handleBagClaim(bag.id)}
                  onExpire={() => setRoomLuckyBags(prev => prev.filter(b => b.id !== bag.id))}
                />
              ))}
            </View>
          )}

          {/* ── Lucky Bag Global Claim Floater ──────────────────────────────── */}
          {globalClaimBags.length > 0 && seatsBotY > 0 && (
            <View style={{ position: 'absolute', right: 12, top: seatsBotY + 6, zIndex: 30, gap: 10 }}>
              {globalClaimBags.slice(0, 3).map(bag => (
                <GlobalBagClaimBubble
                  key={bag.bagId}
                  bag={bag}
                  claiming={claimingGlobalBagId === bag.bagId}
                  claimResult={globalBagClaimResult?.bagId === bag.bagId ? globalBagClaimResult.coins : null}
                  onClaim={() => handleGlobalBagClaim(bag.bagId)}
                  onExpire={() => setGlobalClaimBags(prev => prev.filter(b => b.bagId !== bag.bagId))}
                />
              ))}
            </View>
          )}

          {/* Chat area + Now Playing Mini-Bar (absolute overlay, hanya tampil di layar si pemain) */}
          <View style={{ flex: 1, position: 'relative' }}>
            {musicIsLocalPlayer && (
              <NowPlayingMiniBar
                track={musicCurrentTrack}
                isPlaying={musicIsPlaying}
                volume={musicVolume}
                onVolumeChange={setMusicVolume}
                onPress={() => setMusicPickerVisible(true)}
                onStop={async () => {
                  if (musicSoundRef.current) {
                    try { await musicSoundRef.current.stopAsync(); } catch {}
                    try { await musicSoundRef.current.unloadAsync(); } catch {}
                    musicSoundRef.current = null;
                  }
                  setMusicPlayingId(null);
                  setMusicIsPlaying(false);
                  setMusicCurrentTrack(null);
                  setMusicIsLocalPlayer(false);
                }}
              />
            )}

          {/* Chat area */}
          <Animated.View style={[modalStyles.chatContainer, (musicIsLocalPlayer && !!musicCurrentTrack) && { paddingTop: 46 }, { marginBottom: kbOffset }]}>
            {/* Chat tabs */}
            <View style={chatStyles.tabRow}>
              {CHAT_TABS.map(t => {
                const active = t === chatTab;
                return (
                  <TouchableOpacity key={t} style={chatStyles.tab} onPress={() => setChatTab(t)} activeOpacity={0.7}>
                    <Text style={[chatStyles.tabText, active && chatStyles.tabTextActive]}>{t}</Text>
                    {active && <View style={[chatStyles.tabUnderline, { backgroundColor: roomColor }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Chat messages */}
            <FlatList
              ref={flatRef}
              data={filteredMessages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <MsgRow item={item} meUsername={currentUser?.username} onPressUsername={(uname) => { if (uname !== currentUser?.username) setProfileUsername(uname); }} />}
              style={chatStyles.list}
              contentContainerStyle={chatStyles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={chatStyles.roomInfoHeader}>
                  <View style={chatStyles.roomInfoBox}>
                    <Text style={chatStyles.roomInfoTitle}>{localName}</Text>
                  </View>
                  {localDesc ? (
                    <View style={chatStyles.roomInfoDescBox}>
                      <Text style={chatStyles.roomInfoDesc}>{localDesc}</Text>
                    </View>
                  ) : null}
                </View>
              }
            />

            {/* Sticker panel — slides in above input bar */}
            {stickerPanelVisible && (
              <View style={{ backgroundColor: 'rgba(15,10,30,0.92)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingVertical: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, flexDirection: 'row' }}>
                  {/* Remote stickers from API */}
                  {remoteStickers.map(stk => (
                    <TouchableOpacity
                      key={`remote-${stk.id}`}
                      onPress={() => sendSticker(`remote:${stk.id}:${stk.lottieUri}`)}
                      activeOpacity={0.7}
                      style={{ alignItems: 'center', gap: 4 }}
                    >
                      <View style={{ width: 68, height: 68, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        {stk.lottieJson ? (
                          <LottieView
                            source={stk.lottieJson as any}
                            autoPlay
                            loop
                            style={{ width: 68, height: 68 }}
                          />
                        ) : (
                          <Text style={{ fontSize: 28 }}>✨</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>{stk.label}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* Local fallback stickers */}
                  {LOCAL_STICKERS.map(stk => (
                    <TouchableOpacity
                      key={stk.id}
                      onPress={() => sendSticker(stk.id)}
                      activeOpacity={0.7}
                      style={{ alignItems: 'center', gap: 4 }}
                    >
                      <View style={{ width: 68, height: 68, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                        <LottieView
                          source={LOCAL_STICKER_SOURCES[stk.id] as any}
                          autoPlay
                          loop
                          style={{ width: 68, height: 68 }}
                        />
                      </View>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>{stk.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Input bar */}
            <Animated.View style={[modalStyles.inputBar, { paddingBottom: insets.bottom + 8, position: 'relative' }]}>
              {/* Lucky Bag — mengambang di atas toolbar, pojok kanan */}
              <TouchableOpacity
                onPress={() => { fetchTapBalance(); setLuckyBagModalVisible(true); }}
                activeOpacity={0.7}
                style={{ position: 'absolute', top: -52, right: 12, zIndex: 40 }}
              >
                <Image
                  source={require('../assets/images/lucky_bag_icon.png')}
                  style={{ width: 44, height: 44 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <TextInput
                style={[modalStyles.chatInput, { color: '#fff' }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Tulis pesan..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                blurOnSubmit={false}
              />
              <View style={modalStyles.toolbarIcons}>
                {/* ── Sticker — Kuning-Oranye ── */}
                <TouchableOpacity onPress={() => setStickerPanelVisible(v => !v)} activeOpacity={0.75}>
                  <LinearGradient
                    colors={stickerPanelVisible ? ['#FFCA28', '#FF8F00'] : ['#FFB300', '#E65100']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[modalStyles.toolbarPill, {
                      shadowColor: '#FF8F00',
                      shadowOpacity: stickerPanelVisible ? 0.9 : 0.55,
                      shadowRadius: stickerPanelVisible ? 10 : 6,
                    }]}
                  >
                    <MaterialCommunityIcons name="sticker-emoji" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>

                {/* ── Music — Ungu-Pink (hanya owner/admin) ── */}
                <TouchableOpacity
                  onPress={() => canControlMusic ? setMusicPickerVisible(true) : undefined}
                  activeOpacity={canControlMusic ? 0.75 : 1}
                  disabled={!canControlMusic}
                >
                  <LinearGradient
                    colors={musicIsPlaying ? ['#E040FB', '#FF4081'] : ['#AB47BC', '#E91E8C']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[modalStyles.toolbarPill, {
                      shadowColor: '#E040FB',
                      shadowOpacity: musicIsPlaying ? 0.95 : 0.55,
                      shadowRadius: musicIsPlaying ? 12 : 6,
                      opacity: canControlMusic ? 1 : 0.35,
                    }]}
                  >
                    <MaterialCommunityIcons
                      name={musicIsPlaying ? 'music-note' : 'music-note-outline'}
                      size={20} color="#fff"
                    />
                  </LinearGradient>
                </TouchableOpacity>

                {/* ── Settings/Grid — Biru Langit ── */}
                <TouchableOpacity onPress={() => setSettingsSheetVisible(true)} activeOpacity={0.75}>
                  <LinearGradient
                    colors={['#29B6F6', '#1565C0']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[modalStyles.toolbarPill, { shadowColor: '#29B6F6', shadowOpacity: 0.55, shadowRadius: 6 }]}
                  >
                    <MaterialCommunityIcons name="view-grid-outline" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>

                {/* ── Gift — Merah Muda-Merah ── */}
                <Animated.View style={{ transform: [{ translateY: giftBounceAnim }] }}>
                  <TouchableOpacity onPress={() => setGiftModalVisible(true)} activeOpacity={0.75}>
                    <LinearGradient
                      colors={['#F06292', '#C62828']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[modalStyles.toolbarPill, { shadowColor: '#F06292', shadowOpacity: 0.6, shadowRadius: 7 }]}
                    >
                      <Ionicons name="gift-outline" size={20} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* ── Gamepad — Hijau Zamrud ── */}
                <Animated.View style={{ transform: [{ translateY: gameBounceAnim }] }}>
                  <TouchableOpacity onPress={() => setGameModalVisible(true)} activeOpacity={0.75}>
                    <LinearGradient
                      colors={['#26C6DA', '#00695C']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={[modalStyles.toolbarPill, { shadowColor: '#26C6DA', shadowOpacity: 0.6, shadowRadius: 7 }]}
                    >
                      <MaterialCommunityIcons name="gamepad-variant-outline" size={20} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Send button */}
              <TouchableOpacity
                style={[
                  modalStyles.sendBtn,
                  { backgroundColor: wsStatus === 'connected' ? roomColor : 'rgba(255,255,255,0.2)' },
                  inputText.length > 0 && wsStatus === 'connected' && {
                    shadowColor: roomColor,
                    shadowOpacity: 0.85,
                    shadowRadius: 14,
                    elevation: 12,
                  },
                ]}
                onPress={sendMessage}
                activeOpacity={0.8}
                disabled={wsStatus !== 'connected'}
              >
                <Ionicons name="send" size={16} color={wsStatus === 'connected' ? '#fff' : 'rgba(255,255,255,0.4)'} />
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
          </View>{/* end chat+musicbar wrapper */}

        </ImageBackground>
      </Animated.View>

      {/* Edit Room Sheet */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <Pressable style={editStyles.overlay} onPress={() => setEditVisible(false)}>
          <Pressable style={editStyles.sheet} onPress={e => e.stopPropagation()}>
            <View style={editStyles.handle} />
            <View style={editStyles.header}>
              <Text style={editStyles.headerTitle}>Edit Party Room</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
            <ScrollView style={editStyles.body} keyboardShouldPersistTaps="handled">
              <Text style={editStyles.label}>Nama Room</Text>
              <TextInput
                style={[editStyles.input, { color: '#fff' }, editNameErr ? editStyles.inputError : null]}
                value={editName}
                onChangeText={t => { setEditName(t); setEditNameErr(''); }}
                placeholder="Nama party room"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={60}
              />
              {editNameErr ? <Text style={editStyles.errorText}>{editNameErr}</Text> : null}
              <Text style={editStyles.charCount}>{editName.length}/60</Text>

              <Text style={[editStyles.label, { marginTop: 14 }]}>Deskripsi</Text>
              <TextInput
                style={[editStyles.input, editStyles.inputMulti, { color: '#fff' }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Deskripsi room (opsional)"
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline
                numberOfLines={3}
                maxLength={200}
              />
              <Text style={editStyles.charCount}>{editDesc.length}/200</Text>

              <TouchableOpacity style={editStyles.saveBtn} onPress={saveEdit} activeOpacity={0.85} disabled={editLoading}>
                {editLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={editStyles.saveBtnText}>Simpan</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[editStyles.saveBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
                onPress={handleDeleteRoom}
                activeOpacity={0.85}
              >
                <Text style={editStyles.saveBtnText}>Hapus Room</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>

      {/* Lucky Bag Modal */}
      <PartyLuckyBagModal
        visible={luckyBagModalVisible}
        roomId={room?.id ?? null}
        roomName={room?.name}
        coinBalance={tapCoinBalance}
        onClose={() => setLuckyBagModalVisible(false)}
        onSent={(newBal) => {
          tapCoinBalanceRef.current = newBal;
          setTapCoinBalance(newBal);
        }}
        onClaimed={(newBal, earned) => {
          tapCoinBalanceRef.current = newBal;
          setTapCoinBalance(newBal);
        }}
      />

      {/* Gift Modal */}
      <PartyGiftModal
        visible={giftModalVisible}
        onClose={() => { setGiftModalVisible(false); setGiftInitialRecipient(undefined); }}
        roomId={room?.id ?? ''}
        seats={seats}
        currentUsername={currentUser?.username ?? ''}
        wsRef={wsRef}
        initialRecipient={giftInitialRecipient}
        onLuckySent={(info) => {
          setGiftInitialRecipient(undefined);
          // Reset state for a fresh tap session
          isLuckyTapSessionRef.current = false;
          if (tapBatchTimerRef.current) clearTimeout(tapBatchTimerRef.current);
          pendingTapsRef.current = 0;
          const initialMultiplier = info.qty || 1;
          luckyTapMultiplierRef.current = initialMultiplier;
          setLuckyTapMultiplier(initialMultiplier);
          setTapParticles([]);
          // Clear any stale banner so optimistic create fires on first tap
          giftBannerSessionRef.current = '';
          giftBannerActiveRef.current  = false;
          setGiftBanner(null);
          setLuckyTapInfo({ ...info, roomId: room?.id ?? '' });
          setGiftModalVisible(false);
          if (luckyTapTimerRef.current) clearTimeout(luckyTapTimerRef.current);
          luckyTapTimerRef.current = setTimeout(() => setLuckyTapInfo(null), 3000);

          // Calculate cost per tap for real-time balance display
          const isAll = info.recipient?.toLowerCase() === 'all';
          const myUsername = currentUserRef.current?.username ?? '';
          const otherOccupied = seats.filter(s => !!s.username && s.username !== myUsername).length;
          const recipientCount = isAll
            ? Math.max(1, otherOccupied)
            : Math.max(1, (info.recipient ?? '').split(',').filter(Boolean).length);
          const cost = info.price * (info.qty || 1) * recipientCount;
          tapCoinCostRef.current = cost;
          setTapCoinCostPerTap(cost);
          // Fetch fresh balance to show alongside the TAP button
          fetchTapBalance();
        }}
        onPopularGiftSend={(info) => {
          setGiftModalVisible(false);
          setGiftInitialRecipient(undefined);
          // Parse recipients — bisa 'all', satu username, atau comma-separated (multi-select)
          // Hoisted here so both WS send AND animation logic can use the same values.
          const isAll = info.recipient === 'all';
          const recipientList = isAll
            ? ['all']
            : info.recipient.split(',').map(r => r.trim()).filter(Boolean);

          // Kirim satu WS SEND_GIFT per penerima agar backend proses & deduct diamond masing-masing.
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            for (const recipient of recipientList) {
              wsRef.current.send(JSON.stringify({
                type:         'SEND_GIFT',
                roomId:       room?.id ?? '',
                recipient,
                giftName:     info.giftName,
                giftEmoji:    info.giftEmoji,
                giftImageUrl: info.giftImageUrl ?? null,
                lottieUrl:    info.lottieUrl ?? null,
                videoUrl:     info.videoUrl ?? null,
                qty:          info.qty,
              }));
            }
          }

          // Compute target seat indices — only the selected/checked recipients.
          // This ensures animations fly ONLY to seats that actually receive the gift.
          const currentSeats = seatsRef.current;
          const targetSeatIndices: number[] = isAll
            ? currentSeats.filter(s => !!s.username).map(s => s.index)
            : recipientList.flatMap(r => {
                const found = currentSeats.find(
                  s => !!s.username && s.username.toLowerCase() === r.toLowerCase(),
                );
                return found ? [found.index] : [];
              });

          // Gift has video or lottie → show centered card for sender (Luxury = half-screen)
          const isLuxuryGiftSend = String(info.category ?? '').toLowerCase() === 'luxury';
          if (info.videoUrl || info.lottieUrl || isLuxuryGiftSend) {
            popularSplashScale.setValue(0.3);
            popularSplashOpacity.setValue(0);
            popularSplashTransX.setValue(0);
            popularSplashTransY.setValue(0);
            setPopularGiftSplash({ videoUrl: info.videoUrl ?? null, lottieUrl: info.lottieUrl ?? null, imageUrl: info.giftImageUrl, emoji: info.giftEmoji, giftName: info.giftName, isLuxury: isLuxuryGiftSend });
            Animated.sequence([
              Animated.parallel([
                Animated.spring(popularSplashScale,   { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
                Animated.timing(popularSplashOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
              ]),
              Animated.delay(isLuxuryGiftSend ? 9000 : 2200),
              Animated.timing(popularSplashOpacity, { toValue: 0, duration: isLuxuryGiftSend ? 600 : 350, useNativeDriver: true }),
            ]).start(() => setPopularGiftSplash(null));
            return;
          }

          // No lottie → fly-to-seat animation.
          // Use the FIRST selected recipient's seat (not just any occupied seat).
          const recipientSeat = targetSeatIndices.length > 0
            ? currentSeats.find(s => s.index === targetSeatIndices[0])
            : null;
          let deltaX = 0;
          let deltaY = -(SH * 0.3); // fallback: fly upward if no seat found
          if (recipientSeat) {
            const col = (recipientSeat.index - 1) % 4;
            const row = Math.floor((recipientSeat.index - 1) / 4);
            const seatCX = SEAT_H_PAD + col * (SEAT_SIZE + SEAT_GAP) + SEAT_SIZE / 2;
            const seatCY = seatsSectionYRef.current + 10
              + row * (SEAT_FRAME_SIZE + 30 + 4)
              + Math.round((SEAT_FRAME_SIZE - SEAT_SIZE) / 2) + SEAT_SIZE / 2;
            deltaX = seatCX - SW / 2;
            deltaY = seatCY - SH / 2;
          }
          popularSplashScale.setValue(0.05);
          popularSplashOpacity.setValue(0);
          popularSplashTransX.setValue(0);
          popularSplashTransY.setValue(0);
          setPopularGiftSplash({ imageUrl: info.giftImageUrl, emoji: info.giftEmoji });
          Animated.sequence([
            // Phase 1: pop-in at center (small → large)
            Animated.parallel([
              Animated.timing(popularSplashScale, {
                toValue: 1, duration: 380, useNativeDriver: true,
                easing: Easing.out(Easing.back(1.3)),
              }),
              Animated.timing(popularSplashOpacity, {
                toValue: 1, duration: 220, useNativeDriver: true,
              }),
            ]),
            // Phase 2: hold at center
            Animated.delay(500),
            // Phase 3: fly smoothly to seat — shrink, fade, translate together
            Animated.parallel([
              Animated.timing(popularSplashScale, {
                toValue: 0.12, duration: 520, useNativeDriver: true,
                easing: Easing.in(Easing.cubic),
              }),
              Animated.timing(popularSplashOpacity, {
                toValue: 0, duration: 480, useNativeDriver: true,
                easing: Easing.in(Easing.quad),
              }),
              Animated.timing(popularSplashTransX, {
                toValue: deltaX, duration: 520, useNativeDriver: true,
                easing: Easing.in(Easing.cubic),
              }),
              Animated.timing(popularSplashTransY, {
                toValue: deltaY, duration: 520, useNativeDriver: true,
                easing: Easing.in(Easing.cubic),
              }),
            ]),
          ]).start(() => setPopularGiftSplash(null));
          // Fire ring-particles ONLY to the selected recipient seats (not all occupied seats)
          triggerTapToAllSeats(info.giftEmoji, info.giftImageUrl, SW / 2, SH / 2, targetSeatIndices);
        }}
      />

      {/* Game Modal — Grady Hub */}
      <Modal
        visible={gameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGameModalVisible(false)}
      >
        <Pressable style={gameModalStyles.overlay} onPress={() => setGameModalVisible(false)}>
          <Pressable style={gameModalStyles.sheet} onPress={e => e.stopPropagation()}>
            {/* Handle + close row — no title */}
            <View style={gameModalStyles.topRow}>
              <View style={gameModalStyles.handle} />
              <TouchableOpacity style={gameModalStyles.closeBtn} onPress={() => setGameModalVisible(false)}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>
            {gameModalVisible && (
              <GradyHub
                apiBase={API_BASE}
                roomId={room?.id}
                onOpenGame={(url, name, emoji) => {
                  setGradyGameLoading(true);
                  setGradyGameWebView({ url, name, emoji });
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Grady Game WebView — bottom sheet ────────────────────────────────── */}
      <Modal
        visible={!!gradyGameWebView}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setGradyGameWebView(null)}
        statusBarTranslucent
      >
        <Pressable style={gradyWebViewStyles.overlay} onPress={() => setGradyGameWebView(null)}>
          <Pressable style={gradyWebViewStyles.container} onPress={e => e.stopPropagation()}>

            {/* WebView — fullscreen, no header */}
            {gradyGameWebView && (
              <WebView
                key={gradyGameWebView.url}
                source={{ uri: gradyGameWebView.url }}
                style={{ flex: 1, backgroundColor: '#1A0533' }}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                onLoadStart={() => setGradyGameLoading(true)}
                onLoadEnd={() => setGradyGameLoading(false)}
                originWhitelist={['*']}
              />
            )}

            {/* Loading overlay — rich purple gradient like game UI */}
            {gradyGameLoading && (
              <GradyLoadingOverlay name={gradyGameWebView?.name ?? ''} />
            )}

            {/* Floating close button — always on top of game */}
            <TouchableOpacity
              style={gradyWebViewStyles.floatingClose}
              onPress={() => setGradyGameWebView(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Grady Game Leaderboard Modal ──────────────────────────────────────── */}
      <Modal
        visible={gradyLbVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGradyLbVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={gradyLbStyles.overlay} onPress={() => setGradyLbVisible(false)}>
          <Pressable style={gradyLbStyles.sheet} onPress={e => e.stopPropagation()}>

            {/* Header */}
            <View style={gradyLbStyles.header}>
              <MaterialCommunityIcons name="trophy" size={20} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={gradyLbStyles.title}>Leaderboard Grady</Text>
                <Text style={gradyLbStyles.subtitle}>Top pemenang 24 jam terakhir</Text>
              </View>
              <TouchableOpacity onPress={() => setGradyLbVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Stats bar */}
            {gradyLbData && (
              <View style={gradyLbStyles.statsBar}>
                <View style={gradyLbStyles.statItem}>
                  <Text style={gradyLbStyles.statVal}>
                    {gradyLbData.totalPaidOut >= 1_000_000
                      ? `${(gradyLbData.totalPaidOut/1_000_000).toFixed(1)}M`
                      : gradyLbData.totalPaidOut >= 1000
                      ? `${(gradyLbData.totalPaidOut/1000).toFixed(1)}K`
                      : String(gradyLbData.totalPaidOut)}
                  </Text>
                  <Text style={gradyLbStyles.statLbl}>🪙 Coin Keluar</Text>
                </View>
                <View style={gradyLbStyles.statDivider} />
                <View style={gradyLbStyles.statItem}>
                  <Text style={gradyLbStyles.statVal}>{gradyLbData.totalSpins}</Text>
                  <Text style={gradyLbStyles.statLbl}>🎰 Total Menang</Text>
                </View>
              </View>
            )}

            {/* List */}
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {gradyLbLoading ? (
                <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 32 }} />
              ) : !gradyLbData?.winners?.length ? (
                <Text style={gradyLbStyles.empty}>Belum ada pemenang hari ini</Text>
              ) : (
                gradyLbData.winners.map((w, i) => (
                  <View key={w.username} style={gradyLbStyles.row}>
                    <Text style={gradyLbStyles.rowRank}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </Text>
                    <Text style={gradyLbStyles.rowEmoji}>{w.emoji}</Text>
                    <Text style={gradyLbStyles.rowUser} numberOfLines={1}>{w.username}</Text>
                    <Text style={gradyLbStyles.rowAmt}>
                      +{w.amount >= 1_000_000
                        ? `${(w.amount/1_000_000).toFixed(1)}M`
                        : w.amount >= 1000
                        ? `${(w.amount/1000).toFixed(1)}K`
                        : String(w.amount)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Session Leaderboard Modal ─────────────────────────────────────────── */}
      <Modal
        visible={sessionLbVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionLbVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={inRoomLbStyles.overlay} onPress={() => setSessionLbVisible(false)}>
          <Pressable style={inRoomLbStyles.sheet} onPress={e => e.stopPropagation()}>
            {/* Header */}
            <View style={inRoomLbStyles.header}>
              <MaterialCommunityIcons name="trophy" size={20} color="#F59E0B" />
              <Text style={inRoomLbStyles.title}>Leaderboard Sesi</Text>
              <TouchableOpacity onPress={() => setSessionLbVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            {/* Rows */}
            {seats.filter(s => !!s.username).sort((a, b) => (b.diamonds ?? 0) - (a.diamonds ?? 0)).length === 0 ? (
              <Text style={inRoomLbStyles.empty}>Belum ada peserta di kursi</Text>
            ) : (
              seats.filter(s => !!s.username).sort((a, b) => (b.diamonds ?? 0) - (a.diamonds ?? 0)).map((seat, idx) => {
                const coinFmt = (d: number) => d >= 1000 ? `${(d / 1000).toFixed(1)}K` : d.toString();
                const rankColors = ['#F59E0B', '#9CA3AF', '#CD7F32'];
                const isTop3 = idx < 3;
                return (
                  <View key={seat.index} style={inRoomLbStyles.row}>
                    {isTop3 ? (
                      <MaterialCommunityIcons name="trophy" size={18} color={rankColors[idx]} style={inRoomLbStyles.rankIcon} />
                    ) : (
                      <Text style={inRoomLbStyles.rankNum}>{idx + 1}</Text>
                    )}
                    <AvatarWithFrame
                      size={36}
                      username={seat.username ?? undefined}
                      displayPicture={seat.avatarUrl}
                      avatarFrameUrl={seat.avatarFrameUrl}
                      initial={(seat.username ?? '?').slice(0, 2).toUpperCase()}
                      backgroundColor={PARTY_PURPLE}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={inRoomLbStyles.name} numberOfLines={1}>{seat.username}</Text>
                      {seat.username === room?.creatorUsername && (
                        <Text style={inRoomLbStyles.roleHost}>Host</Text>
                      )}
                    </View>
                    <View style={inRoomLbStyles.diamondWrap}>
                      <Text style={{ fontSize: 13 }}>🪙</Text>
                      <Text style={inRoomLbStyles.diamondVal}>{coinFmt(seat.diamonds ?? 0)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Room Coin Leaderboard Modal (Lucky Gift per-room) ─────────────────── */}
      <Modal
        visible={roomCoinLbVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoomCoinLbVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={coinLbSt.overlay} onPress={() => setRoomCoinLbVisible(false)}>
          <Pressable style={coinLbSt.sheet} onPress={e => e.stopPropagation()}>

            {/* ── Compact gradient header row ── */}
            <LinearGradient
              colors={['#CC5500', '#FF8C00', '#FFA500']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={coinLbSt.banner}
            >
              {/* Left: icon + labels */}
              <View style={coinLbSt.bannerLeft}>
                <View style={coinLbSt.bannerIconBox}>
                  <MaterialCommunityIcons name="cash-multiple" size={20} color="#FF8C00" />
                </View>
                <View>
                  <Text style={coinLbSt.bannerLabel}>Total Gift Coin · Room Ini</Text>
                  <Text style={coinLbSt.bannerSub}>Semua kategori gift</Text>
                </View>
              </View>

              {/* Right: amount + close */}
              <View style={coinLbSt.bannerRight}>
                {(() => {
                  const n = roomCoinTotal;
                  const fmt = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
                            : n >= 1_000    ? `${(n / 1_000).toFixed(1)}K`
                            : n.toLocaleString('id-ID');
                  return <Text style={coinLbSt.bannerAmount}>{fmt}</Text>;
                })()}
                <TouchableOpacity
                  onPress={() => setRoomCoinLbVisible(false)}
                  style={coinLbSt.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* ── Section title ── */}
            <View style={coinLbSt.sectionRow}>
              <MaterialCommunityIcons name="trophy-outline" size={14} color="#FF8C00" />
              <Text style={coinLbSt.sectionTitle}>Top Pengirim Gift</Text>
            </View>

            {/* ── Participant list ── */}
            {roomCoinLoading ? (
              <ActivityIndicator size="small" color="#FF9500" style={{ paddingVertical: 24 }} />
            ) : roomCoinParticipants.length === 0 ? (
              <View style={coinLbSt.emptyWrap}>
                <MaterialCommunityIcons name="gift-outline" size={36} color="rgba(255,255,255,0.25)" />
                <Text style={coinLbSt.emptyText}>Belum ada yang mengirim gift</Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: SH * 0.42 }}
                refreshControl={
                  <RefreshControl
                    refreshing={roomCoinLoading}
                    onRefresh={() => fetchRoomCoinLb()}
                    tintColor="#FF8C00"
                    colors={['#FF8C00']}
                  />
                }
              >
                {roomCoinParticipants.map((p, idx) => {
                  const RANK_META = [
                    { iconName: 'medal' as const,        color: '#FFD700', bg: 'rgba(255,215,0,0.10)' },
                    { iconName: 'medal-outline' as const, color: '#C0C0C0', bg: 'rgba(192,192,192,0.08)' },
                    { iconName: 'medal-outline' as const, color: '#CD7F32', bg: 'rgba(205,127,50,0.08)' },
                  ];
                  const meta = RANK_META[idx] ?? { iconName: null, color: 'rgba(255,255,255,0.28)', bg: 'transparent' };
                  const val = Number(p.total_gift_sent);
                  const fmtVal = val >= 1_000_000 ? `${(val / 1_000_000).toFixed(2)}M`
                               : val >= 1_000    ? `${(val / 1_000).toFixed(1)}K`
                               : val.toString();
                  const isTop3 = idx < 3;
                  return (
                    <View key={p.username} style={[coinLbSt.row, isTop3 && { backgroundColor: meta.bg }]}>
                      {/* Rank badge */}
                      {isTop3 ? (
                        <View style={[coinLbSt.rankIconBox, { borderColor: meta.color + '55', backgroundColor: meta.color + '15' }]}>
                          <MaterialCommunityIcons name={meta.iconName!} size={16} color={meta.color} />
                        </View>
                      ) : (
                        <View style={coinLbSt.rankNumBox}>
                          <Text style={coinLbSt.rankNumText}>{idx + 1}</Text>
                        </View>
                      )}

                      {/* Avatar */}
                      <AvatarWithFrame
                        size={36}
                        username={p.username}
                        displayPicture={null}
                        initial={(p.username ?? '?').slice(0, 2).toUpperCase()}
                        backgroundColor={PARTY_PURPLE}
                        style={isTop3 ? {
                          borderWidth: 2, borderColor: meta.color,
                          borderRadius: 18,
                          shadowColor: meta.color, shadowOpacity: 0.5,
                          shadowRadius: 5, elevation: 3,
                        } : {}}
                      />

                      {/* Username */}
                      <Text style={[coinLbSt.rowName, isTop3 && { color: '#fff', fontWeight: '800' }]} numberOfLines={1}>
                        {p.username}
                      </Text>

                      {/* Coin pill */}
                      <View style={[coinLbSt.coinPill, { borderColor: meta.color + '55' }]}>
                        <MaterialCommunityIcons name="circle-multiple" size={13} color={isTop3 ? meta.color : '#FCD34D'} />
                        <Text style={[coinLbSt.coinPillText, { color: isTop3 ? meta.color : '#FCD34D' }]}>
                          {fmtVal}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Bottom padding — accounts for Android nav bar */}
            <View style={{ height: 14 + insets.bottom }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Participant List Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={participantListVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setParticipantListVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={participantStyles.overlay} onPress={() => setParticipantListVisible(false)}>
          <Pressable style={participantStyles.sheet} onPress={e => e.stopPropagation()}>
            {/* Handle */}
            <View style={participantStyles.handle} />
            {/* Header */}
            <View style={participantStyles.header}>
              <Ionicons name="people" size={20} color="#C4B5FD" />
              <Text style={participantStyles.title}>Peserta Room ({participantCount})</Text>
              <TouchableOpacity onPress={() => setParticipantListVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            {/* List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {(() => {
                const seen = new Set<string>();
                const rows: Array<{ username: string; displayName: string | null; avatarUrl: string | null; frameUrl: string | null; migLevel: number; role: string; seatIndex?: number }> = [];
                // Seated users first
                seats.filter(s => !!s.username).forEach(s => {
                  if (seen.has(s.username!)) return;
                  seen.add(s.username!);
                  rows.push({
                    username: s.username!,
                    displayName: s.displayName ?? profileCache.current[s.username!]?.displayName ?? null,
                    avatarUrl: s.avatarUrl ?? null,
                    frameUrl: s.avatarFrameUrl ?? null,
                    migLevel: participantLevelRef.current.get(s.username!) ?? 0,
                    role: s.username === room?.creatorUsername ? 'Host' : `Kursi ${s.index}`,
                    seatIndex: s.index,
                  });
                });
                // Remaining participants from chat
                participantSetRef.current.forEach(username => {
                  if (seen.has(username)) return;
                  seen.add(username);
                  const cached = profileCache.current[username];
                  rows.push({
                    username,
                    displayName: cached?.displayName ?? null,
                    avatarUrl: cached?.avatarUrl ?? null,
                    frameUrl: cached?.frameUrl ?? null,
                    migLevel: participantLevelRef.current.get(username) ?? 0,
                    role: username === room?.creatorUsername ? 'Host' : 'Penonton',
                  });
                });
                return rows.map(p => (
                  <View key={p.username} style={participantStyles.row}>
                    <AvatarWithFrame
                      size={42}
                      username={p.username}
                      displayPicture={p.avatarUrl}
                      avatarFrameUrl={p.frameUrl}
                      initial={(p.displayName ?? p.username).slice(0, 2).toUpperCase()}
                      backgroundColor={PARTY_PURPLE}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={participantStyles.username} numberOfLines={1}>{p.displayName || p.username}</Text>
                        {p.role === 'Host' && (
                          <View style={participantStyles.hostBadge}>
                            <Text style={participantStyles.hostBadgeText}>Host</Text>
                          </View>
                        )}
                        {p.role.startsWith('Kursi') && p.role !== 'Host' && (
                          <View style={participantStyles.seatBadge}>
                            <MaterialCommunityIcons name="microphone" size={9} color="#A7F3D0" />
                            <Text style={participantStyles.seatBadgeText}>{p.role}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 }}>
                        <LevelBadge level={p.migLevel} />
                        {p.role === 'Penonton' && (
                          <Text style={participantStyles.viewerLabel}>Penonton</Text>
                        )}
                      </View>
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Room Settings Sheet */}
      <PartyRoomSettingsSheet
        visible={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
        isOwner={isOwner}
        roomName={localName}
        onOpenRoomManagement={isOwner ? () => { setSettingsSheetVisible(false); setManagementSheetVisible(true); } : undefined}
        onOpenMusicPicker={canControlMusic ? () => { setSettingsSheetVisible(false); setTimeout(() => setMusicPickerVisible(true), 320); } : undefined}
        onOpenMemberManagement={() => { setSettingsSheetVisible(false); setTimeout(() => setMemberMgmtVisible(true), 320); }}
        onOpenLock={isOwner ? () => { setSettingsSheetVisible(false); setTimeout(() => setLockModalVisible(true), 320); } : undefined}
        onOpenMode={isOwner ? () => { setSettingsSheetVisible(false); setTimeout(() => setModeModalVisible(true), 320); } : undefined}
        isLocked={isLocked}
        isFreeSeat={isFreeSeat}
        onToggleFreeSeat={isOwner ? async (val) => {
          setIsFreeSeat(val);
          wsRef.current?.send(JSON.stringify({ type: 'SEAT_MODE', roomId: room?.id, freeSeat: val }));
          await updatePartySeatMode(room?.id ?? '', val);
        } : undefined}
        isMicMuted={isMuted}
        onToggleFreeMic={handleMuteToggle}
        onOpenInvite={canControlMusic ? () => { setSettingsSheetVisible(false); setTimeout(() => setInviteAudienceVisible(true), 320); } : undefined}
        isMuteRoom={isMuteRoom}
        onToggleMuteRoom={(val) => {
          setIsMuteRoom(val);
          setRoomAudioMuted(val);
        }}
      />

      {/* Room Management Sheet */}
      <PartyRoomManagementSheet
        visible={managementSheetVisible}
        onClose={() => setManagementSheetVisible(false)}
        roomId={room?.id ?? ''}
        isOwner={isOwner}
        roomName={localName}
        roomDescription={localDesc}
        currentBgUri={customBgUri}
        onSaveName={handleManagementSaveName}
        onSaveAnnouncement={handleManagementSaveAnnouncement}
        onBgChange={async (uri, isLocal) => {
          if (!room?.id) return;
          const prevBg = customBgUri;
          // Show local file preview immediately for owner
          setCustomBgUri(uri);
          if (isLocal) {
            setIsBgUploading(true);
          }
          try {
            if (isLocal) {
              const fileInfo = await FileSystem.getInfoAsync(uri);
              if (!fileInfo.exists) {
                setCustomBgUri(prevBg);
                setIsBgUploading(false);
                return;
              }
              const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
              const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
              const mimeType = mimeMap[ext] ?? 'image/jpeg';
              // Use string literal 'base64' — FileSystem.EncodingType not re-exported in SDK 55
              const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
              const result = await uploadPartyBackground(room.id, base64Data, mimeType);
              setIsBgUploading(false);
              if (result.ok && result.backgroundImage) {
                // Server may return relative path (/uploads/...) — normalize before storing
                const finalUrl = normalizeBgUrl(result.backgroundImage) ?? result.backgroundImage;
                setCustomBgUri(finalUrl);
                // Sync parent room object so modal doesn't revert on re-open
                onRoomUpdated?.({ ...room, backgroundImage: finalUrl });
              } else {
                Alert.alert('Gagal Upload', result.error ?? 'Tidak bisa mengupload gambar. Coba lagi.');
                setCustomBgUri(prevBg);
              }
            } else {
              // Recommended background — URL is already a full HTTP URL (e.g. Unsplash)
              const ok = await updatePartyRoom(room.id, { backgroundImage: uri });
              if (ok) {
                // Sync parent room object so modal doesn't revert on re-open
                onRoomUpdated?.({ ...room, backgroundImage: uri });
              } else {
                setCustomBgUri(prevBg);
              }
            }
          } catch (e) {
            console.warn('[BG] onBgChange error:', e);
            setCustomBgUri(prevBg);
            setIsBgUploading(false);
          }
        }}
        onOpenMusicPicker={() => setMusicPickerVisible(true)}
      />

      {/* Member Management Sheet */}
      <PartyMemberManagementSheet
        visible={memberMgmtVisible}
        onClose={() => setMemberMgmtVisible(false)}
        roomId={room?.id ?? ''}
        isOwner={isOwner}
      />

      {/* Mode Room Modal — seat layout selector */}
      <PartyRoomModeModal
        visible={modeModalVisible}
        onClose={() => setModeModalVisible(false)}
        roomId={room?.id ?? ''}
        currentSeatCount={currentSeatCount}
        onSeatCountChanged={(_count) => {
          // Server sudah broadcast SEAT_COUNT dengan reset:true ke semua member
          // (termasuk owner), sehingga state seats & mySeatIndex akan di-reset
          // otomatis oleh WS handler. Cukup tutup modal di sini.
          setModeModalVisible(false);
        }}
      />

      {/* Lock Password Modal — owner sets/clears password */}
      <PartyLockPasswordModal
        visible={lockModalVisible}
        onClose={() => setLockModalVisible(false)}
        mode="set"
        roomId={room?.id ?? ''}
        isCurrentlyLocked={isLocked}
        onLockChanged={(locked) => {
          setIsLocked(locked);
          setLockModalVisible(false);
        }}
      />

      {/* Password Entry Modal — non-owner enters password */}
      <PartyLockPasswordModal
        visible={pwEntryVisible}
        onClose={() => { setPwEntryVisible(false); onClose(); }}
        mode="enter"
        roomId={room?.id ?? ''}
        onPasswordVerified={(password) => {
          setPwEntryVisible(false);
          if (room) connectAudio(room.id, false, password);
        }}
      />

      {/* Seat Avatar Action Sheet */}
      <PartySeatActionSheet
        visible={!!seatActionTarget}
        onClose={() => setSeatActionTarget(null)}
        target={seatActionTarget}
        isOwnerOrAdmin={isOwner}
        isMe={seatActionTarget?.username === currentUser?.username}
        onViewProfile={(username) => setProfileUsername(username)}
        onToggleMute={(seatIndex, currentlyMuted) => handleToggleOtherSeatMute(seatIndex, currentlyMuted)}
        onKickFromSeat={isOwner ? handleKickFromSeat : undefined}
        onSendGift={(username) => {
          setSeatActionTarget(null);
          setGiftInitialRecipient(username);
          setGiftModalVisible(true);
        }}
      />

      {/* ── My Mic Mute/Unmute Popup ── */}
      {myMutePopupVisible && (
        <Pressable
          style={mutePopSt.overlay}
          onPress={() => setMyMutePopupVisible(false)}
        >
          <Pressable style={mutePopSt.sheet} onPress={e => e.stopPropagation()}>
            {/* Drag handle */}
            <View style={mutePopSt.handle} />

            <Text style={mutePopSt.title}>Mikrofon Saya</Text>

            {/* Big mic button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                await handleMuteToggle();
              }}
              style={[
                mutePopSt.micBtn,
                { backgroundColor: isMuted ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' },
              ]}
            >
              <View style={[
                mutePopSt.micInner,
                { backgroundColor: isMuted ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)' },
              ]}>
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={48}
                  color={isMuted ? '#EF4444' : '#22C55E'}
                />
              </View>
              <Text style={[
                mutePopSt.micLabel,
                { color: isMuted ? '#EF4444' : '#22C55E' },
              ]}>
                {isMuted ? 'Ketuk untuk Aktifkan Mic' : 'Ketuk untuk Matikan Mic'}
              </Text>
            </TouchableOpacity>

            {/* Status badge */}
            <View style={[
              mutePopSt.statusBadge,
              { backgroundColor: isMuted ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' },
            ]}>
              <View style={[mutePopSt.statusDot, { backgroundColor: isMuted ? '#EF4444' : '#22C55E' }]} />
              <Text style={[mutePopSt.statusText, { color: isMuted ? '#EF4444' : '#22C55E' }]}>
                {isMuted ? 'Mic Dimatikan' : 'Mic Aktif'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setMyMutePopupVisible(false)}
              style={mutePopSt.closeBtn}
            >
              <Text style={mutePopSt.closeTxt}>Tutup</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {/* Mini Profile — opened from seat action sheet */}
      {profileUsername && (
        <ViewProfileModal
          visible={!!profileUsername}
          username={profileUsername}
          displayName={profileUsername}
          avatarColor="#6366F1"
          currentUserId={currentUser?.username ?? ''}
          onClose={() => setProfileUsername(null)}
          onSendGift={(username) => {
            setProfileUsername(null);
            setGiftInitialRecipient(username);
            setGiftModalVisible(true);
          }}
          onPrivateChat={(uname, dname) => {
            setProfileUsername(null);
            onOpenPrivateChat?.(uname, dname);
          }}
        />
      )}

      {/* ── Invite Audience to Seat ──────────────────────────────────────────── */}
      {inviteAudienceVisible && (
        <Modal
          visible={inviteAudienceVisible}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => { setInviteAudienceVisible(false); setInviteSelectedUser(null); }}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
            onPress={() => { setInviteAudienceVisible(false); setInviteSelectedUser(null); }}
          >
            <Pressable
              style={{ backgroundColor: '#1A1035', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '75%' }}
              onPress={e => e.stopPropagation()}
            >
              {/* Handle */}
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 10, marginBottom: 4 }} />

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                <MaterialCommunityIcons name="account-voice" size={20} color="#C4B5FD" />
                <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' }}>
                  {inviteSelectedUser ? `Pilih Kursi untuk ${inviteSelectedUser}` : 'Undang Penonton ke Kursi'}
                </Text>
                <TouchableOpacity
                  onPress={() => { setInviteAudienceVisible(false); setInviteSelectedUser(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              {inviteSelectedUser ? (
                /* ── Step 2: pick empty seat ── */
                <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 }}>Pilih kursi kosong:</Text>
                  {seats.map(s => {
                    const isEmpty = !s.username;
                    if (!isEmpty) return null;
                    const seatNum = s.index;
                    return (
                      <TouchableOpacity
                        key={seatNum}
                        onPress={() => {
                          const msg = `🎤 ${creatorName} mengundang @${inviteSelectedUser} ke Kursi ${seatNum}`;
                          wsRef.current?.send(JSON.stringify({
                            type: 'SEND_MESSAGE',
                            roomId: room?.id,
                            text: msg,
                          }));
                          setInviteAudienceVisible(false);
                          setInviteSelectedUser(null);
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: 'rgba(139,92,246,0.18)', borderRadius: 12,
                          padding: 14, borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
                        }}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="microphone" size={18} color="#C4B5FD" />
                        </View>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Kursi {seatNum}</Text>
                        <View style={{ marginLeft: 'auto', backgroundColor: '#22C55E', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>KOSONG</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {seats.every(s => !!s.username) && (
                    <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 16, fontSize: 13 }}>
                      Semua kursi sudah terisi
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setInviteSelectedUser(null)}
                    style={{ marginTop: 8, alignItems: 'center', padding: 10 }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>← Kembali</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                /* ── Step 1: pick audience member ── */
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  {(() => {
                    const seatedUsernames = new Set(seats.filter(s => !!s.username).map(s => s.username!));
                    const audience: Array<{ username: string; avatarUrl: string | null; migLevel: number }> = [];
                    participantSetRef.current.forEach(uname => {
                      if (seatedUsernames.has(uname) || uname === room?.creatorUsername) return;
                      const cached = profileCache.current[uname];
                      audience.push({
                        username: uname,
                        avatarUrl: cached?.avatarUrl ?? null,
                        migLevel: participantLevelRef.current.get(uname) ?? 0,
                      });
                    });
                    if (audience.length === 0) {
                      return (
                        <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 24, fontSize: 13 }}>
                          Tidak ada penonton di room ini
                        </Text>
                      );
                    }
                    return audience.map(u => (
                      <TouchableOpacity
                        key={u.username}
                        onPress={() => setInviteSelectedUser(u.username)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <AvatarWithFrame
                          size={40}
                          username={u.username}
                          displayPicture={u.avatarUrl}
                          avatarFrameUrl={null}
                          initial={u.username.slice(0, 2).toUpperCase()}
                          backgroundColor={PARTY_PURPLE}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{u.username}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <LevelBadge level={u.migLevel} />
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Penonton</Text>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    ));
                  })()}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Music Picker — at top level so music survives modal close */}
      <PartyMusicPickerSheet
        visible={musicPickerVisible}
        onClose={() => setMusicPickerVisible(false)}
        soundRef={musicSoundRef}
        playingId={musicPlayingId}
        setPlayingId={setMusicPlayingId}
        isPlaying={musicIsPlaying}
        setIsPlaying={setMusicIsPlaying}
        currentTrack={musicCurrentTrack}
        setCurrentTrack={setMusicCurrentTrack}
        setIsLocalPlayer={setMusicIsLocalPlayer}
        wsRef={wsRef}
        roomId={room?.id}
        isOwner={isOwner}
      />

      {/* Exit Confirmation Overlay */}
      <Modal
        visible={exitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExitModalVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={exitStyles.overlay} onPress={() => setExitModalVisible(false)}>
          <Pressable
            style={[exitStyles.sheet, { paddingTop: insets.top + 16 }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={exitStyles.title}>Apakah tutup ruangan?</Text>
            <View style={exitStyles.btnRow}>

              {/* Minimalkan */}
              <TouchableOpacity style={exitStyles.optionWrap} onPress={handleMinimize} activeOpacity={0.8}>
                <View style={exitStyles.circle}>
                  <Ionicons name="contract-outline" size={24} color="#111" />
                </View>
                <Text style={exitStyles.optionLabel}>Minimalkan</Text>
              </TouchableOpacity>

              {/* Keluar */}
              <TouchableOpacity style={exitStyles.optionWrap} onPress={handleFullExit} activeOpacity={0.8}>
                <View style={exitStyles.circle}>
                  <Ionicons name="enter-outline" size={24} color="#111" style={{ transform: [{ scaleX: -1 }] }} />
                </View>
                <Text style={exitStyles.optionLabel}>Keluar</Text>
              </TouchableOpacity>

              {/* Tutup Room (owner only) */}
              {isOwner && (
                <TouchableOpacity style={exitStyles.optionWrap} onPress={handleCloseRoom} activeOpacity={0.8}>
                  <View style={exitStyles.circle}>
                    <Ionicons name="power" size={24} color="#111" />
                  </View>
                  <Text style={exitStyles.optionLabel}>Tutup</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Siaran Berakhir overlay (slides in after exit/close) ─────────────── */}
      <Modal
        visible={endSummaryVisible}
        transparent={false}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { setEndSummaryVisible(false); onClose(); }}
      >
        <View style={endSumStyles.screen}>
          {/* Back arrow */}
          <TouchableOpacity
            style={[endSumStyles.backBtn, { top: insets.top + 12 }]}
            onPress={() => { setEndSummaryVisible(false); onClose(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={26} color="#111" />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={[endSumStyles.content, { paddingTop: insets.top + 56 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={endSumStyles.title}>Siaran berakhir</Text>

            {/* ── 3×2 stat grid ───────────────────────────────────────────── */}
            <View style={endSumStyles.statsGrid}>
              <View style={endSumStyles.statCard}>
                <Text style={endSumStyles.statValue}>
                  {(endSummaryData?.totalCoins ?? 0).toLocaleString()}
                </Text>
                <Text style={endSumStyles.statLabel}>🪙 Coins</Text>
              </View>
              <View style={endSumStyles.statCard}>
                <Text style={endSumStyles.statValue}>{participantCount}</Text>
                <Text style={endSumStyles.statLabel}>Penonton</Text>
              </View>
              <View style={endSumStyles.statCard}>
                <Text style={[endSumStyles.statValue, { color: '#F97316' }]}>
                  {fmtDur(endSummaryDurationRef.current)}
                </Text>
                <Text style={endSumStyles.statLabel}>Waktu</Text>
              </View>
              <View style={endSumStyles.statCard}>
                <Text style={endSumStyles.statValue}>0</Text>
                <Text style={endSumStyles.statLabel}>Mengikuti</Text>
              </View>
              <View style={endSumStyles.statCard}>
                <Text style={endSumStyles.statValue}>0</Text>
                <Text style={endSumStyles.statLabel}>Berlangganan</Text>
              </View>
              <View style={endSumStyles.statCard}>
                <Text style={endSumStyles.statValue}>
                  {endSummaryData?.spenderCount ?? 0}
                </Text>
                <Text style={endSumStyles.statLabel}>Spender</Text>
              </View>
            </View>

            {/* ── Peringkat spender ─────────────────────────────────────── */}
            <Text style={endSumStyles.rankTitle}>Peringkat spender</Text>
            <View style={endSumStyles.rankCard}>
              {endSummaryLoading ? (
                <ActivityIndicator color="#F97316" style={{ marginVertical: 32 }} />
              ) : !endSummaryData || endSummaryData.spenders.length === 0 ? (
                <View style={endSumStyles.emptyWrap}>
                  <View style={endSumStyles.emptyCircle}>
                    <Ionicons name="gift-outline" size={32} color="#D1D5DB" />
                  </View>
                  <Text style={endSumStyles.emptyText}>
                    Tidak ada hadiah yang diterima dalam siaran ini
                  </Text>
                </View>
              ) : (
                endSummaryData.spenders.map((sp, i) => (
                  <View key={sp.username} style={[
                    endSumStyles.spenderRow,
                    i < endSummaryData.spenders.length - 1 && endSumStyles.spenderRowBorder,
                  ]}>
                    <Text style={endSumStyles.spenderRank}>{i + 1}</Text>
                    <View style={endSumStyles.spenderAvatar}>
                      {sp.avatarUrl ? (
                        <Image
                          source={{ uri: sp.avatarUrl }}
                          style={{ width: 38, height: 38, borderRadius: 19 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={endSumStyles.spenderInitial}>
                          {(sp.username ?? '?').slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={endSumStyles.spenderName}>{sp.username}</Text>
                      <Text style={endSumStyles.spenderCoins}>
                        🪙 {sp.totalCoins.toLocaleString()}
                      </Text>
                    </View>
                    <View style={endSumStyles.giftQtyBadge}>
                      <Text style={endSumStyles.giftQtyText}>×{sp.giftQty}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDur(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 220,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerTexts: { flex: 1 },
  headerCreator: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  headerSub:  {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerRight:{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  iconBtn:    { padding: 2 },
  iconBtnBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  exitBtnBg: {
    borderColor: 'rgba(255,80,80,0.3)',
    backgroundColor: 'rgba(255,50,50,0.15)',
  },
  avatarCol: {
    alignItems: 'center',
    gap: 4,
  },
  trophyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  participantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    minWidth: 44,
    justifyContent: 'center',
  },
  participantBtnText: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '700',
  },
  followBtnBg: {
    borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(124,58,237,0.2)',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineFollowBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(124,58,237,0.35)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  inlineFollowBtnActive: {
    backgroundColor: 'rgba(6,78,59,0.45)',
    borderColor: 'rgba(52,211,153,0.5)',
  },

  seatsSection: {
    paddingHorizontal: SEAT_H_PAD,
    paddingTop: 0,
    paddingBottom: 0,
  },

  muteBtn: {
    alignSelf: 'center',
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  muteBtnActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  handBtnActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  muteBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  chatContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 6,
    backgroundColor: 'transparent',
  },
  toolbarIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarIcon:  { padding: 6 },
  toolbarPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  chatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.4, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
});

const mutePopSt = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 18,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  micBtn: {
    width: 140, height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  micInner: {
    width: 100, height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  micLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 24,
  },
  statusDot: {
    width: 8, height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  closeTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});

const seatStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: SEAT_GAP,
    rowGap: 4,
    alignItems: 'flex-start',
  },
  wrap: {
    width: SEAT_SIZE,
    height: SEAT_FRAME_SIZE + 30,  // ← fixed height sama untuk semua kursi (frame + teks)
    alignItems: 'center',
    justifyContent: 'flex-start',
    // Tidak ada paddingTop — masing-masing tipe kursi atur sendiri agar circle center sejajar
  },
  bubble: {
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: SEAT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    elevation: 5,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  bubbleMe: {
    borderWidth: 2.5,
  },
  speakRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  initials:   { fontSize: SEAT_SIZE * 0.28, fontWeight: '800', color: '#fff' },
  mutedBadge: {
    position: 'absolute', bottom: 1, right: 1,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#08061C',
  },
  handBadge: {
    position: 'absolute', top: -2, left: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#08061C',
  },
  seatNum:  { fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 },
  seatName: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600', maxWidth: SEAT_SIZE, textAlign: 'center', marginTop: 3 },
  diamondRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 1 },
  diamondIcon: { fontSize: 9 },
  diamondCount: { fontSize: 9, color: '#93C5FD', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});

const chatStyles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tab: {
    marginRight: 20,
    paddingVertical: 9,
    alignItems: 'center',
    position: 'relative',
  },
  tabText:       { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  tabUnderline:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  list:        { flex: 1 },
  listContent: { paddingHorizontal: 0, paddingVertical: 6, gap: 2 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: 2,
  },
  sender: {
    fontSize: 13, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  colon: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  msgText: {
    fontSize: 13, color: 'rgba(255,255,255,0.92)', flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  msgTextMe:  { color: '#fff', fontWeight: '600' },

  // ── Premium bubble layout ──────────────────────────────────────────────────
  bubbleWrapper: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            8,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  bubbleAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOpacity: 0.5,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  bubbleAvatarImg: { width: '100%', height: '100%' },
  bubbleAvatarFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  bubbleAvatarInitials: {
    fontSize: 14, fontWeight: '800', letterSpacing: 0.5, color: '#fff',
  },
  bubbleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  bubbleUsername: {
    fontSize: 13, fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  agencyBadge: {
    backgroundColor: '#0E7490',
    borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.5)',
    shadowColor: '#22D3EE', shadowOpacity: 0.5,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  agencyBadgeText: {
    fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  hostBadge: {
    backgroundColor: '#C026D3',
    borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(232,121,249,0.6)',
    shadowColor: '#E879F9', shadowOpacity: 0.6,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  hostBadgeText: {
    fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  bubbleFrame: {
    backgroundColor: 'rgba(8,4,28,0.72)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(180,150,255,0.35)',
    paddingHorizontal: 11, paddingVertical: 8,
    alignSelf: 'flex-start',
    maxWidth: '96%',
    shadowColor: '#A855F7', shadowOpacity: 0.2,
    shadowRadius: 8, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
    position: 'relative',
  },
  bubbleFrameMe: {
    backgroundColor: 'rgba(30,15,70,0.78)',
    borderColor: 'rgba(139,92,246,0.6)',
    shadowColor: '#7C3AED', shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  bubbleCorner: {
    position: 'absolute',
    fontSize: 8,
    color: 'rgba(200,170,255,0.65)',
    lineHeight: 10,
  },
  bubbleMsgText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 20,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sysUser: {
    fontSize: 12, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sysAction: {
    fontSize: 12, color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  joinRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(109,40,217,0.55)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.5)',
    marginVertical: 2,
    alignSelf: 'flex-start',
    maxWidth: '95%',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  joinIcon: {
    fontSize: 12,
    marginRight: 5,
  },
  joinAction: {
    fontSize: 12,
    color: '#E9D5FF',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── Join notification card — distinct teal style ──────────────────────────
  joinNotif: {
    backgroundColor: 'rgba(109,40,217,0.38)',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.45)',
    marginVertical: 2,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  joinNotifAccent: {
    width: 0,
  },
  joinNotifInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 4,
  },
  joinNotifAvatar: {
    width: 0,
    height: 0,
  },
  joinNotifAvatarText: {
    fontSize: 0,
  },
  joinNotifBody: {
    justifyContent: 'center',
  },
  joinNotifNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  joinNotifUsername: {
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 100,
    color: '#E9D5FF',
  },
  joinNotifSub: {
    fontSize: 11,
    color: '#DDD6FE',
    fontWeight: '400',
  },
  joinWelcomeBtn: {
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  joinWelcomeBtnText: {
    fontSize: 0,
  },
  sysGeneric: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lbPill: {
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginVertical: 2,
    alignSelf: 'flex-start',
    maxWidth: '95%',
  },
  lbPillText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  gameWinBox: {
    backgroundColor: 'rgba(34,197,94,0.22)',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 3,
  },
  gameWinText: {
    fontSize: 13,
    color: '#dcfce7',
    lineHeight: 19,
    flexShrink: 1,
  },
  gameWinUser: {
    fontWeight: '800',
    color: '#4ade80',
  },
  gameWinAmount: {
    fontWeight: '700',
    color: '#86efac',
  },
  gameWinGame: {
    fontWeight: '600',
    color: '#bbf7d0',
  },
  gameWinGlobalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(120,80,0,0.72)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.55)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginVertical: 4,
    gap: 10,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  gameWinGlobalLeft: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(251,191,36,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.45)',
  },
  gameWinGlobalEmoji: {
    fontSize: 22,
  },
  gameWinGlobalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  gameWinGlobalBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  gameWinGlobalSlot: {
    fontSize: 14,
  },
  gameWinGlobalUser: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FCD34D',
    marginBottom: 1,
  },
  gameWinGlobalAmt: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FEF3C7',
    marginBottom: 1,
  },
  gameWinGlobalGame: {
    fontSize: 10,
    color: 'rgba(253,230,138,0.70)',
    fontWeight: '500',
  },
  roomInfoHeader: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 4,
    gap: 5,
  },
  roomInfoBox: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20,10,50,0.68)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  roomInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  roomInfoDescBox: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20,10,50,0.55)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  roomInfoDesc: {
    fontSize: 12,
    color: '#86efac',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

const exitStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
  },
  sheet: {
    width: '100%',
    backgroundColor: 'rgba(40,30,80,0.72)',
    paddingBottom: 32,
    paddingHorizontal: 0,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 28,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 16,
  },
  optionWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12102A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(124,58,237,0.3)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: '#EF4444' },
  errorText:  { color: '#EF4444', fontSize: 12, marginTop: 3 },
  charCount:  { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right', marginTop: 2 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: PARTY_PURPLE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: PARTY_PURPLE,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

const gameModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0E0B1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '82%',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(167,85,247,0.45)',
    shadowColor: '#A855F7',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  handle: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 40,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const gradyStyles = StyleSheet.create({
  container: { paddingBottom: 28 },

  // ── Marquee ──────────────────────────────────────────────────────────────────
  marqueeWrap: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  marqueeClip: {
    flex: 1,
    overflow: 'hidden',
    height: 36,
    justifyContent: 'center',
  },
  marqueeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    width: 2000,
  },
  marqueeFadeL: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 28, zIndex: 2,
  },
  marqueeFadeR: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 28, zIndex: 2,
  },

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tabActiveGrad: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 22,
    shadowColor: '#A855F7',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tabActiveText: {
    fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.2,
  },
  tabInactive: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabInactiveText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },

  // ── Grid ─────────────────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 10,
  },
  card: {
    width: '30%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A0A35',
    borderWidth: 1,
    borderColor: 'rgba(167,85,247,0.2)',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  cardDisabled: { opacity: 0.38 },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A0A35',
    position: 'relative',
    overflow: 'hidden',
  },
  cardEmoji: { fontSize: 38, textAlign: 'center' },
  cardThumb: { width: '100%', height: '100%' },
  soonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soonText: {
    fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1,
  },
  badge: {
    position: 'absolute', top: 7, left: 7, zIndex: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  badgeNew: { backgroundColor: '#059669' },
  badgeHot: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
  badgeText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  cardNameOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 7, paddingTop: 14,
    alignItems: 'center',
  },
  cardNameTxt: {
    fontSize: 10, fontWeight: '700', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 0.2,
  },
});

const gradyWebViewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  container: {
    height: '78%',
    backgroundColor: '#1A0533',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(167,85,247,0.45)',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(74,16,144,0.6)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(167,85,247,0.35)',
  },
  backBtn: {
    padding: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(232,121,249,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  balPill: {
    backgroundColor: 'rgba(245,158,11,0.85)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
    maxWidth: 90,
    borderWidth: 1,
    borderColor: 'rgba(255,200,80,0.5)',
  },
  balPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  trophyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
  },
  floatingClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 999,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const gradyLoadingStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Animated glow orbs
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  glowTopLeft: {
    top: -60,
    left: -80,
    backgroundColor: '#C026D3',
    shadowColor: '#E879F9',
    shadowOpacity: 1,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
  },
  glowTopRight: {
    top: -40,
    right: -80,
    backgroundColor: '#7C3AED',
    shadowColor: '#A855F7',
    shadowOpacity: 1,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
  },
  glowBottom: {
    bottom: -80,
    alignSelf: 'center',
    width: 320,
    height: 200,
    borderRadius: 160,
    backgroundColor: '#4A1090',
    shadowColor: '#7C3AED',
    shadowOpacity: 1,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
  },
  halo: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(232,121,249,0.18)',
    shadowColor: '#E879F9',
    shadowOpacity: 1,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  spinnerWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    transform: [{ scale: 1.5 }],
  },
  loadingName: {
    marginTop: 80,
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(232,121,249,0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  loadingSub: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(232,121,249,0.7)',
    letterSpacing: 0.3,
  },
});

const gradyLbStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,158,11,0.3)',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    paddingVertical: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F59E0B',
  },
  statLbl: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(245,158,11,0.3)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rowRank: {
    width: 28,
    fontSize: 16,
    textAlign: 'center',
  },
  rowEmoji: {
    fontSize: 18,
  },
  rowUser: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  rowAmt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4ade80',
  },
  empty: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 32,
  },
});

const coinLbSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#14102A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(255,140,0,0.35)',
  },
  // Compact single-row header
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
  },
  bannerSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.70)',
    marginTop: 1,
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF8C00',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rankIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
  },
  rowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,184,0,0.10)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  coinPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
  },
});

const inRoomLbStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#12102A',
    borderRadius: 22,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    maxHeight: SH * 0.65,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  empty: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    paddingVertical: 28,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  rankIcon: {
    width: 26,
    textAlign: 'center',
  },
  rankNum: {
    width: 26,
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  roleHost: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '700',
    marginTop: 1,
  },
  diamondWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(147,197,253,0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  diamondVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#93C5FD',
  },
});

const participantStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12102A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SH * 0.75,
    borderTopWidth: 1,
    borderTopColor: 'rgba(124,58,237,0.3)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 12, marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  username: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  hostBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
  },
  seatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  seatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  viewerLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginLeft: 2,
  },
});

// ─── Siaran Berakhir styles ────────────────────────────────────────────────────
const endSumStyles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#F9FAFB',
    zIndex: 9999,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    width: (SW - 64) / 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  rankTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  rankCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  emptyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  spenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  spenderRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  spenderRank: {
    width: 20,
    fontSize: 13,
    fontWeight: '800',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  spenderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spenderInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6B7280',
  },
  spenderName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  spenderCoins: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  giftQtyBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  giftQtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F97316',
  },
});
