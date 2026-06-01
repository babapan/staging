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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPartyAdmins,
  addPartyAdmin,
  removePartyAdmin,
  PartyMemberEntry,
} from '../services/partyMemberService';

const { height: SH } = Dimensions.get('window');
const MAX_ADMINS = 5;

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  isOwner: boolean;
}

export default function PartyRoomAdminSheet({ visible, onClose, roomId, isOwner }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [admins,      setAdmins]      = useState<PartyMemberEntry[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actionId,    setActionId]    = useState<string | null>(null);
  const [addMode,     setAddMode]     = useState(false);
  const [searchText,  setSearchText]  = useState('');
  const [adding,      setAdding]      = useState(false);

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
      setAddMode(false);
      setSearchText('');
    }
  }, [visible]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const data = await fetchPartyAdmins(roomId);
    setAdmins(data);
    setLoading(false);
    setRefreshing(false);
  }, [roomId]);

  const handleAdd = async () => {
    const name = searchText.trim();
    if (!name) return;
    if (admins.length >= MAX_ADMINS) {
      Alert.alert('Batas tercapai', `Maksimal ${MAX_ADMINS} admin per ruangan`);
      return;
    }
    setAdding(true);
    const result = await addPartyAdmin(roomId, name);
    setAdding(false);
    if (result.ok) {
      setSearchText('');
      setAddMode(false);
      load();
    } else {
      Alert.alert('Gagal', result.error || 'Tidak dapat menambah admin');
    }
  };

  const handleRemove = (entry: PartyMemberEntry) => {
    Alert.alert(
      'Hapus Admin',
      `Cabut hak admin dari @${entry.username}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Cabut',
          style: 'destructive',
          onPress: async () => {
            setActionId(entry.user_id);
            const ok = await removePartyAdmin(roomId, entry.user_id);
            setActionId(null);
            if (ok) setAdmins(prev => prev.filter(a => a.user_id !== entry.user_id));
            else Alert.alert('Gagal', 'Tidak dapat menghapus admin');
          },
        },
      ],
    );
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
          <Text style={s.headerTitle}>Pengelolaan ruang siaran</Text>
          {isOwner && admins.length < MAX_ADMINS ? (
            <TouchableOpacity
              onPress={() => setAddMode(v => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons
                name={addMode ? 'close' : 'account-plus-outline'}
                size={22}
                color="#7C3AED"
              />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* Admin slot indicator */}
        <View style={s.slotBar}>
          {Array.from({ length: MAX_ADMINS }).map((_, i) => (
            <View
              key={i}
              style={[s.slot, i < admins.length && s.slotFilled]}
            />
          ))}
          <Text style={s.slotText}>{admins.length}/{MAX_ADMINS} admin</Text>
        </View>

        {/* Add admin input */}
        {addMode && isOwner && (
          <View style={s.addBox}>
            <TextInput
              style={s.addInput}
              placeholder="Masukkan username..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <TouchableOpacity style={s.addConfirmBtn} onPress={handleAdd} activeOpacity={0.8} disabled={adding}>
              {adding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.addConfirmText}>Tambah</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Rules hint */}
        <View style={s.hint}>
          <MaterialCommunityIcons name="information-outline" size={13} color="rgba(255,255,255,0.3)" />
          <Text style={s.hintText}>Admin dapat membisukan user selama 5 menit di ruang siaran</Text>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#7C3AED" size="large" />
          </View>
        ) : (
          <FlatList
            data={admins}
            keyExtractor={i => i.user_id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7C3AED" />
            }
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="shield-account-outline" size={44} color="rgba(255,255,255,0.15)" />
                <Text style={s.emptyText}>Belum ada admin ruangan</Text>
                {isOwner && (
                  <Text style={s.emptySubText}>Tap ikon + di atas untuk menambah admin</Text>
                )}
              </View>
            }
            contentContainerStyle={admins.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 8 }}
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
                  <View style={s.adminBadge}>
                    <MaterialCommunityIcons name="shield-check" size={10} color="#fff" />
                  </View>
                </View>
                <View style={s.info}>
                  <Text style={s.username}>@{item.username}</Text>
                  <Text style={s.sub}>Admin ruangan</Text>
                </View>
                {isOwner && (
                  <TouchableOpacity
                    style={s.removeBtn}
                    onPress={() => handleRemove(item)}
                    activeOpacity={0.7}
                    disabled={actionId === item.user_id}
                  >
                    {actionId === item.user_id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <MaterialCommunityIcons name="account-minus-outline" size={20} color="#EF4444" />
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
    height: SH * 0.7,
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  slotBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  slot: {
    width: 28, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  slotFilled: { backgroundColor: '#7C3AED' },
  slotText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 4 },
  addBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  addInput: {
    flex: 1, color: '#fff', fontSize: 14, paddingVertical: 6,
  },
  addConfirmBtn: {
    backgroundColor: '#7C3AED', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, minWidth: 64, alignItems: 'center',
  },
  addConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 16, marginBottom: 4,
  },
  hintText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 8 },
  emptySubText: { color: 'rgba(255,255,255,0.2)', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avatarWrap: { marginRight: 12, position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  adminBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(14,14,22,0.96)',
  },
  info: { flex: 1 },
  username: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  removeBtn: {
    padding: 8, borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' },
});
