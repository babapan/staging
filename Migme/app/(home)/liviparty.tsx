import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { API_BASE, buildHeaders } from '../../services/auth';
import { useAppTheme } from '../../services/themeContext';
import { type PartyRoom } from '../../components/PartyRoomModal';
import MultiRoomChatModal, { type PrivateChat } from '../../components/MultiRoomChatModal';
import { fetchPartyRooms, createPartyRoom } from '../../services/partyService';
import { useParty } from '../../contexts/PartyContext';
import GoPartyChoiceModal from '../../components/GoPartyChoiceModal';

const { width: SW } = Dimensions.get('window');
const COLS     = 2;
const H_PAD    = 12;
const CARD_GAP = 10;
const CARD_W   = (SW - H_PAD * 2 - CARD_GAP) / COLS;
const CARD_H   = Math.round(CARD_W * 1.52);

const PARTY_ACCENT = '#7C3AED';
const GOLD         = '#F59E0B';

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

const HOT_THRESHOLD = 10_000;

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

// ── Animated glow border for HOT rooms ───────────────────────────────────────
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

// ── Party Room Card ──────────────────────────────────────────────────────────
function PartyCard({ room, onPress }: { room: PartyRoom; onPress: () => void }) {
  const accent     = FALLBACK_COLORS[room.color] ?? PARTY_ACCENT;
  const accentDark = accent + 'CC';
  const [imgError, setImgError] = useState(false);
  const isHot = (room.totalCoins ?? 0) >= HOT_THRESHOLD;

  // Animated outer shadow glow for hot rooms
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
      {/* Outer glow shadow layer for HOT rooms */}
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
        {/* Background: avatar photo or gradient */}
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

        {/* HOT warm overlay tint */}
        {isHot && (
          <LinearGradient
            colors={['rgba(251,113,0,0.18)', 'transparent', 'rgba(239,68,68,0.12)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {/* Fallback thumbnail: initial letter centred on card */}
        {!showAvatar && (
          <View style={cardSt.fallbackThumb}>
            <Text style={[cardSt.fallbackInitial, { color: accent }]}>{initial}</Text>
          </View>
        )}

        {/* Border effect — animated orange for HOT, subtle accent otherwise */}
        {isHot ? <HotGlowBorder /> : <View style={[cardSt.glowBorder, { borderColor: accent + '55' }]} />}

        {/* Bottom text gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(8,4,20,0.5)', 'rgba(8,4,20,0.92)']}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          style={cardSt.bottomGrad}
        />

        {/* ── Top badges ── */}
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

        {/* ── Coin badge (only if room has earnings) ── */}
        {(room.totalCoins ?? 0) > 0 && (
          <View style={[cardSt.coinBadge, isHot && cardSt.coinBadgeHot]}>
            <Text style={cardSt.coinEmoji}>🪙</Text>
            <Text style={[cardSt.coinTxt, isHot && cardSt.coinTxtHot]}>
              {coinFmt(room.totalCoins ?? 0)}
            </Text>
          </View>
        )}

        {/* ── Bottom info overlay ── */}
        <View style={cardSt.infoOverlay}>
          <Text style={cardSt.roomName} numberOfLines={2}>{room.name}</Text>
          <View style={cardSt.hostRow}>
            <View style={[cardSt.hostDot, { backgroundColor: isHot ? '#F97316' : accent }]} />
            <Text style={cardSt.hostTxt} numberOfLines={1}>{room.creatorUsername ?? '—'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function LivePartyScreen() {
  const insets = useSafeAreaInsets();

  const party = useParty();
  const { openRoom, currentUser, openPartyRoom, rooms, setRooms, onRoomUpdated } = party;

  const [search,          setSearch]          = useState('');
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [fabLoading,      setFabLoading]      = useState(false);
  const [choiceModalVisible,      setChoiceModalVisible]      = useState(false);
  const [openPrivateChats,        setOpenPrivateChats]        = useState<PrivateChat[]>([]);
  const [activePrivateChatId,     setActivePrivateChatId]     = useState<string | null>(null);
  const [privateChatModalVisible, setPrivateChatModalVisible] = useState(false);

  const fabScale = useRef(new Animated.Value(1)).current;
  const fabPulse = useRef(new Animated.Value(0)).current;

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

  const openRoomRef = useRef<PartyRoom | null>(null);
  openRoomRef.current = openRoom;

  const fetchRooms = useCallback(async () => {
    try {
      const data = await fetchPartyRooms();
      setRooms(data as PartyRoom[]);
      // Jika ada room yang sedang dibuka, sync data terbaru supaya modal tidak hilang
      const current = openRoomRef.current;
      if (current) {
        const fresh = (data as PartyRoom[]).find(r => String(r.id) === String(current.id));
        if (fresh) onRoomUpdated(fresh);
      }
    } catch { } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setRooms, onRoomUpdated]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchRooms();
      const interval = setInterval(() => { fetchRooms(); }, 30_000);
      return () => clearInterval(interval);
    }, [fetchRooms])
  );

  const onRefresh = () => { setRefreshing(true); fetchRooms(); };

  const handleOpenPrivateChat = useCallback(async (username: string, displayName: string) => {
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

  const pressFab = () => {
    if (!currentUser) { Alert.alert('Error', 'Kamu harus login terlebih dahulu'); return; }
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
      if (!result.ok || !result.room) { Alert.alert('Error', result.error ?? 'Gagal membuat party room'); return; }
      const newRoom: PartyRoom = { ...result.room, creatorUsername: result.room.creatorUsername ?? currentUser.username };
      setRooms(prev => [newRoom, ...prev]);
      openPartyRoom(newRoom);
    } catch {
      Alert.alert('Error', 'Koneksi bermasalah, coba lagi');
    } finally {
      setFabLoading(false);
    }
  };

  const handleLiveSoloChoice = () => {
    setChoiceModalVisible(false);
    Alert.alert(
      '🎬 Live Solo',
      'Fitur Live Solo sedang dalam pengembangan. Segera hadir untuk host perempuan agency!',
      [{ text: 'OK' }]
    );
  };

  const myActiveRoom = useMemo(
    () => rooms.find(r => r.creatorUsername === currentUser?.username) ?? null,
    [rooms, currentUser],
  );

  const pressRoom = useCallback((room: PartyRoom) => {
    const isMyRoom = room.creatorUsername === currentUser?.username;
    if (!isMyRoom && myActiveRoom) {
      Alert.alert(
        'Tinggalkan Room?',
        'Kamu sedang meng-host room. Apakah kamu yakin ingin keluar dari room-mu dan masuk room ini?',
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Ya, Masuk', style: 'destructive', onPress: () => openPartyRoom(room) },
        ],
      );
      return;
    }
    openPartyRoom(room);
  }, [currentUser, myActiveRoom, openPartyRoom]);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.creatorUsername ?? '').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  }, [rooms, search]);

  const ListEmpty = loading ? (
    <View style={screenSt.emptyWrap}>
      <ActivityIndicator color={PARTY_ACCENT} size="large" />
      <Text style={screenSt.emptyLoadingTxt}>Memuat party room...</Text>
    </View>
  ) : (
    <View style={screenSt.emptyWrap}>
      <MaterialCommunityIcons name="music-off" size={64} color={PARTY_ACCENT + '33'} />
      <Text style={screenSt.emptyTitle}>Sepi banget... kayak chat kamu sama mantan 👻</Text>
      <Text style={screenSt.emptySub}>Mending bikin party biar rame lagi</Text>
    </View>
  );

  return (
    <LinearGradient
      colors={['#FFFFFF', '#E8F8F0', '#C6EFDA']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={screenSt.screen}
    >

      {/* ── Search bar + trophy ── */}
      <View style={searchSt.bar}>
        <View style={searchSt.inputWrap}>
          <MaterialIcons name="search" size={18} color="rgba(0,0,0,0.35)" />
          <TextInput
            style={searchSt.input}
            placeholder="Cari party room atau host..."
            placeholderTextColor="rgba(0,0,0,0.32)"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="cancel" size={16} color="rgba(0,0,0,0.35)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 2-column Room grid ── */}
      <FlatList
        data={filteredRooms}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <PartyCard room={item} onPress={() => pressRoom(item)} />}
        ListEmptyComponent={ListEmpty}
        numColumns={COLS}
        key={`cols-${COLS}`}
        columnWrapperStyle={screenSt.row}
        contentContainerStyle={[screenSt.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      {/* ── FAB: Go Party — circular right-side button ── */}
      <Animated.View style={[fabSt.wrap, { transform: [{ scale: fabScale }], bottom: insets.bottom + 90 }]}>
        {/* Pulse glow ring */}
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

      <MultiRoomChatModal
        visible={privateChatModalVisible}
        openPrivateChats={openPrivateChats}
        openRooms={[]}
        activeTabId={activePrivateChatId}
        currentUserId={currentUser?.username ?? null}
        onMinimize={() => setPrivateChatModalVisible(false)}
        onRemoveRoom={() => {}}
        onRemovePrivateChat={(chatId) => {
          setOpenPrivateChats(prev => {
            const next = prev.filter(c => c.id !== chatId);
            if (next.length === 0) { setActivePrivateChatId(null); setPrivateChatModalVisible(false); }
            else if (activePrivateChatId === chatId) setActivePrivateChatId(next[next.length - 1]?.id ?? null);
            return next;
          });
        }}
        onChangeActiveTab={(id) => setActivePrivateChatId(id)}
        onOpenPrivateChat={handleOpenPrivateChat}
        onIncomingPrivateChat={() => {}}
      />

    </LinearGradient>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */
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
    bottom: 52,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(245,158,11,0.5)',
  },
  coinBadgeHot: {
    backgroundColor: 'rgba(251,113,0,0.25)',
    borderColor: '#F97316',
    borderWidth: 1,
  },
  coinEmoji: { fontSize: 9 },
  coinTxt: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
  coinTxtHot: { color: '#FF6B00', fontWeight: '900' },

  // ── HOT card styles ──────────────────────────────────────────────────────────
  cardOuter: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
  },
  cardHot: {
    elevation: 18,
    shadowColor: '#F97316',
    shadowOpacity: 0.75,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  hotShadowLayer: {
    position: 'absolute',
    top: -4, bottom: -4, left: -4, right: -4,
    borderRadius: 20,
    backgroundColor: 'transparent',
    shadowColor: '#F97316',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
    borderWidth: 2,
    borderColor: 'rgba(249,115,22,0.6)',
  },
  hotGlowBorder: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F97316',
  },
  hotBadge: {
    position: 'absolute',
    top: 30,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(249,115,22,0.92)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#F97316',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,200,100,0.5)',
  },
  hotEmoji: { fontSize: 9 },
  hotTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(200,50,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

const screenSt = StyleSheet.create({
  screen:    { flex: 1 },
  list:      { paddingHorizontal: H_PAD, paddingTop: 10 },
  row:       { gap: CARD_GAP, marginBottom: CARD_GAP },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyLoadingTxt: { fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 4 },
  emptyTitle:{ fontSize: 15, fontWeight: '700', color: 'rgba(0,0,0,0.55)', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },
  emptySub:  { fontSize: 13, color: PARTY_ACCENT, fontWeight: '600', textAlign: 'center' },
});

const searchSt = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: H_PAD, paddingVertical: 10, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 22, paddingHorizontal: 12, paddingVertical: 9,
    gap: 7,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: { flex: 1, fontSize: 13, color: '#111', paddingVertical: 0 },
});

const fabSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
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
