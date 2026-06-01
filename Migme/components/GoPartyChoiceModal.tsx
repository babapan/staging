import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectParty: () => void;
  onSelectLiveSolo: () => void;
}

export default function GoPartyChoiceModal({ visible, onClose, onSelectParty, onSelectLiveSolo }: Props) {
  const slideY   = useRef(new Animated.Value(300)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY,    { toValue: 0,   useNativeDriver: true, tension: 65, friction: 10 }),
        Animated.timing(bgOpacity, { toValue: 1,   duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,    { toValue: 300, duration: 200, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[st.backdrop, { opacity: bgOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[st.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* Handle bar */}
        <View style={st.handle} />

        <Text style={st.title}>Pilih Mode Live</Text>
        <Text style={st.subtitle}>Mau ngapain hari ini?</Text>

        {/* ── Party Option ── */}
        <TouchableOpacity style={st.cardWrap} onPress={onSelectParty} activeOpacity={0.88}>
          <LinearGradient
            colors={['#7C3AED', '#9333EA', '#A855F7']}
            style={st.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={st.iconCircle}>
              <MaterialCommunityIcons name="microphone-plus" size={30} color="#fff" />
            </View>
            <View style={st.cardText}>
              <Text style={st.cardTitle}>Party</Text>
              <Text style={st.cardDesc}>Audio room seru buat semua</Text>
              <View style={st.tagRow}>
                <View style={[st.tag, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Ionicons name="people" size={11} color="#fff" />
                  <Text style={st.tagTxt}>Semua host</Text>
                </View>
                <View style={[st.tag, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <MaterialCommunityIcons name="microphone" size={11} color="#fff" />
                  <Text style={st.tagTxt}>Audio</Text>
                </View>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Live Solo Option ── */}
        <TouchableOpacity style={st.cardWrap} onPress={onSelectLiveSolo} activeOpacity={0.88}>
          <LinearGradient
            colors={['#BE185D', '#EC4899', '#F472B6']}
            style={st.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={[st.iconCircle, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <MaterialCommunityIcons name="video-plus" size={30} color="#fff" />
            </View>
            <View style={st.cardText}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.cardTitle}>Live Solo</Text>
                <View style={st.newBadge}>
                  <Text style={st.newBadgeTxt}>NEW</Text>
                </View>
              </View>
              <Text style={st.cardDesc}>Streaming solo, tampil langsung ke fans</Text>
              <View style={st.tagRow}>
                <View style={[st.tag, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Ionicons name="female" size={11} color="#fff" />
                  <Text style={st.tagTxt}>Host perempuan</Text>
                </View>
                <View style={[st.tag, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <MaterialCommunityIcons name="office-building" size={11} color="#fff" />
                  <Text style={st.tagTxt}>Agency</Text>
                </View>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} style={st.cancelBtn} activeOpacity={0.7}>
          <Text style={st.cancelTxt}>Batal</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A2E',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'center',
    marginBottom: 20,
  },
  cardWrap: {
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderRadius: 18,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  cardDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagTxt: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  newBadge: {
    backgroundColor: '#FDE047',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.4)',
  },
});
