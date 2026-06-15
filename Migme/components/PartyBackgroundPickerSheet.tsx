import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

const { width: SW, height: SH } = Dimensions.get('window');

const THUMB_GAP  = 10;
const THUMB_COLS = 2;
const THUMB_W    = (SW - 32 - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS;
const THUMB_H    = THUMB_W * 1.52;

type Tab = 'rekomendasikan' | 'kustomisasi';

export interface BgOption {
  id: string;
  uri: string;
  label: string;
}

export const RECOMMENDED_BACKGROUNDS: BgOption[] = [
  {
    id: 'bg_lantern',
    label: 'Lentera Malam',
    uri: 'https://images.unsplash.com/photo-1519750157634-b6d493a0f77c?w=600&q=80',
  },
  {
    id: 'bg_city',
    label: 'Kota Malam',
    uri: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80',
  },
  {
    id: 'bg_sunset',
    label: 'Senja Kota',
    uri: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=600&q=80',
  },
  {
    id: 'bg_stars',
    label: 'Bintang Malam',
    uri: 'https://images.unsplash.com/photo-1475274047050-1d0c0975864c?w=600&q=80',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  currentBgUri?: string | null;
  onApply: (uri: string, isLocal: boolean) => void;
}

export default function PartyBackgroundPickerSheet({
  visible,
  onClose,
  currentBgUri,
  onApply,
}: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [tab, setTab]               = useState<Tab>('rekomendasikan');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customUri, setCustomUri]   = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const match = RECOMMENDED_BACKGROUNDS.find(b => b.uri === currentBgUri);
      setSelectedId(match ? match.id : currentBgUri ? '__custom__' : null);
      if (!match && currentBgUri) setCustomUri(currentBgUri);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity,  { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin diperlukan', 'Izin galeri diperlukan untuk memilih foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCustomUri(result.assets[0].uri);
      setSelectedId('__custom__');
    }
  };

  const handleApply = () => {
    if (!selectedId) return;
    if (selectedId === '__custom__' && customUri) {
      onApply(customUri, true);
    } else {
      const bg = RECOMMENDED_BACKGROUNDS.find(b => b.id === selectedId);
      if (bg) onApply(bg.uri, false);
    }
    onClose();
  };

  const canApply = !!selectedId && (selectedId !== '__custom__' || !!customUri);

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
          <Text style={st.headerTitle}>Latar Belakang</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={st.tabBar}>
          {(['rekomendasikan', 'kustomisasi'] as Tab[]).map(t => {
            const active = tab === t;
            const label  = t === 'rekomendasikan' ? 'Rekomendasikan' : 'Kustomisasi';
            return (
              <TouchableOpacity
                key={t}
                style={st.tabBtn}
                onPress={() => setTab(t)}
                activeOpacity={0.75}
              >
                <Text style={[st.tabText, active && st.tabTextActive]}>{label}</Text>
                {active && <View style={st.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>

          {tab === 'rekomendasikan' ? (
            <View style={st.grid}>
              {RECOMMENDED_BACKGROUNDS.map(bg => {
                const isSelected = selectedId === bg.id;
                return (
                  <TouchableOpacity
                    key={bg.id}
                    style={[st.thumb, isSelected && st.thumbSelected]}
                    activeOpacity={0.82}
                    onPress={() => setSelectedId(bg.id)}
                  >
                    <Image source={{ uri: bg.uri }} style={st.thumbImg} resizeMode="cover" />
                    {isSelected && (
                      <View style={st.checkOverlay}>
                        <View style={st.checkCircle}>
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        </View>
                      </View>
                    )}
                    <View style={st.thumbLabel}>
                      <Text style={st.thumbLabelText} numberOfLines={1}>{bg.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={st.customTab}>
              {customUri ? (
                <View style={st.customPreviewWrap}>
                  <Image source={{ uri: customUri }} style={st.customPreview} resizeMode="cover" />
                  <TouchableOpacity
                    style={st.customChangeBtn}
                    onPress={pickFromGallery}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="image-edit-outline" size={16} color="#fff" />
                    <Text style={st.customChangeBtnText}>Ganti Foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={st.uploadBtn} onPress={pickFromGallery} activeOpacity={0.8}>
                  <View style={st.uploadIconWrap}>
                    <MaterialCommunityIcons name="image-plus" size={36} color="rgba(255,255,255,0.5)" />
                  </View>
                  <Text style={st.uploadText}>Upload dari Galeri</Text>
                  <Text style={st.uploadSub}>Pilih foto dari penyimpanan lokal</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        {/* Apply button */}
        <View style={st.footer}>
          <TouchableOpacity
            style={[st.applyBtn, !canApply && st.applyBtnDisabled]}
            onPress={handleApply}
            disabled={!canApply}
            activeOpacity={0.85}
          >
            <Text style={st.applyBtnText}>Terapkan</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(12,12,20,0.93)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: SH * 0.82,
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 28,
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  tabBtn: {
    marginRight: 24,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#F59E0B',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THUMB_GAP,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbSelected: {
    borderColor: '#F59E0B',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 8,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  thumbLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  customTab: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  uploadIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },
  uploadSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  customPreviewWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  customPreview: {
    width: '100%',
    height: 240,
    borderRadius: 16,
  },
  customChangeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  customChangeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  applyBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
