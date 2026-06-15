import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { forgotPassword } from '../services/auth';

const AUTH_COLORS = {
  background: '#070D1A',
  field: '#111827',
  border: '#202A3D',
  text: '#F7FAFF',
  muted: '#9CA7BC',
  placeholder: '#68758C',
  accent: '#08D6AD',
  accentText: '#06251F',
  divider: '#243047',
  errorBg: '#2A111A',
  errorBorder: '#B84B68',
  errorText: '#FF9CB0',
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = makeStyles();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!emailOrUsername.trim()) {
      setError('Masukkan email atau username kamu.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(emailOrUsername.trim());
      setSent(true);
    } catch (e: any) {
      setError(e?.message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Email Terkirim!</Text>
        <Text style={styles.successDesc}>
          Jika akun dengan email atau username tersebut ada, kami sudah mengirimkan link reset password.
          Periksa kotak masuk (dan folder spam) kamu.{'\n\n'}
          Link berlaku selama <Text style={{ fontWeight: '700', color: AUTH_COLORS.accent }}>1 jam</Text>.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/')}
          testID="button-back-login"
        >
          <Text style={styles.primaryButtonText}>Kembali ke Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          testID="button-back"
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>?</Text>
          </View>
          <Text style={styles.title}>Lupa Password?</Text>
          <Text style={styles.subtitle}>
            Masukkan email atau username akun kamu. Kami akan mengirimkan link untuk membuat password baru.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formSection}>
          <Text style={styles.label}>Email atau Username</Text>
          <TextInput
            style={styles.input}
            placeholder="contoh@email.com atau username"
            placeholderTextColor={AUTH_COLORS.placeholder}
            value={emailOrUsername}
            onChangeText={(v) => { setEmailOrUsername(v); setError(''); }}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            testID="input-email-or-username"
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            testID="button-send-reset"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Kirim Link Reset</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.loginLinkRow}
          onPress={() => router.replace('/')}
          testID="button-go-login"
        >
          <Text style={styles.loginLinkText}>
            Ingat password? <Text style={styles.loginLinkAccent}>Login sekarang</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: AUTH_COLORS.background,
    },
    scroll: {
      flex: 1,
      backgroundColor: AUTH_COLORS.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 40,
      width: '100%',
      maxWidth: 460,
      alignSelf: 'center',
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    backArrow: {
      fontSize: 28,
      color: AUTH_COLORS.accent,
      marginRight: 4,
      lineHeight: 32,
    },
    backText: {
      fontSize: 15,
      color: AUTH_COLORS.accent,
      fontWeight: '600',
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingTop: 24,
      paddingBottom: 8,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: AUTH_COLORS.field,
      borderWidth: 1,
      borderColor: AUTH_COLORS.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    iconEmoji: {
      fontSize: 36,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: AUTH_COLORS.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: AUTH_COLORS.muted,
      textAlign: 'center',
      lineHeight: 21,
    },
    errorBanner: {
      marginHorizontal: 20,
      marginTop: 16,
      backgroundColor: AUTH_COLORS.errorBg,
      borderWidth: 1,
      borderColor: AUTH_COLORS.errorBorder,
      borderRadius: 8,
      padding: 12,
    },
    errorText: {
      color: AUTH_COLORS.errorText,
      fontSize: 13,
    },
    formSection: {
      marginTop: 28,
      paddingHorizontal: 20,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: AUTH_COLORS.muted,
      marginBottom: 6,
      marginLeft: 2,
    },
    input: {
      height: 48,
      borderWidth: 1.5,
      borderColor: AUTH_COLORS.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
      color: AUTH_COLORS.text,
      backgroundColor: AUTH_COLORS.field,
      marginBottom: 20,
    },
    primaryButton: {
      backgroundColor: AUTH_COLORS.accent,
      borderRadius: 10,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: AUTH_COLORS.accentText,
      fontSize: 16,
      fontWeight: '700',
    },
    loginLinkRow: {
      alignItems: 'center',
      marginTop: 28,
    },
    loginLinkText: {
      fontSize: 14,
      color: AUTH_COLORS.muted,
    },
    loginLinkAccent: {
      color: AUTH_COLORS.accent,
      fontWeight: '600',
    },
    successIcon: {
      fontSize: 60,
      marginBottom: 20,
    },
    successTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: AUTH_COLORS.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    successDesc: {
      fontSize: 15,
      color: AUTH_COLORS.muted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
  });
}
