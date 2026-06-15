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
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SH } = Dimensions.get('window');

interface SettingsItem {
  key: string;
  label: string;
  icon: string;
  iconFamily: 'mci' | 'mi';
  hasToggle?: boolean;
  toggleKey?: string;
  onPress?: () => void;
}

interface Section {
  title: string;
  items: SettingsItem[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  roomName: string;
  onOpenRoomManagement?: () => void;
  onOpenMusicPicker?: () => void;
  onOpenMemberManagement?: () => void;
  onOpenLock?: () => void;
  onToggleLock?: (val: boolean) => void;
  isLocked?: boolean;
  onToggleFreeSeat?: (val: boolean) => void;
  isFreeSeat?: boolean;
  onOpenMode?: () => void;
  onToggleFreeMic?: () => void;
  isMicMuted?: boolean;
  onOpenInvite?: () => void;
  onToggleMuteRoom?: (val: boolean) => void;
  isMuteRoom?: boolean;
}

export default function PartyRoomSettingsSheet({
  visible,
  onClose,
  isOwner,
  roomName,
  onOpenRoomManagement,
  onOpenMusicPicker,
  onOpenMemberManagement,
  onOpenLock,
  onToggleLock,
  isLocked = false,
  onToggleFreeSeat,
  isFreeSeat = true,
  onOpenMode,
  onToggleFreeMic,
  isMicMuted = false,
  onOpenInvite,
  onToggleMuteRoom,
  isMuteRoom = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [toggles, setToggles] = useState<Record<string, boolean>>({
    aktifkan: true,
    efekHadiah: true,
    efekSuara: true,
    efekMasuk: true,
    lock: isLocked,
    freeSeat: isFreeSeat,
    muteRoom: isMuteRoom,
  });

  useEffect(() => {
    setToggles(prev => ({ ...prev, lock: isLocked }));
  }, [isLocked]);

  useEffect(() => {
    setToggles(prev => ({ ...prev, freeSeat: isFreeSeat }));
  }, [isFreeSeat]);

  useEffect(() => {
    setToggles(prev => ({ ...prev, muteRoom: isMuteRoom }));
  }, [isMuteRoom]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 14,
        }),
        Animated.timing(bgOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const flipToggle = (key: string) => {
    const next = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: next }));
    if (key === 'lock') onToggleLock?.(next);
    if (key === 'freeSeat') onToggleFreeSeat?.(next);
    if (key === 'muteRoom') onToggleMuteRoom?.(next);
  };

  const SECTIONS: Section[] = [
    {
      title: 'Manajemen Ruangan',
      items: [
        { key: 'manajemen', label: 'Manajemen\nRuangan', icon: 'home-edit-outline', iconFamily: 'mci', onPress: onOpenRoomManagement },
        { key: 'musik', label: 'Musik', icon: 'music-note', iconFamily: 'mci', onPress: onOpenMusicPicker },
        { key: 'mikrofon', label: 'Mikrofon\nbebas', icon: isMicMuted ? 'microphone-off' : 'microphone', iconFamily: 'mci', onPress: onToggleFreeMic },
        { key: 'anggota', label: 'Pengelolaan\nanggota', icon: 'account-multiple-outline', iconFamily: 'mci', onPress: onOpenMemberManagement },
        { key: 'lock', label: 'Lock', icon: 'lock-outline', iconFamily: 'mci', hasToggle: false, onPress: isOwner ? onOpenLock : undefined },
        { key: 'moderoom', label: 'Mode Room', icon: 'microphone-settings', iconFamily: 'mci', onPress: isOwner ? onOpenMode : undefined },
        { key: 'freeSeat', label: 'Kursi\nBebas', icon: 'account-plus-outline', iconFamily: 'mci', hasToggle: false },
        { key: 'muteRoom', label: 'Mute\nRoom', icon: 'volume-off', iconFamily: 'mci', hasToggle: false },
      ],
    },
    {
      title: 'Alat Ruangan',
      items: [
        { key: 'pengumuman', label: 'Pengumuman', icon: 'bullhorn-outline', iconFamily: 'mci' },
        { key: 'aktifkan', label: 'Aktifkan', icon: 'toggle-switch-outline', iconFamily: 'mci', hasToggle: true, toggleKey: 'aktifkan' },
        { key: 'undang', label: 'Undang', icon: 'account-voice', iconFamily: 'mci', onPress: onOpenInvite },
        { key: 'efekHadiah', label: 'Efek hadiah', icon: 'gift-outline', iconFamily: 'mci', hasToggle: true, toggleKey: 'efekHadiah' },
        { key: 'efekSuara', label: 'Efek suara', icon: 'music-circle-outline', iconFamily: 'mci', hasToggle: true, toggleKey: 'efekSuara' },
        { key: 'efekMasuk', label: 'Efek masuk', icon: 'car-outline', iconFamily: 'mci', hasToggle: true, toggleKey: 'efekMasuk' },
        { key: 'hitung', label: 'Hitung\nMundur', icon: 'timer-outline', iconFamily: 'mci' },
      ],
    },
    {
      title: 'Cara bermain',
      items: [
        { key: 'luckyBag', label: 'Lucky Bag', icon: 'bag-personal-outline', iconFamily: 'mci' },
      ],
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dim overlay */}
      <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 12, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Room name header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{roomName}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {SECTIONS.map((section, si) => (
            <View key={si} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.itemsGrid}>
                {section.items.map(item => (
                  <View key={item.key} style={styles.itemWrap}>
                    <TouchableOpacity
                      style={[
                        styles.iconCircle,
                        item.key === 'freeSeat' && !toggles.freeSeat && styles.iconCircleLocked,
                        item.key === 'mikrofon' && isMicMuted && styles.iconCircleMuted,
                        item.key === 'muteRoom' && toggles.muteRoom && styles.iconCircleMuted,
                      ]}
                      activeOpacity={0.75}
                      onPress={item.onPress ?? (() => {})}
                    >
                      {/* Toggle indicator dot on top-right */}
                      {item.hasToggle && item.toggleKey && (
                        <View style={[
                          styles.toggleDot,
                          { backgroundColor: toggles[item.toggleKey] ? '#22C55E' : '#6B7280' },
                        ]} />
                      )}

                      {/* Free seat ON indicator dot */}
                      {item.key === 'freeSeat' && (
                        <View style={[
                          styles.toggleDot,
                          { backgroundColor: toggles.freeSeat ? '#22C55E' : '#EF4444' },
                        ]} />
                      )}

                      {/* Mute room indicator dot */}
                      {item.key === 'muteRoom' && (
                        <View style={[
                          styles.toggleDot,
                          { backgroundColor: toggles.muteRoom ? '#EF4444' : '#22C55E' },
                        ]} />
                      )}

                      {/* Mikrofon mute indicator dot */}
                      {item.key === 'mikrofon' && (
                        <View style={[
                          styles.toggleDot,
                          { backgroundColor: isMicMuted ? '#EF4444' : '#22C55E' },
                        ]} />
                      )}

                      {/* Lock icon shows lock/unlock based on state */}
                      {item.key === 'lock' ? (
                        <MaterialCommunityIcons
                          name={toggles.lock ? 'lock' : 'lock-open-outline'}
                          size={22}
                          color="rgba(255,255,255,0.88)"
                        />
                      ) : item.key === 'freeSeat' ? (
                        <MaterialCommunityIcons
                          name={toggles.freeSeat ? 'account-plus-outline' : 'account-lock-outline'}
                          size={22}
                          color={toggles.freeSeat ? 'rgba(255,255,255,0.88)' : '#F87171'}
                        />
                      ) : item.key === 'muteRoom' ? (
                        <MaterialCommunityIcons
                          name={toggles.muteRoom ? 'volume-off' : 'volume-high'}
                          size={22}
                          color={toggles.muteRoom ? '#F87171' : 'rgba(255,255,255,0.88)'}
                        />
                      ) : item.key === 'mikrofon' ? (
                        <MaterialCommunityIcons
                          name={isMicMuted ? 'microphone-off' : 'microphone'}
                          size={22}
                          color={isMicMuted ? '#F87171' : '#22C55E'}
                        />
                      ) : item.iconFamily === 'mci' ? (
                        <MaterialCommunityIcons
                          name={item.icon as any}
                          size={22}
                          color="rgba(255,255,255,0.88)"
                        />
                      ) : (
                        <MaterialIcons
                          name={item.icon as any}
                          size={22}
                          color="rgba(255,255,255,0.88)"
                        />
                      )}
                    </TouchableOpacity>

                    {/* Toggle switch below icon for toggle items */}
                    {item.hasToggle && item.toggleKey ? (
                      <TouchableOpacity onPress={() => flipToggle(item.toggleKey!)} activeOpacity={0.8}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Switch
                          value={toggles[item.toggleKey]}
                          onValueChange={() => flipToggle(item.toggleKey!)}
                          trackColor={{ false: '#374151', true: '#22C55E' }}
                          thumbColor="#fff"
                          style={styles.miniSwitch}
                        />
                      </TouchableOpacity>
                    ) : item.key === 'lock' ? (
                      <TouchableOpacity onPress={() => flipToggle('lock')} activeOpacity={0.8}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Switch
                          value={toggles.lock}
                          onValueChange={() => flipToggle('lock')}
                          trackColor={{ false: '#374151', true: '#22C55E' }}
                          thumbColor="#fff"
                          style={styles.miniSwitch}
                        />
                      </TouchableOpacity>
                    ) : item.key === 'freeSeat' ? (
                      <TouchableOpacity onPress={() => flipToggle('freeSeat')} activeOpacity={0.8}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Switch
                          value={toggles.freeSeat}
                          onValueChange={() => flipToggle('freeSeat')}
                          trackColor={{ false: '#EF4444', true: '#22C55E' }}
                          thumbColor="#fff"
                          style={styles.miniSwitch}
                        />
                      </TouchableOpacity>
                    ) : item.key === 'muteRoom' ? (
                      <TouchableOpacity onPress={() => flipToggle('muteRoom')} activeOpacity={0.8}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Switch
                          value={toggles.muteRoom}
                          onValueChange={() => flipToggle('muteRoom')}
                          trackColor={{ false: '#22C55E', true: '#EF4444' }}
                          thumbColor="#fff"
                          style={styles.miniSwitch}
                        />
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.itemLabel}>{item.label}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const ICON_CIRCLE_SIZE = 54;
const ITEM_WIDTH = 72;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,10,18,0.92)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SH * 0.78,
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
    marginRight: 10,
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemWrap: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    marginBottom: 6,
  },
  iconCircle: {
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: ICON_CIRCLE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    marginBottom: 5,
    position: 'relative',
  },
  iconCircleLocked: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  iconCircleMuted: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  toggleDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  itemLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.1,
  },
  miniSwitch: {
    transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }],
    alignSelf: 'center',
    marginTop: 1,
  },
});
