import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';

// ── Color palette (modern Chinese live-app style) ─────────────────────────────
const BG       = '#070B14';
const CARD     = 'rgba(255,255,255,0.06)';
const BORDER   = 'rgba(168,85,247,0.20)';
const ACCENT   = '#A855F7';
const ACCENT2  = '#EC4899';
const TEXT     = '#FFFFFF';
const SUBTEXT  = 'rgba(255,255,255,0.50)';
const CYAN     = '#22D3EE';
const GOLD     = '#F59E0B';
const GREEN    = '#10B981';
const ORANGE   = '#F97316';

interface Agency {
  id: number;
  agency_name: string;
  logo_url: string | null;
  commission: number;
  country: string;
  whatsapp: string;
  status: string;
  agency_code?: string | null;
}
interface JoinRequest {
  id: string; username: string; status: string;
  message: string | null; requested_at: string;
}
interface HostStat {
  username: string; role: string; status: string;
  added_at: string; total_earned: number; weekly_earned: number;
  weekly_coin: number;
  sc_id: number | null; sc_level: string | null; sc_agency_name: string | null;
}
interface WeekStats {
  earned: number;
  commission: number;
  host_count: number;
  start: string;
  end: string;
  week_key: string;
  paid?: boolean;
}
interface LiveSessionEntry {
  id: number;
  room_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  is_live: boolean;
}
interface HostLiveSummary {
  username: string;
  total_seconds: number;
  sessions: LiveSessionEntry[];
}
interface DayLiveData {
  tanggal: string;
  hosts: HostLiveSummary[];
}

const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID');
const fmtIdr = (d: number) => `Rp ${(d * 2).toLocaleString('id-ID')}`;
const tierLabel = (c: number) => c <= 5 ? 'Bronze' : c <= 10 ? 'Silver' : 'Gold';
const tierColor = (c: number) => c <= 5 ? '#CD7F32' : c <= 10 ? '#C0C0C0' : '#F59E0B';

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0d';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateHeader(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) h['Cookie'] = cookie;
  }
  return h;
}
const fetchOpts = (): RequestInit =>
  Platform.OS === 'web' ? { credentials: 'include' } : {};

// ── Glow card wrapper ─────────────────────────────────────────────────────────
function GlowCard({ children, style, glowColor = ACCENT }: {
  children: React.ReactNode;
  style?: object;
  glowColor?: string;
}) {
  return (
    <View style={[
      s.glowCard,
      {
        shadowColor: glowColor,
        borderColor: glowColor + '30',
      },
      style,
    ]}>
      {children}
    </View>
  );
}

// ── Stat metric tile ─────────────────────────────────────────────────────────
function MetricTile({
  label, value, sub, valueColor = CYAN, icon,
}: {
  label: string; value: string; sub?: string;
  valueColor?: string; icon: React.ReactNode;
}) {
  return (
    <View style={s.metricTile}>
      <View style={[s.metricIcon, { backgroundColor: valueColor + '18' }]}>{icon}</View>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, { color: valueColor }]}>{value}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

export default function MyAgencyModal({
  visible, onClose,
}: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  const [agency, setAgency]                     = useState<Agency | null>(null);
  const [hosts, setHosts]                       = useState<HostStat[]>([]);
  const [hostCount, setHostCount]               = useState(0);
  const [totalIncome, setTotalIncome]           = useState(0);
  const [weeklyIncome, setWeeklyIncome]         = useState(0);
  const [hostCommPct, setHostCommPct]           = useState(10);
  const [commissionEarned, setCommissionEarned] = useState(0);
  const [commissionPaid, setCommissionPaid]     = useState(0);
  const [commissionOwed, setCommissionOwed]     = useState(0);
  const [curWeek, setCurWeek]                   = useState<WeekStats | null>(null);
  const [prevWeek, setPrevWeek]                 = useState<WeekStats | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [refreshing, setRefreshing]             = useState(false);
  const [tab, setTab]                           = useState<'overview' | 'hosts' | 'requests' | 'live'>('overview');
  const [liveByDate, setLiveByDate]             = useState<DayLiveData[]>([]);
  const [addHostOpen, setAddHostOpen]           = useState(false);
  const [addUsername, setAddUsername]           = useState('');
  const [addLoading, setAddLoading]             = useState(false);
  const [joinRequests, setJoinRequests]         = useState<JoinRequest[]>([]);
  const [pendingCount, setPendingCount]         = useState(0);
  const [reviewLoading, setReviewLoading]       = useState<string | null>(null);
  const [logoError, setLogoError]               = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await authHeaders();
      const r = await fetch(`${API_BASE}/api/agency/my`, { headers: h, ...fetchOpts() });
      if (r.ok) { const d = await r.json(); setAgency(d.agency ?? null); setLogoError(false); }
    } catch {}
  }, []);

  const loadHosts = useCallback(async () => {
    try {
      const h = await authHeaders();
      const r = await fetch(`${API_BASE}/api/agency/my/hosts/stats`, { headers: h, ...fetchOpts() });
      if (r.ok) {
        const d = await r.json();
        const hs: HostStat[] = d.hosts ?? [];
        setHosts(hs); setHostCount(hs.length);
        setTotalIncome(d.totalEarned ?? 0);
        setWeeklyIncome(d.weeklyEarned ?? 0);
        setHostCommPct(d.commPct ?? 10);
        setCommissionEarned(d.commissionEarned ?? 0);
        setCommissionPaid(d.commissionPaid ?? 0);
        setCommissionOwed(d.commissionOwed ?? 0);
      }
    } catch {}
  }, []);

  const loadWeeklyStats = useCallback(async () => {
    try {
      const h = await authHeaders();
      const r = await fetch(`${API_BASE}/api/agency/my/weekly-stats`, { headers: h, ...fetchOpts() });
      if (r.ok) {
        const d = await r.json();
        setCurWeek(d.current_week ?? null);
        setPrevWeek(d.prev_week ?? null);
      }
    } catch {}
  }, []);

  const loadJoinRequests = useCallback(async () => {
    try {
      const h = await authHeaders();
      const r = await fetch(`${API_BASE}/api/agency/my/join-requests`, { headers: h, ...fetchOpts() });
      if (r.ok) {
        const d = await r.json();
        const reqs: JoinRequest[] = d.requests ?? [];
        setJoinRequests(reqs);
        setPendingCount(reqs.filter(x => x.status === 'pending').length);
      }
    } catch {}
  }, []);

  const loadLiveSessions = useCallback(async () => {
    try {
      const h = await authHeaders();
      const r = await fetch(`${API_BASE}/api/agency/my/live-sessions?days=30`, { headers: h, ...fetchOpts() });
      if (r.ok) {
        const d = await r.json();
        setLiveByDate(d.byDate ?? []);
      }
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([load(), loadHosts(), loadJoinRequests(), loadWeeklyStats(), loadLiveSessions()]);
    setLoading(false);
  }, [load, loadHosts, loadJoinRequests, loadWeeklyStats, loadLiveSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadHosts(), loadJoinRequests(), loadWeeklyStats(), loadLiveSessions()]);
    setRefreshing(false);
  }, [load, loadHosts, loadJoinRequests, loadWeeklyStats, loadLiveSessions]);

  useEffect(() => { if (visible) fetchAll(); }, [visible, fetchAll]);

  const handleAddHost = async () => {
    if (!addUsername.trim()) return;
    setAddLoading(true);
    try {
      const h = await authHeaders(true);
      const r = await fetch(`${API_BASE}/api/agency/my/hosts`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ username: addUsername.trim() }), ...fetchOpts(),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        Alert.alert('Berhasil', d.message ?? 'Host ditambahkan');
        setAddUsername(''); setAddHostOpen(false);
        await Promise.all([load(), loadHosts()]);
      } else { Alert.alert('Gagal', d.message ?? 'Tidak bisa menambah host'); }
    } catch { Alert.alert('Error', 'Tidak bisa terhubung ke server'); }
    setAddLoading(false);
  };

  const handleRemoveHost = (username: string) => {
    Alert.alert('Hapus Host', `Hapus ${username} dari agency?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        try {
          const h = await authHeaders();
          await fetch(`${API_BASE}/api/agency/my/hosts/${username}`, {
            method: 'DELETE', headers: h, ...fetchOpts(),
          });
          await Promise.all([load(), loadHosts()]);
        } catch {}
      }},
    ]);
  };

  const handleReviewRequest = async (reqId: string, action: 'approved' | 'rejected') => {
    setReviewLoading(reqId);
    try {
      const h = await authHeaders(true);
      const r = await fetch(`${API_BASE}/api/agency/join-requests/${reqId}`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ status: action }), ...fetchOpts(),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        await loadJoinRequests();
        if (action === 'approved') await Promise.all([load(), loadHosts()]);
      } else { Alert.alert('Gagal', d.message ?? 'Tidak bisa memproses'); }
    } catch { Alert.alert('Error', 'Tidak bisa terhubung ke server'); }
    setReviewLoading(null);
  };

  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Disalin!', `Kode ${code} sudah disalin.`);
  };

  if (!visible) return null;

  const logoUri = agency?.logo_url && agency.logo_url.startsWith('http')
    ? agency.logo_url : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>My Agency</Text>
          <View style={{ width: 38 }} />
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={ACCENT} size="large" />
            <Text style={[s.subtext, { marginTop: 12 }]}>Memuat data...</Text>
          </View>
        ) : !agency ? (
          <View style={s.center}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="business-outline" size={40} color={ACCENT} />
            </View>
            <Text style={s.emptyTitle}>Belum Ada Agency</Text>
            <Text style={s.emptySub}>Agency kamu masih dalam review atau belum disetujui.</Text>
          </View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
              contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
            >

              {/* ── Hero Banner ── */}
              <LinearGradient
                colors={['#4F0F9E', '#7C3AED', '#A855F7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.heroBanner}
              >
                <View style={s.heroContent}>
                  <View style={s.heroTextBlock}>
                    <Text style={s.heroLabel}>Komisi Agency</Text>
                    <Text style={s.heroPct}>{agency.commission}%</Text>
                    <Text style={s.heroSub}>dari pendapatan host</Text>
                    <Text style={s.heroHint}>Undang host untuk mulai menghasilkan</Text>
                  </View>
                  <View style={s.heroIconBox}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.08)']}
                      style={s.heroIconCircle}
                    >
                      <Ionicons name="trending-up" size={32} color="#fff" />
                    </LinearGradient>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.05)']}
                      style={[s.heroIconCircle, { width: 44, height: 44, borderRadius: 22, marginTop: -8 }]}
                    >
                      <Ionicons name="diamond" size={20} color={GOLD} />
                    </LinearGradient>
                  </View>
                </View>
                {/* Decorative circles */}
                <View style={s.heroCircle1} />
                <View style={s.heroCircle2} />
              </LinearGradient>

              {/* ── Agency Identity Card ── */}
              <GlowCard>
                <View style={s.identityRow}>
                  {/* Logo */}
                  <View style={s.logoWrap}>
                    {logoUri && !logoError ? (
                      <Image
                        source={{ uri: logoUri }}
                        style={s.logoImg}
                        resizeMode="cover"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <LinearGradient
                        colors={[ACCENT + '60', ACCENT2 + '40']}
                        style={s.logoImg}
                      >
                        <Ionicons name="business" size={26} color={TEXT} />
                      </LinearGradient>
                    )}
                    <View style={s.logoBorder} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.agencyName}>{agency.agency_name}</Text>
                    <Text style={s.agencyRole}>Ketua Agensi</Text>
                    <View style={[s.tierPill, { borderColor: tierColor(agency.commission) + '60', backgroundColor: tierColor(agency.commission) + '15' }]}>
                      <View style={[s.tierDot, { backgroundColor: tierColor(agency.commission) }]} />
                      <Text style={[s.tierPillText, { color: tierColor(agency.commission) }]}>
                        {tierLabel(agency.commission)}  ·  {agency.commission}%
                      </Text>
                    </View>
                  </View>
                </View>
              </GlowCard>

              {/* ── Agency Code Card ── */}
              {agency.agency_code ? (
                <GlowCard glowColor={CYAN} style={s.codeCardInner}>
                  <View style={s.codeRow}>
                    <View style={[s.codeIconBox, { backgroundColor: CYAN + '18' }]}>
                      <Ionicons name="key" size={18} color={CYAN} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.codeSmallLabel}>Kode Agency</Text>
                      <Text style={[s.codeValue, { color: CYAN }]}>{agency.agency_code}</Text>
                      <Text style={s.codeHint}>Bagikan agar orang bisa bergabung</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.copyPill, { backgroundColor: CYAN + '18', borderColor: CYAN + '40' }]}
                      onPress={() => handleCopyCode(agency.agency_code!)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={15} color={CYAN} />
                      <Text style={[s.copyPillText, { color: CYAN }]}>Salin</Text>
                    </TouchableOpacity>
                  </View>
                </GlowCard>
              ) : null}

              {/* ── Tabs ── */}
              <View style={s.tabBar}>
                {(['overview', 'hosts', 'requests', 'live'] as const).map(t => {
                  const labels: Record<string, string> = {
                    overview: 'Overview',
                    hosts: `Hosts (${hostCount})`,
                    requests: 'Requests',
                    live: 'Durasi Live',
                  };
                  const active = tab === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.tabItem, active && s.tabItemActive]}
                      onPress={() => setTab(t)}
                      activeOpacity={0.8}
                    >
                      {active ? (
                        <LinearGradient
                          colors={t === 'live' ? [GREEN, '#059669'] : [ACCENT, ACCENT2]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={s.tabGrad}
                        >
                          <Text style={s.tabTextActive}>{labels[t]}</Text>
                          {t === 'requests' && pendingCount > 0 && (
                            <View style={s.tabBadge}><Text style={s.tabBadgeText}>{pendingCount}</Text></View>
                          )}
                        </LinearGradient>
                      ) : (
                        <View style={s.tabGrad}>
                          <Text style={s.tabText}>{labels[t]}</Text>
                          {t === 'requests' && pendingCount > 0 && (
                            <View style={[s.tabBadge, { backgroundColor: ORANGE }]}>
                              <Text style={s.tabBadgeText}>{pendingCount}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ══ OVERVIEW TAB ══ */}
              {tab === 'overview' && (
                <>
                  {/* ── Minggu Ini card ── */}
                  <GlowCard glowColor={CYAN}>
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: CYAN + '20' }]}>
                        <Ionicons name="calendar" size={14} color={CYAN} />
                      </View>
                      <Text style={s.cardTitle}>Minggu Ini</Text>
                      <Text style={[s.weekLabel, { color: CYAN + 'CC' }]}>Senin → Sekarang</Text>
                    </View>
                    <View style={s.metricsGrid}>
                      <MetricTile
                        label="Pendapatan Host"
                        value={fmtNum(curWeek?.earned ?? 0)}
                        sub={fmtIdr(curWeek?.earned ?? 0)}
                        valueColor={CYAN}
                        icon={<Ionicons name="people" size={16} color={CYAN} />}
                      />
                      <View style={s.metricDivider} />
                      <MetricTile
                        label="Komisi Kamu"
                        value={fmtNum(curWeek?.commission ?? 0)}
                        sub={`${agency.commission}%`}
                        valueColor={ACCENT}
                        icon={<Ionicons name="diamond" size={16} color={ACCENT} />}
                      />
                    </View>
                    <View style={[s.pendingNote, { backgroundColor: CYAN + '10', borderColor: CYAN + '30' }]}>
                      <Ionicons name="time-outline" size={13} color={CYAN} />
                      <Text style={[s.pendingNoteText, { color: CYAN + 'CC' }]}>
                        Data berjalan — diperbarui setiap hari oleh sistem
                      </Text>
                    </View>
                  </GlowCard>

                  {/* ── Minggu Lalu card ── */}
                  <GlowCard glowColor={prevWeek?.paid ? GREEN : GOLD}>
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: GOLD + '20' }]}>
                        <Ionicons name="calendar-outline" size={14} color={GOLD} />
                      </View>
                      <Text style={s.cardTitle}>Minggu Lalu</Text>
                      {prevWeek?.paid ? (
                        <View style={[s.paidBadge, { backgroundColor: GREEN + '20', borderColor: GREEN + '40' }]}>
                          <Text style={[s.paidBadgeText, { color: GREEN }]}>✓ Lunas</Text>
                        </View>
                      ) : (
                        <View style={[s.paidBadge, { backgroundColor: ORANGE + '18', borderColor: ORANGE + '40' }]}>
                          <Text style={[s.paidBadgeText, { color: ORANGE }]}>⏳ Menunggu</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.metricsGrid}>
                      <MetricTile
                        label="Pendapatan Host"
                        value={fmtNum(prevWeek?.earned ?? 0)}
                        sub={fmtIdr(prevWeek?.earned ?? 0)}
                        valueColor={GOLD}
                        icon={<Ionicons name="people" size={16} color={GOLD} />}
                      />
                      <View style={s.metricDivider} />
                      <MetricTile
                        label="Komisi Kamu"
                        value={fmtNum(prevWeek?.commission ?? 0)}
                        sub={prevWeek?.paid ? 'Sudah dikirim' : 'Menunggu admin'}
                        valueColor={prevWeek?.paid ? GREEN : GOLD}
                        icon={<Ionicons name="diamond" size={16} color={prevWeek?.paid ? GREEN : GOLD} />}
                      />
                    </View>
                    {!prevWeek?.paid && (prevWeek?.commission ?? 0) > 0 && (
                      <View style={s.pendingNote}>
                        <Ionicons name="information-circle-outline" size={14} color={ORANGE} />
                        <Text style={[s.pendingNoteText, { color: ORANGE }]}>
                          Menunggu admin mengirim diamond komisi
                        </Text>
                      </View>
                    )}
                  </GlowCard>

                  {/* ── All-time ringkasan ── */}
                  <GlowCard glowColor="#A855F7">
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: ACCENT + '20' }]}>
                        <Ionicons name="wallet" size={14} color={ACCENT} />
                      </View>
                      <Text style={s.cardTitle}>Ringkasan All-Time</Text>
                    </View>
                    <View style={s.metricsGrid}>
                      <MetricTile
                        label="Total Host Earned"
                        value={fmtNum(totalIncome)}
                        sub={fmtIdr(totalIncome)}
                        valueColor={CYAN}
                        icon={<Ionicons name="trending-up" size={16} color={CYAN} />}
                      />
                      <View style={s.metricDivider} />
                      <MetricTile
                        label="Komisi Diterima"
                        value={fmtNum(commissionPaid)}
                        sub={commissionOwed > 0 ? `Kurang: ${fmtNum(commissionOwed)}` : 'Semua lunas'}
                        valueColor={commissionPaid > 0 ? GREEN : SUBTEXT}
                        icon={<Ionicons name="checkmark-circle" size={16} color={commissionPaid > 0 ? GREEN : SUBTEXT} />}
                      />
                    </View>

                    <TouchableOpacity
                      style={s.leaderboardBtn}
                      onPress={() => setTab('hosts')}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[GOLD + '20', GOLD + '08']}
                        style={s.leaderboardBtnInner}
                      >
                        <Ionicons name="trophy" size={15} color={GOLD} />
                        <Text style={s.leaderboardBtnText}>Lihat Leaderboard Host</Text>
                        <Ionicons name="chevron-forward" size={14} color={GOLD} />
                      </LinearGradient>
                    </TouchableOpacity>
                  </GlowCard>

                  {/* Host count card */}
                  <GlowCard glowColor={CYAN}>
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: CYAN + '20' }]}>
                        <Ionicons name="people" size={14} color={CYAN} />
                      </View>
                      <Text style={s.cardTitle}>Host Saya</Text>
                      <TouchableOpacity onPress={() => setTab('hosts')} activeOpacity={0.7} style={{ marginLeft: 'auto' }}>
                        <Ionicons name="chevron-forward" size={18} color={SUBTEXT} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[s.bigNumber, { color: CYAN }]}>{hostCount}</Text>
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={s.outlineBtn}
                        onPress={() => agency.agency_code ? handleCopyCode(agency.agency_code) : Alert.alert('Info', 'Kode belum tersedia')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="copy-outline" size={14} color={SUBTEXT} />
                        <Text style={s.outlineBtnText}>
                          {agency.agency_code ?? 'Salin Kode'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.primaryBtn}
                        onPress={() => setAddHostOpen(true)}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={[ACCENT, ACCENT2]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={s.primaryBtnGrad}
                        >
                          <Ionicons name="person-add" size={14} color="#fff" />
                          <Text style={s.primaryBtnText}>Tambah Host</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </GlowCard>

                  {/* Info card */}
                  <GlowCard>
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: ACCENT + '20' }]}>
                        <Ionicons name="information-circle" size={14} color={ACCENT} />
                      </View>
                      <Text style={s.cardTitle}>Info Agency</Text>
                    </View>
                    {[
                      { label: 'Negara', value: agency.country, icon: 'location-outline' as const },
                      { label: 'WhatsApp', value: agency.whatsapp, icon: 'call-outline' as const },
                      { label: 'Komisi', value: `${agency.commission}%`, icon: 'trending-up-outline' as const, color: GOLD },
                    ].map((row, i, arr) => (
                      <View key={row.label} style={[s.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={s.infoLeft}>
                          <Ionicons name={row.icon} size={14} color={SUBTEXT} />
                          <Text style={s.infoLabel}>{row.label}</Text>
                        </View>
                        <Text style={[s.infoValue, row.color ? { color: row.color } : {}]}>{row.value}</Text>
                      </View>
                    ))}
                    <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
                      <View style={s.infoLeft}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={SUBTEXT} />
                        <Text style={s.infoLabel}>Status</Text>
                      </View>
                      <View style={[s.statusPill, { backgroundColor: GREEN + '18', borderColor: GREEN + '50' }]}>
                        <View style={[s.statusDot, { backgroundColor: GREEN }]} />
                        <Text style={[s.statusPillText, { color: GREEN }]}>Approved</Text>
                      </View>
                    </View>
                  </GlowCard>
                </>
              )}

              {/* ══ HOSTS TAB ══ */}
              {tab === 'hosts' && (
                <View style={{ gap: 10 }}>
                  {/* Weekly summary banner */}
                  <GlowCard glowColor={CYAN} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.cardTitleIcon, { backgroundColor: CYAN + '20' }]}>
                        <Ionicons name="calendar" size={14} color={CYAN} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.metricLabel, { color: CYAN }]}>Total Host — Minggu Ini (Senin → Sekarang)</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Ionicons name="diamond" size={14} color={CYAN} />
                          <Text style={[s.metricValue, { color: CYAN, fontSize: 16 }]}>{fmtNum(weeklyIncome)}</Text>
                          <Text style={[s.metricSub, { marginLeft: 8 }]}>Komisi: {fmtNum(Math.floor(weeklyIncome * hostCommPct / 100))} 💎</Text>
                        </View>
                      </View>
                    </View>
                  </GlowCard>

                  <TouchableOpacity onPress={() => setAddHostOpen(true)} activeOpacity={0.8}>
                    <LinearGradient
                      colors={[ACCENT, ACCENT2]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.addHostFab}
                    >
                      <Ionicons name="person-add" size={18} color="#fff" />
                      <Text style={s.addHostFabText}>Tambah Host</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {hosts.length === 0 ? (
                    <View style={s.emptyBox}>
                      <View style={s.emptyIconWrap}>
                        <Ionicons name="people-outline" size={36} color={ACCENT} />
                      </View>
                      <Text style={s.emptyTitle}>Belum ada host</Text>
                      <Text style={s.emptySub}>Tambahkan host pertama kamu!</Text>
                    </View>
                  ) : hosts.map((h, idx) => {
                    const rankPalette = ['#FFD700', '#C0C0C0', '#CD7F32'];
                    const rColor = rankPalette[idx] ?? SUBTEXT;
                    // Gaji pokok target coin per level
                    const GAPOK_TARGET: Record<string, number> = { A1: 120000, S1: 600000 };
                    const gapokTarget = h.sc_level ? (GAPOK_TARGET[h.sc_level] ?? 0) : 0;
                    const gapokPct   = gapokTarget > 0 ? Math.min(100, Math.round((h.weekly_coin / gapokTarget) * 100)) : 0;
                    const gapokMet   = gapokPct >= 100;
                    const GOLD = '#F59E0B';
                    return (
                      <GlowCard key={h.username} glowColor={idx < 3 ? rColor : BORDER} style={{ padding: 14 }}>
                        <View style={s.hostRow}>
                          {/* Rank */}
                          <View style={[s.rankBox, idx < 3 && { backgroundColor: rColor + '18' }]}>
                            {idx < 3 ? (
                              <Ionicons
                                name={idx === 0 ? 'trophy' : idx === 1 ? 'medal' : 'ribbon'}
                                size={18}
                                color={rColor}
                              />
                            ) : (
                              <Text style={[s.rankNum, { color: SUBTEXT }]}>#{idx + 1}</Text>
                            )}
                          </View>

                          {/* Avatar */}
                          <LinearGradient
                            colors={[ACCENT + '60', ACCENT2 + '40']}
                            style={s.hostAvatar}
                          >
                            <Text style={s.hostAvatarText}>{h.username.slice(0, 2).toUpperCase()}</Text>
                          </LinearGradient>

                          {/* Info */}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            {/* Name row + gapok badge */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={s.hostName} numberOfLines={1}>@{h.username}</Text>
                              {h.sc_level && (
                                <View style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 3,
                                  backgroundColor: GOLD + '22', borderWidth: 1, borderColor: GOLD + '66',
                                  borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
                                }}>
                                  <Ionicons name="ribbon" size={10} color={GOLD} />
                                  <Text style={{ color: GOLD, fontSize: 10, fontWeight: '700' }}>
                                    Gapok {h.sc_level}
                                  </Text>
                                </View>
                              )}
                            </View>

                            {/* Diamond earned row */}
                            <View style={s.hostEarnRow}>
                              <Ionicons name="diamond" size={12} color={CYAN} />
                              <Text style={s.hostEarnVal}>{fmtNum(h.weekly_earned)}</Text>
                              <Text style={[s.hostCommission, { marginLeft: 4, marginBottom: 0 }]}>minggu ini</Text>
                            </View>
                            <Text style={s.hostCommission}>
                              Komisi: {fmtNum(Math.floor(h.weekly_earned * hostCommPct / 100))} 💎 · All-time: {fmtNum(h.total_earned)}
                            </Text>

                            {/* Gapok coin progress */}
                            {h.sc_level && gapokTarget > 0 && (
                              <View style={{ marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="cash-outline" size={11} color={GOLD} />
                                    <Text style={{ color: GOLD, fontSize: 10, fontWeight: '600' }}>
                                      Target Coin Gapok {h.sc_level}
                                    </Text>
                                  </View>
                                  <Text style={{ color: gapokMet ? '#22C55E' : GOLD, fontSize: 10, fontWeight: '700' }}>
                                    {gapokPct}% {gapokMet ? '✓' : ''}
                                  </Text>
                                </View>
                                {/* Progress bar */}
                                <View style={{ height: 5, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                                  <View style={{
                                    height: '100%',
                                    width: `${gapokPct}%`,
                                    backgroundColor: gapokMet ? '#22C55E' : GOLD,
                                    borderRadius: 3,
                                  }} />
                                </View>
                                <Text style={{ color: SUBTEXT, fontSize: 9, marginTop: 3 }}>
                                  {fmtNum(h.weekly_coin)} / {fmtNum(gapokTarget)} coin minggu ini
                                  {h.sc_agency_name ? ` · ${h.sc_agency_name}` : ''}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Remove */}
                          <TouchableOpacity
                            onPress={() => handleRemoveHost(h.username)}
                            style={s.removeBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </GlowCard>
                    );
                  })}
                </View>
              )}

              {/* ══ DURASI LIVE TAB ══ */}
              {tab === 'live' && (() => {
                // Hitung Senin minggu ini (WIB) untuk ringkasan mingguan
                const nowWIB = new Date(Date.now() + 7 * 3600000);
                const dayOfWeek = nowWIB.getUTCDay(); // 0=Sun
                const daysSinceMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const monStr = new Date(nowWIB.getTime() - daysSinceMon * 86400000)
                  .toISOString().split('T')[0];

                // Kumpulkan data minggu ini per host dari liveByDate
                const weeklyHostMap: Record<string, { totalSeconds: number; activeDays: number }> = {};
                for (const day of liveByDate) {
                  if (day.tanggal < monStr) continue;
                  for (const h of day.hosts) {
                    if (!weeklyHostMap[h.username]) weeklyHostMap[h.username] = { totalSeconds: 0, activeDays: 0 };
                    weeklyHostMap[h.username].totalSeconds += h.total_seconds;
                    weeklyHostMap[h.username].activeDays += 1;
                  }
                }
                const weeklyHosts = Object.entries(weeklyHostMap)
                  .map(([username, v]) => ({ username, ...v }))
                  .sort((a, b) => b.totalSeconds - a.totalSeconds);

                return (
                <View style={{ gap: 12 }}>
                  {/* ── Ringkasan Minggu Ini ── */}
                  <GlowCard glowColor={GREEN} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
                    <View style={s.cardTitleRow}>
                      <View style={[s.cardTitleIcon, { backgroundColor: GREEN + '20' }]}>
                        <Ionicons name="calendar" size={14} color={GREEN} />
                      </View>
                      <Text style={s.cardTitle}>Jam Live Minggu Ini</Text>
                      <Text style={[s.weekLabel, { color: GREEN + 'CC' }]}>Senin → Sekarang</Text>
                    </View>
                    {weeklyHosts.length === 0 ? (
                      <Text style={[s.subtext, { marginTop: 8, fontSize: 12 }]}>Belum ada sesi minggu ini</Text>
                    ) : weeklyHosts.map((wh, i) => {
                      const hrs = wh.totalSeconds / 3600;
                      return (
                        <View key={wh.username} style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 6,
                          borderTopWidth: i > 0 ? 1 : 0,
                          borderTopColor: 'rgba(255,255,255,0.06)',
                        }}>
                          <LinearGradient colors={[ACCENT + '60', ACCENT2 + '40']} style={s.liveHostAvatar}>
                            <Text style={s.liveHostAvatarTxt}>{wh.username.slice(0, 2).toUpperCase()}</Text>
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: TEXT, fontWeight: '600', fontSize: 13 }}>@{wh.username}</Text>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="time" size={11} color={GREEN} />
                                <Text style={{ color: GREEN, fontSize: 12, fontWeight: '700' }}>
                                  {hrs.toFixed(1)} jam
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="calendar-outline" size={11} color={SUBTEXT} />
                                <Text style={{ color: SUBTEXT, fontSize: 12 }}>
                                  {wh.activeDays} hari aktif
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={{ color: SUBTEXT, fontSize: 11 }}>{fmtDuration(wh.totalSeconds)}</Text>
                        </View>
                      );
                    })}
                  </GlowCard>

                  {/* Info hint */}
                  <View style={[s.pendingNote, { backgroundColor: GREEN + '10', borderColor: GREEN + '30' }]}>
                    <Ionicons name="time-outline" size={13} color={GREEN} />
                    <Text style={[s.pendingNoteText, { color: GREEN + 'CC' }]}>
                      Riwayat sesi naik/turun kursi party room — 30 hari terakhir
                    </Text>
                  </View>

                  {liveByDate.length === 0 ? (
                    <View style={s.emptyBox}>
                      <View style={s.emptyIconWrap}>
                        <Ionicons name="radio-outline" size={36} color={GREEN} />
                      </View>
                      <Text style={s.emptyTitle}>Belum ada data live</Text>
                      <Text style={s.emptySub}>Data akan muncul setelah host masuk ke kursi party room</Text>
                    </View>
                  ) : liveByDate.map((day) => (
                    <GlowCard key={day.tanggal} glowColor={GREEN} style={{ padding: 0, overflow: 'hidden' }}>
                      {/* Tanggal header */}
                      <LinearGradient
                        colors={[GREEN + '30', GREEN + '10']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={s.liveDayHeader}
                      >
                        <Ionicons name="calendar" size={14} color={GREEN} />
                        <Text style={[s.liveDayTitle, { color: GREEN }]}>
                          {fmtDateHeader(day.tanggal)}
                        </Text>
                        <Text style={s.liveDayTotal}>
                          {fmtDuration(day.hosts.reduce((acc, h) => acc + h.total_seconds, 0))} total
                        </Text>
                      </LinearGradient>

                      {/* Per-host entries */}
                      {day.hosts.map((host, hIdx) => (
                        <View key={host.username} style={[
                          s.liveHostBlock,
                          hIdx < day.hosts.length - 1 && s.liveHostDivider,
                        ]}>
                          {/* Host row */}
                          <View style={s.liveHostRow}>
                            <LinearGradient
                              colors={[ACCENT + '60', ACCENT2 + '40']}
                              style={s.liveHostAvatar}
                            >
                              <Text style={s.liveHostAvatarTxt}>{host.username.slice(0, 2).toUpperCase()}</Text>
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                              <Text style={s.liveHostName}>@{host.username}</Text>
                              <View style={s.liveHostEarnRow}>
                                <Ionicons name="time" size={11} color={GREEN} />
                                <Text style={[s.liveHostDurTotal, { color: GREEN }]}>
                                  Total: {fmtDuration(host.total_seconds)}
                                </Text>
                                <Text style={s.liveHostSessionCount}>
                                  {host.sessions.length} sesi
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Session list */}
                          {host.sessions.map((sess) => (
                            <View key={sess.id} style={s.liveSessionRow}>
                              {sess.is_live ? (
                                <View style={s.liveDot} />
                              ) : (
                                <View style={[s.liveDot, { backgroundColor: SUBTEXT }]} />
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={s.liveRoomName} numberOfLines={1}>
                                  {sess.room_name || 'Party Room'}
                                </Text>
                                <Text style={s.liveSessionTime}>
                                  {fmtTime(sess.started_at)}
                                  {sess.ended_at
                                    ? ` → ${fmtTime(sess.ended_at)}`
                                    : ' → '}
                                  {sess.is_live && (
                                    <Text style={{ color: GREEN, fontWeight: '700' }}> 🔴 Live</Text>
                                  )}
                                </Text>
                              </View>
                              <View style={[
                                s.liveDurPill,
                                sess.is_live && { backgroundColor: GREEN + '20', borderColor: GREEN + '50' },
                              ]}>
                                <Text style={[
                                  s.liveDurPillTxt,
                                  sess.is_live && { color: GREEN },
                                ]}>
                                  {fmtDuration(sess.duration_seconds)}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ))}
                    </GlowCard>
                  ))}
                </View>
                );
              })()}

              {/* ══ REQUESTS TAB ══ */}
              {tab === 'requests' && (
                <View style={{ gap: 10 }}>
                  {joinRequests.length === 0 ? (
                    <View style={s.emptyBox}>
                      <View style={s.emptyIconWrap}>
                        <Ionicons name="person-add-outline" size={36} color={ACCENT} />
                      </View>
                      <Text style={s.emptyTitle}>Belum ada permintaan</Text>
                      <Text style={s.emptySub}>Bagikan kode agency kamu agar orang bisa apply</Text>
                    </View>
                  ) : joinRequests.map(req => {
                    const statusCfg = {
                      pending:  { color: GOLD,  bg: GOLD + '15',  border: GOLD + '40',  label: 'Pending' },
                      approved: { color: GREEN, bg: GREEN + '15', border: GREEN + '40', label: 'Diterima' },
                      rejected: { color: '#EF4444', bg: '#EF444415', border: '#EF444440', label: 'Ditolak' },
                    }[req.status] ?? { color: SUBTEXT, bg: 'transparent', border: BORDER, label: req.status };
                    return (
                      <GlowCard key={req.id} glowColor={statusCfg.color}>
                        <View style={s.reqTop}>
                          <LinearGradient colors={[ACCENT + '40', ACCENT2 + '30']} style={s.reqAvatar}>
                            <Ionicons name="person" size={16} color={TEXT} />
                          </LinearGradient>
                          <View style={{ flex: 1 }}>
                            <Text style={s.reqUsername}>{req.username}</Text>
                            <Text style={s.reqDate}>
                              {new Date(req.requested_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </Text>
                          </View>
                          <View style={[s.reqStatusPill, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
                            <Text style={[s.reqStatusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                          </View>
                        </View>
                        {req.message ? (
                          <Text style={s.reqMessage}>"{req.message}"</Text>
                        ) : null}
                        {req.status === 'pending' && (
                          <View style={s.reqActions}>
                            <TouchableOpacity
                              style={[s.reqBtn, { borderColor: '#EF444450', backgroundColor: '#EF444412' }]}
                              onPress={() => handleReviewRequest(req.id, 'rejected')}
                              disabled={reviewLoading === req.id}
                              activeOpacity={0.8}
                            >
                              {reviewLoading === req.id ? (
                                <ActivityIndicator color="#EF4444" size="small" />
                              ) : (
                                <Text style={[s.reqBtnText, { color: '#EF4444' }]}>Tolak</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.reqBtn, { overflow: 'hidden', borderColor: 'transparent' }]}
                              onPress={() => handleReviewRequest(req.id, 'approved')}
                              disabled={reviewLoading === req.id}
                              activeOpacity={0.8}
                            >
                              <LinearGradient
                                colors={[GREEN, '#059669']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={StyleSheet.absoluteFill}
                              />
                              {reviewLoading === req.id ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <Text style={[s.reqBtnText, { color: '#fff', fontWeight: '700' }]}>Terima</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}
                      </GlowCard>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>

      {/* ── Add Host Sheet ── */}
      <Modal visible={addHostOpen} transparent animationType="slide" onRequestClose={() => setAddHostOpen(false)}>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Tambah Host</Text>
            <Text style={s.sheetSub}>Masukkan username member yang ingin dijadikan host</Text>
            <View style={s.inputWrap}>
              <Ionicons name="person-outline" size={16} color={SUBTEXT} style={{ marginRight: 8 }} />
              <TextInput
                style={s.input}
                placeholder="Username..."
                placeholderTextColor={SUBTEXT}
                value={addUsername}
                onChangeText={setAddUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleAddHost}
              />
            </View>
            <View style={s.sheetBtns}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setAddHostOpen(false); setAddUsername(''); }}
                activeOpacity={0.7}
              >
                <Text style={s.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, !addUsername.trim() && { opacity: 0.4 }]}
                onPress={handleAddHost}
                disabled={addLoading || !addUsername.trim()}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[ACCENT, ACCENT2]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.confirmBtnGrad}
                >
                  {addLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.confirmBtnText}>Tambah</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  subtext:    { color: SUBTEXT, fontSize: 13 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.15)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 17,
    fontWeight: '700', color: TEXT, letterSpacing: 0.3,
  },

  scroll: { padding: 16, gap: 12 },

  // Hero banner
  heroBanner: {
    borderRadius: 18, padding: 22, overflow: 'hidden', position: 'relative', marginBottom: 2,
  },
  heroContent: { flexDirection: 'row', alignItems: 'center' },
  heroTextBlock: { flex: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  heroPct: { fontSize: 44, fontWeight: '900', color: '#fff', lineHeight: 52 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  heroHint: { color: 'rgba(255,255,255,0.60)', fontSize: 11, marginTop: 4 },
  heroIconBox: { alignItems: 'center', gap: 6 },
  heroIconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  heroCircle1: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30,
  },
  heroCircle2: {
    position: 'absolute', width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: 20,
  },

  // Glow card
  glowCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25, shadowRadius: 12,
    elevation: 6,
  },

  // Identity card
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoWrap: { position: 'relative' },
  logoImg: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoBorder: {
    position: 'absolute', inset: -2,
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 2, borderColor: ACCENT + '60',
  },
  agencyName: { fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: 0.2 },
  agencyRole: { fontSize: 12, color: SUBTEXT, marginTop: 3 },
  tierPill: {
    marginTop: 7, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4,
  },
  tierDot:      { width: 6, height: 6, borderRadius: 3 },
  tierPillText: { fontSize: 11, fontWeight: '700' },

  // Code card
  codeCardInner: {},
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeIconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  codeSmallLabel: { color: SUBTEXT, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  codeValue: { fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  codeHint:  { color: SUBTEXT, fontSize: 10, marginTop: 3 },
  copyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
  },
  copyPillText: { fontSize: 11, fontWeight: '700' },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)',
    padding: 4, gap: 4,
  },
  tabItem:       { flex: 1, borderRadius: 10, overflow: 'hidden' },
  tabItemActive: {},
  tabGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, gap: 4,
  },
  tabText:       { color: SUBTEXT, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabBadge: {
    backgroundColor: '#ef4444', borderRadius: 99,
    minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Card title row
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitleIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: TEXT, fontSize: 14, fontWeight: '700', flex: 1 },

  // Metrics grid
  metricsGrid: { flexDirection: 'row' },
  metricDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 0 },
  metricDividerH: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 14 },
  metricTile: { flex: 1, paddingHorizontal: 10, gap: 5 },
  metricIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  metricLabel: { color: SUBTEXT, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricSub:   { color: SUBTEXT, fontSize: 11, marginTop: 1 },

  // Week label (inline next to card title)
  weekLabel: { fontSize: 11, marginLeft: 'auto', opacity: 0.8 },

  // Paid badge
  paidBadge: {
    marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99, borderWidth: 1,
  },
  paidBadgeText: { fontSize: 11, fontWeight: '700' },

  // Pending note
  pendingNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, padding: 10, borderRadius: 10,
    backgroundColor: ORANGE + '12', borderWidth: 1, borderColor: ORANGE + '30',
  },
  pendingNoteText: { fontSize: 11, flex: 1, lineHeight: 16 },

  // Leaderboard button
  leaderboardBtn: { marginTop: 14, borderRadius: 12, overflow: 'hidden' },
  leaderboardBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, gap: 7,
    borderRadius: 12, borderWidth: 1, borderColor: GOLD + '35',
  },
  leaderboardBtnText: { color: GOLD, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'center' },

  // Big number
  bigNumber: { fontSize: 42, fontWeight: '900', marginBottom: 14 },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10 },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingVertical: 11,
  },
  outlineBtnText: { color: SUBTEXT, fontSize: 12, fontWeight: '600' },
  primaryBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  primaryBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11,
  },
  primaryBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { color: SUBTEXT, fontSize: 13 },
  infoValue: { color: TEXT, fontSize: 13, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4,
  },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  // Add host FAB
  addHostFab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
  },
  addHostFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Host row
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rankNum: { fontWeight: '800', fontSize: 12 },
  hostAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  hostAvatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hostName: { color: TEXT, fontWeight: '700', fontSize: 14 },
  hostEarnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  hostEarnVal: { color: CYAN, fontSize: 12, fontWeight: '700' },
  hostCommission: { color: SUBTEXT, fontSize: 11, marginTop: 2 },
  removeBtn: {
    padding: 8, borderRadius: 10, backgroundColor: '#EF444415',
  },

  // Empty state
  // ── Durasi Live tab styles ──────────────────────────────────────────────
  liveDayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  liveDayTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  liveDayTotal: { fontSize: 11, color: SUBTEXT, fontWeight: '600' },
  liveHostBlock: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  liveHostDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', paddingBottom: 12 },
  liveHostRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  liveHostAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  liveHostAvatarTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  liveHostName: { fontSize: 13, fontWeight: '700', color: TEXT },
  liveHostEarnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  liveHostDurTotal: { fontSize: 11, fontWeight: '700' },
  liveHostSessionCount: { fontSize: 11, color: SUBTEXT, marginLeft: 4 },
  liveSessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4, paddingLeft: 4,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN,
  },
  liveRoomName: { fontSize: 12, fontWeight: '600', color: TEXT },
  liveSessionTime: { fontSize: 11, color: SUBTEXT },
  liveDurPill: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  liveDurPillTxt: { fontSize: 11, fontWeight: '700', color: SUBTEXT },
  // ── End Durasi Live tab styles ──────────────────────────────────────────

  emptyBox:     { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: ACCENT + '18', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: ACCENT + '30', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  emptySub:   { color: SUBTEXT, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Request card
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  reqUsername: { color: TEXT, fontWeight: '700', fontSize: 14 },
  reqDate:     { color: SUBTEXT, fontSize: 11, marginTop: 2 },
  reqStatusPill: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  reqStatusText: { fontSize: 11, fontWeight: '700' },
  reqMessage: { color: SUBTEXT, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: 4 },
  reqActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reqBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, overflow: 'hidden',
  },
  reqBtnText: { fontWeight: '600', fontSize: 13 },

  // Sheet (Add host)
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.70)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F1220',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
    padding: 24, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { color: TEXT, fontSize: 18, fontWeight: '800', marginBottom: 5 },
  sheetSub:   { color: SUBTEXT, fontSize: 13, marginBottom: 20, lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2,
    marginBottom: 18,
  },
  input: { flex: 1, color: TEXT, fontSize: 15, paddingVertical: 12 },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.40)',
    alignItems: 'center',
  },
  cancelBtnText: { color: ACCENT, fontWeight: '600', fontSize: 14 },
  confirmBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  confirmBtnGrad: {
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
