import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE, getMe } from '../services/auth';
import { getSession } from '../services/storage';

const COUNTRIES = [
  'Indonesia',
  'Malaysia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Singapore',
  'Brunei',
  'Myanmar',
  'Cambodia',
  'Laos',
];

const COMMISSION_TIERS = [
  { label: 'Bronze', value: 5,  color: '#CD7F32', desc: '5% commission' },
  { label: 'Silver', value: 10, color: '#A8A9AD', desc: '10% commission' },
  { label: 'Gold',   value: 15, color: '#FFD700', desc: '15% commission' },
];

const MEMBER_OPTIONS = ['1-10', '11-50', '51-100', '100+'];

const BG       = '#0a0612';
const CARD     = '#1a1025';
const BORDER   = '#2d1f4a';
const ACCENT   = '#c47aff';
const ACCENT2  = '#ff6b9d';
const TEXT     = '#f0e8ff';
const SUBTEXT  = '#9b8cbf';
const SUCCESS  = '#00e676';

export default function AgencyRegisterModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Form fields
  const [username, setUsername]       = useState('');
  const [agencyName, setAgencyName]   = useState('');
  const [whatsapp, setWhatsapp]       = useState('');
  const [country, setCountry]         = useState('');
  const [showCountry, setShowCountry] = useState(false);
  const [memberOption, setMemberOption] = useState('');
  const [commission, setCommission]   = useState<number | null>(null);
  const [logoUri, setLogoUri]         = useState<string | null>(null);

  const resetForm = () => {
    setStep(1);
    setDone(false);
    setUsername('');
    setAgencyName('');
    setWhatsapp('');
    setCountry('');
    setMemberOption('');
    setCommission(null);
    setShowCountry(false);
    setLogoUri(null);
  };

  // Auto-fill username from session on open
  useEffect(() => {
    if (visible && !username) {
      getMe().then(me => { if (me?.username) setUsername(me.username); }).catch(() => {});
    }
  }, [visible]);

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const memberCount = (() => {
    if (!memberOption) return 0;
    if (memberOption === '100+') return 100;
    return parseInt(memberOption.split('-')[0], 10);
  })();

  const canStep1 = username.trim().length >= 2 && agencyName.trim().length >= 2;
  const canStep2 = whatsapp.trim().length >= 7 && country.length > 0;
  const canStep3 = memberOption !== '' && commission !== null;

  const handleSubmit = async () => {
    if (!canStep3) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (Platform.OS !== 'web') {
        const cookie = await getSession();
        if (cookie) headers['Cookie'] = cookie;
      }
      const opts: RequestInit = Platform.OS === 'web' ? { credentials: 'include' } : {};

      const res = await fetch(`${API_BASE}/api/agency/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agency_name:    agencyName.trim(),
          registered_by:  username.trim(),
          whatsapp:       whatsapp.trim(),
          country,
          member_count:   memberCount,
          commission,
        }),
        ...opts,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDone(true);
      } else {
        Alert.alert('Failed', data.message ?? 'Registration failed. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not connect to server. Please check your connection.');
    }
    setLoading(false);
  };

  const progressWidth = `${(step / 3) * 100}%` as any;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={[s.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Agency Registration</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {done ? (
            /* ── Success screen ──────────────────────────────── */
            <View style={s.successBox}>
              <View style={s.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={SUCCESS} />
              </View>
              <Text style={s.successTitle}>Registration Submitted!</Text>
              <Text style={s.successSub}>
                Your agency application has been received. Our team will review it within 24 hours and notify you via WhatsApp.
              </Text>
              <View style={s.successInfo}>
                <Text style={s.successLabel}>Agency Name</Text>
                <Text style={s.successValue}>{agencyName}</Text>
                <Text style={[s.successLabel, { marginTop: 8 }]}>Commission Tier</Text>
                <Text style={s.successValue}>
                  {COMMISSION_TIERS.find(t => t.value === commission)?.label} — {commission}%
                </Text>
              </View>
              <TouchableOpacity style={s.doneBtn} onPress={handleClose} activeOpacity={0.8}>
                <Text style={s.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Progress bar */}
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: progressWidth }]} />
              </View>
              <Text style={s.stepLabel}>Step {step} of 3</Text>

              {/* ── Step 1: Agency Identity ──────────────────── */}
              {step === 1 && (
                <View style={s.stepBox}>
                  <Text style={s.stepTitle}>Agency Identity</Text>
                  <Text style={s.stepSub}>Identitas akun dan nama agency kamu.</Text>

                  <Text style={s.fieldLabel}>Username *</Text>
                  <View style={s.usernameRow}>
                    <View style={s.usernameAt}>
                      <Text style={s.usernameAtText}>@</Text>
                    </View>
                    <TextInput
                      style={[s.input, s.usernameInput]}
                      placeholder="username kamu"
                      placeholderTextColor={SUBTEXT}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      maxLength={60}
                    />
                  </View>
                  <Text style={s.hint}>Username akun max99 yang akan menjadi owner agency</Text>

                  <Text style={[s.fieldLabel, { marginTop: 20 }]}>Agency Name *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. Star Talent Agency"
                    placeholderTextColor={SUBTEXT}
                    value={agencyName}
                    onChangeText={setAgencyName}
                    autoCapitalize="words"
                    returnKeyType="next"
                    maxLength={120}
                  />
                  <Text style={s.hint}>Minimum 2 characters</Text>

                  <TouchableOpacity
                    style={[s.nextBtn, !canStep1 && s.nextBtnDisabled]}
                    onPress={() => canStep1 && setStep(2)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.nextBtnText}>Next</Text>
                    <Ionicons name="arrow-forward" size={18} color={BG} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Step 2: WhatsApp + Country ───────────────── */}
              {step === 2 && (
                <View style={s.stepBox}>
                  <Text style={s.stepTitle}>Contact Info</Text>
                  <Text style={s.stepSub}>How can we reach you?</Text>

                  <Text style={s.fieldLabel}>Agency Logo</Text>
                  <TouchableOpacity style={s.logoUpload} onPress={pickLogo} activeOpacity={0.8}>
                    {logoUri ? (
                      <View style={s.logoPreviewWrap}>
                        <Image source={{ uri: logoUri }} style={s.logoPreview} />
                        <TouchableOpacity style={s.logoRemove} onPress={() => setLogoUri(null)}>
                          <Ionicons name="close-circle" size={22} color={ACCENT2} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.logoPlaceholder}>
                        <Ionicons name="image-outline" size={32} color={SUBTEXT} />
                        <Text style={s.logoPlaceholderText}>Tap to upload logo</Text>
                        <Text style={s.logoPlaceholderHint}>Square image recommended</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={[s.fieldLabel, { marginTop: 20 }]}>WhatsApp Number *</Text>
                  <View style={s.phoneRow}>
                    <View style={s.phonePrefix}>
                      <Text style={s.phonePrefixText}>📱</Text>
                    </View>
                    <TextInput
                      style={[s.input, s.phoneInput]}
                      placeholder="+62 812 3456 7890"
                      placeholderTextColor={SUBTEXT}
                      value={whatsapp}
                      onChangeText={setWhatsapp}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                      maxLength={25}
                    />
                  </View>

                  <Text style={[s.fieldLabel, { marginTop: 20 }]}>Country *</Text>
                  <TouchableOpacity
                    style={s.selectBtn}
                    onPress={() => setShowCountry(v => !v)}
                    activeOpacity={0.8}
                  >
                    <Text style={country ? s.selectValue : s.selectPlaceholder}>
                      {country || 'Select country...'}
                    </Text>
                    <Ionicons
                      name={showCountry ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={SUBTEXT}
                    />
                  </TouchableOpacity>

                  {showCountry && (
                    <View style={s.dropdown}>
                      {COUNTRIES.map(c => (
                        <TouchableOpacity
                          key={c}
                          style={[s.dropdownItem, country === c && s.dropdownItemActive]}
                          onPress={() => { setCountry(c); setShowCountry(false); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.dropdownText, country === c && s.dropdownTextActive]}>
                            {c}
                          </Text>
                          {country === c && (
                            <Ionicons name="checkmark" size={16} color={ACCENT} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <View style={s.navRow}>
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
                      <Ionicons name="arrow-back" size={16} color={ACCENT} style={{ marginRight: 4 }} />
                      <Text style={s.backBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.nextBtn, { flex: 1, marginLeft: 12 }, !canStep2 && s.nextBtnDisabled]}
                      onPress={() => canStep2 && setStep(3)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.nextBtnText}>Next</Text>
                      <Ionicons name="arrow-forward" size={18} color={BG} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── Step 3: Members + Commission ─────────────── */}
              {step === 3 && (
                <View style={s.stepBox}>
                  <Text style={s.stepTitle}>Agency Details</Text>
                  <Text style={s.stepSub}>Tell us about your team and goals.</Text>

                  <Text style={s.fieldLabel}>Team Size</Text>
                  <View style={s.chipsRow}>
                    {MEMBER_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[s.chip, memberOption === opt && s.chipActive]}
                        onPress={() => setMemberOption(opt)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.chipText, memberOption === opt && s.chipTextActive]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[s.fieldLabel, { marginTop: 24 }]}>Commission Tier</Text>
                  <Text style={[s.hint, { marginBottom: 12 }]}>
                    Choose the commission plan that fits your agency level.
                  </Text>
                  {COMMISSION_TIERS.map(tier => (
                    <TouchableOpacity
                      key={tier.value}
                      style={[
                        s.tierCard,
                        commission === tier.value && { borderColor: tier.color, backgroundColor: tier.color + '18' },
                      ]}
                      onPress={() => setCommission(tier.value)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.tierDot, { backgroundColor: tier.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tierName, commission === tier.value && { color: tier.color }]}>
                          {tier.label}
                        </Text>
                        <Text style={s.tierDesc}>{tier.desc}</Text>
                      </View>
                      {commission === tier.value && (
                        <Ionicons name="checkmark-circle" size={22} color={tier.color} />
                      )}
                    </TouchableOpacity>
                  ))}

                  <View style={[s.navRow, { marginTop: 28 }]}>
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)} activeOpacity={0.7}>
                      <Ionicons name="arrow-back" size={16} color={ACCENT} style={{ marginRight: 4 }} />
                      <Text style={s.backBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.submitBtn, { flex: 1, marginLeft: 12 }, !canStep3 && s.nextBtnDisabled]}
                      onPress={handleSubmit}
                      disabled={loading || !canStep3}
                      activeOpacity={0.8}
                    >
                      {loading ? (
                        <ActivityIndicator color={BG} size="small" />
                      ) : (
                        <>
                          <Text style={s.submitBtnText}>Submit Application</Text>
                          <Ionicons name="send" size={16} color={BG} style={{ marginLeft: 6 }} />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: 0.3,
  },
  scroll: {
    padding: 20,
  },
  progressTrack: {
    height: 4,
    backgroundColor: BORDER,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  stepLabel: {
    color: SUBTEXT,
    fontSize: 12,
    marginBottom: 24,
    textAlign: 'right',
  },
  stepBox: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: 13,
    color: SUBTEXT,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: SUBTEXT,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: TEXT,
    fontSize: 15,
  },
  hint: {
    fontSize: 11,
    color: SUBTEXT,
    marginTop: 6,
    marginBottom: 4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 28,
  },
  nextBtnDisabled: {
    opacity: 0.35,
  },
  nextBtnText: {
    color: BG,
    fontWeight: '700',
    fontSize: 15,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usernameAt: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  usernameAtText: {
    color: ACCENT,
    fontWeight: '700',
    fontSize: 16,
  },
  usernameInput: {
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phonePrefix: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  phonePrefixText: {
    fontSize: 18,
  },
  phoneInput: {
    flex: 1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectValue: {
    color: TEXT,
    fontSize: 15,
  },
  selectPlaceholder: {
    color: SUBTEXT,
    fontSize: 15,
  },
  dropdown: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  dropdownItemActive: {
    backgroundColor: ACCENT + '15',
  },
  dropdownText: {
    color: TEXT,
    fontSize: 14,
  },
  dropdownTextActive: {
    color: ACCENT,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  backBtnText: {
    color: ACCENT,
    fontWeight: '600',
    fontSize: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  chipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT + '20',
  },
  chipText: {
    color: SUBTEXT,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: ACCENT,
    fontWeight: '700',
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  tierDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 14,
  },
  tierName: {
    color: TEXT,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 2,
  },
  tierDesc: {
    color: SUBTEXT,
    fontSize: 12,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT2,
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnText: {
    color: BG,
    fontWeight: '700',
    fontSize: 15,
  },
  successBox: {
    alignItems: 'center',
    paddingTop: 40,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT,
    marginBottom: 12,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: SUBTEXT,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  successInfo: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 28,
  },
  successLabel: {
    fontSize: 11,
    color: SUBTEXT,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  successValue: {
    fontSize: 16,
    color: TEXT,
    fontWeight: '600',
  },
  doneBtn: {
    width: '100%',
    backgroundColor: SUCCESS,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  logoUpload: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 4,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  logoPlaceholderText: {
    color: SUBTEXT,
    fontSize: 14,
    fontWeight: '600',
  },
  logoPlaceholderHint: {
    color: SUBTEXT,
    fontSize: 11,
    opacity: 0.7,
  },
  logoPreviewWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPreview: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  logoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: BG,
    borderRadius: 11,
  },
});
