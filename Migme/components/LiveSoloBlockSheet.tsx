import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getLiveViewers, blockLiveViewer,
  getBlockedLiveUsers, unblockLiveUser,
} from '../services/liveService';
import type { LiveViewer, LiveBlockedUser } from '../services/liveService';

const { height: SH } = Dimensions.get('window');

type Tab = 'viewers' | 'blocked';

interface Props {
  visible: boolean;
  onClose: () => void;
  streamId: string;
}

export default function LiveSoloBlockSheet({ visible, onClose, streamId }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [tab,        setTab]        = useState<Tab>('viewers');
  const [viewers,    setViewers]    = useState<LiveViewer[]>([]);
  const [blocked,    setBlocked]    = useState<LiveBlockedUser[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId,   setActingId]   = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity,  { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      loadAll();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const [vList, bList] = await Promise.all([
      getLiveViewers(streamId),
      getBlockedLiveUsers(streamId),
    ]);
    setViewers(vList);
    setBlocked(bList);
    setLoading(false);
    setRefreshing(false);
  }, [streamId]);

  const handleBlock = (viewer: LiveViewer) => {
    Alert.alert(
      'Block Penonton',
      `Block ${viewer.displayName ?? viewer.username}?\nPengguna ini tidak bisa masuk ke live kamu lagi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Block',
          style: 'destructive',
          onPress: async () => {
            setActingId(viewer.username);
            const result = await blockLiveViewer(streamId, viewer.username);
            setActingId(null);
            if (result.ok) {
              setViewers(prev => prev.filter(v => v.username !== viewer.username));
              // Refresh blocked list
              const bList = await getBlockedLiveUsers(streamId);
              setBlocked(bList);
            } else {
              Alert.alert('Gagal', result.message ?? 'Tidak dapat block penonton');
            }
          },
        },
      ],
    );
  };

  const handleUnblock = (entry: LiveBlockedUser) => {
    Alert.alert(
      'Cabut Block',
      `Izinkan ${entry.displayName ?? entry.username} masuk ke live kamu lagi?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Cabut',
          onPress: async () => {
            setActingId(entry.userId);
            const ok = await unblockLiveUser(streamId, entry.userId);
            setActingId(null);
            if (ok) {
              setBlocked(prev => prev.filter(u => u.userId !== entry.userId));
            } else {
              Alert.alert('Gagal', 'Tidak dapat mencabut block');
            }
          },
        },
      ],
    );
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[s.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Manajemen Block</Text>
          <TouchableOpacity onPress={() => loadAll(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, tab === 'viewers' && s.tabActive]}
            onPress={() => setTab('viewers')}
            activeOpacity={0.75}
          >
            {tab === 'viewers' ? (
              <LinearGradient colors={['#FF6D00', '#E65100']} style={s.tabGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="eye-outline" size={13} color="#fff" />
                <Text style={s.tabTxtActive}>Penonton</Text>
                {viewers.length > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeTxt}>{viewers.length}</Text>
                  </View>
                )}
              </LinearGradient>
            ) : (
              <View style={s.tabInactive}>
                <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.45)" />
                <Text style={s.tabTxtInactive}>Penonton</Text>
                {viewers.length > 0 && (
                  <View style={s.tabBadgeDim}>
                    <Text style={s.tabBadgeDimTxt}>{viewers.length}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, tab === 'blocked' && s.tabActive]}
            onPress={() => setTab('blocked')}
            activeOpacity={0.75}
          >
            {tab === 'blocked' ? (
              <LinearGradient colors={['#FF6D00', '#E65100']} style={s.tabGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <MaterialCommunityIcons name="account-cancel-outline" size={14} color="#fff" />
                <Text style={s.tabTxtActive}>Diblok</Text>
                {blocked.length > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeTxt}>{blocked.length}</Text>
                  </View>
                )}
              </LinearGradient>
            ) : (
              <View style={s.tabInactive}>
                <MaterialCommunityIcons name="account-cancel-outline" size={14} color="rgba(255,255,255,0.45)" />
                <Text style={s.tabTxtInactive}>Diblok</Text>
                {blocked.length > 0 && (
                  <View style={s.tabBadgeDim}>
                    <Text style={s.tabBadgeDimTxt}>{blocked.length}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#FF6D00" size="large" />
          </View>
        ) : tab === 'viewers' ? (
          <FlatList
            data={viewers}
            keyExtractor={v => v.username}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor="#FF6D00" />
            }
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="eye-off-outline" size={44} color="rgba(255,255,255,0.1)" />
                <Text style={s.emptyText}>Tidak ada penonton saat ini</Text>
              </View>
            }
            contentContainerStyle={viewers.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 6 }}
            renderItem={({ item }) => (
              <UserRow
                username={item.username}
                displayName={item.displayName ?? item.username}
                avatarUrl={item.avatarUrl}
                acting={actingId === item.username}
                actionLabel="Block"
                actionColor="#FF6D00"
                onAction={() => handleBlock(item)}
                sublabel={null}
              />
            )}
            ItemSeparatorComponent={() => <View style={s.divider} />}
          />
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={v => v.userId}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor="#FF6D00" />
            }
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="account-check-outline" size={44} color="rgba(255,255,255,0.1)" />
                <Text style={s.emptyText}>Tidak ada pengguna yang diblok</Text>
              </View>
            }
            contentContainerStyle={blocked.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 6 }}
            renderItem={({ item }) => (
              <UserRow
                username={item.username}
                displayName={item.displayName ?? item.username}
                avatarUrl={item.avatarUrl}
                acting={actingId === item.userId}
                actionLabel="Cabut"
                actionColor="#10B981"
                onAction={() => handleUnblock(item)}
                sublabel={item.blockedAt ? `Diblok ${fmtDate(item.blockedAt)}` : null}
              />
            )}
            ItemSeparatorComponent={() => <View style={s.divider} />}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

function UserRow({
  username, displayName, avatarUrl,
  acting, actionLabel, actionColor, onAction, sublabel,
}: {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  acting: boolean;
  actionLabel: string;
  actionColor: string;
  onAction: () => void;
  sublabel: string | null;
}) {
  const initials = displayName.charAt(0).toUpperCase();
  const COLORS: Record<string, string> = {
    A:'#FF6B9D', B:'#FF9F43', C:'#26C6DA', D:'#A855F7',
    E:'#10B981', F:'#F59E0B', G:'#EF4444', H:'#3B82F6',
    I:'#EC4899', J:'#8B5CF6', K:'#06B6D4', L:'#84CC16',
  };
  const avatarColor = COLORS[initials] ?? '#FF6D00';

  return (
    <View style={s.row}>
      <View style={s.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback, { backgroundColor: avatarColor + '28' }]}>
            <Text style={[s.avatarInitial, { color: avatarColor }]}>{initials}</Text>
          </View>
        )}
      </View>
      <View style={s.info}>
        <Text style={s.displayName} numberOfLines={1}>{displayName}</Text>
        <Text style={s.usernameLabel} numberOfLines={1}>
          @{username}{sublabel ? ` · ${sublabel}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.actionBtn, {
          borderColor: actionColor + '55',
          backgroundColor: actionColor + '12',
        }]}
        onPress={onAction}
        activeOpacity={0.75}
        disabled={acting}
      >
        {acting ? (
          <ActivityIndicator size="small" color={actionColor} style={{ transform: [{ scale: 0.75 }] }} />
        ) : (
          <Text style={[s.actionTxt, { color: actionColor }]}>{actionLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(11,9,18,0.97)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SH * 0.65,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 10,
  },
  tab:       { flex: 1, borderRadius: 12, overflow: 'hidden' },
  tabActive: {},
  tabGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, paddingHorizontal: 10, gap: 5, borderRadius: 12,
  },
  tabInactive: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, paddingHorizontal: 10, gap: 5,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
  },
  tabTxtActive:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabTxtInactive: { color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '600' },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
  },
  tabBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  tabBadgeDim: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
  },
  tabBadgeDimTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.28)', fontSize: 14, marginTop: 4 },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.05)' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '800' },
  info: { flex: 1 },
  displayName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  usernameLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 1 },
  actionBtn: {
    paddingHorizontal: 13, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1,
    minWidth: 54, alignItems: 'center', justifyContent: 'center',
  },
  actionTxt: { fontSize: 12, fontWeight: '700' },
});
