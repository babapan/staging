import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, FlatList, Image, Keyboard, Modal,
  StyleSheet, Text, TextInput, TouchableOpacity,
  View, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  joinStream, leaveStream, sendGift, getLiveStreamDetail,
  type LiveStream,
} from '../services/liveService';
import { WS_URL } from '../config/connection';
import { getAuthToken } from '../services/storage';

const { width: SW, height: SH } = Dimensions.get('window');

const PINK   = '#EC4899';
const ROSE   = '#BE185D';
const DARK   = '#0D0010';

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
  text: string;
  type: 'chat' | 'join' | 'gift';
  giftEmoji?: string;
  giftCoins?: number;
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
  currentUser: { id?: number | string; username: string; displayName?: string | null } | null;
  onClose: () => void;
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
  const [giftPanelOpen, setGiftPanelOpen] = useState(false);
  const [sending,    setSending]    = useState<string | null>(null);
  const [chatInput,  setChatInput]  = useState('');
  const [joined,     setJoined]     = useState(false);

  // ── Kicked / blocked / ended state ───────────────────────────────────────
  const [kickedReason, setKickedReason] = useState<'kicked' | 'blocked' | 'ended' | null>(null);
  const kickBannerAnim = useRef(new Animated.Value(0)).current;

  // ── WebSocket refs ─────────────────────────────────────────────────────────
  const wsRef        = useRef<WebSocket | null>(null);
  const wsActiveRef  = useRef(false);
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenMsgIds   = useRef<Set<string>>(new Set());
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const flatRef  = useRef<FlatList>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideUp  = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  // ── Keyboard height (Android: keyboard tidak push absolute layout) ─────────
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Trigger overlay then auto-close ──────────────────────────────────────
  const triggerKick = useCallback((reason: 'kicked' | 'blocked' | 'ended') => {
    setKickedReason(reason);
    Animated.spring(kickBannerAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    const delay = reason === 'ended' ? 3500 : 2800;
    setTimeout(() => {
      onClose();
      setTimeout(() => setKickedReason(null), 400);
    }, delay);
  }, [kickBannerAnim, onClose]);

  // ── WebSocket disconnect ───────────────────────────────────────────────────
  const disconnectWS = useCallback(() => {
    wsActiveRef.current = false;
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    if (wsRef.current)   { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, []);

  // ── WebSocket connect ─────────────────────────────────────────────────────
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
          pingRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
          }, 25_000);
          return;
        }
        if (p.type === 'PONG' || p.type === 'SUBSCRIBED') return;

        // ── Chat message ─────────────────────────────────────────────────
        if (p.type === 'MESSAGE' && p.roomId === roomId && p.message) {
          const m = p.message;
          const msgText: string = m.text ?? '';
          if (msgText.trimStart().startsWith('<<') && msgText.trimEnd().endsWith('>>')) return;
          if (m.id != null) {
            const k = String(m.id);
            if (seenMsgIds.current.has(k)) return;
            seenMsgIds.current.add(k);
            if (seenMsgIds.current.size > 300) seenMsgIds.current.delete(seenMsgIds.current.values().next().value!);
          }
          pushChat({
            type: 'chat',
            username: m.senderDisplayName ?? m.senderUsername ?? 'Penonton',
            text: msgText,
          });
          return;
        }

        // ── Gift notification ────────────────────────────────────────────
        if (p.type === 'LIVE_GIFT' && p.streamId === sid) {
          const emoji = '🎁';
          pushChat({
            type: 'gift',
            username: p.senderUsername ?? 'Penonton',
            text: `mengirim ${p.giftName} (${p.amountCoins} koin)`,
            giftEmoji: emoji,
            giftCoins: p.amountCoins ?? 0,
          });
          launchFloatNotif(emoji, p.giftName ?? 'Gift', p.senderUsername ?? 'Penonton', p.amountCoins ?? 0);
          setLiveData(d => d ? { ...d, totalGifts: d.totalGifts + (p.amountCoins ?? 0) } : d);
          return;
        }

        // ── Viewer join ──────────────────────────────────────────────────
        if (p.type === 'LIVE_JOIN' && p.streamId === sid) {
          pushChat({ type: 'join', username: p.username ?? 'Penonton', text: 'bergabung ke live' });
          setLiveData(d => d ? { ...d, viewerCount: d.viewerCount + 1 } : d);
          return;
        }

        // ── Host announcement ────────────────────────────────────────────
        if (p.type === 'LIVE_ANNOUNCE' && p.streamId === sid) {
          pushChat({ type: 'chat', username: '📢 Pengumuman', text: p.text ?? '' });
          return;
        }

        // ── STREAM ENDED — auto-close viewer ────────────────────────────
        if (p.type === 'LIVE_END' && p.streamId === sid) {
          disconnectWS();
          triggerKick('ended');
          return;
        }

        // ── KICK / BLOCK — auto-close viewer ────────────────────────────
        if (p.type === 'LIVE_KICK' && p.streamId === sid) {
          const me = currentUserRef.current;
          const matchById =
            p.targetUserId != null && me?.id != null &&
            String(p.targetUserId) === String(me.id);
          const matchByUsername =
            p.targetUsername != null && me?.username != null &&
            p.targetUsername === me.username;
          if (matchById || matchByUsername) {
            disconnectWS();
            const reason: 'kicked' | 'blocked' = p.reason === 'blocked' ? 'blocked' : 'kicked';
            triggerKick(reason);
          }
          return;
        }

      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => { /* silent */ };
    ws.onclose = () => {
      if (!wsActiveRef.current) return;
      setTimeout(() => { if (wsActiveRef.current && sid) connectWS(sid); }, 3000);
    };
  }, [disconnectWS, triggerKick]);

  // ── Connect WS when visible ───────────────────────────────────────────────
  useEffect(() => {
    if (visible && stream?.id) {
      connectWS(stream.id);
    } else {
      disconnectWS();
    }
    return () => disconnectWS();
  }, [visible, stream?.id]);

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

  // ── join/leave stream ────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && stream?.id && !joined) {
      joinStream(stream.id);
      setJoined(true);
      pushChat({ type: 'join', username: currentUser?.username ?? 'Kamu', text: 'bergabung ke stream' });
    }
    if (!visible && joined && stream?.id) {
      leaveStream(stream.id);
      setJoined(false);
    }
  }, [visible, stream?.id]);

  // ── poll stats ───────────────────────────────────────────────────────────
  const pollStats = useCallback(async () => {
    if (!stream?.id) return;
    const detail = await getLiveStreamDetail(stream.id);
    if (detail) setLiveData(d => d ? { ...d, viewerCount: detail.viewerCount ?? 0, totalGifts: detail.totalGifts ?? 0 } : d);
  }, [stream?.id]);

  useEffect(() => {
    if (visible && stream?.id) {
      pollRef.current = setInterval(pollStats, 8_000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [visible, stream?.id, pollStats]);

  // ── reset on close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setTimeout(() => {
        setChatMsgs([]);
        setFloatNotifs([]);
        setGiftPanelOpen(false);
        setChatInput('');
      }, 350);
    }
  }, [visible]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const pushChat = (msg: Omit<ChatMsg, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setChatMsgs(prev => [...prev.slice(-79), { ...msg, id }]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
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
    if (!text) return;
    pushChat({ type: 'chat', username: currentUser?.username ?? 'Kamu', text });
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
          username: currentUser?.username ?? 'Kamu',
          text: `mengirim ${gift.label} (${gift.coins} koin)`,
          giftEmoji: gift.emoji,
          giftCoins: gift.coins,
        });
        launchFloatNotif(gift.emoji, gift.label, currentUser?.username ?? 'Kamu', gift.coins);
        setLiveData(d => d ? { ...d, totalGifts: d.totalGifts + gift.coins } : d);
        setGiftPanelOpen(false);
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

  const handleClose = () => {
    setGiftPanelOpen(false);
    onClose();
  };

  const hostInitial = (liveData?.hostDisplayName ?? liveData?.hostUsername ?? '?')[0].toUpperCase();

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={[st.backdrop, { opacity: bgOpacity }]} />

      <Animated.View style={[st.fullScreen, { transform: [{ translateY: slideUp }] }]}>

        {/* ── Video / Hero area ── */}
        <View style={st.videoArea}>
          {liveData?.thumbnailUrl || liveData?.hostAvatar ? (
            <Image source={{ uri: (liveData.thumbnailUrl ?? liveData.hostAvatar)! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[ROSE + 'FF', PINK + 'AA', DARK]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.65)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Top bar */}
          <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={st.topLeft}>
              <View style={st.hostAvatarWrap}>
                {liveData?.hostAvatar ? (
                  <Image source={{ uri: liveData.hostAvatar }} style={st.hostAvatar} />
                ) : (
                  <View style={st.hostAvatarFallback}><Text style={st.hostInitial}>{hostInitial}</Text></View>
                )}
                <View style={st.liveDotSmall} />
              </View>
              <View>
                <Text style={st.hostName} numberOfLines={1}>{liveData?.hostDisplayName ?? liveData?.hostUsername ?? '—'}</Text>
                <Text style={st.hostUsername} numberOfLines={1}>@{liveData?.hostUsername ?? '—'}</Text>
              </View>
            </View>
            <TouchableOpacity style={st.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={st.statsRow}>
            <View style={st.statPill}>
              <View style={st.liveDotTiny} />
              <MaterialCommunityIcons name="video" size={11} color="#fff" />
              <Text style={st.livePillTxt}>LIVE</Text>
            </View>
            <View style={st.statPill}>
              <Ionicons name="eye" size={11} color="#fff" />
              <Text style={st.statPillTxt}>{fmtNum(liveData?.viewerCount ?? 0)}</Text>
            </View>
            <View style={[st.statPill, { borderColor: PINK + '88' }]}>
              <Text style={{ fontSize: 11 }}>💎</Text>
              <Text style={[st.statPillTxt, { color: PINK }]}>{fmtNum(liveData?.totalGifts ?? 0)}</Text>
            </View>
          </View>

          {/* No video notice */}
          <View style={st.noVideoNotice}>
            <MaterialCommunityIcons name="video-off-outline" size={14} color="rgba(255,255,255,0.45)" />
            <Text style={st.noVideoTxt}>Video butuh EAS Build — Expo Go tidak support native video</Text>
          </View>

          {/* Floating gift notifs */}
          <View style={st.floatLayer} pointerEvents="none">
            {floatNotifs.map(n => <FloatBanner key={n.id} notif={n} />)}
          </View>
        </View>

        {/* ── Bottom: chat + actions ── */}
        <View style={[st.bottomPanel, { marginBottom: keyboardHeight }]}>
          {/* Chat list */}
          <FlatList
            ref={flatRef}
            data={chatMsgs}
            keyExtractor={m => m.id}
            style={st.chatList}
            contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={st.chatRow}>
                {item.type === 'join' ? (
                  <Text style={st.chatJoin}>
                    <Text style={st.chatUsernameJoin}>{item.username} </Text>
                    {item.text}
                  </Text>
                ) : item.type === 'gift' ? (
                  <View style={st.chatGiftRow}>
                    <Text style={st.chatGiftEmoji}>{item.giftEmoji}</Text>
                    <Text style={st.chatGiftTxt}>
                      <Text style={st.chatUsernameGift}>{item.username} </Text>
                      {item.text}
                    </Text>
                  </View>
                ) : (
                  <Text style={st.chatLine} numberOfLines={2}>
                    <Text style={st.chatUsername}>{item.username}: </Text>
                    <Text style={st.chatText}>{item.text}</Text>
                  </Text>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={st.chatEmpty}>Belum ada pesan. Mulai chat!</Text>
            }
          />

          {/* Gift panel */}
          {giftPanelOpen && (
            <View style={st.giftPanel}>
              <View style={st.giftPanelHeader}>
                <Text style={st.giftPanelTitle}>Kirim Gift 🎁</Text>
                <TouchableOpacity onPress={() => setGiftPanelOpen(false)}>
                  <Ionicons name="chevron-down" size={20} color="rgba(0,0,0,0.45)" />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.giftGrid}>
                {GIFTS.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    style={[st.giftItem, sending === g.id && st.giftItemSending]}
                    onPress={() => handleSendGift(g)}
                    disabled={!!sending}
                    activeOpacity={0.75}
                  >
                    {sending === g.id ? (
                      <ActivityIndicator size="small" color={PINK} />
                    ) : (
                      <Text style={st.giftEmoji}>{g.emoji}</Text>
                    )}
                    <Text style={st.giftLabel}>{g.label}</Text>
                    <View style={st.giftCoinBadge}>
                      <Text style={st.giftCoinTxt}>{g.coins}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Input bar */}
          <View style={[st.inputBar, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom + 8 }]}>
            <TouchableOpacity
              style={st.giftFabBtn}
              onPress={() => setGiftPanelOpen(v => !v)}
              activeOpacity={0.8}
            >
              <LinearGradient colors={[ROSE, PINK]} style={st.giftFabInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={{ fontSize: 18 }}>🎁</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TextInput
              style={st.chatInput}
              placeholder="Tulis pesan..."
              placeholderTextColor="rgba(0,0,0,0.35)"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={sendChatMsg}
              returnKeyType="send"
              maxLength={120}
            />

            <TouchableOpacity
              style={[st.sendBtn, !chatInput.trim() && st.sendBtnDisabled]}
              onPress={sendChatMsg}
              disabled={!chatInput.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={18} color={chatInput.trim() ? PINK : 'rgba(0,0,0,0.25)'} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── Kicked / Blocked banner overlay ── */}
      {kickedReason != null && (
        <Animated.View
          style={[
            st.kickOverlay,
            {
              opacity: kickBannerAnim,
              transform: [{ scale: kickBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={st.kickCard}>
            <Text style={st.kickEmoji}>
              {kickedReason === 'ended' ? '🎬' : kickedReason === 'blocked' ? '🚫' : '👋'}
            </Text>
            <Text style={st.kickTitle}>
              {kickedReason === 'ended'
                ? 'Live telah berakhir'
                : kickedReason === 'blocked'
                ? 'Kamu diblokir dari live ini'
                : 'Kamu dikeluarkan dari live'}
            </Text>
            <Text style={st.kickSub}>
              {kickedReason === 'ended'
                ? 'Host telah mengakhiri sesi live ini.'
                : kickedReason === 'blocked'
                ? 'Host memblokir kamu dari ruangan ini.'
                : 'Host mengeluarkan kamu dari ruangan ini.'}
            </Text>
          </View>
        </Animated.View>
      )}
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

  // Video
  videoArea: {
    flex: 1,
    backgroundColor: DARK,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 10,
  },
  topLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hostAvatarWrap: { position: 'relative', width: 42, height: 42 },
  hostAvatar: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2, borderColor: PINK,
  },
  hostAvatarFallback: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: ROSE + '66',
    borderWidth: 2, borderColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  hostInitial: { fontSize: 16, fontWeight: '900', color: '#fff' },
  liveDotSmall: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 1.5, borderColor: DARK,
  },
  hostName: { fontSize: 14, fontWeight: '800', color: '#fff', flexShrink: 1 },
  hostUsername: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: {
    position: 'absolute', top: 60, left: 14,
    flexDirection: 'row', gap: 6, flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  liveDotTiny: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  livePillTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  statPillTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  noVideoNotice: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  noVideoTxt: { fontSize: 11, color: 'rgba(255,255,255,0.38)', textAlign: 'center', flexShrink: 1 },

  // Floating notifs
  floatLayer: {
    position: 'absolute', left: 12, right: 0,
    bottom: 14,
    gap: 8, pointerEvents: 'none' as any,
    alignItems: 'flex-start',
  },

  // Bottom panel
  bottomPanel: {
    backgroundColor: '#fff',
    maxHeight: SH * 0.42,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
  },
  chatList: { flex: 1, maxHeight: SH * 0.28 },
  chatRow:  { marginBottom: 4 },
  chatLine: { fontSize: 12.5, color: '#1A1A2E', lineHeight: 17 },
  chatUsername: { fontWeight: '700', color: ROSE },
  chatText:     { color: 'rgba(0,0,0,0.7)' },
  chatJoin: {
    fontSize: 11.5, color: 'rgba(0,0,0,0.38)', fontStyle: 'italic',
  },
  chatUsernameJoin: { fontWeight: '600', color: PINK, fontStyle: 'normal' },
  chatGiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 },
  chatGiftEmoji: { fontSize: 18 },
  chatGiftTxt: { fontSize: 12.5, flex: 1 },
  chatUsernameGift: { fontWeight: '700', color: ROSE },
  chatEmpty: {
    textAlign: 'center', fontSize: 12,
    color: 'rgba(0,0,0,0.3)', marginTop: 16, fontStyle: 'italic',
  },

  // Gift panel
  giftPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 12,
    backgroundColor: '#fff',
  },
  giftPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  giftPanelTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A2E' },
  giftGrid: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  giftItem: {
    width: 72, alignItems: 'center', gap: 4,
    padding: 10, borderRadius: 14,
    backgroundColor: '#FDF2F8',
    borderWidth: 1, borderColor: PINK + '22',
  },
  giftItemSending: { opacity: 0.6 },
  giftEmoji: { fontSize: 26 },
  giftLabel: { fontSize: 11, fontWeight: '600', color: '#1A1A2E' },
  giftCoinBadge: {
    backgroundColor: ROSE,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  giftCoinTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
    backgroundColor: '#fff',
  },
  giftFabBtn: { borderRadius: 22, overflow: 'hidden' },
  giftFabInner: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  chatInput: {
    flex: 1, height: 38,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 19,
    paddingHorizontal: 14, fontSize: 13,
    color: '#1A1A2E',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: PINK + '14',
  },
  sendBtnDisabled: { backgroundColor: 'transparent' },

  // Kicked / Blocked overlay
  kickOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 999,
  },
  kickCard: {
    backgroundColor: '#1A0A2E',
    borderRadius: 22,
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.35)',
    shadowColor: '#EC4899',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16,
    maxWidth: SW * 0.78,
  },
  kickEmoji: { fontSize: 48, marginBottom: 4 },
  kickTitle: {
    fontSize: 18, fontWeight: '900', color: '#fff',
    textAlign: 'center', lineHeight: 24,
  },
  kickSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center', lineHeight: 18,
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
