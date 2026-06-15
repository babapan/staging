import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PartyBackgroundPickerSheet    from './PartyBackgroundPickerSheet';
import PartyMemberManagementSheet    from './PartyMemberManagementSheet';

const { height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  roomDescription?: string | null;
  isOwner: boolean;
  currentBgUri?: string | null;
  onSaveName?: (name: string) => Promise<boolean>;
  onSaveAnnouncement?: (text: string) => Promise<boolean>;
  onBgChange?: (uri: string, isLocal: boolean) => void;
  onOpenMusicPicker?: () => void;
}

export default function PartyRoomManagementSheet({
  visible,
  onClose,
  roomId,
  roomName,
  roomDescription,
  isOwner,
  currentBgUri,
  onSaveName,
  onSaveAnnouncement,
  onBgChange,
  onOpenMusicPicker,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [editingName, setEditingName]               = useState(false);
  const [nameValue, setNameValue]                   = useState(roomName);
  const [nameSaving, setNameSaving]                 = useState(false);

  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcement, setAnnouncement]               = useState(roomDescription ?? '');
  const [announceSaving, setAnnounceSaving]           = useState(false);

  const [freeMic, setFreeMic]                   = useState(false);
  const [bgPickerVisible,          setBgPickerVisible]          = useState(false);
  const [memberMgmtVisible,        setMemberMgmtVisible]        = useState(false);

  useEffect(() => {
    setNameValue(roomName);
  }, [roomName]);

  useEffect(() => {
    setAnnouncement(roomDescription ?? '');
  }, [roomDescription]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0, useNativeDriver: true, tension: 82, friction: 14,
        }),
        Animated.timing(bgOpacity, {
          toValue: 1, duration: 240, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SH, duration: 220, useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0, duration: 180, useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { Alert.alert('', 'Nama tidak boleh kosong'); return; }
    if (trimmed.length > 60) { Alert.alert('', 'Maksimal 60 karakter'); return; }
    setNameSaving(true);
    const ok = await onSaveName?.(trimmed);
    setNameSaving(false);
    if (ok) setEditingName(false);
    else Alert.alert('Gagal', 'Tidak bisa menyimpan nama');
  };

  const saveAnnouncement = async () => {
    setAnnounceSaving(true);
    const ok = await onSaveAnnouncement?.(announcement.trim());
    setAnnounceSaving(false);
    if (ok) setEditingAnnouncement(false);
    else Alert.alert('Gagal', 'Tidak bisa menyimpan pengumuman');
  };

  const NAV_ITEMS = [
    { key: 'bg',      label: 'latar belakang',     onPress: () => setBgPickerVisible(true) },
    { key: 'musik',   label: 'musik',               onPress: () => { onClose(); setTimeout(() => onOpenMusicPicker?.(), 320); } },
    { key: 'anggota', label: 'pengelolaan anggota', onPress: () => setMemberMgmtVisible(true) },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[st.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[st.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}>
        <View style={st.handle} />

        {/* Header */}
        <View style={st.header}>
          <Text style={st.headerTitle}>Manajemen Ruangan</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Nama Ruangan ── */}
          <View style={st.fieldLabel}>
            <Text style={st.fieldLabelText}>Nama Ruangan</Text>
          </View>
          <View style={st.fieldCard}>
            {editingName ? (
              <View style={st.fieldRow}>
                <TextInput
                  style={st.fieldInput}
                  value={nameValue}
                  onChangeText={setNameValue}
                  autoFocus
                  maxLength={60}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  selectionColor="#7C3AED"
                />
                {nameSaving
                  ? <ActivityIndicator size="small" color="#7C3AED" style={{ marginLeft: 8 }} />
                  : (
                    <TouchableOpacity onPress={saveName} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="check" size={20} color="#7C3AED" />
                    </TouchableOpacity>
                  )
                }
              </View>
            ) : (
              <View style={st.fieldRow}>
                <Text style={st.fieldValue} numberOfLines={1}>{nameValue || roomName}</Text>
                {isOwner && (
                  <TouchableOpacity onPress={() => setEditingName(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="pencil-outline" size={18} color="rgba(255,255,255,0.45)" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ── Pengumuman ── */}
          <View style={st.fieldLabel}>
            <Text style={st.fieldLabelText}>Pengumuman</Text>
          </View>
          <View style={st.fieldCard}>
            {editingAnnouncement ? (
              <View style={[st.fieldRow, { alignItems: 'flex-start' }]}>
                <TextInput
                  style={[st.fieldInput, { flex: 1, minHeight: 56, textAlignVertical: 'top' }]}
                  value={announcement}
                  onChangeText={setAnnouncement}
                  autoFocus
                  multiline
                  maxLength={200}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  placeholder="Tulis pengumuman..."
                  selectionColor="#7C3AED"
                />
                {announceSaving
                  ? <ActivityIndicator size="small" color="#7C3AED" style={{ marginLeft: 8, marginTop: 2 }} />
                  : (
                    <TouchableOpacity onPress={saveAnnouncement} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8, marginTop: 2 }}>
                      <MaterialCommunityIcons name="check" size={20} color="#7C3AED" />
                    </TouchableOpacity>
                  )
                }
              </View>
            ) : (
              <View style={st.fieldRow}>
                <Text style={[st.fieldValue, { flex: 1, lineHeight: 20 }]} numberOfLines={3}>
                  {announcement || 'Belum ada pengumuman...'}
                </Text>
                {isOwner && (
                  <TouchableOpacity onPress={() => setEditingAnnouncement(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8, alignSelf: 'flex-start', marginTop: 2 }}>
                    <MaterialCommunityIcons name="pencil-outline" size={18} color="rgba(255,255,255,0.45)" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ── Manajemen Ruangan nav list ── */}
          <View style={st.fieldLabel}>
            <Text style={st.fieldLabelText}>Manajemen Ruangan</Text>
          </View>
          <View style={st.listCard}>
            {NAV_ITEMS.map((item, idx) => (
              <React.Fragment key={item.key}>
                <TouchableOpacity style={st.listRow} activeOpacity={0.7} onPress={item.onPress}>
                  <Text style={st.listRowText}>{item.label}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
                {idx < NAV_ITEMS.length - 1 && <View style={st.divider} />}
              </React.Fragment>
            ))}

            {/* Divider before toggle */}
            <View style={st.divider} />

            {/* Mikrofon bebas — toggle */}
            <View style={st.listRow}>
              <Text style={st.listRowText}>mikrofon bebas</Text>
              <Switch
                value={freeMic}
                onValueChange={setFreeMic}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#7C3AED' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={{ height: 12 }} />
        </ScrollView>
      </Animated.View>

      {/* Background Picker */}
      <PartyBackgroundPickerSheet
        visible={bgPickerVisible}
        onClose={() => setBgPickerVisible(false)}
        currentBgUri={currentBgUri}
        onApply={(uri, isLocal) => {
          onBgChange?.(uri, isLocal);
          setBgPickerVisible(false);
        }}
      />

      {/* Member Management */}
      <PartyMemberManagementSheet
        visible={memberMgmtVisible}
        onClose={() => setMemberMgmtVisible(false)}
        roomId={roomId}
        isOwner={isOwner}
      />
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(14,14,22,0.93)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SH * 0.82,
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 26,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  fieldLabel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  fieldLabelText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  fieldCard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    padding: 0,
    margin: 0,
  },
  listCard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  listRowText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.1,
  },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 16,
  },
});
