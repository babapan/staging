import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { networkMonitor } from '../services/networkMonitor';
import { notificationService } from '../services/notificationService';
import { ThemeProvider, useAppTheme } from '../services/themeContext';
import { FontSizeProvider } from '../services/fontSizeContext';
import { LanguageProvider } from '../services/languageContext';

// Status bar yang mengikuti tema aktif (warna & gaya icon)
function ThemedStatusBar() {
  const theme = useAppTheme();
  // Tentukan warna icon berdasarkan terang/gelapnya header
  const h = theme.headerBg.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const iconStyle = lum < 0.6 ? 'light' : 'dark';
  return (
    <StatusBar
      style={iconStyle}
      backgroundColor={theme.headerBg}
      translucent={false}
    />
  );
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // ── App-level services (mirrors NetworkService.onCreate → init()) ────────
  useEffect(() => {
    // Start network monitoring (WiFi/Mobile detection + online/offline events)
    // Mirrors: ConnectivityManager + NetworkBroadcastReceiver registration
    networkMonitor.start();

    // Init push notifications (permission request + channel setup)
    // Mirrors: NotificationHandler + AppEvents.Notification.UPDATE_AVAILABLE listener
    notificationService.init().catch(() => {});

    return () => {
      networkMonitor.stop();
      notificationService.destroy();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <LanguageProvider>
      <FontSizeProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="register" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="(home)" />
          </Stack>
          <ThemedStatusBar />
      </FontSizeProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
