import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PartyMutedListSheet  from './PartyMutedListSheet';
import PartyKickListSheet   from './PartyKickListSheet';
import PartyRoomAdminSheet  from './PartyRoomAdminSheet';

const { height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  isOwner: boolean;
}

type SubScreen = 'muted' | 'kicked' | 'admin' | null;

export default function PartyMemberManagementSheet({ visible, onClose, roomId, isOwner }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [showRules,  setShowRules]  = useState(false);
  const [subScreen,  setSubScreen]  = useState<SubScreen>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity,  { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      setShowRules(false);
    }
  }, [visible]);

  const NAV = [
    {
      key: 'muted',
      label: 'daftar dibisukan',
      icon: 'microphone-off' as const,
      onPress: () => setSubScreen('muted'),
    },
    {
      key: 'kicked',
      label: 'daftar kick',
      icon: 'account-remove-outline' as const,
      onPress: () => setSubScreen('kicked'),
    },
    {
      key: 'admin',
      label: 'Pengelolaan ruang siaran',
      icon: 'shield-account-outline' as const,
      onPress: () => setSubScreen('admin'),
    },
  ];

  return (
    <>
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <Animated.View style={[s.overlay, { opacity: bgOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />

          {/* ── Main view ─────────────────────────────────────────── */}
          {!showRules ? (
            <>
              <View style={s.header}>
                <Text style={s.headerTitle}>pengelolaan anggota</Text>
                <TouchableOpacity
                  onPress={() => setShowRules(true)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons name="help-circle-outline" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              <View style={s.listCard}>
                {NAV.map((item, idx) => (
                  <React.Fragment key={item.key}>
                    <TouchableOpacity
                      style={s.navRow}
                      activeOpacity={0.7}
                      onPress={item.onPress}
                    >
                      <Text style={s.navLabel}>{item.label}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                    {idx < NAV.length - 1 && <View style={s.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </>
          ) : (
            /* ── Rules view ───────────────────────────────────────── */
            <>
              <View style={s.header}>
                <TouchableOpacity
                  onPress={() => setShowRules(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons name="arrow-left" size={22} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>keterangan peraturan</Text>
                <View style={{ width: 22 }} />
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.rulesContent} showsVerticalScrollIndicator={false}>
                <RuleItem num={1} text="Setiap host dapat mengatur hingga 5 administrator, dan jumlah tempat terbatas, jadi Anda harus berhati-hati saat mengaturnya~" />
                <RuleItem num={2} text="Administrator: Memiliki hak untuk membisukan user di ruang siaran, serta ID administrator eksklusif, atur administrator untuk orang-orang terdekat di ruang siaran, dan biarkan dia memiliki ikon eksklusif" />
                <RuleItem num={3} text="Kick: Pengguna yang dikick tidak dapat masuk kembali ke ruangan hingga owner atau admin mencabut status kick mereka" />
                <RuleItem num={4} text="Bisukan: Pengguna yang dibisukan tidak dapat berbicara dari kursi siaran manapun di ruangan ini" />
              </ScrollView>
            </>
          )}
        </Animated.View>
      </Modal>

      {/* Sub-screens (rendered outside main modal to stack properly) */}
      <PartyMutedListSheet
        visible={subScreen === 'muted'}
        onClose={() => setSubScreen(null)}
        roomId={roomId}
        isOwner={isOwner}
      />
      <PartyKickListSheet
        visible={subScreen === 'kicked'}
        onClose={() => setSubScreen(null)}
        roomId={roomId}
        isOwner={isOwner}
      />
      <PartyRoomAdminSheet
        visible={subScreen === 'admin'}
        onClose={() => setSubScreen(null)}
        roomId={roomId}
        isOwner={isOwner}
      />
    </>
  );
}

function RuleItem({ num, text }: { num: number; text: string }) {
  return (
    <View style={s.ruleRow}>
      <Text style={s.ruleNum}>{num}.</Text>
      <Text style={s.ruleText}>{text}</Text>
    </View>
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
    minHeight: SH * 0.42,
    maxHeight: SH * 0.75,
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
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  listCard: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 17,
  },
  navLabel: { fontSize: 15, color: '#fff' },
  divider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.07)', marginLeft: 16 },
  rulesContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 18 },
  ruleRow: { flexDirection: 'row', gap: 8 },
  ruleNum: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600', marginTop: 1 },
  ruleText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 21, flex: 1 },
});
