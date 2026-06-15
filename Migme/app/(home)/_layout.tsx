import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './home';
import FeedScreen from './feed';
import LivePartyScreen from './liviparty';
import ChatScreen from './chat';
import RoomListScreen from './roomlist';
import { API_BASE, getMe, logout } from '../../services/auth';
import { getSession } from '../../services/storage';
import { getCreditBalance } from '../../services/credit';
import ProfileScreen from './profile';
import StoreModal from '../../components/StoreModal';
import CreditsModal from '../../components/CreditsModal';
import MerchantsModal from '../../components/MerchantsModal';
import DiscoverModal from '../../components/DiscoverModal';
import LeaderboardModal from '../../components/LeaderboardModal';
import PartyLeaderboardModal from '../../components/PartyLeaderboardModal';
import SettingsModal from '../../components/SettingsModal';
import NotificationsModal from '../../components/NotificationsModal';
import SearchFriendModal from '../../components/SearchFriendModal';
import LoginAnnouncementModal from '../../components/LoginAnnouncementModal';
import AgencyRegisterModal from '../../components/AgencyRegisterModal';
import MyAgencyModal from '../../components/MyAgencyModal';
import JoinAgencyModal from '../../components/JoinAgencyModal';
import { useAppTheme, type AppTheme } from '../../services/themeContext';
import PagerView from '../../components/PlatformPagerView';
import { playNotificationSound } from '../../services/notificationSound';
import { globalGatewayService } from '../../services/globalGatewayService';
import { PartyProvider, useParty } from '../../contexts/PartyContext';
import PartyRoomModal from '../../components/PartyRoomModal';
import FloatingPartyBubble from '../../components/FloatingPartyBubble';

type RouteKey = 'home' | 'feed' | 'liviparty' | 'chat' | 'roomlist';

const ROUTES: { key: RouteKey; title: string }[] = [
  { key: 'home',      title: 'Home' },
  { key: 'feed',      title: 'Feed' },
  { key: 'liviparty', title: 'Livi Party' },
  { key: 'chat',      title: 'Chat' },
  { key: 'roomlist',  title: 'Room List' },
];

const TAB_ICONS: Record<RouteKey, ImageSourcePropType> = {
  home:      require('../../assets/images/tab_home.png'),
  feed:      require('../../assets/images/tab_feed.png'),
  liviparty: require('../../assets/images/tab_live.png'),
  chat:      require('../../assets/images/tab_chat.png'),
  roomlist:  require('../../assets/images/tab_rooms.png'),
};

const SCREENS = [HomeScreen, FeedScreen, LivePartyScreen, ChatScreen, RoomListScreen];

function CustomTabBar({
  index,
  onTabPress,
}: {
  index: number;
  onTabPress: (i: number) => void;
}) {
  const theme = useAppTheme();
  // Inactive tabs use a heavily dimmed version of the secondary text color so
  // the active pill has clear visual priority. The dim factor is themed: dark
  // mode tolerates slightly more brightness, light mode needs more dimming.
  const inactiveColor = theme.isDark
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(0,0,0,0.40)';
  // Soft pill background sits *behind* the active tab's label+icon. We use
  // accentSoft so it harmonizes with the active accent text but stays subtle.
  const activePillBg = theme.accentSoft;
  return (
    <View style={[tabBarStyles.container, { backgroundColor: theme.tabBg, borderBottomColor: theme.tabBorder }]}>
      {ROUTES.map((route, i) => {
        const focused = index === i;
        const color   = focused ? theme.tabActiveColor : inactiveColor;
        return (
          <TouchableOpacity
            key={route.key}
            style={tabBarStyles.tab}
            onPress={() => onTabPress(i)}
            activeOpacity={0.7}
            testID={`tab-${route.key}`}
          >
            <View
              style={[
                tabBarStyles.pill,
                focused && { backgroundColor: activePillBg },
              ]}
            >
              <Image
                source={TAB_ICONS[route.key]}
                style={tabBarStyles.icon}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

interface DrawerUser {
  username: string;
  displayName: string | null;
  creditFormatted: string;
  level: number;
  displayPicture?: string | null;
  followersCount: number;
  friendsCount: number;
}

const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  online:  '#4CAF50',
  away:    '#FFC107',
  busy:    '#F44336',
  offline: '#BDBDBD',
};

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online:  'Online',
  away:    'Away',
  busy:    'Busy',
  offline: 'Offline',
};

async function buildAuthHeaders(json = false): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) h['Cookie'] = cookie;
  }
  return h;
}

function Drawer({
  visible,
  onClose,
  onLogout,
  onOpenProfile,
  onOpenAgencyRegister,
  onOpenJoinAgency,
  onOpenStore,
  onOpenCredits,
  onOpenMerchants,
  onOpenDiscover,
  onOpenLeaderboard,
  onOpenSettings,
  user,
  hasApprovedAgency,
}: {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenAgencyRegister: () => void;
  onOpenJoinAgency: () => void;
  onOpenStore: () => void;
  onOpenCredits: () => void;
  onOpenMerchants: () => void;
  onOpenDiscover: () => void;
  onOpenLeaderboard: () => void;
  onOpenSettings: () => void;
  user: DrawerUser | null;
  hasApprovedAgency: boolean;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.78, 320);
  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [statusMsg, setStatusMsg]       = useState('');
  const [presence, setPresence]         = useState<PresenceStatus>('online');
  const [showPicker, setShowPicker]     = useState(false);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0,          duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1,          duration: 260, useNativeDriver: true }),
      ]).start();
      loadMyStatus();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -drawerWidth, duration: 220, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 0,            duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const loadMyStatus = async () => {
    try {
      const headers = await buildAuthHeaders();
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};
      const res = await fetch(`${API_BASE}/api/me/status`, { headers, ...opts });
      if (res.ok) {
        const data = await res.json();
        if (data.statusMessage !== undefined) setStatusMsg(data.statusMessage);
        if (data.presence) setPresence(data.presence as PresenceStatus);
      }
    } catch {}
  };

  const saveStatus = async (msg: string, pres?: PresenceStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      const headers = await buildAuthHeaders(true);
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};
      await fetch(`${API_BASE}/api/me/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: msg, presence: pres ?? presence }),
        ...opts,
      });
    } catch {}
    setSaving(false);
  };

  const handleStatusMsgSubmit = () => {
    saveStatus(statusMsg);
  };

  const handlePresenceSelect = (p: PresenceStatus) => {
    setPresence(p);
    setShowPicker(false);
    saveStatus(statusMsg, p);
  };

  const initials = user
    ? (user.displayName || user.username).slice(0, 2).toUpperCase()
    : 'ME';

  const level = user?.level ?? 1;
  const levelBadge = level >= 70
    ? { bg: '#DC2626', fg: '#fff', icon: 'flame' as const, label: 'VIP' }
    : level >= 50
    ? { bg: '#F59E0B', fg: '#fff', icon: 'star' as const, label: 'Pro' }
    : level >= 30
    ? { bg: '#8B5CF6', fg: '#fff', icon: 'diamond' as const, label: 'Elite' }
    : { bg: '#3B82F6', fg: '#fff', icon: 'sparkles' as const, label: 'Rising' };

  function fmtCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  type MenuGroup = {
    title: string;
    items: {
      emoji: string;
      iconBg: string;
      label: string;
      right?: string;
      action?: () => void;
      testID: string;
    }[];
  };

  const MENU_GROUPS: MenuGroup[] = [
    {
      title: 'Akun',
      items: [
        {
          emoji: '👤', iconBg: '#4A90E2',
          label: 'Profile',
          action: () => { onClose(); onOpenProfile(); },
          testID: 'drawer-menu-profile',
        },
        {
          emoji: '🪙', iconBg: '#F5A623',
          label: 'Credits',
          right: user?.creditFormatted ?? '🪙 0',
          action: () => { onClose(); onOpenCredits(); },
          testID: 'drawer-menu-credits',
        },
        {
          emoji: '⚙️', iconBg: '#8E8E93',
          label: 'Settings',
          action: () => { onClose(); onOpenSettings(); },
          testID: 'drawer-menu-settings',
        },
      ],
    },
    {
      title: 'Sosial',
      items: [
        {
          emoji: '🏢', iconBg: '#9B59B6',
          label: hasApprovedAgency ? 'My Agency' : 'Register Agency',
          action: () => { onClose(); onOpenAgencyRegister(); },
          testID: 'drawer-menu-agency',
        },
        {
          emoji: '🤝', iconBg: '#5856D6',
          label: 'Join Agency',
          action: () => { onClose(); onOpenJoinAgency(); },
          testID: 'drawer-menu-join-agency',
        },
        {
          emoji: '🏆', iconBg: '#F39C12',
          label: 'Leaderboards',
          action: () => { onClose(); onOpenLeaderboard(); },
          testID: 'drawer-menu-leaderboards',
        },
      ],
    },
    {
      title: 'Lainnya',
      items: [
        {
          emoji: '🏪', iconBg: '#1ABC9C',
          label: 'Merchants',
          action: () => { onClose(); onOpenMerchants(); },
          testID: 'drawer-menu-merchants',
        },
        {
          emoji: '🔭', iconBg: '#E67E22',
          label: 'Discover',
          action: () => { onClose(); onOpenDiscover(); },
          testID: 'drawer-menu-discover',
        },
        {
          emoji: '🚪', iconBg: '#E74C3C',
          label: 'Logout',
          action: () => { onClose(); onLogout(); },
          testID: 'drawer-menu-logout',
        },
      ],
    },
  ];

  const ds = makeDrawerStyles(theme);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, ds.backdrop, { opacity: fadeAnim }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[ds.panel, { width: drawerWidth, transform: [{ translateX: slideAnim }] }]}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

            {/* ── Profile header — same gradient as home app bar ── */}
            <LinearGradient
              colors={['rgba(134,230,172,0.95)', 'rgba(220,252,231,0.90)', 'rgba(255,255,255,0.80)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[ds.profileGradient, { paddingTop: insets.top + 16 }]}
            >
              {/* Avatar with gold ring */}
              <View style={ds.avatarGoldRing}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500', '#FFEC6E', '#FFA500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={ds.avatarGradientBorder}
                >
                  <View style={ds.avatarInner}>
                    {user?.displayPicture ? (
                      <Image
                        source={{ uri: user.displayPicture }}
                        style={{ width: '100%', height: '100%', borderRadius: 999 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={ds.avatarText}>{initials}</Text>
                    )}
                  </View>
                </LinearGradient>
              </View>

              {/* Name + inline badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={ds.profileName}>{user?.displayName || user?.username || 'User'}</Text>
                <View style={[ds.levelBadge, { backgroundColor: levelBadge.bg }]}>
                  <Ionicons name={levelBadge.icon} size={9} color={levelBadge.fg} style={{ marginRight: 3 }} />
                  <Text style={[ds.levelBadgeText, { color: levelBadge.fg }]}>
                    {levelBadge.label} {level}
                  </Text>
                </View>
              </View>
              <Text style={ds.profileHandle}>@{user?.username ?? ''}</Text>

            </LinearGradient>

            {/* ── Presence / status row ── */}
            <View style={[ds.statusBar, { backgroundColor: theme.cardBg }]}>
              <TouchableOpacity
                onPress={() => setShowPicker(v => !v)}
                style={ds.presenceBtn}
                testID="button-presence-picker"
                activeOpacity={0.7}
              >
                <View style={[ds.onlineDot, { backgroundColor: PRESENCE_COLORS[presence] }]} />
                <Ionicons name="chevron-down" size={13} color={theme.textSecondary} />
              </TouchableOpacity>
              <TextInput
                style={[ds.statusInput, { color: theme.textPrimary, backgroundColor: theme.inputBg, borderColor: theme.border }]}
                placeholder="What's on your mind?"
                placeholderTextColor={theme.textSecondary}
                value={statusMsg}
                onChangeText={setStatusMsg}
                onSubmitEditing={handleStatusMsgSubmit}
                onBlur={handleStatusMsgSubmit}
                returnKeyType="done"
                testID="input-status-message"
              />
            </View>

            {showPicker && (
              <View style={[ds.pickerPanel, { backgroundColor: theme.cardBg, borderColor: theme.border }]} testID="panel-status-picker">
                {(['online', 'away', 'busy', 'offline'] as PresenceStatus[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[ds.pickerItem, presence === p && { backgroundColor: theme.accentSoft }]}
                    onPress={() => handlePresenceSelect(p)}
                    testID={`button-status-${p}`}
                    activeOpacity={0.7}
                  >
                    <View style={[ds.pickerDot, { backgroundColor: PRESENCE_COLORS[p] }]} />
                    <Text style={[ds.pickerLabel, { color: theme.textPrimary }, presence === p && { fontWeight: '700', color: theme.accent }]}>
                      {PRESENCE_LABELS[p]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Menu groups ── */}
            {MENU_GROUPS.map((group) => (
              <View key={group.title} style={ds.menuGroup}>
                <Text style={[ds.groupTitle, { color: theme.textSecondary }]}>{group.title}</Text>
                <View style={[ds.groupCard, { backgroundColor: theme.cardBg }]}>
                  {group.items.map((item, idx) => (
                    <View key={item.label}>
                      <TouchableOpacity
                        style={ds.menuRow}
                        activeOpacity={0.6}
                        onPress={item.action}
                        testID={item.testID}
                      >
                        <View style={[ds.iconBox, { backgroundColor: item.iconBg }]}>
                          <Text style={ds.iconEmoji}>{item.emoji}</Text>
                        </View>
                        <Text style={[ds.menuLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                        {item.right !== undefined && (
                          <Text style={ds.menuRight} testID="text-credit-idr-drawer">{item.right}</Text>
                        )}
                        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                      </TouchableOpacity>
                      {idx < group.items.length - 1 && (
                        <View style={[ds.menuDivider, { backgroundColor: theme.divider, marginLeft: 60 }]} />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Global Party Overlay — muncul di semua tab ───────────────────────────────
function GlobalPartyOverlay() {
  const party = useParty();
  if (!party.openRoom) return null;
  return (
    <>
      <PartyRoomModal
        visible={!party.isMinimized}
        isMinimized={party.isMinimized}
        room={party.openRoom}
        currentUser={party.currentUser}
        onClose={party.closePartyRoom}
        onMinimize={party.minimizeParty}
        onRoomUpdated={party.onRoomUpdated}
        onNavigateToRoom={party.navigateToRoom}
      />
      {party.isMinimized && (
        <FloatingPartyBubble
          roomName={party.openRoom.name}
          hostAvatar={party.openRoom.creatorAvatar}
          roomColor={party.openRoom.color}
          onRestore={party.restoreParty}
        />
      )}
    </>
  );
}

function HomeLayout() {
  const theme  = useAppTheme();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const pagerRef  = useRef<{ setPage: (page: number) => void } | null>(null);
  const [index, setIndex]           = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<DrawerUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [agencyRegisterOpen, setAgencyRegisterOpen] = useState(false);
  const [myAgencyOpen, setMyAgencyOpen]             = useState(false);
  const [joinAgencyOpen, setJoinAgencyOpen]         = useState(false);
  const [hasApprovedAgency, setHasApprovedAgency]   = useState(false);
  const [storeOpen, setStoreOpen]     = useState(false);
  const [creditsOpen, setCreditsOpen]       = useState(false);
  const [merchantsOpen, setMerchantsOpen]   = useState(false);
  const [discoverOpen, setDiscoverOpen]         = useState(false);
  const [leaderboardOpen, setLeaderboardOpen]         = useState(false);
  const [partyLeaderboardOpen, setPartyLeaderboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen]         = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchFriendOpen, setSearchFriendOpen]   = useState(false);
  const [unreadCount, setUnreadCount]             = useState(0);
  const prevUnreadCount                           = useRef<number | null>(null);
  const shimmerAnim                               = useRef(new Animated.Value(0)).current;
  const { width: screenWidth }                    = useWindowDimensions();

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.delay(2400),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, []);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-screenWidth * 0.6, screenWidth * 1.4],
  });

  useEffect(() => {
    if (prevUnreadCount.current !== null && unreadCount > prevUnreadCount.current) {
      playNotificationSound();
    }
    prevUnreadCount.current = unreadCount;
  }, [unreadCount]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (Platform.OS !== 'web') {
        const cookie = await getSession();
        if (cookie) headers['Cookie'] = cookie;
      }
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/uns/notifications/me/count`, { headers, ...opts });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {}
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const fetchAgencyStatus = async () => {
    try {
      const h: Record<string, string> = {};
      if (Platform.OS !== 'web') {
        const cookie = await getSession();
        if (cookie) h['Cookie'] = cookie;
      }
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};
      const res = await fetch(`${API_BASE}/api/agency/my`, { headers: h, ...opts });
      if (res.ok) {
        const d = await res.json();
        setHasApprovedAgency(!!d.agency);
      }
    } catch {}
  };

  const fetchDrawerUser = async () => {
    try {
      const me = await getMe();
      if (!me) return;
      const h: Record<string, string> = {};
      if (Platform.OS !== 'web') {
        const cookie = await getSession();
        if (cookie) h['Cookie'] = cookie;
      }
      const webOpts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const [credit, profileRes, friendsRes] = await Promise.all([
        getCreditBalance(me.username),
        fetch(`${API_BASE}/api/profile/me`, { headers: h, ...webOpts }),
        fetch(`${API_BASE}/api/friends`, { headers: h, ...webOpts }),
      ]);
      const profileData = profileRes.ok ? await profileRes.json() : null;
      const friendsData = friendsRes.ok ? await friendsRes.json() : null;
      const displayPicture  = profileData?.profile?.displayPicture ?? null;
      const migLevel        = profileData?.profile?.migLevel ?? 1;
      const followersCount  = profileData?.profile?.followersCount ?? profileData?.followersCount ?? 0;
      const friendsCount    = Array.isArray(friendsData?.friends) ? friendsData.friends.length : (friendsData?.total ?? 0);
      setDrawerUser({
        username:        me.username,
        displayName:     me.displayName,
        creditFormatted: credit?.formatted ?? '🪙 0',
        level:           migLevel,
        displayPicture,
        followersCount,
        friendsCount,
      });
    } catch {}
  };

  useEffect(() => {
    fetchDrawerUser();
    fetchUnreadCount();
    fetchAgencyStatus();
    // Poll setiap 8 detik (lebih cepat dari 30s sebelumnya)
    const interval = setInterval(fetchUnreadCount, 8000);
    // Real-time push: refresh unread segera saat ada notifikasi masuk via WS
    const unsubPush = globalGatewayService.onPushNotification(fetchUnreadCount);
    return () => { clearInterval(interval); unsubPush(); };
  }, []);

  const prevSettingsOpen = useRef(settingsOpen);
  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) {
      fetchDrawerUser();
    }
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen]);

  const s = makeHeaderStyles(theme);

  return (
    <View style={[s.root]}>
      <LinearGradient
        colors={['rgba(134,230,172,0.82)', 'rgba(220,252,231,0.70)', 'rgba(255,255,255,0.55)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            s.shimmerStrip,
            { transform: [{ translateX: shimmerTranslate }, { skewX: '-18deg' }] },
          ]}
        />
        <View style={s.headerLeft}>
          <TouchableOpacity
            onPress={() => { setDrawerOpen(true); fetchDrawerUser(); fetchAgencyStatus(); }}
            style={s.hamburger}
            testID="button-menu"
          >
            <View style={[s.hamburgerLine]} />
            <View style={[s.hamburgerLine, { width: 16 }]} />
            <View style={[s.hamburgerLine]} />
          </TouchableOpacity>
        </View>

        <View style={s.headerIcons}>
          <TouchableOpacity
            onPress={() => setPartyLeaderboardOpen(true)}
            style={[s.iconGlowWrap, { marginRight: 2 }]}
            activeOpacity={0.75}
          >
            <Ionicons name="trophy" size={22} color="#F59E0B" />
          </TouchableOpacity>
          <TouchableOpacity
            testID="button-search-friend"
            onPress={() => setSearchFriendOpen(true)}
            style={s.iconGlowWrap}
          >
            <Image
              source={require('../../assets/icons/ad_usersearch_white.png')}
              style={s.headerIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconGlowWrap, { marginLeft: 14 }]}
            testID="button-notifications"
            onPress={() => {
              setNotificationsOpen(true);
              fetchUnreadCount();
            }}
          >
            <View style={{ position: 'relative' }}>
              <Image
                source={require('../../assets/icons/ad_alert_white.png')}
                style={s.headerIcon}
                resizeMode="contain"
              />
              {unreadCount > 0 && (
                <View style={s.bellBadge} testID="badge-bell-count">
                  <Text style={s.bellBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <CustomTabBar
        index={index}
        onTabPress={(i) => {
          setIndex(i);
          pagerRef.current?.setPage(i);
        }}
      />

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => setIndex(e.nativeEvent.position)}
        scrollEnabled
      >
        {SCREENS.map((Screen, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Screen />
          </View>
        ))}
      </PagerView>

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLogout={handleLogout}
        onOpenProfile={() => { setDrawerOpen(false); setProfileOpen(true); }}
        onOpenAgencyRegister={async () => {
          setDrawerOpen(false);
          try {
            const h: Record<string, string> = {};
            if (Platform.OS !== 'web') {
              const cookie = await getSession();
              if (cookie) h['Cookie'] = cookie;
            }
            const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};
            const res = await fetch(`${API_BASE}/api/agency/my`, { headers: h, ...opts });
            if (res.ok) {
              const d = await res.json();
              const hasAgency = !!d.agency;
              setHasApprovedAgency(hasAgency);
              if (hasAgency) {
                setMyAgencyOpen(true);
              } else {
                setAgencyRegisterOpen(true);
              }
            } else {
              setAgencyRegisterOpen(true);
            }
          } catch {
            setAgencyRegisterOpen(true);
          }
        }}
        onOpenJoinAgency={() => { setDrawerOpen(false); setJoinAgencyOpen(true); }}
        onOpenStore={() => { setDrawerOpen(false); setStoreOpen(true); }}
        onOpenCredits={() => { setDrawerOpen(false); setCreditsOpen(true); }}
        onOpenMerchants={() => { setDrawerOpen(false); setMerchantsOpen(true); }}
        onOpenDiscover={() => { setDrawerOpen(false); setDiscoverOpen(true); }}
        onOpenLeaderboard={() => { setDrawerOpen(false); setLeaderboardOpen(true); }}
        onOpenSettings={() => { setDrawerOpen(false); setSettingsOpen(true); }}
        user={drawerUser}
        hasApprovedAgency={hasApprovedAgency}
      />

      <Modal
        visible={profileOpen}
        animationType="slide"
        onRequestClose={() => setProfileOpen(false)}
        statusBarTranslucent
      >
        <ProfileScreen onClose={() => setProfileOpen(false)} />
      </Modal>

      <AgencyRegisterModal
        visible={agencyRegisterOpen}
        onClose={() => {
          setAgencyRegisterOpen(false);
          fetchAgencyStatus();
        }}
      />

      <MyAgencyModal
        visible={myAgencyOpen}
        onClose={() => setMyAgencyOpen(false)}
      />

      <JoinAgencyModal
        visible={joinAgencyOpen}
        onClose={() => setJoinAgencyOpen(false)}
      />

      <StoreModal
        visible={storeOpen}
        onClose={() => setStoreOpen(false)}
        username={drawerUser?.username ?? null}
      />

      <CreditsModal
        visible={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        username={drawerUser?.username ?? null}
      />

      <MerchantsModal
        visible={merchantsOpen}
        onClose={() => setMerchantsOpen(false)}
      />

      <DiscoverModal
        visible={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
      />

      <LeaderboardModal
        visible={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />

      <PartyLeaderboardModal
        visible={partyLeaderboardOpen}
        onClose={() => setPartyLeaderboardOpen(false)}
      />

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
        onAvatarChange={fetchDrawerUser}
        username={drawerUser?.username ?? null}
      />

      <NotificationsModal
        visible={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          fetchUnreadCount();
        }}
      />

      <SearchFriendModal
        visible={searchFriendOpen}
        onClose={() => setSearchFriendOpen(false)}
      />

      {/* Login announcement popup — auto-shows once per published version
          right after the user lands on the home tabs (i.e. after login). */}
      <LoginAnnouncementModal />

      {/* Global Party Room modal + floating bubble — visible di semua tab */}
      <GlobalPartyOverlay />
    </View>
  );
}

function HomeLayoutWithProvider() {
  return (
    <PartyProvider>
      <HomeLayout />
    </PartyProvider>
  );
}

export { HomeLayoutWithProvider as default };

// ─── Dynamic style factories ──────────────────────────────────────────────────

function makeHeaderStyles(t: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.screenBg },
    header: {
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(0,180,100,0.18)',
      overflow: 'hidden',
    },
    shimmerStrip: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 80,
      backgroundColor: 'rgba(255,255,255,0.38)',
    },
    headerLeft:  { flexDirection: 'row', alignItems: 'center' },
    hamburger:   { marginRight: 10, justifyContent: 'center', gap: 5 },
    hamburgerLine: {
      width: 20,
      height: 2.5,
      backgroundColor: '#1A5C38',
      borderRadius: 2,
      shadowColor: 'rgba(0,0,0,0.55)',
      shadowOpacity: 1,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    headerIcons: { flexDirection: 'row', alignItems: 'center' },
    headerIcon:  {
      width: 24,
      height: 24,
      tintColor: '#1A5C38',
    },
    iconGlowWrap: {
      shadowColor: 'rgba(0,0,0,0.65)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    bellBadge: {
      position: 'absolute',
      top: -5,
      right: -6,
      backgroundColor: '#E53935',
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: '#fff',
    },
    bellBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  });
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pill is the rounded background that appears behind the active tab's
  // icon+label. Inactive tabs render the same pill with no background, so
  // dimensions stay constant and switching tabs feels stable (no layout jump).
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 16,
    maxWidth: '100%',
  },
  icon: {
    width: 56,
    height: 56,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  labelFocused: {
    fontWeight: '700',
  },
});

function makeDrawerStyles(t: AppTheme) {
  return StyleSheet.create({
    backdrop: { backgroundColor: 'rgba(0,0,0,0.50)' },
    panel: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: t.screenBg,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 3, height: 0 },
      elevation: 12,
    },

    // ── Profile gradient header ──────────────────────────────────────────────
    profileGradient: {
      paddingHorizontal: 20,
      paddingTop: 52,
      paddingBottom: 22,
      alignItems: 'flex-start',
    },
    avatarGoldRing: {
      marginBottom: 14,
    },
    avatarGradientBorder: {
      width: 82,
      height: 82,
      borderRadius: 41,
      padding: 3,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#FFD700',
      shadowOpacity: 0.55,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    avatarInner: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: '#fff',
    },
    avatarText:    { color: '#FFFFFF', fontSize: 26, fontWeight: 'bold' },
    profileName:   { fontSize: 19, fontWeight: '800', color: '#1A3A2A' },
    profileHandle: { fontSize: 12, color: '#4A7060', marginBottom: 10 },

    levelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    levelBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.55)',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      width: '100%',
    },
    statCol: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 15, fontWeight: '800', color: '#1A3A2A' },
    statLabel: { fontSize: 10, color: '#4A7060', marginTop: 1, fontWeight: '500' },
    statDivider: { width: 1, height: 30, backgroundColor: 'rgba(0,100,60,0.15)' },

    // ── Status / presence bar ────────────────────────────────────────────────
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.divider,
    },
    presenceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    onlineDot: { width: 11, height: 11, borderRadius: 6, marginRight: 3 },
    statusInput: {
      flex: 1,
      height: 34,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 13,
      borderWidth: 1,
    },

    pickerPanel: {
      marginHorizontal: 16,
      marginTop: 4,
      borderRadius: 10,
      borderWidth: 1,
      overflow: 'hidden',
    },
    pickerItem:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    pickerDot:   { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    pickerLabel: { fontSize: 14 },

    // ── Menu groups ──────────────────────────────────────────────────────────
    menuGroup: { marginTop: 14, paddingHorizontal: 12 },
    groupTitle: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 6,
      marginLeft: 4,
    },
    groupCard: {
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 14,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    iconEmoji:   { fontSize: 18 },
    menuLabel:   { flex: 1, fontSize: 15, fontWeight: '500' },
    menuRight:   { fontSize: 12, fontWeight: '600', color: '#F5A623', marginRight: 6 },
    menuDivider: { height: StyleSheet.hairlineWidth },
  });
}
