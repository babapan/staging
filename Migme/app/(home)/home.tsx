import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { API_BASE, getMe, buildHeaders } from '../../services/auth';
import MultiRoomChatModal, { type PrivateChat } from '../../components/MultiRoomChatModal';
import { useAppTheme } from '../../services/themeContext';
import { type PartyRoom } from '../../components/PartyRoomModal';
import { fetchPartyRooms, createPartyRoom } from '../../services/partyService';
import { fetchLiveStreams, type LiveStream } from '../../services/liveService';
import { useParty } from '../../contexts/PartyContext';
import GoPartyChoiceModal from '../../components/GoPartyChoiceModal';
import LiveSoloCard from '../../components/LiveSoloCard';
import LiveSoloHostModal from '../../components/LiveSoloHostModal';
import LiveSoloViewerModal from '../../components/LiveSoloViewerModal';

const { width: SW } = Dimensions.get('window');
const COLS     = 2;
const H_PAD    = 12;
const CARD_GAP = 10;
const CARD_W   = (SW - H_PAD * 2 - CARD_GAP) / COLS;
const CARD_H   = Math.round(CARD_W * 1.52);

const PARTY_ACCENT = '#7C3AED';
const GOLD         = '#F59E0B';
const HOT_THRESHOLD = 10_000;

const SEAT_COLORS = [
  '#7C3AED','#A855F7','#EC4899','#F43F5E',
  '#F59E0B','#10B981','#3B82F6','#6366F1',
];

const FALLBACK_COLORS: Record<string, string> = {
  '#00A8CC': '#0EA5E9',
  '#9C27B0': '#A855F7',
  '#F44336': '#F43F5E',
  '#795548': '#92400E',
  '#FF9800': '#F59E0B',
  '#2196F3': '#3B82F6',
  '#E91E63': '#EC4899',
  '#0096C7': '#06B6D4',
};

// ── Banner Carousel ──────────────────────────────────────────────────────────
interface Banner {
  id: number;
  title: string;
  image_url: string;
  link_url: string;
  sort_order: number;
}

function HomeBanner() {
  const { width } = Dimensions.get('window');
  const bannerHeight = Math.round(width * 0.22);
  const [banners, setBanners]   = useState<Banner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [current, setCurrent]   = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchBanners = async () => {
      try {
        const headers: Record<string, string> = {};
        if (Platform.OS !== 'web') {
          const { getSession } = require('../../services/storage');
          const cookie = await getSession();
          if (cookie) headers['Cookie'] = cookie;
        }
        const opts: RequestInit = Platform.OS === 'web'
          ? { credentials: 'include' }
          : { headers };
        const res = await fetch(`${API_BASE}/api/banners`, opts);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setBanners(data.banners ?? []);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    };
    fetchBanners();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 900, useNativeDriver: true }).start(() => {
        setCurrent(prev => (prev + 1) % banners.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
      });
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, fadeAnim]);

  if (loading) {
    return (
      <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 8, height: bannerHeight, borderRadius: 14, backgroundColor: '#E8F4F8', overflow: 'hidden' }}>
        <LinearGradient
          colors={['#D0EEF8', '#B8E4F4', '#D0EEF8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: 14 }}
        />
      </View>
    );
  }

  if (banners.length === 0) {
    return (
      <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 8, height: bannerHeight, borderRadius: 14, overflow: 'hidden' }}>
        <LinearGradient
          colors={['#0D9488', '#00A8CC', '#0284C7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <Text style={{ fontSize: 28, marginBottom: 6 }}>🖼️</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
            Selamat Datang di max99!
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
            Banner promosi akan tampil di sini
          </Text>
        </LinearGradient>
      </View>
    );
  }

  const banner = banners[current];
  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 8 }}>
      <Animated.View style={{ opacity: fadeAnim, borderRadius: 14, overflow: 'hidden', height: bannerHeight }}>
        <Image
          source={{ uri: banner.image_url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        {banner.title ? (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 24 }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
              {banner.title}
            </Text>
          </LinearGradient>
        ) : null}
      </Animated.View>
      {banners.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 7, gap: 5 }}>
          {banners.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === current ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === current ? '#00A8CC' : 'rgba(0,0,0,0.20)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Animated LIVE badge ──────────────────────────────────────────────────────
function LiveBadge() {
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 2.5, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 650, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(350),
      ])
    ).start();
    return () => { pulseScale.stopAnimation(); pulseOpacity.stopAnimation(); };
  }, []);

  return (
    <View style={cardSt.liveBadge}>
      <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{
          position: 'absolute',
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: '#fff',
          transform: [{ scale: pulseScale }],
          opacity: pulseOpacity,
        }} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
      </View>
      <Text style={cardSt.liveTxt}>LIVE</Text>
    </View>
  );
}

// ── Animated HOT badge ────────────────────────────────────────────────────────
function HotBadge() {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    return () => glow.stopAnimation();
  }, []);

  const badgeOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  const badgeScale   = glow.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });

  return (
    <Animated.View style={[cardSt.hotBadge, { opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}>
      <Text style={cardSt.hotEmoji}>🔥</Text>
      <Text style={cardSt.hotTxt}>HOT</Text>
    </Animated.View>
  );
}

// ── Animated glow border for HOT rooms ────────────────────────────────────────
function HotGlowBorder() {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => glow.stopAnimation();
  }, []);

  const borderOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Animated.View style={[
      StyleSheet.absoluteFill,
      cardSt.hotGlowBorder,
      { opacity: borderOpacity },
    ]} />
  );
}

// ── Party Room Card ───────────────────────────────────────────────────────────
function PartyCard({ room, onPress }: { room: PartyRoom; onPress: () => void }) {
  const accent     = FALLBACK_COLORS[room.color] ?? PARTY_ACCENT;
  const accentDark = accent + 'CC';
  const [imgError, setImgError] = useState(false);
  const isHot = (room.totalCoins ?? 0) >= HOT_THRESHOLD;

  const outerGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isHot) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(outerGlow, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(outerGlow, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isHot]);

  const showAvatar = !!room.creatorAvatar && !imgError;
  const initial    = (room.creatorUsername ?? '?')[0].toUpperCase();

  const coinFmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

  return (
    <View style={cardSt.cardOuter}>
      {isHot && (
        <Animated.View style={[
          cardSt.hotShadowLayer,
          { opacity: outerGlow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
        ]} />
      )}

      <TouchableOpacity
        style={[cardSt.card, isHot && cardSt.cardHot]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {showAvatar ? (
          <Image
            source={{ uri: room.creatorAvatar! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={[accentDark, accent + '55', '#0A051A']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
          />
        )}

        {isHot && (
          <LinearGradient
            colors={['rgba(251,113,0,0.18)', 'transparent', 'rgba(239,68,68,0.12)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {!showAvatar && (
          <View style={cardSt.fallbackThumb}>
            <Text style={[cardSt.fallbackInitial, { color: accent }]}>{initial}</Text>
          </View>
        )}

        {isHot ? <HotGlowBorder /> : <View style={[cardSt.glowBorder, { borderColor: accent + '55' }]} />}

        <LinearGradient
          colors={['transparent', 'rgba(8,4,20,0.5)', 'rgba(8,4,20,0.92)']}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          style={cardSt.bottomGrad}
        />

        <LiveBadge />
        {isHot && <HotBadge />}

        <View style={cardSt.viewerBadge}>
          <Ionicons name="people" size={10} color="#fff" />
          <Text style={cardSt.viewerTxt}>{room.currentParticipants}</Text>
        </View>

        {room.isLocked && (
          <View style={cardSt.lockBadge}>
            <MaterialIcons name="lock" size={10} color={GOLD} />
          </View>
        )}

        {(room.totalCoins ?? 0) > 0 && (
          <View style={[cardSt.coinBadge, isHot && cardSt.coinBadgeHot]}>
            <Text style={cardSt.coinEmoji}>🪙</Text>
            <Text style={[cardSt.coinTxt, isHot && cardSt.coinTxtHot]}>
              {coinFmt(room.totalCoins ?? 0)}
            </Text>
          </View>
        )}

        <View style={cardSt.infoOverlay}>
          <Text style={cardSt.roomName} numberOfLines={2}>{room.name}</Text>
          <View style={cardSt.hostRow}>
            <View style={[cardSt.hostDot, { backgroundColor: isHot ? '#F97316' : accent }]} />
            <Text style={cardSt.hostTxt} numberOfLines={1}>@{room.creatorUsername ?? '—'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const MAX_OPEN_PRIVATE_TABS = 5;

export default function HomeScreen() {
  const theme = useAppTheme();

  const party = useParty();
  const { openPartyRoom } = party;

  const [rooms,        setRooms]        = useState<PartyRoom[]>([]);
  const [streams,      setStreams]      = useState<LiveStream[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [fabLoading,   setFabLoading]   = useState(false);
  const [activeTab,       setActiveTab]       = useState<'all' | 'party' | 'solo'>('all');
  const [hostModalVisible,   setHostModalVisible]   = useState(false);
  const [viewerStream,       setViewerStream]       = useState<LiveStream | null>(null);
  const [currentUser, setCurrentUser]  = useState<{
    username: string; displayName?: string | null; migLevel?: number
  } | null>(null);

  const fabScale    = useRef(new Animated.Value(1)).current;
  const fabPulse    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.delay(400),
      ])
    ).start();
    return () => fabPulse.stopAnimation();
  }, []);

  const [openPrivateChats,      setOpenPrivateChats]      = useState<PrivateChat[]>([]);
  const [activePrivateChatId,   setActivePrivateChatId]   = useState<string | null>(null);
  const [privateChatModalVisible, setPrivateChatModalVisible] = useState(false);
  const [choiceModalVisible,    setChoiceModalVisible]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe();
        if (!u) return;
        const headers = await buildHeaders();
        const profileRes = await fetch(`${API_BASE}/api/profile/me`, {
          headers: headers as Record<string, string>,
          ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
        });
        let migLevel = 1;
        if (profileRes.ok) {
          const d = await profileRes.json();
          migLevel = d?.profile?.migLevel ?? 1;
        }
        setCurrentUser({ username: u.username, displayName: u.displayName ?? null, migLevel });
      } catch {}
    })();
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const [partyData, soloData] = await Promise.all([
        fetchPartyRooms(),
        fetchLiveStreams(),
      ]);
      setRooms(partyData as PartyRoom[]);
      setStreams(soloData);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRooms();
      const interval = setInterval(fetchRooms, 30_000);
      return () => clearInterval(interval);
    }, [fetchRooms])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRooms();
  }, [fetchRooms]);

  const pressFab = () => {
    if (!currentUser) return;
    Animated.sequence([
      Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, speed: 40 }),
      Animated.spring(fabScale, { toValue: 1,    useNativeDriver: true, speed: 30 }),
    ]).start();
    setChoiceModalVisible(true);
  };

  const handlePartyChoice = async () => {
    setChoiceModalVisible(false);
    if (!currentUser) return;
    setFabLoading(true);
    try {
      const latestRooms = await fetchPartyRooms();
      setRooms(latestRooms as PartyRoom[]);
      const mine = (latestRooms as PartyRoom[]).find(r => r.creatorUsername === currentUser.username);
      if (mine) { openPartyRoom(mine); return; }
      const result = await createPartyRoom({
        name:        `${currentUser.displayName ?? currentUser.username}'s Party`,
        description: 'Livi Party Audio Room',
        color:       SEAT_COLORS[Math.floor(Math.random() * SEAT_COLORS.length)],
      });
      if (!result.ok || !result.room) return;
      const newRoom: PartyRoom = { ...result.room, creatorUsername: result.room.creatorUsername ?? currentUser.username };
      setRooms(prev => [newRoom, ...prev]);
      openPartyRoom(newRoom);
    } finally {
      setFabLoading(false);
    }
  };

  const handleLiveSoloChoice = () => {
    setChoiceModalVisible(false);
    setHostModalVisible(true);
  };

  const handleRemovePrivateChat = useCallback((chatId: string) => {
    setOpenPrivateChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      if (next.length === 0) {
        setActivePrivateChatId(null);
        setPrivateChatModalVisible(false);
      } else if (activePrivateChatId === chatId) {
        setActivePrivateChatId(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
  }, [activePrivateChatId]);

  const handleOpenPrivateChatFromParty = useCallback(async (username: string, displayName: string) => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/chatsync/conversations/private`, {
        method: 'POST',
        headers: { ...(headers as Record<string, string>), 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: username }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); Alert.alert('Private chat', d.message ?? 'Tidak dapat membuka private chat.'); return; }
      const data = await res.json();
      const conv = data.conversation;
      const chatEntry: PrivateChat = {
        id: conv.id,
        peerUsername: username,
        peerDisplayName: displayName || username,
        color: conv.avatarColor ?? '#4CAF50',
      };
      setOpenPrivateChats(prev => {
        const exists = prev.find(c => c.id === conv.id);
        if (exists) return prev;
        return prev.length >= 5 ? [...prev.slice(1), chatEntry] : [...prev, chatEntry];
      });
      setActivePrivateChatId(conv.id);
      setPrivateChatModalVisible(true);
    } catch {
      Alert.alert('Error', 'Tidak dapat membuka private chat saat ini.');
    }
  }, []);

  // ── Unified feed items ───────────────────────────────────────────────────
  type FeedItem =
    | { type: 'party'; id: string; room: PartyRoom }
    | { type: 'solo';  id: string; stream: LiveStream };

  const feedItems: FeedItem[] = (() => {
    const partyItems: FeedItem[] = rooms.map(r => ({ type: 'party', id: `p-${r.id}`, room: r }));
    const soloItems:  FeedItem[] = streams.map(s => ({ type: 'solo',  id: `s-${s.id}`, stream: s }));
    if (activeTab === 'party') return partyItems;
    if (activeTab === 'solo')  return soloItems;
    // 'all': interleave solo + party sorted by viewers desc
    const combined = [...soloItems, ...partyItems];
    combined.sort((a, b) => {
      const va = a.type === 'solo' ? a.stream.viewerCount : (a.room.currentParticipants ?? 0);
      const vb = b.type === 'solo' ? b.stream.viewerCount : (b.room.currentParticipants ?? 0);
      return vb - va;
    });
    return combined;
  })();

  const TAB_LABELS: { key: 'all'|'party'|'solo'; label: string; icon: string; color: string }[] = [
    { key: 'all',   label: 'Semua',    icon: 'view-grid',      color: '#6366F1' },
    { key: 'party', label: 'Party',    icon: 'microphone',     color: PARTY_ACCENT },
    { key: 'solo',  label: 'Live Solo',icon: 'video',          color: '#EC4899' },
  ];

  return (
    <View style={[st.screen, { backgroundColor: theme.screenBg }]}>
      <HomeBanner />

      {/* ── Tab Filter ── */}
      <View style={tabSt.wrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tabSt.scroll}>
          {TAB_LABELS.map(t => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[tabSt.pill, active && { backgroundColor: t.color }]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={13}
                  color={active ? '#fff' : 'rgba(0,0,0,0.4)'}
                />
                <Text style={[tabSt.pillTxt, active && tabSt.pillTxtActive]}>{t.label}</Text>
                {t.key !== 'all' && (
                  <View style={[tabSt.countBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[tabSt.countTxt, active && { color: '#fff' }]}>
                      {t.key === 'party' ? rooms.length : streams.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={PARTY_ACCENT} size="large" />
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            if (item.type === 'solo') {
              return (
                <LiveSoloCard
                  stream={item.stream}
                  cardW={CARD_W}
                  cardH={CARD_H}
                  onPress={() => setViewerStream(item.stream)}
                />
              );
            }
            return <PartyCard room={item.room} onPress={() => openPartyRoom(item.room)} />;
          }}
          numColumns={COLS}
          key={`cols-${COLS}-${activeTab}`}
          columnWrapperStyle={st.row}
          contentContainerStyle={[st.list, feedItems.length === 0 && st.listEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={PARTY_ACCENT}
              colors={[PARTY_ACCENT]}
            />
          }
          ListEmptyComponent={
            <View style={st.empty}>
              <MaterialCommunityIcons
                name={activeTab === 'solo' ? 'video-off' : 'music-off'}
                size={64}
                color={(activeTab === 'solo' ? '#EC4899' : PARTY_ACCENT) + '33'}
              />
              <Text style={[st.emptyTitle, { color: theme.textSecondary }]}>
                {activeTab === 'solo' ? 'Belum ada Live Solo aktif' : 'Belum ada room aktif'}
              </Text>
              <Text style={[st.emptySub, { color: theme.textSecondary }]}>
                {activeTab === 'solo'
                  ? 'Host perempuan agency bisa mulai live dari tombol di bawah'
                  : 'Buat party room baru lewat tombol di bawah'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB: Go Party — circular right-side button */}
      <Animated.View style={[fabSt.wrap, { transform: [{ scale: fabScale }] }]}>
        <Animated.View style={[fabSt.pulseRing, {
          opacity: fabPulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: fabPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        }]} />
        <TouchableOpacity onPress={pressFab} activeOpacity={0.82} disabled={fabLoading} style={fabSt.outerShadow}>
          <LinearGradient
            colors={['#E040FB', '#9333EA', '#6D28D9']}
            style={fabSt.circle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {fabLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialCommunityIcons name="microphone-plus" size={26} color="#fff" />
            }
          </LinearGradient>
        </TouchableOpacity>
        <Text style={fabSt.fabLabel}>Party</Text>
      </Animated.View>

      <GoPartyChoiceModal
        visible={choiceModalVisible}
        onClose={() => setChoiceModalVisible(false)}
        onSelectParty={handlePartyChoice}
        onSelectLiveSolo={handleLiveSoloChoice}
      />

      <LiveSoloHostModal
        visible={hostModalVisible}
        currentUser={currentUser}
        onClose={() => setHostModalVisible(false)}
      />

      <LiveSoloViewerModal
        visible={viewerStream !== null}
        stream={viewerStream}
        currentUser={currentUser}
        onClose={() => setViewerStream(null)}
      />

      <MultiRoomChatModal
        visible={privateChatModalVisible}
        openPrivateChats={openPrivateChats}
        openRooms={[]}
        activeTabId={activePrivateChatId}
        currentUserId={currentUser?.username ?? null}
        onMinimize={() => setPrivateChatModalVisible(false)}
        onRemoveRoom={() => {}}
        onRemovePrivateChat={handleRemovePrivateChat}
        onChangeActiveTab={(id) => setActivePrivateChatId(id)}
        onOpenPrivateChat={() => {}}
        onIncomingPrivateChat={(convId, peerUsername, peerDisplayName) => {
          const chatEntry: PrivateChat = {
            id: convId,
            peerUsername,
            peerDisplayName,
            color: '#4CAF50',
          };
          setOpenPrivateChats(prev => {
            const exists = prev.find(c => c.id === convId);
            if (exists) return prev;
            return prev.length >= MAX_OPEN_PRIVATE_TABS
              ? [...prev.slice(1), chatEntry]
              : [...prev, chatEntry];
          });
          setActivePrivateChatId(convId);
        }}
      />
    </View>
  );
}

/* ── Card styles ─────────────────────────────────────────────────────────── */
const cardSt = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A0A35',
    elevation: 8,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  bottomGrad: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: CARD_H * 0.52,
  },
  liveBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EF4444',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    shadowColor: '#EF4444',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  liveTxt: {
    color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8,
  },
  viewerBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  viewerTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  lockBadge: {
    position: 'absolute', top: 36, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  infoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 10, paddingBottom: 10, paddingTop: 6,
    gap: 4,
  },
  roomName: {
    fontSize: 13, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 17,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hostDot: { width: 6, height: 6, borderRadius: 3 },
  hostTxt: {
    fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500',
    flexShrink: 1,
  },
  fallbackThumb: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitial: {
    fontSize: CARD_W * 0.32,
    fontWeight: '900',
    opacity: 0.35,
    letterSpacing: -1,
  },
  coinBadge: {
    position: 'absolute',
    bottom: 52, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 0.5, borderColor: 'rgba(245,158,11,0.5)',
  },
  coinBadgeHot: {
    backgroundColor: 'rgba(251,113,0,0.25)',
    borderColor: '#F97316', borderWidth: 1,
  },
  coinEmoji: { fontSize: 9 },
  coinTxt: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
  coinTxtHot: { color: '#FF6B00', fontWeight: '900' },

  cardOuter: {
    width: CARD_W,
    position: 'relative',
  },
  cardHot: {
    borderWidth: 0,
  },
  hotShadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: 'transparent',
    shadowColor: '#F97316',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  hotGlowBorder: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F97316',
  },
  hotBadge: {
    position: 'absolute', top: 36, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(249,115,22,0.92)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
    shadowColor: '#F97316',
    shadowOpacity: 0.8, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  hotEmoji: { fontSize: 9 },
  hotTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
});

/* ── Screen styles ───────────────────────────────────────────────────────── */
const st = StyleSheet.create({
  screen:    { flex: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:       { gap: CARD_GAP, marginBottom: CARD_GAP, paddingHorizontal: H_PAD },
  list:      { paddingTop: 10, paddingBottom: 120 },
  listEmpty: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySub:   { fontSize: 13, textAlign: 'center', opacity: 0.7 },
});

/* ── FAB styles ──────────────────────────────────────────────────────────── */
const fabSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    alignItems: 'center',
  },
  outerShadow: {
    shadowColor: '#9333EA',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
    borderRadius: 34,
  },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  fabLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  pulseRing: {
    position: 'absolute',
    width: 62, height: 62,
    borderRadius: 31,
    backgroundColor: '#A855F7',
  },
  shimmer:   {},
  iconWrap:  {},
  textCol:   {},
  pillTitle: {},
  pillSub:   {},
  pill:      {},
});

/* ── Tab filter styles ───────────────────────────────────────────────────── */
const tabSt = StyleSheet.create({
  wrap: {
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 7,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  pillTxt: {
    fontSize: 12.5, fontWeight: '600',
    color: 'rgba(0,0,0,0.45)',
  },
  pillTxtActive: { color: '#fff' },
  countBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: 'rgba(0,0,0,0.09)',
  },
  countTxt: { fontSize: 10, fontWeight: '800', color: 'rgba(0,0,0,0.38)' },
});
