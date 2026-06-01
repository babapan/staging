import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getMe, login, loginWithGoogle } from '../services/auth';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
} from 'react-native-reanimated';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  scopes: ['openid', 'email', 'profile'],
  offlineAccess: false,
});

const { width: SW, height: SH } = Dimensions.get('window');

const BRAND_GREEN      = '#10B981';
const BRAND_GREEN_DARK = '#059669';
const PINK_BTN         = '#FF2D78';
const PURPLE_BTN       = '#8B5CF6';
const WHITE            = '#FFFFFF';

// ─── Colorful Google G icon (no SVG needed) ───────────────────────────────
function GoogleGIcon({ size = 26 }: { size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, marginRight: 10 }}>
      {/* 4-color quadrant circle */}
      <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', height: r }}>
          <View style={{ width: r, height: r, backgroundColor: '#4285F4' }} />
          <View style={{ width: r, height: r, backgroundColor: '#EA4335' }} />
        </View>
        <View style={{ flexDirection: 'row', height: r }}>
          <View style={{ width: r, height: r, backgroundColor: '#34A853' }} />
          <View style={{ width: r, height: r, backgroundColor: '#FBBC05' }} />
        </View>
      </View>
      {/* White center with G letter */}
      <View style={{
        position: 'absolute',
        top: size * 0.18, left: size * 0.18,
        width: size * 0.64, height: size * 0.64,
        borderRadius: size * 0.32,
        backgroundColor: WHITE,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: size * 0.42, fontWeight: '800', color: '#4285F4', lineHeight: size * 0.46 }}>G</Text>
      </View>
    </View>
  );
}

// ─── Google OAuth Client IDs ──────────────────────────────────────────────
// Set these as EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID and
// EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in Replit Secrets after you create
// the OAuth clients in Google Cloud Console.
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

// ─── Bokeh glow blobs (simulated blur via layered translucent circles) ───
const BLOBS = [
  { color: 'rgba(255,100,180,0.28)', size: 220, x: -40,  y: 60  },
  { color: 'rgba(255,220,100,0.22)', size: 180, x: SW-100, y: 180 },
  { color: 'rgba(255,160,200,0.20)', size: 260, x: SW/2-130, y: SH*0.35 },
  { color: 'rgba(200,100,255,0.15)', size: 150, x: 20,   y: SH*0.55 },
  { color: 'rgba(255,200,120,0.18)', size: 200, x: SW-80, y: SH*0.65 },
];

function GlowBlob({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 3200 }),
        withTiming(0.88, { duration: 3200 }),
      ),
      -1, true
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Reanimated.View pointerEvents="none" style={[animStyle, {
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }]} />
  );
}

// ─── Floating icons — Reanimated powered ─────────────────────────────────
const BG_ICONS = [
  { icon: '🎁', x: 0.08, delay: 0,    size: 26, dur: 7000 },
  { icon: '🎵', x: 0.22, delay: 1200, size: 20, dur: 8500 },
  { icon: '💝', x: 0.38, delay: 400,  size: 28, dur: 6500 },
  { icon: '🎀', x: 0.55, delay: 2000, size: 22, dur: 9000 },
  { icon: '🎶', x: 0.70, delay: 800,  size: 24, dur: 7500 },
  { icon: '💎', x: 0.85, delay: 1600, size: 20, dur: 8000 },
  { icon: '🎤', x: 0.15, delay: 2400, size: 22, dur: 7200 },
  { icon: '👑', x: 0.48, delay: 3000, size: 26, dur: 6800 },
  { icon: '🌸', x: 0.62, delay: 600,  size: 24, dur: 8200 },
  { icon: '💌', x: 0.92, delay: 1800, size: 20, dur: 7800 },
  { icon: '✨', x: 0.30, delay: 2800, size: 18, dur: 9200 },
  { icon: '🪷', x: 0.78, delay: 3400, size: 22, dur: 6200 },
  { icon: '💫', x: 0.05, delay: 3800, size: 18, dur: 8800 },
  { icon: '🎊', x: 0.42, delay: 500,  size: 24, dur: 7400 },
];

function FloatingIcon({ icon, x, delay, size, dur }: { icon: string; x: number; delay: number; size: number; dur: number }) {
  const translateY = useSharedValue(SH * 0.95);
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0.7);
  const rotate     = useSharedValue(0);
  const driftX     = useSharedValue(0);

  useEffect(() => {
    const run = () => {
      translateY.value = SH * 0.95;
      opacity.value    = 0;
      scale.value      = 0.7;
      rotate.value     = 0;
      driftX.value     = 0;

      translateY.value = withDelay(delay, withTiming(-80, { duration: dur }));
      opacity.value    = withDelay(delay, withSequence(
        withTiming(0.85, { duration: dur * 0.12 }),
        withTiming(0.75, { duration: dur * 0.68 }),
        withTiming(0,    { duration: dur * 0.2  }),
      ));
      scale.value = withDelay(delay, withSequence(
        withTiming(1.15, { duration: dur * 0.3 }),
        withTiming(0.9,  { duration: dur * 0.4 }),
        withTiming(0.7,  { duration: dur * 0.3 }),
      ));
      rotate.value = withDelay(delay, withRepeat(
        withSequence(
          withTiming(12,  { duration: 1800 }),
          withTiming(-12, { duration: 1800 }),
        ), -1, true
      ));
      driftX.value = withDelay(delay, withRepeat(
        withSequence(
          withTiming(18,  { duration: 2200 }),
          withTiming(-18, { duration: 2200 }),
        ), -1, true
      ));
    };
    run();
    const id = setInterval(run, dur + delay + 200);
    return () => clearInterval(id);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: driftX.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.Text pointerEvents="none" style={[{ position: 'absolute', left: x * SW, fontSize: size }, animStyle]}>
      {icon}
    </Reanimated.Text>
  );
}

export default function LoginScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [checking,        setChecking]        = useState(true);
  const [view,            setView]            = useState<'landing' | 'form'>('landing');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const [username,        setUsername]        = useState('');
  const [password,        setPassword]        = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [googleLoading,   setGoogleLoading]   = useState(false);
  const [error,           setError]           = useState('');

  const slideAnim = useRef(new Animated.Value(SH)).current;

  useEffect(() => {
    getMe()
      .then(user => { if (user) router.replace('/(home)/feed'); else setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  // ─── Google Sign-In via native account picker ────────────────────────
  const handleGooglePress = async () => {
    if (!GOOGLE_WEB_CLIENT_ID && !GOOGLE_ANDROID_CLIENT_ID) {
      setShowGoogleModal(true);
      return;
    }
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) {
        Alert.alert('Login Google', 'Tidak mendapat token dari Google. Coba lagi.');
        return;
      }
      await loginWithGoogle(idToken);
      router.replace('/(home)/feed');
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled, do nothing
      } else if (e?.code === statusCodes.IN_PROGRESS) {
        // sign in already in progress
      } else if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services tidak tersedia', 'Update Google Play Services lalu coba lagi.');
      } else {
        Alert.alert('Login Google Gagal', e instanceof Error ? e.message : 'Coba lagi.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const openForm = () => {
    setView('form');
    Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
  };

  const closeForm = () => {
    Animated.timing(slideAnim, { toValue: SH, duration: 280, useNativeDriver: true })
      .start(() => setView('landing'));
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError('Username dan password wajib diisi.'); return; }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      router.replace('/(home)/feed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login gagal. Coba lagi.';
      if (msg.toLowerCase().includes('suspended')) {
        Alert.alert('Account Suspended', 'Akunmu telah disuspend. Hubungi support.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={BRAND_GREEN} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Pink + pastel yellow gradient base */}
      <LinearGradient
        colors={['#FF6EB4', '#FF9CC2', '#FFB8D1', '#FFD9A8', '#FFE8C2']}
        locations={[0, 0.25, 0.5, 0.78, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Bokeh glow blobs */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {BLOBS.map((b, i) => <GlowBlob key={i} {...b} />)}
      </View>

      {/* Animated floating icons */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {BG_ICONS.map((item, i) => <FloatingIcon key={i} {...item} />)}
      </View>

      {/* Landing */}
      <View style={[styles.landing, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.heroSection}>
          {/* Brand title */}
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>Kyu</Text>
            <Text style={styles.brandNameAccent}>Live</Text>
          </View>
          <Text style={styles.welcomeText}>Chat, game & seru bareng!</Text>
          <Text style={styles.tagline}>Dari pada bengong yuk kita curcol di party room.</Text>
        </View>

        <View style={styles.buttonStack}>
          {/* Login via Google */}
          <TouchableOpacity
            style={styles.btnGoogle}
            activeOpacity={0.82}
            onPress={handleGooglePress}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color="#4285F4" size="small" />
            ) : (
              <>
                <GoogleGIcon size={28} />
                <Text style={styles.btnGoogleText}>Login via Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Login via Akun → form */}
          <TouchableOpacity style={styles.btnAkun} activeOpacity={0.82} onPress={openForm}>
            <LinearGradient
              colors={['#9B6FFF', '#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnAkunInner}
            >
              <Text style={styles.btnAkunText}>🔑 Login via Akun</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.legalRow}>
          <Ionicons name="checkbox" size={18} color="#6EE7B7" style={{ marginTop: 1 }} />
          <Text style={styles.legalText}>
            {' '}Masuk ke aplikasi berarti Anda menyetujui{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://web.chatmeapp.my.id/privacy')}>
              Perjanjian privasi
            </Text>
            {', '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://web.chatmeapp.my.id/child')}>
              Kebijakan Perlindungan Anak
            </Text>
            {', dan '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://web.chatmeapp.my.id/terms')}>
              Ketentuan Layanan
            </Text>
            {' kami.'}
          </Text>
        </View>
      </View>

      {/* Sliding Login Form */}
      {view === 'form' && (
        <Animated.View style={[styles.formSheet, { transform: [{ translateY: slideAnim }] }]}>
          <LinearGradient
            colors={['rgba(16,185,129,0.12)', WHITE]}
            locations={[0, 0.3]}
            style={StyleSheet.absoluteFill}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sheetHandle} />
              <TouchableOpacity style={styles.closeBtn} onPress={closeForm}>
                <Ionicons name="chevron-down" size={28} color="#6B7280" />
              </TouchableOpacity>

              <Text style={styles.formTitle}>Login via Akun</Text>
              <Text style={styles.formSubtitle}>Masuk dengan username dan password</Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
                  <Text style={styles.errorText}> {error}</Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Masukkan username"
                placeholderTextColor="#9CA3AF"
                value={username}
                onChangeText={v => { setUsername(v); setError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
              />

              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passWrap}>
                <TextInput
                  style={styles.passInput}
                  placeholder="Masukkan password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={v => { setPassword(v); setError(''); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Lupa password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.84}
              >
                <LinearGradient
                  colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginBtnGrad}
                >
                  {loading ? <ActivityIndicator color={WHITE} /> : <Text style={styles.loginBtnText}>Masuk</Text>}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.divRow}>
                <View style={styles.divLine} />
                <Text style={styles.divText}>atau</Text>
                <View style={styles.divLine} />
              </View>

              <TouchableOpacity style={styles.registerBtn} onPress={() => router.push('/register')} activeOpacity={0.84}>
                <Text style={styles.registerBtnText}>Daftar Akun Baru</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      )}

      {/* Google setup status modal */}
      <Modal
        visible={showGoogleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGoogleModal(false)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowGoogleModal(false)} />
        <View style={[styles.googleSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.googleSheetTitle}>Setup Google Login</Text>
          <Text style={styles.googleSheetSub}>Hampir selesai — 1 langkah lagi</Text>

          {/* Status rows — dinamis berdasarkan env var */}
          <View style={styles.statusList}>
            <View style={styles.statusRow}>
              <Ionicons
                name={GOOGLE_ANDROID_CLIENT_ID ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={GOOGLE_ANDROID_CLIENT_ID ? '#10B981' : '#EF4444'}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.statusLabel}>Android Client ID</Text>
                <Text style={styles.statusValue}>
                  {GOOGLE_ANDROID_CLIENT_ID ? '✅ Sudah tersimpan' : '❌ Belum diset'}
                </Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <Ionicons
                name={GOOGLE_WEB_CLIENT_ID ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={GOOGLE_WEB_CLIENT_ID ? '#10B981' : '#EF4444'}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.statusLabel}>Web Client ID</Text>
                <Text style={styles.statusValue}>
                  {GOOGLE_WEB_CLIENT_ID ? '✅ Sudah tersimpan' : '❌ Belum diset'}
                </Text>
              </View>
            </View>
          </View>

          {/* Instruction */}
          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>📋 Langkah setup Google Login:</Text>
            <Text style={styles.instructionStep}>
              {'1. Buka halaman Web Client yang tadi (scroll UP)'}
            </Text>
            <Text style={styles.instructionStep}>
              {'2. Di "Authorized redirect URIs" → tambahkan:'}
            </Text>
            <View style={styles.uriBox}>
              <Text style={styles.uriText}>https://auth.expo.io/@mig33/max99</Text>
            </View>
            <Text style={styles.instructionStep}>
              {'3. Klik Save → scroll UP → copy '}
              <Text style={styles.codeText}>Client ID</Text>
            </Text>
            <Text style={styles.instructionStep}>
              {'4. Format: 229886...apps.googleusercontent.com'}
            </Text>

            <View style={styles.warningBox}>
              <Ionicons name="information-circle-outline" size={16} color="#D97706" />
              <Text style={styles.warningText}>
                {' "GOCSPX-..." = Client Secret (tidak dibutuhkan). Yang perlu adalah Client ID di bagian atas halaman.'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.googleSetupBtn} onPress={() => setShowGoogleModal(false)}>
            <Text style={styles.googleSetupBtnText}>Mengerti</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#FF6EB4' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6EB4' },
  floatingIcon:  { position: 'absolute' },

  landing: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 28 },

  /* ── Brand hero ── */
  heroSection: { marginTop: 12, alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 10 },
  brandName: {
    color: WHITE,
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(180,0,80,0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  brandNameAccent: {
    color: '#FFE066',
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(180,100,0,0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  welcomeText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tagline: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },

  /* ── Buttons ── */
  buttonStack: { gap: 13, marginBottom: 8 },

  btnGoogle: {
    backgroundColor: WHITE, borderRadius: 32, height: 60,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  btnGoogleText: { color: '#1F2937', fontSize: 17, fontWeight: '700' },

  btnAkun: {
    borderRadius: 32, height: 60, overflow: 'hidden',
    shadowColor: PURPLE_BTN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 9,
  },
  btnAkunInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  btnAkunText: { color: WHITE, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  legalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4 },
  legalText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18 },
  legalLink:  { color: '#6EE7B7', fontWeight: '600' },

  /* Form sheet */
  formSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden', top: SH * 0.12,
  },
  formContent: { paddingHorizontal: 28, paddingTop: 8 },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 6, marginTop: 10,
  },
  closeBtn:     { alignSelf: 'center', padding: 6, marginBottom: 6 },
  formTitle:    { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 6, textAlign: 'center' },
  formSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 28 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEE2E2', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20,
  },
  errorText: { color: '#DC2626', fontSize: 14, flex: 1 },

  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#F3F4F6', borderRadius: 14, height: 54,
    paddingHorizontal: 18, fontSize: 16, color: '#111827', marginBottom: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  passWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 14, height: 54,
    borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 8, paddingRight: 12,
  },
  passInput: { flex: 1, height: 54, paddingHorizontal: 18, fontSize: 16, color: '#111827' },
  eyeBtn:    { padding: 8 },

  forgotBtn:  { alignSelf: 'flex-end', marginTop: 4, marginBottom: 24 },
  forgotText: { color: BRAND_GREEN_DARK, fontSize: 14, fontWeight: '600' },

  loginBtn:     { borderRadius: 14, overflow: 'hidden', height: 56 },
  loginBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginBtnText: { color: WHITE, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },

  divRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  divText: { color: '#9CA3AF', fontSize: 14, marginHorizontal: 16 },

  registerBtn: {
    height: 56, borderRadius: 14,
    borderWidth: 1.5, borderColor: BRAND_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  registerBtnText: { color: BRAND_GREEN_DARK, fontSize: 17, fontWeight: '700' },

  /* Google modal */
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  googleSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 14, minHeight: 300,
  },
  googleSheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: 12 },
  googleSheetSub:   { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  googleSetupCard: {
    backgroundColor: '#F0FDF4', borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  googleSetupTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 10, marginBottom: 8 },
  googleSetupDesc:  { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  googleSetupBtn: {
    marginTop: 16, backgroundColor: BRAND_GREEN, alignSelf: 'center',
    borderRadius: 12, paddingHorizontal: 40, paddingVertical: 12,
  },
  googleSetupBtnText: { color: WHITE, fontWeight: '700', fontSize: 15 },

  /* Status rows */
  statusList: { gap: 10, marginBottom: 16 },
  statusRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12 },
  statusLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  statusValue: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  /* Instructions */
  instructionCard: {
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16,
  },
  instructionTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 8 },
  instructionStep:  { fontSize: 12.5, color: '#78350F', lineHeight: 20 },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: '#FEF3C7', color: '#92400E' },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, marginTop: 10,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  warningText: { fontSize: 11.5, color: '#B45309', flex: 1, lineHeight: 17 },

  uriBox: {
    backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    marginVertical: 6,
  },
  uriText: {
    color: '#34D399', fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
