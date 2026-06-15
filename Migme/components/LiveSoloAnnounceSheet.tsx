import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SH } = Dimensions.get('window');

const TEAL  = '#00BCD4';
const CYAN  = '#006064';
const MAX_CHARS = 20;

interface Props {
  visible:              boolean;
  onClose:              () => void;
  onSend:               (text: string) => void;
  onClear?:             () => void;
  currentAnnouncement?: string | null;
}

export default function LiveSoloAnnounceSheet({ visible, onClose, onSend, onClear, currentAnnouncement }: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const inputRef  = useRef<TextInput>(null);

  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start(() => setTimeout(() => inputRef.current?.focus(), 100));
    } else {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0,  duration: 180, useNativeDriver: true }),
      ]).start(() => setText(''));
    }
  }, [visible, slideAnim, bgOpacity]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    onClose();
  };

  const handleClear = () => {
    onClear?.();
    onClose();
  };

  const isOverLimit = text.length > MAX_CHARS;
  const canSend     = text.trim().length > 0 && !isOverLimit;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.root}>
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: bgOpacity }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[s.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}
        >
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <LinearGradient
                colors={['#00BCD4', '#006064']}
                style={s.headerIcon}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="broadcast" size={22} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={s.headerTitle}>Pengumuman</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>
            Pesan akan tampil sebagai banner di room (maks. {MAX_CHARS} karakter)
          </Text>

          {/* Current active banner indicator */}
          {!!currentAnnouncement && (
            <View style={s.activeBannerRow}>
              <View style={s.activeDot} />
              <Text style={s.activeBannerLabel} numberOfLines={1}>
                Aktif: "{currentAnnouncement}"
              </Text>
              <TouchableOpacity onPress={handleClear} style={s.clearBtn} activeOpacity={0.75}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF6B6B" />
                <Text style={s.clearBtnText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={[s.inputWrap, isOverLimit && s.inputWrapError]}>
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder="Tulis pengumuman..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={text}
              onChangeText={setText}
              maxLength={MAX_CHARS}
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={handleSend}
            />
            <Text style={[s.charCount, isOverLimit && s.charCountError]}>
              {text.length}/{MAX_CHARS}
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, !canSend && s.submitBtnDisabled]}
            activeOpacity={0.82}
            onPress={handleSend}
            disabled={!canSend}
          >
            <LinearGradient
              colors={canSend ? [TEAL, CYAN] : ['#333', '#222']}
              style={s.submitGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons name="send" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={s.submitText}>Tampilkan Banner</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: 'rgba(8,6,18,0.97)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,188,212,0.18)',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIconWrap: { marginRight: 10 },
  headerIcon: {
    width: 36, height: 36,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17, fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 14,
    lineHeight: 17,
  },
  activeBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,100,100,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 6,
  },
  activeDot: {
    width: 7, height: 7,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
  activeBannerLabel: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,100,100,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrap: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,188,212,0.25)',
    borderRadius: 14,
    padding: 14,
    minHeight: 70,
    marginBottom: 8,
  },
  inputWrapError: {
    borderColor: 'rgba(255,80,80,0.5)',
  },
  input: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'right',
    marginTop: 6,
  },
  charCountError: {
    color: '#FF6060',
  },
  submitBtn: { marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.45 },
  submitGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  submitText: {
    color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3,
  },
});
