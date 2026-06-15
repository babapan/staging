import { useCallback, useEffect, useRef, useState } from 'react';
import GiftComboOverlay, { type GiftComboHandle } from './GiftComboOverlay';
import VipEntranceBanner from './VipEntranceBanner';
import type { VipJoinEntry } from './VipEntranceBanner';
import VipBadge, { VIP_BOX_COLORS } from './VipBadge';
import SoloGiftPickerSheet, { type SoloGiftSentInfo } from './SoloGiftPickerSheet';
import SoloGiftEffectLayer, { type SoloGiftEffectHandle } from './SoloGiftEffectLayer';
import {
  Animated, Dimensions, Easing, FlatList, Image, Keyboard,
  Modal, PanResponder, StyleSheet, Text, TextInput, TouchableOpacity,
  View, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  joinStream, leaveStream, sendGift, getLiveStreamDetail, getLiveAdmins,
  getLiveSoloToken, getKomalState, getKomalToken, joinKomalSeat, leaveKomalSeat,
  getLiveViewers,
  type LiveStream, type KomalSeat, type LiveViewer,
} from '../services/liveService';
import {
  connectSoloLiveKit, disconnectSoloLiveKit,
} from '../services/soloLiveKitService';
import {
  connectKomalAudio, disconnectKomalAudio, muteKomalAudio, unmuteKomalAudio,
} from '../services/komalAudioService';
import { WS_URL, API_BASE } from '../config/connection';
import { getAuthToken } from '../services/storage';
import BannerMarqueeText from './BannerMarqueeText';
import LiveViewerListModal from './LiveViewerListModal';
import KomalSeatsPanel from './KomalSeatsPanel';
import ViewProfileModal from './ViewProfileModal';

const ANNOUNCE_BANNER = require('../assets/images/announce_banner.png');

const { width: SW, height: SH } = Dimensions.get('window');

const PINK   = '#EC4899';
const ROSE   = '#BE185D';
const DARK   = '#0D0010';

// ── Level badge (same pill style as host modal) ───────────────────────────────
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

// ── Gift catalogue ────────────────────────────────────────────────────────────
const GIFTS = [
  { id: 'rose',     emoji: '🌹', label: 'Rose',     coins: 10   },
  { id: 'heart',    emoji: '💖', label: 'Heart',    coins: 50   },
  { id: 'crown',    emoji: '👑', label: 'Crown',    coins: 100  },
  { id: 'diamond',  emoji: '💎', label: 'Diamond',  coins: 500  },
  { id: 'rocket',   emoji: '🚀', label: 'Rocket',   coins: 1000 },
  { id: 'galaxy',   emoji: '🌌', label: 'Galaxy',   coins: 5000 },
];

// ── Chat message type ─────────────────────────────────────────────────────────
interface ChatMsg {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  text: string;
  type: 'chat' | 'join' | 'gift' | 'announcement';
  giftEmoji?: string;
  giftCoins?: number;
  migLevel?: number;
  vipLevel?: number;
  agencyBadge?: string;
  isAdmin?: boolean;
  isHost?: boolean;
  senderUsername?: string;
}

// ── Floating gift notification ────────────────────────────────────────────────
interface FloatNotif {
  id: string;
  emoji: string;
  label: string;
  username: string;
  coins: number;
  anim: Animated.Value;
  opacity: Animated.Value;
  translateX: Animated.Value;
}

interface Props {
  visible: boolean;
  stream: LiveStream | null;
  currentUser: { username: string; displayName?: string | null } | null;
  onClose: () => void;
}

// ── Bouncing dots indicator ───────────────────────────────────────────────────
function BouncingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(dot, { toValue: -10, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,   duration: 320, useNativeDriver: true }),
          Animated.delay((dots.length - 1 - i) * 140),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 7, marginTop: 8, alignItems: 'center' }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 9, height: 9, borderRadius: 4.5,
            backgroundColor: '#FF6B9D',
            transform: [{ translateY: dot }],
            opacity: 0.5 + i * 0.25,
          }}
        />
      ))}
    </View>
  );
}

// ── Floating notification component ──────────────────────────────────────────
function FloatBanner({ notif }: { notif: FloatNotif }) {
  return (
    <Animated.View style={[
      fst.floatBanner,
      {
        transform: [
          { translateY: notif.anim },
          { translateX: notif.translateX },
        ],
        opacity: notif.opacity,
      },
    ]}>
      <Text style={fst.floatEmoji}>{notif.emoji}</Text>
      <View style={fst.floatTextCol}>
        <Text style={fst.floatUsername} numberOfLines={1}>{notif.username}</Text>
        <Text style={fst.floatLabel}>sent {notif.label}  •  {notif.coins} koin</Text>
      </View>
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveSoloViewerModal({ visible, stream, currentUser, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [liveData,   setLiveData]   = useState<LiveStream | null>(stream);
  const [chatMsgs,   setChatMsgs]   = useState<ChatMsg[]>([]);
  const [floatNotifs, setFloatNotifs] = useState<FloatNotif[]>([]);
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [sending,    setSending]    = useState<string | null>(null);
  const giftEffectRef    = useRef<SoloGiftEffectHandle>(null);
  const comboOverlayRef  = useRef<GiftComboHandle>(null);
  const [chatInput,  setChatInput]  = useState('');
  const [joined,        setJoined]        = useState(false);
  const [isBlocked,     setIsBlocked]     = useState(false);
  const [isFollowing,   setIsFollowing]   = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // ── Viewer avatar list (max 8 for top-bar display) ───────────────────────
  const [viewerList, setViewerList] = useState<LiveViewer[]>([]);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [showViewerList, setShowViewerList] = useState(false);

  // ── VIP entrance banner queue ─────────────────────────────────────────────
  const vipQueueRef   = useRef<VipJoinEntry[]>([]);
  const vipShowingRef = useRef(false);


  // ── LiveKit remote video track (viewer side) ──────────────────────────────
  const [lkVideoTrack, setLkVideoTrack] = useState<any>(null);

  // ── Komal seats ───────────────────────────────────────────────────────────
  const [komalActive,     setKomalActive]     = useState(false);
  const [komalSeats,      setKomalSeats]      = useState<KomalSeat[]>([]);
  const [myKomalSeat,     setMyKomalSeat]     = useState<number | null>(null);
  const [komalLoading,    setKomalLoading]    = useState(false);
  const [komalHandRaised, setKomalHandRaised] = useState(false);
  const [komalRejected,   setKomalRejected]   = useState(false);
  const myKomalSeatRef = useRef<number | null>(null);
  useEffect(() => { myKomalSeatRef.current = myKomalSeat; }, [myKomalSeat]);

  // Called after host approves — connects audio to the assigned seat
  const connectKomalApproved = async (sid: string, seatNum: number) => {
    const tokenInfo = await getKomalToken(sid);
    if (!tokenInfo) return;
    disconnectSoloLiveKit();
    setLkVideoTrack(null);
    setMyKomalSeat(seatNum);
    await connectKomalAudio(
      tokenInfo.url,
      tokenInfo.token,
      (track) => setLkVideoTrack(track ?? null),
      () => {
        setMyKomalSeat(null);
        disconnectKomalAudio();
        getLiveSoloToken(sid).then(t => {
          if (t?.url && t?.token) {
            connectSoloLiveKit(t.url, t.token, false,
              (tr: any) => setLkVideoTrack(tr ?? null),
              undefined, undefined);
          }
        });
      },
    );
  };

  // Viewer taps "+" — langsung join seat tanpa perlu approval host
  const handleJoinKomalSeat = async (seatNum: number) => {
    if (!stream?.id || komalLoading || myKomalSeat !== null) return;
    setKomalLoading(true);
    try {
      const res = await joinKomalSeat(stream.id, seatNum);
      if (res.ok) {
        setKomalSeats(res.seats);
        await connectKomalApproved(stream.id, seatNum);
      }
    } finally {
      setKomalLoading(false);
    }
  };

  const handleLeaveKomalSeat = async (seatNum: number) => {
    if (!stream?.id) return;
    setMyKomalSeat(null);
    await leaveKomalSeat(stream.id, seatNum);
    disconnectKomalAudio();
    setLkVideoTrack(null);
    const tokenInfo = await getLiveSoloToken(stream.id);
    if (tokenInfo?.url && tokenInfo?.token) {
      connectSoloLiveKit(tokenInfo.url, tokenInfo.token, false,
        (track) => setLkVideoTrack(track ?? null),
        undefined, undefined);
    }
  };

  // ── Announce banner (persistent bunny banner, top-right) ──────────────────
  const [activeBannerText, setActiveBannerText] = useState<string | null>(null);
  const bannerSlide = useRef(new Animated.Value(220)).current;

  const showFloatingAnnounce = useCallback((text: string) => {
    setActiveBannerText(text);
    bannerSlide.setValue(220);
    Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [bannerSlide]);

  const clearBanner = useCallback(() => {
    Animated.timing(bannerSlide, { toValue: 220, duration: 240, useNativeDriver: true })
      .start(() => setActiveBannerText(null));
  }, [bannerSlide]);

  const flatRef       = useRef<FlatList>(null);
  const inputRef      = useRef<TextInput>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAtBottomRef = useRef(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const slideUp  = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  // ── Live Ended overlay ────────────────────────────────────────────────────
  const [liveEnded,      setLiveEnded]      = useState(false);
  const liveEndedOpacity = useRef(new Animated.Value(0)).current;

  const showLiveEnded = useCallback(() => {
    setLiveEnded(true);
    Animated.timing(liveEndedOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start(() => {
      setTimeout(() => onCloseRef.current(), 2800);
    });
  }, [liveEndedOpacity]);

  // ── Host away overlay ─────────────────────────────────────────────────────
  const [hostAway, setHostAway] = useState(false);
  const hostAwayOpacity = useRef(new Animated.Value(0)).current;

  const showHostAway = useCallback(() => {
    setHostAway(true);
    Animated.timing(hostAwayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [hostAwayOpacity]);

  const hideHostAway = useCallback(() => {
    Animated.timing(hostAwayOpacity, { toValue: 0, duration: 350, useNativeDriver: true })
      .start(() => setHostAway(false));
  }, [hostAwayOpacity]);

  // Stable refs agar tidak perlu re-create connectViewerWS saat prop berubah
  const currentUserRef    = useRef(currentUser);
  const onCloseRef        = useRef(onClose);
  const adminUsernamesRef = useRef<Set<string>>(new Set());
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const sid = stream?.id;
    if (!sid) return;
    getLiveAdmins(sid).then(list => {
      adminUsernamesRef.current = new Set(list.map(a => a.username));
    }).catch(() => {});
  }, [stream?.id]);

  // ── WebSocket (viewer) ────────────────────────────────────────────────────
  const vwsRef       = useRef<WebSocket | null>(null);
  const vwsActiveRef = useRef(false);
  const vPingRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const disconnectViewerWS = useCallback(() => {
    vwsActiveRef.current = false;
    if (vPingRef.current) { clearInterval(vPingRef.current); vPingRef.current = null; }
    if (vwsRef.current) { try { vwsRef.current.close(); } catch {} vwsRef.current = null; }
  }, []);

  const connectViewerWS = useCallback(async (sid: string) => {
    disconnectViewerWS();
    vwsActiveRef.current = true;
    const roomId    = `livesolo-${sid}`;
    const authToken = await getAuthToken();

    const ws = new WebSocket(WS_URL);
    vwsRef.current = ws;

    ws.onmessage = (e) => {
      if (!vwsActiveRef.current) return;
      try {
        const p = JSON.parse(e.data);
        if (p.type === 'WELCOME') {
          if (authToken) ws.send(JSON.stringify({ type: 'AUTH', token: authToken }));
          return;
        }
        if (p.type === 'AUTH_OK') {
          ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId }));
          vPingRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
          }, 25_000);
          return;
        }
        if (p.type === 'LIVE_END' && p.streamId === sid) {
          vwsActiveRef.current = false;
          showLiveEnded();
          return;
        }
        if (p.type === 'LIVE_KICK' && p.streamId === sid) {
          const myUsername = currentUserRef.current?.username ?? '';
          if (myUsername && p.username?.toLowerCase() === myUsername.toLowerCase()) {
            vwsActiveRef.current = false;
            onCloseRef.current();
            return;
          }
        }
        if (p.type === 'LUCKY_MILESTONE' && p.streamId === sid) {
          const myUsername = currentUserRef.current?.username ?? '';
          // Aggregate total coins dari semua drops dalam satu batch
          const drops     = (p.milestones ?? []) as { milestone: number; rewardCoins: number }[];
          const totalDrop = drops.reduce((s, h) => s + h.rewardCoins, 0);
          const isCycle   = drops[0]?.milestone === 500;
          const dropCount = drops.length;

          const topMs = drops[drops.length - 1]?.milestone ?? 0;
          const icon  = topMs === 500 ? '🎊' : topMs === 200 ? '🎉' : '💥';

          if (myUsername && p.senderUsername === myUsername) {
            const label =
              topMs === 500 ? `Jackpot ${dropCount > 1 ? `×${dropCount} drops` : ''} — +${totalDrop.toLocaleString()} koin` :
              topMs === 200 ? `200× GET! +${totalDrop.toLocaleString()} koin` :
                              `100× GET! +${totalDrop.toLocaleString()} koin`;
            launchFloatNotif(icon, label, myUsername, totalDrop);
          } else {
            const label =
              topMs === 500 ? `${p.senderUsername} Jackpot!` :
              topMs === 200 ? `${p.senderUsername} 200× GET!` :
                              `${p.senderUsername} 100× GET!`;
            launchFloatNotif(icon, label, p.senderUsername ?? 'Viewer', totalDrop);
          }
          return;
        }
        if (p.type === 'MESSAGE' && p.roomId === roomId && p.message) {
          const text: string = p.message.text ?? '';
          if (text.trim() === '<< HOST_AWAY >>') { showHostAway(); return; }
          if (text.trim() === '<< HOST_BACK >>') { hideHostAway(); return; }
          // ── Host room announcement ───────────────────────────────────────
          if (text.trim() === '<<ANNOUNCE_CLEAR>>') {
            clearBanner();
            return;
          }
          const announceMatch = text.match(/^<<ANNOUNCE:(.+)>>$/s);
          if (announceMatch) {
            showFloatingAnnounce(announceMatch[1].trim());
            return;
          }
          if (text.trimStart().startsWith('<<') && text.trimEnd().endsWith('>>')) return;
          if (!p.message.isSystem) {
            const myUser = currentUserRef.current?.username ?? '';
            if (myUser && p.message.senderUsername === myUser) return;
            pushChat({
              type:           'chat',
              username:       p.message.senderUsername ?? 'Viewer',
              displayName:    p.message.senderDisplayName ?? null,
              avatarUrl:      p.message.senderAvatarUrl ?? null,
              senderUsername: p.message.senderUsername ?? undefined,
              text,
              migLevel:       p.message.senderMigLevel ?? undefined,
              vipLevel:       (p.message as any).senderVipLevel ?? undefined,
              agencyBadge:    p.message.senderAgencyName ?? undefined,
              isAdmin:        p.message.senderUsername
                                ? adminUsernamesRef.current.has(p.message.senderUsername)
                                : false,
            });
          }
          return;
        }
        if (p.type === 'LIVE_GIFT' && p.streamId === sid) {
          // Skip own gift — handleGiftSent already added the chat message + totalGifts update
          if (p.senderUsername && p.senderUsername === currentUser?.username) return;
          pushChat({ type: 'gift', username: p.senderUsername ?? 'Viewer', displayName: p.senderDisplayName ?? p.senderUsername ?? 'Viewer', text: `mengirim ${p.giftName} (${p.amountCoins} koin)`, giftEmoji: '🎁', giftCoins: p.amountCoins });
          setLiveData(d => d ? { ...d, totalGifts: (d.totalGifts ?? 0) + (p.amountCoins ?? 0) } : d);
          return;
        }
        if (p.type === 'LIVE_JOIN' && p.streamId === sid) {
          const jid   = `${Date.now()}-${Math.random()}`;
          const jName = p.displayName ?? p.username ?? 'Viewer';
          setChatMsgs(prev => [...prev.slice(-79), { id: jid, type: 'join', username: jName, text: 'bergabung ke live' }]);
          if (isAtBottomRef.current) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
          setTimeout(() => setChatMsgs(prev => prev.filter(m => m.id !== jid)), 3000);
          if (p.username) {
            setViewerList(prev => {
              const filtered = prev.filter(v => v.username !== p.username);
              return [{ username: p.username!, displayName: jName, avatarUrl: p.avatarUrl ?? null }, ...filtered].slice(0, 8);
            });
          }
          const vLvl     = Number(p.vipLevel ?? 0);
          const hasTopup = !!p.hasTopup;
          if (vLvl >= 1) {
            // VIP entrance banner — tidak diubah
            vipQueueRef.current.push({ id: jid + 'v', displayName: jName, avatarUrl: p.avatarUrl ?? null, vipLevel: vLvl, mode: 'vip' });
            if (!(vipQueueRef as any).__showNext) return;
            if (!vipShowingRef.current) (vipQueueRef as any).__showNext();
          } else if (hasTopup) {
            // Topup pill banner — untuk non-VIP yang sudah pernah top-up
            vipQueueRef.current.push({ id: jid + 't', displayName: jName, avatarUrl: p.avatarUrl ?? null, vipLevel: 0, hasTopup: true, mode: 'topup' });
            if (!(vipQueueRef as any).__showNext) return;
            if (!vipShowingRef.current) (vipQueueRef as any).__showNext();
          }
          return;
        }
        if (p.type === 'LIVE_ANNOUNCEMENT') {
          if (p.text?.trim()) {
            pushChat({ type: 'announcement', username: '', text: p.text });
          }
          return;
        }

        // ── Komal seat updates ─────────────────────────────────────────────
        if (p.type === 'KOMAL_ACTIVATED' && p.streamId === sid) {
          setKomalActive(true);
          getKomalState(sid).then(s => setKomalSeats(s.seats)).catch(() => {});
          return;
        }
        if (p.type === 'KOMAL_DEACTIVATED' && p.streamId === sid) {
          setKomalActive(false);
          setKomalSeats([]);
          setKomalHandRaised(false);
          if (myKomalSeatRef.current !== null) {
            setMyKomalSeat(null);
            disconnectKomalAudio().then(() => {
              getLiveSoloToken(sid).then(t => {
                if (t?.url && t?.token) {
                  connectSoloLiveKit(t.url, t.token, false,
                    (tr: any) => setLkVideoTrack(tr ?? null),
                    undefined, undefined);
                }
              });
            });
          }
          return;
        }
        if (p.type === 'KOMAL_UPDATE' && p.streamId === sid && Array.isArray(p.seats)) {
          setKomalSeats(p.seats);
          const mySeat = myKomalSeatRef.current;
          if (mySeat !== null) {
            const myRow = (p.seats as KomalSeat[]).find(s => s.seatNum === mySeat);
            if (myRow) {
              if (myRow.isMuted) muteKomalAudio();
              else unmuteKomalAudio();
            }
            if (p.event === 'LEAVE' && p.seatNum === mySeat) {
              setMyKomalSeat(null);
              disconnectKomalAudio().then(() => {
                getLiveSoloToken(sid).then(t => {
                  if (t?.url && t?.token) {
                    connectSoloLiveKit(t.url, t.token, false,
                      (tr: any) => setLkVideoTrack(tr ?? null),
                      undefined, undefined);
                  }
                });
              });
            }
          }
          return;
        }
        if (p.type === 'KOMAL_HAND_RAISE_APPROVED' && p.streamId === sid) {
          const myUsername = currentUserRef.current?.username;
          if (myUsername && p.username?.toLowerCase() === myUsername.toLowerCase()) {
            setKomalHandRaised(false);
            connectKomalApproved(sid, p.seatNum as number).catch(() => {});
          }
          return;
        }
        if (p.type === 'KOMAL_HAND_RAISE_REJECTED' && p.streamId === sid) {
          const myUsername = currentUserRef.current?.username;
          if (myUsername && p.username?.toLowerCase() === myUsername.toLowerCase()) {
            setKomalHandRaised(false);
            setKomalRejected(true);
            setTimeout(() => setKomalRejected(false), 3000);
          }
          return;
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!vwsActiveRef.current) return;
      setTimeout(() => { if (vwsActiveRef.current && sid) connectViewerWS(sid); }, 3000);
    };
  }, [disconnectViewerWS, showHostAway, hideHostAway, showLiveEnded]);

  useEffect(() => {
    if (visible && stream?.id) {
      connectViewerWS(stream.id);
    } else {
      disconnectViewerWS();
      hideHostAway();
    }
    return () => disconnectViewerWS();
  }, [visible, stream?.id]);


  // ── Keyboard height — persis pola host modal ─────────────────────────────
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Swipe-to-hide UI (swipe kanan = bersih, swipe kiri = balik) ───────────
  const uiSlideX  = useRef(new Animated.Value(0)).current;
  const uiHiddenRef = useRef(false);

  const viewerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (!uiHiddenRef.current && g.dx > 0) uiSlideX.setValue(g.dx);
        if ( uiHiddenRef.current && g.dx < 0) uiSlideX.setValue(SW + g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (!uiHiddenRef.current) {
          if (g.dx > SW * 0.28) {
            uiHiddenRef.current = true;
            Animated.spring(uiSlideX, { toValue: SW, useNativeDriver: true, tension: 65, friction: 13 }).start();
          } else {
            Animated.spring(uiSlideX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start();
          }
        } else {
          if (g.dx < -(SW * 0.22)) {
            uiHiddenRef.current = false;
            Animated.spring(uiSlideX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 13 }).start();
          } else {
            Animated.spring(uiSlideX, { toValue: SW, useNativeDriver: true, tension: 65, friction: 13 }).start();
          }
        }
      },
    })
  ).current;

  // ── sync stream prop ─────────────────────────────────────────────────────
  useEffect(() => { setLiveData(stream); }, [stream]);

  // ── enter/exit animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideUp,   { toValue: 0,  useNativeDriver: true, tension: 55, friction: 11 }),
        Animated.timing(bgOpacity, { toValue: 1,  duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideUp,   { toValue: SH, duration: 280, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,  duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Connect LiveKit sebagai viewer → subscribe remote video ─────────────
  useEffect(() => {
    if (!visible || !stream?.id) return;
    let cancelled = false;
    (async () => {
      const tokenInfo = await getLiveSoloToken(stream.id);
      if (cancelled || !tokenInfo?.url || !tokenInfo?.token) return;
      await connectSoloLiveKit(
        tokenInfo.url,
        tokenInfo.token,
        false,
        (track) => { if (!cancelled) setLkVideoTrack(track ?? null); },
        undefined,
        undefined,
      );
    })();
    return () => {
      cancelled = true;
      disconnectSoloLiveKit();
      setLkVideoTrack(null);
    };
  }, [visible, stream?.id]);

  // ── follow status check ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !liveData?.hostUsername || !currentUser) return;
    if (currentUser.username === liveData.hostUsername) return; // own stream
    fetch(`${API_BASE}/api/users/${encodeURIComponent(liveData.hostUsername)}/follow`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsFollowing(d.following); })
      .catch(() => {});
  }, [visible, liveData?.hostUsername]);

  const handleFollowToggle = useCallback(async () => {
    if (!liveData?.hostUsername || followLoading) return;
    setFollowLoading(true);
    try {
      const method = isFollowing ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(liveData.hostUsername)}/follow`, {
        method, credentials: 'include',
      });
      if (res.ok) setIsFollowing(f => !f);
    } catch {}
    setFollowLoading(false);
  }, [liveData?.hostUsername, isFollowing, followLoading]);

  // ── join/leave stream ────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && stream?.id && !joined) {
      joinStream(stream.id).then(result => {
        if (result.blocked) {
          setIsBlocked(true);
          return;
        }
        setJoined(true);
        pushChat({ type: 'join', username: currentUser?.displayName ?? currentUser?.username ?? 'Kamu', text: 'bergabung ke stream' });
        getLiveViewers(stream.id!).then(list => setViewerList(list.slice(0, 8))).catch(() => {});
        getKomalState(stream.id!).then(ks => {
          setKomalActive(ks.active);
          setKomalSeats(ks.seats);
        }).catch(() => {});
        // Fetch active system announcement and display it as first chat message
        fetch(`${API_BASE}/api/live/announcement`)
          .then(r => r.json())
          .then(data => {
            if (data?.enabled && data?.text?.trim()) {
              pushChat({ type: 'announcement', username: '', text: data.text });
            }
          })
          .catch(() => { /* non-fatal */ });
      });
    }
    if (!visible) {
      if (joined && stream?.id) {
        if (myKomalSeat !== null) {
          leaveKomalSeat(stream.id, myKomalSeat).catch(() => {});
          disconnectKomalAudio().catch(() => {});
          setMyKomalSeat(null);
        }
        leaveStream(stream.id);
        setJoined(false);
      }
      setIsBlocked(false);
      setKomalActive(false);
      setKomalSeats([]);
    }
  }, [visible, stream?.id]);

  // ── poll stats ───────────────────────────────────────────────────────────
  const pollStats = useCallback(async () => {
    if (!stream?.id) return;
    const detail = await getLiveStreamDetail(stream.id);
    if (detail) setLiveData(d => d ? {
      ...d,
      viewerCount: Math.max(d.viewerCount ?? 0, detail.viewerCount ?? 0),
      totalGifts: detail.totalGifts ?? 0,
    } : d);
  }, [stream?.id]);

  useEffect(() => {
    if (visible && stream?.id) {
      pollRef.current = setInterval(pollStats, 8_000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [visible, stream?.id, pollStats]);

  // ── poll viewer list setiap 15s ──────────────────────────────────────────
  const viewerListPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (visible && stream?.id) {
      viewerListPollRef.current = setInterval(() => {
        getLiveViewers(stream.id!).then(list => {
          if (list.length > 0) setViewerList(list.slice(0, 8));
        }).catch(() => {});
      }, 15_000);
    } else {
      if (viewerListPollRef.current) clearInterval(viewerListPollRef.current);
    }
    return () => { if (viewerListPollRef.current) clearInterval(viewerListPollRef.current); };
  }, [visible, stream?.id]);

  // ── reset on close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setTimeout(() => {
        setChatMsgs([]);
        setFloatNotifs([]);
        setGiftSheetOpen(false);
        setChatInput('');
        setLiveEnded(false);
        setViewerList([]);
        liveEndedOpacity.setValue(0);
      }, 350);
    }
  }, [visible]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const pushChat = (msg: Omit<ChatMsg, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setChatMsgs(prev => [...prev.slice(-79), { ...msg, id }]);
    if (isAtBottomRef.current) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } else {
      setNewMsgCount(c => c + 1);
    }
  };

  const handleChatScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const atBottom = distFromBottom < 48;
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewMsgCount(0);
  };

  const scrollToLatest = () => {
    flatRef.current?.scrollToEnd({ animated: true });
    isAtBottomRef.current = true;
    setNewMsgCount(0);
  };

  const launchFloatNotif = (emoji: string, label: string, username: string, coins: number) => {
    const id        = `${Date.now()}-${Math.random()}`;
    const anim      = new Animated.Value(0);
    const opacity   = new Animated.Value(1);
    const translateX = new Animated.Value(0);

    const notif: FloatNotif = { id, emoji, label, username, anim, opacity, coins, translateX };
    setFloatNotifs(prev => [...prev.slice(-4), notif]);

    Animated.parallel([
      Animated.timing(anim, {
        toValue: -160,
        duration: 2200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1300),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(translateX, { toValue: 6,  duration: 120, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: -6, duration: 120, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 4,  duration: 100, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0,  duration: 80,  useNativeDriver: true }),
      ]),
    ]).start(() => {
      setFloatNotifs(prev => prev.filter(n => n.id !== id));
    });
  };

  const sendChatMsg = () => {
    const text = chatInput.trim();
    if (!text || !stream?.id) return;
    const roomId = `livesolo-${stream.id}`;
    if (vwsRef.current?.readyState === WebSocket.OPEN) {
      vwsRef.current.send(JSON.stringify({ type: 'SEND_MESSAGE', roomId, text }));
    }
    pushChat({ type: 'chat', username: currentUser?.username ?? 'Kamu', displayName: currentUser?.displayName ?? null, text });
    setChatInput('');
  };

  const handleSendGift = async (gift: typeof GIFTS[0]) => {
    if (!stream?.id || sending) return;
    setSending(gift.id);
    try {
      const result = await sendGift(stream.id, gift.label, gift.coins);
      if (result.ok) {
        pushChat({
          type: 'gift',
          username: currentUser?.displayName ?? currentUser?.username ?? 'Kamu',
          text: `mengirim ${gift.label} (${gift.coins} koin)`,
          giftEmoji: gift.emoji,
          giftCoins: gift.coins,
        });
        launchFloatNotif(gift.emoji, gift.label, currentUser?.displayName ?? currentUser?.username ?? 'Kamu', gift.coins);
        setLiveData(d => d ? { ...d, totalGifts: d.totalGifts + gift.coins } : d);
      } else {
        pushChat({ type: 'chat', username: '⚠️ Sistem', text: result.message ?? 'Gagal mengirim gift' });
      }
    } finally {
      setSending(null);
    }
  };

  const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`      : String(n);

  const handleGiftSent = useCallback((info: SoloGiftSentInfo) => {
    pushChat({
      type:      'gift',
      username:  currentUser?.displayName ?? currentUser?.username ?? 'Kamu',
      text:      `mengirim ${info.giftName} x${info.qty} (${(info.price * info.qty).toLocaleString()} koin)`,
      giftEmoji: info.giftEmoji,
      giftCoins: info.price * info.qty,
    });
    setLiveData(d => d ? { ...d, totalGifts: d.totalGifts + info.price * info.qty } : d);

    comboOverlayRef.current?.show({
      streamId:           String(stream?.id ?? ''),
      giftId:             info.giftId,
      giftName:           info.giftName,
      giftEmoji:          info.giftEmoji,
      giftImageUrl:       info.giftImageUrl ?? null,
      price:              info.price,
      senderDisplayName:  currentUser?.displayName ?? currentUser?.username ?? 'Kamu',
      senderAvatarUrl:    null,
      canTap:             true,
      category:           info.category,
      initialCombo:       info.qty,
    });

    if (!info.noEffect && (info.videoUrl || info.lottieUrl)) {
      giftEffectRef.current?.play({
        videoUrl:  info.videoUrl,
        lottieUrl: info.lottieUrl,
        category:  info.category,
      });
    }
  }, [currentUser, stream?.id]);

  const handleClose = () => {
    setGiftSheetOpen(false);
    onClose();
  };

  const hostInitial = (liveData?.hostDisplayName ?? liveData?.hostUsername ?? '?')[0].toUpperCase();

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={[st.backdrop, { opacity: bgOpacity }]} />

      <Animated.View style={[st.fullScreen, { transform: [{ translateY: slideUp }] }]} {...viewerPanResponder.panHandlers}>

        {/* ── Video / Hero area ── */}
        <View style={st.videoArea}>
          {/* LiveKit live video (EAS Build) — tampilkan kalau remote track sudah tersedia */}
          {lkVideoTrack
            ? (() => {
                try {
                  const { VideoView } = require('@livekit/react-native');
                  return (
                    <VideoView
                      videoTrack={lkVideoTrack}
                      style={StyleSheet.absoluteFill}
                      objectFit="cover"
                    />
                  );
                } catch {
                  return null;
                }
              })()
            : liveData?.thumbnailUrl || liveData?.hostAvatar
              ? <Image source={{ uri: (liveData.thumbnailUrl ?? liveData.hostAvatar)! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <LinearGradient colors={[ROSE + 'FF', PINK + 'AA', DARK]} style={StyleSheet.absoluteFill} />
          }
          <LinearGradient
            colors={['rgba(0,0,0,0.65)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={StyleSheet.absoluteFill}
          />

          {/* ── Top bar (redesigned) ─────────────────────────────────────── */}
          <LinearGradient
            colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.0)']}
            style={[st.topBar, { paddingTop: insets.top + 6 }]}
          >
            {/* LEFT: Avatar + name + coin earnings below */}
            <View style={st.topLeft}>
              <View style={st.hostInfoOverlay}>
                {/* Avatar */}
                <View style={st.hostAvatarCol}>
                  {liveData?.hostAvatar ? (
                    <Image source={{ uri: liveData.hostAvatar }} style={st.hostAvatar} />
                  ) : (
                    <View style={st.hostAvatarFallback}>
                      <Text style={st.hostInitial}>{hostInitial}</Text>
                    </View>
                  )}
                </View>
                {/* Display name + username + follow button */}
                <View style={{ flexShrink: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={st.hostName} numberOfLines={1}>
                      {liveData?.hostDisplayName ?? liveData?.hostUsername ?? '—'}
                    </Text>
                    {currentUser?.username !== liveData?.hostUsername && (
                      <TouchableOpacity
                        onPress={handleFollowToggle}
                        disabled={followLoading}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.75}
                      >
                        <LinearGradient
                          colors={isFollowing ? ['#444', '#444'] : ['#3B82F6', '#EF4444']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={st.followPlusBtn}
                        >
                          <Text style={st.followPlusTxt}>{isFollowing ? '✓' : '+'}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {/* Coin earnings pill — di bawah avatar block */}
              <LinearGradient
                colors={['#FF6B9D', '#FFDA6B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={st.coinEarnPill}
              >
                <Text style={st.coinEarnIcon}>🪙</Text>
                <Text style={st.coinEarnTxt}>{fmtNum(liveData?.totalGifts ?? 0)}</Text>
              </LinearGradient>
            </View>

            {/* RIGHT: viewer avatars + count + X */}
            <View style={st.topRight}>
              {/* Viewer avatar stack — max 8 kecil sebelum count */}
              {viewerList.length > 0 && (
                <View style={st.viewerAvatarStack}>
                  {viewerList.slice(0, 8).map((v, i) => (
                    <TouchableOpacity
                      key={v.username}
                      activeOpacity={0.8}
                      onPress={() => setProfileUsername(v.username)}
                      style={[st.viewerAvatarBubble, { zIndex: 8 - i, marginLeft: i === 0 ? 0 : -6 }]}
                    >
                      {v.avatarUrl ? (
                        <Image source={{ uri: v.avatarUrl }} style={st.viewerAvatarImg} />
                      ) : (
                        <View style={st.viewerAvatarFallback}>
                          <Text style={st.viewerAvatarInitial}>
                            {(v.displayName || v.username).charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity style={st.statPill} onPress={() => setShowViewerList(true)} activeOpacity={0.8}>
                <Ionicons name="eye-outline" size={12} color="#fff" />
                <Text style={st.statPillTxt}>{fmtNum(liveData?.viewerCount ?? 0)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Video loading indicator — muncul saat LiveKit belum selesai connect */}
          {!lkVideoTrack && (
            <View style={st.noVideoNotice}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginRight: 6 }} />
              <Text style={st.noVideoTxt}>Menyambungkan video live…</Text>
            </View>
          )}

          {/* ── Host Away Overlay ─────────────────────────────────────────── */}
          {hostAway && (
            <Animated.View style={[st.hostAwayOverlay, { opacity: hostAwayOpacity }]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'rgba(13,0,16,0.82)', 'rgba(0,0,0,0.55)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={st.hostAwayCard}>
                <View style={st.hostAwayIconWrap}>
                  <LinearGradient colors={['#FF6B9D', '#C9184A']} style={st.hostAwayIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={{ fontSize: 28 }}>🚶</Text>
                  </LinearGradient>
                </View>
                <Text style={st.hostAwayTitle}>Host sedang pergi</Text>
                <Text style={st.hostAwaySub}>Akan segera kembali... 🔜</Text>
                <BouncingDots />
              </View>
            </Animated.View>
          )}

          {/* ── Live Ended Overlay ────────────────────────────────────────── */}
          {liveEnded && (
            <Animated.View style={[st.hostAwayOverlay, { opacity: liveEndedOpacity }]} pointerEvents="box-none">
              <LinearGradient
                colors={['rgba(0,0,0,0.65)', 'rgba(13,0,16,0.90)', 'rgba(0,0,0,0.65)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={st.hostAwayCard}>
                <View style={st.hostAwayIconWrap}>
                  <LinearGradient colors={['#7C3AED', '#C9184A']} style={st.hostAwayIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={{ fontSize: 28 }}>🎬</Text>
                  </LinearGradient>
                </View>
                <Text style={st.hostAwayTitle}>Live telah berakhir</Text>
                <Text style={st.hostAwaySub}>Stream ini sudah dihentikan oleh host</Text>
              </View>
            </Animated.View>
          )}
        </View>

        {/* ── Announce Banner (top-right, persistent bunny image) ─────── */}
        {!!activeBannerText && (
          <Animated.View
            pointerEvents="none"
            style={[st.announceBannerWrap, { transform: [{ translateX: bannerSlide }] }]}
          >
            <Image
              source={ANNOUNCE_BANNER}
              style={st.announceBannerImg}
              resizeMode="contain"
            />
            <View style={st.announceBannerTextWrap} pointerEvents="none">
              <BannerMarqueeText
                text={activeBannerText}
                containerWidth={136}
                style={st.announceBannerText}
              />
            </View>
          </Animated.View>
        )}

        {/* ── Komal Seats Panel (right side) ──────────────────────────────── */}
        {komalActive && (
          <View style={{ position: 'absolute', right: 10, top: '22%', zIndex: 40, alignItems: 'center', gap: 4 }} pointerEvents="box-none">
            <KomalSeatsPanel
              seats={komalSeats}
              isHost={false}
              currentUsername={currentUser?.username ?? null}
              onJoinSeat={(komalLoading || myKomalSeat !== null) ? undefined : (n: number) => handleJoinKomalSeat(n)}
              onLeaveSeat={handleLeaveKomalSeat}
            />
            {/* Loading state saat join seat */}
            {komalLoading && (
              <View style={{ backgroundColor: 'rgba(124,58,237,0.85)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Bergabung...</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Swipeable UI layer (swipe kanan = bersih, swipe kiri = balik) ── */}
        <Animated.View
          style={[st.uiLayer, { transform: [{ translateX: uiSlideX }] }]}
          pointerEvents="box-none"
        >
          {/* Floating gift notifs */}
          <View style={st.floatLayer} pointerEvents="none">
            {floatNotifs.map(n => <FloatBanner key={n.id} notif={n} />)}
          </View>


          {/* VIP entrance banner */}
          <VipEntranceBanner queue={vipQueueRef} showingRef={vipShowingRef} />

          {/* Blocked banner */}
          {isBlocked && (
            <View style={st.blockedBanner} pointerEvents="none">
              <MaterialCommunityIcons name="account-cancel-outline" size={13} color="#FF4D6D" />
              <Text style={st.blockedTxt}>Kamu diblokir dari live ini</Text>
            </View>
          )}

          {/* ── Bottom: chat + actions — persis pola host modal ── */}
          <View style={[st.bottomPanel, { bottom: keyboardHeight, paddingBottom: insets.bottom + 8 }]}>
          {/* "Pesan baru" pill — muncul saat user scroll naik */}
          {newMsgCount > 0 && (
            <TouchableOpacity style={st.newMsgPill} onPress={scrollToLatest} activeOpacity={0.85}>
              <Ionicons name="arrow-down" size={11} color="#fff" />
              <Text style={st.newMsgPillTxt}>{newMsgCount} pesan baru</Text>
            </TouchableOpacity>
          )}
          {/* Chat list */}
          <FlatList
            ref={flatRef}
            data={chatMsgs}
            keyExtractor={m => m.id}
            style={st.chatList}
            contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 8, gap: 4 }}
            showsVerticalScrollIndicator={false}
            onScroll={handleChatScroll}
            onMomentumScrollEnd={handleChatScroll}
            scrollEventThrottle={100}
            renderItem={({ item }) => {
              if (item.type === 'announcement') {
                return (
                  <View style={st.chatAnnounceBubble}>
                    <View style={st.chatAnnounceIconRow}>
                      <Text style={st.chatAnnounceIcon}>📢</Text>
                      <Text style={st.chatAnnounceLbl}>Pengumuman Sistem</Text>
                    </View>
                    <Text style={st.chatAnnounceText}>{item.text}</Text>
                  </View>
                );
              }
              if (item.type === 'join') {
                return (
                  <View style={st.chatBubbleSystem}>
                    <Text style={[st.chatUser, { color: PINK }]}>{item.displayName ?? item.username} </Text>
                    <Text style={st.chatText}>{item.text}</Text>
                  </View>
                );
              }
              if (item.type === 'gift') {
                return (
                  <View style={st.chatBubbleSystem}>
                    <Text style={st.chatGiftEmoji}>{item.giftEmoji}</Text>
                    <Text style={[st.chatUser, { color: ROSE }]}>{item.displayName ?? item.username} </Text>
                    <Text style={st.chatText}>{item.text}</Text>
                  </View>
                );
              }
              // ── Normal chat bubble (host-modal style) ──
              const initials = (item.displayName ?? item.username ?? '?').slice(0, 2).toUpperCase();
              const avatarColor = item.isAdmin ? '#F59E0B' : PINK;
              const vipColors = (item.vipLevel ?? 0) > 0 ? VIP_BOX_COLORS[item.vipLevel!] : null;
              return (
                <View style={st.soloBubbleWrapper}>
                  <View style={[st.soloBubbleAvatar, { borderColor: vipColors?.border ?? avatarColor }]}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={st.soloBubbleAvatarImg} />
                    ) : (
                      <View style={[st.soloBubbleAvatarFallback, { backgroundColor: avatarColor }]}>
                        <Text style={st.soloBubbleAvatarInitials}>{initials}</Text>
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
                    <Text style={[st.soloBubbleUsername, { color: vipColors?.border ?? avatarColor }]}>
                      {item.displayName ?? item.username}
                    </Text>
                    {(!!item.agencyBadge || !!item.isAdmin || (item.migLevel ?? 0) > 0 || (item.vipLevel ?? 0) > 0) && (
                      <View style={st.soloBubbleBadgeRow}>
                        {(item.vipLevel ?? 0) > 0 && <VipBadge level={item.vipLevel!} size={24} />}
                        {!!item.agencyBadge && (
                          <View style={st.soloBubbleAgencyBadge}>
                            <Text style={st.soloBubbleAgencyBadgeText}>{item.agencyBadge}</Text>
                          </View>
                        )}
                        {!!item.isAdmin && (
                          <View style={st.soloBubbleAdminBadge}>
                            <Text style={st.soloBubbleAdminBadgeText}>⭐ Admin</Text>
                          </View>
                        )}
                        {(item.migLevel ?? 0) > 0 && <SoloLevelBadge level={item.migLevel!} />}
                      </View>
                    )}
                    <View style={st.soloBubbleFrame}>
                      <Text style={[st.soloBubbleCorner, { top: -4, left: 2 }]}>✦</Text>
                      <Text style={[st.soloBubbleCorner, { top: -4, right: 2 }]}>✦</Text>
                      <Text style={[st.soloBubbleCorner, { bottom: -4, left: 2 }]}>✦</Text>
                      <Text style={[st.soloBubbleCorner, { bottom: -4, right: 2 }]}>✦</Text>
                      <Text style={st.soloBubbleMsgText}>{item.text}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={st.chatEmpty}>Belum ada pesan. Mulai chat!</Text>
            }
          />


          {/* Input bar — host-style dark overlay */}
          <View style={[st.inputBar, { paddingBottom: 8 }]}>
            {/* Glass text input */}
            <TouchableOpacity
              style={[st.chatInputWrap, isBlocked && { opacity: 0.45 }]}
              activeOpacity={0.9}
              onPress={() => !isBlocked && inputRef.current?.focus()}
            >
              <TextInput
                ref={inputRef}
                style={st.chatInputField}
                placeholder={isBlocked ? 'Kamu tidak dapat chat' : 'Tulis pesan...'}
                placeholderTextColor="rgba(255,255,255,0.42)"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMsg}
                returnKeyType="send"
                maxLength={120}
                editable={!isBlocked}
              />
            </TouchableOpacity>

            {/* Toolbar icons */}
            <View style={st.toolbarIcons}>
              {/* Sticker */}
              <TouchableOpacity activeOpacity={0.8}>
                <LinearGradient colors={['#FFCA28', '#FF8F00']} style={st.toolbarPill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="sticker-emoji" size={19} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>

              {/* Gift */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => !isBlocked && setGiftSheetOpen(true)}
                disabled={isBlocked}
              >
                <LinearGradient
                  colors={isBlocked ? ['#555', '#444'] : ['#F06292', '#C62828']}
                  style={st.toolbarPill}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="gift-outline" size={19} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>

              {/* Game */}
              <TouchableOpacity activeOpacity={0.8}>
                <LinearGradient colors={['#10B981', '#047857']} style={st.toolbarPill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <MaterialCommunityIcons name="gamepad-variant" size={19} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </Animated.View>
      </Animated.View>
      {/* ── Gift Effect Layer (zIndex 9999, pointerEvents none) ── */}
      <SoloGiftEffectLayer ref={giftEffectRef} />

      {/* ── Gift Combo Overlay (outside uiLayer so swipe transform doesn't affect it) ── */}
      <GiftComboOverlay ref={comboOverlayRef} />

      {/* ── Gift Picker Sheet ── */}
      {stream?.id && (
        <SoloGiftPickerSheet
          visible={giftSheetOpen}
          onClose={() => setGiftSheetOpen(false)}
          streamId={stream.id}
          currentUsername={currentUser?.username ?? ''}
          isSelfGift={false}
          onGiftSent={handleGiftSent}
        />
      )}

      {/* ── View Profile (tap avatar viewer) ── */}
      {profileUsername && (
        <ViewProfileModal
          visible={!!profileUsername}
          username={profileUsername}
          displayName={profileUsername}
          avatarColor="#6366F1"
          currentUserId={currentUser?.username ?? ''}
          onClose={() => setProfileUsername(null)}
        />
      )}

      {/* ── Viewer List Modal ── */}
      <LiveViewerListModal
        visible={showViewerList}
        onClose={() => setShowViewerList(false)}
        viewers={viewerList}
        viewerCount={liveData?.viewerCount ?? 0}
        onFetchViewers={stream?.id ? () => getLiveViewers(stream.id!) : undefined}
        onViewerPress={(username) => { setShowViewerList(false); setProfileUsername(username); }}
      />
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  fullScreen: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: DARK,
  },

  // Video — full screen, all UI overlays on top
  videoArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DARK,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 14,
  },
  topLeft: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  hostInfoOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 28, paddingVertical: 5, paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  hostAvatarCol: { alignItems: 'center', gap: 3 },
  hostAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: PINK,
  },
  hostAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: ROSE + '66',
    borderWidth: 2, borderColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  hostInitial: { fontSize: 14, fontWeight: '900', color: '#fff' },
  giftBelowAvatar: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.50)',
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 0.5, borderColor: PINK + '66',
  },
  giftBelowTxt: { color: PINK, fontSize: 9, fontWeight: '800' },
  followPlusBtn: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  followPlusTxt: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 18, marginTop: -1 },
  hostName: { fontSize: 13, fontWeight: '800', color: '#fff', flexShrink: 1 },
  hostUsername: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  statPillTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  coinEarnPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  coinEarnIcon: { fontSize: 12, lineHeight: 16 },
  coinEarnTxt: { color: '#fff', fontSize: 10, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  viewerAvatarStack: {
    flexDirection: 'row', alignItems: 'center',
    marginRight: 4,
  },
  viewerAvatarBubble: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
    backgroundColor: '#2D2D2D',
  },
  viewerAvatarImg: { width: 22, height: 22, borderRadius: 11 },
  viewerAvatarFallback: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4C1D95',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerAvatarInitial: { color: '#fff', fontSize: 9, fontWeight: '700' },
  noVideoNotice: {
    position: 'absolute', bottom: SH * 0.46, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  noVideoTxt: { fontSize: 11, color: 'rgba(255,255,255,0.38)', textAlign: 'center', flexShrink: 1 },

  blockedBanner: {
    position: 'absolute',
    left: 0, right: 0,
    bottom: SH * 0.40,
    zIndex: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 14,
    backgroundColor: 'rgba(255,77,109,0.18)',
  },
  blockedTxt: { fontSize: 12, color: '#FF4D6D', fontWeight: '500', letterSpacing: 0.1 },

  // Floating notifs — sit above the bottom panel overlay
  floatLayer: {
    position: 'absolute', left: 12, right: 0,
    bottom: SH * 0.44,
    gap: 8, pointerEvents: 'none' as any,
    alignItems: 'flex-start',
  },

  // Host away overlay
  hostAwayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  hostAwayCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  hostAwayIconWrap: {
    marginBottom: 6,
    shadowColor: '#FF6B9D', shadowOpacity: 0.7,
    shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  hostAwayIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  hostAwayTitle: {
    fontSize: 20, fontWeight: '900', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 0.3,
  },
  hostAwaySub: {
    fontSize: 13, color: 'rgba(255,255,255,0.7)',
    fontWeight: '500', letterSpacing: 0.2,
  },

  // Swipeable UI layer — absoluteFill, passes touches to children
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },

  // Bottom panel — absolute, persis pola host modal
  bottomPanel: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
    maxHeight: SH * 0.42,
  },
  chatList: { flex: 1, maxHeight: SH * 0.28, minHeight: 60 },
  newMsgPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'center', marginBottom: 4,
    backgroundColor: ROSE, borderRadius: 20,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  newMsgPillTxt: { fontSize: 11.5, color: '#fff', fontWeight: '700' },
  chatBubbleSystem: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    maxWidth: '93%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 2,
  },
  chatUser: { fontSize: 12, fontWeight: '800' },
  chatText: { fontSize: 12, color: '#fff', flexShrink: 1 },
  chatGiftEmoji: { fontSize: 16, marginRight: 2 },
  soloBubbleWrapper: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, paddingHorizontal: 4, paddingVertical: 3, maxWidth: '93%',
  },
  soloBubbleAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, overflow: 'hidden',
    shadowColor: PINK, shadowOpacity: 0.45,
    shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
    elevation: 3, marginTop: 1,
  },
  soloBubbleAvatarImg: { width: '100%', height: '100%' },
  soloBubbleAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  soloBubbleAvatarInitials: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: '#fff' },
  soloBubbleBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 4, flexWrap: 'nowrap',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 100, paddingHorizontal: 6, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  soloBubbleUsername: {
    fontSize: 12, fontWeight: '800', letterSpacing: 0.2, marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  soloBubbleAgencyBadge: {
    backgroundColor: '#0E7490', borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.5)',
  },
  soloBubbleAgencyBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  soloBubbleAdminBadge: {
    backgroundColor: 'rgba(255,184,0,0.20)', borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.55)',
  },
  soloBubbleAdminBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFD84D', letterSpacing: 0.3 },
  soloBubbleFrame: {
    backgroundColor: 'rgba(8,4,28,0.72)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,107,157,0.30)',
    paddingHorizontal: 11, paddingVertical: 8,
    alignSelf: 'flex-start',
    shadowColor: PINK, shadowOpacity: 0.18,
    shadowRadius: 8, shadowOffset: { width: 0, height: 1 },
    elevation: 3, position: 'relative',
  },
  soloBubbleCorner: {
    position: 'absolute', fontSize: 8,
    color: 'rgba(255,157,190,0.60)', lineHeight: 10,
  },
  soloBubbleMsgText: {
    fontSize: 14, color: '#fff', fontWeight: '500',
    lineHeight: 20, flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
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
  chatAnnounceBubble: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    width: '100%',
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
  chatEmpty: {
    textAlign: 'center', fontSize: 12,
    color: 'rgba(255,255,255,0.3)', marginTop: 16, fontStyle: 'italic',
  },

  // Gift panel
  giftPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
    backgroundColor: 'rgba(13,0,16,0.97)',
  },
  giftPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  giftPanelTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  giftGrid: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  giftItem: {
    width: 72, alignItems: 'center', gap: 4,
    padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: PINK + '44',
  },
  giftItemSending: { opacity: 0.6 },
  giftEmoji: { fontSize: 26 },
  giftLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  giftCoinBadge: {
    backgroundColor: ROSE,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  giftCoinTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Input bar — host-style dark overlay
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  chatInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
  },
  chatInputField: {
    fontSize: 13, color: '#fff', padding: 0,
  },
  toolbarIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarPill: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
});

// ── Float banner styles ───────────────────────────────────────────────────────
const fst = StyleSheet.create({
  floatBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(190,24,93,0.82)',
    borderRadius: 24, paddingHorizontal: 12, paddingVertical: 7,
    maxWidth: SW * 0.72,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: PINK,
    shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  floatEmoji:    { fontSize: 22 },
  floatTextCol:  { flex: 1 },
  floatUsername: { fontSize: 12, fontWeight: '800', color: '#fff', flexShrink: 1 },
  floatLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
});
