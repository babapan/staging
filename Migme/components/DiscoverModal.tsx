import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSession } from '../services/storage';
import { API_BASE } from '../services/auth';
import { useAppTheme } from '../services/themeContext';

const ORANGE = '#FF8C42';
const BLUE   = '#1565C0';
const PURPLE = '#990099';

interface User {
  id: string; username: string; displayName: string;
  country?: string | null; displayPicture?: string | null;
}
interface Chatroom {
  id: string; name: string; description?: string | null;
  currentParticipants: number; maxParticipants: number;
  color: string; language: string;
}
interface Merchant {
  id: string; username: string; displayName: string;
  description?: string | null; category?: string | null;
  usernameColor: string; totalPoints: number;
  logoUrl?: string | null; displayPicture?: string | null;
}
interface SearchResults {
  users?: User[]; chatrooms?: Chatroom[]; merchants?: Merchant[];
}

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}
function fetchOpts(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' } : {};
}
async function apiGet(path: string) {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers, ...fetchOpts() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function languageLabel(code: string): string {
  const map: Record<string, string> = { id: '🇮🇩 ID', en: '🇺🇸 EN', ms: '🇲🇾 MS', ar: '🇸🇦 AR' };
  return map[code] ?? code.toUpperCase();
}

function AvatarCircle({ name, color, size = 40, img }: { name: string; color: string; size?: number; img?: string | null }) {
  if (img) {
    return <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.36, fontWeight: '700' }}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function RoomCard({ room, theme }: { room: Chatroom; theme: ReturnType<typeof useAppTheme> }) {
  const pct = Math.round((room.currentParticipants / room.maxParticipants) * 100);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, gap: 12 }} testID={`room-card-${room.id}`}>
      <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0, backgroundColor: room.color || theme.accent }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 }} numberOfLines={1}>{room.name}</Text>
        {room.description ? <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }} numberOfLines={1}>{room.description}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="people-outline" size={12} color={theme.textSecondary} />
          <Text style={{ fontSize: 11, color: theme.textSecondary }}>{room.currentParticipants}/{room.maxParticipants}</Text>
          <Text style={{ fontSize: 11, color: theme.textSecondary, marginLeft: 8 }}>{languageLabel(room.language)}</Text>
        </View>
        <View style={{ height: 3, backgroundColor: theme.divider, borderRadius: 2, width: '100%', overflow: 'hidden' }}>
          <View style={{ height: 3, borderRadius: 2, minWidth: 4, width: `${pct}%` as any, backgroundColor: room.color || theme.accent }} />
        </View>
      </View>
    </View>
  );
}

function UserRow({ user, theme }: { user: User; theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }} testID={`user-row-${user.id}`}>
      <AvatarCircle name={user.displayName} color={theme.accent} img={user.displayPicture} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{user.displayName}</Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>@{user.username}{user.country ? ` · ${user.country}` : ''}</Text>
      </View>
      <Ionicons name="person-add-outline" size={18} color={theme.accent} />
    </View>
  );
}

function MerchantRow({ merchant, theme }: { merchant: Merchant; theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }} testID={`merchant-row-${merchant.id}`}>
      <AvatarCircle name={merchant.displayName} color={merchant.usernameColor || PURPLE} size={40} img={merchant.logoUrl || merchant.displayPicture} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: merchant.usernameColor || PURPLE }} numberOfLines={1}>{merchant.displayName}</Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>@{merchant.username}{merchant.category ? ` · ${merchant.category}` : ''}</Text>
      </View>
      <Image source={require('../assets/icons/ad_solidmerch.png')} style={{ width: 16, height: 16, tintColor: theme.accent }} resizeMode="contain" />
    </View>
  );
}

const FALLBACK_TAGS = [
  'max99', 'indonesia', 'chat', 'games', 'music', 'fashion',
  'travel', 'food', 'tech', 'sports', 'friends', 'fun',
];

interface Props { visible: boolean; onClose: () => void; }

export default function DiscoverModal({ visible, onClose }: Props) {
  const insets    = useSafeAreaInsets();
  const theme     = useAppTheme();
  const searchRef = useRef<TextInput>(null);

  const [query, setQuery]                 = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching]         = useState(false);
  const [trendingRooms, setTrendingRooms] = useState<Chatroom[]>([]);
  const [recUsers, setRecUsers]           = useState<User[]>([]);
  const [recMerchants, setRecMerchants]   = useState<Merchant[]>([]);
  const [trendingTags, setTrendingTags]   = useState<string[]>([]);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [rooms, users, merchants, tags] = await Promise.all([
        apiGet('/api/discovery/trending-chatrooms').catch(() => ({ chatrooms: [] })),
        apiGet('/api/discovery/recommended-users').catch(() => ({ recommendations: [] })),
        apiGet('/api/discovery/recommended-merchants').catch(() => ({ merchants: [] })),
        apiGet('/api/discovery/trending-tags').catch(() => ({ tags: [] })),
      ]);
      setTrendingRooms(rooms.chatrooms ?? []);
      setRecUsers(users.recommendations ?? []);
      setRecMerchants(merchants.merchants ?? []);
      setTrendingTags(tags.tags?.length > 0 ? tags.tags : FALLBACK_TAGS);
    } catch {}
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) { loadAll(); }
    else { setQuery(''); setSearchResults(null); }
  }, [visible]);

  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiGet(`/api/discovery/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(data.results ?? {});
      } catch { setSearchResults(null); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const isSearching = query.trim().length >= 2;
  const hasResults  = searchResults &&
    ((searchResults.users?.length ?? 0) + (searchResults.chatrooms?.length ?? 0) + (searchResults.merchants?.length ?? 0)) > 0;

  const s = makeStyles(theme);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} testID="button-discover-back">
            <Ionicons name="arrow-back" size={24} color={theme.textOnAccent} />
          </TouchableOpacity>
          <Image source={require('../assets/icons/ad_explore_white.png')} style={s.headerIcon} resizeMode="contain" />
          <Text style={s.headerTitle}>Discover</Text>
        </View>

        {/* ── Search Bar ── */}
        <View style={s.searchContainer}>
          <View style={s.searchBar}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
            <TextInput
              ref={searchRef}
              style={s.searchInput}
              placeholder="Search people, rooms, merchants..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="input-discover-search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} testID="button-clear-discover">
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Content ── */}
        {isSearching ? (
          searching ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} size="large" />
          ) : !hasResults ? (
            <View style={s.emptyWrap}>
              <Image source={require('../assets/icons/ad_explore_orange.png')} style={s.emptyIcon} resizeMode="contain" />
              <Text style={s.emptyTitle}>No results found</Text>
              <Text style={s.emptySub}>Try a different search term</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
            >
              {(searchResults!.users?.length ?? 0) > 0 && (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Image source={require('../assets/icons/ad_userppl_grey.png')} style={s.sectionIcon} resizeMode="contain" />
                    <Text style={s.sectionTitle}>People</Text>
                    <Text style={s.sectionCount}>{searchResults!.users!.length}</Text>
                  </View>
                  <View style={s.card}>
                    {searchResults!.users!.map((u, i) => (
                      <View key={u.id}>
                        <UserRow user={u} theme={theme} />
                        {i < searchResults!.users!.length - 1 && <View style={s.rowDivider} />}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {(searchResults!.chatrooms?.length ?? 0) > 0 && (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Image source={require('../assets/icons/ad_chatroom_grey.png')} style={s.sectionIcon} resizeMode="contain" />
                    <Text style={s.sectionTitle}>Chat Rooms</Text>
                    <Text style={s.sectionCount}>{searchResults!.chatrooms!.length}</Text>
                  </View>
                  <View style={s.card}>
                    {searchResults!.chatrooms!.map((r, i) => (
                      <View key={r.id}>
                        <RoomCard room={r} theme={theme} />
                        {i < searchResults!.chatrooms!.length - 1 && <View style={s.rowDivider} />}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {(searchResults!.merchants?.length ?? 0) > 0 && (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Image source={require('../assets/icons/ad_solidmerch.png')} style={[s.sectionIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
                    <Text style={s.sectionTitle}>Merchants</Text>
                    <Text style={s.sectionCount}>{searchResults!.merchants!.length}</Text>
                  </View>
                  <View style={s.card}>
                    {searchResults!.merchants!.map((m, i) => (
                      <View key={m.id}>
                        <MerchantRow merchant={m} theme={theme} />
                        {i < searchResults!.merchants!.length - 1 && <View style={s.rowDivider} />}
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          )
        ) : (
          loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} size="large" />
          ) : (
            <ScrollView
              contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadAll(true)}
                  tintColor={theme.accent}
                  colors={[theme.accent]}
                />
              }
            >
              {/* Trending Rooms */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Ionicons name="flame" size={16} color={ORANGE} style={{ marginRight: 6 }} />
                  <Text style={s.sectionTitle}>Trending Rooms</Text>
                </View>
                {trendingRooms.length === 0 ? (
                  <View style={[s.card, { padding: 20, alignItems: 'center' }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>No trending rooms yet</Text>
                  </View>
                ) : (
                  <FlatList
                    data={trendingRooms}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={s.rowDivider} />}
                    style={s.card}
                    renderItem={({ item }) => <RoomCard room={item} theme={theme} />}
                  />
                )}
              </View>

              {/* Recommended People */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Ionicons name="people" size={16} color={BLUE} style={{ marginRight: 6 }} />
                  <Text style={s.sectionTitle}>People You May Know</Text>
                </View>
                {recUsers.length === 0 ? (
                  <View style={[s.card, { padding: 20, alignItems: 'center' }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }}>No recommendations yet</Text>
                  </View>
                ) : (
                  <FlatList
                    data={recUsers}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={s.rowDivider} />}
                    style={s.card}
                    renderItem={({ item }) => <UserRow user={item} theme={theme} />}
                  />
                )}
              </View>

              {/* Featured Merchants */}
              {recMerchants.length > 0 && (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Image source={require('../assets/icons/ad_solidmerch.png')} style={[s.sectionIcon, { tintColor: PURPLE }]} resizeMode="contain" />
                    <Text style={s.sectionTitle}>Featured Merchants</Text>
                  </View>
                  <FlatList
                    data={recMerchants}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={s.rowDivider} />}
                    style={s.card}
                    renderItem={({ item }) => <MerchantRow merchant={item} theme={theme} />}
                  />
                </View>
              )}

              {/* Trending Topic Tags */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Ionicons name="trending-up" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.sectionTitle}>Trending Topics</Text>
                </View>
                <View style={[s.card, s.tagsWrap]}>
                  {trendingTags.map((tag) => (
                    <TouchableOpacity key={tag} style={s.tag} onPress={() => setQuery(tag)} testID={`tag-${tag}`}>
                      <Text style={s.tagText}>#{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* MigWorld Banner */}
              <View style={s.migworldBanner}>
                <Image source={require('../assets/icons/ad_rocket_success.png')} style={s.migworldIcon} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={s.migworldTitle}>Explore MigWorld</Text>
                  <Text style={s.migworldSub}>Discover amazing content and connect with the community</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textOnAccent} />
              </View>
            </ScrollView>
          )
        )}
      </View>
    </Modal>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.screenBg },

    header: {
      backgroundColor: theme.headerBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
    },
    backBtn:     {},
    headerIcon:  { width: 22, height: 22, tintColor: theme.textOnAccent },
    headerTitle: { flex: 1, color: theme.textOnAccent, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

    searchContainer: {
      backgroundColor: theme.headerBg,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.textOnAccent, padding: 0 },

    scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

    section:       { marginBottom: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    sectionIcon:   { width: 16, height: 16, marginRight: 6, tintColor: theme.textSecondary },
    sectionTitle:  { flex: 1, fontSize: 14, fontWeight: '700', color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionCount:  {
      fontSize: 12,
      color: theme.textSecondary,
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: 'hidden',
    },

    card: {
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    rowDivider: { height: 1, backgroundColor: theme.divider, marginHorizontal: 16 },

    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    tag: {
      backgroundColor: theme.accentSoft,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.accent + '44',
    },
    tagText: { fontSize: 13, color: theme.accent, fontWeight: '600' },

    migworldBanner: {
      backgroundColor: theme.accent,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 18,
      gap: 14,
      marginBottom: 8,
    },
    migworldIcon:  { width: 40, height: 40, tintColor: theme.textOnAccent },
    migworldTitle: { fontSize: 15, fontWeight: '700', color: theme.textOnAccent, marginBottom: 2 },
    migworldSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 17 },

    emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
    emptyIcon:  { width: 64, height: 64, tintColor: theme.divider, marginBottom: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textSecondary },
    emptySub:   { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
  });
}
