import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPartyRoomLock } from '../services/partyService';

const { width: SW } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'set' | 'enter';
  roomId: string;
  isCurrentlyLocked?: boolean;
  onLockChanged?: (isLocked: boolean) => void;
  onPasswordVerified?: (password: string) => void;
}

export default function PartyLockPasswordModal({
  visible,
  onClose,
  mode,
  roomId,
  isCurrentlyLocked = false,
  onLockChanged,
  onPasswordVerified,
}: Props) {
  const insets   = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const inputRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  const [digits, setDigits] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setDigits(['', '', '', '']);
      setErrorMsg('');
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 82, friction: 12 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => inputRefs[0].current?.focus(), 100);
      });
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.88, duration: 180, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const pinComplete = digits.every(d => d.length === 1);
  const pinValue    = digits.join('');

  const handleDigit = (index: number, val: string) => {
    if (val.length > 1) val = val.slice(-1);
    if (val && !/^\d$/.test(val)) return;
    const next = [...digits];
    next[index] = val;
    setDigits(next);
    setErrorMsg('');
    if (val && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleConfirm = async () => {
    if (!pinComplete) { setErrorMsg('Masukkan 4 digit angka'); return; }
    setLoading(true);
    setErrorMsg('');

    if (mode === 'set') {
      const result = await setPartyRoomLock(roomId, pinValue);
      setLoading(false);
      if (result.ok) {
        onLockChanged?.(result.isLocked ?? true);
        onClose();
      } else {
        setErrorMsg(result.error || 'Gagal mengatur kata sandi');
      }
    } else {
      setLoading(false);
      onPasswordVerified?.(pinValue);
    }
  };

  const handleClearLock = async () => {
    setLoading(true);
    const result = await setPartyRoomLock(roomId, null);
    setLoading(false);
    if (result.ok) {
      onLockChanged?.(false);
      onClose();
    } else {
      setErrorMsg(result.error || 'Gagal menghapus kata sandi');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={s.centeredWrap} pointerEvents="box-none">
        <Animated.View style={[
          s.card,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24 },
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}>

          {/* Icon + Title */}
          <View style={s.iconWrap}>
            <MaterialCommunityIcons
              name={isCurrentlyLocked && mode === 'set' ? 'lock' : 'lock-outline'}
              size={28}
              color="#F59E0B"
            />
          </View>
          <Text style={s.title}>
            {mode === 'set'
              ? (isCurrentlyLocked ? 'Ubah kata sandi' : 'Atur kata sandi')
              : 'Masukkan kata sandi'}
          </Text>

          {/* 4-digit PIN boxes */}
          <View style={s.pinRow}>
            {digits.map((d, i) => (
              <View key={i} style={[s.pinBox, d ? s.pinBoxFilled : null]}>
                <TextInput
                  ref={inputRefs[i]}
                  style={s.pinInput}
                  value={d}
                  onChangeText={val => handleDigit(i, val)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={1}
                  secureTextEntry
                  selectionColor="#7C3AED"
                  caretHidden
                />
                {!d && <View style={s.pinPlaceholder} />}
              </View>
            ))}
          </View>

          {/* Error */}
          {errorMsg ? (
            <Text style={s.errorText}>{errorMsg}</Text>
          ) : (
            <Text style={s.tipText}>
              {mode === 'set'
                ? 'tips: siaran di lock room tidak terhitung target durasi'
                : 'Masukkan 4 digit kata sandi untuk masuk'}
            </Text>
          )}

          {/* Confirm button */}
          <TouchableOpacity
            style={[s.btnConfirm, (!pinComplete || loading) && s.btnDisabled]}
            activeOpacity={0.8}
            onPress={handleConfirm}
            disabled={loading || !pinComplete}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnConfirmText}>
                  {mode === 'set' ? 'Konfirmasi kata sandi' : 'Konfirmasi'}
                </Text>
            }
          </TouchableOpacity>

          {/* Clear / Cancel button */}
          {mode === 'set' ? (
            <TouchableOpacity
              style={s.btnClear}
              activeOpacity={0.7}
              onPress={isCurrentlyLocked ? handleClearLock : onClose}
              disabled={loading}
            >
              <Text style={s.btnClearText}>
                {isCurrentlyLocked ? 'Tidak mengatur kata sandi' : 'Batal'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.btnClear} activeOpacity={0.7} onPress={onClose}>
              <Text style={s.btnClearText}>Batal</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  centeredWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: Math.min(SW - 48, 360),
    backgroundColor: 'rgba(14,14,24,0.97)',
    borderRadius: 22,
    paddingTop: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 32,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 22,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  pinRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  pinBox: {
    width: 56,
    height: 60,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinBoxFilled: {
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  pinInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    backgroundColor: 'transparent',
    padding: 0,
  },
  pinPlaceholder: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tipText: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 18,
    fontWeight: '600',
  },
  btnConfirm: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  btnClear: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  btnClearText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.1,
  },
});
