/**
 * chatThemes.ts
 *
 * Chat room theme mapping — mirrors CHATROOM_THEMES in server/gateway.ts
 * (com.projectgoth.fusion ThemeEnum)
 *
 * Persisted via AsyncStorage key: mig_chat_theme_id
 * Default: themeId 2 (Light)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHAT_THEME_STORAGE_KEY = 'mig_chat_theme_id';
export const DEFAULT_THEME_ID = 2;

export interface ChatroomTheme {
  themeId: number;
  name: string;
  background_color: string;
  background_img_url: string | null;
  background_img_alignment: number;
  sender_username_color: string;
  sender_message_color: string;
  recp_username_color: string;
  recp_message_color: string;
  admin_username_color: string;
  admin_message_color: string;
  emote_message_color: string;
  error_message_color: string;
  server_username_color: string;
  server_message_color: string;
  client_message_color: string;
}

/**
 * All available chatroom themes.
 * Mirrors Java ThemeEnum in com.projectgoth.fusion — all themes are free.
 */
export const CHATROOM_THEMES: ChatroomTheme[] = [
  {
    themeId: 1, name: 'Dark',
    background_color: '1A1A2E', background_img_url: null, background_img_alignment: 0,
    sender_username_color: '2196F3', sender_message_color: 'FFFFFF',
    recp_username_color:   '2196F3', recp_message_color:   'FFFFFF',
    admin_username_color:  'F47422', admin_message_color:  'FCC504',
    emote_message_color:   'DD587A', error_message_color:  'FF4444',
    server_username_color: '607D8B', server_message_color: '9E9E9E',
    client_message_color:  'FFFFFF',
  },
  {
    themeId: 2, name: 'Light',
    background_color: 'F5F5F5', background_img_url: null, background_img_alignment: 0,
    sender_username_color: '1565C0', sender_message_color: '212121',
    recp_username_color:   '1565C0', recp_message_color:   '212121',
    admin_username_color:  'E65100', admin_message_color:  'F57F17',
    emote_message_color:   'C2185B', error_message_color:  'D32F2F',
    server_username_color: '546E7A', server_message_color: '616161',
    client_message_color:  '212121',
  },
  {
    themeId: 3, name: 'Ocean',
    background_color: '002244', background_img_url: null, background_img_alignment: 0,
    sender_username_color: '00BCD4', sender_message_color: 'E0F7FA',
    recp_username_color:   '00BCD4', recp_message_color:   'E0F7FA',
    admin_username_color:  'FF6F00', admin_message_color:  'FFCA28',
    emote_message_color:   '18FFFF', error_message_color:  'FF5252',
    server_username_color: '4DD0E1', server_message_color: '80DEEA',
    client_message_color:  'E0F7FA',
  },
  {
    themeId: 4, name: 'Forest',
    background_color: '1B4332', background_img_url: null, background_img_alignment: 0,
    sender_username_color: '69F0AE', sender_message_color: 'E8F5E9',
    recp_username_color:   '69F0AE', recp_message_color:   'E8F5E9',
    admin_username_color:  'FFD600', admin_message_color:  'FFF176',
    emote_message_color:   'CCFF90', error_message_color:  'FF6E40',
    server_username_color: 'A5D6A7', server_message_color: 'C8E6C9',
    client_message_color:  'E8F5E9',
  },
  {
    themeId: 5, name: 'Sunset',
    background_color: '3D0C0C', background_img_url: null, background_img_alignment: 0,
    sender_username_color: 'FF7043', sender_message_color: 'FFF3E0',
    recp_username_color:   'FF7043', recp_message_color:   'FFF3E0',
    admin_username_color:  'FFCA28', admin_message_color:  'FFE082',
    emote_message_color:   'FF8A65', error_message_color:  'FF1744',
    server_username_color: 'FFAB91', server_message_color: 'FFCCBC',
    client_message_color:  'FFF3E0',
  },
  {
    themeId: 6, name: 'Purple',
    background_color: '1A0033', background_img_url: null, background_img_alignment: 0,
    sender_username_color: 'CE93D8', sender_message_color: 'F3E5F5',
    recp_username_color:   'CE93D8', recp_message_color:   'F3E5F5',
    admin_username_color:  'FFD600', admin_message_color:  'FFF9C4',
    emote_message_color:   'EA80FC', error_message_color:  'FF4081',
    server_username_color: 'B39DDB', server_message_color: 'D1C4E9',
    client_message_color:  'F3E5F5',
  },
  {
    themeId: 7, name: 'Carbon',
    background_color: '1C1C1C', background_img_url: null, background_img_alignment: 0,
    sender_username_color: '78909C', sender_message_color: 'ECEFF1',
    recp_username_color:   '78909C', recp_message_color:   'ECEFF1',
    admin_username_color:  'FF6F00', admin_message_color:  'FFC107',
    emote_message_color:   '80CBC4', error_message_color:  'EF5350',
    server_username_color: '546E7A', server_message_color: '90A4AE',
    client_message_color:  'ECEFF1',
  },
];

export function getThemeById(id: number): ChatroomTheme {
  return CHATROOM_THEMES.find(t => t.themeId === id) ?? CHATROOM_THEMES[0];
}

export function hex(color: string): string {
  return color.startsWith('#') ? color : `#${color}`;
}

export async function loadSavedThemeId(): Promise<number> {
  try {
    const saved = await AsyncStorage.getItem(CHAT_THEME_STORAGE_KEY);
    if (saved) return parseInt(saved, 10) || DEFAULT_THEME_ID;
  } catch {}
  return DEFAULT_THEME_ID;
}

export async function saveThemeId(id: number): Promise<void> {
  await AsyncStorage.setItem(CHAT_THEME_STORAGE_KEY, String(id));
}
