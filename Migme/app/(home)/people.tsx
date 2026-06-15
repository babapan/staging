import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_BASE } from '../../services/auth';
import { getSession } from '../../services/storage';
import { useAppTheme } from '../../services/themeContext';

const C = {
  headerBg:  '#006D8F',
  green:     '#00A8CC',
  white:     '#FFFFFF',
  text:      '#424242',
  ts:        '#999999',
  inputBg:   '#F2F2F2',
  botBg:     '#005F73',
  danger:    '#EF5350',
  sectionBg: '#F7FAF9',
  divider:   '#EEEEEE',
};

interface UserResult {
  id: string;
  username: string;
  displayName?: string | null;
}

type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

interface ContactItem {
  username: string;
  displayName: string;
  fusionUsername: string;
  presence?: PresenceStatus;
  statusMessage?: string;
}

async function buildHeaders(json = false): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) h['Cookie'] = cookie;
  }
  return h;
}

const PRESENCE_ONLINE  = require('../../assets/icons/ic_presence_online.png');
const PRESENCE_OFFLINE = require('../../assets/icons/ic_presence_offline.png');
const PRESENCE_AWAY    = require('../../assets/icons/ic_presence_away.png');
const PRESENCE_BUSY    = require('../../assets/icons/ic_presence_busy.png');

function presenceIcon(status?: PresenceStatus) {
  if (status === 'online') return PRESENCE_ONLINE;
  if (status === 'away')   return PRESENCE_AWAY;
  if (status === 'busy')   return PRESENCE_BUSY;
  return PRESENCE_OFFLINE;
}

function Avatar({ name, size = 44, bg = C.botBg }: { name: string; size?: number; bg?: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.33 }]}>{initials}</Text>
    </View>
  );
}

function ContactRow({
  item,
  onUnfollow,
}: {
  item: ContactItem;
  onUnfollow: (username: string) => void;
}) {
  const theme = useAppTheme();
  const statusMsg = item.statusMessage?.trim();
  return (
    <View style={[styles.userRow, { backgroundColor: theme.cardBg }]} testID={`card-contact-${item.username}`}>
      <View style={styles.avatarWrap}>
        <Avatar name={item.displayName || item.username} bg={C.botBg} size={44} />
        <Image
          source={presenceIcon(item.presence)}
          style={styles.presenceDot}
          resizeMode="contain"
        />
      </View>
      <View style={styles.userInfo}>
        <Text style={[styles.displayName, { color: theme.textPrimary }]}>{item.displayName || item.username}</Text>
        {statusMsg ? (
          <Text style={[styles.statusMsg, { color: theme.textSecondary }]} numberOfLines={1}>{statusMsg}</Text>
        ) : (
          <Text style={[styles.username, { color: theme.textSecondary }]}>@{item.fusionUsername}</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.unfollowBtn}
        onPress={() => onUnfollow(item.username)}
        testID={`button-unfollow-${item.username}`}
        activeOpacity={0.75}
      >
        <Text style={styles.unfollowText}>Following</Text>
      </TouchableOpacity>
    </View>
  );
}

function SearchUserRow({
  item,
  isFollowing,
  onFollow,
  onUnfollow,
}: {
  item: UserResult;
  isFollowing: boolean;
  onFollow: (username: string) => void;
  onUnfollow: (username: string) => void;
}) {
  const theme = useAppTheme();
  const name = item.displayName || item.username;
  return (
    <View style={[styles.userRow, { backgroundColor: theme.cardBg }]} testID={`card-user-${item.id}`}>
      <Avatar name={name} />
      <View style={styles.userInfo}>
        <Text style={[styles.displayName, { color: theme.textPrimary }]}>{name}</Text>
        <Text style={[styles.username, { color: theme.textSecondary }]}>@{item.username}</Text>
      </View>
      {isFollowing ? (
        <TouchableOpacity
          style={styles.unfollowBtn}
          onPress={() => onUnfollow(item.username)}
          testID={`button-unfollow-${item.id}`}
          activeOpacity={0.75}
        >
          <Text style={styles.unfollowText}>Following</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => onFollow(item.username)}
          testID={`button-add-${item.id}`}
          activeOpacity={0.75}
        >
          <Image
            source={require('../../assets/icons/ad_userppl_white.png')}
            style={styles.addIcon}
            resizeMode="contain"
          />
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PeopleScreen() {
  const theme = useAppTheme();
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState<UserResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [searched, setSearched]         = useState(false);
  const [contacts, setContacts]         = useState<ContactItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [followedSet, setFollowedSet]   = useState<Set<string>>(new Set());
  const [tab, setTab]                   = useState<'contacts' | 'search'>('contacts');

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/me/contacts`, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        const list: ContactItem[] = data.contacts ?? [];
        setContacts(list);
        setFollowedSet(new Set(list.map(c => c.fusionUsername)));
      }
    } catch {}
    setContactsLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setTab('search');
    try {
      const headers = await buildHeaders();
      const res = await fetch(
        `${API_BASE}/api/search/users?q=${encodeURIComponent(query.trim())}`,
        { credentials: 'include', headers },
      );
      const data = await res.json();
      setResults(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleFollow = useCallback(async (username: string) => {
    try {
      const headers = await buildHeaders(true);
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST', credentials: 'include', headers,
      });
      if (res.ok) {
        setFollowedSet(prev => { const s = new Set(prev); s.add(username); return s; });
        setContacts(prev => {
          if (prev.some(c => c.fusionUsername === username)) return prev;
          return [...prev, { username, displayName: username, fusionUsername: username }];
        });
        Alert.alert('Add as fan', `Kamu sekarang mengikuti ${username}.`);
      } else {
        Alert.alert('Gagal', 'Tidak dapat follow user saat ini.');
      }
    } catch {
      Alert.alert('Gagal', 'Tidak dapat follow user saat ini.');
    }
  }, []);

  const handleUnfollow = useCallback(async (username: string) => {
    Alert.alert(
      'Unfollow',
      `Berhenti mengikuti ${username}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              const headers = await buildHeaders(true);
              await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/follow`, {
                method: 'DELETE', credentials: 'include', headers,
              });
              setFollowedSet(prev => { const s = new Set(prev); s.delete(username); return s; });
              setContacts(prev => prev.filter(c => c.fusionUsername !== username));
            } catch {
              Alert.alert('Gagal', 'Tidak dapat unfollow user saat ini.');
            }
          },
        },
      ],
    );
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setTab('contacts');
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.screenBg }]}>
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        <Text style={styles.headerTitle}>People</Text>
      </View>

      <View style={[styles.searchRow, { backgroundColor: theme.inputBg }]}>
        <Image
          source={require('../../assets/icons/ad_search_grey.png')}
          style={[styles.searchIcon, { tintColor: theme.textSecondary }]}
          resizeMode="contain"
        />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search by username..."
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoCapitalize="none"
          testID="input-search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clearSearch} testID="button-clear-search">
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { backgroundColor: theme.cardBg, borderBottomColor: theme.divider }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'contacts' && { borderBottomColor: theme.accent }]}
          onPress={() => setTab('contacts')}
          testID="tab-contacts"
        >
          <Text style={[styles.tabLabel, { color: tab === 'contacts' ? theme.accent : theme.textSecondary }, tab === 'contacts' && { fontWeight: '700' }]}>
            Contacts {contacts.length > 0 ? `(${contacts.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'search' && { borderBottomColor: theme.accent }]}
          onPress={() => { if (query.trim()) handleSearch(); else setTab('search'); }}
          testID="tab-search"
        >
          <Text style={[styles.tabLabel, { color: tab === 'search' ? theme.accent : theme.textSecondary }, tab === 'search' && { fontWeight: '700' }]}>
            Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Contacts tab ── */}
      {tab === 'contacts' && (
        contactsLoading ? (
          <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
        ) : contacts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No contacts yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Follow users from a chat room or search for them here to add them to your contact list.
            </Text>
          </View>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={item => item.fusionUsername}
            renderItem={({ item }) => (
              <ContactRow item={item} onUnfollow={handleUnfollow} />
            )}
            ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
            onRefresh={loadContacts}
            refreshing={contactsLoading}
          />
        )
      )}

      {/* ── Search tab ── */}
      {tab === 'search' && (
        loading ? (
          <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
        ) : searched && results.length === 0 ? (
          <View style={styles.empty}>
            <Image
              source={require('../../assets/icons/ad_search_grey.png')}
              style={[styles.emptyIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No users found</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Try a different username.</Text>
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <SearchUserRow
                item={item}
                isFollowing={followedSet.has(item.username)}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
              />
            )}
            ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
          />
        ) : (
          <View style={styles.hint}>
            <View style={styles.hintBot}>
              <View style={styles.hintBotAvatar}>
                <Text style={styles.hintBotEmoji}>🔍</Text>
              </View>
              <Text style={styles.hintText}>
                Type a username and press Enter to find users. Add them as fans to add them to your contacts.
              </Text>
            </View>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.white },
  header: {
    backgroundColor: C.headerBg,
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerTitle:     { color: C.white, fontSize: 20, fontWeight: 'bold' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    margin: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon:      { width: 18, height: 18, tintColor: C.ts, marginRight: 8 },
  searchInput:     { flex: 1, fontSize: 14, color: C.text, paddingVertical: 2 },
  clearBtn:        { color: C.ts, fontSize: 14, paddingLeft: 8 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.white,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive:       { borderBottomWidth: 2, borderBottomColor: C.headerBg },
  tabLabel:        { color: C.ts, fontSize: 14, fontWeight: '500' },
  tabLabelActive:  { color: C.headerBg, fontWeight: '700' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
  },
  avatarText:      { color: C.white, fontWeight: 'bold' },
  userInfo:        { flex: 1 },
  displayName:     { color: C.text, fontWeight: '600', fontSize: 14 },
  username:        { color: C.ts, fontSize: 12, marginTop: 1 },
  statusMsg:       { color: '#555', fontSize: 12, marginTop: 1, fontStyle: 'italic' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.green,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addIcon:         { width: 14, height: 14, tintColor: C.white },
  addText:         { color: C.white, fontSize: 12, fontWeight: '600' },
  unfollowBtn: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.ts,
  },
  unfollowText:    { color: C.ts, fontSize: 12, fontWeight: '600' },
  divider:         { height: 1, backgroundColor: C.divider, marginLeft: 72 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon:       { width: 56, height: 56, tintColor: C.ts, marginBottom: 14 },
  emptyTitle:      { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 5 },
  emptySub:        { color: C.ts, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  hint:            { flex: 1, padding: 20 },
  hintBot: {
    backgroundColor: C.botBg,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  hintBotAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBotEmoji:    { fontSize: 24 },
  hintText:        { flex: 1, color: C.white, fontSize: 13, lineHeight: 18 },
});
