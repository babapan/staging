/**
 * themeContext.tsx
 *
 * Global app theme system.
 * Derives app-wide UI colors from the selected ChatroomTheme
 * (stored in AsyncStorage as mig_chat_theme_id).
 *
 * Usage:
 *   const theme = useAppTheme();
 *   style={{ backgroundColor: theme.screenBg, color: theme.textPrimary }}
 *
 * Login & Register screens also use useAppTheme() so they adapt to the
 * selected theme like the rest of the app.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHATROOM_THEMES,
  CHAT_THEME_STORAGE_KEY,
  DEFAULT_THEME_ID,
  getThemeById,
  type ChatroomTheme,
} from '../constants/chatThemes';

// ─── AppTheme ────────────────────────────────────────────────────────────────
// Semantic color tokens used across every screen / component.
export interface AppTheme {
  id: number;
  name: string;
  isDark: boolean;

  // ── Surfaces ──────────────────────────────────────────────────────────────
  headerBg: string;      // App header / navigation bar
  screenBg: string;      // Page / screen background
  cardBg: string;        // Cards, list items, modals
  drawerBg: string;      // Side drawer panel
  inputBg: string;       // Text input field background

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary: string;   // Main body text
  textSecondary: string; // Subtitles, hints, timestamps
  textOnAccent: string;  // Text drawn on top of accent-colored buttons

  // ── Accent / brand ────────────────────────────────────────────────────────
  accent: string;        // Primary action color (buttons, active tabs, icons)
  accentSoft: string;    // Light tint of accent for backgrounds

  // ── Dividers / borders ────────────────────────────────────────────────────
  divider: string;       // Thin separator lines
  border: string;        // Card / input borders

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBg: string;
  tabActiveColor: string;
  tabInactiveColor: string;
  tabBorder: string;

  // ── Raw chatroom theme (for chat screens) ─────────────────────────────────
  chatTheme: ChatroomTheme;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  const toHex  = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r + amount)}${toHex(g + amount)}${toHex(b + amount)}`;
}

function darken(hex: string, amount: number): string {
  return lighten(hex, -amount);
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Derive AppTheme from ChatroomTheme ──────────────────────────────────────
const SEA_BLUE_HEADER = '#0D9488';
const SEA_BLUE_ACCENT = '#00A8CC';
const SEA_BLUE_ACCENT_SOFT = '#E6F7FB';

export function deriveAppTheme(chatTheme: ChatroomTheme): AppTheme {
  const bg      = `#${chatTheme.background_color}`;
  const accent  = `#${chatTheme.sender_username_color}`;
  const textPri = `#${chatTheme.client_message_color}`;
  const textSec = `#${chatTheme.server_message_color}`;
  const dark    = luminance(bg) < 0.45;

  if (dark) {
    // ── Dark theme ──────────────────────────────────────────────────────────
    const cardBg   = lighten(bg, 18);
    const drawerBg = lighten(bg, 10);
    const inputBg  = lighten(bg, 25);
    const headerBg = darken(bg, 12);

    return {
      id:   chatTheme.themeId,
      name: chatTheme.name,
      isDark: true,

      headerBg,
      screenBg:  bg,
      cardBg,
      drawerBg,
      inputBg,

      textPrimary:   textPri,
      textSecondary: textSec,
      textOnAccent:  '#FFFFFF',

      accent,
      accentSoft: withAlpha(accent, 0.18),

      divider: withAlpha('#FFFFFF', 0.10),
      border:  withAlpha('#FFFFFF', 0.15),

      tabBg:           cardBg,
      tabActiveColor:  accent,
      tabInactiveColor: textSec,
      tabBorder:       withAlpha('#FFFFFF', 0.08),

      chatTheme,
    };
  } else {
    // ── Light theme ─────────────────────────────────────────────────────────
    // Header pakai teal tetap agar konsisten, tidak berubah-ubah per tema
    const headerBg = SEA_BLUE_HEADER;

    return {
      id:   chatTheme.themeId,
      name: chatTheme.name,
      isDark: false,

      headerBg,
      screenBg:  '#F7F7F7',
      cardBg:    '#FFFFFF',
      drawerBg:  '#F5F5F5',
      inputBg:   '#FFFFFF',

      textPrimary:   '#212121',
      textSecondary: '#757575',
      textOnAccent:  '#FFFFFF',

      accent:     SEA_BLUE_ACCENT,
      accentSoft: SEA_BLUE_ACCENT_SOFT,

      divider: '#E0E0E0',
      border:  '#E0E0E0',

      tabBg:           '#FFFFFF',
      tabActiveColor:  SEA_BLUE_ACCENT,
      tabInactiveColor: '#999999',
      tabBorder:        '#D7EDF5',

      chatTheme,
    };
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  theme: AppTheme;
  setThemeId: (id: number) => Promise<void>;
}

const DEFAULT_CHAT_THEME = getThemeById(DEFAULT_THEME_ID);
const DEFAULT_APP_THEME  = deriveAppTheme(DEFAULT_CHAT_THEME);

const ThemeContext = createContext<ThemeContextValue>({
  theme:      DEFAULT_APP_THEME,
  setThemeId: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_APP_THEME);

  useEffect(() => {
    AsyncStorage.getItem(CHAT_THEME_STORAGE_KEY).then(saved => {
      const id       = saved ? (parseInt(saved, 10) || DEFAULT_THEME_ID) : DEFAULT_THEME_ID;
      const chatTheme = getThemeById(id);
      setTheme(deriveAppTheme(chatTheme));
    });
  }, []);

  const setThemeId = useCallback(async (id: number) => {
    await AsyncStorage.setItem(CHAT_THEME_STORAGE_KEY, String(id));
    setTheme(deriveAppTheme(getThemeById(id)));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppTheme(): AppTheme {
  return useContext(ThemeContext).theme;
}

export function useThemeActions() {
  return useContext(ThemeContext);
}
