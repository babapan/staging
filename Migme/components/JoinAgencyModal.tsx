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
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';

const BG      = '#0a0612';
const CARD    = '#1a1025';
const BORDER  = '#2d1f4a';
const ACCENT  = '#c47aff';
const TEXT    = '#f0e8ff';
const SUBTEXT = '#9b8cbf';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';

async function authHeaders(json = false): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) h['Cookie'] = cookie;
  }
  return h;
}

const fetchOpts = (): RequestInit =>
  Platform.OS === 'web' ? { credentials: 'include' } : {};

interface AgencyPreview {
  id: number;
  agency_name: string;
  logo_url: string | null;
  country: string;
  commission: number;
  member_count: number;
}

interface MyRequest {
  id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  agency_name: string;
  agency_code: string;
}

export default function JoinAgencyModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [code, setCode]                 = useState('');
  const [looking, setLooking]           = useState(false);
  const [preview, setPreview]           = useState<AgencyPreview | null>(null);
  const [lookupError, setLookupError]   = useState('');
  const [message, setMessage]           = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [myRequest, setMyRequest]       = useState<MyRequest | null>(null);
  const [reqLoading, setReqLoading]     = useState(false);

  const loadMyRequest = useCallback(async () => {
    setReqLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_BASE}/api/agency/my/pending-request`, { headers: h, ...fetchOpts() });
      if (res.ok) {
        const d = await res.json();
        setMyRequest(d.request ?? null);
      }
    } catch {}
    setReqLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setCode('');
      setPreview(null);
      setLookupError('');
      setMessage('');
      loadMyRequest();
    }
  }, [visible, loadMyRequest]);

  const handleLookup = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLooking(true);
    setPreview(null);
    setLookupError('');
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_BASE}/api/agency/code-lookup/${encodeURIComponent(trimmed)}`, { headers: h, ...fetchOpts() });
      const d = await res.json();
      if (res.ok && d.agency) {
        setPreview(d.agency);
      } else {
        setLookupError(d.message ?? 'Kode tidak ditemukan');
      }
    } catch {
      setLookupError('Tidak dapat terhubung ke server');
    }
    setLooking(false);
  };

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const h = await authHeaders(true);
      const res = await fetch(`${API_BASE}/api/agency/join-request`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ code: code.trim().toUpperCase(), message: message.trim() || undefined }),
        ...fetchOpts(),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        Alert.alert('Berhasil!', d.message ?? 'Permintaan terkirim. Tunggu review dari owner.', [
          { text: 'OK', onPress: () => { setPreview(null); setCode(''); setMessage(''); loadMyRequest(); } },
        ]);
      } else {
        Alert.alert('Gagal', d.message ?? 'Gagal mengirim permintaan');
      }
    } catch {
      Alert.alert('Error', 'Tidak bisa terhubung ke server');
    }
    setSubmitting(false);
  };

  if (!visible) return null;

  const commissionLabel = (c: number) => c <= 5 ? 'Bronze' : c <= 10 ? 'Silver' : 'Gold';

  const statusColor = (s: string) => s === 'approved' ? GREEN : s === 'rejected' ? RED : AMBER;
  const statusLabel = (s: string) => s === 'approved' ? '✅ Disetujui' : s === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu Review';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[s.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.headerBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Join Agency</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* My current request status */}
          {reqLoading ? (
            <ActivityIndicator color={ACCENT} style={{ margin: 20 }} />
          ) : myRequest ? (
            <View style={s.reqStatusCard}>
              <Text style={s.reqStatusTitle}>Status Permintaan Kamu</Text>
              <View style={s.reqStatusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reqStatusAgency}>{myRequest.agency_name}</Text>
                  <Text style={s.reqStatusCode}>Kode: {myRequest.agency_code}</Text>
                  <Text style={s.reqStatusDate}>
                    Dikirim: {new Date(myRequest.requested_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={[s.statusBadge, { borderColor: statusColor(myRequest.status) + '50', backgroundColor: statusColor(myRequest.status) + '20' }]}>
                  <Text style={[s.statusBadgeText, { color: statusColor(myRequest.status) }]}>
                    {statusLabel(myRequest.status)}
                  </Text>
                </View>
              </View>
              {myRequest.status === 'rejected' && (
                <Text style={s.reqRejectedHint}>Kamu bisa mengirim ulang permintaan dengan kode lain.</Text>
              )}
              {myRequest.status === 'pending' && (
                <Text style={[s.reqRejectedHint, { color: AMBER }]}>Tunggu review dari owner agency. Kamu akan mendapat notifikasi.</Text>
              )}
            </View>
          ) : null}

          {/* Info banner */}
          <View style={s.infoBanner}>
            <Ionicons name="people-circle-outline" size={28} color={ACCENT} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.infoBannerTitle}>Bergabung ke Agency</Text>
              <Text style={s.infoBannerSub}>Masukkan kode unik agency dan kirim permintaan join. Owner akan mereview dan menerima kamu sebagai host.</Text>
            </View>
          </View>

          {/* Code input */}
          <View style={s.section}>
            <Text style={s.label}>Kode Agency</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.codeInput}
                placeholder="Contoh: TES2026"
                placeholderTextColor={SUBTEXT}
                value={code}
                onChangeText={v => { setCode(v); setPreview(null); setLookupError(''); }}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleLookup}
              />
              <TouchableOpacity
                style={[s.lookupBtn, (!code.trim() || looking) && { opacity: 0.5 }]}
                onPress={handleLookup}
                disabled={!code.trim() || looking}
                activeOpacity={0.8}
              >
                {looking ? (
                  <ActivityIndicator color={BG} size="small" />
                ) : (
                  <Text style={s.lookupBtnText}>Cari</Text>
                )}
              </TouchableOpacity>
            </View>

            {lookupError ? (
              <Text style={s.errorText}>{lookupError}</Text>
            ) : null}
          </View>

          {/* Agency preview */}
          {preview && (
            <View style={s.previewCard}>
              <View style={s.previewLogoBox}>
                <Ionicons name="business" size={26} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.previewName}>{preview.agency_name}</Text>
                <Text style={s.previewMeta}>{preview.country} · {preview.member_count} member</Text>
                <View style={s.tierBadge}>
                  <Text style={s.tierBadgeText}>{commissionLabel(preview.commission)} · Komisi {preview.commission}%</Text>
                </View>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={GREEN} />
            </View>
          )}

          {/* Message input */}
          {preview && (
            <View style={s.section}>
              <Text style={s.label}>Pesan (opsional)</Text>
              <TextInput
                style={[s.codeInput, s.msgInput]}
                placeholder="Perkenalkan dirimu kepada owner agency..."
                placeholderTextColor={SUBTEXT}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Submit button */}
          {preview && (
            <TouchableOpacity
              style={[s.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={s.submitBtnText}>Kirim Permintaan Join</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* How it works */}
          <View style={s.howCard}>
            <Text style={s.howTitle}>Cara Bergabung</Text>
            {[
              ['1', 'Masukkan kode unik agency yang kamu dapat dari owner.'],
              ['2', 'Klik "Cari" untuk melihat info agency.'],
              ['3', 'Kirim permintaan — owner akan mereview.'],
              ['4', 'Setelah disetujui, kamu resmi menjadi host!'],
            ].map(([num, txt]) => (
              <View key={num} style={s.howRow}>
                <View style={s.howNum}><Text style={s.howNumText}>{num}</Text></View>
                <Text style={s.howTxt}>{txt}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerBack: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CARD, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 17,
    fontWeight: '700', color: TEXT, letterSpacing: 0.3,
  },
  scroll: { padding: 16, gap: 14 },

  reqStatusCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: BORDER, padding: 16,
  },
  reqStatusTitle: { color: SUBTEXT, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  reqStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqStatusAgency: { color: TEXT, fontSize: 15, fontWeight: '700' },
  reqStatusCode: { color: SUBTEXT, fontSize: 12, marginTop: 2 },
  reqStatusDate: { color: SUBTEXT, fontSize: 11, marginTop: 2 },
  statusBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  reqRejectedHint: { color: SUBTEXT, fontSize: 12, marginTop: 10 },

  infoBanner: {
    backgroundColor: ACCENT + '12', borderRadius: 14,
    borderWidth: 1, borderColor: ACCENT + '30',
    flexDirection: 'row', alignItems: 'center', padding: 16,
  },
  infoBannerTitle: { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoBannerSub:   { color: SUBTEXT, fontSize: 12, lineHeight: 18 },

  section: { gap: 8 },
  label:   { color: SUBTEXT, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  inputRow: { flexDirection: 'row', gap: 8 },
  codeInput: {
    flex: 1, backgroundColor: CARD, borderRadius: 12, borderWidth: 1,
    borderColor: BORDER, color: TEXT, fontSize: 16, fontWeight: '700',
    paddingHorizontal: 14, paddingVertical: 12,
    letterSpacing: 1,
  },
  msgInput: { fontWeight: '400', letterSpacing: 0, height: 80, fontSize: 14, paddingTop: 12 },
  lookupBtn: {
    backgroundColor: ACCENT, borderRadius: 12,
    paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center',
  },
  lookupBtnText: { color: BG, fontWeight: '800', fontSize: 14 },
  errorText: { color: RED, fontSize: 13, marginTop: 4 },

  previewCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1.5,
    borderColor: GREEN + '50', padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  previewLogoBox: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: ACCENT + '40',
  },
  previewName: { color: TEXT, fontSize: 16, fontWeight: '700' },
  previewMeta: { color: SUBTEXT, fontSize: 12, marginTop: 2 },
  tierBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: AMBER + '25', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tierBadgeText: { color: AMBER, fontSize: 11, fontWeight: '700' },

  submitBtn: {
    backgroundColor: ACCENT, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, paddingHorizontal: 24,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  howCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: BORDER, padding: 16, gap: 12,
  },
  howTitle: { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: ACCENT + '25', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  howNumText: { color: ACCENT, fontSize: 12, fontWeight: '800' },
  howTxt: { color: SUBTEXT, fontSize: 13, flex: 1, lineHeight: 18 },
});
