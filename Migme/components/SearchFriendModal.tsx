import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE, buildHeaders } from '../services/auth';
import { useAppTheme, type AppTheme } from '../services/themeContext';

interface UserResult {
  id: string;
  username: string;
  displayName?: string | null;
  displayPicture?: string | null;
  aboutMe?: string | null;
}

type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

const PRESENCE_ONLINE  = require('../assets/icons/ic_presence_online.png');
const PRESENCE_OFFLINE = require('../assets/icons/ic_presence_offline.png');
const PRESENCE_AWAY    = require('../assets/icons/ic_presence_away.png');
const PRESENCE_BUSY    = require('../assets/icons/ic_presence_busy.png');
const AVATAR_DEFAULT   = require('../assets/icons/icon_default_avatar.png');

function presenceIcon(status?: PresenceStatus) {
  if (status === 'online') return PRESENCE_ONLINE;
  if (status === 'away')   return PRESENCE_AWAY;
  if (status === 'busy')   return PRESENCE_BUSY;
  return PRESENCE_OFFLINE;
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.screenBg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.headerBg,
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 10,
    },
    backBtn: {
      padding: 6,
      borderRadius: 20,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 22,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 15,
      paddingVertical: 0,
    },
    clearBtn: {
      padding: 2,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      textTransform: 'uppercase',
      color: t.textSecondary,
    },

    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.cardBg,
    },
    avatarWrap: {
      position: 'relative',
      marginRight: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
    },
    avatarInitial: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '700',
    },
    presenceDot: {
      position: 'absolute',
      bottom: 1,
      right: 1,
      width: 13,
      height: 13,
    },
    userInfo: { flex: 1 },
    displayName: {
      fontSize: 15,
      fontWeight: '600',
      color: t.textPrimary,
      marginBottom: 2,
    },
    username: {
      fontSize: 12,
      color: t.textSecondary,
    },
    aboutMe: {
      fontSize: 12,
      color: t.textSecondary,
      fontStyle: 'italic',
    },

    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accent,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 7,
      gap: 5,
    },
    addBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },
    addingBtn: {
      backgroundColor: t.isDark ? 'rgba(255,255,255,0.1)' : '#E0E0E0',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    followingBtn: {
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: t.border,
    },
    followingBtnText: {
      color: t.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },

    divider: {
      height: 1,
      backgroundColor: t.divider,
      marginLeft: 76,
    },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyIcon: { width: 60, height: 60, marginBottom: 14 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: t.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 32 },

    hintWrap: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    hintIcon: { width: 56, height: 56, marginBottom: 16 },
    hintTitle: { fontSize: 16, fontWeight: '700', color: t.textPrimary, marginBottom: 8 },
    hintSub: { fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 19 },
  });
}

function UserRow({
  item,
  isFollowing,
  isAdding,
  onAdd,
  onUnfollow,
}: {
  item: UserResult;
  isFollowing: boolean;
  isAdding: boolean;
  onAdd: (username: string) => void;
  onUnfollow: (username: string) => void;
}) {
  const theme  = useAppTheme();
  const styles = makeStyles(theme);
  const name   = item.displayName || item.username;
  const avatarUri = item.displayPicture
    ? (item.displayPicture.startsWith('http') ? item.displayPicture : `${API_BASE}${item.displayPicture}`)
    : null;

  return (
    <View style={styles.userRow} testID={`card-search-user-${item.id}`}>
      <View style={styles.avatarWrap}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} defaultSource={AVATAR_DEFAULT} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.userInfo}>
        <Text style={styles.displayName} numberOfLines={1}>{name}</Text>
        <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
        {item.aboutMe ? (
          <Text style={styles.aboutMe} numberOfLines={1}>{item.aboutMe}</Text>
        ) : null}
      </View>

      {isAdding ? (
        <View style={styles.addingBtn}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : isFollowing ? (
        <TouchableOpacity
          style={styles.followingBtn}
          onPress={() => onUnfollow(item.username)}
          testID={`button-unfollow-${item.id}`}
          activeOpacity={0.75}
        >
          <Text style={styles.followingBtnText}>Following</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => onAdd(item.username)}
          testID={`button-add-friend-${item.id}`}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={14} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SearchFriendModal({ visible, onClose }: Props) {
  const theme   = useAppTheme();
  const insets  = useSafeAreaInsets();
  const styles  = makeStyles(theme);

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<UserResult[]>([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [followedSet, setFollowedSet] = useState<Set<string>>(new Set());
  const [addingSet, setAddingSet]   = useState<Set<string>>(new Set());

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setAddingSet(new Set());
      setTimeout(() => inputRef.current?.focus(), 300);
      loadFollowing();
    }
  }, [visible]);

  const loadFollowing = async () => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/me/following`, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        const list: string[] = data.following ?? [];
        setFollowedSet(new Set(list));
      }
    } catch {}
  };

  const handleSearch = useCallback(async (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(
        `${API_BASE}/api/search/users?q=${encodeURIComponent(term)}`,
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

  const handleAdd = useCallback(async (username: string) => {
    setAddingSet(prev => new Set([...Array.from(prev), username]));
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST', credentials: 'include', headers,
      });
      if (res.ok) {
        setFollowedSet(prev => { const s = new Set(prev); s.add(username); return s; });
        Alert.alert('Berhasil', `Kamu sekarang mengikuti ${username}.`);
      } else {
        Alert.alert('Gagal', 'Tidak dapat menambahkan teman saat ini.');
      }
    } catch {
      Alert.alert('Gagal', 'Terjadi kesalahan jaringan.');
    } finally {
      setAddingSet(prev => { const s = new Set(prev); s.delete(username); return s; });
    }
  }, []);

  const handleUnfollow = useCallback((username: string) => {
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
              const headers = await buildHeaders();
              await fetch(`${API_BASE}/api/users/${encodeURIComponent(username)}/follow`, {
                method: 'DELETE', credentials: 'include', headers,
              });
              setFollowedSet(prev => { const s = new Set(prev); s.delete(username); return s; });
            } catch {
              Alert.alert('Gagal', 'Tidak dapat unfollow saat ini.');
            }
          },
        },
      ],
    );
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>

        {/* ── Header / Search bar ── */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? 8 : 12 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            testID="button-search-friend-back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.7)" />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Cari teman berdasarkan username..."
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearch()}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              testID="input-search-friend"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={handleClear}
                style={styles.clearBtn}
                testID="button-clear-friend-search"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : searched && results.length === 0 ? (
          <View style={styles.center}>
            <Image
              source={require('../assets/icons/ad_userppl_grey.png')}
              style={[styles.emptyIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
            <Text style={styles.emptyTitle}>Tidak ada hasil</Text>
            <Text style={styles.emptySub}>
              Tidak ada pengguna dengan username "{query}". Coba username yang berbeda.
            </Text>
          </View>
        ) : results.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>
              {results.length} hasil ditemukan
            </Text>
            <FlatList
              data={results}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <UserRow
                  item={item}
                  isFollowing={followedSet.has(item.username)}
                  isAdding={addingSet.has(item.username)}
                  onAdd={handleAdd}
                  onUnfollow={handleUnfollow}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          </>
        ) : (
          <View style={styles.hintWrap}>
            <Image
              source={require('../assets/icons/ad_usersearch_white.png')}
              style={[styles.hintIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
            <Text style={styles.hintTitle}>Cari Teman</Text>
            <Text style={styles.hintSub}>
              Ketik username teman kamu lalu tekan Enter untuk mencari. Tambahkan mereka sebagai fan untuk menambah ke daftar kontak.
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
