import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPartyMuted, unmutePartyUser, PartyMemberEntry } from '../services/partyMemberService';

const { height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  isOwner: boolean;
}

export default function PartyMutedListSheet({ visible, onClose, roomId, isOwner }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [list,        setList]        = useState<PartyMemberEntry[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actionId,    setActionId]    = useState<string | null>(null);

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
    const data = await fetchPartyMuted(roomId);
    setList(data);
    setLoading(false);
    setRefreshing(false);
  }, [roomId]);

  const handleUnmute = async (entry: PartyMemberEntry) => {
    Alert.alert(
      'Batalkan Bisukan',
      `Batalkan bisukan untuk @${entry.username}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Batalkan',
          style: 'destructive',
          onPress: async () => {
            setActionId(entry.user_id);
            const ok = await unmutePartyUser(roomId, entry.user_id);
            setActionId(null);
            if (ok) setList(prev => prev.filter(u => u.user_id !== entry.user_id));
            else Alert.alert('Gagal', 'Tidak dapat membatalkan bisukan');
          },
        },
      ],
    );
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}>
        <View style={s.handle} />

        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>daftar dibisukan</Text>
          <View style={{ width: 22 }} />
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#F59E0B" size="large" />
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={i => i.user_id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F59E0B" />
            }
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="microphone-off" size={44} color="rgba(255,255,255,0.15)" />
                <Text style={s.emptyText}>Tidak ada anggota yang dibisukan</Text>
              </View>
            }
            contentContainerStyle={list.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 8 }}
            renderItem={({ item }) => (
              <View style={s.row}>
                <View style={s.avatarWrap}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarPlaceholder]}>
                      <MaterialCommunityIcons name="account" size={22} color="rgba(255,255,255,0.35)" />
                    </View>
                  )}
                </View>
                <View style={s.info}>
                  <Text style={s.username}>@{item.username}</Text>
                  {item.muted_by_username ? (
                    <Text style={s.sub}>Dibisukan oleh @{item.muted_by_username}{item.muted_at ? ` · ${fmtDate(item.muted_at)}` : ''}</Text>
                  ) : null}
                </View>
                {isOwner && (
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() => handleUnmute(item)}
                    activeOpacity={0.7}
                    disabled={actionId === item.user_id}
                  >
                    {actionId === item.user_id
                      ? <ActivityIndicator size="small" color="#F59E0B" />
                      : <Text style={s.actionText}>Batalkan</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            )}
            ItemSeparatorComponent={() => <View style={s.divider} />}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(14,14,22,0.96)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    height: SH * 0.65,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    elevation: 28,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
  },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  username: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  actionBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
  },
  actionText: { color: '#F59E0B', fontSize: 12, fontWeight: '600' },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' },
});
