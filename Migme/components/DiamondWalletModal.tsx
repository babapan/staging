import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getDiamondBalance,
  getDiamondTransactions,
  getWithdrawRequests,
  withdrawDiamonds,
  cancelWithdrawRequest,
  formatDiamond,
  formatDiamondToIdr,
  type DiamondBalance,
  type DiamondTransaction,
  type WithdrawRequest,
} from '../services/diamondService';
import { diamondEventBus, type DiamondEvent } from '../services/diamondEventBus';
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg:       '#F4F5F7',
  white:    '#FFFFFF',
  text:     '#1A1A2E',
  sub:      '#888',
  sep:      '#E8E8E8',
  accent:   '#4F46E5',
  accentBg: '#EEF2FF',
  green:    '#10B981',
  greenBg:  '#D1FAE5',
  red:      '#EF4444',
  redBg:    '#FEE2E2',
  gold:     '#F59E0B',
  goldBg:   '#FEF3C7',
  teal:     '#0D9488',
  tealBg:   '#CCFBF1',
  gray:     '#6B7280',
  grayBg:   '#F3F4F6',
  diamCard: '#EEF2FF',
  diamBdr:  '#C7D2FE',
  input:    '#F8FAFC',
  inputBdr: '#CBD5E1',
};

type Tab = 'histori' | 'riwayat_wd' | 'withdraw';

// ── Saved account type ─────────────────────────────────────────────────────────
interface SavedAccount {
  id: number;
  method: 'bank' | 'ewallet' | 'usdt_trc20';
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}

async function apiHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) h['Cookie'] = cookie;
  }
  return h;
}
const apiFetchOpts = (): RequestInit =>
  Platform.OS === 'web' ? { credentials: 'include' } : {};

// ── Payment method config ──────────────────────────────────────────────────────
type PaymentMethod = 'bank' | 'ewallet' | 'usdt_trc20';

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'bank',       label: 'Bank Transfer', icon: '🏦', color: C.accent, bg: C.accentBg },
  { key: 'ewallet',    label: 'E-Wallet',      icon: '📱', color: C.green,  bg: C.greenBg  },
  { key: 'usdt_trc20', label: 'USDT TRC20',    icon: '🔷', color: C.teal,   bg: C.tealBg   },
];

const METHOD_LABELS: Record<PaymentMethod, {
  bankLabel: string; accNumLabel: string; accNameLabel: string;
  bankPlaceholder: string; accNumPlaceholder: string; numericInput: boolean;
}> = {
  bank: {
    bankLabel: 'Bank Name', accNumLabel: 'Account Number', accNameLabel: 'Account Holder Name',
    bankPlaceholder: 'e.g. BCA, BRI, Mandiri, BNI', accNumPlaceholder: 'e.g. 1234567890', numericInput: true,
  },
  ewallet: {
    bankLabel: 'E-Wallet Provider', accNumLabel: 'Phone / Account ID', accNameLabel: 'Account Holder Name',
    bankPlaceholder: 'e.g. GoPay, OVO, Dana, ShopeePay', accNumPlaceholder: 'e.g. 0812-3456-7890', numericInput: true,
  },
  usdt_trc20: {
    bankLabel: 'Crypto Network', accNumLabel: 'TRC20 Wallet Address', accNameLabel: 'Wallet Owner Name',
    bankPlaceholder: 'USDT TRC20 (Tron Network)', accNumPlaceholder: 'e.g. TXxxx...xxxx (34 characters)', numericInput: false,
  },
};

// ── Withdraw status badge config ───────────────────────────────────────────────
const WD_STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: 'Pending',   color: C.gold,   bg: C.goldBg,  icon: '🟡' },
  approved:  { label: 'Approved',  color: C.green,  bg: C.greenBg, icon: '✅' },
  rejected:  { label: 'Rejected',  color: C.red,    bg: C.redBg,   icon: '❌' },
  cancelled: { label: 'Cancelled', color: C.gray,   bg: C.grayBg,  icon: '🚫' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function txTypeLabel(type: string): { label: string; color: string } {
  switch (type) {
    case 'GIFT_RECEIVED':     return { label: 'Gift Received',    color: C.green  };
    case 'WITHDRAW_REQUEST':  return { label: 'Withdrawal',        color: C.red    };
    case 'WITHDRAW_REFUND':   return { label: 'Diamond Refund',    color: C.gold   };
    case 'ADMIN_CREDIT':      return { label: 'Admin Credit',      color: C.green  };
    case 'ADMIN_DEBIT':       return { label: 'Admin Debit',       color: C.red    };
    case 'AGENCY_COMMISSION': return { label: 'Agency Commission', color: C.gold   };
    case 'ADMIN_TRANSFER':    return { label: 'Admin Transfer',    color: C.green  };
    default:                  return { label: type,                color: C.sub    };
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return dateStr; }
}

// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function DiamondWalletModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  // ── State ──
  const [tab, setTab]                   = useState<Tab>('histori');
  const [balData, setBalData]           = useState<DiamondBalance | null>(null);
  const [txList, setTxList]             = useState<DiamondTransaction[]>([]);
  const [wdList, setWdList]             = useState<WithdrawRequest[]>([]);
  const [loading, setLoading]           = useState(false);
  const [txLoading, setTxLoading]       = useState(false);
  const [wdLoading, setWdLoading]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Form state
  const [method, setMethod]   = useState<PaymentMethod>('bank');
  const [amount, setAmount]   = useState('');
  const [bank, setBank]       = useState('');
  const [accNum, setAccNum]   = useState('');
  const [accName, setAccName] = useState('');

  // Saved accounts
  const [savedAccounts, setSavedAccounts]       = useState<SavedAccount[]>([]);
  const [deletingAccId, setDeletingAccId]       = useState<number | null>(null);

  // ── Loaders ──
  const loadBalance = useCallback(async () => {
    setLoading(true);
    setBalData(await getDiamondBalance());
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setTxLoading(true);
    setTxList(await getDiamondTransactions(50, 0));
    setTxLoading(false);
  }, []);

  const loadWithdrawRequests = useCallback(async () => {
    setWdLoading(true);
    setWdList(await getWithdrawRequests(20, 0));
    setWdLoading(false);
  }, []);

  const loadSavedAccounts = useCallback(async () => {
    try {
      const h = await apiHeaders();
      const r = await fetch(`${API_BASE}/api/diamonds/saved-accounts`, { headers: h, ...apiFetchOpts() });
      if (r.ok) {
        const d = await r.json();
        setSavedAccounts(d.accounts ?? []);
      }
    } catch {}
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadBalance(), loadHistory(), loadWithdrawRequests(), loadSavedAccounts()]);
  }, [loadBalance, loadHistory, loadWithdrawRequests, loadSavedAccounts]);

  useEffect(() => {
    if (visible) {
      setTab('histori');
      setAmount(''); setBank(''); setAccNum(''); setAccName('');
      setMethod('bank');
      refreshAll();
    }
  }, [visible, refreshAll]);

  // ── WS event listener ── real-time update saat admin proses withdraw ──────
  useEffect(() => {
    const handler = (e: DiamondEvent) => {
      if (e.type !== 'DIAMOND_WITHDRAW_STATUS') return;

      // Refresh data
      refreshAll();

      if (e.status === 'approved') {
        const idrFmt = e.idrValue.toLocaleString('en-US');
        const amtFmt = e.amount.toLocaleString('en-US');
        Alert.alert(
          '✅ Withdrawal Approved!',
          `Your withdrawal request of 💎 ${amtFmt} = IDR ${idrFmt} to ${e.bankName ?? ''} ${e.accountNumber ?? ''} has been approved.\n\nFunds will be transferred within 24 hours.${e.notes ? '\n\nNote: ' + e.notes : ''}`,
          [{ text: 'OK' }],
        );
      } else if (e.status === 'rejected') {
        const amtFmt = e.amount.toLocaleString('en-US');
        Alert.alert(
          '❌ Withdrawal Rejected',
          `Your withdrawal request of 💎 ${amtFmt} has been rejected.${e.notes ? '\n\nReason: ' + e.notes : ''}\n\nYour diamonds have been refunded to your balance.`,
          [{ text: 'OK' }],
        );
      }
    };
    diamondEventBus.on(handler);
    return () => diamondEventBus.off(handler);
  }, [refreshAll]);

  // ── Cancel withdraw ──────────────────────────────────────────────────────────
  const handleCancel = (wr: WithdrawRequest) => {
    Alert.alert(
      '🚫 Cancel Withdrawal?',
      `You are about to cancel the withdrawal of 💎 ${wr.amount.toLocaleString('en-US')} = IDR ${wr.idrValue.toLocaleString('en-US')} to ${wr.bankName}.\n\nYour diamonds will be immediately refunded to your balance.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(wr.refId);
            try {
              const result = await cancelWithdrawRequest(wr.refId);
              Alert.alert('Success', result.message);
              await refreshAll();
            } catch (e: any) {
              Alert.alert('Failed', e.message ?? 'An error occurred.');
            }
            setCancellingId(null);
          },
        },
      ],
    );
  };

  // ── Delete saved account ─────────────────────────────────────────────────────
  const handleDeleteSavedAccount = (acc: SavedAccount) => {
    Alert.alert('Hapus Rekening', `Hapus rekening "${acc.label}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        setDeletingAccId(acc.id);
        try {
          const h = await apiHeaders();
          await fetch(`${API_BASE}/api/diamonds/saved-accounts/${acc.id}`, {
            method: 'DELETE', headers: h, ...apiFetchOpts(),
          });
          await loadSavedAccounts();
        } catch {}
        setDeletingAccId(null);
      }},
    ]);
  };

  // ── Save current form as account ─────────────────────────────────────────────
  const offerSaveAccount = (bankVal: string, accNumVal: string, accNameVal: string) => {
    Alert.alert(
      'Simpan Rekening?',
      `Simpan ${bankVal} · ${accNumVal} sebagai rekening tersimpan agar tidak perlu isi ulang?`,
      [
        { text: 'Tidak', style: 'cancel' },
        { text: 'Simpan', onPress: async () => {
          try {
            const h = await apiHeaders();
            const label = method === 'usdt_trc20'
              ? `USDT · ${accNumVal.slice(0, 8)}…`
              : `${bankVal} · ${accNumVal}`;
            const r = await fetch(`${API_BASE}/api/diamonds/saved-accounts`, {
              method: 'POST', headers: h,
              body: JSON.stringify({
                method,
                label,
                bank_name: bankVal,
                account_number: accNumVal,
                account_name: accNameVal,
              }),
              ...apiFetchOpts(),
            });
            const d = await r.json();
            if (r.ok) {
              await loadSavedAccounts();
            } else {
              Alert.alert('Gagal simpan', d.message ?? 'Terjadi kesalahan');
            }
          } catch {}
        }},
      ],
    );
  };

  // ── Submit withdraw ──────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    const amt = parseInt(amount.replace(/\D/g, ''), 10);
    if (!amt || amt <= 0) { Alert.alert('Error', 'Please enter a valid Diamond amount.'); return; }

    const labels = METHOD_LABELS[method];
    if (method !== 'usdt_trc20' && !bank.trim()) { Alert.alert('Error', `Please enter the ${labels.bankLabel}.`); return; }
    if (!accNum.trim())  { Alert.alert('Error', `Please enter the ${labels.accNumLabel}.`); return; }
    if (!accName.trim()) { Alert.alert('Error', `Please enter the ${labels.accNameLabel}.`); return; }
    if (method === 'usdt_trc20' && accNum.trim().length < 30) {
      Alert.alert('Error', 'Invalid TRC20 wallet address (minimum 30 characters).'); return;
    }

    const minWd = balData?.minWithdrawDiamond ?? 25000;
    if (amt < minWd) { Alert.alert('Error', `Minimum withdrawal is ${minWd.toLocaleString('en-US')} 💎`); return; }
    if ((balData?.balance ?? 0) < amt) {
      Alert.alert('Error', `Insufficient balance.\nBalance: 💎 ${(balData?.balance ?? 0).toLocaleString('en-US')}`);
      return;
    }

    const rate    = balData?.ratePerDiamond ?? 2;
    const idrEst  = amt * rate;
    const bankVal = method === 'usdt_trc20' ? 'USDT TRC20' : bank.trim();
    const destLabel = method === 'usdt_trc20'
      ? `USDT TRC20\nAddress: ${accNum.trim()}`
      : `${bankVal} — ${accNum.trim()}`;

    Alert.alert(
      'Confirm Withdrawal',
      `You are about to withdraw:\n💎 ${amt.toLocaleString('en-US')} Diamonds\n≈ IDR ${idrEst.toLocaleString('en-US')}\n\nTo: ${destLabel}\nName: ${accName.trim()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async () => {
            setSubmitting(true);
            const savedBankVal   = bankVal;
            const savedAccNum    = accNum.trim();
            const savedAccName   = accName.trim();
            const isAlreadySaved = savedAccounts.some(
              a => a.bank_name === savedBankVal && a.account_number === savedAccNum,
            );
            try {
              const result = await withdrawDiamonds({
                amount: amt,
                method,
                bankName: bankVal,
                accountNumber: accNum.trim(),
                accountName: accName.trim(),
              });
              setAmount(''); setBank(''); setAccNum(''); setAccName('');
              await refreshAll();
              setTab('riwayat_wd');
              // Setelah sukses, tawarkan simpan rekening jika belum tersimpan
              if (!isAlreadySaved) {
                setTimeout(() => offerSaveAccount(savedBankVal, savedAccNum, savedAccName), 600);
              } else {
                Alert.alert('✅ Berhasil', result.message);
              }
            } catch (e: any) {
              Alert.alert('Gagal', e.message ?? 'An error occurred.');
            }
            setSubmitting(false);
          },
        },
      ],
    );
  };

  // ── Derived ──
  const balance     = balData?.balance ?? 0;
  const minWd       = balData?.minWithdrawDiamond ?? 25000;
  const rate        = balData?.ratePerDiamond ?? 2;
  const amtNum      = parseInt(amount.replace(/\D/g, ''), 10) || 0;
  const estIdr      = amtNum * rate;
  const canWithdraw = balance >= minWd;
  const labels      = METHOD_LABELS[method];
  const pendingCount = wdList.filter(w => w.status === 'pending').length;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'histori',    label: '📋 Transactions' },
    { key: 'riwayat_wd', label: '📜 History', badge: pendingCount > 0 ? pendingCount : undefined },
    { key: 'withdraw',   label: '💸 Withdraw' },
  ];

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderWithdrawItem = (wr: WithdrawRequest) => {
    const st = WD_STATUS[wr.status] ?? WD_STATUS.pending;
    const isCancelling = cancellingId === wr.refId;
    return (
      <View key={wr.refId} style={ss.wdCard}>
        {/* Header row */}
        <View style={ss.wdHeader}>
          <View style={[ss.wdBadge, { backgroundColor: st.bg }]}>
            <Text style={[ss.wdBadgeText, { color: st.color }]}>{st.icon} {st.label}</Text>
          </View>
          <Text style={ss.wdRefId} numberOfLines={1}>{wr.refId}</Text>
        </View>

        {/* Amounts */}
        <View style={ss.wdAmountRow}>
          <Text style={ss.wdDiamond}>💎 {wr.amount.toLocaleString('en-US')}</Text>
          <Text style={ss.wdIdr}>≈ IDR {wr.idrValue.toLocaleString('en-US')}</Text>
        </View>

        {/* Destination */}
        <Text style={ss.wdDest} numberOfLines={1}>
          {wr.bankName} · {wr.accountNumber} — {wr.accountName}
        </Text>

        {/* Date */}
        <Text style={ss.wdDate}>{formatDate(wr.createdAt)}</Text>

        {/* Notes (rejected/approved with note) */}
        {!!wr.notes && (
          <View style={[ss.wdNoteBox, { backgroundColor: wr.status === 'rejected' ? C.redBg : C.goldBg }]}>
            <Text style={[ss.wdNoteText, { color: wr.status === 'rejected' ? C.red : C.gold }]}>
              📝 {wr.notes}
            </Text>
          </View>
        )}

        {/* Cancel button — only for pending */}
        {wr.status === 'pending' && (
          <TouchableOpacity
            style={ss.cancelBtn}
            onPress={() => handleCancel(wr)}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color={C.red} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={16} color={C.red} />
                <Text style={ss.cancelBtnText}>Cancel Withdrawal</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[ss.container, { paddingTop: insets.top }]}>

          {/* ── Header ── */}
          <View style={ss.header}>
            <TouchableOpacity onPress={onClose} style={ss.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={ss.headerTitle}>💎 Diamond Wallet</Text>
            <TouchableOpacity onPress={refreshAll} style={ss.iconBtn}>
              <Ionicons name="refresh" size={20} color={C.accent} />
            </TouchableOpacity>
          </View>

          {/* ── Balance card ── */}
          <View style={ss.balCard}>
            {loading ? <ActivityIndicator color={C.accent} /> : (
              <>
                <Text style={ss.balLabel}>Your Diamond Balance</Text>
                <Text style={ss.balAmount}>💎 {balance.toLocaleString('en-US')}</Text>
                <Text style={ss.balSub}>≈ {formatDiamondToIdr(balance, rate)} · {rate} IDR per 💎</Text>
                {!canWithdraw && (
                  <View style={ss.minNote}>
                    <Ionicons name="information-circle-outline" size={14} color={C.accent} />
                    <Text style={ss.minNoteText}>Min. withdrawal: 💎 {minWd.toLocaleString('en-US')}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── Tab bar ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.tabScroll} contentContainerStyle={ss.tabBar}>
            {TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[ss.tabBtn, tab === t.key && ss.tabBtnActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[ss.tabLabel, tab === t.key && ss.tabLabelActive]}>{t.label}</Text>
                {!!t.badge && (
                  <View style={ss.tabBadge}>
                    <Text style={ss.tabBadgeText}>{t.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ════════════════════════════════════════════════════════ */}
          {/* Tab: Diamond Transactions                                */}
          {/* ════════════════════════════════════════════════════════ */}
          {tab === 'histori' && (
            <ScrollView style={ss.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
              {txLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> :
               txList.length === 0 ? (
                <View style={ss.emptyWrap}>
                  <Text style={ss.emptyIcon}>💎</Text>
                  <Text style={ss.emptyTitle}>No transactions yet</Text>
                  <Text style={ss.emptySub}>Receive gifts from other users to earn Diamonds</Text>
                </View>
              ) : txList.map(tx => {
                const isPlus = tx.amount > 0;
                const isGift = tx.type === 'GIFT_RECEIVED';
                return (
                  <View key={tx.id} style={ss.txRow}>
                    <View style={[ss.txIcon, { backgroundColor: isPlus ? C.greenBg : C.redBg }]}>
                      <Text style={{ fontSize: 16 }}>{isPlus ? '💎' : '💸'}</Text>
                    </View>
                    <View style={ss.txMid}>
                      <Text style={ss.txDesc} numberOfLines={2}>{tx.description ?? txTypeLabel(tx.type).label}</Text>
                      <Text style={ss.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                    {!isGift && (
                      <View style={ss.txRight}>
                        <Text style={[ss.txAmount, { color: isPlus ? C.green : C.red }]}>
                          {isPlus ? '+' : ''}{tx.amount.toLocaleString('en-US')} 💎
                        </Text>
                        <Text style={ss.txBalance}>Balance: {tx.runningBalance.toLocaleString('en-US')}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* Tab: Withdrawal History                                  */}
          {/* ════════════════════════════════════════════════════════ */}
          {tab === 'riwayat_wd' && (
            <ScrollView style={ss.scroll} contentContainerStyle={ss.wdListContent}>
              {/* Summary chips */}
              {wdList.length > 0 && (
                <View style={ss.summaryRow}>
                  {(['pending','approved','rejected','cancelled'] as const).map(s => {
                    const count = wdList.filter(w => w.status === s).length;
                    if (!count) return null;
                    const st = WD_STATUS[s];
                    return (
                      <View key={s} style={[ss.summaryChip, { backgroundColor: st.bg }]}>
                        <Text style={[ss.summaryChipText, { color: st.color }]}>
                          {st.icon} {st.label}: {count}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {wdLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> :
               wdList.length === 0 ? (
                <View style={ss.emptyWrap}>
                  <Text style={ss.emptyIcon}>📜</Text>
                  <Text style={ss.emptyTitle}>No withdrawal history</Text>
                  <Text style={ss.emptySub}>Go to the Withdraw tab to request a Diamond payout</Text>
                </View>
              ) : wdList.map(renderWithdrawItem)}
            </ScrollView>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/* Tab: Form Withdraw                                        */}
          {/* ════════════════════════════════════════════════════════ */}
          {tab === 'withdraw' && (
            <ScrollView style={ss.scroll} contentContainerStyle={ss.formContent} keyboardShouldPersistTaps="handled">

              {/* ── Rekening Tersimpan ── */}
              {savedAccounts.length > 0 && (
                <View style={ss.savedSection}>
                  <Text style={ss.savedTitle}>Rekening Tersimpan</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.savedScroll} contentContainerStyle={ss.savedRow}>
                    {savedAccounts.map(acc => {
                      const mCfg = PAYMENT_METHODS.find(m => m.key === acc.method) ?? PAYMENT_METHODS[0];
                      const isDeleting = deletingAccId === acc.id;
                      return (
                        <TouchableOpacity
                          key={acc.id}
                          style={[ss.savedCard, { borderColor: mCfg.color }]}
                          activeOpacity={0.75}
                          onPress={() => {
                            setMethod(acc.method);
                            setBank(acc.bank_name);
                            setAccNum(acc.account_number);
                            setAccName(acc.account_name);
                          }}
                        >
                          <View style={ss.savedCardTop}>
                            <View style={[ss.savedMethodDot, { backgroundColor: mCfg.color }]} />
                            <Text style={[ss.savedCardLabel, { color: mCfg.color }]} numberOfLines={1}>{acc.label}</Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteSavedAccount(acc)}
                              disabled={isDeleting}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              {isDeleting
                                ? <ActivityIndicator size="small" color={C.red} />
                                : <Ionicons name="close-circle" size={16} color={C.sub} />
                              }
                            </TouchableOpacity>
                          </View>
                          <Text style={ss.savedCardNum} numberOfLines={1}>{acc.account_number}</Text>
                          <Text style={ss.savedCardName} numberOfLines={1}>{acc.account_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Rate info box */}
              <View style={ss.infoBox}>
                <Text style={ss.infoText}>
                  {'💎 Exchange Rate\n'}
                  <Text style={{ fontWeight: '700' }}>{'8,000 💎 = $1.00 USD'}</Text>
                  {'  ·  Fixed app rate: IDR 15,000 / $1 USD\n'}
                  {'Min. withdrawal: 💎 '}{minWd.toLocaleString('en-US')}
                </Text>
              </View>

              {/* Payment method */}
              <Text style={ss.inputLabel}>Payment Method</Text>
              <View style={ss.methodRow}>
                {PAYMENT_METHODS.map(m => {
                  const active = method === m.key;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[ss.methodChip, active && { borderColor: m.color, backgroundColor: m.bg }]}
                      onPress={() => { setMethod(m.key); setBank(''); setAccNum(''); setAccName(''); }}
                    >
                      <Text style={ss.methodIcon}>{m.icon}</Text>
                      <Text style={[ss.methodLabel, active && { color: m.color, fontWeight: '700' }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Amount */}
              <Text style={ss.inputLabel}>Diamond Amount</Text>
              <TextInput
                style={ss.input}
                placeholder={`Min. ${minWd.toLocaleString('en-US')}`}
                placeholderTextColor={C.sub}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
              {amtNum > 0 && <Text style={ss.estText}>≈ IDR {estIdr.toLocaleString('en-US')}</Text>}

              {/* Bank / E-Wallet / readonly TRC20 */}
              <Text style={ss.inputLabel}>{labels.bankLabel}</Text>
              {method !== 'usdt_trc20' ? (
                <TextInput
                  style={ss.input}
                  placeholder={labels.bankPlaceholder}
                  placeholderTextColor={C.sub}
                  value={bank}
                  onChangeText={setBank}
                  autoCapitalize="words"
                />
              ) : (
                <View style={[ss.input, ss.readonlyInput]}>
                  <Text style={ss.readonlyText}>🔷 USDT TRC20 (Tron Network)</Text>
                </View>
              )}

              {/* Nomor / Alamat */}
              <Text style={ss.inputLabel}>{labels.accNumLabel}</Text>
              <TextInput
                style={ss.input}
                placeholder={labels.accNumPlaceholder}
                placeholderTextColor={C.sub}
                keyboardType={labels.numericInput ? 'numeric' : 'default'}
                value={accNum}
                onChangeText={setAccNum}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Nama */}
              <Text style={ss.inputLabel}>{labels.accNameLabel}</Text>
              <TextInput
                style={ss.input}
                placeholder={method === 'usdt_trc20' ? 'Your name as wallet owner' : 'As shown on ID / bank account'}
                placeholderTextColor={C.sub}
                value={accName}
                onChangeText={setAccName}
                autoCapitalize="words"
              />

              {/* USDT warning */}
              {method === 'usdt_trc20' && (
                <View style={ss.cryptoNote}>
                  <Ionicons name="warning-outline" size={15} color={C.teal} />
                  <Text style={[ss.infoText, { color: C.teal, flex: 1, marginLeft: 6 }]}>
                    Please double-check your TRC20 wallet address. Crypto transfers cannot be reversed.
                  </Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[ss.submitBtn, (!canWithdraw || submitting) && ss.submitBtnDisabled]}
                onPress={handleWithdraw}
                disabled={!canWithdraw || submitting}
              >
                {submitting
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={ss.submitText}>
                      {canWithdraw ? '💸 Submit Withdrawal' : `Need min. ${minWd.toLocaleString('en-US')} 💎`}
                    </Text>
                }
              </TouchableOpacity>

              <Text style={ss.disclaimerText}>
                Withdrawal requests are processed manually within 1–3 business days.{'\n'}
                You can cancel a request while it is still in Pending status.
              </Text>
              <View style={{ height: 40 }} />
            </ScrollView>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.sep,
  },
  iconBtn:     { padding: 4, marginHorizontal: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },

  balCard: {
    backgroundColor: C.diamCard, borderWidth: 1, borderColor: C.diamBdr,
    margin: 14, borderRadius: 16, padding: 20, alignItems: 'center', gap: 4,
  },
  balLabel:    { fontSize: 13, color: '#4338CA', fontWeight: '600' },
  balAmount:   { fontSize: 34, fontWeight: '900', color: '#312E81', marginTop: 4 },
  balSub:      { fontSize: 13, color: '#6366F1', marginTop: 2 },
  minNote:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  minNoteText: { fontSize: 12, color: C.accent },

  tabScroll:      { flexGrow: 0, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.sep },
  tabBar:         { flexDirection: 'row', paddingHorizontal: 4 },
  tabBtn:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:   { borderBottomColor: C.accent },
  tabLabel:       { fontSize: 13, fontWeight: '600', color: C.sub },
  tabLabelActive: { color: C.accent },
  tabBadge:       { marginLeft: 6, backgroundColor: C.gold, borderRadius: 8, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeText:   { fontSize: 11, fontWeight: '800', color: C.white },

  scroll: { flex: 1 },

  // Transaksi list
  txRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.sep, gap: 12 },
  txIcon:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  txMid:     { flex: 1 },
  txDesc:    { fontSize: 13, fontWeight: '500', color: C.text, lineHeight: 18 },
  txDate:    { fontSize: 11, color: C.sub, marginTop: 3 },
  txRight:   { alignItems: 'flex-end' },
  txAmount:  { fontSize: 14, fontWeight: '700' },
  txBalance: { fontSize: 11, color: C.sub, marginTop: 2 },

  // Empty state
  emptyWrap:  { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },

  // Withdraw history
  wdListContent: { padding: 14, gap: 12, paddingBottom: 30 },
  summaryRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  summaryChip:   { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  summaryChipText: { fontSize: 12, fontWeight: '700' },

  wdCard: {
    backgroundColor: C.white, borderRadius: 14,
    padding: 14, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  wdHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wdBadge:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  wdBadgeText: { fontSize: 12, fontWeight: '700' },
  wdRefId:     { fontSize: 11, color: C.sub, flex: 1, textAlign: 'right' },
  wdAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  wdDiamond:   { fontSize: 20, fontWeight: '800', color: C.text },
  wdIdr:       { fontSize: 13, color: C.sub },
  wdDest:      { fontSize: 13, color: C.sub },
  wdDate:      { fontSize: 11, color: C.sub },
  wdNoteBox:   { borderRadius: 8, padding: 8, marginTop: 4 },
  wdNoteText:  { fontSize: 12, lineHeight: 18 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: C.red, borderRadius: 10,
    paddingVertical: 9, marginTop: 6,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: C.red },

  // Form
  formContent:   { padding: 16 },
  infoBox:       { backgroundColor: C.accentBg, borderRadius: 10, padding: 12, marginBottom: 16 },
  infoText:      { fontSize: 13, color: C.accent, lineHeight: 20 },
  methodRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  methodChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: C.inputBdr, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.white, flex: 1, minWidth: 100 },
  methodIcon:    { fontSize: 16 },
  methodLabel:   { fontSize: 12, fontWeight: '500', color: C.sub, flexShrink: 1 },
  inputLabel:    { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6, marginTop: 14 },
  input:         { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBdr, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text },
  readonlyInput: { justifyContent: 'center', backgroundColor: C.tealBg, borderColor: C.teal },
  readonlyText:  { fontSize: 14, color: C.teal, fontWeight: '600' },
  estText:       { fontSize: 13, color: C.green, fontWeight: '600', marginTop: 6, marginLeft: 2 },
  cryptoNote:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.tealBg, borderRadius: 8, padding: 10, marginTop: 12 },
  submitBtn:         { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { backgroundColor: '#A5B4FC' },
  submitText:        { color: C.white, fontSize: 15, fontWeight: '700' },
  disclaimerText:    { fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  white: C.white,

  // Saved accounts section
  savedSection: { marginBottom: 14 },
  savedTitle:   { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
  savedScroll:  { flexGrow: 0 },
  savedRow:     { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  savedCard: {
    width: 160, borderRadius: 12, borderWidth: 1.5,
    backgroundColor: C.white, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  savedCardTop:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  savedMethodDot: { width: 8, height: 8, borderRadius: 4 },
  savedCardLabel: { flex: 1, fontSize: 11, fontWeight: '700' },
  savedCardNum:   { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  savedCardName:  { fontSize: 11, color: C.sub },
});
