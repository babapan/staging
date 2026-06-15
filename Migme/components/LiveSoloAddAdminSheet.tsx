import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLiveAdmins, addLiveAdmin, removeLiveAdmin } from '../services/liveService';
import type { LiveAdmin } from '../services/liveService';

const { height: SH } = Dimensions.get('window');

const PINK  = '#FF6B9D';
const GOLD  = '#FFB800';

interface Props {
  visible:    boolean;
  onClose:    () => void;
  streamId:   string;
  onAdminsChanged?: (usernames: string[]) => void;
}

export default function LiveSoloAddAdminSheet({ visible, onClose, streamId, onAdminsChanged }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [admins,    setAdmins]    = useState<LiveAdmin[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [input,     setInput]     = useState('');
  const [adding,    setAdding]    = useState(false);
  const [removingU, setRemovingU] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      load();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,  duration: 180, useNativeDriver: true }),
      ]).start();
      setInput('');
      setError(null);
    }
  }, [visible]);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getLiveAdmins(streamId);
    setAdmins(list);
    onAdminsChanged?.(list.map(a => a.username));
    setLoading(false);
  }, [streamId]);

  const handleAdd = async () => {
    const u = input.trim();
    if (!u) return;
    Keyboard.dismiss();
    setAdding(true);
    setError(null);
    const result = await addLiveAdmin(streamId, u);
    setAdding(false);
    if (!result.ok) {
      setError(result.message ?? 'Gagal menambah admin');
      return;
    }
    setInput('');
    const updated = await getLiveAdmins(streamId);
    setAdmins(updated);
    onAdminsChanged?.(updated.map(a => a.username));
  };

  const handleRemove = (admin: LiveAdmin) => {
    Alert.alert(
      'Hapus Admin',
      `Hapus ${admin.displayName ?? admin.username} dari admin live?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setRemovingU(admin.username);
            const result = await removeLiveAdmin(streamId, admin.username);
            setRemovingU(null);
            if (result.ok) {
              const updated = admins.filter(a => a.username !== admin.username);
              setAdmins(updated);
              onAdminsChanged?.(updated.map(a => a.username));
            } else {
              Alert.alert('Gagal', result.message ?? 'Tidak dapat hapus admin');
            }
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

      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 12, transform: [{ translateY: slideAnim }] }]}>
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <MaterialCommunityIcons name="shield-account" size={18} color={GOLD} />
            <Text style={s.headerTitle}>Admin Live</Text>
            {admins.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countTxt}>{admins.length}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={load} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <Text style={s.subtitle}>Admin dapat membantu moderasi chat di live kamu</Text>

        {/* Input row */}
        <View style={s.inputRow}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder="Masukkan username / ID"
            placeholderTextColor="rgba(255,255,255,0.28)"
            value={input}
            onChangeText={t => { setInput(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            editable={!adding}
          />
          <TouchableOpacity
            style={[s.addBtn, (!input.trim() || adding) && s.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!input.trim() || adding}
            activeOpacity={0.8}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.addBtnTxt}>Tambah</Text>
            )}
          </TouchableOpacity>
        </View>

        {error && (
          <Text style={s.errorTxt}>{error}</Text>
        )}

        {/* Admin list */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={GOLD} size="large" />
          </View>
        ) : (
          <FlatList
            data={admins}
            keyExtractor={a => a.username}
            ListEmptyComponent={
              <View style={s.center}>
                <MaterialCommunityIcons name="shield-off-outline" size={42} color="rgba(255,255,255,0.1)" />
                <Text style={s.emptyTxt}>Belum ada admin{'\n'}Tambahkan username di atas</Text>
              </View>
            }
            contentContainerStyle={admins.length === 0 ? { flex: 1 } : { paddingHorizontal: 16, paddingTop: 8 }}
            ItemSeparatorComponent={() => <View style={s.divider} />}
            renderItem={({ item }) => (
              <AdminRow
                admin={item}
                removing={removingU === item.username}
                onRemove={() => handleRemove(item)}
              />
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

function AdminRow({ admin, removing, onRemove }: { admin: LiveAdmin; removing: boolean; onRemove: () => void }) {
  const initials = (admin.displayName ?? admin.username).charAt(0).toUpperCase();
  const colorMap: Record<string, string> = {
    A:'#FF6B9D', B:'#FF9F43', C:'#26C6DA', D:'#A855F7',
    E:'#10B981', F:'#F59E0B', G:'#EF4444', H:'#3B82F6',
  };
  const col = colorMap[initials] ?? GOLD;

  return (
    <View style={s.row}>
      <View style={s.avatarWrap}>
        {admin.avatarUrl ? (
          <Image source={{ uri: admin.avatarUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFb, { backgroundColor: col + '33' }]}>
            <Text style={[s.avatarInit, { color: col }]}>{initials}</Text>
          </View>
        )}
        <View style={s.starDot}>
          <Text style={{ fontSize: 8, lineHeight: 12 }}>⭐</Text>
        </View>
      </View>

      <View style={s.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={s.displayName} numberOfLines={1}>{admin.displayName ?? admin.username}</Text>
          <View style={s.adminStarBadge}>
            <Text style={s.adminStarTxt}>⭐ Admin</Text>
          </View>
        </View>
        <Text style={s.username} numberOfLines={1}>@{admin.username}</Text>
      </View>

      <TouchableOpacity
        style={s.removeBtn}
        onPress={onRemove}
        activeOpacity={0.75}
        disabled={removing}
      >
        {removing ? (
          <ActivityIndicator size="small" color="#FF4D6D" style={{ transform: [{ scale: 0.75 }] }} />
        ) : (
          <>
            <MaterialCommunityIcons name="shield-remove-outline" size={13} color="#FF4D6D" />
            <Text style={s.removeTxt}>Hapus</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(8,6,18,0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SH * 0.65,
    borderTopWidth: 1,
    borderColor: 'rgba(255,184,0,0.12)',
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  countBadge: {
    backgroundColor: 'rgba(255,184,0,0.16)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.35)',
  },
  countTxt: { fontSize: 11, fontWeight: '700', color: GOLD },
  subtitle: {
    fontSize: 12, color: 'rgba(255,255,255,0.38)',
    paddingHorizontal: 16, marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginBottom: 6,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 78,
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnTxt: { color: '#1A1000', fontSize: 14, fontWeight: '700' },
  errorTxt: {
    color: '#FF6B9D', fontSize: 12,
    paddingHorizontal: 16, marginBottom: 6,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: {
    color: 'rgba(255,255,255,0.28)', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.05)' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatarWrap: { marginRight: 12, position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFb: { alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 17, fontWeight: '800' },
  starDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(8,6,18,0.9)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.4)',
  },
  info: { flex: 1 },
  displayName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  username: { color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 1 },
  adminStarBadge: {
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderRadius: 100, paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.35)',
  },
  adminStarTxt: { fontSize: 9, fontWeight: '700', color: GOLD },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,77,109,0.45)',
    backgroundColor: 'rgba(255,77,109,0.08)',
    minWidth: 58, justifyContent: 'center',
  },
  removeTxt: { color: '#FF4D6D', fontSize: 12, fontWeight: '600' },
});
