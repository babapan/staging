import React, { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPartySeatCount } from '../services/partyService';

const { height: SH, width: SW } = Dimensions.get('window');

// ── Seat layout definitions ────────────────────────────────────────────────
// Each layout: { count, label, rows: number[] } where rows[i] = dot count per row
const LAYOUTS = [
  { count: 8,  label: '8 kursi mic',  rows: [4, 4] },
  { count: 12, label: '12 kursi mic', rows: [2, 5, 5] },
];

const ACCENT = '#F59E0B'; // yellow
const CARD_W = (SW - 56) / 2; // 2 per row with 16px side padding + 8px gap

// ── Dot grid preview ────────────────────────────────────────────────────────
function DotGrid({ rows }: { rows: number[] }) {
  const dotSize = Math.max(4, Math.min(7, Math.floor((CARD_W - 20) / (Math.max(...rows) + 1))));
  const gap = 3;
  return (
    <View style={dotStyles.grid}>
      {rows.map((count, ri) => (
        <View key={ri} style={dotStyles.row}>
          {Array.from({ length: count }).map((_, di) => (
            <View key={di} style={[dotStyles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  grid: { alignItems: 'center', gap: 3 },
  row: { flexDirection: 'row', gap: 3 },
  dot: { backgroundColor: 'rgba(255,255,255,0.85)' },
});

// ── Layout card ─────────────────────────────────────────────────────────────
function LayoutCard({
  layout,
  selected,
  onPress,
}: {
  layout: typeof LAYOUTS[0];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, selected && cardStyles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <DotGrid rows={layout.rows} />
      <Text style={[cardStyles.label, selected && cardStyles.labelSelected]} numberOfLines={2}>
        {layout.label}
      </Text>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    width: CARD_W,
    aspectRatio: 0.9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cardSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  label: {
    fontSize: 9.5,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 13,
    fontWeight: '500',
  },
  labelSelected: {
    color: ACCENT,
    fontWeight: '700',
  },
});

// ── Main modal ───────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  currentSeatCount: number;
  onSeatCountChanged?: (count: number) => void;
}

export default function PartyRoomModeModal({
  visible,
  onClose,
  roomId,
  currentSeatCount,
  onSeatCountChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [tab, setTab] = useState<'party' | 'video'>('party');
  const [selected, setSelected] = useState(currentSeatCount);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(currentSeatCount);
  }, [currentSeatCount]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 14 }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = async (count: number) => {
    if (count === selected || saving) return;
    setSelected(count);
    setSaving(true);
    const ok = await setPartySeatCount(roomId, count);
    setSaving(false);
    if (ok) {
      onSeatCountChanged?.(count);
    } else {
      setSelected(currentSeatCount);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mode Room</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'party' && styles.tabActive]}
            onPress={() => setTab('party')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'party' && styles.tabTextActive]}>Party Room</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'video' && styles.tabActive]}
            onPress={() => setTab('video')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === 'video' && styles.tabTextActive]}>Pesta Video</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {tab === 'party' ? (
            <View style={styles.grid}>
              {LAYOUTS.map(layout => (
                <LayoutCard
                  key={layout.count}
                  layout={layout}
                  selected={selected === layout.count}
                  onPress={() => handleSelect(layout.count)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyText}>Segera hadir</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#12102A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
    maxHeight: SH * 0.72,
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  closeBtn: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  emptyTab: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    fontStyle: 'italic',
  },
});
