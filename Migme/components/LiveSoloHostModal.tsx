import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image,
  Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, useCameraDevice, useCameraPermission, useSkiaFrameProcessor } from 'react-native-vision-camera';
import { Skia, TileMode } from '@shopify/react-native-skia';
import { useSharedValue as useWorkletValue } from 'react-native-worklets-core';
import { setBeautyParams, isBeautyFilterAvailable } from '../modules/beauty-filter/src';
import {
  startLiveStream, endLiveStream, getLiveStreamDetail,
  uploadLiveThumbnail,
  fetchStreamViewers, fetchStreamBlocks,
  kickStreamViewer, blockStreamViewer, unblockStreamViewer,
  sendStreamAnnouncement,
  type StreamViewer, type StreamBlock,
} from '../services/liveService';
import { WS_URL } from '../config/connection';
import { getAuthToken } from '../services/storage';
import Slider from '@react-native-community/slider';

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
  currentUser: { username: string; displayName?: string | null } | null;
  onClose: () => void;
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
  const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
  const cameraDevice = useCameraDevice(facing);

  // ── Host Menu ──────────────────────────────────────────────────────────────
  const [hostMenuVisible,  setHostMenuVisible]  = useState(false);
  const [hostMenuTab,      setHostMenuTab]      = useState<'main' | 'kick' | 'block' | 'blocklist' | 'beauty'>('main');
  const [beautyFilter,     setBeautyFilter]     = useState(false);
  const [comalFilter,      setComalFilter]      = useState(false);
  // ── Beauty settings ────────────────────────────────────────────────────────
  const [beautyEnabled,    setBeautyEnabled]    = useState(false);
  const [beautySmooth,     setBeautySmooth]     = useState(60);
  const [beautyBright,     setBeautyBright]     = useState(40);
  const [beautySlimFace,   setBeautySlimFace]   = useState(20);
  const [beautyChin,       setBeautyChin]       = useState(10);
  const [beautyEyes,       setBeautyEyes]       = useState(30);
  const [beautyRosiness,   setBeautyRosiness]   = useState(20);

  // Worklet-accessible shared values — synced from React state for frame processor
  const smoothWV   = useWorkletValue(60 / 100 * 3);   // 0–3 blur radius
  const brightWV   = useWorkletValue(40 / 100 * 30);  // 0–30 brightness offset
  const rosinessWV = useWorkletValue(20 / 100 * 20);  // 0–20 redness boost
  const enabledWV  = useWorkletValue(false);

  useEffect(() => { smoothWV.value   = beautySmooth   / 100 * 3;  }, [beautySmooth]);
  useEffect(() => { brightWV.value   = beautyBright   / 100 * 30; }, [beautyBright]);
  useEffect(() => { rosinessWV.value = beautyRosiness / 100 * 20; }, [beautyRosiness]);
  useEffect(() => { enabledWV.value  = beautyEnabled; },            [beautyEnabled]);

  // Sync beauty params to native WebRTC processor → viewers also see the filter
  useEffect(() => {
    if (phase === 'live') {
      setBeautyParams({
        smooth:   beautySmooth   / 100,
        bright:   beautyBright   / 100,
        rosiness: beautyRosiness / 100,
        enabled:  beautyEnabled,
      });
    }
  }, [beautySmooth, beautyBright, beautyRosiness, beautyEnabled, phase]);

  // Skia frame processor — applies beauty filters to camera preview (host side only)
  const frameProcessor = useSkiaFrameProcessor((frame) => {
    'worklet';
    const paint = Skia.Paint();

    // Skin smoothing: gaussian blur
    const blur = smoothWV.value;
    if (blur > 0.05) {
      paint.setImageFilter(Skia.ImageFilter.MakeBlur(blur, blur, TileMode.Clamp, null));
    }

    // Skin brightening: raise RGB channels
    const b = brightWV.value;
    const r = rosinessWV.value;
    if (b > 0 || r > 0) {
      paint.setColorFilter(Skia.ColorFilter.MakeMatrix([
        1, 0, 0, 0, b + r,   // R channel boost (brightness + rosiness)
        0, 1, 0, 0, b,       // G channel boost (brightness only)
        0, 0, 1, 0, b,       // B channel boost (brightness only)
        0, 0, 0, 1, 0,
      ]));
    }

    frame.render(paint);
  }, [smoothWV, brightWV, rosinessWV]);

  const [announceText,     setAnnounceText]     = useState('');
  const [announceLoading,  setAnnounceLoading]  = useState(false);
  const [viewers,          setViewers]          = useState<StreamViewer[]>([]);
  const [viewersLoading,   setViewersLoading]   = useState(false);
  const [blocks,           setBlocks]           = useState<StreamBlock[]>([]);
  const [blocksLoading,    setBlocksLoading]    = useState(false);
  const announceInputRef = useRef<TextInput>(null);

  // ── Chat overlay ───────────────────────────────────────────────────────────
  interface ChatMsg { id: string; user: string; text: string; color: string; isSystem?: boolean }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [chatFocused,  setChatFocused]  = useState(false);
  const chatInputRef  = useRef<TextInput>(null);
  const chatListRef   = useRef<FlatList>(null);

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
  const seenMsgIdsRef   = useRef<Set<string>>(new Set());
  const currentUserRef  = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const CHAT_COLORS   = ['#FF6B9D','#FFB800','#26C6DA','#A855F7','#10B981','#F59E0B'];

  const pushChatMsg = useCallback((msg: ChatMsg) => {
    setChatMessages(prev => [...prev.slice(-79), msg]);
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

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
          // Skip format gift << ... >>
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
            id:       m.id ?? `${Date.now()}-${Math.random()}`,
            user:     m.senderDisplayName ?? m.senderUsername ?? 'Viewer',
            text:     msgText,
            color:    CHAT_COLORS[colorIdx],
            isSystem: !!m.isSystem,
          });
          return;
        }

        // ── Gift dari viewer ──────────────────────────────────────────────
        if (p.type === 'LIVE_GIFT' && p.streamId === sid) {
          pushChatMsg({
            id:       `gift-${Date.now()}`,
            user:     p.senderUsername ?? 'Viewer',
            text:     `🎁 ${p.giftName} (${p.amountCoins} koin)`,
            color:    '#FFD700',
            isSystem: true,
          });
          setTotalGifts(g => g + (p.amountCoins ?? 0));
          return;
        }

        // ── Viewer join ───────────────────────────────────────────────────
        if (p.type === 'LIVE_JOIN' && p.streamId === sid) {
          pushChatMsg({
            id:       `join-${Date.now()}`,
            user:     p.username ?? 'Viewer',
            text:     'bergabung ke live',
            color:    '#26C6DA',
            isSystem: true,
          });
          setViewerCount(c => c + 1);
          return;
        }

        // ── Host announcement ─────────────────────────────────────────────
        if (p.type === 'LIVE_ANNOUNCE' && p.streamId === sid) {
          pushChatMsg({
            id:       `ann-${Date.now()}`,
            user:     '📢 Pengumuman',
            text:     p.text ?? '',
            color:    '#FFB800',
            isSystem: true,
          });
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
      id:    `host-${Date.now()}`,
      user:  currentUser?.displayName ?? currentUser?.username ?? 'Host',
      text,
      color: P_HOT,
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

  // ── Connect WebSocket saat live dimulai, disconnect saat selesai ───────────
  useEffect(() => {
    if (phase === 'live' && streamId) {
      connectWS(streamId);
    } else {
      disconnectWS();
    }
    return () => { disconnectWS(); };
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
    if (detail) { setViewerCount(detail.viewerCount ?? 0); setTotalGifts(detail.totalGifts ?? 0); }
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
          setChatMessages([]); setChatInput('');
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
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.75 });
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

    if (!hasCamPermission) {
      const granted = await requestCamPermission();
      if (!granted) {
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
      setPhase('live');
      if (result.resumed) showToast('Live Resumed', 'Your previous stream has been resumed', 'info');
    } finally {
      setLoading(false);
      setThumbUploading(false);
    }
  };

  const handleEnd = () => {
    Alert.alert('Akhiri Live?', 'Stream kamu akan dihentikan dan semua penonton akan keluar.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Akhiri', style: 'destructive',
        onPress: async () => {
          if (!streamId) return;
          setLoading(true);
          try {
            const result = await endLiveStream(streamId);
            setPhase('ended');
            if (result.ok) { setTotalGifts(result.totalGifts ?? totalGifts); setViewerCount(result.totalViewers ?? viewerCount); }
          } finally { setLoading(false); }
        },
      },
    ]);
  };

  const handleCloseEnded = () => {
    disconnectWS();
    setPhase('setup'); setStreamId(null); setTitle(''); setCategory('general');
    setThumbUri(null); setViewerCount(0); setTotalGifts(0); setDuration(0);
    setChatMessages([]); setChatInput('');
    uiSlideX.setValue(0); uiHidden.current = false;
    onClose();
  };

  // ── Host Menu helpers ──────────────────────────────────────────────────────
  const openHostMenu = useCallback(async (tab: 'main' | 'kick' | 'block' | 'blocklist' = 'main') => {
    setHostMenuTab(tab);
    setHostMenuVisible(true);
    if ((tab === 'kick' || tab === 'block') && streamId) {
      setViewersLoading(true);
      const list = await fetchStreamViewers(streamId);
      setViewers(list);
      setViewersLoading(false);
    }
    if (tab === 'blocklist' && streamId) {
      setBlocksLoading(true);
      const list = await fetchStreamBlocks(streamId);
      setBlocks(list);
      setBlocksLoading(false);
    }
  }, [streamId]);

  const handleKick = useCallback(async (viewer: StreamViewer) => {
    if (!streamId) return;
    Alert.alert('Kick User', `Keluarkan @${viewer.username} dari live?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Kick', style: 'destructive',
        onPress: async () => {
          const r = await kickStreamViewer(streamId, viewer.userId, viewer.username);
          if (r.ok) {
            setViewers(v => v.filter(x => x.userId !== viewer.userId));
            showToast('Kicked', `@${viewer.username} dikeluarkan`, 'info');
          } else {
            showToast('Gagal', r.message ?? 'Coba lagi', 'error');
          }
        },
      },
    ]);
  }, [streamId, showToast]);

  const handleBlock = useCallback(async (viewer: StreamViewer) => {
    if (!streamId) return;
    Alert.alert('Block User', `Blokir @${viewer.username}? Mereka tidak bisa masuk lagi.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Blokir', style: 'destructive',
        onPress: async () => {
          const r = await blockStreamViewer(streamId, viewer.userId, viewer.username);
          if (r.ok) {
            setViewers(v => v.filter(x => x.userId !== viewer.userId));
            showToast('Diblokir', `@${viewer.username} diblokir`, 'info');
          } else {
            showToast('Gagal', r.message ?? 'Coba lagi', 'error');
          }
        },
      },
    ]);
  }, [streamId, showToast]);

  const handleUnblock = useCallback(async (block: StreamBlock) => {
    if (!streamId) return;
    const r = await unblockStreamViewer(streamId, block.userId);
    if (r.ok) {
      setBlocks(b => b.filter(x => x.userId !== block.userId));
      showToast('Dibuka', `@${block.username} diunblokir`, 'info');
    } else {
      showToast('Gagal', r.message ?? 'Coba lagi', 'error');
    }
  }, [streamId, showToast]);

  const handleSendAnnouncement = useCallback(async () => {
    if (!announceText.trim() || !streamId) return;
    setAnnounceLoading(true);
    const r = await sendStreamAnnouncement(streamId, announceText.trim());
    setAnnounceLoading(false);
    if (r.ok) {
      setAnnounceText('');
      announceInputRef.current?.blur();
      showToast('Terkirim', 'Pengumuman berhasil dikirim', 'info');
    } else {
      showToast('Gagal', r.message ?? 'Coba lagi', 'error');
    }
  }, [announceText, streamId, showToast]);

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
                      <Text style={ls.thumbEmptySubtext}>Opsional · Aspek 16:9 · Maks 10MB</Text>
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
        )}

        {/* ═══ LIVE PHASE — Full-screen camera + Slideable UI overlay ════════ */}
        {phase === 'live' && (
          <View style={ls.liveScreen}>
            {/* Layer 1: VisionCamera + Skia beauty frame processor */}
            {cameraDevice && (
              <Camera
                style={StyleSheet.absoluteFill}
                device={cameraDevice}
                isActive={phase === 'live'}
                frameProcessor={beautyEnabled ? frameProcessor : undefined}
              />
            )}

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
                {/* Row 1: LIVE badge + timer + flip + close */}
                <View style={ls.liveTopRow}>
                  {/* Left: LIVE pill + title */}
                  <View style={ls.liveTopLeft}>
                    <Animated.View style={[ls.livePill, { transform: [{ scale: pulseAnim }] }]}>
                      <View style={ls.liveDot} />
                      <Text style={ls.livePillTxt}>SEDANG LIVE</Text>
                    </Animated.View>
                    <Text style={ls.liveTimerTxt}>{fmtDuration(duration)}</Text>
                  </View>

                  {/* Right: viewer avatars placeholder + count + flip + X */}
                  <View style={ls.liveTopRight}>
                    {/* Viewer avatars stack */}
                    <View style={ls.viewerAvatarStack}>
                      {[...Array(Math.min(viewerCount, 3))].map((_, i) => (
                        <View key={i} style={[ls.viewerAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}>
                          <MaterialCommunityIcons name="account-circle" size={26} color="rgba(255,255,255,0.7)" />
                        </View>
                      ))}
                    </View>
                    {viewerCount > 0 && (
                      <View style={ls.viewerCountBadge}>
                        <Ionicons name="eye-outline" size={11} color="#fff" />
                        <Text style={ls.viewerCountTxt}>{fmtNum(viewerCount)}</Text>
                      </View>
                    )}
                    {/* Flip camera */}
                    <TouchableOpacity
                      style={ls.liveIconBtn}
                      onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="camera-flip-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                    {/* Close / End live */}
                    <TouchableOpacity
                      style={[ls.liveIconBtn, { backgroundColor: 'rgba(220,38,38,0.75)' }]}
                      onPress={handleEnd}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading
                        ? <ActivityIndicator color="#fff" size="small" style={{ transform: [{ scale: 0.7 }] }} />
                        : <Ionicons name="close" size={20} color="#fff" />
                      }
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Stream title */}
                <Text style={ls.liveTitleOverlay} numberOfLines={1}>
                  {title.trim() || `${currentUser?.displayName ?? currentUser?.username}'s Live`}
                </Text>

                {/* Gift stat chip */}
                <View style={ls.giftStatRow}>
                  <View style={ls.liveStatChip}>
                    <MaterialCommunityIcons name="diamond-stone" size={12} color="#FFD700" />
                    <Text style={ls.liveStatChipTxt}>{fmtNum(totalGifts)}</Text>
                    <Text style={ls.liveStatChipLabel}>Gift</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* ── Chat overlay — kiri bawah (FlatList auto-scroll) ─────────── */}
              <View style={ls.chatOverlay} pointerEvents="box-none">
                <FlatList
                  ref={chatListRef}
                  data={chatMessages}
                  keyExtractor={m => m.id}
                  renderItem={({ item: msg }) => (
                    <View style={[ls.chatBubble, msg.isSystem && ls.chatBubbleSystem]}>
                      <Text style={[ls.chatUser, { color: msg.color }]}>{msg.user} </Text>
                      <Text style={ls.chatText}>{msg.text}</Text>
                    </View>
                  )}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={false}
                  contentContainerStyle={{ gap: 4 }}
                  onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
                  ListEmptyComponent={null}
                  removeClippedSubviews
                />
              </View>

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

                    {/* Gift */}
                    <TouchableOpacity activeOpacity={0.8}>
                      <LinearGradient
                        colors={['#F06292', '#C62828']}
                        style={ls.toolbarPill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <Ionicons name="gift-outline" size={19} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* PK Battle */}
                    <TouchableOpacity activeOpacity={0.8}>
                      <Image
                        source={require('../assets/images/pk_icon.png')}
                        style={{ width: 36, height: 36, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>

                    {/* More / Settings */}
                    <TouchableOpacity activeOpacity={0.8} onPress={() => openHostMenu('main')}>
                      <LinearGradient
                        colors={['#7C3AED', '#4C1D95']}
                        style={ls.toolbarPill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <MaterialCommunityIcons name="dots-grid" size={19} color="#fff" />
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
                { icon: 'diamond-stone', label: 'Total Gift',       value: `${fmtNum(totalGifts)} koin` },
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

      {/* ═══ HOST MENU MODAL ══════════════════════════════════════════════════ */}
      <Modal
        transparent
        visible={hostMenuVisible}
        animationType="slide"
        onRequestClose={() => { setHostMenuVisible(false); setHostMenuTab('main'); }}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={hm.backdrop}
          activeOpacity={1}
          onPress={() => { setHostMenuVisible(false); setHostMenuTab('main'); }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={hm.sheet}>
          {/* Handle bar */}
          <View style={hm.handle} />

          {/* Header */}
          <View style={hm.headerRow}>
            {hostMenuTab !== 'main' ? (
              <TouchableOpacity onPress={() => setHostMenuTab('main')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
            ) : <View style={{ width: 28 }} />}
            <Text style={hm.headerTitle}>
              {hostMenuTab === 'main'        ? 'Menu Host'
               : hostMenuTab === 'kick'     ? 'Kick User'
               : hostMenuTab === 'block'    ? 'Block User'
               : hostMenuTab === 'beauty'   ? 'Filter Beauty'
               :                              'List Blokir'}
            </Text>
            <TouchableOpacity
              onPress={() => { setHostMenuVisible(false); setHostMenuTab('main'); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* ── MAIN MENU ── */}
          {hostMenuTab === 'main' && (
            <ScrollView contentContainerStyle={hm.mainContent} keyboardShouldPersistTaps="handled">

              {/* Filters row */}
              <Text style={hm.sectionLabel}>Filter Kamera</Text>
              <View style={hm.card}>
                {/* Beauty Filter — tap to open settings page */}
                <TouchableOpacity style={hm.filterRow} onPress={() => setHostMenuTab('beauty')} activeOpacity={0.8}>
                  <View style={hm.filterLeft}>
                    <LinearGradient colors={['#F06292', '#E91E8C']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <MaterialCommunityIcons name="face-woman-shimmer" size={18} color="#fff" />
                    </LinearGradient>
                    <View>
                      <Text style={hm.filterTitle}>Filter Beauty</Text>
                      <Text style={hm.filterSubtitle}>
                        {beautyEnabled ? 'Aktif · Sesuaikan efek wajah' : 'Halus, cerah & tipiskan wajah'}
                      </Text>
                    </View>
                  </View>
                  <View style={hm.beautyRowRight}>
                    {beautyEnabled && <View style={hm.beautyActiveDot} />}
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                  </View>
                </TouchableOpacity>

                <View style={hm.divider} />

                {/* Comal Filter */}
                <View style={hm.filterRow}>
                  <View style={hm.filterLeft}>
                    <LinearGradient colors={['#FFB800', '#FF6D00']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <MaterialCommunityIcons name="star-face" size={18} color="#fff" />
                    </LinearGradient>
                    <View>
                      <Text style={hm.filterTitle}>Comal</Text>
                      <Text style={hm.filterSubtitle}>Efek imut & menggemaskan</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[hm.toggle, comalFilter && hm.toggleOn]}
                    onPress={() => setComalFilter(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={[hm.toggleThumb, comalFilter && hm.toggleThumbOn]} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Announcement */}
              <Text style={hm.sectionLabel}>Teks Pengumuman</Text>
              <View style={hm.card}>
                <View style={hm.announceLeft}>
                  <LinearGradient colors={['#26C6DA', '#0097A7']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="bullhorn" size={18} color="#fff" />
                  </LinearGradient>
                  <Text style={hm.filterTitle}>Kirim pengumuman ke semua penonton</Text>
                </View>
                <View style={hm.announceInputRow}>
                  <TextInput
                    ref={announceInputRef}
                    style={hm.announceInput}
                    value={announceText}
                    onChangeText={setAnnounceText}
                    placeholder="Contoh: Brb ke toilet 5 menit..."
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    maxLength={120}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={handleSendAnnouncement}
                  />
                  <TouchableOpacity
                    style={[hm.announceSendBtn, (!announceText.trim() || announceLoading) && { opacity: 0.45 }]}
                    onPress={handleSendAnnouncement}
                    disabled={!announceText.trim() || announceLoading}
                    activeOpacity={0.8}
                  >
                    {announceLoading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Ionicons name="send" size={16} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>

              {/* User management */}
              <Text style={hm.sectionLabel}>Manajemen Penonton</Text>
              <View style={hm.card}>
                {/* Kick */}
                <TouchableOpacity style={hm.menuItem} onPress={() => openHostMenu('kick')} activeOpacity={0.8}>
                  <LinearGradient colors={['#EF5350', '#B71C1C']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="account-remove" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={hm.filterTitle}>Kick User</Text>
                    <Text style={hm.filterSubtitle}>Keluarkan penonton dari room</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>

                <View style={hm.divider} />

                {/* Block */}
                <TouchableOpacity style={hm.menuItem} onPress={() => openHostMenu('block')} activeOpacity={0.8}>
                  <LinearGradient colors={['#7C3AED', '#4C1D95']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="account-cancel" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={hm.filterTitle}>Block User</Text>
                    <Text style={hm.filterSubtitle}>Blokir — tidak bisa masuk lagi</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>

                <View style={hm.divider} />

                {/* Block list */}
                <TouchableOpacity style={hm.menuItem} onPress={() => openHostMenu('blocklist')} activeOpacity={0.8}>
                  <LinearGradient colors={['#455A64', '#263238']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <MaterialCommunityIcons name="account-multiple-remove" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={hm.filterTitle}>List Blokir</Text>
                    <Text style={hm.filterSubtitle}>Lihat & buka blokir penonton</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          )}

          {/* ── KICK / BLOCK VIEWER LIST ── */}
          {(hostMenuTab === 'kick' || hostMenuTab === 'block') && (
            <View style={{ flex: 1 }}>
              {viewersLoading ? (
                <View style={hm.emptyState}>
                  <ActivityIndicator color={P_HOT} size="large" />
                  <Text style={hm.emptyTxt}>Memuat daftar penonton...</Text>
                </View>
              ) : viewers.length === 0 ? (
                <View style={hm.emptyState}>
                  <MaterialCommunityIcons name="account-group-outline" size={52} color="rgba(255,255,255,0.35)" />
                  <Text style={hm.emptyTxt}>Tidak ada penonton aktif</Text>
                </View>
              ) : (
                <FlatList
                  data={viewers}
                  keyExtractor={v => v.userId}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  renderItem={({ item }) => (
                    <View style={hm.userRow}>
                      <View style={hm.userAvatar}>
                        {item.avatarUrl
                          ? <Image source={{ uri: item.avatarUrl }} style={hm.userAvatarImg} />
                          : <MaterialCommunityIcons name="account-circle" size={40} color={TXT_MID} />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hm.userName} numberOfLines={1}>
                          {item.displayName ?? item.username}
                        </Text>
                        <Text style={hm.userSub} numberOfLines={1}>@{item.username}</Text>
                      </View>
                      <TouchableOpacity
                        style={[hm.actionBtn, hostMenuTab === 'kick' ? hm.actionBtnKick : hm.actionBtnBlock]}
                        onPress={() => hostMenuTab === 'kick' ? handleKick(item) : handleBlock(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={hm.actionBtnTxt}>
                          {hostMenuTab === 'kick' ? 'Kick' : 'Blokir'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </View>
          )}

          {/* ── BLOCK LIST ── */}
          {hostMenuTab === 'blocklist' && (
            <View style={{ flex: 1 }}>
              {blocksLoading ? (
                <View style={hm.emptyState}>
                  <ActivityIndicator color={P_HOT} size="large" />
                  <Text style={hm.emptyTxt}>Memuat daftar blokir...</Text>
                </View>
              ) : blocks.length === 0 ? (
                <View style={hm.emptyState}>
                  <MaterialCommunityIcons name="shield-check-outline" size={52} color="rgba(255,255,255,0.35)" />
                  <Text style={hm.emptyTxt}>Tidak ada penonton yang diblokir</Text>
                </View>
              ) : (
                <FlatList
                  data={blocks}
                  keyExtractor={b => b.userId}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  renderItem={({ item }) => (
                    <View style={hm.userRow}>
                      <View style={hm.userAvatar}>
                        {item.avatarUrl
                          ? <Image source={{ uri: item.avatarUrl }} style={hm.userAvatarImg} />
                          : <MaterialCommunityIcons name="account-circle" size={40} color={TXT_MID} />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hm.userName} numberOfLines={1}>
                          {item.displayName ?? item.username}
                        </Text>
                        <Text style={hm.userSub} numberOfLines={1}>@{item.username}</Text>
                      </View>
                      <TouchableOpacity
                        style={[hm.actionBtn, hm.actionBtnUnblock]}
                        onPress={() => handleUnblock(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={hm.actionBtnTxt}>Buka</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </View>
          )}
          {/* ── BEAUTY SETTINGS PAGE ── */}
          {hostMenuTab === 'beauty' && (
            <ScrollView contentContainerStyle={hm.beautyContent} showsVerticalScrollIndicator={false}>

              {/* Master on/off */}
              <View style={hm.card}>
                <View style={hm.filterRow}>
                  <View style={hm.filterLeft}>
                    <LinearGradient colors={['#F06292', '#E91E8C']} style={hm.filterIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <MaterialCommunityIcons name="face-woman-shimmer" size={18} color="#fff" />
                    </LinearGradient>
                    <View>
                      <Text style={hm.filterTitle}>Filter Beauty</Text>
                      <Text style={hm.filterSubtitle}>{beautyEnabled ? 'Aktif' : 'Nonaktif'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[hm.toggle, beautyEnabled && hm.toggleOn]}
                    onPress={() => setBeautyEnabled(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={[hm.toggleThumb, beautyEnabled && hm.toggleThumbOn]} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sliders — dimmed when disabled */}
              <View style={[hm.beautySliderCard, !beautyEnabled && hm.beautyCardDimmed]}>

                {/* Kulit Halus */}
                <Text style={hm.beautySliderLabel}>KULIT HALUS</Text>
                <View style={hm.beautySliderRow}>
                  <MaterialCommunityIcons name="shimmer" size={16} color="#F48FB1" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautySmooth}
                    onValueChange={setBeautySmooth}
                    minimumTrackTintColor="#E91E8C"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#F06292"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautySmooth}</Text>
                </View>

                <View style={hm.divider} />

                {/* Cerahkan Kulit */}
                <Text style={hm.beautySliderLabel}>CERAHKAN KULIT</Text>
                <View style={hm.beautySliderRow}>
                  <MaterialCommunityIcons name="white-balance-sunny" size={16} color="#FFD54F" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautyBright}
                    onValueChange={setBeautyBright}
                    minimumTrackTintColor="#FFB300"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#FFD54F"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautyBright}</Text>
                </View>

                <View style={hm.divider} />

                {/* Tipiskan Wajah */}
                <Text style={hm.beautySliderLabel}>TIPISKAN WAJAH</Text>
                <View style={hm.beautySliderRow}>
                  <MaterialCommunityIcons name="face-man-outline" size={16} color="#CE93D8" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautySlimFace}
                    onValueChange={setBeautySlimFace}
                    minimumTrackTintColor="#9C27B0"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#CE93D8"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautySlimFace}</Text>
                </View>

                <View style={hm.divider} />

                {/* Tipiskan Dagu */}
                <Text style={hm.beautySliderLabel}>TIPISKAN DAGU</Text>
                <View style={hm.beautySliderRow}>
                  <MaterialCommunityIcons name="face-recognition" size={16} color="#80DEEA" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautyChin}
                    onValueChange={setBeautyChin}
                    minimumTrackTintColor="#00ACC1"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#80DEEA"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautyChin}</Text>
                </View>

                <View style={hm.divider} />

                {/* Perbesar Mata */}
                <Text style={hm.beautySliderLabel}>PERBESAR MATA</Text>
                <View style={hm.beautySliderRow}>
                  <Ionicons name="eye-outline" size={16} color="#A5D6A7" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautyEyes}
                    onValueChange={setBeautyEyes}
                    minimumTrackTintColor="#43A047"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#A5D6A7"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautyEyes}</Text>
                </View>

                <View style={hm.divider} />

                {/* Kemerahan */}
                <Text style={hm.beautySliderLabel}>KEMERAHAN PIPI</Text>
                <View style={hm.beautySliderRow}>
                  <MaterialCommunityIcons name="heart-outline" size={16} color="#EF9A9A" />
                  <Slider
                    style={hm.beautySlider}
                    minimumValue={0} maximumValue={100} step={1}
                    value={beautyRosiness}
                    onValueChange={setBeautyRosiness}
                    minimumTrackTintColor="#E53935"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#EF9A9A"
                    disabled={!beautyEnabled}
                  />
                  <Text style={hm.beautySliderVal}>{beautyRosiness}</Text>
                </View>
              </View>

              {/* Info note */}
              <View style={hm.beautyNote}>
                <MaterialCommunityIcons name="information-outline" size={14} color="rgba(255,255,255,0.35)" />
                <Text style={hm.beautyNoteTxt}>
                  Efek aktif saat kamera native tersedia (EAS Build). Nilai disimpan selama sesi live.
                </Text>
              </View>

              {/* Reset button */}
              <TouchableOpacity
                style={hm.beautyResetBtn}
                onPress={() => {
                  setBeautySmooth(60); setBeautyBright(40);
                  setBeautySlimFace(20); setBeautyChin(10);
                  setBeautyEyes(30); setBeautyRosiness(20);
                }}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name="refresh" size={15} color="rgba(255,255,255,0.55)" />
                <Text style={hm.beautyResetTxt}>Reset ke Default</Text>
              </TouchableOpacity>

              <View style={{ height: 28 }} />
            </ScrollView>
          )}

        </KeyboardAvoidingView>
      </Modal>

    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,10,60,0.45)' },

  fullSheet: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: WHITE,
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
    width: '100%', height: (SW - 36) * (9 / 16),
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
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  liveTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  viewerAvatarStack: { flexDirection: 'row', alignItems: 'center' },
  viewerAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  viewerCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  viewerCountTxt: { fontSize: 11, fontWeight: '700', color: WHITE },

  giftStatRow: { flexDirection: 'row', marginTop: 4 },

  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  liveDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF4444' },
  livePillTxt: { color: WHITE, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  liveTimerTxt: { fontSize: 18, fontWeight: '800', color: WHITE, fontVariant: ['tabular-nums'] as any },
  liveIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
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
    width: SW * 0.65,
    maxHeight: SH * 0.30,
  },
  chatBubble: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: 4,
  },
  chatBubbleSystem: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  chatUser:  { fontSize: 12, fontWeight: '800' },
  chatText:  { fontSize: 12, color: WHITE, flexShrink: 1 },

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
});

// ── Host Menu StyleSheet — Dark / translucent (Chinese app aesthetic) ──────────
const DK_BG      = '#0F0820';          // very dark purple-black
const DK_CARD    = 'rgba(255,255,255,0.07)';
const DK_BORDER  = 'rgba(255,255,255,0.10)';
const DK_DIVIDE  = 'rgba(255,255,255,0.07)';
const DK_TXT     = '#FFFFFF';
const DK_SUB     = 'rgba(255,255,255,0.50)';
const DK_LABEL   = 'rgba(255,255,255,0.38)';
const DK_TOGGLE  = 'rgba(255,255,255,0.14)';
const DK_INPUT   = 'rgba(255,255,255,0.09)';

const hm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: DK_BG,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    maxHeight: SH * 0.82,
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 }, elevation: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: DK_DIVIDE,
  },
  headerTitle: {
    fontSize: 16, fontWeight: '800', color: DK_TXT, letterSpacing: 0.2,
  },
  mainContent: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, gap: 4,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: DK_LABEL,
    letterSpacing: 1.3, textTransform: 'uppercase',
    marginTop: 14, marginBottom: 6, marginLeft: 2,
  },
  card: {
    backgroundColor: DK_CARD,
    borderRadius: 16, borderWidth: 1, borderColor: DK_BORDER,
    overflow: 'hidden',
  },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13, gap: 10,
  },
  filterLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1,
  },
  filterIconBg: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  filterTitle: {
    fontSize: 14, fontWeight: '700', color: DK_TXT,
  },
  filterSubtitle: {
    fontSize: 11, color: DK_SUB, marginTop: 2,
  },
  toggle: {
    width: 48, height: 27, borderRadius: 14,
    backgroundColor: DK_TOGGLE,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: P_HOT,
  },
  toggleThumb: {
    width: 21, height: 21, borderRadius: 11,
    backgroundColor: WHITE,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  divider: {
    height: 1, backgroundColor: DK_DIVIDE, marginHorizontal: 14,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  // Announcement
  announceLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingTop: 13, paddingBottom: 8,
  },
  announceInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 14, paddingBottom: 13,
  },
  announceInput: {
    flex: 1,
    backgroundColor: DK_INPUT,
    borderRadius: 12, borderWidth: 1, borderColor: DK_BORDER,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 13, color: DK_TXT,
    maxHeight: 80,
  },
  announceSendBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: P_HOT,
    alignItems: 'center', justifyContent: 'center',
  },
  // Viewer / block user rows
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40,
  },
  emptyTxt: {
    fontSize: 14, color: DK_SUB, fontWeight: '500', textAlign: 'center',
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: DK_CARD,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: DK_BORDER,
  },
  userAvatar: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarImg: { width: '100%', height: '100%' },
  userName: { fontSize: 14, fontWeight: '700', color: DK_TXT },
  userSub:  { fontSize: 11, color: DK_SUB, marginTop: 1 },
  actionBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
  },
  actionBtnKick:    { backgroundColor: '#EF5350' },
  actionBtnBlock:   { backgroundColor: '#7C3AED' },
  actionBtnUnblock: { backgroundColor: '#26C6DA' },
  actionBtnTxt: { fontSize: 12, fontWeight: '800', color: WHITE },

  // ── Beauty row indicator
  beautyRowRight: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  beautyActiveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#F06292',
  },

  // ── Beauty settings page
  beautyContent: {
    paddingHorizontal: 16, paddingTop: 12, gap: 12,
  },
  beautySliderCard: {
    backgroundColor: DK_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DK_BORDER,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  beautyCardDimmed: {
    opacity: 0.42,
  },
  beautySliderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: DK_LABEL,
    letterSpacing: 1.1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  beautySliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  beautySlider: {
    flex: 1,
    height: 36,
  },
  beautySliderVal: {
    width: 28,
    fontSize: 12,
    fontWeight: '800',
    color: DK_TXT,
    textAlign: 'right',
  },
  beautyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 4,
  },
  beautyNoteTxt: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(255,255,255,0.32)',
    lineHeight: 16,
  },
  beautyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DK_BORDER,
    backgroundColor: DK_CARD,
  },
  beautyResetTxt: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '600',
  },
});
