import { Platform } from 'react-native';
import { getSession } from './storage';
import { API_BASE } from './auth';

// Mirrors UserSettingData.TypeEnum (com/projectgoth/fusion/data/UserSettingData.java)
export const USER_SETTING_TYPE = {
  ANONYMOUS_CALL:      1,
  MESSAGE:             2,  // 0=DISABLED 1=EVERYONE 2=FRIENDS_ONLY
  EMAIL_MENTION:       4,  // 0=DISABLED 1=ENABLED
  EMAIL_REPLY_TO_POST: 5,
  EMAIL_RECEIVE_GIFT:  6,
  EMAIL_NEW_FOLLOWER:  7,
  EMAIL_ALL:           8,
} as const;

export interface NotificationSettings {
  messageSetting: number;       // USER_SETTING_TYPE.MESSAGE value
  emailMention: boolean;
  emailReplyToPost: boolean;
  emailReceiveGift: boolean;
  emailNewFollower: boolean;
}

export const NOTIF_DEFAULTS: NotificationSettings = {
  messageSetting: 2,  // FRIENDS_ONLY (Java default)
  emailMention: false,
  emailReplyToPost: false,
  emailReceiveGift: false,
  emailNewFollower: false,
};

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}

function fetchOptions(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' } : {};
}

// GET /api/settings/notifications/:username
export async function getNotificationSettings(username: string): Promise<NotificationSettings> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/settings/notifications/${encodeURIComponent(username)}`, {
      headers, ...fetchOptions(),
    });
    if (!res.ok) return NOTIF_DEFAULTS;
    return await res.json();
  } catch {
    return NOTIF_DEFAULTS;
  }
}

// PUT /api/settings/notifications/:username
export async function updateNotificationSettings(
  username: string,
  updates: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/settings/notifications/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers,
    ...fetchOptions(),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to update notification settings');
  return data.settings;
}
