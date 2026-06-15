/**
 * SoloGiftPickerSheet.tsx
 *
 * Bottom-sheet gift picker for Solo Live (Host & Viewer).
 * - Tabs: Popular | Lucky | Costume Set | Luxury | My Bag
 * - Fetches from /api/party/gifts (same endpoint as Party Room)
 * - Lucky tab → no effect flag passed (JP nature)
 * - Luxury tab → largest effect
 * - Host can send gift to themselves (selfGift mode)
 * - Viewer sends to host via /api/live/streams/:id/gift
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import LottieView from 'lottie-react-native';
import { useVideoPlayerSafe, VideoViewSafe } from '../utils/videoPlayer';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE, buildHeaders } from '../services/auth';

const { width: SW, height: SH } = Dimensions.get('window');

const DARK_BG  = '#0E0C1E';
const PANEL_BG = '#16132B';
const CARD_BG  = '#1E1A34';
const PINK     = '#FF6B9D';
const ORANGE   = '#F97316';
const GOLD     = '#F59E0B';
const LUXURY_GLOW = '#C084FC';

const SOLO_GIFT_TABS = [
  { label: 'Popular',     category: 'Populer'   },
  { label: 'Lucky',       category: 'Lucky'      },
  { label: 'Costume Set', category: 'Set Kostum' },
  { label: 'Luxury',      category: 'Luxury'     },
  { label: 'My Bag',      category: 'Tas saya'   },
] as const;
type SoloGiftTab = typeof SOLO_GIFT_TABS[number]['label'];

const QTY_OPTIONS = [1, 3, 9, 99, 199];

interface VirtualGift {
  id:        string;
  name:      string;
  hotKey:    string | null;
  price:     number;
  imageUrl?: string | null;
  lottieUrl?: string | null;
  videoUrl?: string | null;
  isPremium?: boolean;
  category?: string;
}

export interface SoloGiftSentInfo {
  giftId:      string;
  giftName:    string;
  giftEmoji:   string;
  giftImageUrl?: string | null;
  lottieUrl:   string | null;
  videoUrl:    string | null;
  price:       number;
  qty:         number;
  category:    string;
  noEffect:    boolean;
}

interface Props {
  visible:         boolean;
  onClose:         () => void;
  streamId:        string;
  currentUsername: string;
  isSelfGift?:     boolean;
  onGiftSent?:     (info: SoloGiftSentInfo) => void;
}

function GiftCard({
  gift, selected, index, isLucky, isLuxury, onPress,
}: {
  gift: VirtualGift;
  selected: boolean;
  index: number;
  isLucky: boolean;
  isLuxury: boolean;
  onPress: () => void;
}) {
  const floatY     = useSharedValue(0);
  const scale      = useSharedValue(1);
  const [videoErr, setVideoErr] = useState(false);

  const videoPlayer = useVideoPlayerSafe(
    gift.videoUrl ? { uri: gift.videoUrl } : null,
    (p: any) => {
      p.loop  = true;
      p.muted = true;
      if (gift.videoUrl) p.play();
    },
  );

  useEffect(() => {
    if (!gift.videoUrl) return;
    const sub = videoPlayer.addListener('statusChange', ({ status }: { status: string }) => {
      if (status === 'error') setVideoErr(true);
    });
    return () => sub.remove();
  }, [videoPlayer]);

  useEffect(() => {
    floatY.value = withDelay(
      (index % 6) * 150,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 900 }),
          withTiming(0,  { duration: 900 }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withTiming(1.22, { duration: 110 }),
        withTiming(1.0,  { duration: 130 }),
      );
    }
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: scale.value }],
  }));

  const glowColor = isLuxury ? LUXURY_GLOW : ORANGE;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[
        gst.card,
        selected && { borderColor: glowColor, borderWidth: 2 },
        isLuxury && gst.luxuryCard,
      ]}
    >
      {isLuxury && (
        <View style={gst.luxuryBadge}>
          <Text style={gst.luxuryBadgeTxt}>✨</Text>
        </View>
      )}
      {isLucky && (
        <View style={gst.luckyBadge}>
          <Text style={gst.luckyBadgeTxt}>JP</Text>
        </View>
      )}
      <Reanimated.View style={[gst.imgWrap, animStyle, selected && { shadowColor: glowColor, shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 }]}>
        {gift.videoUrl && !videoErr ? (
          <VideoViewSafe
            player={videoPlayer}
            style={[gst.media, { backgroundColor: 'transparent' }]}
            contentFit="contain"
            nativeControls={false}
          />
        ) : gift.lottieUrl ? (
          <LottieView
            source={{ uri: gift.lottieUrl }}
            autoPlay
            loop
            style={gst.media}
          />
        ) : gift.imageUrl ? (
          <Image source={{ uri: gift.imageUrl }} style={gst.media} resizeMode="contain" />
        ) : (
          <Text style={gst.emoji}>{gift.hotKey ?? '🎁'}</Text>
        )}
      </Reanimated.View>

      <Text style={[gst.name, selected && { color: glowColor }]} numberOfLines={1}>
        {gift.name}
      </Text>
      <View style={gst.priceRow}>
        <Text style={gst.coin}>🪙</Text>
        <Text style={gst.price}>{gift.price.toLocaleString()}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SoloGiftPickerSheet({
  visible, onClose, streamId, currentUsername, isSelfGift = false, onGiftSent,
}: Props) {
  const insets        = useSafeAreaInsets();
  const slideAnim     = useRef(new Animated.Value(SH)).current;
  const [activeTab,   setActiveTab]   = useState<SoloGiftTab>('Popular');
  const [gifts,       setGifts]       = useState<VirtualGift[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selectedGift, setSelectedGift] = useState<VirtualGift | null>(null);
  const [qty,         setQty]         = useState(1);
  const [qtyOpen,     setQtyOpen]     = useState(false);
  const [balance,     setBalance]     = useState<number | null>(null);
  const [sending,     setSending]     = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);
  const toastTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [milestonePopup, setMilestonePopup] = useState<{ milestone: number; rewardCoins: number } | null>(null);
  const milestoneTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── JP Cring state ────────────────────────────────────────────────────────
  const [jpPopup, setJpPopup] = useState<{ reward: number; type: 'normal' | 'jackpot'; threshold: number } | null>(null);
  const jpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-create 25 coin Animated.Values (max jackpot count) — never recreated
  const JP_COINS = useRef(
    Array.from({ length: 25 }, () => {
      const y   = new Animated.Value(-50);
      const op  = new Animated.Value(0);
      const rot = new Animated.Value(0);
      const rotation = rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
      return { y, op, rot, rotation };
    })
  ).current;

  // Fixed random layout data per coin — stable across triggers
  const JP_COIN_DATA = useRef(
    Array.from({ length: 25 }, () => ({
      x:     10 + Math.random() * (SW - 50),
      size:  16 + Math.random() * 18,
      speed: 0.65 + Math.random() * 0.7,
      delay: Math.random() * 550,
    }))
  ).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 58, friction: 12 }).start();
      loadGifts();
      loadBalance();
    } else {
      Animated.timing(slideAnim, { toValue: SH, duration: 240, useNativeDriver: true }).start();
      setSelectedGift(null);
      setQtyOpen(false);
    }
  }, [visible]);

  const loadGifts = async () => {
    setLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/gifts`, { headers });
      if (res.ok) {
        const data = await res.json();
        setGifts(data.gifts ?? []);
      }
    } catch {}
    setLoading(false);
  };

  const loadBalance = async () => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/credit/balance/${currentUsername}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance ?? 0);
      }
    } catch {}
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ── JP Cring helpers ──────────────────────────────────────────────────────
  const playCringSound = useCallback(async (isJackpot: boolean) => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.mp3'),
        { shouldPlay: true, rate: isJackpot ? 1.7 : 1.3, shouldCorrectPitch: false }
      );
      sound.setOnPlaybackStatusUpdate((st: any) => {
        if (st.isLoaded && st.didJustFinish) sound.unloadAsync();
      });
      if (isJackpot) {
        setTimeout(async () => {
          try {
            const { sound: s2 } = await Audio.Sound.createAsync(
              require('../assets/sounds/notification.mp3'),
              { shouldPlay: true, rate: 1.9, shouldCorrectPitch: false }
            );
            s2.setOnPlaybackStatusUpdate((st: any) => {
              if (st.isLoaded && st.didJustFinish) s2.unloadAsync();
            });
          } catch {}
        }, 270);
      }
    } catch {}
  }, []);

  const triggerJP = useCallback((reward: number, type: 'normal' | 'jackpot', threshold: number) => {
    const coinCount = type === 'jackpot' ? 25 : 12;

    JP_COINS.forEach((coin, i) => {
      if (i >= coinCount) return;
      const d = JP_COIN_DATA[i];
      coin.y.setValue(-50);
      coin.op.setValue(0);
      coin.rot.setValue(0);
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(coin.y, {
            toValue:        SH + 60,
            duration:       Math.round(1300 * d.speed),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(coin.op, { toValue: 1, duration: 80,  useNativeDriver: true }),
            Animated.timing(coin.op, { toValue: 0, duration: 350, delay: Math.round(800 * d.speed), useNativeDriver: true }),
          ]),
          Animated.timing(coin.rot, {
            toValue:        360 * 2,
            duration:       Math.round(1300 * d.speed),
            useNativeDriver: true,
          }),
        ]).start();
      }, Math.round(d.delay));
    });

    playCringSound(type === 'jackpot');
    setJpPopup({ reward, type, threshold });

    if (jpTimer.current) clearTimeout(jpTimer.current);
    jpTimer.current = setTimeout(() => {
      setJpPopup(null);
      setSelectedGift(null);
      onClose();
    }, type === 'jackpot' ? 3500 : 2800);
  }, [JP_COINS, JP_COIN_DATA, playCringSound, onClose]);

  const activeCategory = SOLO_GIFT_TABS.find(t => t.label === activeTab)?.category ?? 'Populer';
  const filteredGifts  = gifts.filter(g => {
    if (activeTab === 'My Bag') return g.category === 'Tas saya';
    return g.category === activeCategory;
  });

  const isLuckyTab   = activeTab === 'Lucky';
  const isLuxuryTab  = activeTab === 'Luxury';
  const totalCost    = selectedGift ? selectedGift.price * qty : 0;
  const canSend      = !!selectedGift && (balance === null || balance >= totalCost) && !sending;

  const handleSend = useCallback(async () => {
    if (!selectedGift || sending) return;
    setSending(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/live/streams/${streamId}/gift`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftName:    selectedGift.name,
          amountCoins: selectedGift.price * qty,
          giftId:      selectedGift.id,
          qty,
          isSelfGift:  isSelfGift || false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message ?? 'Gagal mengirim gift');
        return;
      }
      // Deduct cost; add any JP cashback immediately so balance reflects reality
      setBalance(b => b !== null ? Math.max(0, b - totalCost) + (data.jpReward ?? 0) : null);

      onGiftSent?.({
        giftId:      selectedGift.id,
        giftName:    selectedGift.name,
        giftEmoji:   selectedGift.hotKey ?? '🎁',
        giftImageUrl: selectedGift.imageUrl ?? null,
        lottieUrl:   selectedGift.lottieUrl ?? null,
        videoUrl:    selectedGift.videoUrl  ?? null,
        price:       selectedGift.price,
        qty,
        category:    selectedGift.category ?? activeCategory,
        noEffect:    isLuckyTab,
      });

      // Show drop celebration if applicable; then JP Cring if triggered
      if (data.milestoneHits && data.milestoneHits.length > 0) {
        const totalCoins = data.milestoneHits.reduce((s: number, h: { rewardCoins: number }) => s + h.rewardCoins, 0);
        const topMs      = data.milestoneHits[data.milestoneHits.length - 1]?.milestone ?? 0;
        const dropCount  = data.milestoneHits.length;
        setMilestonePopup({ milestone: topMs, rewardCoins: totalCoins, dropCount } as any);
        if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
        milestoneTimer.current = setTimeout(() => {
          setMilestonePopup(null);
          if (data.jpReward) {
            triggerJP(data.jpReward, data.jpType ?? 'normal', data.jpThreshold ?? 500);
          } else {
            setSelectedGift(null);
            onClose();
          }
        }, 3500);
      } else if (data.jpReward) {
        triggerJP(data.jpReward, data.jpType ?? 'normal', data.jpThreshold ?? 500);
      } else {
        setSelectedGift(null);
        onClose();
      }
    } catch {
      showToast('Koneksi bermasalah');
    } finally {
      setSending(false);
    }
  }, [selectedGift, qty, sending, streamId, isSelfGift, isLuckyTab, totalCost, onGiftSent, onClose]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />

      {/* ── Lucky Milestone Celebration Popup ─────────────────────────── */}
      {milestonePopup && (
        <View style={st.milestoneOverlay} pointerEvents="none">
          {(() => {
            const ms = (milestonePopup as any).milestone as number;
            const gradColors: [string,string,string] =
              ms === 500 ? ['#7C3AED','#EC4899','#F97316'] :
              ms === 200 ? ['#1D4ED8','#7C3AED','#EC4899'] :
                           ['#059669','#10B981','#F59E0B'];
            const icon   = ms === 500 ? '🎊' : ms === 200 ? '🎉' : '💥';
            const title  = ms === 500 ? 'JACKPOT!' : ms === 200 ? '200× GET!' : '100× GET!';
            const sub    = ms === 500
              ? `Cycle Reward  •  ${(milestonePopup as any).dropCount}× Drops`
              : ms === 200 ? 'Lucky 200× Milestone!' : 'Lucky 100× Milestone!';
            return (
              <LinearGradient colors={gradColors} start={{ x:0, y:0 }} end={{ x:1, y:1 }} style={st.milestoneCard}>
                <Text style={st.milestoneFirework}>{icon}</Text>
                <Text style={st.milestoneLine1}>{title}</Text>
                <Text style={st.milestoneLine2}>{sub}</Text>
                <Text style={st.milestoneLine3}>+{milestonePopup.rewardCoins.toLocaleString()} 🪙</Text>
              </LinearGradient>
            );
          })()}
        </View>
      )}

      {/* ── JP Cring Overlay ─────────────────────────────────────────── */}
      {jpPopup && (
        <View style={st.jpOverlay} pointerEvents="none">
          {/* Coin shower particles */}
          {JP_COINS.slice(0, jpPopup.type === 'jackpot' ? 25 : 12).map((coin, i) => (
            <Animated.Text
              key={i}
              style={[
                st.jpCoin,
                {
                  left:      JP_COIN_DATA[i].x,
                  fontSize:  JP_COIN_DATA[i].size,
                  transform: [{ translateY: coin.y }, { rotate: coin.rotation }],
                  opacity:   coin.op,
                },
              ]}
            >
              🪙
            </Animated.Text>
          ))}

          {/* Reward card */}
          <LinearGradient
            colors={jpPopup.type === 'jackpot'
              ? ['#7C3AED', '#DB2777', '#F59E0B']
              : ['#1E3A8A', '#059669', '#CA8A04']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.jpCard}
          >
            <Text style={st.jpIcon}>{jpPopup.type === 'jackpot' ? '🎰' : '🎲'}</Text>
            <Text style={st.jpTitle}>{jpPopup.type === 'jackpot' ? 'JACKPOT!' : 'CRING!'}</Text>
            <Text style={st.jpSub}>
              {jpPopup.type === 'jackpot'
                ? `Selamat! Hadiah koin masuk!`
                : `Cashback koin ${jpPopup.threshold.toLocaleString()}!`}
            </Text>
            <Text style={st.jpAmount}>+{jpPopup.reward.toLocaleString()} 🪙</Text>
          </LinearGradient>
        </View>
      )}

      <Animated.View style={[st.sheet, { paddingBottom: insets.bottom + 6, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={st.handle} />

        {/* Header */}
        <View style={st.header}>
          <Text style={st.headerTitle}>🎁 Kirim Gift</Text>
          {balance !== null && (
            <View style={st.balancePill}>
              <Text style={st.balanceTxt}>🪙 {balance.toLocaleString()}</Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabsScroll} contentContainerStyle={st.tabsRow}>
          {SOLO_GIFT_TABS.map(t => (
            <TouchableOpacity
              key={t.label}
              onPress={() => { setActiveTab(t.label); setSelectedGift(null); }}
              style={st.tabBtn}
            >
              <Text style={[st.tabTxt, activeTab === t.label && st.tabTxtActive]}>
                {t.label}
              </Text>
              {activeTab === t.label && <View style={[st.tabUnderline, t.label === 'Luxury' && { backgroundColor: LUXURY_GLOW }]} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Gift grid */}
        <View style={st.gridBox}>
          {loading ? (
            <View style={st.loadingBox}>
              <ActivityIndicator color={PINK} />
            </View>
          ) : (
            <FlatList
              key={activeTab}
              data={filteredGifts}
              numColumns={4}
              keyExtractor={g => g.id}
              contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={st.emptyBox}>
                  <Text style={st.emptyTxt}>Tidak ada gift di kategori ini</Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <GiftCard
                  gift={item}
                  selected={selectedGift?.id === item.id}
                  index={index}
                  isLucky={isLuckyTab}
                  isLuxury={isLuxuryTab}
                  onPress={() => setSelectedGift(prev => prev?.id === item.id ? null : item)}
                />
              )}
            />
          )}
        </View>

        {/* Bottom bar: qty + send */}
        <View style={st.bottomBar}>
          {/* Qty picker */}
          <View style={st.qtySection}>
            <TouchableOpacity
              style={st.qtyPill}
              onPress={() => setQtyOpen(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={st.qtyPillTxt}>x{qty}</Text>
              <Ionicons name={qtyOpen ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            {qtyOpen && (
              <View style={st.qtyDropdown}>
                {QTY_OPTIONS.map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[st.qtyOption, qty === q && st.qtyOptionActive]}
                    onPress={() => { setQty(q); setQtyOpen(false); }}
                  >
                    <Text style={[st.qtyOptionTxt, qty === q && st.qtyOptionTxtActive]}>x{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Cost display */}
          {selectedGift && (
            <View style={st.costWrap}>
              <Text style={st.costTxt}>🪙 {totalCost.toLocaleString()}</Text>
              {balance !== null && balance < totalCost && (
                <Text style={st.costInsuf}>Koin tidak cukup</Text>
              )}
            </View>
          )}

          {/* Send button */}
          <TouchableOpacity
            style={[st.sendBtn, !canSend && st.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.82}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <LinearGradient
                colors={isLuxuryTab ? ['#A855F7', '#7C3AED'] : ['#F06292', '#C62828']}
                style={st.sendBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Ionicons name="gift" size={15} color="#fff" />
                <Text style={st.sendBtnTxt}>
                  {isSelfGift ? 'Kirim ke Diri' : 'Kirim Gift'}
                </Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>

        {/* Toast */}
        {toast && (
          <View style={st.toast}>
            <Text style={st.toastTxt}>{toast}</Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  milestoneOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          999,
  },
  milestoneCard: {
    borderRadius:    24,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems:      'center',
    gap:             6,
    shadowColor:     '#7C3AED',
    shadowOpacity:   0.6,
    shadowRadius:    24,
    elevation:       12,
  },
  milestoneFirework: { fontSize: 52 },
  milestoneLine1: {
    fontSize:   28,
    fontWeight: '900',
    color:      '#FFF',
    letterSpacing: 2,
    marginTop: 4,
  },
  milestoneLine2: {
    fontSize:   16,
    fontWeight: '700',
    color:      'rgba(255,255,255,0.9)',
  },
  milestoneLine3: {
    fontSize:   22,
    fontWeight: '800',
    color:      '#FDE68A',
    marginTop:  4,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: PANEL_BG,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    maxHeight:       SH * 0.68,
    overflow:        'hidden',
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap:             8,
  },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#fff' },
  balancePill: {
    backgroundColor: 'rgba(255,184,0,0.18)',
    borderRadius:    12,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:     1,
    borderColor:     'rgba(255,184,0,0.4)',
  },
  balanceTxt: { fontSize: 12, fontWeight: '700', color: '#FFD84D' },
  closeBtn: { padding: 4 },
  tabsScroll: { flexGrow: 0 },
  tabsRow: {
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 4,
  },
  tabBtn: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, position: 'relative' },
  tabTxt: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  tabTxtActive: { color: '#fff', fontWeight: '800' },
  tabUnderline: {
    position: 'absolute', bottom: 2, left: 12, right: 12,
    height: 2, borderRadius: 1, backgroundColor: PINK,
  },
  luckyNotice: {
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.3)',
  },
  luckyNoticeTxt: { fontSize: 12, color: '#FFD84D', fontWeight: '600' },
  gridBox: {
    flex: 1,
    minHeight: 150,
    maxHeight: SH * 0.32,
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  emptyTxt:   { fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  qtySection: { position: 'relative' },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  qtyPillTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  qtyDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    backgroundColor: '#1A1730',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    zIndex: 100,
    elevation: 10,
    minWidth: 70,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  qtyOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  qtyOptionActive: { backgroundColor: 'rgba(255,107,157,0.2)' },
  qtyOptionTxt: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  qtyOptionTxtActive: { color: PINK, fontWeight: '800' },
  costWrap: { flex: 1, alignItems: 'flex-start', gap: 2 },
  costTxt:  { fontSize: 13, fontWeight: '700', color: '#FFD84D' },
  costInsuf: { fontSize: 10, color: '#F87171', fontWeight: '600' },
  sendBtn: { borderRadius: 12, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendBtnTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  toast: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastTxt: { fontSize: 13, color: '#fff', fontWeight: '600' },

  // JP Cring overlay
  jpOverlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex:          9000,
  },
  jpCoin: {
    position: 'absolute',
    top:      0,
  },
  jpCard: {
    borderRadius:      24,
    paddingVertical:   28,
    paddingHorizontal: 36,
    alignItems:        'center',
    width:             270,
    shadowColor:       '#FFB300',
    shadowOpacity:     0.85,
    shadowRadius:      32,
    shadowOffset:      { width: 0, height: 0 },
    elevation:         24,
  },
  jpIcon:   { fontSize: 58, marginBottom: 6 },
  jpTitle:  { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: 1.5 },
  jpSub:    { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  jpAmount: { color: '#FFD700', fontSize: 34, fontWeight: '900', marginTop: 14 },
});

const gst = StyleSheet.create({
  card: {
    flex: 1,
    margin: 5,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  luxuryCard: {
    borderColor: 'rgba(192,132,252,0.35)',
    backgroundColor: '#1C1430',
    shadowColor: LUXURY_GLOW,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  luxuryBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: LUXURY_GLOW,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  luxuryBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '800' },
  luckyBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: GOLD,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  luckyBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
  imgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    width: 52,
    height: 52,
  },
  media: { width: 48, height: 48 },
  emoji: { fontSize: 30 },
  name: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 3,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coin:  { fontSize: 10 },
  price: { fontSize: 10, fontWeight: '700', color: GOLD },
});
