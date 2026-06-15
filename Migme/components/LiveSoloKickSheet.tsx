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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLiveViewers, kickLiveViewer } from '../services/liveService';
import type { LiveViewer } from '../services/liveService';

const { height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  streamId: string;
}

export default function LiveSoloKickSheet({ visible, onClose, streamId }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [viewers,    setViewers]    = useState<LiveViewer[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [kickingId,  setKickingId]  = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity,  { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      load();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const list = await getLiveViewers(streamId);
    setViewers(list);
    setLoading(false);
    setRefreshing(false);
  }, [streamId]);

  const handleKick = (viewer: LiveViewer) => {
    Alert.alert(
      'Kick Viewer',
      `Kick ${viewer.displayName ?? viewer.username} dari live?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Kick',
          style: 'destructive',
          onPress: async () => {
            setKickingId(viewer.username);
            const result = await kickLiveViewer(streamId, viewer.username);
            setKickingId(null);
            if (result.ok) {
              setViewers(prev => prev.filter(v => v.username !== viewer.username));
            } else {
              Alert.alert('Gagal', result.message ?? 'Tidak dapat kick viewer');
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Dim backdrop */}
      <Animated.View style={[s.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={[s.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Daftar Penonton</Text>
            {viewers.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countTxt}>{viewers.length}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => load(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* Subtitle */}
        <Text style={s.subtitle}>Pilih penonton yang ingin di-kick dari live</Text>

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#FF6B9D" size="large" />
          </View>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={v => v.username}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FF6B9D" />
            }
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="eye-off-outline" size={44} color="rgba(255,255,255,0.12)" />
                <Text style={s.emptyText}>Tidak ada penonton saat ini</Text>
              </View>
            }
            contentContainerStyle={viewers.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 8 }}
            renderItem={({ item }) => (
              <ViewerRow
                viewer={item}
                kicking={kickingId === item.username}
                onKick={() => handleKick(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={s.divider} />}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

function ViewerRow({
  viewer, kicking, onKick,
}: {
  viewer: LiveViewer;
  kicking: boolean;
  onKick: () => void;
}) {
  const initials = (viewer.displayName ?? viewer.username).charAt(0).toUpperCase();
  const colorMap: Record<string, string> = {
    A:'#FF6B9D', B:'#FF9F43', C:'#26C6DA', D:'#A855F7',
    E:'#10B981', F:'#F59E0B', G:'#EF4444', H:'#3B82F6',
  };
  const avatarColor = colorMap[initials] ?? '#FF6B9D';

  return (
    <View style={s.row}>
      {/* Avatar */}
      <View style={s.avatarWrap}>
        {viewer.avatarUrl ? (
          <Image source={{ uri: viewer.avatarUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback, { backgroundColor: avatarColor + '33' }]}>
            <Text style={[s.avatarInitial, { color: avatarColor }]}>{initials}</Text>
          </View>
        )}
        {/* Live dot */}
        <View style={s.liveDot} />
      </View>

      {/* Name info */}
      <View style={s.info}>
        <Text style={s.displayName} numberOfLines={1}>
          {viewer.displayName ?? viewer.username}
        </Text>
        <Text style={s.username} numberOfLines={1}>@{viewer.username}</Text>
      </View>

      {/* Kick button — compact, pill style */}
      <TouchableOpacity
        style={s.kickBtn}
        onPress={onKick}
        activeOpacity={0.75}
        disabled={kicking}
      >
        {kicking ? (
          <ActivityIndicator size="small" color="#FF4D6D" style={{ transform: [{ scale: 0.75 }] }} />
        ) : (
          <>
            <MaterialCommunityIcons name="account-remove-outline" size={13} color="#FF4D6D" />
            <Text style={s.kickTxt}>Kick</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(12,10,20,0.97)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SH * 0.62,
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  countBadge: {
    backgroundColor: 'rgba(255,107,157,0.18)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,107,157,0.35)',
  },
  countTxt: { fontSize: 11, fontWeight: '700', color: '#FF6B9D' },
  subtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.38)',
    paddingHorizontal: 16, marginBottom: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 4 },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.05)' },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
  },
  avatarWrap: { marginRight: 12, position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '800' },
  liveDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#4ADE80',
    borderWidth: 1.5, borderColor: 'rgba(12,10,20,0.97)',
  },
  info: { flex: 1 },
  displayName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  username: { color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 1 },
  kickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,77,109,0.45)',
    backgroundColor: 'rgba(255,77,109,0.08)',
    minWidth: 54, justifyContent: 'center',
  },
  kickTxt: { color: '#FF4D6D', fontSize: 12, fontWeight: '600' },
});
