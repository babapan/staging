import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';
import { useAppTheme } from '../services/themeContext';
import AvatarWithFrame from './AvatarWithFrame';

const GOLD   = '#F59E0B';
const DANGER = '#E53935';
const WHITE  = '#FFFFFF';

const RELATIONSHIP_LABELS: Record<number, string> = {
  1: 'Single', 2: 'In a relationship', 3: 'Engaged', 4: 'Married',
  5: "It's complicated", 6: 'Open relationship', 7: 'Widowed',
};
const GENDER_LABELS: Record<string, string> = {
  male: 'Male', female: 'Female', other: 'Other',
};

interface ProfileData {
  user: { id: string; username: string; displayName: string };
  profile: {
    gender?: string | null;
    dateOfBirth?: string | null;
    country?: string | null;
    city?: string | null;
    aboutMe?: string | null;
    likes?: string | null;
    dislikes?: string | null;
    relationshipStatus?: number | null;
    displayPicture?: string | null;
    migLevel?: number;
    profileStatus?: number;
  } | null;
  isOwner?: boolean;
  isPrivate?: boolean;
  isAdmin?: boolean;
  merchantType?: number | null;
  counts?: { followers: number; coinsReceived: number; badges: number };
  autoBadges?: AutoBadgeData[];
  avatarFrameUrl?: string | null;
}
interface AutoBadgeData {
  id: number; name: string; description: string;
  iconUrl: string | null; rank: number; source: string;
}
interface GiftItem {
  id: number;
  sender: string;
  message: string | null;
  image_url: string | null;
  emoji: string | null;
  created_at: string;
}
interface MerchantTagInfo {
  id: string; type: number; status: number;
  amount: number | null; currency: string | null;
  expiresAt: string | null; merchantUsername: string;
}

function tagTypeLabel(type: number) {
  return type === 1
    ? { label: 'TOP TAG', bg: '#FF6F00', text: WHITE }
    : { label: 'TAG', bg: '#00A8CC', text: WHITE };
}

interface Props {
  visible: boolean;
  username: string;
  displayName?: string;
  avatarColor?: string;
  currentUserId?: string | null;
  onClose: () => void;
  onSendGift?: (username: string) => void;
  onPrivateChat?: (username: string, displayName: string) => void;
  isFollowing?: boolean;
  isBlocked?: boolean;
  onFollow?: (username: string) => void;
  onUnfollow?: (username: string) => void;
  onBlock?: (username: string) => void;
  onUnblock?: (username: string) => void;
  onTransferCredit?: (username: string) => void;
}

export default function ViewProfileModal({
  visible, username, displayName, avatarColor,
  currentUserId, onClose, onSendGift, onPrivateChat,
  isFollowing: initialFollowing = false, isBlocked: initialBlocked = false,
  onFollow, onUnfollow, onBlock, onUnblock, onTransferCredit,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();

  const [data, setData]               = useState<ProfileData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showMenu, setShowMenu]       = useState(false);
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [isBlocked, setIsBlocked]     = useState(initialBlocked);
  const [merchantTag, setMerchantTag] = useState<MerchantTagInfo | null>(null);
  const [agencyInfo, setAgencyInfo]   = useState<{ isHost: boolean; agencyName: string | null }>({ isHost: false, agencyName: null });

  const shimmerX = useSharedValue(-300);
  useEffect(() => {
    shimmerX.value = withRepeat(withTiming(400, { duration: 2200 }), -1, false);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));

  const buildHeaders = useCallback(async () => {
    const h: Record<string, string> = {};
    if (Platform.OS !== 'web') { const c = await getSession(); if (c) h['Cookie'] = c; }
    return h;
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const headers = await buildHeaders();
      const [profileRes, tagRes, agencyRes] = await Promise.all([
        fetch(`${API_BASE}/api/profile/${encodeURIComponent(username)}`, { credentials: 'include', headers }),
        fetch(`${API_BASE}/api/merchant-tags/tag/${encodeURIComponent(username)}`, { credentials: 'include', headers }),
        fetch(`${API_BASE}/api/agency/profile/${encodeURIComponent(username)}`, { credentials: 'include', headers }),
      ]);
      if (!profileRes.ok) throw new Error('Gagal memuat profil');
      setData(await profileRes.json());
      if (tagRes.ok) { const j = await tagRes.json(); setMerchantTag(j.tag ?? null); }
      if (agencyRes.ok) { const j = await agencyRes.json(); setAgencyInfo({ isHost: j.isHost === true, agencyName: j.agencyName ?? null }); }
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally { setLoading(false); }
  }, [username, buildHeaders]);

  useEffect(() => {
    if (visible && username) {
      setData(null); setMerchantTag(null); setAgencyInfo({ isHost: false, agencyName: null });
      setIsFollowing(initialFollowing); setIsBlocked(initialBlocked);
      fetchProfile();
    }
  }, [visible, username]);

  const handleFollow = useCallback(async () => {
    try {
      const headers = await buildHeaders();
      if (isFollowing) {
        await fetch(`${API_BASE}/api/users/${username}/follow`, { method: 'DELETE', credentials: 'include', headers });
        setIsFollowing(false); onUnfollow?.(username);
      } else {
        await fetch(`${API_BASE}/api/users/${username}/follow`, { method: 'POST', credentials: 'include', headers: { ...headers, 'Content-Type': 'application/json' } });
        setIsFollowing(true); onFollow?.(username);
      }
    } catch { Alert.alert('Gagal', 'Tidak dapat memperbarui status follow.'); }
  }, [isFollowing, username, buildHeaders, onFollow, onUnfollow]);

  const handleBlock = useCallback(async () => {
    const name = data?.user.displayName || username;
    Alert.alert(
      isBlocked ? `Unblock ${name}?` : `Block ${name}?`,
      isBlocked ? `${name} akan bisa melihat kamu lagi.` : `${name} tidak akan bisa mengirim pesan ke kamu.`,
      [{ text: 'Batal', style: 'cancel' }, {
        text: isBlocked ? 'Unblock' : 'Block', style: 'destructive',
        onPress: async () => {
          try {
            const headers = await buildHeaders();
            if (isBlocked) {
              await fetch(`${API_BASE}/api/users/${username}/block`, { method: 'DELETE', credentials: 'include', headers });
              setIsBlocked(false); onUnblock?.(username);
            } else {
              await fetch(`${API_BASE}/api/users/${username}/block`, { method: 'POST', credentials: 'include', headers: { ...headers, 'Content-Type': 'application/json' } });
              setIsBlocked(true); onBlock?.(username); onClose();
            }
          } catch { Alert.alert('Gagal', 'Tidak dapat memperbarui status blokir.'); }
        },
      }],
    );
  }, [isBlocked, username, data, buildHeaders, onBlock, onUnblock, onClose]);

  const handleReport = useCallback(async () => {
    Alert.alert('Report', `Laporkan ${username}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Laporkan', style: 'destructive', onPress: async () => {
        try {
          const headers = await buildHeaders();
          await fetch(`${API_BASE}/api/users/${username}/report`, { method: 'POST', credentials: 'include', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Reported from profile' }) });
          Alert.alert('Terima kasih', 'Laporan kamu telah diterima.');
        } catch { Alert.alert('Gagal', 'Tidak dapat mengirim laporan.'); }
      }},
    ]);
  }, [username, buildHeaders]);

  const profile        = data?.profile;
  const userInfo       = data?.user;
  const counts         = data?.counts;
  const autoBadges     = data?.autoBadges ?? [];
  const isOwner        = data?.isOwner;
  const isPrivate      = data?.isPrivate;
  const avatarFrameUrl = data?.avatarFrameUrl ?? null;
  const migLevel       = profile?.migLevel ?? 1;
  const initial        = (displayName || username).charAt(0).toUpperCase();
  const fallbackAvatarColor = avatarColor ?? theme.accent;

  interface MenuOption { id: string; label: string; icon: React.ReactNode; danger?: boolean }
  const menuOptions: MenuOption[] = isOwner
    ? [
        { id: 'edit',  label: 'Edit profil',     icon: <Ionicons name="create-outline"       size={18} color={WHITE} /> },
        { id: 'share', label: 'Bagikan profil',   icon: <Ionicons name="share-social-outline" size={18} color={WHITE} /> },
      ]
    : [
        { id: 'send_gift',   label: 'Kirim hadiah',    icon: <Ionicons name="gift-outline"             size={18} color={WHITE} /> },
        { id: 'invite_room', label: 'Undang ke room',  icon: <Ionicons name="people-outline"           size={18} color={WHITE} /> },
        { id: 'transfer',    label: 'Transfer kredit', icon: <Ionicons name="swap-horizontal-outline"  size={18} color={WHITE} /> },
        { id: 'badges',      label: 'Lihat badges',    icon: <FontAwesome5 name="medal"                size={16} color={WHITE} /> },
        { id: 'share',       label: 'Bagikan profil',  icon: <Ionicons name="share-social-outline"     size={18} color={WHITE} /> },
        { id: 'report',      label: 'Laporkan',        icon: <MaterialIcons name="report"              size={18} color={WHITE} /> },
        { id: 'block', label: isBlocked ? 'Buka blokir' : 'Blokir',
          icon: <MaterialIcons name="block" size={18} color={isBlocked ? WHITE : DANGER} />, danger: !isBlocked },
      ];

  const handleMenuSelect = useCallback((id: string) => {
    setShowMenu(false);
    switch (id) {
      case 'send_gift':   onSendGift?.(username); onClose(); break;
      case 'report':      handleReport(); break;
      case 'block':       handleBlock(); break;
      case 'share':       Alert.alert('Share', `max99.app/profile/${username}`); break;
      case 'edit':        Alert.alert('Edit Profil', 'Buka halaman edit profil.'); break;
      case 'transfer':    onClose(); onTransferCredit?.(username); break;
      case 'invite_room': Alert.alert('Undang ke Room', `Undangan ke ${username} akan dikirim ke room aktif kamu.`); break;
      case 'badges':      Alert.alert('Badges', `${counts?.badges ?? 0} badge dimiliki ${username}.`); break;
    }
  }, [username, counts, onSendGift, onClose, handleReport, handleBlock, onTransferCredit]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View entering={SlideInDown.springify().damping(18)} style={[s.sheet, { backgroundColor: theme.cardBg }]}>

              {/* ── Cover foto — transparan, foto user terlihat jelas ── */}
              <View style={s.cover}>
                {profile?.displayPicture ? (
                  <Image source={{ uri: profile.displayPicture }} style={s.coverImg} resizeMode="cover" />
                ) : (
                  <View style={[s.coverImg, { backgroundColor: fallbackAvatarColor }]} />
                )}

                {/* Hanya shadow gelap tipis di atas agar tombol tetap terbaca */}
                <View style={s.coverTopShade} />

                {/* Shimmer halus */}
                <View style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} pointerEvents="none">
                  <Animated.View style={[s.shimmer, shimmerStyle]} />
                </View>

                {/* Tombol kontrol */}
                <TouchableOpacity style={s.moreBtn} onPress={() => setShowMenu(v => !v)} testID="button-profile-more">
                  <Ionicons name="ellipsis-vertical" size={18} color={WHITE} />
                </TouchableOpacity>
                <TouchableOpacity style={s.closeBtn} onPress={onClose} testID="button-profile-close">
                  <Ionicons name="close" size={18} color={WHITE} />
                </TouchableOpacity>
              </View>

              {/* ── Popup menu ── */}
              {showMenu && (
                <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
                  <View style={s.menuOverlay}>
                    <TouchableWithoutFeedback>
                      <Animated.View entering={FadeIn.duration(150)} style={s.menuSheet}>
                        {menuOptions.map((opt, i) => (
                          <TouchableOpacity
                            key={opt.id}
                            style={[s.menuItem, i < menuOptions.length - 1 && s.menuItemBorder]}
                            onPress={() => handleMenuSelect(opt.id)}
                            testID={`button-profile-menu-${opt.id}`}
                          >
                            <View style={s.menuIconWrap}>{opt.icon}</View>
                            <Text style={[s.menuLabel, opt.danger && { color: DANGER }]}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </Animated.View>
                    </TouchableWithoutFeedback>
                  </View>
                </TouchableWithoutFeedback>
              )}

              {/* ── Baris identitas user ── */}
              <View style={[s.identityRow, { backgroundColor: theme.cardBg }]}>
                {/* Avatar naik ke atas cover */}
                <AvatarWithFrame
                  size={72}
                  username={username}
                  displayPicture={profile?.displayPicture}
                  avatarFrameUrl={avatarFrameUrl}
                  initial={initial}
                  backgroundColor={fallbackAvatarColor}
                  animateRing={!avatarFrameUrl}
                  ringColor={theme.accent}
                  style={{ marginTop: -36, marginRight: 14 }}
                />

                <View style={{ flex: 1, paddingTop: 6 }}>
                  {/* Baris username + level badge + role pills */}
                  <View style={s.usernameRow}>
                    {/* Badge level di sebelah username */}
                    <View style={[s.levelBadge, {
                      backgroundColor: theme.accent,
                      shadowColor: theme.accent,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.75,
                      shadowRadius: 8,
                      elevation: 8,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.35)',
                    }]}>
                      <Ionicons name="flash" size={10} color={WHITE} />
                      <Text style={s.levelText}>Lv {migLevel}</Text>
                      {/* Highlight strip atas untuk efek glossy */}
                      <View style={s.levelBadgeGloss} pointerEvents="none" />
                    </View>

                    <Text style={[s.username, { color: theme.accent }]} testID="text-profile-username">
                      {userInfo?.username || username}
                    </Text>

                    {data?.isAdmin && (
                      <View style={[s.pill, { backgroundColor: '#F97316' }]}>
                        <FontAwesome5 name="shield-alt" size={8} color={WHITE} />
                        <Text style={s.pillTxt}>ADMIN</Text>
                      </View>
                    )}
                    {data?.merchantType === 1 && (
                      <View style={[s.pill, { backgroundColor: '#7C3AED' }]}>
                        <FontAwesome5 name="store" size={8} color={WHITE} />
                        <Text style={s.pillTxt}>MERCHANT</Text>
                      </View>
                    )}
                    {data?.merchantType === 2 && (
                      <View style={[s.pill, { backgroundColor: '#DC2626' }]}>
                        <FontAwesome5 name="user-graduate" size={8} color={WHITE} />
                        <Text style={s.pillTxt}>MENTOR</Text>
                      </View>
                    )}
                    {data?.merchantType === 3 && (
                      <View style={[s.pill, { backgroundColor: '#EC4899' }]}>
                        <FontAwesome5 name="crown" size={8} color={WHITE} />
                        <Text style={s.pillTxt}>HEADMENTOR</Text>
                      </View>
                    )}
                  </View>

                  {/* Display name */}
                  {userInfo?.displayName && userInfo.displayName !== userInfo.username && (
                    <Text style={[s.displayName, { color: theme.textSecondary }]}>{userInfo.displayName}</Text>
                  )}

                  {/* Lokasi + level subtext chips */}
                  <View style={s.subtextRow}>
                    {profile?.country ? (
                      <View style={[s.subtextChip, { backgroundColor: theme.accentSoft }]}>
                        <Ionicons name="location-outline" size={11} color={theme.accent} />
                        <Text style={[s.subtextChipTxt, { color: theme.accent }]}>
                          {[profile.city, profile.country].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Agency badge */}
                  {agencyInfo.isHost && agencyInfo.agencyName ? (
                    <View style={s.agencyBadge}>
                      <View style={s.agencyBadgeGloss} pointerEvents="none" />
                      <Text style={s.agencyBadgeIcon}>🏢</Text>
                      <View style={s.agencyBadgeDivider} />
                      <View style={{ flexShrink: 1 }}>
                        <Text style={s.agencyBadgeLabel}>AGENCY HOST</Text>
                        <Text style={s.agencyBadgeName} numberOfLines={1}>{agencyInfo.agencyName}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Auto-badges */}
                  {autoBadges.length > 0 && (
                    <View style={s.autoBadgeRow}>
                      {autoBadges.map(b => (
                        <TouchableOpacity key={b.id} style={s.autoBadgeWrap} activeOpacity={0.7}
                          onPress={() => Alert.alert(b.name, `${b.source}\n\n${b.description || ''}`.trim())}>
                          {b.iconUrl ? (
                            <Image source={{ uri: b.iconUrl }} style={s.autoBadgeImg} resizeMode="contain" />
                          ) : (
                            <View style={[s.autoBadgeImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD + '22', borderRadius: 8 }]}>
                              <FontAwesome5 name="medal" size={14} color={GOLD} />
                            </View>
                          )}
                          <View style={[s.rankDot, b.rank === 1 ? { backgroundColor: GOLD } : b.rank === 2 ? { backgroundColor: '#9CA3AF' } : { backgroundColor: '#B45309' }]}>
                            <Text style={s.rankDotTxt}>{b.rank}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Merchant tag */}
                  {merchantTag?.status === 1 && (() => {
                    const meta = tagTypeLabel(merchantTag.type);
                    return (
                      <View style={s.tagRow}>
                        <View style={[s.tagPill, { backgroundColor: meta.bg }]}>
                          <Text style={[s.tagPillTxt, { color: meta.text }]}>{meta.label}</Text>
                        </View>
                        <Text style={[s.tagMerchant, { color: theme.textSecondary }]}>@{merchantTag.merchantUsername}</Text>
                        {merchantTag.amount != null && (
                          <Text style={[s.tagAmount, { color: theme.textPrimary }]}>
                            🪙 {Math.round(Number(merchantTag.amount)).toLocaleString('id-ID')}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* ── Konten scroll ── */}
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                {loading && (
                  <View style={s.center}>
                    <ActivityIndicator size="large" color={theme.accent} />
                    <Text style={[s.loadingTxt, { color: theme.textSecondary }]}>Memuat profil…</Text>
                  </View>
                )}
                {error && !loading && (
                  <View style={s.center}>
                    <MaterialIcons name="error-outline" size={36} color={DANGER} />
                    <Text style={[s.errorTxt, { color: theme.textSecondary }]}>{error}</Text>
                    <TouchableOpacity style={[s.retryBtn, { backgroundColor: theme.accent }]} onPress={fetchProfile}>
                      <Text style={s.retryTxt}>Coba lagi</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isPrivate && !loading && (
                  <View style={s.center}>
                    <Ionicons name="lock-closed" size={40} color={theme.accent} />
                    <Text style={[s.privateTxt, { color: theme.accent }]}>Profil ini privat</Text>
                  </View>
                )}

                {!loading && !error && profile && (
                  <Animated.View entering={FadeIn.delay(100).duration(300)}>

                    {/* Stats chips — warna ikut tema */}
                    <View style={[s.statsRow, { backgroundColor: theme.accentSoft, borderColor: theme.divider }]}>
                      <StatCard
                        value={counts?.coinsReceived ?? 0} label="Koin" accent={GOLD}
                        icon={<MaterialIcons name="monetization-on" size={20} color={GOLD} />}
                        onPress={() => {
                          const c = counts?.coinsReceived ?? 0;
                          const fmt = c >= 1_000_000 ? `${(c/1_000_000).toFixed(1)}M` : c >= 1_000 ? `${(c/1_000).toFixed(1)}K` : String(c);
                          Alert.alert('Koin Diterima', `🪙 ${fmt} koin diterima dari hadiah`);
                        }}
                      />
                      <View style={[s.statsDivider, { backgroundColor: theme.divider }]} />
                      <StatCard
                        value={counts?.badges ?? 0} label="Badges" accent="#9333ea"
                        icon={<FontAwesome5 name="medal" size={18} color="#9333ea" />}
                        onPress={() => Alert.alert('Badges', `${counts?.badges ?? 0} badge`)}
                      />
                      <View style={[s.statsDivider, { backgroundColor: theme.divider }]} />
                      <StatCard
                        value={counts?.followers ?? 0} label="Fans" accent={theme.accent}
                        icon={<Ionicons name="people" size={20} color={theme.accent} />}
                        onPress={() => Alert.alert('Fans', `${counts?.followers ?? 0} fans`)}
                      />
                    </View>

                    {/* About Me */}
                    {profile.aboutMe && (
                      <View style={[s.aboutCard, { backgroundColor: theme.inputBg, borderColor: theme.divider }]}>
                        <View style={s.aboutHeader}>
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.accent} />
                          <Text style={[s.aboutHeaderTxt, { color: theme.accent }]}>Tentang saya</Text>
                        </View>
                        <Text style={[s.aboutTxt, { color: theme.textPrimary }]}>{profile.aboutMe}</Text>
                      </View>
                    )}

                    {/* Info rows */}
                    <View style={[s.infoSection, { borderTopColor: theme.divider }]}>
                      <InfoRow theme={theme}
                        icon={<Ionicons name="person-outline" size={16} color={theme.accent} />}
                        label="Jenis kelamin"
                        value={profile.gender ? GENDER_LABELS[profile.gender] ?? profile.gender : null}
                      />
                      <InfoRow theme={theme}
                        icon={<Ionicons name="heart-outline" size={16} color={DANGER} />}
                        label="Status hubungan"
                        value={profile.relationshipStatus ? RELATIONSHIP_LABELS[profile.relationshipStatus] ?? null : null}
                      />
                      <InfoRow theme={theme}
                        icon={<Ionicons name="calendar-outline" size={16} color={GOLD} />}
                        label="Tanggal lahir"
                        value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : null}
                      />
                      <InfoRow theme={theme}
                        icon={<Ionicons name="location-outline" size={16} color={theme.accent} />}
                        label="Lokasi"
                        value={[profile.city, profile.country].filter(Boolean).join(', ') || null}
                      />
                      {profile.likes && (
                        <InfoRow theme={theme}
                          icon={<Ionicons name="thumbs-up-outline" size={16} color="#10b981" />}
                          label="Suka" value={profile.likes}
                        />
                      )}
                      {profile.dislikes && (
                        <InfoRow theme={theme}
                          icon={<Ionicons name="thumbs-down-outline" size={16} color={DANGER} />}
                          label="Tidak suka" value={profile.dislikes}
                        />
                      )}
                    </View>
                  </Animated.View>
                )}
              </ScrollView>

              {/* ── Action bar — warna ikut tema ── */}
              {!loading && !isPrivate && !isOwner && (
                <View style={[s.actionBar, { borderTopColor: theme.divider, backgroundColor: theme.cardBg, paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <TouchableOpacity
                    style={[s.actionPill, {
                      backgroundColor: GOLD,
                      shadowColor: GOLD,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.55,
                      shadowRadius: 10,
                      elevation: 8,
                    }]}
                    onPress={() => { onSendGift?.(username); onClose(); }}
                    activeOpacity={0.82}
                    testID="button-profile-send-gift"
                  >
                    <View style={s.actionIconWrap}>
                      <Ionicons name="gift" size={20} color={WHITE} />
                    </View>
                    <Text style={s.actionPillTxt}>Hadiah</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.actionPill, {
                      backgroundColor: isFollowing ? '#6B7280' : theme.accent,
                      shadowColor: isFollowing ? '#6B7280' : theme.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.55,
                      shadowRadius: 10,
                      elevation: 8,
                    }]}
                    onPress={handleFollow}
                    activeOpacity={0.82}
                    testID="button-profile-follow"
                  >
                    <View style={s.actionIconWrap}>
                      <Ionicons name={isFollowing ? 'person-remove' : 'person-add'} size={20} color={WHITE} />
                    </View>
                    <Text style={s.actionPillTxt}>{isFollowing ? 'Unfollow' : 'Follow'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.actionPill, {
                      backgroundColor: '#0ea5e9',
                      shadowColor: '#0ea5e9',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.55,
                      shadowRadius: 10,
                      elevation: 8,
                    }]}
                    onPress={() => { const name = userInfo?.displayName || username; onPrivateChat?.(username, name); onClose(); }}
                    activeOpacity={0.82}
                    testID="button-profile-chat"
                  >
                    <View style={s.actionIconWrap}>
                      <Ionicons name="chatbubble" size={20} color={WHITE} />
                    </View>
                    <Text style={s.actionPillTxt}>Chat</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.actionPill, {
                      backgroundColor: '#6366f1',
                      shadowColor: '#6366f1',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.55,
                      shadowRadius: 10,
                      elevation: 8,
                    }]}
                    onPress={() => Alert.alert('Undang ke Room', `Undangan ke ${username} akan dikirim ke room aktif kamu.`)}
                    activeOpacity={0.82}
                    testID="button-profile-invite"
                  >
                    <View style={s.actionIconWrap}>
                      <Ionicons name="people" size={20} color={WHITE} />
                    </View>
                    <Text style={s.actionPillTxt}>Undang</Text>
                  </TouchableOpacity>
                </View>
              )}

            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Komponen kecil ─────────────────────────────────────────────────────────────

function StatCard({ value, label, icon, accent, onPress }: {
  value: number; label: string; icon: React.ReactNode; accent?: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={s.statCard} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} testID={`stat-${label.toLowerCase()}`}>
      <View style={[s.statIconWrap, { backgroundColor: (accent ?? '#888') + '20' }]}>{icon}</View>
      <Text style={[s.statValue, { color: accent ?? '#888' }]}>
        {value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ icon, label, value, theme }: {
  icon: React.ReactNode; label: string; value: string | null | undefined; theme: ReturnType<typeof useAppTheme>;
}) {
  if (!value) return null;
  return (
    <View style={[s.infoRow, { borderBottomColor: theme.divider }]}>
      <View style={s.infoIcon}>{icon}</View>
      <View style={s.infoContent}>
        <Text style={[s.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[s.infoValue, { color: theme.textPrimary }]}>{value}</Text>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', maxHeight: '92%' },

  // Cover — bersih, tanpa overlay warna tebal
  cover:         { height: 148, position: 'relative', overflow: 'hidden', backgroundColor: '#555' },
  coverImg:      { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  coverTopShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, backgroundColor: 'rgba(0,0,0,0.25)' },
  shimmer:       { position: 'absolute', top: 0, bottom: 0, width: 100, backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ skewX: '-20deg' }] },

  moreBtn: { position: 'absolute', top: 12, right: 56, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 12, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center' },

  // Identity
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 12 },
  usernameRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },

  // Level badge
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden',
  },
  levelBadgeGloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
  },
  levelText: { color: WHITE, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  username:    { fontSize: 18, fontWeight: '800' },
  displayName: { fontSize: 13, marginTop: 2 },

  subtextRow:      { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  subtextChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  subtextChipTxt:  { fontSize: 11, fontWeight: '600' },

  pill:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  pillTxt: { color: WHITE, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  // Agency badge
  agencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
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
  agencyBadgeIcon: { fontSize: 12, marginRight: 5 },
  agencyBadgeDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: 6,
  },
  agencyBadgeLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 7,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    lineHeight: 10,
  },
  agencyBadgeName: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
    lineHeight: 13,
  },

  autoBadgeRow:  { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  autoBadgeWrap: { width: 34, height: 34, position: 'relative' },
  autoBadgeImg:  { width: 34, height: 34, borderRadius: 8 },
  rankDot:       { position: 'absolute', bottom: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: WHITE },
  rankDotTxt:    { color: WHITE, fontSize: 9, fontWeight: '800', lineHeight: 11 },

  tagRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  tagPill:    { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  tagPillTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  tagMerchant:{ fontSize: 11, fontStyle: 'italic' },
  tagAmount:  { fontSize: 11, fontWeight: '700' },

  // Stats
  statsRow:     { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  statCard:     { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue:    { fontSize: 18, fontWeight: '800', marginTop: 2 },
  statLabel:    { fontSize: 10, color: '#999', fontWeight: '600', marginTop: 1 },
  statsDivider: { width: 1, marginVertical: 12 },

  // About
  aboutCard:      { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  aboutHeader:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  aboutHeaderTxt: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  aboutTxt:       { fontSize: 14, lineHeight: 21 },

  // Info rows
  infoSection: { paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  infoIcon:    { width: 30, alignItems: 'center', marginTop: 1 },
  infoContent: { flex: 1 },
  infoLabel:   { fontSize: 10, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.4 },
  infoValue:   { fontSize: 14, marginTop: 1, fontWeight: '500' },

  // Action bar
  actionBar:      { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 14, borderTopWidth: 1 },
  actionPill:     {
    flex: 1, flexDirection: 'column', alignItems: 'center',
    paddingVertical: 12, borderRadius: 18, gap: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionPillTxt: { color: WHITE, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // Loading / error / private
  center:     { alignItems: 'center', paddingVertical: 28, gap: 10 },
  loadingTxt: { fontSize: 14 },
  errorTxt:   { fontSize: 13, textAlign: 'center' },
  retryBtn:   { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9 },
  retryTxt:   { color: WHITE, fontWeight: '700' },
  privateTxt: { fontSize: 15, fontWeight: '700' },

  // Menu
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  menuSheet:   { position: 'absolute', top: 54, right: 10, backgroundColor: '#1E1E1E', borderRadius: 14, overflow: 'hidden', minWidth: 210, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10 },
  menuItem:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  menuItemBorder:  { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  menuIconWrap:    { width: 28, alignItems: 'center' },
  menuLabel:       { color: WHITE, fontSize: 14, marginLeft: 8, fontWeight: '500' },
});
