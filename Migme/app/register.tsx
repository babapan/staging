import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { register, loginWithGoogle } from '../services/auth';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: ['openid', 'email', 'profile'], offlineAccess: false });

function GoogleGIcon({ size = 24 }: { size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, marginRight: 10 }}>
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
      <View style={{ position: 'absolute', top: size * 0.18, left: size * 0.18, width: size * 0.64, height: size * 0.64, borderRadius: size * 0.32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.42, fontWeight: '800', color: '#4285F4', lineHeight: size * 0.46 }}>G</Text>
      </View>
    </View>
  );
}

async function getDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId();
    }
    if (Platform.OS === 'ios') {
      return await Application.getIosIdForVendorAsync();
    }
  } catch {}
  return null;
}

const AUTH_COLORS = {
  background: '#070D1A',
  field: '#111827',
  border: '#202A3D',
  text: '#F7FAFF',
  muted: '#9CA7BC',
  placeholder: '#68758C',
  accent: '#08D6AD',
  accentText: '#06251F',
  errorBg: '#2A111A',
  errorBorder: '#B84B68',
  errorText: '#FF9CB0',
};

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedEmail = email.trim();

    setError('');

    if (!trimmedUsername || trimmedUsername.length < 6) {
      setError('Username minimal 6 karakter.');
      return;
    }
    if (trimmedUsername.length > 18) {
      setError('Username maksimal 18 karakter.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
      setError('Username harus huruf kecil semua (tidak boleh ada huruf besar). Hanya boleh huruf kecil, angka, dan underscore.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama.');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      await register(trimmedUsername, trimmedEmail, password, trimmedDisplayName || trimmedUsername, deviceId);
      Alert.alert(
        'Registrasi Berhasil!',
        'Akun berhasil dibuat. Cek email kamu untuk verifikasi, lalu login.',
        [{ text: 'Login Sekarang', onPress: () => router.replace('/') }],
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registrasi gagal. Coba lagi.';
      if (msg.includes('REGISTRATION_DISABLED') || msg.includes('sedang ditutup')) {
        Alert.alert(
          'Registrasi Ditutup',
          'Pendaftaran akun baru sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
          [{ text: 'Mengerti' }],
        );
      } else if (msg.includes('batas maksimal') || msg.includes('DEVICE_LIMIT_REACHED')) {
        Alert.alert(
          'Batas Akun Tercapai',
          'Perangkat ini sudah mencapai batas maksimal 5 akun. Kamu tidak dapat membuat akun baru dari perangkat ini.',
          [{ text: 'Mengerti' }],
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePress = async () => {
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut().catch(() => {});
      const result = await GoogleSignin.signIn();
      const idToken = (result as any)?.data?.idToken ?? (result as any)?.idToken;
      if (!idToken) throw new Error('Token Google tidak tersedia');
      await loginWithGoogle(idToken);
      router.replace('/(home)');
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Login Google Gagal', e?.message ?? 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 58, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Buat Akun</Text>
        <Text style={styles.subtitle}>Bergabunglah dengan komunitas max99</Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Username *</Text>
          <TextInput
            style={styles.input}
            placeholder="username_kamu"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={username}
            onChangeText={(v) => { setUsername(v.toLowerCase()); setError(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={18}
            returnKeyType="next"
            editable={!loading}
            testID="input-username"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nama Tampilan</Text>
          <TextInput
            style={styles.input}
            placeholder="Nama kamu (opsional)"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={displayName}
            onChangeText={(v) => { setDisplayName(v); setError(''); }}
            returnKeyType="next"
            editable={!loading}
            testID="input-display-name"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="email@kamu.com"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            editable={!loading}
            testID="input-email"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Min. 6 karakter"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            secureTextEntry
            returnKeyType="next"
            editable={!loading}
            testID="input-password"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Konfirmasi Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ulangi password"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
            editable={!loading}
            testID="input-confirm-password"
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={handleRegister}
          testID="button-register"
          disabled={loading}
          activeOpacity={0.86}
        >
          {loading ? (
            <ActivityIndicator color={AUTH_COLORS.accentText} />
          ) : (
            <Text style={styles.primaryButtonText}>Daftar Sekarang</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>atau</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, (googleLoading || loading) && styles.disabledButton]}
          onPress={handleGooglePress}
          disabled={googleLoading || loading}
          activeOpacity={0.86}
        >
          {googleLoading ? (
            <ActivityIndicator color={AUTH_COLORS.text} />
          ) : (
            <>
              <GoogleGIcon size={26} />
              <Text style={styles.googleButtonText}>Daftar via Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Sudah punya akun? </Text>
          <TouchableOpacity onPress={() => router.replace('/')} testID="link-login">
            <Text style={styles.footerLink}>Masuk</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_COLORS.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: AUTH_COLORS.background,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 30,
  },
  title: {
    color: AUTH_COLORS.text,
    fontSize: 34,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: AUTH_COLORS.muted,
    fontSize: 18,
    lineHeight: 25,
    marginTop: 8,
    marginBottom: 42,
  },
  errorBanner: {
    backgroundColor: AUTH_COLORS.errorBg,
    borderWidth: 1,
    borderColor: AUTH_COLORS.errorBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 22,
  },
  errorText: {
    color: AUTH_COLORS.errorText,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    color: AUTH_COLORS.muted,
    fontSize: 16,
    marginBottom: 9,
  },
  input: {
    backgroundColor: AUTH_COLORS.field,
    borderColor: AUTH_COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: AUTH_COLORS.text,
    fontSize: 18,
    minHeight: 66,
    paddingHorizontal: 20,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AUTH_COLORS.accent,
    borderRadius: 10,
    minHeight: 66,
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: AUTH_COLORS.accentText,
    fontSize: 18,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: AUTH_COLORS.muted,
    fontSize: 17,
  },
  footerLink: {
    color: AUTH_COLORS.accent,
    fontSize: 17,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: AUTH_COLORS.border,
  },
  dividerText: {
    color: AUTH_COLORS.muted,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2235',
    borderWidth: 1,
    borderColor: AUTH_COLORS.border,
    borderRadius: 10,
    minHeight: 66,
    marginBottom: 4,
  },
  googleButtonText: {
    color: AUTH_COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
});
