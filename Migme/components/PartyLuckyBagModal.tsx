/**
 * PartyLuckyBagModal.tsx
 *
 * Lucky Bag feature untuk Party Room — mirip Hongbao/Red Packet.
 * Tab 1 (Lucky Bag di Room): kirim ke satu room.
 * Tab 2 (Lucky Bag Dunia):   kirim ke SEMUA room secara global.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE, buildHeaders } from '../services/auth';

const COIN_OPTIONS       = [1000, 5000, 10000, 50000];
const COUNT_OPTIONS      = [5, 10, 20, 30];
const WORLD_COIN_OPTIONS = [100000, 500000, 1000000, 5000000];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000)      return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

interface Props {
  visible: boolean;
  roomId: string | null;
  roomName?: string;
  coinBalance: number | null;
  onClose: () => void;
  onSent: (newBalance: number) => void;
  onClaimed: (newBalance: number, coinEarned: number) => void;
}

export default function PartyLuckyBagModal({
  visible, roomId, roomName, coinBalance: coinBalanceProp, onClose, onSent, onClaimed,
}: Props) {
  const [tab,        setTab]        = useState<'room' | 'world'>('room');

  // ── Room tab state ─────────────────────────────────────────────────────────
  const [coinAmount, setCoinAmount] = useState(COIN_OPTIONS[0]);
  const [bagCount,   setBagCount]   = useState(COUNT_OPTIONS[0]);
  const [customCoin, setCustomCoin] = useState('');
  const [customBag,  setCustomBag]  = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [sending,    setSending]    = useState(false);

  // ── World tab state ────────────────────────────────────────────────────────
  const [worldCoin,        setWorldCoin]        = useState(WORLD_COIN_OPTIONS[0]);
  const [worldBagCount,    setWorldBagCount]    = useState(COUNT_OPTIONS[0]);
  const [worldCustomCoin,  setWorldCustomCoin]  = useState('');
  const [worldCustomBag,   setWorldCustomBag]   = useState('');
  const [worldShowCustom,  setWorldShowCustom]  = useState(false);
  const [worldSending,     setWorldSending]     = useState(false);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [localBalance, setLocalBalance] = useState<number | null>(null);
  const coinBalance = localBalance ?? coinBalanceProp;

  const slideAnim = useRef(new Animated.Value(600)).current;

  const fetchBalance = useCallback(async () => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/credit/balance/me`, { headers, credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setLocalBalance(Number(data.balance ?? 0));
    } catch {}
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 180 }).start();
      fetchBalance();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true, easing: Easing.in(Easing.quad) }).start();
    }
  }, [visible]);

  // ── Room send ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!roomId) return;
    const finalCoin = showCustom ? Number(customCoin) : coinAmount;
    const finalBag  = showCustom ? Number(customBag)  : bagCount;
    if (!finalCoin || finalCoin < 100) { Alert.alert('Info', 'Minimum coin 100'); return; }
    if (!finalBag  || finalBag < 1 || finalBag > 30) { Alert.alert('Info', 'Jumlah bag 1–30'); return; }
    if ((coinBalance ?? 0) < finalCoin) { Alert.alert('Saldo tidak cukup', `Saldo coin kamu: ${fmt(coinBalance ?? 0)}`); return; }
    setSending(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/rooms/${roomId}/lucky-bag/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coinAmount: finalCoin, bagCount: finalBag }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Gagal', data.error ?? 'Coba lagi'); return; }
      onSent(data.newBalance ?? 0);
      setLocalBalance(data.newBalance ?? 0);
      onClose();
    } catch { Alert.alert('Error', 'Coba lagi'); } finally { setSending(false); }
  };

  // ── World send ─────────────────────────────────────────────────────────────
  const handleWorldSend = async () => {
    const finalCoin = worldShowCustom ? Number(worldCustomCoin) : worldCoin;
    const finalBag  = worldShowCustom ? Number(worldCustomBag)  : worldBagCount;
    if (!finalCoin || finalCoin < 1000) { Alert.alert('Info', 'Minimum coin 1.000'); return; }
    if (!finalBag  || finalBag < 1 || finalBag > 30) { Alert.alert('Info', 'Jumlah bag 1–30'); return; }
    const fee = Math.ceil(finalCoin * 0.01);
    if ((coinBalance ?? 0) < finalCoin + fee) { Alert.alert('Saldo tidak cukup', `Saldo coin kamu: ${fmt(coinBalance ?? 0)}\nDibutuhkan: ${fmt(finalCoin + fee)} (termasuk biaya 1%)`); return; }
    setWorldSending(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/party/lucky-bag-global/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coinAmount: finalCoin, bagCount: finalBag, roomId: roomId ?? '', roomName: roomName ?? '' }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Gagal', data.error ?? 'Coba lagi'); return; }
      setLocalBalance(data.newBalance ?? 0);
      onSent(data.newBalance ?? 0);
      // close is called below
      onClose();
    } catch { Alert.alert('Error', 'Coba lagi'); } finally { setWorldSending(false); }
  };

  const effectiveCoin      = showCustom       ? Number(customCoin || 0)      : coinAmount;
  const effectiveBag       = showCustom       ? Number(customBag  || 0)      : bagCount;
  const worldEffectiveCoin = worldShowCustom  ? Number(worldCustomCoin || 0) : worldCoin;
  const worldEffectiveBag  = worldShowCustom  ? Number(worldCustomBag  || 0) : worldBagCount;
  const worldFee           = worldEffectiveCoin > 0 ? Math.ceil(worldEffectiveCoin * 0.01) : 0;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <Animated.View style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}>

        {/* Header */}
        <View style={st.header}>
          <View style={st.balRow}>
            <Text style={st.coinIcon}>🪙</Text>
            <Text style={st.balText}>{fmt(coinBalance ?? 0)}</Text>
          </View>
          <Text style={st.title}>Lucky Bag</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={st.tabs}>
          <TouchableOpacity style={[st.tab, tab === 'room' && st.tabActive]} onPress={() => setTab('room')}>
            <Text style={[st.tabTxt, tab === 'room' && st.tabTxtActive]}>Lucky Bag di Room</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.tab, tab === 'world' && st.tabActive]} onPress={() => setTab('world')}>
            <Text style={[st.tabTxt, tab === 'world' && st.tabTxtActive]}>Lucky Bag Dunia</Text>
          </TouchableOpacity>
        </View>

        {/* ── ROOM TAB ─────────────────────────────────────────────────────── */}
        {tab === 'room' ? (
          <ScrollView style={st.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={st.sectionLabel}>Jumlah koin emas yang dikirimkan:</Text>
            <Text style={st.sectionHint}>Setiap pengiriman Lucky Bag akan dikenakan biaya sebesar 1.0%</Text>
            {!showCustom && (
              <View style={st.optionRow}>
                {COIN_OPTIONS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[st.optionChip, coinAmount === c && st.optionChipActive]}
                    onPress={() => setCoinAmount(c)}
                  >
                    <Text style={[st.optionTxt, coinAmount === c && st.optionTxtActive]}>{fmt(c)} 🪙</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[st.sectionLabel, { marginTop: 16 }]}>Jumlah Lucky Bag</Text>
            {!showCustom && (
              <View style={[st.optionRow, { marginBottom: 4 }]}>
                {COUNT_OPTIONS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[st.countChip, bagCount === n && st.countChipActive]}
                    onPress={() => setBagCount(n)}
                  >
                    <Text style={[st.countTxt, bagCount === n && st.countTxtActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity onPress={() => setShowCustom(v => !v)} style={st.customToggle}>
              <Text style={st.customToggleTxt}>{showCustom ? '← Pakai pilihan cepat' : 'Lucky Bag Kustom'}</Text>
            </TouchableOpacity>
            {showCustom && (
              <View style={st.customRow}>
                <TextInput style={st.customInput} placeholder="Jumlah coin (min 100)" placeholderTextColor="#999"
                  keyboardType="number-pad" value={customCoin} onChangeText={setCustomCoin} />
                <TextInput style={st.customInput} placeholder="Jumlah bag (1–30)" placeholderTextColor="#999"
                  keyboardType="number-pad" value={customBag} onChangeText={setCustomBag} />
              </View>
            )}
            {effectiveCoin > 0 && effectiveBag > 0 && (
              <Text style={st.summary}>
                {effectiveCoin.toLocaleString()} coin dibagi ke {effectiveBag} orang — rata-rata {fmt(Math.floor(effectiveCoin / effectiveBag))} coin
              </Text>
            )}
            <TouchableOpacity style={[st.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={st.sendBtnTxt}>send</Text>}
            </TouchableOpacity>
            <Text style={st.footerNote}>Lucky Bag expired otomatis dalam 3 menit. Satu bag aktif per room.</Text>
            <View style={{ height: 24 }} />
          </ScrollView>

        ) : (
          /* ── WORLD TAB ──────────────────────────────────────────────────── */
          <ScrollView style={st.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* World banner */}
            <View style={st.worldBanner}>
              <Text style={st.worldBannerEmoji}>🌍</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.worldBannerTitle}>Lucky Bag Dunia</Text>
                <Text style={st.worldBannerSub}>Banner muncul di semua party room aktif</Text>
              </View>
            </View>

            <Text style={st.sectionLabel}>Jumlah koin emas yang dikirimkan:</Text>
            <Text style={st.sectionHint}>Biaya layanan 1% · Lucky Bag terbuka 2 menit setelah dikirim · Min 100.000 coin · Min 2.000 per bag</Text>
            {!worldShowCustom && (
              <View style={st.optionRow}>
                {WORLD_COIN_OPTIONS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[st.optionChip, st.worldChip, worldCoin === c && st.worldChipActive]}
                    onPress={() => setWorldCoin(c)}
                  >
                    <Text style={[st.optionTxt, worldCoin === c && st.worldTxtActive]}>{fmt(c)} 🪙</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[st.sectionLabel, { marginTop: 16 }]}>Jumlah Lucky Bag</Text>
            {!worldShowCustom && (
              <View style={[st.optionRow, { marginBottom: 4 }]}>
                {COUNT_OPTIONS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[st.countChip, st.worldCountChip, worldBagCount === n && st.worldCountChipActive]}
                    onPress={() => setWorldBagCount(n)}
                  >
                    <Text style={[st.countTxt, worldBagCount === n && st.worldCountTxtActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity onPress={() => setWorldShowCustom(v => !v)} style={st.customToggle}>
              <Text style={[st.customToggleTxt, { color: '#22C55E' }]}>
                {worldShowCustom ? '← Pakai pilihan cepat' : 'Lucky Bag Kustom'}
              </Text>
            </TouchableOpacity>
            {worldShowCustom && (
              <View style={st.customRow}>
                <TextInput style={[st.customInput, { borderColor: '#86EFAC' }]}
                  placeholder="Jumlah coin (min 100.000)" placeholderTextColor="#999"
                  keyboardType="number-pad" value={worldCustomCoin} onChangeText={setWorldCustomCoin} />
                <TextInput style={[st.customInput, { borderColor: '#86EFAC' }]}
                  placeholder="Jumlah bag (1–30)" placeholderTextColor="#999"
                  keyboardType="number-pad" value={worldCustomBag} onChangeText={setWorldCustomBag} />
              </View>
            )}

            {worldEffectiveCoin > 0 && worldEffectiveBag > 0 && (() => {
              const avgPerBag = Math.floor(worldEffectiveCoin / worldEffectiveBag);
              const minNeeded = worldEffectiveBag * 2000;
              const belowTotal = worldEffectiveCoin < 100000;
              const belowPerBag = !belowTotal && worldEffectiveCoin < minNeeded;
              const hasError = belowTotal || belowPerBag;
              return (
                <View style={[st.worldSummaryBox, hasError && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}>
                  <Text style={[st.worldSummaryLine, hasError && { color: '#DC2626' }]}>
                    {worldEffectiveCoin.toLocaleString()} coin ÷ {worldEffectiveBag} bag = rata-rata {fmt(avgPerBag)} coin
                  </Text>
                  {belowTotal ? (
                    <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: '600' }}>
                      ⚠ Minimum Lucky Bag Global adalah 100.000 coin
                    </Text>
                  ) : belowPerBag ? (
                    <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: '600' }}>
                      ⚠ Min {fmt(minNeeded)} coin untuk {worldEffectiveBag} bag (2.000 per bag)
                    </Text>
                  ) : (
                    <Text style={st.worldSummaryFee}>
                      Biaya layanan: {worldFee.toLocaleString()} coin · Total: {(worldEffectiveCoin + worldFee).toLocaleString()} coin
                    </Text>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[st.worldSendBtn, (worldSending || worldEffectiveCoin < 100000 || worldEffectiveCoin < worldEffectiveBag * 2000) && { opacity: 0.5 }]}
              onPress={handleWorldSend}
              disabled={worldSending || worldEffectiveCoin < 100000 || worldEffectiveCoin < worldEffectiveBag * 2000}
              activeOpacity={0.85}
            >
              {worldSending
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.sendBtnTxt}>🌍 Kirim ke Seluruh Room</Text>
              }
            </TouchableOpacity>

            <Text style={st.worldNote}>
              Lucky Bag Dunia akan muncul sebagai banner di semua room.{'\n'}
              Pemain bisa klaim 2 menit setelah kamu mengirim.
            </Text>

            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const PINK  = '#EC4899';
const GOLD  = '#F59E0B';
const GREEN = '#22C55E';

const st = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  balRow:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
  coinIcon:   { fontSize: 16, marginRight: 4 },
  balText:    { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  title:      { fontSize: 18, fontWeight: '700', color: '#1F2937', flex: 2, textAlign: 'center' },
  closeBtn:   { flex: 1, alignItems: 'flex-end', padding: 4 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginHorizontal: 20,
    marginTop: 8,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:    { borderBottomColor: PINK },
  tabTxt:       { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  tabTxtActive: { color: PINK },
  body:         { paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  sectionHint:  { fontSize: 12, color: '#9CA3AF', marginBottom: 12 },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  optionChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  optionChipActive: { backgroundColor: '#FFF0F7', borderColor: PINK },
  optionTxt:        { fontSize: 14, color: '#374151', fontWeight: '600' },
  optionTxtActive:  { color: PINK },
  countChip: {
    width: 54, height: 36, borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  countChipActive:  { backgroundColor: '#FFF0F7', borderColor: PINK },
  countTxt:         { fontSize: 15, fontWeight: '700', color: '#374151' },
  countTxtActive:   { color: PINK },
  customToggle:     { alignItems: 'center', marginVertical: 12 },
  customToggleTxt:  { color: '#6B7280', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  customRow:        { flexDirection: 'row', gap: 10, marginBottom: 12 },
  customInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111',
    backgroundColor: '#FAFAFA',
  },
  summary: {
    fontSize: 12, color: '#6B7280', textAlign: 'center',
    marginTop: 8, marginBottom: 4,
  },
  sendBtn: {
    backgroundColor: PINK, borderRadius: 30,
    paddingVertical: 15, alignItems: 'center',
    marginTop: 14, marginHorizontal: 4,
    shadowColor: PINK, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sendBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footerNote: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 10 },

  // World tab
  worldBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  worldBannerEmoji: { fontSize: 32, marginRight: 12 },
  worldBannerTitle: { fontSize: 15, fontWeight: '800', color: '#15803D', marginBottom: 2 },
  worldBannerSub:   { fontSize: 12, color: '#16A34A' },
  worldChip:        { borderColor: '#D1FAE5', backgroundColor: '#F0FDF4' },
  worldChipActive:  { backgroundColor: '#DCFCE7', borderColor: GREEN },
  worldTxtActive:   { color: GREEN },
  worldCountChip:       { borderColor: 'transparent', backgroundColor: '#F0FDF4' },
  worldCountChipActive: { backgroundColor: '#DCFCE7', borderColor: GREEN },
  worldCountTxtActive:  { color: GREEN },
  worldSummaryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  worldSummaryLine: { fontSize: 13, color: '#15803D', fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  worldSummaryFee:  { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  worldSendBtn: {
    backgroundColor: GREEN, borderRadius: 30,
    paddingVertical: 15, alignItems: 'center',
    marginTop: 14, marginHorizontal: 4,
    shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  worldNote: {
    textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 10,
    lineHeight: 18,
  },
});
