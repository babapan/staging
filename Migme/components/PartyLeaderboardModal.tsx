/**
 * PartyLeaderboardModal.tsx – Redesigned v2
 * Vibe: Chinese live-streaming app — dark stage, spotlight glow, animated rank-1 ring
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AvatarWithFrame from './AvatarWithFrame';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_BASE, buildHeaders } from '../services/auth';

const { width: SW } = Dimensions.get('window');

const PURPLE = '#7C3AED';
const GOLD   = '#FFD700';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';
const DARK   = '#0D0B1E';
const ORANGE = '#FFA726';

const MEDAL_COLORS = [GOLD, SILVER, BRONZE];

const CROWN_IMAGES = [
  require('../assets/images/crown_rank1.png'),
  require('../assets/images/crown_rank2.png'),
  require('../assets/images/crown_rank3.png'),
];

type Period = { key: string; label: string };
const PERIODS: Period[] = [
  { key: 'DAILY',    label: 'Hari Ini' },
  { key: 'WEEKLY',   label: 'Minggu Ini' },
  { key: 'MONTHLY',  label: 'Bulan Ini' },
  { key: 'ALL_TIME', label: 'Sepanjang Masa' },
];

type Tab = 'host' | 'sender' | 'agency';

interface LBEntry {
  username:       string;
  score:          number;
  position:       number;
  displayPicture: string | null;
}

interface AgencyEntry {
  agency_id:    number;
  agency_name:  string;
  owner:        string;
  total_score:  number;
  member_count: number;
  position:     number;
}

const AGENCY_PURPLE  = '#7C3AED';
const AGENCY_VIOLET  = '#A855F7';
const AGENCY_PINK    = '#EC4899';
const AGENCY_DEEP    = '#0D0520';

function formatScore(score: number, tab: Tab): string {
  const prefix = '🪙';
  if (score >= 1_000_000) return `${prefix} ${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000)     return `${prefix} ${(score / 1_000).toFixed(1)}K`;
  return `${prefix} ${score.toLocaleString()}`;
}

// ── Countdown to next period reset ──────────────────────────────────────────
function useCountdown(periodKey: string): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    function calc() {
      const now = new Date();
      let target: Date | null = null;

      if (periodKey === 'DAILY') {
        target = new Date(now);
        target.setHours(24, 0, 0, 0);
      } else if (periodKey === 'WEEKLY') {
        const daysUntilMon = (8 - now.getDay()) % 7 || 7;
        target = new Date(now);
        target.setDate(now.getDate() + daysUntilMon);
        target.setHours(0, 0, 0, 0);
      } else if (periodKey === 'MONTHLY') {
        target = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      }

      if (!target) { setLabel(''); return; }
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) { setLabel('Segera reset'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(h > 0 ? `Reset dalam ${h}j ${m}m` : `Reset dalam ${m}m ${s}d`);
    }
    calc();
    const t = setInterval(calc, 1_000);
    return () => clearInterval(t);
  }, [periodKey]);

  return label;
}

// ── Animated gold glow ring for rank 1 ──────────────────────────────────────
function GlowRing({ size }: { size: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, []);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 1, 0.55] });
  const ring = size + 18;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: ring, height: ring,
        borderRadius: ring / 2,
        borderWidth: 2.5,
        borderColor: GOLD,
        transform: [{ scale }],
        opacity,
        shadowColor: GOLD,
        shadowOpacity: 1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

// ── Podium avatar card ───────────────────────────────────────────────────────
function PodiumCard({ entry, rank, tab }: { entry: LBEntry; rank: 1 | 2 | 3; tab: Tab }) {
  const color  = MEDAL_COLORS[rank - 1];
  const avSize = rank === 1 ? 74 : 54;
  const isFirst = rank === 1;
  const crownSize = isFirst ? 52 : 38;

  return (
    <View style={[podSt.card, isFirst && podSt.cardFirst]}>
      <Image
        source={CROWN_IMAGES[rank - 1]}
        style={{ width: crownSize, height: crownSize }}
        resizeMode="contain"
      />

      <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
        {isFirst && <GlowRing size={avSize} />}
        <View style={[
          podSt.avatarRing,
          {
            borderColor: color,
            shadowColor: color,
            shadowOpacity: isFirst ? 0.9 : 0.5,
            shadowRadius: isFirst ? 14 : 7,
            elevation: isFirst ? 12 : 5,
            borderWidth: isFirst ? 3 : 2,
          },
        ]}>
          <AvatarWithFrame
            username={entry.username}
            size={avSize}
            displayPicture={entry.displayPicture}
            initial={(entry.username || '?').slice(0, 2).toUpperCase()}
            backgroundColor={color + 'AA'}
          />
        </View>
      </View>

      <Text style={[podSt.name, { color: isFirst ? GOLD : '#fff' }]} numberOfLines={1}>
        {entry.username}
      </Text>
      <View style={[podSt.scorePill, { backgroundColor: color + '20', borderColor: color + '70' }]}>
        <Text style={[podSt.scoreNum, { color }]}>{formatScore(entry.score, tab)}</Text>
      </View>
    </View>
  );
}

const podSt = StyleSheet.create({
  card:      { flex: 1, alignItems: 'center', gap: 3, paddingTop: 10 },
  cardFirst: { flex: 1.35 },
  avatarRing:{
    borderRadius: 999, padding: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  name:      { fontSize: 11, fontWeight: '700', textAlign: 'center', maxWidth: 90 },
  scorePill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
  },
  scoreNum:  { fontSize: 11, fontWeight: '800' },
});

// ── Podium step platform ─────────────────────────────────────────────────────
function PodiumSteps() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 68, marginTop: 2 }}>
      {/* Rank 2 */}
      <View style={{ flex: 1, height: 46, borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden' }}>
        <LinearGradient colors={[SILVER + '70', SILVER + '28']} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7 }}>
          <Text style={{ color: SILVER, fontWeight: '900', fontSize: 20 }}>2</Text>
        </LinearGradient>
      </View>
      {/* Rank 1 */}
      <View style={{ flex: 1.35, height: 68, borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden' }}>
        <LinearGradient colors={[GOLD + '90', GOLD + '38']} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 9 }}>
          <Text style={{ color: GOLD, fontWeight: '900', fontSize: 28 }}>1</Text>
        </LinearGradient>
      </View>
      {/* Rank 3 */}
      <View style={{ flex: 1, height: 34, borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden' }}>
        <LinearGradient colors={[BRONZE + '70', BRONZE + '28']} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 5 }}>
          <Text style={{ color: BRONZE, fontWeight: '900', fontSize: 16 }}>3</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

// ── Rank list row (rank 4+) ──────────────────────────────────────────────────
function RankRow({ entry, tab }: { entry: LBEntry; tab: Tab }) {
  const pos = entry.position;
  const rankColor  = pos === 1 ? GOLD : pos === 2 ? SILVER : pos === 3 ? BRONZE : 'rgba(255,255,255,0.32)';
  const scoreColor = tab === 'host' ? '#C084FC' : GOLD;

  return (
    <View style={rowSt.row}>
      <View style={[rowSt.rankBox, { backgroundColor: rankColor + '1A', borderColor: rankColor + '50' }]}>
        <Text style={[rowSt.rankText, { color: rankColor }]}>#{pos}</Text>
      </View>
      <AvatarWithFrame
        username={entry.username} size={40}
        displayPicture={entry.displayPicture}
        initial={(entry.username || '?').slice(0, 2).toUpperCase()}
      />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={rowSt.username} numberOfLines={1}>{entry.username}</Text>
      </View>
      <Text style={[rowSt.score, { color: scoreColor }]}>{formatScore(entry.score, tab)}</Text>
    </View>
  );
}

const rowSt = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rankBox:  { width: 36, height: 36, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '800' },
  username: { fontSize: 14, fontWeight: '600', color: '#fff' },
  score:    { fontSize: 13, fontWeight: '800' },
});

// ── Main modal ───────────────────────────────────────────────────────────────
interface Props { visible: boolean; onClose: () => void; }

export default function PartyLeaderboardModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [activeTab,  setActiveTab]  = useState<Tab>('host');
  const [periodIdx,  setPeriodIdx]  = useState(1);
  const [hosts,      setHosts]      = useState<LBEntry[]>([]);
  const [senders,    setSenders]    = useState<LBEntry[]>([]);
  const [agencies,   setAgencies]   = useState<AgencyEntry[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const period    = PERIODS[periodIdx];
  const countdown = useCountdown(period.key);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(
        `${API_BASE}/api/party/leaderboard?period=${period.key}&limit=20`,
        { headers: headers as Record<string, string> },
      );
      if (res.ok) {
        const data = await res.json();
        setHosts(data.hosts ?? []);
        setSenders(data.senders ?? []);
        setAgencies(data.agencies ?? []);
      }
    } catch {}
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [period.key]);

  useEffect(() => {
    if (visible) load();
  }, [visible, periodIdx]);

  const entries = activeTab === 'host' ? hosts : senders;
  const top3    = entries.slice(0, 3);
  const rest    = entries.slice(3);
  const first   = top3.find(e => e.position === 1);
  const second  = top3.find(e => e.position === 2);
  const third   = top3.find(e => e.position === 3);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: DARK }}>

        {/* ── Stage spotlight gradient (purple + gold light from top) ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={['rgba(124,58,237,0.60)', 'rgba(245,158,11,0.22)', 'rgba(13,11,30,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.52 }}
            style={{ flex: 1 }}
          />
        </View>

        {/* ── Header ── */}
        <View style={[st.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={st.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <MaterialCommunityIcons name="trophy" size={22} color={GOLD} />
          <Text style={st.headerTitle}>Party Leaderboard</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* ── Period pills ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.periodRow}
          style={st.periodScroll}
        >
          {PERIODS.map((p, i) => (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPeriodIdx(i)}
              style={[st.periodChip, periodIdx === i && st.periodChipActive]}
            >
              <Text style={[st.periodText, periodIdx === i && st.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Countdown timer ── */}
        {countdown ? (
          <View style={st.countdownRow}>
            <Ionicons name="timer-outline" size={13} color="rgba(255,255,255,0.45)" />
            <Text style={st.countdownText}>{countdown}</Text>
          </View>
        ) : null}

        {/* ── Tab: Host / Sender / Agency ── */}
        <View style={st.tabRow}>
          <TouchableOpacity
            onPress={() => setActiveTab('host')}
            style={[st.tabBtn, activeTab === 'host' && { backgroundColor: ORANGE + '22', borderColor: ORANGE }]}
          >
            <MaterialCommunityIcons
              name="microphone"
              size={14}
              color={activeTab === 'host' ? ORANGE : 'rgba(255,255,255,0.38)'}
            />
            <Text style={[st.tabText, activeTab === 'host' && { color: ORANGE, fontWeight: '700' }]}>
              Host
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('sender')}
            style={[st.tabBtn, activeTab === 'sender' && { backgroundColor: GOLD + '22', borderColor: GOLD }]}
          >
            <MaterialCommunityIcons
              name="gift"
              size={14}
              color={activeTab === 'sender' ? GOLD : 'rgba(255,255,255,0.38)'}
            />
            <Text style={[st.tabText, activeTab === 'sender' && { color: GOLD, fontWeight: '700' }]}>
              Gift
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('agency')}
            style={[st.tabBtn, activeTab === 'agency' && { backgroundColor: AGENCY_VIOLET + '30', borderColor: AGENCY_VIOLET }]}
          >
            <MaterialCommunityIcons
              name="shield-star"
              size={14}
              color={activeTab === 'agency' ? AGENCY_VIOLET : 'rgba(255,255,255,0.38)'}
            />
            <Text style={[st.tabText, activeTab === 'agency' && { color: AGENCY_VIOLET, fontWeight: '700' }]}>
              Agency
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={st.loadingBox}>
            <ActivityIndicator color={activeTab === 'agency' ? AGENCY_VIOLET : GOLD} size="large" />
            <Text style={st.loadingText}>Memuat leaderboard...</Text>
          </View>
        ) : activeTab === 'agency' ? (
          /* ═══ TOP AGENCY ═══════════════════════════════════════════════════════ */
          agencies.length === 0 ? (
            <View style={st.emptyBox}>
              <MaterialCommunityIcons name="shield-outline" size={54} color="rgba(168,85,247,0.25)" />
              <Text style={st.emptyTitle}>Belum ada data</Text>
              <Text style={st.emptySub}>Agency akan muncul saat host-nya mengirim gift di party room</Text>
            </View>
          ) : (
            <FlatList
              data={agencies}
              keyExtractor={item => String(item.agency_id)}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={AGENCY_VIOLET} />
              }
              ListHeaderComponent={
                <View style={st.agencyHeader}>
                  {/* Glow spotlight purple */}
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <LinearGradient
                      colors={['rgba(124,58,237,0.55)', 'rgba(236,72,153,0.18)', 'transparent']}
                      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <MaterialCommunityIcons name="shield-star" size={20} color={AGENCY_VIOLET} />
                  <Text style={st.agencyHeaderTitle}>Top Agency</Text>
                  <Text style={st.agencyHeaderSub}>{period.label} · Total Pendapatan Host</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={st.agencyRow}>
                  {/* Rank badge */}
                  <View style={[
                    st.agencyRankBox,
                    item.position === 1 && { backgroundColor: GOLD + '22', borderColor: GOLD },
                    item.position === 2 && { backgroundColor: SILVER + '22', borderColor: SILVER },
                    item.position === 3 && { backgroundColor: BRONZE + '22', borderColor: BRONZE },
                  ]}>
                    {item.position <= 3 ? (
                      <Text style={{ fontSize: 16 }}>
                        {item.position === 1 ? '🥇' : item.position === 2 ? '🥈' : '🥉'}
                      </Text>
                    ) : (
                      <Text style={[st.agencyRankText, { color: 'rgba(255,255,255,0.4)' }]}>
                        #{item.position}
                      </Text>
                    )}
                  </View>

                  {/* Agency avatar (initials) + glow */}
                  <View style={st.agencyAvatarWrap}>
                    <LinearGradient
                      colors={
                        item.position === 1
                          ? ['#7C3AED', '#EC4899', '#F59E0B']
                          : item.position === 2
                          ? ['#6D28D9', '#A855F7']
                          : ['#4C1D95', '#7C3AED']
                      }
                      style={st.agencyAvatar}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    >
                      <Text style={st.agencyAvatarTxt}>
                        {(item.agency_name || 'A').slice(0, 2).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    {item.position === 1 && (
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <View style={st.agencyGlow} />
                      </View>
                    )}
                  </View>

                  {/* Agency info */}
                  <View style={{ flex: 1 }}>
                    <Text style={st.agencyName} numberOfLines={1}>{item.agency_name}</Text>
                    <Text style={st.agencyOwner} numberOfLines={1}>@{item.owner} · {item.member_count} host</Text>
                  </View>

                  {/* Score pill */}
                  <LinearGradient
                    colors={
                      item.position === 1
                        ? [AGENCY_PURPLE + 'CC', AGENCY_PINK + '99']
                        : [AGENCY_PURPLE + '44', AGENCY_VIOLET + '33']
                    }
                    style={st.agencyScorePill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <Text style={[
                      st.agencyScore,
                      item.position === 1 && { color: '#F0ABFC', fontSize: 13 },
                    ]}>
                      🪙 {item.total_score >= 1_000_000
                        ? `${(item.total_score / 1_000_000).toFixed(1)}M`
                        : item.total_score >= 1_000
                        ? `${(item.total_score / 1_000).toFixed(1)}K`
                        : item.total_score.toLocaleString()}
                    </Text>
                  </LinearGradient>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            />
          )
        ) : entries.length === 0 ? (
          <View style={st.emptyBox}>
            <MaterialCommunityIcons name="trophy-outline" size={54} color="rgba(255,255,255,0.2)" />
            <Text style={st.emptyTitle}>Belum ada data</Text>
            <Text style={st.emptySub}>
              {activeTab === 'host'
                ? 'Kirim gift ke host party room untuk memulai!'
                : 'Jadilah pengirim gift pertama di party room!'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={rest}
            keyExtractor={item => item.username}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GOLD} />
            }
            ListHeaderComponent={
              <>
                {/* ── Podium ── */}
                {top3.length > 0 && (
                  <View style={st.podiumWrap}>
                    {/* Inner spotlight on podium */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <LinearGradient
                        colors={['rgba(255,215,0,0.16)', 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{ flex: 1 }}
                      />
                    </View>

                    {/* Avatar row: 2nd | 1st | 3rd */}
                    <View style={st.podiumRow}>
                      {second ? <PodiumCard entry={second} rank={2} tab={activeTab} /> : <View style={{ flex: 1 }} />}
                      {first  ? <PodiumCard entry={first}  rank={1} tab={activeTab} /> : <View style={{ flex: 1.35 }} />}
                      {third  ? <PodiumCard entry={third}  rank={3} tab={activeTab} /> : <View style={{ flex: 1 }} />}
                    </View>

                    {/* Stage steps */}
                    <PodiumSteps />
                  </View>
                )}

                {rest.length > 0 && (
                  <Text style={st.restLabel}>Peringkat Berikutnya</Text>
                )}
              </>
            }
            renderItem={({ item }) => <RankRow entry={item} tab={activeTab} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          />
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  backBtn:     { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  periodScroll: { maxHeight: 46, flexGrow: 0 },
  periodRow: {
    paddingHorizontal: 14, paddingVertical: 8,
    gap: 8, alignItems: 'center',
  },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  periodChipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  periodText:       { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  periodTextActive: { color: '#fff', fontWeight: '700' },

  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingBottom: 6,
  },
  countdownText: { fontSize: 11, color: 'rgba(255,255,255,0.42)', fontWeight: '600' },

  tabRow: {
    flexDirection: 'row', gap: 10,
    marginHorizontal: 14, marginBottom: 10,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.38)' },

  podiumWrap: {
    marginHorizontal: 14, marginTop: 4, marginBottom: 4,
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.18)',
    paddingTop: 14,
  },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10 },

  restLabel: {
    fontSize: 11, fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
    paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6,
    letterSpacing: 0.9, textTransform: 'uppercase',
  },

  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },

  emptyBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  emptySub:   { fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20 },

  // ── Top Agency styles ──────────────────────────────────────────────────────
  agencyHeader: {
    alignItems: 'center', paddingVertical: 18, gap: 4,
    marginHorizontal: 14, marginTop: 6, marginBottom: 10,
    borderRadius: 18, overflow: 'hidden',
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
  },
  agencyHeaderTitle: {
    fontSize: 18, fontWeight: '900', color: '#C4B5FD',
    letterSpacing: 1.2, textShadowColor: '#7C3AED', textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  agencyHeaderSub: { fontSize: 11, color: 'rgba(196,181,253,0.55)', fontWeight: '600' },

  agencyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(168,85,247,0.12)',
  },
  agencyRankBox: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  agencyRankText: { fontSize: 12, fontWeight: '800' },

  agencyAvatarWrap: { position: 'relative', width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  agencyAvatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#A855F7', shadowOpacity: 0.8,
    shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  agencyAvatarTxt: { fontSize: 16, fontWeight: '900', color: '#fff' },
  agencyGlow: {
    position: 'absolute',
    width: 62, height: 62, borderRadius: 31, top: -8, left: -8,
    backgroundColor: 'transparent',
    borderWidth: 2, borderColor: 'rgba(168,85,247,0.5)',
    shadowColor: '#A855F7', shadowOpacity: 1,
    shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },

  agencyName: { fontSize: 14, fontWeight: '800', color: '#E9D5FF' },
  agencyOwner: { fontSize: 11, color: 'rgba(196,181,253,0.55)', marginTop: 1 },

  agencyScorePill: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)',
    minWidth: 72, alignItems: 'center',
  },
  agencyScore: { fontSize: 12, fontWeight: '800', color: '#C4B5FD' },
});
