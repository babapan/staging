import { Platform } from 'react-native';
import { getSession } from './storage';
import { API_BASE } from './auth';

// Mirrors: com/projectgoth/fusion/restapi/data/SettingsEnums.java
// Enum constants match Java int values exactly

export interface PrivacySettings {
  // Profile Details (SettingsProfileDetailsData)
  dobPrivacy: number;           // 0=HIDE 1=SHOW_FULL 2=SHOW_WITHOUT_YEAR
  firstLastNamePrivacy: number; // 0=HIDE 1=SHOW
  mobilePhonePrivacy: number;   // 0=HIDE 1=EVERYONE 2=FRIEND_ONLY
  externalEmailPrivacy: number; // 0=HIDE 1=EVERYONE 2=FRIEND_ONLY 3=FOLLOWER_ONLY
  // Account Communication (SettingsAccountCommunicationData)
  chatPrivacy: number;          // 1=EVERYONE 2=FRIEND_ONLY 3=FOLLOWER_ONLY
  buzzPrivacy: number;          // 1=ON 0=OFF
  lookoutPrivacy: number;       // 1=ON 0=OFF
  footprintsPrivacy: number;    // 0=HIDE 1=EVERYONE 2=FRIEND_ONLY 3=FOLLOWER_ONLY
  feedPrivacy: number;          // 1=EVERYONE 2=FRIEND_OR_FOLLOWER
  // Activity/Event Privacy (EventPrivacySetting)
  activityStatusUpdates: boolean;
  activityProfileChanges: boolean;
  activityAddFriends: boolean;
  activityPhotosPublished: boolean;
  activityContentPurchased: boolean;
  activityChatroomCreation: boolean;
  activityVirtualGifting: boolean;
}

// Default values matching Java PRIVACY_DEFAULT_* constants
export const PRIVACY_DEFAULTS: PrivacySettings = {
  dobPrivacy: 0,
  firstLastNamePrivacy: 0,
  mobilePhonePrivacy: 0,
  externalEmailPrivacy: 0,
  chatPrivacy: 1,
  buzzPrivacy: 1,
  lookoutPrivacy: 1,
  footprintsPrivacy: 0,
  feedPrivacy: 1,
  activityStatusUpdates: true,
  activityProfileChanges: true,
  activityAddFriends: false,
  activityPhotosPublished: true,
  activityContentPurchased: true,
  activityChatroomCreation: true,
  activityVirtualGifting: true,
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

export async function getPrivacySettings(username: string): Promise<PrivacySettings> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/settings/privacy/${encodeURIComponent(username)}`, {
      headers, ...fetchOptions(),
    });
    if (!res.ok) return PRIVACY_DEFAULTS;
    return await res.json();
  } catch {
    return PRIVACY_DEFAULTS;
  }
}

export async function updatePrivacySettings(
  username: string,
  updates: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  const headers = await buildHeaders();
  const res = await fetch(`${API_BASE}/api/settings/privacy/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers,
    ...fetchOptions(),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to update privacy settings');
  return data.settings;
}
