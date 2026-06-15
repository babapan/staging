import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Image, Modal,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveViewer } from '../services/liveService';

// ── Colour helpers ────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#FF6B9D','#FFB800','#26C6DA','#A855F7','#10B981','#F97316','#3B82F6','#EF4444'];

function levelTier(lv: number) {
  if (lv <= 0)   return { bg: '#374151', border: '#6B7280', text: '#9CA3AF' };
  if (lv <= 10)  return { bg: '#1D4ED8', border: '#3B82F6', text: '#BFDBFE' };
  if (lv <= 20)  return { bg: '#065F46', border: '#10B981', text: '#A7F3D0' };
  if (lv <= 30)  return { bg: '#78350F', border: '#F59E0B', text: '#FDE68A' };
  if (lv <= 100) return { bg: '#7C2D12', border: '#F97316', text: '#FED7AA' };
  if (lv <= 200) return { bg: '#831843', border: '#EC4899', text: '#FBCFE8' };
  return               { bg: '#7F1D1D', border: '#EF4444', text: '#FECACA' };
}

function fmtCoins(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Badge components ──────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: number }) {
  const t = levelTier(level);
  return (
    <View style={[s.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[s.badgeTxt, { color: t.text }]}>Lv {level}</Text>
    </View>
  );
}
function HostBadge() {
  return (
    <View style={[s.badge, { backgroundColor: '#92400E', borderColor: '#F59E0B' }]}>
      <Text style={[s.badgeTxt, { color: '#FDE68A' }]}>Host</Text>
    </View>
  );
}
function AdminBadge() {
  return (
    <View style={[s.badge, { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' }]}>
      <Text style={[s.badgeTxt, { color: '#BFDBFE' }]}>Admin</Text>
    </View>
  );
}
function VipBadge({ level }: { level: number }) {
  if (!level || level <= 0) return null;
  return (
    <View style={[s.badge, { backgroundColor: '#4C1D95', borderColor: '#8B5CF6' }]}>
      <Text style={[s.badgeTxt, { color: '#DDD6FE' }]}>VIP {level}</Text>
    </View>
  );
}
function AgencyBadge({ name }: { name: string }) {
  return (
    <View style={[s.badge, { backgroundColor: '#064E3B', borderColor: '#10B981' }]}>
      <Text style={[s.badgeTxt, { color: '#A7F3D0' }]} numberOfLines={1}>{name}</Text>
    </View>
  );
}
function BotBadge() {
  return (
    <View style={[s.badge, { backgroundColor: '#1F2937', borderColor: '#4B5563' }]}>
      <Text style={[s.badgeTxt, { color: '#9CA3AF' }]}>Bot</Text>
    </View>
  );
}

// ── Viewer Row ────────────────────────────────────────────────────────────────
function ViewerRow({
  item, index, showContrib, onPress,
}: { item: LiveViewer; index: number; showContrib: boolean; onPress?: () => void }) {
  const initials = (item.displayName || item.username).charAt(0).toUpperCase();
  const acColor  = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const isBot    = item.isBot === true;

  const inner = (
    <View style={[s.row, isBot && s.rowBot]}>
      {/* Avatar */}
      <View style={s.avatarWrap}>
        {item.avatarFrameUrl ? (
          <Image source={{ uri: item.avatarFrameUrl }} style={s.avatarFrame} />
        ) : null}
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={s.avatarImg} />
        ) : (
          <View style={[s.avatarFallback, { backgroundColor: isBot ? '#374151' : acColor }]}>
            {isBot
              ? <MaterialCommunityIcons name="robot-outline" size={20} color="#9CA3AF" />
              : <Text style={s.avatarInitial}>{initials}</Text>
            }
          </View>
        )}
        {(item.vipLevel ?? 0) > 0 && <View style={s.vipRing} />}
      </View>

      {/* Name + badges */}
      <View style={s.nameCol}>
        <Text style={[s.displayName, isBot && s.displayNameBot]} numberOfLines={1}>
          {item.displayName || item.username}
        </Text>
        <View style={s.badgeRow}>
          {!isBot && <LevelBadge level={item.migLevel ?? 1} />}
          {item.isHost  && <HostBadge />}
          {item.isAdmin && !item.isHost && <AdminBadge />}
          {item.agencyName && <AgencyBadge name={item.agencyName} />}
          {!isBot && <VipBadge level={item.vipLevel ?? 0} />}
          {isBot && <BotBadge />}
        </View>
      </View>

      {/* Contribution */}
      {showContrib && (item.giftTotal ?? 0) > 0 && (
        <View style={s.contribWrap}>
          <MaterialCommunityIcons name="diamond-stone" size={12} color="#F59E0B" />
          <Text style={s.contribTxt}>{fmtCoins(item.giftTotal ?? 0)}</Text>
        </View>
      )}

      {/* Chevron hanya untuk real users */}
      {!isBot && onPress && (
        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
      )}
    </View>
  );

  if (isBot || !onPress) return inner;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {inner}
    </TouchableOpacity>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface LiveViewerListModalProps {
  visible:         boolean;
  onClose:         () => void;
  viewers:         LiveViewer[];
  viewerCount:     number;
  onFetchViewers?: () => Promise<LiveViewer[]>;
  onViewerPress?:  (username: string) => void;
}

type Tab = 'penonton' | 'admin' | 'kontribusi';

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveViewerListModal({
  visible, onClose, viewers: initialViewers, viewerCount, onFetchViewers, onViewerPress,
}: LiveViewerListModalProps) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [tab,      setTab]     = useState<Tab>('penonton');
  const [viewers,  setViewers] = useState<LiveViewer[]>(initialViewers);
  const [loading,  setLoading] = useState(false);

  // Slide + fetch on open
  useEffect(() => {
    if (visible) {
      setViewers(initialViewers);
      setTab('penonton');
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      if (onFetchViewers) {
        setLoading(true);
        onFetchViewers()
          .then(list => { if (list.length > 0) setViewers(list); })
          .finally(() => setLoading(false));
      }
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  // Sync with parent updates
  useEffect(() => {
    if (visible && !loading) setViewers(v => v.length > 0 ? v : initialViewers);
  }, [initialViewers, visible]);

  const adminList   = viewers.filter(v => (v.isAdmin || v.isHost) && !v.isBot);
  const contribList = [...viewers]
    .sort((a, b) => (b.giftTotal ?? 0) - (a.giftTotal ?? 0))
    .filter(v => (v.giftTotal ?? 0) > 0);
  const data = tab === 'admin' ? adminList : tab === 'kontribusi' ? contribList : viewers;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        style={[s.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 8 }]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Ionicons name="eye-outline" size={16} color="#fff" />
            <Text style={s.headerTitle}>Penonton</Text>
            <View style={s.countPill}>
              <Text style={s.countTxt}>{viewerCount}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['penonton', 'admin', 'kontribusi'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={s.tabBtn} onPress={() => setTab(t)}>
              <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
                {t === 'penonton' ? 'Penonton' : t === 'admin' ? 'Admin' : 'Rank Kontribusi'}
              </Text>
              {tab === t && <View style={s.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading && data.length === 0 ? (
          <View style={s.emptyWrap}>
            <ActivityIndicator color="rgba(255,255,255,0.5)" />
            <Text style={s.emptyTxt}>Memuat penonton…</Text>
          </View>
        ) : data.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.25)" />
            <Text style={s.emptyTxt}>
              {tab === 'admin' ? 'Belum ada admin' : tab === 'kontribusi' ? 'Belum ada gift' : 'Belum ada penonton'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={item => item.username}
            renderItem={({ item, index }) => (
              <ViewerRow
                item={item}
                index={index}
                showContrib={tab === 'kontribusi'}
                onPress={item.isBot ? undefined : (onViewerPress ? () => onViewerPress(item.username) : undefined)}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            style={s.list}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(10,5,20,0.93)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%',
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)',
    marginTop: 10, marginBottom: 2,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  countTxt:  { color: '#fff', fontSize: 12, fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
  },
  tabBtn:       { marginRight: 20, paddingVertical: 8, alignItems: 'center' },
  tabTxt:       { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: '#fff' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: '#EC4899', borderRadius: 1,
  },
  list:      { flexGrow: 0 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt:  { color: 'rgba(255,255,255,0.35)', fontSize: 14 },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowBot: { opacity: 0.65 },

  // Avatar
  avatarWrap:     { width: 44, height: 44, position: 'relative' },
  avatarFrame:    { position: 'absolute', width: 52, height: 52, top: -4, left: -4, zIndex: 2 },
  avatarImg:      { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  vipRing: {
    position: 'absolute', top: -2, left: -2, width: 48, height: 48,
    borderRadius: 24, borderWidth: 2, borderColor: '#8B5CF6', zIndex: 1,
  },

  // Name col
  nameCol:       { flex: 1, gap: 4 },
  displayName:   { color: '#fff', fontSize: 14, fontWeight: '600' },
  displayNameBot: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '400' },
  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  // Badge pill
  badge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeTxt: { fontSize: 10, fontWeight: '700' },

  // Contribution
  contribWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  contribTxt:  { color: '#F59E0B', fontSize: 12, fontWeight: '700' },
});
