import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getCreditBalance,
  getCreditTransactions,
  transferCredit,
  formatCredit,
  type CreditBalance,
  type CreditTransaction,
} from '../services/credit';
import { useAppTheme } from '../services/themeContext';
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';

const VALUE_GREEN = '#27AE60';
const VALUE_RED   = '#E53935';

const ALLOWED_MERCHANT_TYPES = [1, 2, 3];

type Tab = 'balance' | 'transfer' | 'history';

interface Props {
  visible: boolean;
  onClose: () => void;
  username: string | null;
  initialTab?: Tab;
  initialToUsername?: string;
}

export default function CreditsModal({ visible, onClose, username, initialTab, initialToUsername }: Props) {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();

  const [tab, setTab]               = useState<Tab>(initialTab ?? 'balance');
  const [balance, setBalance]       = useState<CreditBalance | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [txns, setTxns]             = useState<CreditTransaction[]>([]);
  const [txLoading, setTxLoading]   = useState(false);
  const [toUser, setToUser]         = useState(initialToUsername ?? '');
  const [amount, setAmount]         = useState('');
  const [pin, setPin]               = useState('');
  const [transferring, setTransferring] = useState(false);
  const [merchantType, setMerchantType] = useState<number | null>(null);

  const canTransfer = merchantType !== null && ALLOWED_MERCHANT_TYPES.includes(merchantType);

  const loadMerchantStatus = useCallback(async () => {
    if (!username) return;
    try {
      const headers: Record<string, string> = {};
      if (Platform.OS !== 'web') {
        const cookie = await getSession();
        if (cookie) headers['Cookie'] = cookie;
      }
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};
      const res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(username)}`, { headers, ...opts });
      if (res.ok) {
        const data = await res.json();
        setMerchantType(data.merchantType ?? null);
      } else {
        setMerchantType(null);
      }
    } catch {
      setMerchantType(null);
    }
  }, [username]);

  const loadBalance = useCallback(async () => {
    if (!username) return;
    setBalLoading(true);
    const b = await getCreditBalance(username);
    setBalance(b);
    setBalLoading(false);
  }, [username]);

  const loadHistory = useCallback(async () => {
    if (!username) return;
    setTxLoading(true);
    const t = await getCreditTransactions(username, 50);
    setTxns(t);
    setTxLoading(false);
  }, [username]);

  useEffect(() => {
    if (visible) {
      loadMerchantStatus();
      const resolvedTab = initialTab ?? 'balance';
      setTab(resolvedTab);
      setToUser(initialToUsername ?? '');
      setAmount('');
      setPin('');
      if (username) loadBalance();
    }
  }, [visible]);

  useEffect(() => {
    if (tab === 'transfer' && !canTransfer && merchantType !== null) {
      setTab('balance');
    }
  }, [canTransfer, merchantType]);

  useEffect(() => {
    if (tab === 'history' && username) loadHistory();
  }, [tab, username]);

  const currency = balance?.currency ?? 'IDR';

  const handleTransfer = async () => {
    const amt = parseFloat(amount);
    if (!toUser.trim()) {
      Alert.alert('Error', 'Masukkan username penerima');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Error', 'Masukkan jumlah yang valid');
      return;
    }
    if (amt < 1000) {
      Alert.alert('Error', 'Jumlah transfer minimal 1.000 Coin');
      return;
    }
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      Alert.alert('Error', 'Masukkan PIN 6 digit yang valid');
      return;
    }
    if (!username) return;
    setTransferring(true);
    try {
      const result = await transferCredit(username, toUser.trim(), amt, pin);
      const cur = result.currency;
      Alert.alert(
        'Transfer Berhasil',
        `${formatCredit(result.transferAmount, cur)} dikirim ke @${result.toUsername}\nDiterima: ${formatCredit(result.netReceived, cur)}\nSaldo baru: ${formatCredit(result.fromBalance, cur)}`,
        [{ text: 'OK', onPress: () => { setToUser(''); setAmount(''); setPin(''); loadBalance(); } }],
      );
    } catch (err: any) {
      Alert.alert('Transfer Gagal', err.message ?? 'Unknown error');
    } finally {
      setTransferring(false);
    }
  };

  function txDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  const s = makeStyles(theme);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { paddingTop: 0 }]}>
        {/* ── Gradient hero (replaces header + balance card) ── */}
        <LinearGradient
          colors={['#86E6AC', '#C8F5D8', '#ffffff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[s.heroGradient, { paddingTop: insets.top + 12 }]}
        >
          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            style={[s.closeBtn, { top: insets.top + 8 }]}
            testID="button-credits-back"
          >
            <Ionicons name="close" size={22} color="#2D7A4F" />
          </TouchableOpacity>

          {/* Refresh button */}
          <TouchableOpacity
            onPress={loadBalance}
            style={[s.heroRefreshBtn, { top: insets.top + 8 }]}
            testID="button-credits-refresh"
          >
            <Ionicons name="refresh" size={20} color="#2D7A4F" />
          </TouchableOpacity>

          <Ionicons name="cash-outline" size={44} color="#2D7A4F" style={{ marginBottom: 10 }} />
          {balLoading ? (
            <ActivityIndicator color="#2D7A4F" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={s.balanceMain} testID="text-credits-main">
              {balance ? balance.formatted : '🪙 0'}
            </Text>
          )}
          <Text style={s.balanceCurrLabel} testID="text-credits-currency">
            Saldo Coin
          </Text>
        </LinearGradient>

        {/* ── Merchant notice banner ── */}
        {merchantType !== null && !canTransfer && (
          <View style={s.merchantNotice}>
            <Ionicons name="lock-closed-outline" size={13} color="#fff" style={{ marginRight: 5 }} />
            <Text style={s.merchantNoticeText}>Creditite transfer applies to merchants</Text>
          </View>
        )}

        {/* ── Tabs ── */}
        <View style={s.tabBar}>
          {(['balance', 'transfer', 'history'] as Tab[])
            .filter((t) => t !== 'transfer' || canTransfer)
            .map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tabBtn, tab === t && s.tabBtnActive]}
              onPress={() => setTab(t)}
              testID={`tab-credits-${t}`}
            >
              <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
                {t === 'balance' ? 'Overview' : t === 'transfer' ? 'Transfer' : 'History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ── Overview tab ── */}
          {tab === 'balance' && (
            <View style={s.section}>
              <View style={s.infoCard}>
                <InfoRow
                  label="Saldo Coin"
                  value={balance ? balance.formatted : '—'}
                  green bold
                  theme={theme}
                />
                <View style={s.infoRowDivider} />
                <InfoRow
                  label="Coin Terisi"
                  value={balance ? formatCredit(balance.fundedBalance, currency) : '—'}
                  theme={theme}
                />
              </View>

              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={s.infoText}>
                  Coin dapat digunakan untuk mengirim hadiah dan meningkatkan profil Anda.
                </Text>
              </View>

              {canTransfer && (
                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={() => setTab('transfer')}
                  testID="button-go-transfer"
                >
                  <Ionicons name="swap-horizontal" size={18} color={theme.textOnAccent} style={{ marginRight: 8 }} />
                  <Text style={s.primaryBtnText}>Transfer Credits</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: theme.headerBg, marginTop: 10 }]}
                onPress={() => setTab('history')}
                testID="button-go-history"
              >
                <Ionicons name="time-outline" size={18} color={theme.textOnAccent} style={{ marginRight: 8 }} />
                <Text style={s.primaryBtnText}>Lihat Riwayat</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Transfer tab ── */}
          {tab === 'transfer' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.infoCard}>
                <View style={s.balanceRowSmall}>
                  <Text style={s.subLabel}>
                    Saldo Anda
                  </Text>
                  <Text style={[s.subValue, { color: VALUE_GREEN }]} testID="text-transfer-balance">
                    {balance ? balance.formatted : `0 ${currency}`}
                  </Text>
                </View>
              </View>

              <Text style={s.fieldLabel}>Username Penerima</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. mig33user"
                placeholderTextColor={theme.textSecondary}
                value={toUser}
                onChangeText={setToUser}
                autoCapitalize="none"
                autoCorrect={false}
                testID="input-transfer-recipient"
              />

              <Text style={s.fieldLabel}>Jumlah (Coin)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 10000"
                placeholderTextColor={theme.textSecondary}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                testID="input-transfer-amount"
              />

              <Text style={s.fieldLabel}>PIN (6 digit)</Text>
              <View style={s.pinRow}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      s.pinDot,
                      i < pin.length && s.pinDotFilled,
                    ]}
                  />
                ))}
              </View>
              <TextInput
                style={s.pinInput}
                placeholder="Masukkan PIN 6 digit"
                placeholderTextColor={theme.textSecondary}
                value={pin}
                onChangeText={(v) => { if (/^\d{0,6}$/.test(v)) setPin(v); }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                testID="input-transfer-pin"
              />

              <Text style={s.feeNote}>
                Tidak ada biaya transfer. Penerima mendapatkan jumlah penuh yang Anda kirim.
              </Text>

              <TouchableOpacity
                style={[s.primaryBtn, transferring && { opacity: 0.6 }]}
                onPress={handleTransfer}
                disabled={transferring}
                testID="button-confirm-transfer"
              >
                {transferring ? (
                  <ActivityIndicator color={theme.textOnAccent} />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={18} color={theme.textOnAccent} style={{ marginRight: 8 }} />
                    <Text style={s.primaryBtnText}>Send Credits</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── History tab ── */}
          {tab === 'history' && (
            txLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
            ) : txns.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="receipt-outline" size={52} color={theme.divider} />
                <Text style={s.emptyText}>Belum ada transaksi</Text>
              </View>
            ) : (
              <FlatList
                data={txns}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 20 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <View style={s.txRow} testID={`tx-row-${item.id}`}>
                    <Ionicons
                      name={item.amount >= 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={28}
                      color={item.amount >= 0 ? VALUE_GREEN : VALUE_RED}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.txType}>{item.typeName}</Text>
                      {item.description ? (
                        <Text style={s.txDesc} numberOfLines={1}>{item.description}</Text>
                      ) : null}
                      <Text style={s.txDate}>{txDate(item.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.txAmount, { color: item.amount >= 0 ? VALUE_GREEN : VALUE_RED }]}>
                        {item.amount >= 0 ? '+' : ''}{formatCredit(item.amount, item.currency)}
                      </Text>
                      <Text style={s.txBalance}>
                        {formatCredit(item.runningBalance, item.currency)}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, bold, green, theme }: {
  label: string; value: string; bold?: boolean; green?: boolean;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 14, color: theme.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 16, color: green ? VALUE_GREEN : theme.textPrimary, fontWeight: bold ? '700' : '400' }}>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.screenBg },

    merchantNotice: {
      backgroundColor: '#7B5EA7',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    merchantNoticeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.2,
    },

    heroGradient: {
      alignItems: 'center',
      paddingBottom: 28,
      paddingHorizontal: 20,
    },
    closeBtn: {
      position: 'absolute',
      top: 16,
      left: 16,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroRefreshBtn: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    balanceMain: {
      fontSize: 34,
      fontWeight: '800',
      color: '#1A5C36',
      letterSpacing: 0.5,
    },
    balanceCurrLabel: {
      fontSize: 13,
      color: '#2D7A4F',
      marginTop: 4,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontWeight: '600',
    },

    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 13,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabBtnActive:   { borderBottomColor: theme.accent },
    tabLabel:       { fontSize: 13, fontWeight: '500', color: theme.textSecondary },
    tabLabelActive: { color: theme.accent, fontWeight: '700' },

    section: { flex: 1, padding: 16 },

    infoCard: {
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    infoRowDivider: {
      height: 1,
      backgroundColor: theme.divider,
      marginHorizontal: 16,
    },

    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.cardBg,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 20,
    },
    infoText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 18 },

    balanceRowSmall: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    subLabel: { fontSize: 14, color: theme.textSecondary },
    subValue:  { fontSize: 15, fontWeight: '700', color: theme.textPrimary },

    fieldLabel: {
      fontSize: 13,
      color: theme.textSecondary,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 4,
    },
    input: {
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.textPrimary,
      marginBottom: 16,
    },
    feeNote: { fontSize: 12, color: theme.textSecondary, marginBottom: 20, lineHeight: 17 },

    pinRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 12,
      marginTop: 4,
    },
    pinDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.accent,
      backgroundColor: 'transparent',
    },
    pinDotFilled: {
      backgroundColor: theme.accent,
    },
    pinInput: {
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 22,
      color: theme.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: 8,
    },

    primaryBtn: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    primaryBtnText: { color: theme.textOnAccent, fontSize: 16, fontWeight: '700' },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText:  { fontSize: 15, color: theme.textSecondary },

    txRow: {
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.2 : 0.04,
      shadowRadius: 4,
      elevation: 1,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
    },
    txType:   { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
    txDesc:   { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
    txDate:   { fontSize: 11, color: theme.textSecondary, marginTop: 3 },
    txAmount: { fontSize: 15, fontWeight: '700' },
    txBalance:{ fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  });
}
