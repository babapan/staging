/**
 * PartyGiftModal.tsx
 *
 * Bottom-sheet gift panel for Live Party rooms.
 * - Select recipient: toggle ALL or individual seated user
 * - Browse gift catalog (Populer tab)
 * - Choose quantity multiplier
 * - Send via WebSocket SEND_GIFT
 */

import { useCallback, useEffect, useMemo, useRef, useState, MutableRefObject } from 'react';
import AvatarWithFrame from './AvatarWithFrame';
import LottieView from 'lottie-react-native';
import { useVideoPlayerSafe, VideoViewSafe } from '../utils/videoPlayer';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE, buildHeaders } from '../services/auth';

const { width: SW, height: SH } = Dimensions.get('window');

const DARK_BG   = '#0E0C1E';
const PANEL_BG  = '#16132B';
const CARD_BG   = '#1E1A34';
const ORANGE    = '#F97316';
const PURPLE    = '#7C3AED';
const GOLD      = '#F59E0B';

const QTY_OPTIONS = [1, 3, 9, 99, 199];
const GIFT_TABS = [
  { label: 'Popular',     category: 'Populer'   },
  { label: 'Lucky',       category: 'Lucky'      },
  { label: 'Costume Set', category: 'Set Kostum' },
  { label: 'Luxury',      category: 'Luxury'     },
  { label: 'My Bag',      category: 'Tas saya'   },
] as const;
type GiftTab = typeof GIFT_TABS[number]['label'];

interface VirtualGift {
  id: string;
  name: string;
  hotKey: string | null;
  price: number;
  imageUrl?: string | null;
  lottieUrl?: string | null;
  videoUrl?: string | null;
  isPremium?: boolean;
  category?: string;
}

interface Seat {
  index: number;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  avatarFrameUrl?: string | null;
}

interface LuckySentInfo {
  giftName:    string;
  giftEmoji:   string;
  giftImageUrl?: string | null;
  lottieUrl:   string | null;
  videoUrl?:   string | null;
  price:       number;
  recipient:   string;
  qty:         number;
  category?:   string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  seats: Seat[];
  currentUsername: string;
  wsRef: MutableRefObject<WebSocket | null>;
  onLuckySent?: (info: LuckySentInfo) => void;
  onPopularGiftSend?: (info: LuckySentInfo) => void;
  initialRecipient?: string;
}

function AvatarBubble({
  name, size, selected, onPress, avatarUrl, avatarFrameUrl,
}: {
  name: string; size: number; selected: boolean; onPress: () => void;
  avatarUrl?: string | null; avatarFrameUrl?: string | null;
}) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ alignItems: 'center' }}>
      <View style={{ position: 'relative' }}>
        <AvatarWithFrame
          size={size}
          displayPicture={avatarUrl}
          avatarFrameUrl={avatarFrameUrl}
          initial={initials}
          backgroundColor={PURPLE}
          style={selected ? {
            shadowColor: ORANGE, shadowOpacity: 0.7,
            shadowRadius: 8, elevation: 6,
            borderRadius: size / 2, borderWidth: 2.5, borderColor: ORANGE,
          } : {
            borderRadius: size / 2, borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.2)',
          }}
        />
        {selected && (
          <View style={avatarSt.check}>
            <Ionicons name="checkmark" size={8} color="#fff" />
          </View>
        )}
      </View>
      <Text style={avatarSt.name} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}

const avatarSt = StyleSheet.create({
  check: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DARK_BG,
  },
  name: { fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 2, maxWidth: 36, textAlign: 'center' },
});

function GiftCard({
  gift, selected, qty, onPress, index, isLuckyTab,
}: { gift: VirtualGift; selected: boolean; qty: number; onPress: () => void; index: number; isLuckyTab: boolean }) {
  const floatY = useSharedValue(0);
  const scale  = useSharedValue(1);
  const [videoError, setVideoError] = useState(false);

  const videoPlayer = useVideoPlayerSafe(
    gift.videoUrl ? { uri: gift.videoUrl } : null,
    (p: any) => {
      p.loop = true;
      p.muted = true;
      if (gift.videoUrl) p.play();
    },
  );

  useEffect(() => {
    if (!gift.videoUrl) return;
    const sub = videoPlayer.addListener('statusChange', ({ status }: { status: string }) => {
      if (status === 'error') setVideoError(true);
    });
    return () => sub.remove();
  }, [videoPlayer]);

  useEffect(() => {
    // Staggered floating bob — each card at a slightly different phase
    floatY.value = withDelay(
      (index % 6) * 180,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 850 }),
          withTiming(0,  { duration: 850 }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  useEffect(() => {
    // Pop bounce when selected
    if (selected) {
      scale.value = withSequence(
        withTiming(1.25, { duration: 120 }),
        withTiming(1.0,  { duration: 140 }),
      );
    }
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: scale.value }],
  }));

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={giftSt.card}>
      {/* x{qty} badge — only on Lucky tab when selected */}
      {isLuckyTab && selected && qty > 0 && (
        <View style={giftSt.qtyBadge}>
          <Text style={giftSt.qtyBadgeText}>x{qty}</Text>
        </View>
      )}

      {/* Animated gift image/emoji/lottie/video */}
      <Reanimated.View style={[giftSt.imgWrap, animStyle, selected && giftSt.imgWrapSelected]}>
        {gift.videoUrl && !videoError ? (
          <VideoViewSafe
            player={videoPlayer}
            style={[giftSt.giftLottie, { backgroundColor: 'transparent' }]}
            contentFit="contain"
            nativeControls={false}
          />
        ) : gift.lottieUrl ? (
          <LottieView
            source={{ uri: gift.lottieUrl }}
            autoPlay
            loop
            style={giftSt.giftLottie}
          />
        ) : gift.imageUrl ? (
          <RNImage source={{ uri: gift.imageUrl }} style={giftSt.giftImg} resizeMode="contain" />
        ) : (
          <Text style={giftSt.emoji}>{gift.hotKey ?? '🎁'}</Text>
        )}
        {!!gift.isPremium && <Text style={giftSt.premiumTag}>⭐</Text>}
      </Reanimated.View>

      <Text style={[giftSt.giftName, selected && giftSt.giftNameSelected]} numberOfLines={1}>
        {gift.name}
      </Text>
      <View style={giftSt.priceRow}>
        <Text style={giftSt.coin}>🪙</Text>
        <Text style={giftSt.price}>{gift.price.toLocaleString()}</Text>
      </View>
    </TouchableOpacity>
  );
}

const giftSt = StyleSheet.create({
  card: {
    flex: 1,
    margin: 6,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    position: 'relative',
  },
  imgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  imgWrapSelected: {
    // subtle glow under the image when selected
    shadowColor: ORANGE,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  qtyBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  qtyBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  premiumTag: { position: 'absolute', top: -6, left: -6, fontSize: 11 },
  giftImg:    { width: 44, height: 44 },
  giftLottie: { width: 56, height: 56 },
  emoji: { fontSize: 30 },
  giftName: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginBottom: 2 },
  giftNameSelected: { color: ORANGE, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coin: { fontSize: 10 },
  price: { fontSize: 11, color: GOLD, fontWeight: '700' },
});

export default function PartyGiftModal({
  visible, onClose, roomId, seats, currentUsername, wsRef, onLuckySent, onPopularGiftSend,
  initialRecipient,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;

  const [gifts,       setGifts]       = useState<VirtualGift[]>([]);
  const [loading,     setLoading]      = useState(false);
  const [balance,     setBalance]      = useState<number | null>(null);
  const [selectedGift, setSelectedGift] = useState<VirtualGift | null>(null);
  const [sendAll,     setSendAll]      = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [qty,         setQty]          = useState(1);
  const [qtyOpen,    setQtyOpen]       = useState(false);
  const [activeTab,  setActiveTab]     = useState<GiftTab>('Popular');
  const [sending,    setSending]       = useState(false);

  // Lucky quick-tap: tap gift card repeatedly to instantly increment qty
  const luckyTapQtyRef  = useRef(0);
  const luckyStepRef    = useRef(1); // step size = qty selected when first tap begins
  const luckyTapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [luckyTapQty,   setLuckyTapQty] = useState(0);

  const occupiedSeats = seats.filter(s => !!s.username);
  // Untuk kalkulasi biaya: exclude sender sendiri (backend juga exclude sender dari recipients)
  const recipientSeats = occupiedSeats.filter(s => s.username !== currentUsername);

  const activeCategory = GIFT_TABS.find(t => t.label === activeTab)?.category ?? 'Populer';
  const filteredGifts  = gifts.filter(g => (g.category ?? 'Populer') === activeCategory);

  const tabLabels = GIFT_TABS.map(t => t.label);

  const swipePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 40) return;
      setActiveTab(prev => {
        const idx = tabLabels.indexOf(prev);
        if (g.dx < 0) {
          // swipe left → next category
          return tabLabels[Math.min(idx + 1, tabLabels.length - 1)];
        } else {
          // swipe right → previous category
          return tabLabels[Math.max(idx - 1, 0)];
        }
      });
    },
  }), [tabLabels]);

  // Saat modal dibuka dari tombol Hadiah di profil, langsung pre-select user tersebut
  useEffect(() => {
    if (visible && initialRecipient) {
      setSendAll(false);
      setSelectedUsers(new Set([initialRecipient]));
    } else if (visible && !initialRecipient) {
      setSendAll(true);
      setSelectedUsers(new Set());
    }
  }, [visible, initialRecipient]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
      loadGifts();
      loadBalance();
    } else {
      Animated.timing(slideAnim, { toValue: SH, duration: 260, useNativeDriver: true }).start();
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
    } catch { }
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
    } catch { }
  };

  const isLuckyTab   = activeTab === 'Lucky';
  const isPopularTab = activeTab === 'Popular';
  const isLuxuryTab  = activeTab === 'Luxury';

  const handlePopularTap = useCallback((gift: VirtualGift) => {
    if (!onPopularGiftSend) return;
    const recipient = sendAll ? 'all' : (Array.from(selectedUsers)[0] ?? 'all');
    onPopularGiftSend({
      giftName:     gift.name,
      giftEmoji:    gift.hotKey ?? '🎁',
      giftImageUrl: gift.imageUrl ?? null,
      lottieUrl:    gift.lottieUrl ?? null,
      videoUrl:     gift.videoUrl ?? null,
      price:        gift.price,
      recipient,
      qty,
    });
  }, [sendAll, selectedUsers, qty, onPopularGiftSend]);

  // Lucky quick-tap handler: each tap increments by the selected qty step
  const handleLuckyTap = useCallback((gift: VirtualGift) => {
    setSelectedGift(gift);

    // On first tap of a new sequence, lock in the current step size
    if (luckyTapQtyRef.current === 0) {
      luckyStepRef.current = qty;
    }

    luckyTapQtyRef.current += luckyStepRef.current;
    const newQty = luckyTapQtyRef.current;
    setLuckyTapQty(newQty);
    setQty(newQty);

    // Reset debounce timer — clear counter after 1.5s of no tapping
    if (luckyTapTimer.current) clearTimeout(luckyTapTimer.current);
    luckyTapTimer.current = setTimeout(() => {
      luckyTapQtyRef.current = 0;
      setLuckyTapQty(0);
    }, 1500);
  }, [qty]);

  // Reset lucky tap counter when switching tabs or closing
  useEffect(() => {
    luckyTapQtyRef.current = 0;
    luckyStepRef.current = 1;
    setLuckyTapQty(0);
    if (luckyTapTimer.current) clearTimeout(luckyTapTimer.current);
  }, [activeTab, visible]);

  const toggleUser = useCallback((username: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }, []);

  // Trigger TAP bubble immediately for any gift + qty combination
  const triggerTapMode = useCallback((gift: VirtualGift, tapQty: number) => {
    if (!onLuckySent) return;
    if (!sendAll && selectedUsers.size === 0) return;
    // Pass all selected users comma-separated (same pattern as Popular/Luxury)
    const recipient = sendAll
      ? 'all'
      : Array.from(selectedUsers).join(',');
    onLuckySent({
      giftName:     gift.name,
      giftEmoji:    gift.hotKey ?? '🎁',
      giftImageUrl: gift.imageUrl ?? null,
      lottieUrl:    gift.lottieUrl ?? null,
      videoUrl:     gift.videoUrl ?? null,
      price:        gift.price,
      recipient,
      qty:          tapQty,
    });
  }, [sendAll, selectedUsers, onLuckySent]);

  const handleSend = useCallback(() => {
    if (!selectedGift) return;
    if (!sendAll && selectedUsers.size === 0) return;
    if (isPopularTab || isLuxuryTab) {
      // Popular & Luxury: kirim langsung via WS tanpa TAP button session.
      // Jika multiple seat dipilih, kirim ke semua dengan comma-separated recipient
      // agar PartyRoomModal bisa kirim satu WS message per penerima.
      const recipient = sendAll
        ? 'all'
        : Array.from(selectedUsers).join(',') || 'all';
      onPopularGiftSend?.({
        giftName:     selectedGift.name,
        giftEmoji:    selectedGift.hotKey ?? '🎁',
        giftImageUrl: selectedGift.imageUrl ?? null,
        lottieUrl:    selectedGift.lottieUrl ?? null,
        videoUrl:     selectedGift.videoUrl ?? null,
        price:        selectedGift.price,
        recipient,
        qty,
        category:     selectedGift.category ?? undefined,
      });
    } else {
      triggerTapMode(selectedGift, qty);
    }
  }, [selectedGift, sendAll, selectedUsers, qty, triggerTapMode, isPopularTab, isLuxuryTab, onPopularGiftSend]);

  // Popular & Luxury: backend menghitung semua kursi terisi termasuk sender sendiri
  // Lucky & lainnya: backend exclude sender, pakai recipientSeats
  const sendAllCount = (isPopularTab || isLuxuryTab)
    ? occupiedSeats.length
    : recipientSeats.length;
  const totalCost = selectedGift
    ? selectedGift.price * qty * (sendAll ? Math.max(1, sendAllCount) : Math.max(1, selectedUsers.size))
    : 0;
  const canSend = !!selectedGift
    && (sendAll
      ? (isPopularTab || isLuxuryTab ? occupiedSeats.length > 0 : recipientSeats.length > 0)
      : selectedUsers.size > 0)
    && balance !== null
    && balance >= totalCost;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}>

        {/* Handle bar */}
        <View style={styles.handle} />

        {/* ── Recipients row — all tabs ── */}
        <View style={styles.recipientSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
            {occupiedSeats.length === 0 ? (
              <Text style={styles.emptySeats}>Tidak ada pengguna di kursi</Text>
            ) : (
              occupiedSeats.map(s => (
                <AvatarBubble
                  key={s.index}
                  name={s.username!}
                  size={32}
                  selected={sendAll || selectedUsers.has(s.username!)}
                  onPress={() => {
                    if (sendAll) {
                      // Turn off ALL mode and select everyone except this user
                      setSendAll(false);
                      const allExcept = new Set(
                        occupiedSeats.map(seat => seat.username!).filter(u => u !== s.username),
                      );
                      setSelectedUsers(allExcept);
                    } else {
                      toggleUser(s.username!);
                    }
                  }}
                  avatarUrl={s.avatarUrl}
                  avatarFrameUrl={s.avatarFrameUrl}
                />
              ))
            )}
          </ScrollView>

          {/* Toggle ALL */}
          <View style={styles.allToggle}>
            <Text style={styles.allLabel}>kirim ke{'\n'}<Text style={{ fontWeight: '800', color: '#fff' }}>ALL</Text></Text>
            <Switch
              value={sendAll}
              onValueChange={v => {
                setSendAll(v);
                if (v) {
                  // Turning ALL ON → clear individual selection
                  setSelectedUsers(new Set());
                } else {
                  // Turning ALL OFF → pre-select all occupied seats so user can deselect individually
                  setSelectedUsers(new Set(occupiedSeats.map(s => s.username!)));
                }
              }}
              trackColor={{ false: '#333', true: ORANGE }}
              thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {GIFT_TABS.map(t => (
            <TouchableOpacity key={t.label} onPress={() => setActiveTab(t.label)} style={styles.tabBtn}>
              <Text style={[styles.tabText, activeTab === t.label && styles.tabTextActive]}>{t.label}</Text>
              {activeTab === t.label && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Gift grid ── */}
        <View style={styles.giftList} {...swipePan.panHandlers}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={ORANGE} />
            </View>
          ) : (
            <FlatList
              key={activeTab}
              data={filteredGifts}
              keyExtractor={item => String(item.id)}
              numColumns={3}
              style={{ flex: 1 }}
              contentContainerStyle={styles.giftListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyCategory}>
                  <Text style={styles.emptyCategoryText}>No gifts in this category</Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <GiftCard
                  gift={item}
                  index={index}
                  isLuckyTab={isLuckyTab}
                  selected={selectedGift?.id === item.id}
                  qty={isLuckyTab && selectedGift?.id === item.id && luckyTapQty > 0 ? luckyTapQty : qty}
                  onPress={() => {
                    if (isLuckyTab) {
                      handleLuckyTap(item);
                    } else {
                      setSelectedGift(prev => prev?.id === item.id ? null : item);
                    }
                  }}
                />
              )}
            />
          )}
        </View>

        {/* ── Bottom bar ── */}
        <View style={styles.bottomBar}>
          {/* Balance */}
          <TouchableOpacity style={styles.balanceBtn} onPress={loadBalance}>
            <Text style={styles.balanceCoin}>🪙</Text>
            <Text style={styles.balanceText}>
              {balance !== null ? balance.toLocaleString() : '—'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={GOLD} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {/* Qty picker */}
          <View style={styles.qtySection}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQtyOpen(o => !o)}>
              <Text style={styles.qtyText}>{qty}</Text>
              <Ionicons name={qtyOpen ? 'chevron-down' : 'chevron-up'} size={14} color="#fff" />
            </TouchableOpacity>

            {/* Dropdown */}
            {qtyOpen && (
              <View style={styles.qtyDropdown}>
                {QTY_OPTIONS.map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.qtyOption, q === qty && styles.qtyOptionActive]}
                    onPress={() => {
                    setQty(q);
                    setQtyOpen(false);
                    // If a gift is already selected, immediately launch TAP mode
                    if (selectedGift) triggerTapMode(selectedGift, q);
                  }}
                  >
                    <Text style={[styles.qtyOptionText, q === qty && styles.qtyOptionTextActive]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Send button — semua tab pakai tombol kirim */}
          <TouchableOpacity
            style={[styles.sendBtn, (!canSend || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>kirim</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Cost hint — semua tab */}
        {selectedGift && (
          <View style={styles.costHint}>
            <Text style={styles.costHintText}>
              Total: 🪙 {totalCost.toLocaleString()} {balance !== null && balance < totalCost ? '⚠️ Saldo tidak cukup' : ''}
            </Text>
          </View>
        )}

      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: DARK_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SH * 0.62,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(124,58,237,0.3)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },

  recipientSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 5,
    paddingRight: 8,
    flex: 1,
  },
  emptySeats: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },
  allToggle: { alignItems: 'center', minWidth: 54 },
  allLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 13, marginBottom: 2 },

  tabsScroll: { maxHeight: 42, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, alignItems: 'center' },
  tabBtn: { marginRight: 18, paddingVertical: 10, position: 'relative' },
  tabText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  tabTextActive: { color: ORANGE, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2, backgroundColor: ORANGE },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  giftList: { flex: 1 },
  giftListContent: { paddingHorizontal: 8, paddingVertical: 8 },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  balanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  balanceCoin: { fontSize: 14 },
  balanceText: { fontSize: 13, color: GOLD, fontWeight: '700' },

  qtySection: { position: 'relative' },
  qtyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minWidth: 60,
    justifyContent: 'center',
  },
  qtyText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  qtyDropdown: {
    position: 'absolute',
    bottom: 44,
    right: 0,
    backgroundColor: '#1A1730',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    minWidth: 80,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
  },
  qtyOption: { paddingVertical: 11, paddingHorizontal: 20, alignItems: 'center' },
  qtyOptionActive: { backgroundColor: 'rgba(249,115,22,0.15)' },
  qtyOptionText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  qtyOptionTextActive: { color: ORANGE, fontWeight: '800' },

  sendBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: ORANGE,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sendBtnDisabled: { backgroundColor: 'rgba(249,115,22,0.35)', elevation: 0 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  costHint: { alignItems: 'center', paddingBottom: 4 },
  costHintText: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  emptyCategory: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyCategoryText: { fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },
});
