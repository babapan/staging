import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMe, logout, type AuthUser, API_BASE } from '../../services/auth';
import { getSession } from '../../services/storage';
import { getCreditBalance, getCreditTransactions, idrToCoin, type CreditBalance, type CreditTransaction } from '../../services/credit';
import { getDiamondBalance } from '../../services/diamondService';
import DiamondWalletModal from '../../components/DiamondWalletModal';
import CreditsModal from '../../components/CreditsModal';
import SettingsModal from '../../components/SettingsModal';
import { useAppTheme } from '../../services/themeContext';
import AvatarWithFrame from '../../components/AvatarWithFrame';
import TokoModal from '../../components/TokoModal';
import VipBadge from '../../components/VipBadge';

const C = {
  bg:         '#F4F5F7',
  white:      '#FFFFFF',
  text:       '#1A1A2E',
  sub:        '#888',
  accent:     '#006D8F',
  sep:        '#E8E8E8',
  genderBg:   '#3B82F6',
  coinBg:     '#F59E0B',
  statNum:    '#111',
  statLbl:    '#888',
  tileBg:     '#F0F0F0',
  tileText:   '#333',
  coinCard:   '#FFF7E6',
  coinBorder: '#FDDFA0',
  diamCard:   '#EEF2FF',
  diamBorder: '#C7D2FE',
  bannerBg:   '#4A2C0A',
  bannerText: '#FFF',
  menuBg:     '#1E293B',
  menuText:   '#F8FAFC',
  menuDiv:    '#334155',
};

const COUNTRY_FLAGS: Record<string, string> = {
  ID: '🇮🇩', US: '🇺🇸', MY: '🇲🇾', SG: '🇸🇬', AU: '🇦🇺',
  GB: '🇬🇧', JP: '🇯🇵', KR: '🇰🇷', PH: '🇵🇭', TH: '🇹🇭',
  VN: '🇻🇳', CN: '🇨🇳', IN: '🇮🇳', DE: '🇩🇪', FR: '🇫🇷',
  NL: '🇳🇱', BR: '🇧🇷', CA: '🇨🇦', MX: '🇲🇽', ZA: '🇿🇦',
  indonesia: '🇮🇩', malaysia: '🇲🇾', singapore: '🇸🇬',
  australia: '🇦🇺', philippines: '🇵🇭', thailand: '🇹🇭',
  vietnam: '🇻🇳',
};

function getFlag(country?: string | null): string {
  if (!country) return '';
  const key = country.toUpperCase();
  return COUNTRY_FLAGS[key] ?? COUNTRY_FLAGS[country.toLowerCase()] ?? '🌏';
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(2)}K`;
  return String(n);
}

function fmtLiveDuration(sec: number): string {
  if (sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}j ${m}m`;
  if (h > 0) return `${h}j`;
  return `${m}m`;
}

function fmtTanggal(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+07:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCoin(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface ReputationLevel {
  level: number;
  levelName: string;
  score: number;
  nextLevelAt: number | null;
  progressPct: number;
  privileges: {
    publishPhoto: boolean;
    postCommentLikeUserWall: boolean;
    addToPhotoWall: boolean;
    createChatRoom: boolean;
    createGroup: boolean;
    enterPot: boolean;
    chatRoomSize: number | null;
    groupSize: number | null;
  } | null;
}

interface ProfileData {
  user: { id: string; username: string; displayName: string };
  profile: {
    gender?: string | null;
    country?: string | null;
    city?: string | null;
    aboutMe?: string | null;
    displayPicture?: string | null;
    migLevel?: number;
  } | null;
  counts?: {
    posts?: number;
    followers?: number;
    following?: number;
    coinsReceived?: number;
    badges?: number;
    friends?: number;
    giftsReceived?: number;
  };
  avatarFrameUrl?: string | null;
}

export default function ProfileScreen({ onClose }: { onClose?: () => void } = {}) {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser]           = useState<AuthUser | null>(null);
  const [credit, setCredit]       = useState<CreditBalance | null>(null);
  const [diamond, setDiamond]     = useState<number>(0);
  const [txns, setTxns]           = useState<CreditTransaction[]>([]);
  const [profile, setProfile]     = useState<ProfileData | null>(null);
  const [repLevel, setRepLevel]   = useState<ReputationLevel | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showMenu, setShowMenu]   = useState(false);
  const [settingsOpen, setSettingsOpen]     = useState(false);
  const [settingsPage, setSettingsPage]     = useState<'editProfile' | 'changeAvatar' | 'main'>('main');
  const [diamondOpen, setDiamondOpen]       = useState(false);
  const [creditsOpen, setCreditsOpen]       = useState(false);
  const [creditsInitTab, setCreditsInitTab] = useState<'balance' | 'transfer' | 'history'>('balance');
  const [copied, setCopied]                 = useState(false);
  const [tokoOpen, setTokoOpen]             = useState(false);
  const [isAgencyHost, setIsAgencyHost]     = useState(false);
  const [agencyName, setAgencyName]         = useState<string | null>(null);

  interface LiveDailyRow { tanggal: string; live_seconds: number; coin: number; agency_name: string | null; }
  const [liveDaily, setLiveDaily]           = useState<LiveDailyRow[]>([]);
  const [temanOpen, setTemanOpen]           = useState(false);
  const [mengikutiOpen, setMengikutiOpen]   = useState(false);
  const [giftOpen, setGiftOpen]             = useState(false);

  interface FriendItem { friendUserId: string; friendUsername: string; friendDisplayName: string; displayPicture?: string | null; presence?: string; }
  interface FollowItem { username: string; displayName?: string | null; displayPicture?: string | null; }
  interface GiftItem   { id: number; sender: string; message?: string | null; created_at: string; image_url?: string | null; emoji?: string | null; }
  const [temanList, setTemanList]           = useState<FriendItem[]>([]);
  const [mengikutiList, setMengikutiList]   = useState<FollowItem[]>([]);
  const [giftList, setGiftList]             = useState<GiftItem[]>([]);
  const [listLoading, setListLoading]       = useState(false);

  const openTeman = useCallback(async () => {
    setTemanOpen(true);
    setListLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/contacts`, { credentials: 'include', headers });
      if (res.ok) { const d = await res.json(); setTemanList(d.contacts ?? d ?? []); }
    } catch {} finally { setListLoading(false); }
  }, [buildHeaders]);

  const openMengikuti = useCallback(async () => {
    setMengikutiOpen(true);
    setListLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/me/following-detail`, { credentials: 'include', headers });
      if (res.ok) { const d = await res.json(); setMengikutiList(d.following ?? []); }
    } catch {} finally { setListLoading(false); }
  }, [buildHeaders]);

  const openGift = useCallback(async () => {
    setGiftOpen(true);
    setListLoading(true);
    try {
      const headers = await buildHeaders();
      const uname = (await getMe())?.username ?? '';
      const res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(uname)}/gifts-received?limit=60`, { credentials: 'include', headers });
      if (res.ok) { const d = await res.json(); setGiftList(d.gifts ?? []); }
    } catch {} finally { setListLoading(false); }
  }, [buildHeaders]);

  interface JpWin {
    milestone: string;
    label: string;
    emoji: string;
    coin_reward: number;
    won_at: string;
    siklus_id: number;
  }
  const [jpWins, setJpWins] = useState<JpWin[]>([]);

  const buildHeaders = useCallback(async () => {
    const h: Record<string, string> = {};
    if (Platform.OS !== 'web') {
      const cookie = await getSession();
      if (cookie) h['Cookie'] = cookie;
    }
    return h;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await getMe();
      setUser(me);
      if (me?.username) {
        const headers = await buildHeaders();
        const [bal, diamBal, recentTxns, profileRes, repRes, jpRes, hostRes, liveRes] = await Promise.all([
          getCreditBalance(me.username),
          getDiamondBalance(),
          getCreditTransactions(me.username, 5),
          fetch(`${API_BASE}/api/profile/me`, { credentials: 'include', headers }),
          fetch(`${API_BASE}/api/reputation/${me.username}`, { credentials: 'include' }),
          fetch(`${API_BASE}/api/lucky-gift/my-wins?limit=5`, { credentials: 'include', headers }),
          fetch(`${API_BASE}/api/agency/my/is-host`, { credentials: 'include', headers }),
          fetch(`${API_BASE}/api/agency/my/live-daily`, { credentials: 'include', headers }),
        ]);
        setCredit(bal);
        setDiamond(diamBal?.balance ?? 0);
        if (hostRes.ok) {
          const hostData = await hostRes.json();
          setIsAgencyHost(hostData.isHost === true);
          setAgencyName(hostData.agencyName ?? null);
        } else {
          setIsAgencyHost(false);
          setAgencyName(null);
        }
        if (liveRes.ok) {
          const ld = await liveRes.json();
          setLiveDaily(ld.daily ?? []);
        } else {
          setLiveDaily([]);
        }
        setTxns(recentTxns);
        if (profileRes.ok) {
          const data: ProfileData = await profileRes.json();
          setProfile(data);
        }
        if (repRes.ok) {
          const repData = await repRes.json();
          setRepLevel({
            level:       repData.level,
            levelName:   repData.levelName,
            score:       repData.score,
            nextLevelAt: repData.nextLevelAt ?? null,
            progressPct: repData.progressPct ?? 0,
            privileges:  repData.levelPrivileges ?? null,
          });
        }
        if (jpRes.ok) {
          const jpData = await jpRes.json();
          setJpWins(jpData.wins ?? []);
        }
      }
    } catch {}
    setLoading(false);
  }, [buildHeaders]);

  useEffect(() => { fetchData(); }, []);

  // Re-fetch profile whenever this tab comes into focus (e.g. after buying a frame)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const prevSettingsOpen = useRef(settingsOpen);
  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) fetchData();
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen, fetchData]);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Yakin ingin keluar?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/');
      }},
    ]);
  };

  const menuItems = [
    { id: 'edit',     label: 'Edit profil',    icon: 'create-outline' as const },
    { id: 'avatar',   label: 'Ganti avatar',   icon: 'camera-outline' as const },
    { id: 'settings', label: 'Pengaturan',     icon: 'settings-outline' as const },
    { id: 'logout',   label: 'Keluar',         icon: 'log-out-outline' as const },
  ];

  const handleMenuSelect = (id: string) => {
    setShowMenu(false);
    if (id === 'edit') { setSettingsPage('editProfile'); setSettingsOpen(true); }
    else if (id === 'avatar') { setSettingsPage('changeAvatar'); setSettingsOpen(true); }
    else if (id === 'settings') { setSettingsPage('main'); setSettingsOpen(true); }
    else if (id === 'logout') handleLogout();
  };

  if (loading) {
    return (
      <View style={[ss.container, ss.center, { backgroundColor: theme.screenBg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  const displayName    = profile?.user?.displayName || user?.displayName || user?.username || 'Guest';
  const username       = user?.username ?? '';
  const migLevel       = profile?.profile?.migLevel ?? 1;
  const vipLevel       = (profile?.profile as any)?.vipLevel ?? 0;
  const vipExpiresAt   = (profile?.profile as any)?.vipExpiresAt ?? null;
  const country        = profile?.profile?.country;
  const gender         = profile?.profile?.gender;
  const avatarUrl      = profile?.profile?.displayPicture;
  const avatarFrameUrl = profile?.avatarFrameUrl ?? null;
  const userId         = profile?.user?.id ?? user?.id ?? '';

  const counts    = profile?.counts;
  const teman     = counts?.friends       ?? 0;
  const mengikuti = counts?.following     ?? 0;
  const gift      = counts?.giftsReceived ?? 0;

  const coinBalance = idrToCoin(credit?.balance ?? 0);
  const flag  = getFlag(country);
  const genderIcon = gender === 'female' ? '♀' : '♂';
  const levelName = repLevel?.levelName ?? 'Bangsawan';

  const SHORTCUTS = [
    { id: 'toko',    image: require('../../assets/images/toko.png'),   label: 'Toko' },
    { id: 'svip',    image: require('../../assets/images/svip.png'),   label: 'SVIP' },
    { id: 'keluarga',image: require('../../assets/images/family.png'), label: 'Keluarga' },
    { id: 'medali',  image: require('../../assets/images/medal.png'),  label: 'Medali' },
  ];

  return (
    <View style={[ss.container, { backgroundColor: C.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} style={ss.scroll}>

        {/* ── Header bar ── */}
        <View style={[ss.topBar, { paddingTop: insets.top + 8 }]}>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={ss.topBackBtn} testID="button-profile-back">
              <Ionicons name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setShowMenu(v => !v)}
            style={ss.topMoreBtn}
            testID="button-profile-more"
          >
            <Ionicons name="ellipsis-vertical" size={20} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* ── Profile card: avatar + info ── */}
        <View style={ss.profileCard}>
          <AvatarWithFrame
            size={72}
            username={username || undefined}
            displayPicture={avatarUrl}
            avatarFrameUrl={avatarFrameUrl}
            initial={displayName.slice(0, 2).toUpperCase()}
            backgroundColor="#1A6B72"
          />
          <View style={ss.profileInfo}>
            {/* Name + edit arrow */}
            <View style={ss.nameRow}>
              <Text style={ss.displayName} numberOfLines={1}>{displayName}</Text>
              <TouchableOpacity
                onPress={() => { setSettingsPage('editProfile'); setSettingsOpen(true); }}
                style={ss.editArrow}
              >
                <Ionicons name="chevron-forward" size={18} color={C.sub} />
              </TouchableOpacity>
            </View>
            {/* Username badge — tap to copy */}
            <TouchableOpacity
              style={[ss.idBadge, copied && ss.idBadgeCopied]}
              activeOpacity={0.7}
              onPress={async () => {
                await Clipboard.setStringAsync(`@${username}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copied ? '#16A34A' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <Text style={[ss.idText, copied && ss.idTextCopied]}>
                {copied ? 'Disalin!' : `@${username}`}
              </Text>
            </TouchableOpacity>
            {/* Flag + gender badge + coin badge + VIP badge */}
            <View style={ss.badgeRow}>
              {flag ? <Text style={ss.flagText}>{flag}</Text> : null}
              <View style={ss.genderBadge}>
                <Text style={ss.genderText}>{genderIcon} {migLevel}</Text>
              </View>
              <View style={ss.coinBadge}>
                <Text style={ss.coinBadgeText}>🪙 {formatCount(coinBalance)}</Text>
              </View>
              {vipLevel > 0 && <VipBadge level={vipLevel} size={32} />}
            </View>
            {/* VIP expiry info */}
            {vipLevel > 0 && vipExpiresAt && (
              <Text style={ss.vipExpiryText}>
                VIP {vipLevel} · Berlaku hingga {new Date(vipExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            )}

            {/* Agency badge — tampil hanya kalau user adalah host aktif */}
            {isAgencyHost && agencyName ? (
              <View style={ss.agencyBadgeWrap}>
                <View style={ss.agencyBadge}>
                  <View style={ss.agencyBadgeGloss} pointerEvents="none" />
                  <Text style={ss.agencyBadgeIcon}>🏢</Text>
                  <View style={ss.agencyBadgeDivider} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={ss.agencyBadgeLabel}>AGENCY HOST</Text>
                    <Text style={ss.agencyBadgeName} numberOfLines={1}>{agencyName}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Stats row: Teman | Mengikuti | Gift ── */}
        <View style={ss.statsRow}>
          <TouchableOpacity style={ss.statItem} activeOpacity={0.7} onPress={openTeman}>
            <Text style={ss.statNum}>{formatCount(teman)}</Text>
            <Text style={ss.statLbl}>Teman</Text>
          </TouchableOpacity>
          <View style={ss.statDiv} />
          <TouchableOpacity style={ss.statItem} activeOpacity={0.7} onPress={openMengikuti}>
            <Text style={ss.statNum}>{formatCount(mengikuti)}</Text>
            <Text style={ss.statLbl}>Mengikuti</Text>
          </TouchableOpacity>
          <View style={ss.statDiv} />
          <TouchableOpacity style={ss.statItem} activeOpacity={0.7} onPress={openGift}>
            <Text style={ss.statNum}>{formatCount(gift)}</Text>
            <Text style={[ss.statLbl, { color: '#E91E8C' }]}>🎁 Gift</Text>
          </TouchableOpacity>
        </View>

        {/* ── Shortcut tiles ── */}
        <View style={ss.tilesRow}>
          {SHORTCUTS.map(s => (
            <TouchableOpacity
              key={s.id}
              style={ss.tile}
              activeOpacity={0.7}
              onPress={() => {
                if (s.id === 'toko') { setTokoOpen(true); return; }
                Alert.alert(s.label, 'Segera hadir!');
              }}
            >
              <Image source={s.image} style={ss.tileIcon} resizeMode="contain" />
              <Text style={ss.tileLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Balance cards: Koin + Aset (Diamond) ── */}
        <View style={ss.balanceRow}>
          {/* Koin saya */}
          <TouchableOpacity
            style={[ss.balCard, { backgroundColor: C.coinCard, borderColor: C.coinBorder }]}
            activeOpacity={0.85}
            onPress={() => { setCreditsInitTab('balance'); setCreditsOpen(true); }}
          >
            <View style={ss.balCardInner}>
              <Text style={ss.balIcon}>🪙</Text>
              <View style={{ flex: 1 }}>
                <Text style={ss.balLabel}>Koin saya <Text style={{ fontSize: 10 }}>›</Text></Text>
                <Text style={ss.balValue}>{formatCount(coinBalance)}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Aset saya (Diamond) — only for active agency hosts */}
          {isAgencyHost && (
            <TouchableOpacity
              style={[ss.balCard, { backgroundColor: C.diamCard, borderColor: C.diamBorder }]}
              activeOpacity={0.85}
              onPress={() => setDiamondOpen(true)}
            >
              <View style={ss.balCardInner}>
                <Text style={ss.balIcon}>💎</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.balLabel, { color: '#4F46E5' }]}>Aset saya <Text style={{ fontSize: 10 }}>›</Text></Text>
                  <Text style={[ss.balValue, { color: '#4338CA' }]}>{formatCount(diamond)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Riwayat Koin ── */}
        <View style={ss.txSection}>
          <View style={ss.txSectionHeader}>
            <Text style={ss.txSectionTitle}>🪙 Riwayat Koin</Text>
            <TouchableOpacity
              onPress={() => { setCreditsInitTab('history'); setCreditsOpen(true); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={ss.txSeeAll}>Lihat semua ›</Text>
            </TouchableOpacity>
          </View>

          {txns.length === 0 ? (
            <View style={ss.txEmpty}>
              <Ionicons name="receipt-outline" size={28} color="#CCC" />
              <Text style={ss.txEmptyText}>Belum ada transaksi</Text>
            </View>
          ) : (
            txns.map((tx) => {
              const isCredit = tx.amount >= 0;
              const d = new Date(tx.createdAt);
              const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
              return (
                <View key={tx.id} style={ss.txRow}>
                  <View style={[ss.txIconWrap, { backgroundColor: isCredit ? '#ECFDF5' : '#FEF2F2' }]}>
                    <Ionicons
                      name={isCredit ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={22}
                      color={isCredit ? '#16A34A' : '#DC2626'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ss.txType} numberOfLines={1}>{tx.typeName}</Text>
                    {tx.description ? (
                      <Text style={ss.txDesc} numberOfLines={1}>{tx.description}</Text>
                    ) : null}
                    <Text style={ss.txDate}>{dateStr}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[ss.txAmt, { color: isCredit ? '#16A34A' : '#DC2626' }]}>
                      {isCredit ? '+' : ''}{Math.round(tx.amount).toLocaleString('id-ID')}
                    </Text>
                    <Text style={ss.txBal}>{Math.round(tx.runningBalance).toLocaleString('id-ID')}</Text>
                  </View>
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={ss.txTransferBtn}
            activeOpacity={0.85}
            onPress={() => { setCreditsInitTab('transfer'); setCreditsOpen(true); }}
          >
            <Ionicons name="swap-horizontal" size={15} color="#006D8F" style={{ marginRight: 6 }} />
            <Text style={ss.txTransferText}>Transfer Koin</Text>
          </TouchableOpacity>
        </View>

        {/* ── Riwayat Lucky Gift JP ── */}
        <View style={ss.jpSection}>
          <View style={ss.txSectionHeader}>
            <Text style={ss.jpSectionTitle}>🎰 Riwayat Lucky Gift JP</Text>
          </View>

          {jpWins.length === 0 ? (
            <View style={ss.txEmpty}>
              <Text style={{ fontSize: 28 }}>🎰</Text>
              <Text style={ss.txEmptyText}>Belum pernah menang JP</Text>
              <Text style={[ss.txEmptyText, { fontSize: 11, marginTop: 2 }]}>Kirim Lucky Gift di Party Room untuk ikut!</Text>
            </View>
          ) : (
            jpWins.map((w, i) => {
              const d = new Date(w.won_at);
              const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
              const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
              const milestoneColor =
                w.milestone === '500x' ? '#F59E0B' :
                w.milestone === '300x' ? '#EF4444' :
                w.milestone === '200x' ? '#8B5CF6' : '#10B981';
              return (
                <View key={i} style={ss.jpRow}>
                  <View style={[ss.jpIconWrap, { backgroundColor: milestoneColor + '20' }]}>
                    <Text style={{ fontSize: 20 }}>{w.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ss.jpMilestone, { color: milestoneColor }]}>{w.label}</Text>
                    <Text style={ss.txDate}>{dateStr} · {timeStr}</Text>
                  </View>
                  <Text style={[ss.jpReward, { color: milestoneColor }]}>+{w.coin_reward.toLocaleString('id-ID')} 🪙</Text>
                </View>
              );
            })
          )}
        </View>

        {/* ── Data Live Harian (hanya untuk agency host/owner) ── */}
        {isAgencyHost && (
          <View style={ss.liveSect}>
            {/* Header */}
            <View style={ss.liveSectHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={ss.liveSectIcon}>
                  <Text style={{ fontSize: 14 }}>📊</Text>
                </View>
                <Text style={ss.liveSectTitle}>Data Live (30 Hari)</Text>
              </View>
              {liveDaily.length > 0 && agencyName && (
                <View style={ss.liveSectBadge}>
                  <Text style={ss.liveSectBadgeTxt} numberOfLines={1}>{agencyName}</Text>
                </View>
              )}
            </View>

            {/* Table header */}
            {liveDaily.length > 0 ? (
              <>
                <View style={ss.liveTableHead}>
                  <Text style={[ss.liveHeadTxt, { flex: 2.4 }]}>Tanggal</Text>
                  <Text style={[ss.liveHeadTxt, { flex: 1.5, textAlign: 'center' }]}>Live Time</Text>
                  <Text style={[ss.liveHeadTxt, { flex: 1.5, textAlign: 'center' }]}>Coin</Text>
                  <Text style={[ss.liveHeadTxt, { flex: 2, textAlign: 'right' }]}>Agency</Text>
                </View>
                {liveDaily.map((row, idx) => (
                  <View
                    key={row.tanggal}
                    style={[ss.liveTableRow, idx % 2 === 0 && ss.liveTableRowAlt]}
                  >
                    <Text style={[ss.liveCellTxt, { flex: 2.4 }]}>{fmtTanggal(row.tanggal)}</Text>
                    <View style={[{ flex: 1.5, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }]}>
                      <Ionicons name="time-outline" size={11} color="#10B981" />
                      <Text style={[ss.liveCellTxt, { color: '#10B981', fontWeight: '600' }]}>
                        {fmtLiveDuration(row.live_seconds)}
                      </Text>
                    </View>
                    <View style={[{ flex: 1.5, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }]}>
                      <Text style={{ fontSize: 10 }}>🪙</Text>
                      <Text style={[ss.liveCellTxt, { color: '#F59E0B', fontWeight: '600' }]}>
                        {fmtCoin(row.coin)}
                      </Text>
                    </View>
                    <Text style={[ss.liveCellTxt, { flex: 2, textAlign: 'right', color: '#888', fontSize: 10 }]} numberOfLines={1}>
                      {row.agency_name ?? '—'}
                    </Text>
                  </View>
                ))}
                {/* Ringkasan total */}
                <View style={ss.liveTotalRow}>
                  <Text style={[ss.liveTotalTxt, { flex: 2.4 }]}>TOTAL</Text>
                  <View style={[{ flex: 1.5, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }]}>
                    <Ionicons name="time" size={11} color="#10B981" />
                    <Text style={[ss.liveTotalTxt, { color: '#10B981' }]}>
                      {fmtLiveDuration(liveDaily.reduce((s, r) => s + r.live_seconds, 0))}
                    </Text>
                  </View>
                  <View style={[{ flex: 1.5, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }]}>
                    <Text style={{ fontSize: 10 }}>🪙</Text>
                    <Text style={[ss.liveTotalTxt, { color: '#F59E0B' }]}>
                      {fmtCoin(liveDaily.reduce((s, r) => s + r.coin, 0))}
                    </Text>
                  </View>
                  <Text style={[ss.liveTotalTxt, { flex: 2 }]} />
                </View>
              </>
            ) : (
              <View style={ss.liveEmpty}>
                <Text style={{ fontSize: 24 }}>📹</Text>
                <Text style={ss.liveEmptyTxt}>Belum ada data live</Text>
                <Text style={ss.liveEmptySub}>Mulai live di party room untuk mencatat riwayat</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Bangsawan / Level banner ── */}
        <TouchableOpacity
          style={ss.banner}
          activeOpacity={0.85}
          onPress={() => Alert.alert('Level Kamu', `Level ${migLevel} · ${levelName}\n\nTerus aktif untuk naik level dan dapatkan privilege lebih!`)}
        >
          <Text style={ss.bannerCrown}>👑</Text>
          <Text style={ss.bannerText}>{levelName}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FDD68A" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Dropdown menu ── */}
      {showMenu && (
        <TouchableWithoutFeedback onPress={() => setShowMenu(false)} testID="button-menu-overlay">
          <View style={ss.menuOverlay}>
            <View style={ss.menuSheet}>
              {menuItems.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={[ss.menuItem, idx < menuItems.length - 1 && ss.menuItemBorder]}
                  onPress={() => handleMenuSelect(item.id)}
                  testID={`button-menu-${item.id}`}
                >
                  <Ionicons name={item.icon} size={17} color={item.id === 'logout' ? '#EF4444' : C.menuText} style={{ marginRight: 10 }} />
                  <Text style={[ss.menuLabel, item.id === 'logout' && { color: '#EF4444' }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}

      {/* ── Settings / Edit Profile modal ── */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={async () => {
          setSettingsOpen(false);
          handleLogout();
        }}
        onAvatarChange={fetchData}
        username={username || null}
        initialPage={settingsPage}
      />

      {/* ── Diamond Wallet modal — only for active agency hosts ── */}
      {isAgencyHost && (
        <DiamondWalletModal
          visible={diamondOpen}
          onClose={() => setDiamondOpen(false)}
        />
      )}

      {/* ── Credits modal ── */}
      <CreditsModal
        visible={creditsOpen}
        onClose={() => { setCreditsOpen(false); fetchData(); }}
        username={username || null}
        initialTab={creditsInitTab}
      />

      {/* ── Toko modal ── */}
      <TokoModal
        visible={tokoOpen}
        onClose={() => setTokoOpen(false)}
        userAvatar={avatarUrl ?? null}
        userInitial={displayName.slice(0, 2).toUpperCase()}
        username={username || null}
        onFrameChanged={(url) => {
          setProfile(prev => prev ? { ...prev, avatarFrameUrl: url } : prev);
        }}
      />

      {/* ── Teman (Friends) list modal ── */}
      <Modal visible={temanOpen} animationType="slide" transparent onRequestClose={() => setTemanOpen(false)}>
        <View style={ss.listModalOverlay}>
          <View style={[ss.listModalSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={ss.listModalHeader}>
              <Text style={ss.listModalTitle}>Teman</Text>
              <TouchableOpacity onPress={() => setTemanOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            {listLoading ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={C.accent} />
            ) : temanList.length === 0 ? (
              <Text style={ss.listEmpty}>Belum ada teman</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {temanList.map((item) => (
                  <View key={item.friendUserId} style={ss.listRow}>
                    <View style={ss.listAvatar}>
                      {item.displayPicture ? (
                        <Image source={{ uri: item.displayPicture }} style={ss.listAvatarImg} />
                      ) : (
                        <Text style={ss.listAvatarTxt}>{(item.friendDisplayName || item.friendUsername).slice(0,1).toUpperCase()}</Text>
                      )}
                      {item.presence === 'online' && <View style={ss.listOnlineDot} />}
                    </View>
                    <View style={ss.listInfo}>
                      <Text style={ss.listName}>{item.friendDisplayName || item.friendUsername}</Text>
                      <Text style={ss.listSub}>@{item.friendUsername}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Mengikuti (Following) list modal ── */}
      <Modal visible={mengikutiOpen} animationType="slide" transparent onRequestClose={() => setMengikutiOpen(false)}>
        <View style={ss.listModalOverlay}>
          <View style={[ss.listModalSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={ss.listModalHeader}>
              <Text style={ss.listModalTitle}>Mengikuti</Text>
              <TouchableOpacity onPress={() => setMengikutiOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            {listLoading ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={C.accent} />
            ) : mengikutiList.length === 0 ? (
              <Text style={ss.listEmpty}>Belum mengikuti siapapun</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {mengikutiList.map((item) => (
                  <View key={item.username} style={ss.listRow}>
                    <View style={ss.listAvatar}>
                      {item.displayPicture ? (
                        <Image source={{ uri: item.displayPicture }} style={ss.listAvatarImg} />
                      ) : (
                        <Text style={ss.listAvatarTxt}>{(item.displayName || item.username).slice(0,1).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={ss.listInfo}>
                      <Text style={ss.listName}>{item.displayName || item.username}</Text>
                      <Text style={ss.listSub}>@{item.username}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Gift modal ── */}
      <Modal visible={giftOpen} animationType="slide" transparent onRequestClose={() => setGiftOpen(false)}>
        <View style={ss.giftModalOverlay}>
          <View style={[ss.giftModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={ss.giftModalHeader}>
              <View style={ss.giftModalTitleWrap}>
                <Text style={ss.giftModalEmoji}>🎁</Text>
                <Text style={ss.giftModalTitle}>Gift Diterima</Text>
                <View style={ss.giftCountBadge}>
                  <Text style={ss.giftCountText}>{gift}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setGiftOpen(false)} style={ss.giftCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {listLoading ? (
              <ActivityIndicator style={{ marginTop: 48 }} color="#E91E8C" size="large" />
            ) : giftList.length === 0 ? (
              <View style={ss.giftEmpty}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🎁</Text>
                <Text style={ss.giftEmptyText}>Belum ada gift yang diterima</Text>
                <Text style={ss.giftEmptySub}>Gift dari chatroom & party akan muncul di sini</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ss.giftGrid}>
                {giftList.map((item) => (
                  <View key={item.id} style={ss.giftCard}>
                    {/* Gift image or emoji */}
                    <View style={ss.giftImgWrap}>
                      {item.image_url ? (
                        <Image source={{ uri: item.image_url }} style={ss.giftImg} resizeMode="contain" />
                      ) : (
                        <Text style={ss.giftFallbackEmoji}>{item.emoji ?? '🎁'}</Text>
                      )}
                    </View>
                    {/* Gift name */}
                    <Text style={ss.giftName} numberOfLines={1}>
                      {item.message ? item.message.split(' ')[0] : 'Gift'}
                    </Text>
                    {/* Sender */}
                    <Text style={ss.giftSender} numberOfLines={1}>dari {item.sender}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ss = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  center:     { alignItems: 'center', justifyContent: 'center' },
  scroll:     { flex: 1 },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: C.white,
  },
  topBackBtn: {
    padding: 6,
    marginRight: 6,
  },
  topMoreBtn: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.sep,
  },

  // ── Profile card ──────────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
  },
  profileInfo: {
    flex: 1,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  editArrow: {
    padding: 2,
  },
  idBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  idBadgeCopied: {
    backgroundColor: '#DCFCE7',
  },
  idText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  idTextCopied: {
    color: '#16A34A',
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },

  vipExpiryText: {
    fontSize: 11,
    color: '#F59E0B',
    marginTop: 3,
    fontWeight: '600',
  },

  // ── Agency badge ──────────────────────────────────────────────────────────
  agencyBadgeWrap: {
    marginTop: 7,
  },
  agencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: '#0D9488',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    minWidth: 0,
    maxWidth: 220,
  },
  agencyBadgeGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  agencyBadgeIcon: {
    fontSize: 12,
    marginRight: 5,
  },
  agencyBadgeDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: 6,
  },
  agencyBadgeLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 10,
  },
  agencyBadgeName: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 13,
  },
  flagText: {
    fontSize: 18,
  },
  genderBadge: {
    backgroundColor: C.genderBg,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  genderText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },
  coinBadge: {
    backgroundColor: C.coinBg,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coinBadgeText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
    paddingVertical: 16,
    marginTop: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: C.statNum,
  },
  statLbl: {
    fontSize: 12,
    color: C.statLbl,
    marginTop: 2,
  },
  statDiv: {
    width: 1,
    backgroundColor: C.sep,
    marginVertical: 6,
  },

  // ── Shortcut tiles ────────────────────────────────────────────────────────
  tilesRow: {
    flexDirection: 'row',
    backgroundColor: C.white,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 8,
    marginTop: 8,
    borderRadius: 12,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  tileIcon: {
    width: 48,
    height: 48,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.tileText,
  },

  // ── Balance cards ─────────────────────────────────────────────────────────
  balanceRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  balCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  balCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  balIcon: {
    fontSize: 28,
  },
  balLabel: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    marginBottom: 2,
  },
  balValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#92400E',
  },

  // ── Riwayat Koin section ──────────────────────────────────────────────────
  txSection: {
    backgroundColor: C.white,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  txSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  txSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  txSeeAll: {
    fontSize: 12,
    color: '#006D8F',
    fontWeight: '600',
  },
  txEmpty: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  txEmptyText: {
    fontSize: 13,
    color: '#AAA',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txType: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  txDesc: {
    fontSize: 11,
    color: C.sub,
    marginTop: 1,
  },
  txDate: {
    fontSize: 11,
    color: '#BBB',
    marginTop: 2,
  },
  txAmt: {
    fontSize: 13,
    fontWeight: '700',
  },
  txBal: {
    fontSize: 10,
    color: '#BBB',
    marginTop: 1,
  },
  txTransferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingVertical: 12,
    marginTop: 4,
  },
  txTransferText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#006D8F',
  },

  // ── Lucky Gift JP section ─────────────────────────────────────────────────
  jpSection: {
    backgroundColor: C.white,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  jpSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  jpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  jpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jpMilestone: {
    fontSize: 13,
    fontWeight: '700',
  },
  jpReward: {
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Bangsawan banner ──────────────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bannerBg,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  bannerCrown: {
    fontSize: 28,
  },
  bannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FDD68A',
    letterSpacing: 0.5,
  },

  // ── Dropdown menu ─────────────────────────────────────────────────────────
  menuOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
  },
  menuSheet: {
    position: 'absolute',
    top: 56,
    right: 12,
    backgroundColor: C.menuBg,
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 101,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.menuDiv,
  },
  menuLabel: {
    color: C.menuText,
    fontSize: 14,
    fontWeight: '500',
  },

  // ── List modals (Teman / Mengikuti) ───────────────────────────────────────
  listModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  listModalSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '75%',
    minHeight: 220,
  },
  listModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  listEmpty: {
    textAlign: 'center',
    color: C.sub,
    fontSize: 13,
    marginTop: 40,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
    gap: 12,
  },
  listAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  listAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  listAvatarTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  listOnlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: C.white,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  listSub: {
    fontSize: 12,
    color: C.sub,
    marginTop: 1,
  },

  // ── Gift modal ────────────────────────────────────────────────────────────
  giftModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  giftModalSheet: {
    backgroundColor: '#1A0A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 0,
    paddingTop: 0,
    maxHeight: '82%',
    minHeight: 300,
    overflow: 'hidden',
  },
  giftModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#2D0A4E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  giftModalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  giftModalEmoji: {
    fontSize: 20,
  },
  giftModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  giftCountBadge: {
    backgroundColor: '#E91E8C',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  giftCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  giftCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 6,
  },
  giftEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  giftEmptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  giftEmptySub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 18,
  },
  giftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  giftCard: {
    width: '30%',
    aspectRatio: 0.9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(233,30,140,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 6,
  },
  giftImgWrap: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  giftImg: {
    width: 52,
    height: 52,
  },
  giftFallbackEmoji: {
    fontSize: 36,
  },
  giftName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  giftSender: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },

  // ── Data Live section ──
  liveSect: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  liveSectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  liveSectIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSectTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  liveSectBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 130,
  },
  liveSectBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  liveTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  liveHeadTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  liveTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  liveTableRowAlt: {
    backgroundColor: '#FAFBFF',
  },
  liveCellTxt: {
    fontSize: 11,
    color: '#334155',
  },
  liveTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#EEF2FF',
    borderTopWidth: 1.5,
    borderTopColor: '#C7D2FE',
  },
  liveTotalTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3730A3',
  },
  liveEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  liveEmptyTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
  },
  liveEmptySub: {
    fontSize: 11,
    color: '#AAA',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
