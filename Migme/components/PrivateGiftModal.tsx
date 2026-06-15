/**
 * PrivateGiftModal.tsx
 *
 * Gift picker untuk private chat — desain sama dengan PartyGiftModal
 * tapi tanpa: Lucky tab, seat selection, ALL toggle, WebSocket.
 * Tabs: Popular, Costume Set, Luxury.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const DARK_BG  = '#0E0C1E';
const PANEL_BG = '#16132B';
const CARD_BG  = '#1E1A34';
const ORANGE   = '#F97316';
const PURPLE   = '#7C3AED';
const GOLD     = '#F59E0B';

const QTY_OPTIONS = [1, 3, 9, 99, 199];

const GIFT_TABS = [
  { label: 'Popular',     category: 'Populer'   },
  { label: 'Costume Set', category: 'Set Kostum' },
  { label: 'Luxury',      category: 'Luxury'     },
] as const;
type GiftTab = typeof GIFT_TABS[number]['label'];

export interface PrivateVirtualGift {
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

interface Props {
  visible: boolean;
  onClose: () => void;
  currentUsername: string;
  recipientName: string;
  onSendGift: (gift: PrivateVirtualGift, qty: number) => void;
}

function GiftCard({
  gift, selected, qty, onPress, index,
}: { gift: PrivateVirtualGift; selected: boolean; qty: number; onPress: () => void; index: number }) {
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
  card:           { flex: 1, margin: 6, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, position: 'relative' },
  imgWrap:        { alignItems: 'center', justifyContent: 'center', marginBottom: 6, position: 'relative' },
  imgWrapSelected: { shadowColor: ORANGE, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  premiumTag:     { position: 'absolute', top: -6, left: -6, fontSize: 11 },
  giftImg:        { width: 44, height: 44 },
  giftLottie:     { width: 56, height: 56 },
  emoji:          { fontSize: 30 },
  giftName:       { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginBottom: 2 },
  giftNameSelected: { color: ORANGE, fontWeight: '800' },
  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coin:           { fontSize: 10 },
  price:          { fontSize: 11, color: GOLD, fontWeight: '700' },
});

export default function PrivateGiftModal({
  visible, onClose, currentUsername, recipientName, onSendGift,
}: Props) {
  const insets   = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;

  const [gifts,        setGifts]        = useState<PrivateVirtualGift[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [balance,      setBalance]      = useState<number | null>(null);
  const [selectedGift, setSelectedGift] = useState<PrivateVirtualGift | null>(null);
  const [qty,          setQty]          = useState(1);
  const [qtyOpen,      setQtyOpen]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<GiftTab>('Popular');

  const activeCategory = GIFT_TABS.find(t => t.label === activeTab)?.category ?? 'Populer';
  const filteredGifts  = gifts.filter(g => (g.category ?? 'Populer') === activeCategory);
  const tabLabels      = GIFT_TABS.map(t => t.label);

  const swipePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 40) return;
      setActiveTab(prev => {
        const idx = tabLabels.indexOf(prev);
        if (g.dx < 0) return tabLabels[Math.min(idx + 1, tabLabels.length - 1)];
        return tabLabels[Math.max(idx - 1, 0)];
      });
    },
  }), [tabLabels]);

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

  const totalCost = selectedGift ? selectedGift.price * qty : 0;
  const canSend   = !!selectedGift && balance !== null && balance >= totalCost;

  const handleSend = useCallback(() => {
    if (!selectedGift || !canSend) return;
    onSendGift(selectedGift, qty);
    setSelectedGift(null);
  }, [selectedGift, qty, canSend, onSendGift]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}>

        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header: recipient info */}
        <View style={styles.headerRow}>
          <Ionicons name="gift-outline" size={18} color={ORANGE} />
          <Text style={styles.headerText} numberOfLines={1}>
            Kirim gift ke <Text style={{ color: ORANGE, fontWeight: '800' }}>{recipientName}</Text>
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {GIFT_TABS.map(t => (
            <TouchableOpacity key={t.label} onPress={() => { setActiveTab(t.label); setSelectedGift(null); }} style={styles.tabBtn}>
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
                  selected={selectedGift?.id === item.id}
                  qty={qty}
                  onPress={() => setSelectedGift(prev => prev?.id === item.id ? null : item)}
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
            {qtyOpen && (
              <View style={styles.qtyDropdown}>
                {QTY_OPTIONS.map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.qtyOption, q === qty && styles.qtyOptionActive]}
                    onPress={() => { setQty(q); setQtyOpen(false); }}
                  >
                    <Text style={[styles.qtyOptionText, q === qty && styles.qtyOptionTextActive]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Send button */}
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>kirim</Text>
          </TouchableOpacity>
        </View>

        {/* Cost hint */}
        {selectedGift && (
          <View style={styles.costHint}>
            <Text style={styles.costHintText}>
              Total: 🪙 {totalCost.toLocaleString()}{balance !== null && balance < totalCost ? '  ⚠️ Saldo tidak cukup' : ''}
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SH * 0.72,
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 10,
    marginBottom: 4,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  headerText: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
  closeBtn: { padding: 4 },

  tabsScroll:   { flexGrow: 0, marginBottom: 4 },
  tabsRow:      { paddingHorizontal: 12, gap: 4 },
  tabBtn:       { paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', position: 'relative' },
  tabText:      { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
  tabTextActive:{ color: '#fff', fontWeight: '800' },
  tabUnderline: { position: 'absolute', bottom: 2, left: 14, right: 14, height: 2, borderRadius: 1, backgroundColor: ORANGE },

  giftList:        { flex: 1 },
  giftListContent: { paddingHorizontal: 6, paddingBottom: 4 },
  loadingBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyCategory:   { alignItems: 'center', paddingVertical: 40 },
  emptyCategoryText: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  balanceBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: CARD_BG, borderRadius: 20 },
  balanceCoin: { fontSize: 14 },
  balanceText: { fontSize: 13, color: GOLD, fontWeight: '700' },

  qtySection:  { position: 'relative' },
  qtyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CARD_BG, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  qtyText:     { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  qtyDropdown: { position: 'absolute', bottom: 44, right: 0, backgroundColor: '#1E1A34', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', zIndex: 10 },
  qtyOption:   { paddingHorizontal: 20, paddingVertical: 10 },
  qtyOptionActive: { backgroundColor: ORANGE },
  qtyOptionText:   { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  qtyOptionTextActive: { color: '#fff', fontWeight: '800' },

  sendBtn:         { backgroundColor: ORANGE, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
  sendBtnDisabled: { backgroundColor: 'rgba(249,115,22,0.35)' },
  sendBtnText:     { color: '#fff', fontSize: 14, fontWeight: '800' },

  costHint:     { alignItems: 'center', paddingBottom: 4 },
  costHintText: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
});
