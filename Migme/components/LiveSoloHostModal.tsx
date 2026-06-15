import { useCallback, useEffect, useRef, useState } from 'react';
import GiftComboOverlay, { type GiftComboHandle } from './GiftComboOverlay';
import VipEntranceBanner from './VipEntranceBanner';
import type { VipJoinEntry } from './VipEntranceBanner';
import VipBadge, { VIP_BOX_COLORS } from './VipBadge';
import SoloGiftPickerSheet, { type SoloGiftSentInfo } from './SoloGiftPickerSheet';
import SoloGiftEffectLayer, { type SoloGiftEffectHandle } from './SoloGiftEffectLayer';
import {
  ActivityIndicator, Alert, Animated, AppState, AppStateStatus,
  Dimensions, FlatList, Image,
  Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'react-native-vision-camera';
import BeautyCameraView, { BeautyParams, DEFAULT_BEAUTY_PARAMS } from './BeautyCameraView';
import LiveViewerListModal from './LiveViewerListModal';
import LiveSoloKickSheet from './LiveSoloKickSheet';
import LiveSoloBlockSheet from './LiveSoloBlockSheet';
import LiveSoloAddAdminSheet from './LiveSoloAddAdminSheet';
import LiveSoloAnnounceSheet from './LiveSoloAnnounceSheet';
import BannerMarqueeText from './BannerMarqueeText';
import KomalSeatsPanel from './KomalSeatsPanel';
import ViewProfileModal from './ViewProfileModal';
import KomalHandRaiseToast from './KomalHandRaiseToast';
import PKBattleModal from './PKBattleModal';
import {
  startLiveStream, endLiveStream, getLiveStreamDetail,
  uploadLiveThumbnail, getLiveViewers, getLiveSoloToken,
  activateKomal, deactivateKomal, muteKomalSeat,
  approveKomalHand, rejectKomalHand,
} from '../services/liveService';
import type { LiveViewer, KomalSeat, KomalHandRaiseRequest } from '../services/liveService';
import {
  connectSoloLiveKit, disconnectSoloLiveKit, setLocalMicEnabled,
} from '../services/soloLiveKitService';
import { WS_URL, API_BASE } from '../config/connection';
import { getAuthToken } from '../services/storage';

const ANNOUNCE_BANNER = require('../assets/images/announce_banner.png');

// ── Map server messages → friendly display ────────────────────────────────────
function friendlyError(msg?: string | null): { title: string; body: string; type: 'error' | 'warn' | 'info' } {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('agency') && (m.includes('terdaftar') || m.includes('host')))
    return { title: 'Join the Agency First', body: 'Join the agency to go live', type: 'warn' };
  if (m.includes('agency') && m.includes('disetujui'))
    return { title: 'Agency Pending', body: 'Your agency is not approved yet', type: 'warn' };
  if (m.includes('login') || m.includes('unauthorized'))
    return { title: 'Session Expired', body: 'Please log in again to continue', type: 'error' };
  if (m.includes('koneksi') || m.includes('network'))
    return { title: 'Connection Error', body: 'Check your internet and try again', type: 'error' };
  if (m.includes('dilanjutkan') || m.includes('resumed'))
    return { title: 'Live Resumed', body: 'Your previous stream has been resumed', type: 'info' };
  return { title: 'Cannot Go Live', body: msg ?? 'Something went wrong', type: 'error' };
}

// ── Palette: Pink × Yellow Pastel (Chinese app aesthetic) ────────────────────
const P_HOT    = '#FF6B9D';   // primary pink
const P_SOFT   = '#FF9DBE';   // light pink
const P_PALE   = '#FFE4F0';   // very pale pink bg
const Y_HOT    = '#FFB800';   // primary yellow
const Y_SOFT   = '#FFCF4B';   // light yellow
const Y_PALE   = '#FFF8E0';   // very pale yellow bg
const WHITE    = '#FFFFFF';
const TXT_DARK = '#2D1B3E';   // deep warm-purple text
const TXT_MID  = '#9B8AAA';   // muted text
const CARD_BG  = '#FFFBFE';   // off-white card

const { width: SW, height: SH } = Dimensions.get('window');

const CATEGORIES = [
  { id: 'general',    label: 'Umum',      emoji: '🌟' },
  { id: 'music',      label: 'Musik',     emoji: '🎵' },
  { id: 'gaming',     label: 'Gaming',    emoji: '🎮' },
  { id: 'dance',      label: 'Dance',     emoji: '💃' },
  { id: 'talk',       label: 'Ngobrol',   emoji: '💬' },
  { id: 'education',  label: 'Edukasi',   emoji: '📚' },
];

interface Props {
  visible: boolean;
  currentUser: { username: string; displayName?: string | null; migLevel?: number } | null;
  onClose: () => void;
}

// ── Level tier helper (same palette as PartyRoomModal) ────────────────────────
function soloLevelTier(lv: number) {
  if (lv <= 0)   return { bg: '#374151', border: '#6B7280', text: '#9CA3AF', glow: '#6B7280' };
  if (lv <= 10)  return { bg: '#1D4ED8', border: '#3B82F6', text: '#BFDBFE', glow: '#3B82F6' };
  if (lv <= 20)  return { bg: '#065F46', border: '#10B981', text: '#A7F3D0', glow: '#10B981' };
  if (lv <= 30)  return { bg: '#78350F', border: '#F59E0B', text: '#FDE68A', glow: '#F59E0B' };
  if (lv <= 100) return { bg: '#7C2D12', border: '#F97316', text: '#FED7AA', glow: '#F97316' };
  if (lv <= 200) return { bg: '#831843', border: '#EC4899', text: '#FBCFE8', glow: '#EC4899' };
  return               { bg: '#7F1D1D', border: '#EF4444', text: '#FECACA', glow: '#EF4444' };
}

function SoloLevelBadge({ level }: { level: number }) {
  const t = soloLevelTier(level);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 8, borderWidth: 1,
      backgroundColor: t.bg, borderColor: t.border,
      paddingHorizontal: 5, paddingVertical: 1,
      marginHorizontal: 2, gap: 1,
      elevation: 3, shadowOpacity: 0.7,
      shadowColor: t.glow, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
    }}>
      <Text style={{ fontSize: 9, lineHeight: 14, color: t.border }}>⚡</Text>
      <Text style={{ fontSize: 10, fontWeight: '900', lineHeight: 14, letterSpacing: 0.3, color: t.text }}>{level}</Text>
    </View>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={ls.statBox}>
      <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.statIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <MaterialCommunityIcons name={icon as any} size={18} color="#fff" />
      </LinearGradient>
      <Text style={ls.statValue}>{value}</Text>
      <Text style={ls.statLabel}>{label}</Text>
    </View>
  );
}

export default function LiveSoloHostModal({ visible, currentUser, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [phase,          setPhase]          = useState<'setup' | 'live' | 'ended'>('setup');
  const [title,          setTitle]          = useState('');
  const [category,       setCategory]       = useState('general');
  const [thumbUri,       setThumbUri]       = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [streamId,       setStreamId]       = useState<string | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [viewerCount,    setViewerCount]    = useState(0);
  const [totalGifts,     setTotalGifts]     = useState(0);
  const [duration,       setDuration]       = useState(0);
  const [facing,         setFacing]         = useState<'front' | 'back'>('front');
  const [beautyParams,   setBeautyParams]   = useState<BeautyParams>(DEFAULT_BEAUTY_PARAMS);
  const [activePreset,   setActivePreset]   = useState<string | null>(null);
  const [agencyName,     setAgencyName]     = useState<string | null>(null);

  // ── LiveKit video track (host side) ───────────────────────────────────────
  const [lkVideoTrack,   setLkVideoTrack]   = useState<any>(null);

  // ── Mic mute/unmute ────────────────────────────────────────────────────────
  const [isMicMuted, setIsMicMuted] = useState(false);
  const handleToggleMic = useCallback(async () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    await setLocalMicEnabled(!next);
  }, [isMicMuted]);

  // ── Viewer list (real avatars) ─────────────────────────────────────────────
  const [viewers, setViewers] = useState<LiveViewer[]>([]);
  const fetchViewersRef = useRef<((sid: string) => Promise<void>) | null>(null);
  const [viewerProfileUsername, setViewerProfileUsername] = useState<string | null>(null);
  const [showViewerList, setShowViewerList] = useState(false);

  // ── End Live Confirm Sheet ─────────────────────────────────────────────────
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const endConfirmAnim = useRef(new Animated.Value(0)).current;

  const openEndConfirm = useCallback(() => {
    setShowEndConfirm(true);
    Animated.spring(endConfirmAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 13 }).start();
  }, [endConfirmAnim]);

  const closeEndConfirm = useCallback(() => {
    Animated.timing(endConfirmAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setShowEndConfirm(false));
  }, [endConfirmAnim]);

  // ── Tools Menu (grid button) ───────────────────────────────────────────────
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuAnim = useRef(new Animated.Value(0)).current;

  const openToolsMenu = useCallback(() => {
    setShowToolsMenu(true);
    Animated.spring(toolsMenuAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 12 }).start();
  }, [toolsMenuAnim]);

  const closeToolsMenu = useCallback(() => {
    Animated.timing(toolsMenuAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowToolsMenu(false));
  }, [toolsMenuAnim]);

  // ── Kick Sheet ─────────────────────────────────────────────────────────────
  const [showKickSheet, setShowKickSheet] = useState(false);

  const openKickSheet = useCallback(() => {
    closeToolsMenu();
    setTimeout(() => setShowKickSheet(true), 220);
  }, [closeToolsMenu]);

  // ── Block Sheet ─────────────────────────────────────────────────────────────
  const [showBlockSheet, setShowBlockSheet] = useState(false);

  const openBlockSheet = useCallback(() => {
    closeToolsMenu();
    setTimeout(() => setShowBlockSheet(true), 220);
  }, [closeToolsMenu]);

  // ── Add Admin Sheet ────────────────────────────────────────────────────────
  const [showAdminSheet,  setShowAdminSheet]  = useState(false);
  const [adminUsernames,  setAdminUsernames]  = useState<Set<string>>(new Set());

  const openAdminSheet = useCallback(() => {
    closeToolsMenu();
    setTimeout(() => setShowAdminSheet(true), 220);
  }, [closeToolsMenu]);

  // ── Announce Sheet + Persistent Banner ────────────────────────────────────
  const [showAnnounceSheet, setShowAnnounceSheet] = useState(false);
  const [activeBannerText, setActiveBannerText]   = useState<string | null>(null);
  const bannerSlide = useRef(new Animated.Value(200)).current;

  const showBanner = useCallback((text: string) => {
    setActiveBannerText(text);
    Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [bannerSlide]);

  const hideBanner = useCallback(() => {
    Animated.timing(bannerSlide, { toValue: 200, duration: 240, useNativeDriver: true }).start(() => setActiveBannerText(null));
  }, [bannerSlide]);

  // keep legacy float array for viewer-side WS echoes (no-op on host screen now)
  interface AnnounceNotif { id: string; text: string; anim: Animated.Value }
  const [announceNotifs] = useState<AnnounceNotif[]>([]);

  const showFloatingAnnounce = useCallback((_text: string) => {
    // host screen uses persistent banner instead
  }, []);

  const openAnnounceSheet = useCallback(() => {
    closeToolsMenu();
    setTimeout(() => setShowAnnounceSheet(true), 220);
  }, [closeToolsMenu]);

  const sendAnnouncement = useCallback((text: string) => {
    if (!text.trim() || !streamId) return;
    const roomId = `livesolo-${streamId}`;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SEND_MESSAGE', roomId, text: `<<ANNOUNCE:${text}>>` }));
    }
    showBanner(text);
  }, [streamId, showBanner]);

  const clearAnnouncement = useCallback(() => {
    hideBanner();
    if (!streamId) return;
    const roomId = `livesolo-${streamId}`;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SEND_MESSAGE', roomId, text: '<<ANNOUNCE_CLEAR>>' }));
    }
  }, [hideBanner, streamId]);

  // ── Gift Sheet & Effect ────────────────────────────────────────────────────
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const giftEffectRef = useRef<SoloGiftEffectHandle>(null);

  // ── PK Battle ─────────────────────────────────────────────────────────────
  const [pkModalVisible, setPkModalVisible] = useState(false);
  const [pkWsEvent,      setPkWsEvent]      = useState<any>(null);

  // ── Komal Seats ───────────────────────────────────────────────────────────
  const [komalActive,         setKomalActive]         = useState(false);
  const [komalSeats,          setKomalSeats]          = useState<KomalSeat[]>([]);
  const [komalHandRaiseQueue, setKomalHandRaiseQueue] = useState<KomalHandRaiseRequest[]>([]);

  const handleKomalToggle = useCallback(async () => {
    if (!streamId) return;
    closeToolsMenu();
    if (komalActive) {
      await deactivateKomal(streamId);
      setKomalActive(false);
      setKomalSeats([]);
    } else {
      const result = await activateKomal(streamId);
      if (result.ok) {
        setKomalActive(true);
        setKomalSeats(result.seats);
      }
    }
  }, [streamId, komalActive, closeToolsMenu]);

  const handleKomalMute = useCallback(async (seatNum: number, muted: boolean) => {
    if (!streamId) return;
    const result = await muteKomalSeat(streamId, seatNum, muted);
    if (result.ok) setKomalSeats(result.seats);
  }, [streamId]);

  const handleApproveHandRaise = useCallback(async (username: string) => {
    if (!streamId) return;
    setKomalHandRaiseQueue(q => q.filter(r => r.username !== username));
    await approveKomalHand(streamId, username);
  }, [streamId]);

  const handleDismissHandRaise = useCallback(async (username: string, reject = false) => {
    setKomalHandRaiseQueue(q => q.filter(r => r.username !== username));
    if (reject && streamId) await rejectKomalHand(streamId, username);
  }, [streamId]);

  // ── Beauty Filter Picker ───────────────────────────────────────────────────
  const [showBeautyPicker, setShowBeautyPicker] = useState(false);
  const beautyPickerAnim = useRef(new Animated.Value(0)).current;

  const openBeautyPicker = useCallback(() => {
    closeToolsMenu();
    setTimeout(() => {
      setShowBeautyPicker(true);
      Animated.spring(beautyPickerAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 12 }).start();
    }, 220);
  }, [closeToolsMenu, beautyPickerAnim]);

  const closeBeautyPicker = useCallback(() => {
    Animated.timing(beautyPickerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowBeautyPicker(false));
  }, [beautyPickerAnim]);

  const backToToolsMenu = useCallback(() => {
    Animated.timing(beautyPickerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowBeautyPicker(false);
      openToolsMenu();
    });
  }, [beautyPickerAnim, openToolsMenu]);

  // ── Chat overlay ───────────────────────────────────────────────────────────
  interface ChatMsg { id: string; user: string; displayName?: string | null; text: string; color: string; isSystem?: boolean; isAnnouncement?: boolean; migLevel?: number; vipLevel?: number; agencyBadge?: string; avatarUrl?: string | null; isHost?: boolean; username?: string; isAdmin?: boolean }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [chatFocused,  setChatFocused]  = useState(false);
  const chatInputRef  = useRef<TextInput>(null);
  const chatListRef      = useRef<FlatList>(null);
  const chatAtBottomRef  = useRef(true);
  const [chatNewCount, setChatNewCount] = useState(0);

  // ── VIP entrance banner queue ─────────────────────────────────────────────
  const vipQueueRef   = useRef<VipJoinEntry[]>([]);
  const vipShowingRef = useRef(false);

  // ── Gift combo overlay ────────────────────────────────────────────────────
  const comboOverlayRef = useRef<GiftComboHandle>(null);
  const lastGiftRef     = useRef<{ sender: string; giftId: string; time: number } | null>(null);


  // ── Keyboard height (Android: keyboard tidak push absolute layout) ─────────
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── UI overlay slide (kanan = hide, kiri = show) ──────────────────────────
  const uiSlideX = useRef(new Animated.Value(0)).current;
  const uiHidden = useRef(false);

  const showUI = useCallback(() => {
    uiHidden.current = false;
    Animated.spring(uiSlideX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start();
  }, [uiSlideX]);

  const hideUI = useCallback(() => {
    uiHidden.current = true;
    Animated.spring(uiSlideX, { toValue: SW, useNativeDriver: true, tension: 65, friction: 13 }).start();
  }, [uiSlideX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (!uiHidden.current && g.dx > 0) uiSlideX.setValue(g.dx);
        if ( uiHidden.current && g.dx < 0) uiSlideX.setValue(SW + g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (!uiHidden.current) {
          g.dx > SW * 0.35 ? (uiHidden.current = true,
            Animated.spring(uiSlideX, { toValue: SW, useNativeDriver: true, tension: 65, friction: 13 }).start())
          : Animated.spring(uiSlideX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start();
        } else {
          g.dx < -(SW * 0.25) ? (uiHidden.current = false,
            Animated.spring(uiSlideX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start())
          : Animated.spring(uiSlideX, { toValue: SW, useNativeDriver: true, tension: 65, friction: 13 }).start();
        }
      },
    })
  ).current;

  // ── WebSocket real-time chat ───────────────────────────────────────────────
  const wsRef           = useRef<WebSocket | null>(null);
  const wsActiveRef     = useRef(false);
  const pingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenMsgIdsRef      = useRef<Set<string>>(new Set());
  const adminUsernamesRef  = useRef<Set<string>>(new Set());
  const currentUserRef     = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { adminUsernamesRef.current = adminUsernames; }, [adminUsernames]);
  const CHAT_COLORS   = ['#FF6B9D','#FFB800','#26C6DA','#A855F7','#10B981','#F59E0B'];

  const pushChatMsg = useCallback((msg: ChatMsg) => {
    setChatMessages(prev => [...prev.slice(-79), msg]);
    if (chatAtBottomRef.current) {
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 60);
    } else {
      setChatNewCount(c => c + 1);
    }
  }, []);

  const handleHostChatScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
    chatAtBottomRef.current = atBottom;
    if (atBottom) setChatNewCount(0);
  };

  const scrollHostChatToLatest = () => {
    chatListRef.current?.scrollToEnd({ animated: true });
    chatAtBottomRef.current = true;
    setChatNewCount(0);
  };

  const disconnectWS = useCallback(() => {
    wsActiveRef.current = false;
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, []);

  const connectWS = useCallback(async (sid: string) => {
    disconnectWS();
    wsActiveRef.current = true;
    const roomId    = `livesolo-${sid}`;
    const authToken = await getAuthToken();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      if (!wsActiveRef.current) return;
      try {
        const p = JSON.parse(e.data);

        if (p.type === 'WELCOME') {
          if (authToken) ws.send(JSON.stringify({ type: 'AUTH', token: authToken }));
          return;
        }

        if (p.type === 'AUTH_OK') {
          ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId }));
          pingTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
          }, 25_000);
          return;
        }

        if (p.type === 'PONG' || p.type === 'SUBSCRIBED') return;

        // ── Pesan chat dari viewer ────────────────────────────────────────
        if (p.type === 'MESSAGE' && p.roomId === roomId && p.message) {
          const m = p.message;
          const msgText: string = m.text ?? '';
          // ── Host room announcement ─────────────────────────────────────
          const announceMatch = msgText.match(/^<<ANNOUNCE:(.+)>>$/s);
          if (announceMatch) {
            if (m.senderUsername !== currentUserRef.current?.username) {
              showFloatingAnnounce(announceMatch[1].trim());
            }
            return;
          }
          // Skip other << ... >> system markers
          if (msgText.trimStart().startsWith('<<') && msgText.trimEnd().endsWith('>>')) return;
          // Skip echo pesan host sendiri — sudah ditampilkan secara optimistic
          if (m.senderUsername && m.senderUsername === currentUserRef.current?.username) return;
          // Dedup by server message ID — cegah double dari dua WS connection
          if (m.id != null) {
            const msgKey = String(m.id);
            if (seenMsgIdsRef.current.has(msgKey)) return;
            seenMsgIdsRef.current.add(msgKey);
            if (seenMsgIdsRef.current.size > 300) {
              seenMsgIdsRef.current.delete(seenMsgIdsRef.current.values().next().value!);
            }
          }
          const colorIdx = Math.abs(
            (m.senderUsername ?? '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
          ) % CHAT_COLORS.length;
          pushChatMsg({
            id:          m.id ?? `${Date.now()}-${Math.random()}`,
            user:        m.senderDisplayName ?? m.senderUsername ?? 'Viewer',
            displayName: m.senderDisplayName ?? null,
            username:    m.senderUsername ?? undefined,
            text:        msgText,
            color:       CHAT_COLORS[colorIdx],
            isSystem:    !!m.isSystem,
            migLevel:    m.senderMigLevel ?? undefined,
            vipLevel:    (m as any).senderVipLevel ?? undefined,
            agencyBadge: m.senderAgencyName ?? undefined,
            avatarUrl:   m.senderAvatarUrl ?? null,
            isAdmin:     m.senderUsername ? adminUsernamesRef.current.has(m.senderUsername) : false,
          });
          return;
        }

        // ── Gift dari viewer ──────────────────────────────────────────────
        if (p.type === 'LIVE_GIFT' && p.streamId === sid) {
          // Skip self-gift from WS — onGiftSent callback already handled chat + combo + totalGifts
          if (p.isSelfGift) return;
          pushChatMsg({
            id:       `gift-${Date.now()}`,
            user:     p.senderDisplayName ?? p.senderUsername ?? 'Viewer',
            text:     `🎁 ${p.giftName} (${p.amountCoins} koin)`,
            color:    '#FFD700',
            isSystem: true,
          });
          setTotalGifts(g => g + (p.amountCoins ?? 0));

          // ── Combo overlay ────────────────────────────────────────────
          const now    = Date.now();
          const sender = p.senderDisplayName ?? p.senderUsername ?? 'Viewer';
          const last   = lastGiftRef.current;
          const isSameCombo = last
            && last.sender === sender
            && last.giftId === (p.giftId ?? p.giftName ?? '')
            && (now - last.time) < 3000;
          lastGiftRef.current = { sender, giftId: p.giftId ?? p.giftName ?? '', time: now };
          if (isSameCombo) {
            comboOverlayRef.current?.addCombo();
          } else {
            comboOverlayRef.current?.show({
              streamId:          String(sid),
              giftId:            p.giftId ?? '',
              giftName:          p.giftName ?? 'Gift',
              giftEmoji:         p.giftEmoji ?? '🎁',
              giftImageUrl:      p.giftImageUrl ?? null,
              price:             p.amountCoins ?? 0,
              senderDisplayName: sender,
              senderAvatarUrl:   p.senderAvatarUrl ?? null,
              canTap:            false,
              initialCombo:      p.qty ?? 1,
            });
          }

          // Trigger efek gift jika ada videoUrl atau lottieUrl dari payload
          // Lucky category tidak ada efek
          if (p.videoUrl || p.lottieUrl) {
            const cat = p.giftCategory ?? '';
            const isLucky = cat === 'Lucky' || cat === 'lucky';
            if (!isLucky) {
              giftEffectRef.current?.play({
                videoUrl:  p.videoUrl  ?? null,
                lottieUrl: p.lottieUrl ?? null,
                category:  cat,
              });
            }
          }
          return;
        }

        // ── Viewer join ───────────────────────────────────────────────────
        if (p.type === 'LIVE_JOIN' && p.streamId === sid) {
          const jid   = `join-${Date.now()}-${Math.random()}`;
          const jName = p.displayName ?? p.username ?? 'Viewer';
          pushChatMsg({ id: jid, user: jName, text: 'bergabung ke live', color: '#26C6DA', isSystem: true });
          setTimeout(() => setChatMessages(prev => prev.filter(m => m.id !== jid)), 3000);
          setViewerCount(c => c + 1);
          setTimeout(() => { fetchViewersRef.current?.(sid); }, 600);
          const vLvl     = Number(p.vipLevel ?? 0);
          const hasTopup = !!p.hasTopup;
          if (vLvl >= 1) {
            // VIP entrance banner — tidak diubah
            vipQueueRef.current.push({ id: jid + 'v', displayName: jName, avatarUrl: p.avatarUrl ?? null, vipLevel: vLvl, mode: 'vip' });
            if ((vipQueueRef as any).__showNext && !vipShowingRef.current) (vipQueueRef as any).__showNext();
          } else if (hasTopup) {
            // Topup pill banner — untuk non-VIP yang sudah pernah top-up
            vipQueueRef.current.push({ id: jid + 't', displayName: jName, avatarUrl: p.avatarUrl ?? null, vipLevel: 0, hasTopup: true, mode: 'topup' });
            if ((vipQueueRef as any).__showNext && !vipShowingRef.current) (vipQueueRef as any).__showNext();
          }
          return;
        }

        // ── Viewer leave ──────────────────────────────────────────────────
        if (p.type === 'LIVE_LEAVE' && p.streamId === sid) {
          setViewerCount(c => Math.max(0, c - 1));
          setTimeout(() => { fetchViewersRef.current?.(sid); }, 600);
          return;
        }

        // ── Viewer di-kick / di-blok ──────────────────────────────────────
        if (p.type === 'LIVE_KICK' && p.streamId === sid) {
          setViewerCount(c => Math.max(0, c - 1));
          setTimeout(() => { fetchViewersRef.current?.(sid); }, 600);
          return;
        }

        // ── System announcement dari admin ────────────────────────────────
        if (p.type === 'LIVE_ANNOUNCEMENT' && p.text?.trim()) {
          pushChatMsg({
            id:       `announce-${Date.now()}`,
            user:     '📢 Sistem',
            text:     p.text,
            color:    '#FFB800',
            isSystem: true,
            isAnnouncement: true,
          });
          return;
        }

        // ── Komal seat updates ────────────────────────────────────────────
        if (p.type === 'KOMAL_UPDATE' && p.streamId === sid && Array.isArray(p.seats)) {
          setKomalSeats(p.seats);
          return;
        }
        if (p.type === 'KOMAL_ACTIVATED' && p.streamId === sid) {
          setKomalActive(true);
          return;
        }
        if (p.type === 'KOMAL_DEACTIVATED' && p.streamId === sid) {
          setKomalActive(false);
          setKomalSeats([]);
          setKomalHandRaiseQueue([]);
          return;
        }
        if (p.type === 'KOMAL_HAND_RAISE' && p.streamId === sid) {
          const req: KomalHandRaiseRequest = {
            username:    p.username    ?? '',
            displayName: p.displayName ?? null,
            avatarUrl:   p.avatarUrl   ?? null,
          };
          // add to queue; ignore duplicates
          setKomalHandRaiseQueue(q =>
            q.find(r => r.username === req.username) ? q : [...q, req]
          );
          return;
        }

        // ── PK Battle events ──────────────────────────────────────────────
        if (['PK_CHALLENGE_RECEIVED','PK_ACCEPTED','PK_DECLINED','PK_CANCELLED',
             'PK_STARTED','PK_SCORE_UPDATE','PK_ENDED'].includes(p.type)) {
          setPkWsEvent({ ...p, _ts: Date.now() });
          // Auto-open PK modal when receiving a challenge
          if (p.type === 'PK_CHALLENGE_RECEIVED') {
            setPkModalVisible(true);
          }
          return;
        }

        // ── Lucky Milestone (viewer hit a milestone) ──────────────────────
        if (p.type === 'LUCKY_MILESTONE' && p.streamId === streamId) {
          for (const hit of (p.milestones ?? [])) {
            showToast(
              `🎊 ${p.senderDisplayName ?? p.senderUsername} — ${hit.milestone}× Lucky!`,
              `Mereka dapat +${hit.rewardCoins.toLocaleString()} koin`,
              'info',
            );
          }
          return;
        }

      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => { /* silent — poll stats sebagai fallback */ };
    ws.onclose = () => {
      if (!wsActiveRef.current) return;
      // Auto reconnect setelah 3 detik kalau masih live
      setTimeout(() => { if (wsActiveRef.current && sid) connectWS(sid); }, 3000);
    };
  }, [disconnectWS, pushChatMsg]);

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !streamId) return;
    const roomId = `livesolo-${streamId}`;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SEND_MESSAGE', roomId, text }));
    }
    // Optimistic: tampilkan pesan host langsung
    pushChatMsg({
      id:          `host-${Date.now()}`,
      user:        currentUser?.displayName ?? currentUser?.username ?? 'Host',
      displayName: currentUser?.displayName ?? null,
      username:    currentUser?.username ?? undefined,
      text,
      color:       P_HOT,
      migLevel:    currentUser?.migLevel ?? undefined,
      agencyBadge: agencyName ?? undefined,
      isHost:      true,
    });
    setChatInput('');
    chatInputRef.current?.blur();
  }, [chatInput, streamId, currentUser, pushChatMsg]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ title: string; body: string; type: 'error' | 'warn' | 'info' } | null>(null);
  const toastAnim   = useRef(new Animated.Value(-120)).current;
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((title: string, body: string, type: 'error' | 'warn' | 'info' = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ title, body, type });
    Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -120, duration: 280, useNativeDriver: true }).start(() => setToast(null));
    }, 3500);
  }, [toastAnim]);

  const dismissToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastAnim, { toValue: -120, duration: 220, useNativeDriver: true }).start(() => setToast(null));
  };

  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0,  useNativeDriver: true, tension: 60, friction: 12 }),
        Animated.timing(bgOpacity, { toValue: 1,  duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 260, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,  duration: 190, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (phase !== 'live') return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [phase]);

  // ── Fetch real viewer list ────────────────────────────────────────────────
  const fetchViewers = useCallback(async (sid: string) => {
    const list = await getLiveViewers(sid);
    setViewers(list);
  }, []);

  // Keep ref in sync so WS handler can call it
  useEffect(() => { fetchViewersRef.current = fetchViewers; }, [fetchViewers]);

  // Fetch saat mulai live, lalu poll tiap 15 detik
  useEffect(() => {
    if (phase !== 'live' || !streamId) { setViewers([]); return; }
    fetchViewers(streamId);
    const poll = setInterval(() => fetchViewers(streamId), 15_000);
    return () => clearInterval(poll);
  }, [phase, streamId, fetchViewers]);

  // ── Connect WebSocket saat live dimulai, disconnect saat selesai ───────────
  useEffect(() => {
    if (phase === 'live' && streamId) {
      connectWS(streamId);
    } else {
      disconnectWS();
    }
    return () => { disconnectWS(); };
  }, [phase, streamId]);

  // ── Connect LiveKit saat live dimulai → publish camera + mic ────────────
  useEffect(() => {
    if (phase !== 'live' || !streamId) return;
    let cancelled = false;
    (async () => {
      const tokenInfo = await getLiveSoloToken(streamId);
      if (cancelled || !tokenInfo?.url || !tokenInfo?.token) return;
      await connectSoloLiveKit(
        tokenInfo.url,
        tokenInfo.token,
        true,
        undefined,
        (track) => { if (!cancelled) setLkVideoTrack(track ?? null); },
        undefined,
      );
    })();
    return () => {
      cancelled = true;
      disconnectSoloLiveKit();
      setLkVideoTrack(null);
    };
  }, [phase, streamId]);

  // ── AppState: broadcast HOST_AWAY / HOST_BACK saat minimize/foreground ──────
  useEffect(() => {
    if (phase !== 'live' || !streamId) return;
    const roomId = `livesolo-${streamId}`;

    const sendHostStatus = (status: 'AWAY' | 'BACK') => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'SEND_MESSAGE',
          roomId,
          text: status === 'AWAY' ? '<< HOST_AWAY >>' : '<< HOST_BACK >>',
        }));
      }
    };

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        sendHostStatus('AWAY');
      } else if (nextState === 'active') {
        sendHostStatus('BACK');
      }
    });

    return () => sub.remove();
  }, [phase, streamId]);

  useEffect(() => {
    if (phase === 'live') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phase === 'setup') setDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const pollStats = useCallback(async (id: string) => {
    const detail = await getLiveStreamDetail(id);
    if (detail) {
      setViewerCount(prev => Math.max(prev, detail.viewerCount ?? 0));
      setTotalGifts(detail.totalGifts ?? 0);
    }
  }, []);

  useEffect(() => {
    if (phase === 'live' && streamId) {
      pollRef.current = setInterval(() => pollStats(streamId), 10_000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, streamId, pollStats]);

  useEffect(() => {
    if (!visible) {
      setTimeout(() => {
        if (phase !== 'live') {
          setPhase('setup'); setStreamId(null); setTitle(''); setCategory('general');
          setThumbUri(null); setViewerCount(0); setTotalGifts(0); setDuration(0);
          setChatMessages([]); setChatInput(''); setAgencyName(null);
          uiSlideX.setValue(0); uiHidden.current = false;
        }
      }, 320);
    }
  }, [visible]);

  const pickThumbnail = async (source: 'camera' | 'gallery') => {
    const permResult =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permResult.status !== 'granted') {
      Alert.alert('Izin diperlukan',
        source === 'camera'
          ? 'Izinkan akses kamera untuk mengambil foto thumbnail.'
          : 'Izinkan akses galeri untuk memilih foto thumbnail.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [9, 16], quality: 0.75 });
    if (!result.canceled && result.assets[0]) setThumbUri(result.assets[0].uri);
  };

  const handlePickSource = () => {
    Alert.alert('Pilih Thumbnail', 'Ambil foto atau pilih dari galeri', [
      { text: 'Kamera',  onPress: () => pickThumbnail('camera')  },
      { text: 'Galeri',  onPress: () => pickThumbnail('gallery') },
      { text: 'Batal',   style: 'cancel' },
    ]);
  };

  const handleStart = async () => {
    if (!currentUser) return;

    const camStatus = Camera.getCameraPermissionStatus();
    if (camStatus !== 'granted') {
      const result = await Camera.requestCameraPermission();
      if (result !== 'granted') {
        Alert.alert('Izin Kamera', 'Izin kamera diperlukan untuk memulai live.');
        return;
      }
    }

    setLoading(true);
    try {
      let thumbnailUrl: string | undefined;
      if (thumbUri) {
        setThumbUploading(true);
        const uploaded = await uploadLiveThumbnail(thumbUri);
        setThumbUploading(false);
        if (uploaded) thumbnailUrl = uploaded;
      }
      const effectiveTitle = title.trim() || `${currentUser.displayName ?? currentUser.username}'s Live`;
      const result = await startLiveStream({ title: effectiveTitle, category, thumbnailUrl });
      if (!result.ok) {
        const fe = friendlyError(result.message);
        showToast(fe.title, fe.body, fe.type);
        return;
      }
      setStreamId(result.streamId!);
      setAgencyName(result.agencyName ?? null);
      setViewerCount(1);
      setPhase('live');
      if (result.resumed) showToast('Live Resumed', 'Your previous stream has been resumed', 'info');
      // Fetch and display any active system announcement
      fetch(`${API_BASE}/api/live/announcement`)
        .then(r => r.json())
        .then(data => {
          if (data?.enabled && data?.text?.trim()) {
            pushChatMsg({
              id:             `announce-init-${Date.now()}`,
              user:           '📢 Sistem',
              text:           data.text,
              color:          '#FFB800',
              isSystem:       true,
              isAnnouncement: true,
            });
          }
        })
        .catch(() => { /* non-fatal */ });
    } finally {
      setLoading(false);
      setThumbUploading(false);
    }
  };

  const handleEnd = () => { openEndConfirm(); };

  const doEndLive = async () => {
    if (!streamId) return;
    closeEndConfirm();
    setLoading(true);
    try {
      const result = await endLiveStream(streamId);
      setPhase('ended');
      if (result.ok) { setTotalGifts(result.totalGifts ?? totalGifts); setViewerCount(result.totalViewers ?? viewerCount); }
    } finally { setLoading(false); }
  };

  const handleCloseEnded = () => {
    disconnectWS();
    setPhase('setup'); setStreamId(null); setTitle(''); setCategory('general');
    setThumbUri(null); setViewerCount(0); setTotalGifts(0); setDuration(0);
    setChatMessages([]); setChatInput('');
    setKomalActive(false); setKomalSeats([]);
    uiSlideX.setValue(0); uiHidden.current = false;
    onClose();
  };

  const fmtDuration = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };
  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  const activeCategory = CATEGORIES.find(c => c.id === category) ?? CATEGORIES[0];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[ls.backdrop, { opacity: bgOpacity }]} />

      <Animated.View style={[ls.fullSheet, { transform: [{ translateY: slideAnim }] }]}>

        {/* ═══ SETUP PHASE ═══════════════════════════════════════════════════ */}
        {phase === 'setup' && (
          <LinearGradient
            colors={['#FFD6E0', '#FFF0E6', '#FFF8D6', '#FFE4B0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={{ flex: 1 }}
          >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Header ── */}
              <LinearGradient
                colors={[P_HOT, P_SOFT, Y_SOFT]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[ls.headerBar, { paddingTop: insets.top + 10 }]}
              >
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={ls.headerCloseBtn}>
                  <Ionicons name="close" size={20} color={P_HOT} />
                </TouchableOpacity>
                <Text style={ls.headerTitle}>Setup Live Solo</Text>
                <View style={{ width: 36 }} />
              </LinearGradient>

              {/* ── Thumbnail picker ── */}
              <View style={ls.section}>
                <Text style={ls.sectionLabel}>THUMBNAIL LIVE</Text>
                <TouchableOpacity style={ls.thumbPicker} onPress={handlePickSource} activeOpacity={0.88}>
                  {thumbUri ? (
                    <>
                      <Image source={{ uri: thumbUri }} style={ls.thumbImg} resizeMode="cover" />
                      <View style={ls.thumbOverlay}>
                        <MaterialCommunityIcons name="camera-retake" size={26} color="#fff" />
                        <Text style={ls.thumbChangeTxt}>Ganti Foto</Text>
                      </View>
                    </>
                  ) : (
                    <LinearGradient colors={[P_PALE, Y_PALE]} style={ls.thumbEmpty} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.thumbIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <MaterialCommunityIcons name="camera-plus" size={28} color="#fff" />
                      </LinearGradient>
                      <Text style={ls.thumbEmptyTitle}>Tambah Thumbnail</Text>
                      <Text style={ls.thumbEmptySubtext}>Opsional · Aspek 9:16 · Maks 10MB</Text>
                      <View style={ls.thumbActionRow}>
                        <TouchableOpacity style={ls.thumbActionPill} onPress={() => pickThumbnail('camera')} activeOpacity={0.8}>
                          <Ionicons name="camera-outline" size={13} color={P_HOT} />
                          <Text style={ls.thumbActionTxt}>Kamera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={ls.thumbActionPill} onPress={() => pickThumbnail('gallery')} activeOpacity={0.8}>
                          <Ionicons name="images-outline" size={13} color={P_HOT} />
                          <Text style={ls.thumbActionTxt}>Galeri</Text>
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>

              {/* ── Title input ── */}
              <View style={ls.section}>
                <Text style={ls.sectionLabel}>JUDUL LIVE</Text>
                <View style={ls.inputCard}>
                  <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.inputIconBg} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}>
                    <MaterialCommunityIcons name="format-title" size={14} color="#fff" />
                  </LinearGradient>
                  <TextInput
                    style={ls.titleInput}
                    placeholder={`${currentUser?.displayName ?? currentUser?.username ?? 'Kamu'}'s Live`}
                    placeholderTextColor={TXT_MID}
                    value={title}
                    onChangeText={t => setTitle(t.slice(0, 60))}
                    maxLength={60}
                    returnKeyType="done"
                  />
                  {title.length > 0 && (
                    <TouchableOpacity onPress={() => setTitle('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={17} color={TXT_MID} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={ls.charCount}>{title.length}/60</Text>
              </View>

              {/* ── Category ── */}
              <View style={ls.section}>
                <Text style={ls.sectionLabel}>KATEGORI</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ls.catScroll}>
                  {CATEGORIES.map(cat => {
                    const active = category === cat.id;
                    return (
                      <TouchableOpacity key={cat.id} onPress={() => setCategory(cat.id)} activeOpacity={0.75}>
                        {active ? (
                          <LinearGradient
                            colors={[P_HOT, Y_HOT]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={ls.catPillActive}
                          >
                            <Text style={ls.catEmoji}>{cat.emoji}</Text>
                            <Text style={ls.catLabelActive}>{cat.label}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={ls.catPill}>
                            <Text style={ls.catEmoji}>{cat.emoji}</Text>
                            <Text style={ls.catLabel}>{cat.label}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* ── Preview card ── */}
              <View style={ls.section}>
                <Text style={ls.sectionLabel}>PREVIEW KARTU</Text>
                <View style={ls.previewCard}>
                  {thumbUri ? (
                    <Image source={{ uri: thumbUri }} style={ls.previewImg} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={[P_HOT, P_SOFT, Y_SOFT]} style={ls.previewImg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  )}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={ls.previewGrad} />
                  <View style={ls.previewLiveBadge}>
                    <View style={ls.previewDot} />
                    <Text style={ls.previewLiveTxt}>LIVE</Text>
                  </View>
                  <View style={ls.previewInfo}>
                    <Text style={ls.previewTitle} numberOfLines={1}>
                      {title.trim() || `${currentUser?.displayName ?? currentUser?.username ?? 'Kamu'}'s Live`}
                    </Text>
                    <Text style={ls.previewCat}>{activeCategory.emoji} {activeCategory.label}</Text>
                  </View>
                </View>
              </View>

              {/* ── Start button ── */}
              <View style={ls.footerSection}>
                <TouchableOpacity style={ls.startBtn} onPress={handleStart} disabled={loading} activeOpacity={0.87}>
                  <LinearGradient
                    colors={[P_HOT, Y_HOT]}
                    style={ls.startBtnInner}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {loading || thumbUploading ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        {thumbUploading && <Text style={ls.startBtnTxt}>Mengupload thumbnail...</Text>}
                      </>
                    ) : (
                      <>
                        <MaterialCommunityIcons name="broadcast" size={21} color="#fff" />
                        <Text style={ls.startBtnTxt}>Mulai Live Sekarang</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={ls.noticeRow}>
                  <Ionicons name="shield-checkmark-outline" size={13} color={P_HOT} />
                  <Text style={ls.noticeTxt}>Hanya host yang terdaftar di agency yang dapat memulai Live Solo</Text>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          </LinearGradient>
        )}

        {/* ═══ LIVE PHASE — Full-screen camera + Slideable UI overlay ════════ */}
        {phase === 'live' && (
          <View style={ls.liveScreen}>
            {/* Layer 1: Camera — LiveKit VideoView (streaming) atau BeautyCameraView (fallback) */}
            <View style={StyleSheet.absoluteFill}>
              {lkVideoTrack
                ? (() => {
                    try {
                      const { VideoView } = require('@livekit/react-native');
                      const sfScale = beautyParams.enabled && beautyParams.slimFace > 0
                        ? 1 - (beautyParams.slimFace / 100) * 0.12 : 1;
                      const scScale = beautyParams.enabled && beautyParams.slimChin > 0
                        ? 1 - (beautyParams.slimChin / 100) * 0.06 : 1;
                      return (
                        <View style={[
                          StyleSheet.absoluteFill,
                          (sfScale !== 1 || scScale !== 1)
                            ? { transform: [{ scaleX: sfScale }, { scaleY: scScale }] }
                            : {},
                        ]}>
                          <VideoView
                            videoTrack={lkVideoTrack}
                            style={StyleSheet.absoluteFill}
                            objectFit="cover"
                            mirror={facing === 'front'}
                          />
                        </View>
                      );
                    } catch {
                      return <BeautyCameraView facing={facing} beautyParams={beautyParams} />;
                    }
                  })()
                : <BeautyCameraView facing={facing} beautyParams={beautyParams} />
              }

              {/* Beauty color overlays — on top of VideoView during live (host sees these) */}
              {lkVideoTrack && beautyParams.enabled && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {beautyParams.brightSkin > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(255,255,255,1)', opacity: (beautyParams.brightSkin / 100) * 0.32 }]} />
                  )}
                  {beautyParams.smoothSkin > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(255,248,240,1)', opacity: (beautyParams.smoothSkin / 100) * 0.25 }]} />
                  )}
                  {beautyParams.rosyCheeks > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(255,140,120,1)', opacity: (beautyParams.rosyCheeks / 100) * 0.28 }]} />
                  )}
                  {beautyParams.whiteSkin > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(240,240,255,1)', opacity: (beautyParams.whiteSkin / 100) * 0.35 }]} />
                  )}
                  {beautyParams.coolTone > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(90,170,255,1)', opacity: (beautyParams.coolTone / 100) * 0.30 }]} />
                  )}
                  {beautyParams.warmTone > 0 && (
                    <View style={[StyleSheet.absoluteFillObject,
                      { backgroundColor: 'rgba(255,155,60,1)', opacity: (beautyParams.warmTone / 100) * 0.30 }]} />
                  )}
                </View>
              )}
            </View>

            {/* Pull-back tab — hanya muncul saat UI disembunyikan */}
            <TouchableOpacity
              style={[ls.pullTab, { top: insets.top + SH * 0.35 }]}
              onPress={showUI}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
            </TouchableOpacity>

            {/* Layer 2: UI Overlay — bisa di-slide ke kanan untuk sembunyi */}
            <Animated.View
              style={[ls.uiOverlay, { transform: [{ translateX: uiSlideX }] }]}
              {...panResponder.panHandlers}
            >
              {/* ── Top gradient + Header ───────────────────────────────────── */}
              <LinearGradient
                colors={['rgba(0,0,0,0.72)', 'transparent']}
                style={[ls.liveTopGrad, { paddingTop: insets.top + 6 }]}
                pointerEvents="box-none"
              >
                {/* Row 1: LIVE badge + timer | Right: viewer list + exit + camera */}
                <View style={ls.liveTopRow}>
                  {/* Left: compact LIVE pill + timer */}
                  <View style={ls.liveTopLeft}>
                    <Animated.View style={[ls.livePill, { transform: [{ scale: pulseAnim }] }]}>
                      <View style={ls.liveDot} />
                      <Text style={ls.livePillTxt}>LIVE</Text>
                    </Animated.View>
                    <Text style={ls.liveTimerTxt}>{fmtDuration(duration)}</Text>
                  </View>

                  {/* Right: viewer avatars + count chip + [X on top / camera below] */}
                  <View style={ls.liveTopRight}>
                    {/* Viewer avatars + count chip */}
                    <View style={ls.viewerInfoWrap}>
                      {(viewers.length > 0 || viewerCount > 0) && (
                        <View style={ls.viewerAvatarStack}>
                          {viewers.slice(0, 8).map((v, i) => (
                            <TouchableOpacity
                              key={v.username}
                              activeOpacity={0.8}
                              onPress={() => setViewerProfileUsername(v.username)}
                              style={[ls.viewerAvatar, { marginLeft: i === 0 ? 0 : -6, zIndex: 8 - i }]}
                            >
                              {v.avatarUrl ? (
                                <Image
                                  source={{ uri: v.avatarUrl }}
                                  style={ls.viewerAvatarImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={[ls.viewerAvatarFallback, {
                                  backgroundColor: ['#FF6B9D','#FFB800','#26C6DA','#A855F7'][i % 4],
                                }]}>
                                  <Text style={ls.viewerAvatarInitial}>
                                    {(v.displayName ?? v.username).charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}
                          {/* Placeholder circles jika viewers belum dimuat tapi viewerCount > 0 */}
                          {viewers.length === 0 && [...Array(Math.min(viewerCount, 8))].map((_, i) => (
                            <View key={i} style={[ls.viewerAvatar, { marginLeft: i === 0 ? 0 : -6, zIndex: 8 - i }]}>
                              <View style={[ls.viewerAvatarFallback, {
                                backgroundColor: ['#FF6B9D','#FFB800','#26C6DA','#A855F7'][i % 4],
                              }]}>
                                <MaterialCommunityIcons name="account" size={13} color="#fff" />
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                      {/* Count chip — klik untuk buka daftar penonton */}
                      <TouchableOpacity style={ls.viewerCountBadge} onPress={() => setShowViewerList(true)} activeOpacity={0.8}>
                        <Ionicons name="eye-outline" size={11} color="#fff" />
                        <Text style={ls.viewerCountTxt}>{fmtNum(viewerCount)}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* X on top, camera flip below — vertical stack */}
                    <View style={ls.liveExitCameraCol}>
                      {/* Exit — compact pill */}
                      <TouchableOpacity
                        style={ls.liveExitBtn}
                        onPress={handleEnd}
                        disabled={loading}
                        activeOpacity={0.82}
                      >
                        <LinearGradient
                          colors={['#FF416C', '#C9184A']}
                          style={ls.liveExitBtnInner}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        >
                          {loading
                            ? <ActivityIndicator color="#fff" size="small" style={{ transform: [{ scale: 0.65 }] }} />
                            : <Ionicons name="close" size={15} color="#fff" />
                          }
                        </LinearGradient>
                      </TouchableOpacity>
                      {/* Camera flip — small circle */}
                      <TouchableOpacity
                        style={ls.liveCameraBtn}
                        onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="camera-flip-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Stream title */}
                <Text style={ls.liveTitleOverlay} numberOfLines={1}>
                  {title.trim() || `${currentUser?.displayName ?? currentUser?.username}'s Live`}
                </Text>

                {/* Gift stat chip */}
                <View style={ls.giftStatRow}>
                  <LinearGradient
                    colors={['#FF6B9D', '#FFDA6B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={ls.liveStatChip}
                  >
                    <Text style={{ fontSize: 12, lineHeight: 16 }}>🪙</Text>
                    <Text style={ls.liveStatChipTxt}>{fmtNum(totalGifts)}</Text>
                  </LinearGradient>
                </View>
              </LinearGradient>

              {/* VIP entrance banner */}
              <VipEntranceBanner queue={vipQueueRef} showingRef={vipShowingRef} />

              {/* ── Chat overlay — kiri bawah ─────────────────────────────── */}
              <View style={ls.chatOverlay} pointerEvents="box-none">
                {chatNewCount > 0 && (
                  <TouchableOpacity
                    style={ls.chatNewMsgPill}
                    onPress={scrollHostChatToLatest}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="arrow-down" size={10} color="#fff" />
                    <Text style={ls.chatNewMsgTxt}>{chatNewCount} pesan baru</Text>
                  </TouchableOpacity>
                )}
                <FlatList
                  ref={chatListRef}
                  data={chatMessages}
                  keyExtractor={m => m.id}
                  renderItem={({ item: msg }) => {
                    if (msg.isAnnouncement) {
                      return (
                        <View style={ls.chatAnnounceBubble}>
                          <View style={ls.chatAnnounceIconRow}>
                            <Text style={ls.chatAnnounceIcon}>📢</Text>
                            <Text style={ls.chatAnnounceLbl}>Pengumuman Sistem</Text>
                          </View>
                          <Text style={ls.chatAnnounceText}>{msg.text}</Text>
                        </View>
                      );
                    }
                    if (msg.isSystem) {
                      return (
                        <View style={ls.chatBubbleSystem}>
                          <Text style={[ls.chatUser, { color: msg.color }]}>{msg.user} </Text>
                          <Text style={ls.chatText}>{msg.text}</Text>
                        </View>
                      );
                    }
                    const initials = (msg.username ?? msg.user ?? '?').slice(0, 2).toUpperCase();
                    const avatarColor = msg.color && msg.color !== '#fff' ? msg.color : P_HOT;
                    const vipColors = (msg.vipLevel ?? 0) > 0 ? VIP_BOX_COLORS[msg.vipLevel!] : null;
                    return (
                      <View style={ls.soloBubbleWrapper}>
                        <View style={[ls.soloBubbleAvatar, { borderColor: vipColors?.border ?? avatarColor }]}>
                          {msg.avatarUrl ? (
                            <Image source={{ uri: msg.avatarUrl }} style={ls.soloBubbleAvatarImg} />
                          ) : (
                            <View style={[ls.soloBubbleAvatarFallback, { backgroundColor: avatarColor }]}>
                              <Text style={ls.soloBubbleAvatarInitials}>{initials}</Text>
                            </View>
                          )}
                        </View>
                        <View style={[
                          { flex: 1 },
                          vipColors ? {
                            backgroundColor: vipColors.bg,
                            borderWidth: 1.2,
                            borderColor: vipColors.border,
                            borderRadius: 12,
                            paddingHorizontal: 8,
                            paddingTop: 5,
                            paddingBottom: 4,
                            shadowColor: vipColors.glow,
                            shadowOpacity: 0.35,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 4,
                          } : null,
                        ]}>
                          {/* Row 1: username — full width, tidak terpotong */}
                          <Text style={[ls.soloBubbleUsername, { color: vipColors?.border ?? msg.color }]}>
                            {msg.displayName || msg.user}
                          </Text>
                          {/* Row 2: badges — sejajar satu baris */}
                          {(!!msg.agencyBadge || !!msg.isHost || !!msg.isAdmin || (msg.migLevel ?? 0) > 0 || (msg.vipLevel ?? 0) > 0) && (
                            <View style={ls.soloBubbleBadgeRow}>
                              {(msg.vipLevel ?? 0) > 0 && <VipBadge level={msg.vipLevel!} size={24} />}
                              {!!msg.agencyBadge && (
                                <View style={ls.soloBubbleAgencyBadge}>
                                  <Text style={ls.soloBubbleAgencyBadgeText}>{msg.agencyBadge}</Text>
                                </View>
                              )}
                              {!!msg.isHost && (
                                <View style={ls.soloBubbleHostBadge}>
                                  <Text style={ls.soloBubbleHostBadgeText}>🏠 Host</Text>
                                </View>
                              )}
                              {!!msg.isAdmin && (
                                <View style={ls.soloBubbleAdminBadge}>
                                  <Text style={ls.soloBubbleAdminBadgeText}>⭐ Admin</Text>
                                </View>
                              )}
                              {(msg.migLevel ?? 0) > 0 && <SoloLevelBadge level={msg.migLevel!} />}
                            </View>
                          )}
                          <View style={ls.soloBubbleFrame}>
                            <Text style={[ls.soloBubbleCorner, { top: -4, left: 2 }]}>✦</Text>
                            <Text style={[ls.soloBubbleCorner, { top: -4, right: 2 }]}>✦</Text>
                            <Text style={[ls.soloBubbleCorner, { bottom: -4, left: 2 }]}>✦</Text>
                            <Text style={[ls.soloBubbleCorner, { bottom: -4, right: 2 }]}>✦</Text>
                            <Text style={ls.soloBubbleMsgText}>{msg.text}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  }}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled
                  contentContainerStyle={{ gap: 4 }}
                  onScroll={handleHostChatScroll}
                  onMomentumScrollEnd={handleHostChatScroll}
                  scrollEventThrottle={100}
                  ListEmptyComponent={null}
                  removeClippedSubviews
                  pointerEvents="auto"
                />
              </View>

              {/* ── Announce Banner (top-right, persistent) ──────────────── */}
              {!!activeBannerText && (
                <Animated.View
                  pointerEvents="none"
                  style={[ls.announceBannerWrap, { transform: [{ translateX: bannerSlide }] }]}
                >
                  <Image
                    source={ANNOUNCE_BANNER}
                    style={ls.announceBannerImg}
                    resizeMode="contain"
                  />
                  {/* Text overlaid on the blue right area of the banner */}
                  <View style={ls.announceBannerTextWrap} pointerEvents="none">
                    <BannerMarqueeText
                      text={activeBannerText}
                      containerWidth={136}
                      style={ls.announceBannerText}
                    />
                  </View>
                </Animated.View>
              )}

              {/* keep announceNotifs unused but referenced to avoid TS error */}
              {announceNotifs.length > 0 && null}

              {/* ── Komal Hand-Raise Toasts ──────────────────────────────────── */}
              <KomalHandRaiseToast
                requests={komalHandRaiseQueue}
                onApprove={handleApproveHandRaise}
                onDismiss={(u) => handleDismissHandRaise(u, true)}
              />

              {/* ── Komal Seats Panel + Mic Button (right side) ─────────────── */}
              <View style={{ position: 'absolute', right: 10, top: '22%', zIndex: 40, alignItems: 'center' }} pointerEvents="box-none">
                {komalActive && (
                  <KomalSeatsPanel
                    seats={komalSeats}
                    isHost={true}
                    currentUsername={currentUser?.username ?? null}
                    onMuteSeat={handleKomalMute}
                    onClose={handleKomalToggle}
                  />
                )}
                {/* Mic Button — tepat di bawah label Komal */}
                <TouchableOpacity
                  style={[ls.micBtn, isMicMuted && ls.micBtnMuted, !komalActive && ls.micBtnStandalone]}
                  onPress={handleToggleMic}
                  activeOpacity={0.82}
                  pointerEvents="auto"
                >
                  {isMicMuted ? (
                    <MaterialCommunityIcons name="microphone-off" size={20} color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>

              {/* ── PK Battle Modal / Overlay ─────────────────────────────── */}
              <PKBattleModal
                visible={pkModalVisible}
                streamId={streamId}
                myUsername={currentUser?.username ?? ''}
                myDisplayName={currentUser?.displayName ?? null}
                myAvatar={currentUser?.avatarUrl ?? null}
                wsEvent={pkWsEvent}
                onClose={() => setPkModalVisible(false)}
              />

              {/* ── Bottom gradient + Toolbar + Input ──────────────────────── */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.80)']}
                style={[ls.liveBottomGrad, { bottom: keyboardHeight, paddingBottom: insets.bottom + 8 }]}
              >
                {/* Chat input + toolbar icons */}
                <View style={ls.toolbarRow}>
                  {/* Chat input */}
                  <TouchableOpacity
                    style={ls.chatInputWrap}
                    activeOpacity={0.9}
                    onPress={() => { setChatFocused(true); chatInputRef.current?.focus(); }}
                  >
                    <TextInput
                      ref={chatInputRef}
                      style={ls.chatInputField}
                      value={chatInput}
                      onChangeText={setChatInput}
                      placeholder="Kirim pesan..."
                      placeholderTextColor="rgba(255,255,255,0.42)"
                      returnKeyType="send"
                      onSubmitEditing={sendChatMessage}
                      onFocus={() => setChatFocused(true)}
                      onBlur={() => setChatFocused(false)}
                      blurOnSubmit={false}
                    />
                  </TouchableOpacity>

                  {/* Toolbar icons */}
                  <View style={ls.toolbarIcons}>
                    {/* Sticker */}
                    <TouchableOpacity activeOpacity={0.8}>
                      <LinearGradient
                        colors={['#FFCA28', '#FF8F00']}
                        style={ls.toolbarPill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <MaterialCommunityIcons name="sticker-emoji" size={19} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Gift — host kirim ke diri sendiri */}
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setGiftSheetOpen(true)}>
                      <LinearGradient
                        colors={['#F06292', '#C62828']}
                        style={ls.toolbarPill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <Ionicons name="gift-outline" size={19} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* PK Battle */}
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setPkModalVisible(true)}>
                      <Image
                        source={require('../assets/images/pk_icon.png')}
                        style={{ width: 36, height: 36, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>

                    {/* Game / Tools */}
                    <TouchableOpacity activeOpacity={0.8} onPress={openToolsMenu}>
                      <LinearGradient
                        colors={['#10B981', '#047857']}
                        style={ls.toolbarPill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <MaterialCommunityIcons name="gamepad-variant" size={19} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        )}

        {/* ═══ TOAST NOTIFICATION ════════════════════════════════════════════ */}
        {toast && (
          <Animated.View
            style={[ls.toastWrap, { top: insets.top + 12, transform: [{ translateY: toastAnim }] }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity activeOpacity={0.92} onPress={dismissToast} style={ls.toastTouchable}>
              <LinearGradient
                colors={
                  toast.type === 'warn'  ? [Y_HOT,  '#FFD84D'] :
                  toast.type === 'info'  ? [P_HOT,  P_SOFT]   :
                                           ['#FF5252', '#FF8A80']
                }
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={ls.toastGrad}
              >
                <View style={ls.toastIconWrap}>
                  <Ionicons
                    name={
                      toast.type === 'warn'  ? 'alert-circle'     :
                      toast.type === 'info'  ? 'checkmark-circle' :
                                               'close-circle'
                    }
                    size={26}
                    color="#fff"
                  />
                </View>
                <View style={ls.toastTextWrap}>
                  <Text style={ls.toastTitle} numberOfLines={1}>{toast.title}</Text>
                  <Text style={ls.toastBody}  numberOfLines={2}>{toast.body}</Text>
                </View>
                <TouchableOpacity onPress={dismissToast} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ═══ END LIVE CONFIRM SHEET ════════════════════════════════════════ */}
        {showEndConfirm && (
          <Animated.View style={[ls.ecOverlay, { opacity: endConfirmAnim }]} pointerEvents="auto">
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeEndConfirm} />
            <Animated.View
              style={[
                ls.ecSheet,
                { paddingBottom: insets.bottom + 20,
                  transform: [{ translateY: endConfirmAnim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
              ]}
            >
              {/* Handle bar */}
              <View style={ls.ecHandle} />

              {/* Icon */}
              <View style={ls.ecIconWrap}>
                <LinearGradient colors={['#FF4D6D', '#C9184A']} style={ls.ecIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name="power" size={32} color="#fff" />
                </LinearGradient>
              </View>

              {/* Text */}
              <Text style={ls.ecTitle}>Akhiri Live?</Text>
              <Text style={ls.ecDesc}>Stream kamu akan dihentikan dan{'\n'}semua penonton akan keluar.</Text>

              {/* Stats preview */}
              <View style={ls.ecStatsRow}>
                <View style={ls.ecStatChip}>
                  <Ionicons name="time-outline" size={14} color="#FF6B9D" />
                  <Text style={ls.ecStatTxt}>{fmtDuration(duration)}</Text>
                </View>
                <View style={ls.ecStatDivider} />
                <View style={ls.ecStatChip}>
                  <Ionicons name="eye-outline" size={14} color="#26C6DA" />
                  <Text style={ls.ecStatTxt}>{fmtNum(viewerCount)} Penonton</Text>
                </View>
                <View style={ls.ecStatDivider} />
                <LinearGradient
                  colors={['#FF6B9D', '#FFDA6B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[ls.ecStatChip, { borderRadius: 14 }]}
                >
                  <Text style={{ fontSize: 13, lineHeight: 18 }}>🪙</Text>
                  <Text style={ls.ecStatTxt}>{fmtNum(totalGifts)}</Text>
                </LinearGradient>
              </View>

              {/* Buttons */}
              <View style={ls.ecBtnRow}>
                <TouchableOpacity style={ls.ecBtnCancel} activeOpacity={0.82} onPress={closeEndConfirm}>
                  <Text style={ls.ecBtnCancelTxt}>Lanjut Live</Text>
                </TouchableOpacity>
                <TouchableOpacity style={ls.ecBtnEnd} activeOpacity={0.82} onPress={doEndLive} disabled={loading}>
                  <LinearGradient colors={['#FF4D6D', '#C9184A']} style={ls.ecBtnEndInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={ls.ecBtnEndTxt}>Ya, Akhiri</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        )}

        {/* ═══ TOOLS MENU BOTTOM SHEET ═══════════════════════════════════════ */}
        {showToolsMenu && (
          <Animated.View
            style={[
              ls.tmOverlay,
              { opacity: toolsMenuAnim },
            ]}
            pointerEvents="auto"
          >
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeToolsMenu} />
            <Animated.View
              style={[
                ls.tmSheet,
                {
                  transform: [{
                    translateY: toolsMenuAnim.interpolate({
                      inputRange: [0, 1], outputRange: [340, 0],
                    }),
                  }],
                },
                { paddingBottom: insets.bottom + 16 },
              ]}
            >
              {/* Handle bar */}
              <View style={ls.tmHandle} />

              {/* Title row */}
              <View style={ls.tmTitleRow}>
                <Text style={ls.tmTitle}>Tools</Text>
                <TouchableOpacity onPress={closeToolsMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* Menu grid */}
              <View style={ls.tmGrid}>

                {/* Filter Beauty */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={openBeautyPicker}>
                  <LinearGradient colors={['#FF6EC7', '#C850C0']} style={ls.tmIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="face-woman-shimmer" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Filter Beauty</Text>
                  {beautyParams.enabled && (
                    <View style={ls.tmActiveDot} />
                  )}
                </TouchableOpacity>

                {/* Kick */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={openKickSheet}>
                  <LinearGradient colors={['#FF5252', '#C62828']} style={ls.tmIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="account-remove" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Kick</Text>
                </TouchableOpacity>

                {/* Block */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={openBlockSheet}>
                  <LinearGradient colors={['#FF6D00', '#E65100']} style={ls.tmIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="account-cancel" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Block</Text>
                </TouchableOpacity>

                {/* Add Admin */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={openAdminSheet}>
                  <LinearGradient colors={['#FFB300', '#F57F17']} style={ls.tmIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="shield-account" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Add Admin</Text>
                  {adminUsernames.size > 0 && <View style={ls.tmActiveDot} />}
                </TouchableOpacity>

                {/* Pengumuman */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={openAnnounceSheet}>
                  <LinearGradient colors={['#00BCD4', '#006064']} style={ls.tmIconBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="broadcast" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Pengumuman</Text>
                </TouchableOpacity>

                {/* Komal */}
                <TouchableOpacity style={ls.tmItem} activeOpacity={0.75} onPress={handleKomalToggle}>
                  <LinearGradient
                    colors={komalActive ? ['#10B981', '#047857'] : ['#7C3AED', '#4C1D95']}
                    style={ls.tmIconBox}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <MaterialCommunityIcons name="microphone-outline" size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.tmLabel}>Komal</Text>
                  {komalActive && <View style={ls.tmActiveDot} />}
                </TouchableOpacity>

              </View>
            </Animated.View>
          </Animated.View>
        )}

        {/* ═══ BEAUTY FILTER PANEL (Slider-based) ══════════════════════════ */}
        {showBeautyPicker && (
          <Animated.View
            style={[ls.bpOverlay, { opacity: beautyPickerAnim }]}
            pointerEvents="auto"
          >
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeBeautyPicker} />
            <Animated.View
              style={[
                ls.tmSheet,
                {
                  transform: [{
                    translateY: beautyPickerAnim.interpolate({
                      inputRange: [0, 1], outputRange: [540, 0],
                    }),
                  }],
                },
                { paddingBottom: insets.bottom + 16 },
              ]}
            >
              <View style={ls.tmHandle} />

              {/* Header row: back | title | close */}
              <View style={ls.tmTitleRow}>
                <TouchableOpacity onPress={backToToolsMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <Text style={ls.tmTitle}>Filter Beauty</Text>
                <TouchableOpacity onPress={closeBeautyPicker} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* ── PRESET BUTTONS ───────────────────────────────────────────── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={ls.bpPresetRow}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              >
                {([
                  { id: 'natural',  label: 'Natural',  emoji: '🌿', colors: ['#34D399','#059669'] as [string,string],
                    params: { smoothSkin:35, brightSkin:20, whiteSkin:0,  coolTone:0,  warmTone:18, rosyCheeks:22, slimFace:0,  slimChin:0,  slimNose:0,  bigEyes:0  } },
                  { id: 'idol',     label: 'Idol',     emoji: '💫', colors: ['#A78BFA','#7C3AED'] as [string,string],
                    params: { smoothSkin:70, brightSkin:50, whiteSkin:40, coolTone:22, warmTone:0,  rosyCheeks:15, slimFace:45, slimChin:35, slimNose:30, bigEyes:40 } },
                  { id: 'glamour',  label: 'Glamour',  emoji: '✨', colors: ['#F472B6','#BE185D'] as [string,string],
                    params: { smoothSkin:60, brightSkin:60, whiteSkin:30, coolTone:0,  warmTone:28, rosyCheeks:55, slimFace:35, slimChin:28, slimNose:20, bigEyes:28 } },
                  { id: 'fresh',    label: 'Fresh',    emoji: '🌸', colors: ['#38BDF8','#0284C7'] as [string,string],
                    params: { smoothSkin:45, brightSkin:45, whiteSkin:22, coolTone:32, warmTone:0,  rosyCheeks:38, slimFace:18, slimChin:14, slimNose:12, bigEyes:18 } },
                ] as { id: string; label: string; emoji: string; colors: [string,string]; params: Omit<BeautyParams,'enabled'> }[]).map(p => {
                  const isActive = activePreset === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[ls.bpPresetBtn, isActive && ls.bpPresetBtnActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        const next = isActive ? null : p.id;
                        setActivePreset(next);
                        if (next) {
                          setBeautyParams(prev => ({ ...prev, ...p.params, enabled: true }));
                        } else {
                          setBeautyParams(prev => ({ ...DEFAULT_BEAUTY_PARAMS, enabled: prev.enabled }));
                        }
                      }}
                    >
                      {isActive
                        ? <LinearGradient colors={p.colors} style={ls.bpPresetGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <Text style={ls.bpPresetEmoji}>{p.emoji}</Text>
                            <Text style={ls.bpPresetLabelActive}>{p.label}</Text>
                          </LinearGradient>
                        : <>
                            <Text style={ls.bpPresetEmoji}>{p.emoji}</Text>
                            <Text style={ls.bpPresetLabel}>{p.label}</Text>
                          </>
                      }
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={ls.bpDivider} />

              {/* Toggle card */}
              <View style={ls.bpToggleCard}>
                <LinearGradient colors={['#FF6EC7', '#C850C0']} style={ls.bpToggleIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="face-woman-shimmer" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={ls.bpToggleTitle}>Filter Beauty</Text>
                  <Text style={ls.bpToggleSub}>{beautyParams.enabled ? 'Aktif' : 'Nonaktif'}</Text>
                </View>
                <Switch
                  value={beautyParams.enabled}
                  onValueChange={(v) => setBeautyParams(p => ({ ...p, enabled: v }))}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#FF6EC7' }}
                  thumbColor={beautyParams.enabled ? '#fff' : 'rgba(255,255,255,0.6)'}
                />
              </View>

              <View style={ls.bpDivider} />

              {/* Sliders */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: SH * 0.38 }}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {([
                  { key: 'smoothSkin',  label: 'KULIT HALUS',     icon: '✨', color: '#FF6EC7', live: true,  badge: null     },
                  { key: 'brightSkin',  label: 'CERAHKAN KULIT',  icon: '☀️', color: '#FFD700', live: true,  badge: null     },
                  { key: 'whiteSkin',   label: 'PUTIHKAN WAJAH',  icon: '🤍', color: '#E0E7FF', live: true,  badge: null     },
                  { key: 'coolTone',    label: 'SEJUK',           icon: '❄️', color: '#7DD3FC', live: true,  badge: null     },
                  { key: 'warmTone',    label: 'HANGAT',          icon: '🔥', color: '#FCA340', live: true,  badge: null     },
                  { key: 'rosyCheeks',  label: 'KEMERAHAN PIPI',  icon: '🫶', color: '#FB7185', live: true,  badge: null     },
                  { key: 'slimFace',    label: 'TIPISKAN WAJAH',  icon: '🥹', color: '#C084FC', live: true,  badge: null     },
                  { key: 'slimChin',    label: 'TIPISKAN DAGU',   icon: '🤖', color: '#22D3EE', live: true,  badge: null     },
                  { key: 'slimNose',    label: 'MANCUNGKAN HIDUNG', icon: '👃', color: '#F9A8D4', live: true,  badge: 'AI'   },
                  { key: 'bigEyes',     label: 'PERBESAR MATA',   icon: '👁️', color: '#4ADE80', live: true,  badge: 'AI'   },
                ] as { key: keyof BeautyParams; label: string; icon: string; color: string; live: boolean; badge: string | null }[]).map(({ key, label, icon, color, live, badge }) => (
                  <View key={key} style={ls.bpSliderRow}>
                    <Text style={ls.bpSliderIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={ls.bpSliderLabel}>{label}</Text>
                        {badge != null && (
                          <View style={badge === 'AI' ? ls.bpAiBadge : ls.bpSoonBadge}>
                            <Text style={badge === 'AI' ? ls.bpAiTxt : ls.bpSoonTxt}>{badge}</Text>
                          </View>
                        )}
                      </View>
                      <Slider
                        style={ls.bpSlider}
                        value={beautyParams[key] as number}
                        minimumValue={0}
                        maximumValue={100}
                        step={1}
                        minimumTrackTintColor={live ? color : 'rgba(255,255,255,0.2)'}
                        maximumTrackTintColor="rgba(255,255,255,0.10)"
                        thumbTintColor={live ? color : 'rgba(255,255,255,0.25)'}
                        disabled={!beautyParams.enabled || !live}
                        onValueChange={(v: number) => {
                          if (!live) return;
                          setActivePreset(null);
                          setBeautyParams(p => ({ ...p, [key]: v }));
                        }}
                      />
                    </View>
                    <Text style={[ls.bpSliderValue, { color: live ? color : 'rgba(255,255,255,0.25)' }]}>
                      {beautyParams[key]}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        )}

        {/* ═══ ENDED PHASE ═══════════════════════════════════════════════════ */}
        {phase === 'ended' && (
          <View style={ls.endedScreen}>
            <View style={[ls.endedTop, { paddingTop: insets.top + 20 }]}>
              <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.endedIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <MaterialCommunityIcons name="flag-checkered" size={40} color="#fff" />
              </LinearGradient>
              <Text style={ls.endedTitle}>Live Selesai! 🎉</Text>
              <Text style={ls.endedSub}>Terima kasih sudah siaran. Ini ringkasan sesimu:</Text>
            </View>

            <View style={ls.endedSummary}>
              {[
                { icon: 'time-outline',  label: 'Durasi',          value: fmtDuration(duration) },
                { icon: 'eye-outline',   label: 'Total Penonton',   value: fmtNum(viewerCount)   },
                { icon: 'coin',          label: 'Total Pendapatan', value: fmtNum(totalGifts) },
              ].map((row, i) => (
                <View key={i} style={ls.endedRow}>
                  <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.endedIconMini} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name={row.icon as any} size={14} color="#fff" />
                  </LinearGradient>
                  <Text style={ls.endedLabel}>{row.label}</Text>
                  <Text style={ls.endedValue}>{row.value}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[ls.startBtn, { marginHorizontal: 22 }]} onPress={handleCloseEnded} activeOpacity={0.85}>
              <LinearGradient colors={[P_HOT, Y_HOT]} style={ls.startBtnInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={ls.startBtnTxt}>Tutup</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

      </Animated.View>

      {/* ═══ KICK SHEET ════════════════════════════════════════════════════ */}
      {streamId && (
        <LiveSoloKickSheet
          visible={showKickSheet}
          onClose={() => setShowKickSheet(false)}
          streamId={streamId}
        />
      )}

      {/* ═══ BLOCK SHEET ═══════════════════════════════════════════════════ */}
      {streamId && (
        <LiveSoloBlockSheet
          visible={showBlockSheet}
          onClose={() => setShowBlockSheet(false)}
          streamId={streamId}
        />
      )}

      {/* ═══ ADD ADMIN SHEET ════════════════════════════════════════════════ */}
      {streamId && (
        <LiveSoloAddAdminSheet
          visible={showAdminSheet}
          onClose={() => setShowAdminSheet(false)}
          streamId={streamId}
          onAdminsChanged={usernames => setAdminUsernames(new Set(usernames))}
        />
      )}

      {/* ═══ ANNOUNCE SHEET ═════════════════════════════════════════════════ */}
      <LiveSoloAnnounceSheet
        visible={showAnnounceSheet}
        onClose={() => setShowAnnounceSheet(false)}
        onSend={sendAnnouncement}
        onClear={clearAnnouncement}
        currentAnnouncement={activeBannerText}
      />

      {/* ═══ GIFT PICKER SHEET (host kirim ke diri sendiri) ════════════════ */}
      {streamId && phase === 'live' && (
        <SoloGiftPickerSheet
          visible={giftSheetOpen}
          onClose={() => setGiftSheetOpen(false)}
          streamId={streamId}
          currentUsername={currentUser?.username ?? ''}
          isSelfGift={true}
          onGiftSent={(info) => {
            pushChatMsg({
              id:       `self-gift-${Date.now()}`,
              user:     currentUser?.displayName ?? currentUser?.username ?? 'Host',
              text:     `🎁 mengirim ${info.giftName} x${info.qty} ke diri sendiri`,
              color:    '#C084FC',
              isSystem: true,
            });
            setTotalGifts(g => g + info.price * info.qty);
            const hostName = currentUser?.displayName ?? currentUser?.username ?? 'Host';
            const now = Date.now();
            const last = lastGiftRef.current;
            const isSameCombo = last
              && last.sender === hostName
              && last.giftId === info.giftId
              && (now - last.time) < 3000;
            lastGiftRef.current = { sender: hostName, giftId: info.giftId, time: now };
            if (isSameCombo) {
              comboOverlayRef.current?.addCombo();
            } else {
              comboOverlayRef.current?.show({
                streamId:          String(streamId ?? ''),
                giftId:            info.giftId,
                giftName:          info.giftName,
                giftEmoji:         info.giftEmoji,
                giftImageUrl:      info.giftImageUrl ?? null,
                price:             info.price,
                senderDisplayName: hostName,
                senderAvatarUrl:   null,
                canTap:            true,
                category:          info.category,
                initialCombo:      info.qty,
              });
            }
            if (!info.noEffect && (info.videoUrl || info.lottieUrl)) {
              giftEffectRef.current?.play({
                videoUrl:  info.videoUrl,
                lottieUrl: info.lottieUrl,
                category:  info.category,
              });
            }
          }}
        />
      )}

      {/* ═══ GIFT EFFECT LAYER ══════════════════════════════════════════════ */}
      <SoloGiftEffectLayer ref={giftEffectRef} />

      {/* ═══ GIFT COMBO OVERLAY ═════════════════════════════════════════════ */}
      <GiftComboOverlay ref={comboOverlayRef} />

      {/* ── View Profile (tap avatar viewer) ── */}
      {viewerProfileUsername && (
        <ViewProfileModal
          visible={!!viewerProfileUsername}
          username={viewerProfileUsername}
          displayName={viewerProfileUsername}
          avatarColor="#6366F1"
          currentUserId={currentUser?.username ?? ''}
          onClose={() => setViewerProfileUsername(null)}
        />
      )}

      {/* ── Viewer List Modal ── */}
      <LiveViewerListModal
        visible={showViewerList}
        onClose={() => setShowViewerList(false)}
        viewers={viewers}
        viewerCount={viewerCount}
        onFetchViewers={streamId ? () => getLiveViewers(streamId) : undefined}
        onViewerPress={(username) => { setShowViewerList(false); setViewerProfileUsername(username); }}
      />

    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,10,60,0.45)' },

  fullSheet: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
  },

  // ── Header
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
  },
  headerCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: WHITE, letterSpacing: 0.3 },

  // ── Section
  section: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 2 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: TXT_MID,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10,
  },

  // ── Thumbnail
  thumbPicker: {
    width: '100%', height: (SW - 36) * (4 / 3),
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1.5, borderColor: P_PALE,
    backgroundColor: P_PALE,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  thumbChangeTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  thumbEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20,
  },
  thumbIconCircle: {
    width: 66, height: 66, borderRadius: 33,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: P_HOT, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  thumbEmptyTitle:   { fontSize: 15, fontWeight: '800', color: TXT_DARK, marginTop: 2 },
  thumbEmptySubtext: { fontSize: 12, color: TXT_MID },
  thumbActionRow:    { flexDirection: 'row', gap: 10, marginTop: 6 },
  thumbActionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: WHITE, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: P_PALE,
    shadowColor: P_HOT, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumbActionTxt: { fontSize: 12, fontWeight: '700', color: P_HOT },

  // ── Title input
  inputCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: P_PALE,
    paddingHorizontal: 12, paddingVertical: 11, gap: 10,
    shadowColor: P_HOT, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputIconBg: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  titleInput: { flex: 1, fontSize: 15, color: TXT_DARK, padding: 0 },
  charCount:  { fontSize: 11, color: TXT_MID, textAlign: 'right', marginTop: 5 },

  // ── Category
  catScroll: { paddingRight: 8, gap: 8 },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 15, paddingVertical: 9,
    borderRadius: 22, backgroundColor: WHITE,
    borderWidth: 1.5, borderColor: '#F0E8F5',
  },
  catPillActive: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 15, paddingVertical: 9,
    borderRadius: 22,
    shadowColor: P_HOT, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  catEmoji:      { fontSize: 14 },
  catLabel:      { fontSize: 13, fontWeight: '600', color: TXT_MID },
  catLabelActive: { fontSize: 13, fontWeight: '700', color: WHITE },

  // ── Preview card
  previewCard: {
    height: 165, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  previewImg:  { ...StyleSheet.absoluteFillObject },
  previewGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  previewLiveBadge: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: P_HOT, borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  previewDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: WHITE },
  previewLiveTxt: { color: WHITE, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  previewInfo:   { position: 'absolute', bottom: 11, left: 11, right: 11, gap: 3 },
  previewTitle:  { fontSize: 13, fontWeight: '800', color: WHITE },
  previewCat:    { fontSize: 11, color: 'rgba(255,255,255,0.78)' },

  // ── Footer
  footerSection: { paddingHorizontal: 18, paddingTop: 22, gap: 14 },
  startBtn:      { borderRadius: 18, overflow: 'hidden' },
  startBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 17, gap: 10,
  },
  startBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  noticeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
  },
  noticeTxt: { fontSize: 12, color: TXT_MID, flex: 1 },

  // ── Live screen (full-screen camera)
  liveScreen: { flex: 1, backgroundColor: '#000' },

  // Pull-back tab — tepi kiri, muncul saat UI disembunyikan
  pullTab: {
    position: 'absolute', left: 0, zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 14, paddingHorizontal: 6,
    borderTopRightRadius: 12, borderBottomRightRadius: 12,
    borderWidth: 1, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.18)',
  },

  // Layer 2: UI overlay (slideable)
  uiOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },

  liveTopGrad: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingBottom: 32,
  },
  liveTopRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 6,
  },
  liveTopLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveTopRight: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },

  viewerInfoWrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6,
  },

  liveExitCameraCol: {
    flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  viewerAvatarStack: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
  viewerAvatar: {
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: '#2D2D2D',
  },
  viewerAvatarImg: { width: 22, height: 22, borderRadius: 11 },
  viewerAvatarFallback: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  viewerAvatarInitial: { fontSize: 9, fontWeight: '800', color: WHITE },
  viewerCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.50)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  viewerCountTxt: { fontSize: 11, fontWeight: '700', color: WHITE },

  // ── Mic mute button ────────────────────────────────────────────────────────
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(30,20,50,0.75)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4,
    elevation: 6,
  },
  micBtnMuted: {
    backgroundColor: 'rgba(185,28,28,0.80)',
    borderColor: '#F87171',
  },
  micBtnStandalone: {
    marginTop: 0,
  },

  giftStatRow: { flexDirection: 'row', marginTop: 4 },

  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  liveDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4444' },
  livePillTxt: { color: WHITE, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  liveTimerTxt: { fontSize: 14, fontWeight: '800', color: WHITE, fontVariant: ['tabular-nums'] as any },
  liveIconBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  liveExitBtn: {
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#FF416C', shadowOpacity: 0.55,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  liveExitBtnInner: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  liveCameraBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  liveTitleOverlay: {
    fontSize: 13, fontWeight: '700', color: WHITE,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  liveBottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 50,
  },
  liveStatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  liveStatChipTxt: { fontSize: 12, fontWeight: '800', color: WHITE },
  liveStatChipLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  // ── Chat overlay
  chatOverlay: {
    position: 'absolute',
    bottom: 92, left: 12,
    width: SW * 0.90,
    maxHeight: SH * 0.30,
  },
  chatNewMsgPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginBottom: 5,
    backgroundColor: 'rgba(255,60,120,0.85)',
    borderRadius: 16, paddingVertical: 4, paddingHorizontal: 10,
  },
  chatNewMsgTxt: { fontSize: 11, color: '#fff', fontWeight: '700' },
  chatLvBadge: {
    backgroundColor: 'rgba(255,184,0,0.25)',
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.5)',
    borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2,
    marginRight: 3, alignSelf: 'center',
  },
  chatLvBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#FFD84D' },
  chatAgencyBadge: {
    backgroundColor: 'rgba(255,107,157,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,107,157,0.45)',
    borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2,
    marginRight: 3, alignSelf: 'center',
  },
  chatAgencyBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#FF9DBE' },
  chatBubble: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 4,
  },
  announceBannerWrap: {
    position: 'absolute',
    right: 0,
    top: 100,
    width: 220,
    height: 66,
    zIndex: 999,
  },
  announceBannerImg: {
    position: 'absolute',
    width: 220,
    height: 66,
    top: 0,
    left: 0,
  },
  announceBannerTextWrap: {
    position: 'absolute',
    left: 70,
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingRight: 4,
  },
  announceBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  floatAnnounce: {
    position: 'absolute',
    left: 16, right: 16,
    zIndex: 999,
  },
  floatAnnounceGlow: {
    position: 'absolute',
    top: -10, left: -10, right: -10, bottom: -10,
    backgroundColor: 'rgba(80,100,255,0.14)',
    borderRadius: 36,
    shadowColor: '#6090FF',
    shadowOpacity: 0.85,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 18,
  },
  floatAnnounceGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(140,180,255,0.45)',
  },
  floatAnnounceText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  floatAnnounceStar: {
    color: 'rgba(255,220,100,0.7)',
    fontSize: 14,
    marginLeft: 6,
  },
  chatAnnounceBubble: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    alignSelf: 'stretch',
  },
  chatAnnounceIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4,
  },
  chatAnnounceIcon: { fontSize: 13 },
  chatAnnounceLbl: {
    fontSize: 11, fontWeight: '700', color: '#FFB800',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chatAnnounceText: {
    fontSize: 13, color: '#FFF8E0', lineHeight: 18,
  },
  chatBubbleSystem: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    maxWidth: '93%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 2,
  },
  chatUser:  { fontSize: 12, fontWeight: '800' },
  chatText:  { fontSize: 12, color: WHITE, flexShrink: 1 },

  // ── Party-style premium chat bubble ───────────────────────────────────────
  soloBubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    maxWidth: '93%',
  },
  soloBubbleAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: P_HOT, shadowOpacity: 0.45,
    shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
    elevation: 3,
    marginTop: 1,
  },
  soloBubbleAvatarImg: { width: '100%', height: '100%' },
  soloBubbleAvatarFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  soloBubbleAvatarInitials: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: WHITE,
  },
  soloBubbleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    flexWrap: 'nowrap',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  soloBubbleUsername: {
    fontSize: 12, fontWeight: '800', letterSpacing: 0.2,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  soloBubbleAgencyBadge: {
    backgroundColor: '#0E7490',
    borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.5)',
    shadowColor: '#22D3EE', shadowOpacity: 0.5,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  soloBubbleAgencyBadgeText: {
    fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  soloBubbleHostBadge: {
    backgroundColor: '#C026D3',
    borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(232,121,249,0.6)',
    shadowColor: '#E879F9', shadowOpacity: 0.6,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  soloBubbleHostBadgeText: {
    fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  soloBubbleAdminBadge: {
    backgroundColor: 'rgba(255,184,0,0.20)',
    borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.55)',
    elevation: 3,
  },
  soloBubbleAdminBadgeText: {
    fontSize: 10, fontWeight: '800', color: '#FFD84D', letterSpacing: 0.3,
  },
  soloBubbleFrame: {
    backgroundColor: 'rgba(8,4,28,0.72)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,157,0.30)',
    paddingHorizontal: 11, paddingVertical: 8,
    alignSelf: 'flex-start',
    shadowColor: P_HOT, shadowOpacity: 0.18,
    shadowRadius: 8, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
    position: 'relative',
  },
  soloBubbleCorner: {
    position: 'absolute',
    fontSize: 8,
    color: 'rgba(255,157,190,0.60)',
    lineHeight: 10,
  },
  soloBubbleMsgText: {
    fontSize: 14, color: WHITE, fontWeight: '500',
    lineHeight: 20, flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Toolbar bottom
  toolbarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 7,
  },
  chatInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
  },
  chatInputField: {
    fontSize: 13, color: WHITE, padding: 0,
  },
  toolbarIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarPill: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },

  // StatBox (setup phase preview) — still used by StatBox component
  statBox:    { flex: 1, alignItems: 'center', gap: 6 },
  statIconBg: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statDivider: { width: 1, height: 52, backgroundColor: P_PALE },
  statValue:  { fontSize: 22, fontWeight: '900', color: TXT_DARK },
  statLabel:  { fontSize: 11, color: TXT_MID, fontWeight: '600' },

  liveStatsRow: { flexDirection: 'row', gap: 10 },

  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(220,38,38,0.9)', borderRadius: 16,
    paddingVertical: 15, gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,100,100,0.4)',
  },
  endBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },

  // ── Ended screen
  endedScreen: { flex: 1, backgroundColor: WHITE, gap: 26 },
  endedTop: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  endedIconCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: P_HOT, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  endedTitle: { fontSize: 22, fontWeight: '900', color: TXT_DARK },
  endedSub:   { fontSize: 13, color: TXT_MID, textAlign: 'center', lineHeight: 19 },

  endedSummary: {
    marginHorizontal: 22,
    backgroundColor: CARD_BG, borderRadius: 18, padding: 18, gap: 14,
    borderWidth: 1, borderColor: P_PALE,
    shadowColor: P_HOT, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  endedRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endedIconMini: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  endedLabel:  { flex: 1, fontSize: 14, color: TXT_MID, fontWeight: '500' },
  endedValue:  { fontSize: 14, fontWeight: '800', color: TXT_DARK },

  // ── Toast notification
  toastWrap: {
    position: 'absolute', left: 16, right: 16, zIndex: 999,
  },
  toastTouchable: {
    borderRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  toastGrad: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, gap: 12,
  },
  toastIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  toastTextWrap: { flex: 1, gap: 2 },
  toastTitle: { fontSize: 14, fontWeight: '800', color: WHITE, letterSpacing: 0.1 },
  toastBody:  { fontSize: 12, color: 'rgba(255,255,255,0.88)', lineHeight: 17 },

  // ── End Live Confirm Sheet ─────────────────────────────────────────────────
  ecOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 210,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  ecSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ecHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 24,
  },
  ecIconWrap: { marginBottom: 18 },
  ecIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF4D6D', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  ecTitle: {
    fontSize: 22, fontWeight: '900', color: WHITE,
    letterSpacing: 0.2, marginBottom: 8, textAlign: 'center',
  },
  ecDesc: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center', lineHeight: 20, marginBottom: 22,
  },
  ecStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18, paddingVertical: 12, paddingHorizontal: 18,
    gap: 0, marginBottom: 28, width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  ecStatChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ecStatTxt:  { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  ecStatDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.12)' },
  ecBtnRow: {
    flexDirection: 'row', gap: 12, width: '100%',
  },
  ecBtnCancel: {
    flex: 1, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  ecBtnCancelTxt: {
    fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.8)',
  },
  ecBtnEnd: {
    flex: 1, height: 52, borderRadius: 26, overflow: 'hidden',
    shadowColor: '#FF4D6D', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ecBtnEndInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  ecBtnEndTxt: {
    fontSize: 15, fontWeight: '900', color: WHITE, letterSpacing: 0.3,
  },

  // ── Tools Menu Bottom Sheet ────────────────────────────────────────────────
  tmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.72)',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },

  // ── Beauty Picker Overlay — transparan biar kamera tetap terlihat ──────────
  bpOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: 'transparent',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  tmSheet: {
    backgroundColor: 'rgba(12,12,16,0.82)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    maxHeight: SH * 0.50,
  },
  tmHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 14,
  },
  tmTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tmTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
  tmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  tmItem: {
    width: (SW - 40 - 24) / 3,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  tmIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tmLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 15,
  },
  tmActiveDot: {
    position: 'absolute',
    top: 2,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6EC7',
  },

  // ── Beauty Filter Panel (Slider-based) ────────────────────────────────────
  bpToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  bpToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },
  bpToggleSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  bpDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },
  bpSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bpSliderIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  bpSliderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.6,
    marginBottom: 0,
  },
  bpSlider: {
    flex: 1,
    height: 32,
  },
  bpSliderValue: {
    fontSize: 13,
    fontWeight: '700',
    width: 30,
    textAlign: 'right',
  },
  bpPresetRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bpPresetBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  bpPresetBtnActive: {
    borderColor: 'transparent',
  },
  bpPresetGrad: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  bpPresetEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  bpPresetLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 0.3,
  },
  bpPresetLabelActive: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  bpSoonBadge: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bpSoonTxt: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  bpAiBadge: {
    backgroundColor: 'rgba(74,222,128,0.18)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.40)',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bpAiTxt: {
    fontSize: 8,
    fontWeight: '700',
    color: '#4ADE80',
    letterSpacing: 0.5,
  },
});
