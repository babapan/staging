import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPrivacySettings,
  updatePrivacySettings,
  PRIVACY_DEFAULTS,
  type PrivacySettings,
} from '../services/privacy';
import {
  getNotificationSettings,
  updateNotificationSettings,
  NOTIF_DEFAULTS,
  type NotificationSettings,
} from '../services/notifications';
import { API_BASE } from '../services/auth';
import { invalidateAvatarCache } from './AvatarWithFrame';
import { getSession } from '../services/storage';
import * as ImagePicker from 'expo-image-picker';
import {
  CHATROOM_THEMES,
  getThemeById,
  loadSavedThemeId,
} from '../constants/chatThemes';
import { useAppTheme, useThemeActions } from '../services/themeContext';
import { AUTOSCROLL_STORAGE_KEY, setAutoScrollPref } from '../services/autoscrollPref';
import { useLanguage, type LanguageCode } from '../services/languageContext';
import {
  useFontSize,
  FONT_SIZE_OPTIONS,
  type FontSizeLevel,
} from '../services/fontSizeContext';
import Slider from '@react-native-community/slider';

const FB_COLOR  = '#3D5A98';
const TW_COLOR  = '#1DA1F2';
const RED_COLOR = '#C75046';

const LANG_STORAGE_KEY    = 'mig_selected_language';
const SOUND_STORAGE_KEY   = 'mig_sound_enabled';
const VIBRATE_STORAGE_KEY = 'mig_vibrate_enabled';

interface SystemAvatar { id: string; name: string; imageUrl: string; }

type Page =
  | 'main' | 'privacy' | 'system' | 'accountSettings' | 'myAccount'
  | 'editProfile' | 'changeAvatar' | 'chatNotification' | 'thirdPartySites'
  | 'application' | 'aboutMig' | 'language' | 'merchant' | 'chatTheme'
  | 'createCreditPin' | 'adminTools' | 'changeUsername';

const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'ms', name: 'Bahasa Melayu' },
  { id: 'th', name: 'ภาษาไทย' },
  { id: 'zh', name: '中文' },
  { id: 'ar', name: 'العربية' },
  { id: 'hi', name: 'हिन्दी' },
];

const PAGE_TITLE: Record<Page, string> = {
  main: 'Settings', privacy: 'Privacy', system: 'System',
  accountSettings: 'Account settings', myAccount: 'My account',
  editProfile: 'Edit profile', changeAvatar: 'Change avatar',
  chatNotification: 'Chat notification', thirdPartySites: 'Third party sites',
  application: 'Application', aboutMig: 'About mig', language: 'Language',
  merchant: 'Merchant', chatTheme: 'Chat Theme',
  createCreditPin: 'Create PIN', adminTools: 'Admin Tools',
  changeUsername: 'Ganti Username',
};

interface Props {
  visible: boolean; onClose: () => void; onLogout: () => void;
  username?: string | null; initialPage?: Page; onAvatarChange?: () => void;
}

export default function SettingsModal({ visible, onClose, onLogout, username, initialPage, onAvatarChange }: Props) {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();
  const { setThemeId: applyGlobalTheme } = useThemeActions();
  const { fontLevel, setFontLevel } = useFontSize();
  const [page, setPage] = useState<Page>(initialPage ?? 'main');

  useEffect(() => { if (visible) setPage(initialPage ?? 'main'); }, [visible, initialPage]);

  const [privacy, setPrivacy]               = useState<PrivacySettings>(PRIVACY_DEFAULTS);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacySaving, setPrivacySaving]   = useState(false);

  const [soundEnabled, setSoundEnabled]     = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Load auto-scroll preference once on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTOSCROLL_STORAGE_KEY).then((v) => {
      if (v !== null) setAutoScrollEnabled(v === 'true');
    });
  }, []);

  const handleToggleAutoScroll = useCallback(async (v: boolean) => {
    setAutoScrollEnabled(v);
    await setAutoScrollPref(v);
  }, []);

  const [notif, setNotif]               = useState<NotificationSettings>(NOTIF_DEFAULTS);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving]   = useState(false);

  const { language: selectedLanguage, setLanguage } = useLanguage();
  const [langLoading, setLangLoading]           = useState(false);

  const [fbConnected, setFbConnected] = useState(false);
  const [twConnected, setTwConnected] = useState(false);

  const [selectedThemeId, setSelectedThemeId] = useState(1);

  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [newEmail, setNewEmail]       = useState('');
  const [pwLoading, setPwLoading]     = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAboutMe, setProfileAboutMe]         = useState('');
  const [profileGender, setProfileGender]           = useState('');
  const [profileDob, setProfileDob]                 = useState('');
  const [profileCountry, setProfileCountry]         = useState('');
  const [profileCity, setProfileCity]               = useState('');
  const [profileLikes, setProfileLikes]             = useState('');
  const [profileDislikes, setProfileDislikes]       = useState('');
  const [profileRelStatus, setProfileRelStatus]     = useState('1');
  const [profileLoading, setProfileLoading]         = useState(false);
  const [profileSaving, setProfileSaving]           = useState(false);

  const [currentAvatar, setCurrentAvatar]             = useState<string | null>(null);
  const [pendingAvatarUri, setPendingAvatarUri]       = useState<string | null>(null);
  const [pendingAvatarBase64, setPendingAvatarBase64] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading]         = useState(false);
  const [systemAvatars, setSystemAvatars]             = useState<SystemAvatar[]>([]);
  const [systemAvatarsLoading, setSystemAvatarsLoading] = useState(false);
  const [selectedSystemAvatarId, setSelectedSystemAvatarId] = useState<string | null>(null);
  const [applyingSystemAvatar, setApplyingSystemAvatar]     = useState(false);

  const [isMerchant, setIsMerchant]           = useState(false);
  const [merchantData, setMerchantData]       = useState<any>(null);
  const [merchantTag, setMerchantTag]         = useState<any>(null);
  const [merchantLoading, setMerchantLoading] = useState(false);
  const [pinResetting, setPinResetting]       = useState(false);

  // Global admin tools — only visible if /api/system/admin/check returns isAdmin=true.
  // Used to manually bump a user's reputation level without editing the DB.
  const [isAdmin, setIsAdmin]                       = useState(false);
  const [adminLevelUsername, setAdminLevelUsername] = useState('');
  const [adminLevelValue, setAdminLevelValue]       = useState('');
  const [adminLevelCurrent, setAdminLevelCurrent]   = useState<number | null>(null);
  const [adminLookupLoading, setAdminLookupLoading] = useState(false);
  const [adminLevelSaving, setAdminLevelSaving]     = useState(false);

  const [creditPin, setCreditPin]             = useState('');
  const [creditPinConfirm, setCreditPinConfirm] = useState('');
  const [creditPinLoading, setCreditPinLoading] = useState(false);

  const [isGoogleUser, setIsGoogleUser]           = useState(false);
  const [canChangeUsername, setCanChangeUsername] = useState(false);
  const [newUsername, setNewUsername]             = useState('');
  const [usernameError, setUsernameError]         = useState('');
  const [usernameSaving, setUsernameSaving]       = useState(false);

  const loadPrivacy = useCallback(async () => {
    if (!username) return;
    setPrivacyLoading(true);
    const s = await getPrivacySettings(username);
    setPrivacy(s);
    setPrivacyLoading(false);
  }, [username]);

  const loadNotifications = useCallback(async () => {
    if (!username) return;
    setNotifLoading(true);
    try {
      const [sound, vibrate, backendNotif] = await Promise.all([
        AsyncStorage.getItem(SOUND_STORAGE_KEY),
        AsyncStorage.getItem(VIBRATE_STORAGE_KEY),
        getNotificationSettings(username),
      ]);
      if (sound !== null) setSoundEnabled(sound !== 'false');
      if (vibrate !== null) setVibrateEnabled(vibrate === 'true');
      setNotif(backendNotif);
    } finally { setNotifLoading(false); }
  }, [username]);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (Platform.OS !== 'web') { const cookie = await getSession(); if (cookie) headers['Cookie'] = cookie; }
      const res = await fetch(`${API_BASE}/api/profile/me`, {
        headers,
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      if (!res.ok) return;
      const data = await res.json();
      const u = data.user; const p = data.profile;
      setProfileDisplayName(u?.displayName ?? '');
      setProfileAboutMe(p?.aboutMe ?? '');
      setProfileGender(p?.gender ?? '');
      setProfileDob(p?.dateOfBirth ?? '');
      setProfileCountry(p?.country ?? '');
      setProfileCity(p?.city ?? '');
      setProfileLikes(p?.likes ?? '');
      setProfileDislikes(p?.dislikes ?? '');
      setProfileRelStatus(p?.relationshipStatus ? String(p.relationshipStatus) : '1');
      setCurrentAvatar(p?.displayPicture ?? null);
      setIsGoogleUser(!!u?.isGoogleUser);
      setCanChangeUsername(!!u?.canChangeUsername);
    } catch {} finally { setProfileLoading(false); }
  }, []);

  const buildAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (Platform.OS !== 'web') { const cookie = await getSession(); if (cookie) headers['Cookie'] = cookie; }
    return headers;
  }, []);

  // Check if the current user is a global admin. Cheap GET, runs once on open.
  const loadAdminStatus = useCallback(async () => {
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/system/admin/check`, { headers, ...fetchOpts });
      if (!res.ok) { setIsAdmin(false); return; }
      const data = await res.json();
      setIsAdmin(!!data?.isAdmin);
    } catch { setIsAdmin(false); }
  }, [buildAuthHeaders]);

  const handleAdminLookupLevel = useCallback(async () => {
    const target = adminLevelUsername.trim();
    if (!target) { Alert.alert('Lookup', 'Isi username dulu.'); return; }
    setAdminLookupLoading(true); setAdminLevelCurrent(null);
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/system/admin/user-level?username=${encodeURIComponent(target)}`, { headers, ...fetchOpts });
      const body = await res.json();
      if (!res.ok) { Alert.alert('Gagal', body?.message ?? 'Tidak ditemukan.'); return; }
      setAdminLevelCurrent(typeof body?.level === 'number' ? body.level : null);
    } catch { Alert.alert('Error', 'Tidak dapat terhubung ke server.'); }
    finally { setAdminLookupLoading(false); }
  }, [adminLevelUsername, buildAuthHeaders]);

  const handleAdminSetLevel = useCallback(async () => {
    const target = adminLevelUsername.trim();
    const lvl = Number(adminLevelValue);
    if (!target) { Alert.alert('Set Level', 'Isi username dulu.'); return; }
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 100) {
      Alert.alert('Set Level', 'Level harus bilangan bulat 1-100.'); return;
    }
    Alert.alert('Konfirmasi', `Set level ${target} menjadi ${lvl}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Set', onPress: async () => {
        setAdminLevelSaving(true);
        try {
          const headers = await buildAuthHeaders();
          const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
          const res = await fetch(`${API_BASE}/api/system/admin/set-level`, {
            method: 'POST', headers, body: JSON.stringify({ username: target, level: lvl }), ...fetchOpts,
          });
          const body = await res.json();
          if (!res.ok) { Alert.alert('Gagal', body?.message ?? 'Terjadi kesalahan.'); return; }
          setAdminLevelCurrent(typeof body?.level === 'number' ? body.level : lvl);
          Alert.alert('Berhasil', body?.message ?? `${target} sekarang level ${lvl}.`);
        } catch { Alert.alert('Error', 'Tidak dapat terhubung ke server.'); }
        finally { setAdminLevelSaving(false); }
      } },
    ]);
  }, [adminLevelUsername, adminLevelValue, buildAuthHeaders]);

  const loadMerchant = useCallback(async () => {
    if (!username) return;
    setMerchantLoading(true);
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const [mRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/api/merchants/${encodeURIComponent(username)}`, { headers, ...fetchOpts }),
        fetch(`${API_BASE}/api/merchant-tags/tag/${encodeURIComponent(username)}`, { headers, ...fetchOpts }),
      ]);
      if (mRes.ok) { const mData = await mRes.json(); setMerchantData(mData.merchant ?? null); setIsMerchant(true); }
      else { setMerchantData(null); setIsMerchant(false); }
      if (tRes.ok) { const tData = await tRes.json(); setMerchantTag(tData.tag ?? null); }
      else { setMerchantTag(null); }
    } catch { setIsMerchant(false); }
    finally { setMerchantLoading(false); }
  }, [username, buildAuthHeaders]);

  const handleResetPin = async () => {
    if (!username) return;
    Alert.alert('Reset Merchant PIN', 'Yakin ingin mereset PIN merchant kamu?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        setPinResetting(true);
        try {
          const headers = await buildAuthHeaders();
          const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
          const res = await fetch(`${API_BASE}/api/merchants/${encodeURIComponent(username)}/resetmerchantpin`, { method: 'POST', headers, ...fetchOpts });
          const body = await res.json();
          Alert.alert(res.ok ? 'Berhasil' : 'Gagal', body.message ?? (res.ok ? 'PIN berhasil direset.' : 'Terjadi kesalahan.'));
        } catch { Alert.alert('Error', 'Tidak dapat terhubung ke server.'); }
        finally { setPinResetting(false); }
      }},
    ]);
  };

  useEffect(() => { loadSavedThemeId().then(id => setSelectedThemeId(id)); }, []);
  useEffect(() => { if (visible && username) loadMerchant(); }, [visible, username]);
  useEffect(() => { if (visible) loadAdminStatus(); }, [visible, loadAdminStatus]);

  const loadSystemAvatars = useCallback(async () => {
    if (systemAvatars.length > 0) return;
    setSystemAvatarsLoading(true);
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/avatar/system-avatars`, { headers, ...fetchOpts });
      if (res.ok) { const data = await res.json(); setSystemAvatars(data.avatars ?? []); }
    } catch {} finally { setSystemAvatarsLoading(false); }
  }, [systemAvatars.length, buildAuthHeaders]);

  useEffect(() => {
    if (page === 'privacy') loadPrivacy();
    if (page === 'chatNotification') loadNotifications();
    if (page === 'merchant') loadMerchant();
    if (page === 'editProfile' || page === 'changeAvatar') {
      setPendingAvatarUri(null); setPendingAvatarBase64(null); setSelectedSystemAvatarId(null);
      loadProfile();
    }
    if (page === 'changeAvatar') loadSystemAvatars();
  }, [page, loadPrivacy, loadNotifications, loadProfile, loadMerchant, loadSystemAvatars]);

  const savePrivacy = async (updates: Partial<PrivacySettings>) => {
    if (!username) return;
    setPrivacySaving(true);
    try { const updated = await updatePrivacySettings(username, updates); setPrivacy(updated); }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Failed to save privacy settings'); }
    finally { setPrivacySaving(false); }
  };

  const saveNotif = async (updates: Partial<NotificationSettings & { soundEnabled?: boolean; vibrateEnabled?: boolean }>) => {
    if (!username) return;
    setNotifSaving(true);
    try {
      if (updates.soundEnabled !== undefined) { setSoundEnabled(updates.soundEnabled); await AsyncStorage.setItem(SOUND_STORAGE_KEY, String(updates.soundEnabled)); }
      if (updates.vibrateEnabled !== undefined) { setVibrateEnabled(updates.vibrateEnabled); await AsyncStorage.setItem(VIBRATE_STORAGE_KEY, String(updates.vibrateEnabled)); }
      const { soundEnabled: _s, vibrateEnabled: _v, ...backendUpdates } = updates;
      if (Object.keys(backendUpdates).length > 0) { const updated = await updateNotificationSettings(username, backendUpdates); setNotif(updated); }
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Failed to save notification settings'); }
    finally { setNotifSaving(false); }
  };

  const handleCreateCreditPin = async (pin: string) => {
    if (!username) return;
    setCreditPinLoading(true);
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/credits/pin`, {
        method: 'POST', headers, body: JSON.stringify({ pin }), ...fetchOpts,
      });
      const body = await res.json();
      if (res.ok) {
        Alert.alert('Berhasil', body.message ?? 'PIN berhasil dibuat. Gunakan PIN ini untuk transfer kredit.');
        setCreditPin(''); setCreditPinConfirm('');
        setPage('myAccount');
      } else {
        Alert.alert('Gagal', body.message ?? 'Tidak dapat membuat PIN. Coba lagi.');
      }
    } catch {
      Alert.alert('Error', 'Tidak dapat terhubung ke server.');
    } finally {
      setCreditPinLoading(false);
    }
  };

  const goBack = () => {
    if (page === 'language')       { setPage('system');    return; }
    if (page === 'chatTheme')      { setPage('system');    return; }
    if (page === 'editProfile')    { setPage('myAccount'); return; }
    if (page === 'changeAvatar')   { setPage('myAccount'); return; }
    if (page === 'changeUsername') { setNewUsername(''); setUsernameError(''); setPage('myAccount'); return; }
    if (page === 'createCreditPin') { setCreditPin(''); setCreditPinConfirm(''); setPage('myAccount'); return; }
    if (page !== 'main')           { setPage('main');      return; }
    onClose();
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { onClose(); onLogout(); } },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert('Konfirmasi', 'Yakin ingin menghapus semua gambar yang di-cache?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        try { await Promise.all([ExpoImage.clearDiskCache(), ExpoImage.clearMemoryCache()]); Alert.alert('Selesai', 'Cache gambar berhasil dihapus.'); }
        catch { Alert.alert('Selesai', 'Cache gambar berhasil dihapus.'); }
      }},
    ]);
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { Alert.alert('Error', 'Please fill in all fields'); return; }
    if (newPw !== confirmPw) { Alert.alert('Error', 'New passwords do not match'); return; }
    if (newPw.length < 6)   { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    setPwLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (Platform.OS !== 'web') { const cookie = await getSession(); if (cookie) headers['Cookie'] = cookie; }
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST', headers, body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message ?? 'Failed to change password'); }
      else { Alert.alert('Success', data.message ?? 'Password changed successfully'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }
    } catch { Alert.alert('Error', 'Network error. Please try again.'); }
    finally { setPwLoading(false); }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) { Alert.alert('Error', 'Please enter a valid email address'); return; }
    setEmailLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (Platform.OS !== 'web') { const cookie = await getSession(); if (cookie) headers['Cookie'] = cookie; }
      const res = await fetch(`${API_BASE}/api/auth/change-email`, {
        method: 'POST', headers, body: JSON.stringify({ newEmail }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message ?? 'Failed to update email'); }
      else { Alert.alert('Success', data.message ?? 'Email updated successfully'); setNewEmail(''); }
    } catch { Alert.alert('Error', 'Network error. Please try again.'); }
    finally { setEmailLoading(false); }
  };

  const handleChangeUsernameSubmit = async () => {
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed) { setUsernameError('Username wajib diisi'); return; }
    if (trimmed.length < 6) { setUsernameError('Username minimal 6 karakter'); return; }
    if (trimmed.length > 18) { setUsernameError('Username maksimal 18 karakter'); return; }
    if (!/^[a-z]/.test(trimmed)) { setUsernameError('Username harus diawali dengan huruf'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) { setUsernameError('Hanya huruf kecil, angka, dan underscore'); return; }
    setUsernameError('');
    setUsernameSaving(true);
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch(`${API_BASE}/api/auth/change-username`, {
        method: 'POST', headers,
        body: JSON.stringify({ username: trimmed }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const data = await res.json();
      if (!res.ok) { setUsernameError(data.message ?? 'Gagal mengganti username'); return; }
      setCanChangeUsername(false);
      setNewUsername('');
      Alert.alert('Berhasil', `Username berhasil diganti menjadi @${trimmed}. Silakan login ulang untuk memperbarui sesi.`, [
        { text: 'OK', onPress: () => { setPage('myAccount'); } },
      ]);
    } catch { setUsernameError('Gagal terhubung ke server'); }
    finally { setUsernameSaving(false); }
  };

  const handleSaveProfile = async () => {
    if (!profileDisplayName.trim()) { Alert.alert('Error', 'Display name cannot be empty'); return; }
    setProfileSaving(true);
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch(`${API_BASE}/api/profile/me`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          displayName: profileDisplayName.trim(), aboutMe: profileAboutMe, gender: profileGender,
          dateOfBirth: profileDob, country: profileCountry, city: profileCity,
          likes: profileLikes, dislikes: profileDislikes, relationshipStatus: parseInt(profileRelStatus, 10),
        }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message ?? 'Failed to save profile'); }
      else { Alert.alert('Success', 'Profile updated successfully'); setPage('myAccount'); }
    } catch { Alert.alert('Error', 'Network error. Please try again.'); }
    finally { setProfileSaving(false); }
  };

  const handlePickAvatar = async (source: 'gallery' | 'camera') => {
    let result: ImagePicker.ImagePickerResult;
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true };
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
      result = await ImagePicker.launchCameraAsync(opts);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery access is required.'); return; }
      result = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (!result.canceled && result.assets[0]) { const asset = result.assets[0]; setPendingAvatarUri(asset.uri); setPendingAvatarBase64(asset.base64 ?? null); }
  };

  const handleApplySystemAvatar = async (avatar: SystemAvatar) => {
    if (!username) return;
    setSelectedSystemAvatarId(avatar.id);
    setApplyingSystemAvatar(true);
    try {
      const headers = await buildAuthHeaders();
      const fetchOpts = Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
      const res = await fetch(`${API_BASE}/api/profile/me/display-picture`, {
        method: 'POST', headers, body: JSON.stringify({ displayPictureId: avatar.id }), ...fetchOpts,
      });
      const data = await res.json();
      if (res.ok) { setCurrentAvatar(avatar.imageUrl); setPendingAvatarUri(null); setPendingAvatarBase64(null); if (username) invalidateAvatarCache(username); onAvatarChange?.(); Alert.alert('Berhasil', `Avatar "${avatar.name}" berhasil dipasang!`); }
      else { Alert.alert('Gagal', data.message ?? 'Tidak dapat mengubah avatar'); }
    } catch { Alert.alert('Error', 'Koneksi gagal, coba lagi.'); }
    finally { setApplyingSystemAvatar(false); }
  };

  const handleSaveAvatar = async () => {
    if (!pendingAvatarBase64 || !username) { Alert.alert('Error', 'Please select an image first'); return; }
    setAvatarUploading(true);
    try {
      const headers = await buildAuthHeaders();
      const mimeType = 'image/jpeg';
      const imageKey = `avatar_${username}_${Date.now()}`;
      const uploadRes = await fetch(`${API_BASE}/api/imageserver/upload`, {
        method: 'POST', headers,
        body: JSON.stringify({ username, imageKey, mimeType, base64Data: pendingAvatarBase64, description: 'Profile avatar' }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) { Alert.alert('Error', uploadData.error ?? 'Upload failed'); return; }
      const displayPicture = uploadData.url;
      const profileRes = await fetch(`${API_BASE}/api/profile/me`, {
        method: 'PUT', headers, body: JSON.stringify({ displayPicture }),
        ...(Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {}),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) { Alert.alert('Error', profileData.message ?? 'Failed to update avatar'); }
      else { setCurrentAvatar(displayPicture); setPendingAvatarUri(null); setPendingAvatarBase64(null); if (username) invalidateAvatarCache(username); onAvatarChange?.(); Alert.alert('Success', 'Avatar updated successfully'); }
    } catch { Alert.alert('Error', 'Network error. Please try again.'); }
    finally { setAvatarUploading(false); }
  };

  const s = makeRootStyles(theme);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={goBack} statusBarTranslucent>
      <View style={[s.root, { paddingTop: 0 }]}>
        {page === 'main' ? (
          <LinearGradient
            colors={['#86E6AC', '#C8F5D8', '#ffffff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[s.heroGradient, { paddingTop: insets.top + 8 }]}
          >
            <TouchableOpacity onPress={onClose} style={[s.heroCloseBtn, { top: insets.top + 8 }]} testID="button-settings-back">
              <Ionicons name="close" size={22} color="#2D7A4F" />
            </TouchableOpacity>
            <View style={s.heroIconWrap}>
              <Ionicons name="settings" size={32} color="#2D7A4F" />
            </View>
            <Text style={s.heroTitle}>Settings</Text>
          </LinearGradient>
        ) : (
          <View style={[s.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={goBack} style={s.backBtn} testID="button-settings-back">
              <Image source={require('../assets/icons/ad_arrowleft_green.png')} style={s.backIcon} resizeMode="contain" />
            </TouchableOpacity>
            <Image source={require('../assets/icons/ad_setting_green.png')} style={s.headerIcon} resizeMode="contain" />
            <Text style={s.headerTitle}>{PAGE_TITLE[page]}</Text>
          </View>
        )}

        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {page === 'main' && <MainPage onGo={setPage} onLogout={handleLogout} isMerchant={isMerchant} isAdmin={isAdmin} />}
          {page === 'privacy' && <PrivacyPage settings={privacy} loading={privacyLoading} saving={privacySaving} onSave={savePrivacy} />}
          {page === 'system' && (
            <SystemPage
              onClearCache={handleClearCache}
              onGoLanguage={() => setPage('language')}
              onGoTheme={() => setPage('chatTheme')}
              currentLanguage={LANGUAGES.find(l => l.id === selectedLanguage)?.name ?? 'English'}
              currentThemeName={getThemeById(selectedThemeId).name}
              fontLevel={fontLevel}
              onFontLevelChange={setFontLevel}
              autoScrollEnabled={autoScrollEnabled}
              onToggleAutoScroll={handleToggleAutoScroll}
            />
          )}
          {page === 'accountSettings' && (
            <AccountSettingsPage
              currentPw={currentPw} newPw={newPw} confirmPw={confirmPw} newEmail={newEmail}
              onCurrentPwChange={setCurrentPw} onNewPwChange={setNewPw}
              onConfirmPwChange={setConfirmPw} onNewEmailChange={setNewEmail}
              onChangePassword={handleChangePassword} onChangeEmail={handleChangeEmail}
              pwLoading={pwLoading} emailLoading={emailLoading}
            />
          )}
          {page === 'myAccount' && <MyAccountPage onEditProfile={() => setPage('editProfile')} onChangeAvatar={() => setPage('changeAvatar')} onCreatePin={() => { setCreditPin(''); setCreditPinConfirm(''); setPage('createCreditPin'); }} isGoogleUser={isGoogleUser} canChangeUsername={canChangeUsername} onChangeUsername={() => { setNewUsername(''); setUsernameError(''); setPage('changeUsername'); }} />}
          {page === 'createCreditPin' && (
            <CreditPinPage
              pin={creditPin} pinConfirm={creditPinConfirm} loading={creditPinLoading}
              onPinChange={setCreditPin} onPinConfirmChange={setCreditPinConfirm}
              onSave={handleCreateCreditPin}
            />
          )}
          {page === 'editProfile' && (
            <EditProfilePage
              loading={profileLoading} saving={profileSaving}
              displayName={profileDisplayName} aboutMe={profileAboutMe} gender={profileGender}
              dob={profileDob} country={profileCountry} city={profileCity}
              likes={profileLikes} dislikes={profileDislikes} relStatus={profileRelStatus}
              onDisplayNameChange={setProfileDisplayName} onAboutMeChange={setProfileAboutMe}
              onGenderChange={setProfileGender} onDobChange={setProfileDob}
              onCountryChange={setProfileCountry} onCityChange={setProfileCity}
              onLikesChange={setProfileLikes} onDislikesChange={setProfileDislikes}
              onRelStatusChange={setProfileRelStatus} onSave={handleSaveProfile}
            />
          )}
          {page === 'changeUsername' && (
            <ChangeUsernamePage
              currentUsername={username ?? ''}
              newUsername={newUsername} onNewUsernameChange={(v) => { setNewUsername(v); setUsernameError(''); }}
              error={usernameError} saving={usernameSaving} onSave={handleChangeUsernameSubmit}
            />
          )}
          {page === 'changeAvatar' && (
            <ChangeAvatarPage
              currentAvatar={currentAvatar} pendingAvatarUri={pendingAvatarUri} uploading={avatarUploading}
              onPickGallery={() => handlePickAvatar('gallery')} onPickCamera={() => handlePickAvatar('camera')}
              onSave={handleSaveAvatar}
              systemAvatars={systemAvatars} systemAvatarsLoading={systemAvatarsLoading}
              selectedSystemAvatarId={selectedSystemAvatarId} applyingSystemAvatar={applyingSystemAvatar}
              onSelectSystemAvatar={handleApplySystemAvatar}
            />
          )}
          {page === 'chatNotification' && (
            <ChatNotificationPage
              loading={notifLoading} saving={notifSaving}
              soundEnabled={soundEnabled} vibrateEnabled={vibrateEnabled} notif={notif}
              onSoundChange={(v) => saveNotif({ soundEnabled: v })}
              onVibrateChange={(v) => saveNotif({ vibrateEnabled: v })}
              onNotifChange={(updates) => saveNotif(updates)}
            />
          )}
          {page === 'thirdPartySites' && (
            <ThirdPartySitesPage
              fbConnected={fbConnected} twConnected={twConnected}
              onFbToggle={() => setFbConnected(p => !p)} onTwToggle={() => setTwConnected(p => !p)}
            />
          )}
          {page === 'application' && <ApplicationPage />}
          {page === 'aboutMig' && <AboutMigPage />}
          {page === 'language' && (
            <LanguagePage
              selected={selectedLanguage} loading={langLoading}
              onSelect={async (id) => {
                setLangLoading(true);
                await setLanguage(id as LanguageCode);
                setLangLoading(false); setPage('system');
              }}
            />
          )}
          {page === 'merchant' && (
            <MerchantPage
              merchantData={merchantData} merchantTag={merchantTag} loading={merchantLoading}
              pinResetting={pinResetting}
              onResetPin={handleResetPin}
            />
          )}
          {page === 'chatTheme' && (
            <ChatThemePage
              selectedThemeId={selectedThemeId}
              onSelect={async (id) => { setSelectedThemeId(id); await applyGlobalTheme(id); }}
            />
          )}
          {page === 'adminTools' && isAdmin && (
            <AdminToolsPage
              targetUsername={adminLevelUsername}
              levelValue={adminLevelValue}
              currentLevel={adminLevelCurrent}
              lookupLoading={adminLookupLoading}
              saving={adminLevelSaving}
              onTargetChange={(v) => { setAdminLevelUsername(v); setAdminLevelCurrent(null); }}
              onLevelChange={setAdminLevelValue}
              onLookup={handleAdminLookupLevel}
              onSet={handleAdminSetLevel}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Shared helper components ─────────────────────────────────────────────────

function Row({
  iconName, iconImg, label, onPress, showChevron, right, testID,
}: {
  iconName?: keyof typeof Ionicons.glyphMap;
  iconImg?: ReturnType<typeof require>;
  label: string; onPress?: () => void; showChevron?: boolean; right?: string; testID?: string;
}) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);
  return (
    <TouchableOpacity style={r.container} activeOpacity={onPress ? 0.6 : 1} onPress={onPress} testID={testID}>
      {iconImg ? (
        <Image source={iconImg} style={r.img} resizeMode="contain" />
      ) : iconName ? (
        <Ionicons name={iconName} size={22} color={theme.accent} style={r.ionIcon} />
      ) : null}
      <Text style={r.label}>{label}</Text>
      {right !== undefined && <Text style={r.right}>{right}</Text>}
      {showChevron && <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
    </TouchableOpacity>
  );
}

function Divider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.divider, marginLeft: 60 }} />;
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={{
      backgroundColor: theme.cardBg,
      borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: theme.divider, marginBottom: 4,
    }}>
      {children}
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  const theme = useAppTheme();
  return (
    <Text style={{
      fontSize: 11, fontWeight: '600', color: theme.textSecondary,
      letterSpacing: 0.8, marginTop: 20, marginBottom: 6, marginHorizontal: 20,
    }}>
      {text}
    </Text>
  );
}

// ─── Page components ──────────────────────────────────────────────────────────

function IconBox({ name, bg }: { name: keyof typeof Ionicons.glyphMap; bg: string }) {
  return (
    <View style={{
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: bg,
      alignItems: 'center', justifyContent: 'center',
      marginRight: 14,
    }}>
      <Ionicons name={name} size={19} color="#fff" />
    </View>
  );
}

function GroupRow({
  icon, iconBg, label, onPress, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  label: string;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, backgroundColor: theme.cardBg }}
      activeOpacity={0.6}
      onPress={onPress}
      testID={testID}
    >
      <IconBox name={icon} bg={iconBg} />
      <Text style={{ flex: 1, fontSize: 15, color: theme.textPrimary }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={{ opacity: 0.5 }} />
    </TouchableOpacity>
  );
}

function GroupCard({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={{ marginTop: 16, marginHorizontal: 14 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, marginLeft: 4 }}>
        {title}
      </Text>
      <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
        {children}
      </View>
    </View>
  );
}

function GroupDivider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.divider, marginLeft: 66 }} />;
}

function MainPage({ onGo, onLogout, isMerchant, isAdmin }: { onGo: (p: Page) => void; onLogout: () => void; isMerchant: boolean; isAdmin: boolean }) {
  return (
    <View style={{ paddingBottom: 24 }}>
      {/* ── AKUN ── */}
      <GroupCard title="Akun">
        <GroupRow icon="person-circle-outline"  iconBg="#4A90E2" label="Account settings"  onPress={() => onGo('accountSettings')} testID="settings-account" />
        <GroupDivider />
        <GroupRow icon="person-outline"         iconBg="#00BFA5" label="My account"         onPress={() => onGo('myAccount')}       testID="settings-myaccount" />
        {isMerchant && (
          <>
            <GroupDivider />
            <GroupRow icon="storefront-outline" iconBg="#F57F17" label="Merchant"            onPress={() => onGo('merchant')}        testID="settings-merchant" />
          </>
        )}
        <GroupDivider />
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 }}
          activeOpacity={0.6}
          onPress={onLogout}
          testID="settings-signout"
        >
          <IconBox name="log-out-outline" bg="#E53935" />
          <Text style={{ flex: 1, fontSize: 15, color: '#E53935', fontWeight: '600' }}>Sign out</Text>
          <Ionicons name="chevron-forward" size={16} color="#E53935" style={{ opacity: 0.6 }} />
        </TouchableOpacity>
      </GroupCard>

      {/* ── PRIVASI & NOTIF ── */}
      <GroupCard title="Privasi & Notif">
        <GroupRow icon="lock-closed-outline"    iconBg="#1565C0" label="Privacy"             onPress={() => onGo('privacy')}          testID="settings-privacy" />
        <GroupDivider />
        <GroupRow icon="notifications-outline"  iconBg="#FF6F00" label="Chat notification"   onPress={() => onGo('chatNotification')} testID="settings-chatnotification" />
      </GroupCard>

      {/* ── UM ── */}
      <GroupCard title="Umum">
        <GroupRow icon="settings-outline"       iconBg="#607D8B" label="System"              onPress={() => onGo('system')}           testID="settings-system" />
        <GroupDivider />
        <GroupRow icon="phone-portrait-outline" iconBg="#43A047" label="Application"         onPress={() => onGo('application')}      testID="settings-application" />
        <GroupDivider />
        <GroupRow icon="globe-outline"          iconBg="#7B1FA2" label="Third party sites"   onPress={() => onGo('thirdPartySites')}  testID="settings-thirdparty" />
        <GroupDivider />
        <GroupRow icon="information-circle-outline" iconBg="#0097A7" label="About mig"       onPress={() => onGo('aboutMig')}         testID="settings-about" />
        {isAdmin && (
          <>
            <GroupDivider />
            <GroupRow icon="shield-checkmark-outline" iconBg="#6A1B9A" label="Admin Tools"   onPress={() => onGo('adminTools')}       testID="settings-admin-tools" />
          </>
        )}
      </GroupCard>
    </View>
  );
}

function AdminToolsPage({
  targetUsername, levelValue, currentLevel, lookupLoading, saving,
  onTargetChange, onLevelChange, onLookup, onSet,
}: {
  targetUsername: string; levelValue: string; currentLevel: number | null;
  lookupLoading: boolean; saving: boolean;
  onTargetChange: (v: string) => void; onLevelChange: (v: string) => void;
  onLookup: () => void; onSet: () => void;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);
  return (
    <>
      <SectionLabel text="SET USER LEVEL" />
      <Card>
        <View style={f.field}>
          <Ionicons name="person-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput
            style={f.input}
            placeholder="Username target"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={targetUsername}
            onChangeText={onTargetChange}
            testID="admin-input-username"
          />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="trending-up-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput
            style={f.input}
            placeholder="Level baru (1 - 100)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={3}
            value={levelValue}
            onChangeText={onLevelChange}
            testID="admin-input-level"
          />
        </View>
        <TouchableOpacity
          style={[f.btn, { backgroundColor: theme.textSecondary }, lookupLoading && { opacity: 0.7 }]}
          onPress={onLookup}
          disabled={lookupLoading}
          testID="admin-button-lookup"
        >
          {lookupLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Cek Level Sekarang</Text>}
        </TouchableOpacity>
        {currentLevel !== null && (
          <Text style={{ paddingHorizontal: 14, paddingTop: 6, fontSize: 12, color: theme.textSecondary }}>
            Level saat ini: <Text style={{ fontWeight: '700', color: theme.textPrimary }}>{currentLevel}</Text>
          </Text>
        )}
        <TouchableOpacity
          style={[f.btn, saving && { opacity: 0.7 }]}
          onPress={onSet}
          disabled={saving}
          testID="admin-button-set-level"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Set Level</Text>}
        </TouchableOpacity>
      </Card>
      <Text style={{ paddingHorizontal: 14, paddingTop: 10, fontSize: 11, color: theme.textSecondary, lineHeight: 16 }}>
        Mengubah level user secara manual hanya memengaruhi user target. Score akan otomatis dinaikkan ke ambang batas level baru supaya tidak turun lagi saat sistem reputasi melakukan recompute.
      </Text>
    </>
  );
}

function MerchantPage({
  merchantData, merchantTag, loading, pinResetting, onResetPin,
}: {
  merchantData: any; merchantTag: any; loading: boolean;
  pinResetting: boolean;
  onResetPin: () => void;
}) {
  const theme = useAppTheme();
  if (loading) return <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />;

  const merchantTypeLabel = merchantData?.merchantType === 2 ? 'Top Merchant' : 'Lead';
  const merchantTypeBg    = merchantData?.merchantType === 2 ? '#F9A825' : '#1565C0';

  const tagTypeLabel = merchantTag?.type === 1 ? 'TOP TAG' : 'NON-TOP TAG';
  const tagTypeBg    = merchantTag?.type === 1 ? '#FF6F00' : theme.accent;

  return (
    <View style={{ gap: 16, paddingVertical: 8 }}>
      <SectionLabel text="STATUS MERCHANT" />
      <Card>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="storefront-outline" size={28} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>{merchantData?.displayName ?? '-'}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>@{merchantData?.username ?? '-'}</Text>
            </View>
            <View style={{ backgroundColor: merchantTypeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{merchantTypeLabel}</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: theme.divider }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>Total Points</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>{(merchantData?.totalPoints ?? 0).toLocaleString()}</Text>
          </View>
        </View>
      </Card>

      <SectionLabel text="MERCHANT TAG AKTIF" />
      {merchantTag && merchantTag.status === 1 ? (
        <Card>
          <View style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: tagTypeBg, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{tagTypeLabel}</Text>
              </View>
              {merchantTag.amount != null && (
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>
                  🪙 {Math.round(Number(merchantTag.amount)).toLocaleString('id-ID')}
                </Text>
              )}
            </View>
            {merchantTag.expiresAt && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                  Berlaku hingga: {new Date(merchantTag.expiresAt).toLocaleString('id-ID')}
                </Text>
              </View>
            )}
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ padding: 16, alignItems: 'center', gap: 6 }}>
            <Ionicons name="pricetag-outline" size={28} color={theme.textSecondary} />
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>Tidak ada merchant tag aktif</Text>
          </View>
        </Card>
      )}

      <SectionLabel text="KEAMANAN MERCHANT" />
      <Card>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
          onPress={!pinResetting ? onResetPin : undefined}
          testID="button-reset-merchant-pin"
        >
          <Ionicons name="keypad-outline" size={22} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: theme.textPrimary }}>Reset Merchant PIN</Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>Kirim permintaan reset PIN merchant</Text>
          </View>
          {pinResetting
            ? <ActivityIndicator size="small" color={theme.accent} />
            : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
        </TouchableOpacity>
      </Card>
    </View>
  );
}

function PrivacyPage({
  settings, loading, saving, onSave,
}: {
  settings: PrivacySettings; loading: boolean; saving: boolean;
  onSave: (updates: Partial<PrivacySettings>) => void;
}) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);

  if (loading) return <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />;

  function RadioGroup<T extends number>({
    value, options, onChange, testPrefix,
  }: {
    value: T;
    options: { val: T; label: string; icon: keyof typeof Ionicons.glyphMap }[];
    onChange: (v: T) => void;
    testPrefix: string;
  }) {
    return (
      <Card>
        {options.map((opt, idx) => (
          <View key={opt.val}>
            <TouchableOpacity style={r.container} activeOpacity={0.6} onPress={() => onChange(opt.val)} testID={`${testPrefix}-${opt.val}`}>
              <Ionicons name={opt.icon} size={22} color={theme.accent} style={r.ionIcon} />
              <Text style={r.label}>{opt.label}</Text>
              <View style={[
                { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.divider, alignItems: 'center', justifyContent: 'center' },
                value === opt.val && { borderColor: theme.accent },
              ]}>
                {value === opt.val && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />}
              </View>
            </TouchableOpacity>
            {idx < options.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    );
  }

  function SwitchRow({ icon, label, value, onChange, testID }: {
    icon: keyof typeof Ionicons.glyphMap; label: string; value: boolean; onChange: (v: boolean) => void; testID?: string;
  }) {
    return (
      <View style={r.container}>
        <Ionicons name={icon} size={22} color={theme.accent} style={r.ionIcon} />
        <Text style={r.label}>{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" disabled={saving} testID={testID} />
      </View>
    );
  }

  return (
    <>
      {saving && <ActivityIndicator color={theme.accent} style={{ marginBottom: 8 }} />}
      <SectionLabel text="TANGGAL LAHIR (DobPrivacy)" />
      <RadioGroup value={settings.dobPrivacy as 0|1|2} options={[{val:0,label:'Sembunyikan',icon:'eye-off-outline'},{val:1,label:'Tampilkan lengkap',icon:'calendar-outline'},{val:2,label:'Tampilkan tanpa tahun',icon:'calendar-number-outline'}]} onChange={(v)=>onSave({dobPrivacy:v})} testPrefix="privacy-dob" />
      <SectionLabel text="NAMA DEPAN & BELAKANG (FLNamePv)" />
      <RadioGroup value={settings.firstLastNamePrivacy as 0|1} options={[{val:0,label:'Sembunyikan',icon:'eye-off-outline'},{val:1,label:'Tampilkan',icon:'eye-outline'}]} onChange={(v)=>onSave({firstLastNamePrivacy:v})} testPrefix="privacy-name" />
      <SectionLabel text="NOMOR HP (MobNumPrivacy)" />
      <RadioGroup value={settings.mobilePhonePrivacy as 0|1|2} options={[{val:0,label:'Sembunyikan',icon:'eye-off-outline'},{val:1,label:'Semua orang',icon:'globe-outline'},{val:2,label:'Teman saja',icon:'people-outline'}]} onChange={(v)=>onSave({mobilePhonePrivacy:v})} testPrefix="privacy-mobile" />
      <SectionLabel text="EMAIL EKSTERNAL (ExtEmPv)" />
      <RadioGroup value={settings.externalEmailPrivacy as 0|1|2|3} options={[{val:0,label:'Sembunyikan',icon:'eye-off-outline'},{val:1,label:'Semua orang',icon:'globe-outline'},{val:2,label:'Teman saja',icon:'people-outline'},{val:3,label:'Pengikut saja',icon:'person-add-outline'}]} onChange={(v)=>onSave({externalEmailPrivacy:v})} testPrefix="privacy-email" />
      <SectionLabel text="SIAPA YANG BISA CHAT SAYA (ChatPv)" />
      <RadioGroup value={settings.chatPrivacy as 1|2|3} options={[{val:1,label:'Semua orang',icon:'globe-outline'},{val:2,label:'Teman saja',icon:'people-outline'},{val:3,label:'Pengikut saja',icon:'person-add-outline'}]} onChange={(v)=>onSave({chatPrivacy:v})} testPrefix="privacy-chat" />
      <SectionLabel text="FEED SAYA (FeedPv)" />
      <RadioGroup value={settings.feedPrivacy as 1|2} options={[{val:1,label:'Semua orang',icon:'globe-outline'},{val:2,label:'Teman & Pengikut',icon:'people-outline'}]} onChange={(v)=>onSave({feedPrivacy:v})} testPrefix="privacy-feed" />
      <SectionLabel text="FOOTPRINTS (FPPv)" />
      <RadioGroup value={settings.footprintsPrivacy as 0|1|2|3} options={[{val:0,label:'Sembunyikan',icon:'eye-off-outline'},{val:1,label:'Semua orang',icon:'globe-outline'},{val:2,label:'Teman saja',icon:'people-outline'},{val:3,label:'Pengikut saja',icon:'person-add-outline'}]} onChange={(v)=>onSave({footprintsPrivacy:v})} testPrefix="privacy-footprints" />
      <SectionLabel text="BUZZ & LOOKOUT" />
      <Card>
        <SwitchRow icon="notifications-outline" label="Izinkan Buzz (BuzzPv)" value={settings.buzzPrivacy===1} onChange={(v)=>onSave({buzzPrivacy:v?1:0})} testID="privacy-buzz" />
        <Divider />
        <SwitchRow icon="search-outline" label="Tampil di Lookout (LOPv)" value={settings.lookoutPrivacy===1} onChange={(v)=>onSave({lookoutPrivacy:v?1:0})} testID="privacy-lookout" />
      </Card>
      <SectionLabel text="AKTIVITAS DI FEED (EventPrivacySetting)" />
      <Card>
        <SwitchRow icon="chatbubble-outline"   label="Status update"          value={settings.activityStatusUpdates}   onChange={(v)=>onSave({activityStatusUpdates:v})}   testID="privacy-activity-status" />
        <Divider />
        <SwitchRow icon="person-outline"       label="Perubahan profil"        value={settings.activityProfileChanges}  onChange={(v)=>onSave({activityProfileChanges:v})}  testID="privacy-activity-profile" />
        <Divider />
        <SwitchRow icon="people-outline"       label="Menambah teman"          value={settings.activityAddFriends}      onChange={(v)=>onSave({activityAddFriends:v})}      testID="privacy-activity-friends" />
        <Divider />
        <SwitchRow icon="image-outline"        label="Foto yang dipublikasikan" value={settings.activityPhotosPublished} onChange={(v)=>onSave({activityPhotosPublished:v})} testID="privacy-activity-photos" />
        <Divider />
        <SwitchRow icon="bag-outline"          label="Konten yang dibeli"       value={settings.activityContentPurchased} onChange={(v)=>onSave({activityContentPurchased:v})} testID="privacy-activity-content" />
        <Divider />
        <SwitchRow icon="chatbubbles-outline"  label="Pembuatan chatroom"       value={settings.activityChatroomCreation} onChange={(v)=>onSave({activityChatroomCreation:v})} testID="privacy-activity-chatroom" />
        <Divider />
        <SwitchRow icon="gift-outline"         label="Virtual gifting"          value={settings.activityVirtualGifting}   onChange={(v)=>onSave({activityVirtualGifting:v})}   testID="privacy-activity-gifts" />
      </Card>
    </>
  );
}

function SystemPage({ onClearCache, onGoLanguage, onGoTheme, currentLanguage, currentThemeName, fontLevel, onFontLevelChange, autoScrollEnabled, onToggleAutoScroll }: {
  onClearCache: () => void; onGoLanguage: () => void; onGoTheme: () => void;
  currentLanguage: string; currentThemeName: string;
  fontLevel: FontSizeLevel; onFontLevelChange: (l: FontSizeLevel) => Promise<void>;
  autoScrollEnabled: boolean; onToggleAutoScroll: (v: boolean) => void;
}) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);
  const sliderIndex = FONT_SIZE_OPTIONS.findIndex(o => o.level === fontLevel);

  return (
    <>
      <Card>
        <Row iconName="trash-outline"          label="Clear cached images" onPress={onClearCache}  testID="settings-clear-cache" />
        <Divider />
        <Row iconName="language-outline"       label="Language"  right={currentLanguage}  onPress={onGoLanguage} showChevron testID="settings-language" />
        <Divider />
        <Row iconName="color-palette-outline"  label="Chat Theme" right={currentThemeName} onPress={onGoTheme}   showChevron testID="settings-chat-theme" />
      </Card>

      <SectionLabel text="CHAT" />
      <Card>
        <View style={r.container}>
          <Ionicons name="arrow-down-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <View style={{ flex: 1 }}>
            <Text style={r.label}>Auto-scroll</Text>
            <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
              Saat aktif, layar otomatis turun ke pesan terbaru. Matikan agar posisi scroll tidak berpindah.
            </Text>
          </View>
          <Switch
            value={autoScrollEnabled}
            onValueChange={onToggleAutoScroll}
            trackColor={{ false: theme.divider, true: theme.accent }}
            thumbColor="#FFFFFF"
            testID="settings-autoscroll"
          />
        </View>
      </Card>

      <SectionLabel text="UKURAN TEKS" />
      <Card>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="text-outline" size={18} color={theme.textSecondary} style={{ marginRight: 10 }} />
            <Text style={{ color: theme.textPrimary, fontSize: 15, flex: 1 }}>Ukuran Font</Text>
            <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>
              {FONT_SIZE_OPTIONS.find(o => o.level === fontLevel)?.label ?? 'M'}
              {' '}({FONT_SIZE_OPTIONS.find(o => o.level === fontLevel)?.base ?? 14}pt)
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 11, width: 22 }}>A</Text>
            <View style={{ flex: 1 }}>
              <Slider
                style={{ height: 36 }}
                minimumValue={0}
                maximumValue={FONT_SIZE_OPTIONS.length - 1}
                step={1}
                value={sliderIndex < 0 ? 2 : sliderIndex}
                onValueChange={(val: number) => {
                  const opt = FONT_SIZE_OPTIONS[Math.round(val)];
                  if (opt) onFontLevelChange(opt.level);
                }}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 18, width: 28, textAlign: 'right' }}>A</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 }}>
            {FONT_SIZE_OPTIONS.map((opt) => (
              <Text
                key={opt.level}
                style={{
                  color: opt.level === fontLevel ? theme.accent : theme.textSecondary,
                  fontSize: 11,
                  fontWeight: opt.level === fontLevel ? '700' : '400',
                }}
              >
                {opt.label}
              </Text>
            ))}
          </View>

          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 4 }}>
            Pratinjau teks dengan ukuran ini
          </Text>
          <Text style={{
            color: theme.textPrimary,
            fontSize: FONT_SIZE_OPTIONS.find(o => o.level === fontLevel)?.base ?? 14,
            lineHeight: (FONT_SIZE_OPTIONS.find(o => o.level === fontLevel)?.base ?? 14) * 1.5,
          }}>
            Halo! Ini contoh teks pesan chatroom dan feed kamu.
          </Text>
        </View>
      </Card>
    </>
  );
}

function AccountSettingsPage({
  currentPw, newPw, confirmPw, newEmail,
  onCurrentPwChange, onNewPwChange, onConfirmPwChange, onNewEmailChange,
  onChangePassword, onChangeEmail, pwLoading, emailLoading,
}: {
  currentPw: string; newPw: string; confirmPw: string; newEmail: string;
  onCurrentPwChange: (v: string) => void; onNewPwChange: (v: string) => void;
  onConfirmPwChange: (v: string) => void; onNewEmailChange: (v: string) => void;
  onChangePassword: () => void; onChangeEmail: () => void;
  pwLoading: boolean; emailLoading: boolean;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);
  return (
    <>
      <SectionLabel text="CHANGE PASSWORD" />
      <Card>
        <View style={f.field}>
          <Ionicons name="lock-closed-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="Current password" placeholderTextColor={theme.textSecondary} secureTextEntry value={currentPw} onChangeText={onCurrentPwChange} testID="settings-input-current-password" />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="key-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="New password" placeholderTextColor={theme.textSecondary} secureTextEntry value={newPw} onChangeText={onNewPwChange} testID="settings-input-new-password" />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="key-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="Confirm new password" placeholderTextColor={theme.textSecondary} secureTextEntry value={confirmPw} onChangeText={onConfirmPwChange} testID="settings-input-confirm-password" />
        </View>
        <TouchableOpacity style={[f.btn, pwLoading && { opacity: 0.7 }]} onPress={onChangePassword} disabled={pwLoading} testID="button-change-password">
          {pwLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Change Password</Text>}
        </TouchableOpacity>
      </Card>

      <SectionLabel text="CHANGE EMAIL" />
      <Card>
        <View style={f.field}>
          <Image source={require('../assets/icons/ad_email_grey.png')} style={f.imgIcon} resizeMode="contain" />
          <TextInput style={f.input} placeholder="New email address" placeholderTextColor={theme.textSecondary} keyboardType="email-address" autoCapitalize="none" value={newEmail} onChangeText={onNewEmailChange} testID="settings-input-new-email" />
        </View>
        <TouchableOpacity style={[f.btn, emailLoading && { opacity: 0.7 }]} onPress={onChangeEmail} disabled={emailLoading} testID="button-change-email">
          {emailLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Update Email</Text>}
        </TouchableOpacity>
      </Card>
    </>
  );
}

function MyAccountPage({ onEditProfile, onChangeAvatar, onCreatePin, isGoogleUser, canChangeUsername, onChangeUsername }: {
  onEditProfile: () => void; onChangeAvatar: () => void; onCreatePin: () => void;
  isGoogleUser: boolean; canChangeUsername: boolean; onChangeUsername: () => void;
}) {
  return (
    <>
      <SectionLabel text="PROFILE" />
      <Card>
        <Row iconImg={require('../assets/icons/ad_userppl_grey.png')} label="Edit profile"   onPress={onEditProfile}  showChevron testID="settings-edit-profile" />
        <Divider />
        <Row iconImg={require('../assets/icons/ad_avatar_grey.png')}  label="Change avatar"  onPress={onChangeAvatar} showChevron testID="settings-change-avatar" />
        {isGoogleUser && (
          <>
            <Divider />
            <Row
              iconName="at-outline"
              label={canChangeUsername ? 'Ganti Username (1x)' : 'Username sudah diganti'}
              onPress={canChangeUsername ? onChangeUsername : () => Alert.alert('Info', 'Username hanya bisa diganti 1 kali dan sudah digunakan.')}
              showChevron={canChangeUsername}
              right={!canChangeUsername ? '✓ Sudah diganti' : undefined}
              testID="settings-change-username"
            />
          </>
        )}
      </Card>
      <SectionLabel text="KEAMANAN TRANSFER" />
      <Card>
        <Row iconName="keypad-outline" label="Buat PIN transfer kredit" onPress={onCreatePin} showChevron testID="settings-create-credit-pin" />
      </Card>
      <SectionLabel text="SOCIAL" />
      <Card>
        <Row iconImg={require('../assets/icons/ad_userppl_grey.png')} label="Footprints"    onPress={() => Alert.alert('Footprints', 'Coming soon.')} showChevron testID="settings-footprints" />
        <Divider />
        <Row iconName="gift-outline"                                   label="Gifts received" onPress={() => Alert.alert('Gifts', 'Coming soon.')} showChevron testID="settings-gifts-received" />
      </Card>
    </>
  );
}

function ChangeUsernamePage({
  currentUsername, newUsername, onNewUsernameChange, error, saving, onSave,
}: {
  currentUsername: string; newUsername: string; onNewUsernameChange: (v: string) => void;
  error: string; saving: boolean; onSave: () => void;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);
  const val = newUsername.trim().toLowerCase();
  const isValid = val.length >= 6 && /^[a-z]/.test(val) && /^[a-z][a-z0-9_]*$/.test(val);

  return (
    <>
      <View style={{ marginTop: 16, marginHorizontal: 20, marginBottom: 4 }}>
        <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fde68a', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#92400e', fontWeight: '700', marginBottom: 4 }}>⚠️ Perhatian</Text>
          <Text style={{ fontSize: 12, color: '#78350f', lineHeight: 18 }}>
            Username hanya bisa diganti <Text style={{ fontWeight: '700' }}>1 kali</Text>. Pilih dengan bijak karena tidak bisa diubah lagi setelah konfirmasi.
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
          Username saat ini: <Text style={{ fontWeight: '700', color: theme.text }}>@{currentUsername}</Text>
        </Text>
      </View>

      <SectionLabel text="USERNAME BARU" />
      <Card>
        <View style={f.field}>
          <Ionicons name="at-outline" size={20} color={theme.accent} style={{ marginRight: 12 }} />
          <TextInput
            style={[f.input, { flex: 1 }]}
            placeholder="Minimal 6 karakter, huruf di awal"
            placeholderTextColor={theme.textSecondary}
            value={newUsername}
            onChangeText={(v) => onNewUsernameChange(v.replace(/[^a-z0-9_]/g, '').toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={18}
            testID="input-new-username"
          />
        </View>
      </Card>

      <View style={{ marginHorizontal: 20, marginTop: 6, marginBottom: 4 }}>
        {error ? (
          <Text style={{ fontSize: 12, color: '#dc2626', marginBottom: 6 }}>{error}</Text>
        ) : null}
        <Text style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 16 }}>
          • Min 6 karakter, maks 18 karakter{'\n'}
          • Harus diawali dengan huruf{'\n'}
          • Hanya huruf kecil, angka, dan underscore (_)
        </Text>
      </View>

      <View style={{ marginHorizontal: 20, marginTop: 16 }}>
        <TouchableOpacity
          style={{
            backgroundColor: isValid && !saving ? theme.accent : '#9ca3af',
            borderRadius: 10, paddingVertical: 14, alignItems: 'center',
          }}
          onPress={onSave}
          disabled={!isValid || saving}
          testID="btn-save-username"
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ganti Username</Text>
          }
        </TouchableOpacity>
      </View>
    </>
  );
}

function CreditPinPage({
  pin, pinConfirm, loading, onPinChange, onPinConfirmChange, onSave,
}: {
  pin: string; pinConfirm: string; loading: boolean;
  onPinChange: (v: string) => void; onPinConfirmChange: (v: string) => void;
  onSave: (pin: string) => void;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);

  const isValid = pin.length === 6 && /^\d+$/.test(pin);
  const matches = pin === pinConfirm;
  const canSave  = isValid && matches && !loading;

  const handleSave = () => {
    if (!isValid) { Alert.alert('PIN tidak valid', 'PIN harus 6 digit angka.'); return; }
    if (!matches)  { Alert.alert('PIN tidak cocok', 'Konfirmasi PIN tidak sesuai.'); return; }
    onSave(pin);
  };

  return (
    <>
      <View style={{ marginTop: 16, marginHorizontal: 20, marginBottom: 4 }}>
        <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
          Buat PIN 6 digit untuk mengamankan setiap transfer kredit. PIN ini akan diminta setiap kali kamu melakukan transfer.
        </Text>
      </View>

      <SectionLabel text="PIN BARU" />
      <Card>
        <View style={[f.field, { alignItems: 'center' }]}>
          <Ionicons name="keypad-outline" size={20} color={theme.accent} style={{ marginRight: 12 }} />
          <TextInput
            style={[f.input, { letterSpacing: 6, fontSize: 18 }]}
            placeholder="Masukkan PIN (6 digit)"
            placeholderTextColor={theme.textSecondary}
            value={pin}
            onChangeText={(v) => onPinChange(v.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            testID="input-credit-pin"
          />
        </View>
        <View style={{ height: 1, backgroundColor: theme.divider, marginLeft: 52 }} />
        <View style={[f.field, { alignItems: 'center' }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} style={{ marginRight: 12 }} />
          <TextInput
            style={[f.input, { letterSpacing: 6, fontSize: 18 }]}
            placeholder="Konfirmasi PIN"
            placeholderTextColor={theme.textSecondary}
            value={pinConfirm}
            onChangeText={(v) => onPinConfirmChange(v.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            testID="input-credit-pin-confirm"
          />
        </View>
      </Card>

      {pinConfirm.length > 0 && !matches && (
        <Text style={{ color: '#E53935', fontSize: 12, marginHorizontal: 20, marginTop: 4 }}>
          PIN tidak cocok
        </Text>
      )}

      <TouchableOpacity
        style={[f.btn, { marginHorizontal: 16, marginTop: 16 }, !canSave && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={!canSave}
        testID="button-save-credit-pin"
      >
        {loading
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={f.btnText}>Simpan PIN</Text>
        }
      </TouchableOpacity>

      <View style={{ marginTop: 16, marginHorizontal: 20 }}>
        <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 17 }}>
          Pastikan PIN kamu mudah diingat namun tidak mudah ditebak. Jangan bagikan PIN kepada siapapun.
        </Text>
      </View>
    </>
  );
}

const REL_STATUS_OPTIONS = [
  { value: '1', label: 'Single' },
  { value: '2', label: 'In a relationship' },
  { value: '3', label: 'Married' },
  { value: '4', label: "It's complicated" },
];

const GENDER_OPTIONS = [
  { value: '',  label: 'Prefer not to say' },
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'O', label: 'Other' },
];

function EditProfilePage({
  loading, saving,
  displayName, aboutMe, gender, dob, country, city, likes, dislikes, relStatus,
  onDisplayNameChange, onAboutMeChange, onGenderChange, onDobChange,
  onCountryChange, onCityChange, onLikesChange, onDislikesChange, onRelStatusChange, onSave,
}: {
  loading: boolean; saving: boolean;
  displayName: string; aboutMe: string; gender: string; dob: string;
  country: string; city: string; likes: string; dislikes: string; relStatus: string;
  onDisplayNameChange: (v: string) => void; onAboutMeChange: (v: string) => void;
  onGenderChange: (v: string) => void; onDobChange: (v: string) => void;
  onCountryChange: (v: string) => void; onCityChange: (v: string) => void;
  onLikesChange: (v: string) => void; onDislikesChange: (v: string) => void;
  onRelStatusChange: (v: string) => void; onSave: () => void;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);
  const [genderOpen, setGenderOpen] = useState(false);
  const [relOpen, setRelOpen]       = useState(false);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 }}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ marginTop: 12, color: theme.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  const dropdownBg = theme.cardBg;
  const selectedBg = theme.accentSoft;

  return (
    <>
      <SectionLabel text="BASIC INFO" />
      <Card>
        <View style={f.field}>
          <Image source={require('../assets/icons/ad_userppl_grey.png')} style={f.imgIcon} resizeMode="contain" />
          <TextInput style={f.input} placeholder="Display name" placeholderTextColor={theme.textSecondary} value={displayName} onChangeText={onDisplayNameChange} testID="profile-input-display-name" />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="document-text-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={[f.input, { minHeight: 60 }]} placeholder="About me" placeholderTextColor={theme.textSecondary} multiline value={aboutMe} onChangeText={onAboutMeChange} testID="profile-input-about-me" />
        </View>
      </Card>

      <SectionLabel text="PERSONAL" />
      <Card>
        <TouchableOpacity style={f.field} onPress={() => { setGenderOpen(true); setRelOpen(false); }} testID="profile-select-gender">
          <Ionicons name="person-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <Text style={[f.input, { color: gender ? theme.textPrimary : theme.textSecondary }]}>{GENDER_OPTIONS.find(g => g.value === gender)?.label ?? 'Gender'}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </TouchableOpacity>
        {genderOpen && (
          <View style={{ backgroundColor: dropdownBg, borderTopWidth: 1, borderColor: theme.divider }}>
            {GENDER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 }, gender === opt.value && { backgroundColor: selectedBg }]}
                onPress={() => { onGenderChange(opt.value); setGenderOpen(false); }}
              >
                <Text style={{ fontSize: 15, color: gender === opt.value ? theme.accent : theme.textPrimary }}>{opt.label}</Text>
                {gender === opt.value && <Ionicons name="checkmark" size={16} color={theme.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Divider />
        <View style={f.field}>
          <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="Date of birth (YYYY-MM-DD)" placeholderTextColor={theme.textSecondary} value={dob} onChangeText={onDobChange} testID="profile-input-dob" />
        </View>
        <Divider />
        <TouchableOpacity style={f.field} onPress={() => { setRelOpen(true); setGenderOpen(false); }} testID="profile-select-rel-status">
          <Ionicons name="heart-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <Text style={[f.input, { color: relStatus ? theme.textPrimary : theme.textSecondary }]}>{REL_STATUS_OPTIONS.find(r => r.value === relStatus)?.label ?? 'Relationship status'}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </TouchableOpacity>
        {relOpen && (
          <View style={{ backgroundColor: dropdownBg, borderTopWidth: 1, borderColor: theme.divider }}>
            {REL_STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 }, relStatus === opt.value && { backgroundColor: selectedBg }]}
                onPress={() => { onRelStatusChange(opt.value); setRelOpen(false); }}
              >
                <Text style={{ fontSize: 15, color: relStatus === opt.value ? theme.accent : theme.textPrimary }}>{opt.label}</Text>
                {relStatus === opt.value && <Ionicons name="checkmark" size={16} color={theme.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>

      <SectionLabel text="LOCATION" />
      <Card>
        <View style={f.field}>
          <Image source={require('../assets/icons/ad_location_grey.png')} style={f.imgIcon} resizeMode="contain" />
          <TextInput style={f.input} placeholder="Country" placeholderTextColor={theme.textSecondary} value={country} onChangeText={onCountryChange} testID="profile-input-country" />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="location-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="City" placeholderTextColor={theme.textSecondary} value={city} onChangeText={onCityChange} testID="profile-input-city" />
        </View>
      </Card>

      <SectionLabel text="INTERESTS" />
      <Card>
        <View style={f.field}>
          <Ionicons name="thumbs-up-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="Likes" placeholderTextColor={theme.textSecondary} value={likes} onChangeText={onLikesChange} testID="profile-input-likes" />
        </View>
        <Divider />
        <View style={f.field}>
          <Ionicons name="thumbs-down-outline" size={18} color={theme.textSecondary} style={f.icon} />
          <TextInput style={f.input} placeholder="Dislikes" placeholderTextColor={theme.textSecondary} value={dislikes} onChangeText={onDislikesChange} testID="profile-input-dislikes" />
        </View>
      </Card>

      <TouchableOpacity style={[f.btn, { marginHorizontal: 16, marginTop: 8 }, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving} testID="button-save-profile">
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Save Profile</Text>}
      </TouchableOpacity>
    </>
  );
}

const CELL_SIZE = 90;

function ChangeAvatarPage({
  currentAvatar, pendingAvatarUri, uploading,
  onPickGallery, onPickCamera, onSave,
  systemAvatars, systemAvatarsLoading, selectedSystemAvatarId, applyingSystemAvatar, onSelectSystemAvatar,
}: {
  currentAvatar: string | null; pendingAvatarUri: string | null; uploading: boolean;
  onPickGallery: () => void; onPickCamera: () => void; onSave: () => void;
  systemAvatars: SystemAvatar[]; systemAvatarsLoading: boolean;
  selectedSystemAvatarId: string | null; applyingSystemAvatar: boolean;
  onSelectSystemAvatar: (avatar: SystemAvatar) => void;
}) {
  const theme = useAppTheme();
  const f = makeFormStyles(theme);
  const r = makeRowStyles(theme);
  const displayUri = pendingAvatarUri ?? currentAvatar;
  const NUM_COLS = 3;

  const avatarRows: SystemAvatar[][] = [];
  for (let i = 0; i < systemAvatars.length; i += NUM_COLS) { avatarRows.push(systemAvatars.slice(i, i + NUM_COLS)); }

  return (
    <>
      <View style={{ alignItems: 'center', paddingVertical: 24, position: 'relative' }}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: theme.accent, backgroundColor: theme.divider }} />
        ) : (
          <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: theme.divider, backgroundColor: theme.inputBg, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={require('../assets/icons/icon_default_avatar.png')} style={{ width: 80, height: 80 }} resizeMode="contain" />
          </View>
        )}
        {pendingAvatarUri && (
          <View style={{ position: 'absolute', bottom: 28, right: '34%', backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: theme.textOnAccent, fontSize: 11, fontWeight: 'bold' }}>NEW</Text>
          </View>
        )}
      </View>

      <SectionLabel text="SYSTEM AVATARS" />
      <View style={{ backgroundColor: theme.cardBg, borderRadius: 10, marginHorizontal: 16, marginBottom: 4, paddingVertical: 12, paddingHorizontal: 4, borderWidth: 1, borderColor: theme.border }}>
        {systemAvatarsLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, paddingHorizontal: 16 }}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Memuat avatar sistem...</Text>
          </View>
        ) : systemAvatars.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>Tidak ada avatar sistem tersedia</Text>
        ) : (
          avatarRows.map((rowAvatars, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }}>
              {rowAvatars.map((av) => {
                const isSelected = selectedSystemAvatarId === av.id || (!selectedSystemAvatarId && currentAvatar === av.imageUrl);
                const isApplying = applyingSystemAvatar && selectedSystemAvatarId === av.id;
                return (
                  <TouchableOpacity
                    key={av.id}
                    style={[{
                      width: CELL_SIZE, alignItems: 'center', borderRadius: 12,
                      padding: 6, borderWidth: 2, borderColor: 'transparent',
                    }, isSelected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
                    onPress={() => onSelectSystemAvatar(av)}
                    disabled={applyingSystemAvatar}
                    activeOpacity={0.75}
                    testID={`button-system-avatar-${av.id}`}
                  >
                    {isApplying ? (
                      <ActivityIndicator color={theme.accent} style={{ width: 72, height: 72 }} />
                    ) : (
                      <Image source={{ uri: av.imageUrl }} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.inputBg }} resizeMode="cover" />
                    )}
                    {isSelected && !isApplying && (
                      <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: theme.cardBg, borderRadius: 10 }}>
                        <Ionicons name="checkmark-circle" size={20} color="#00A8CC" />
                      </View>
                    )}
                    <Text style={[{ marginTop: 4, fontSize: 11, color: theme.textSecondary, textAlign: 'center' }, isSelected && { color: theme.accent, fontWeight: '700' }]}>
                      {av.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {rowAvatars.length < NUM_COLS && Array.from({ length: NUM_COLS - rowAvatars.length }).map((_, k) => (
                <View key={`empty-${k}`} style={{ width: CELL_SIZE }} />
              ))}
            </View>
          ))
        )}
      </View>

      <SectionLabel text="FOTO SENDIRI" />
      <Card>
        <TouchableOpacity style={r.container} onPress={onPickGallery} activeOpacity={0.6} testID="avatar-pick-gallery">
          <Image source={require('../assets/icons/ad_gallery_grey.png')} style={r.img} resizeMode="contain" />
          <Text style={r.label}>Pilih dari galeri</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
        <Divider />
        <TouchableOpacity style={r.container} onPress={onPickCamera} activeOpacity={0.6} testID="avatar-pick-camera">
          <Image source={require('../assets/icons/ad_camera_grey.png')} style={r.img} resizeMode="contain" />
          <Text style={r.label}>Ambil foto</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </Card>

      {pendingAvatarUri && (
        <TouchableOpacity style={[f.btn, { marginHorizontal: 16, marginTop: 16 }, uploading && { opacity: 0.7 }]} onPress={onSave} disabled={uploading} testID="button-save-avatar">
          {uploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={f.btnText}>Simpan Avatar</Text>}
        </TouchableOpacity>
      )}
      <View style={{ height: 32 }} />
    </>
  );
}

function ChatNotificationPage({
  loading, saving, soundEnabled, vibrateEnabled, notif,
  onSoundChange, onVibrateChange, onNotifChange,
}: {
  loading: boolean; saving: boolean; soundEnabled: boolean; vibrateEnabled: boolean;
  notif: NotificationSettings;
  onSoundChange: (v: boolean) => void; onVibrateChange: (v: boolean) => void;
  onNotifChange: (updates: Partial<NotificationSettings>) => void;
}) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}><ActivityIndicator color={theme.accent} /></View>;

  const MSG_OPTIONS = [
    { label: 'Disabled',     value: 0 },
    { label: 'Everyone',     value: 1 },
    { label: 'Friends Only', value: 2 },
  ];

  return (
    <>
      <View style={{ marginTop: 16, marginHorizontal: 20, marginBottom: 4 }}>
        <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>Notification settings for private and group chats</Text>
      </View>

      <SectionLabel text="IN-APP ALERTS" />
      <Card>
        <View style={r.container}>
          <Ionicons name="volume-high-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <Text style={r.label}>Alert sound</Text>
          <Switch value={soundEnabled} onValueChange={onSoundChange} trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" testID="settings-toggle-sound" disabled={saving} />
        </View>
        <Divider />
        <View style={r.container}>
          <Ionicons name="phone-portrait-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <Text style={r.label}>Vibrate</Text>
          <Switch value={vibrateEnabled} onValueChange={onVibrateChange} trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" testID="settings-toggle-vibrate" disabled={saving} />
        </View>
      </Card>

      <SectionLabel text="WHO CAN MESSAGE ME" />
      <Card>
        {MSG_OPTIONS.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 && <Divider />}
            <TouchableOpacity style={[r.container, { paddingVertical: 14 }]} onPress={() => onNotifChange({ messageSetting: opt.value })} testID={`settings-msg-option-${opt.value}`} disabled={saving}>
              <Ionicons name={notif.messageSetting === opt.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={notif.messageSetting === opt.value ? theme.accent : theme.textSecondary} style={r.ionIcon} />
              <Text style={[r.label, notif.messageSetting === opt.value && { color: theme.accent, fontWeight: '600' }]}>{opt.label}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <SectionLabel text="EMAIL NOTIFICATIONS" />
      <Card>
        {[
          { key: 'emailMention',    icon: 'at-outline',                  label: 'When someone mentions me',        val: notif.emailMention },
          { key: 'emailReplyToPost',icon: 'return-down-back-outline',     label: 'When someone replies to my post', val: notif.emailReplyToPost },
          { key: 'emailReceiveGift',icon: 'gift-outline',                 label: 'When I receive a gift',           val: notif.emailReceiveGift },
          { key: 'emailNewFollower',icon: 'person-add-outline',           label: 'When I get a new follower',       val: notif.emailNewFollower },
        ].map((item, idx) => (
          <View key={item.key}>
            {idx > 0 && <Divider />}
            <View style={r.container}>
              <Ionicons name={item.icon as any} size={22} color={theme.accent} style={r.ionIcon} />
              <Text style={r.label}>{item.label}</Text>
              <Switch value={item.val} onValueChange={(v) => onNotifChange({ [item.key]: v })} trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" testID={`settings-toggle-email-${item.key.replace('email','').toLowerCase()}`} disabled={saving} />
            </View>
          </View>
        ))}
      </Card>

      {saving && <View style={{ alignItems: 'center', marginTop: 12 }}><ActivityIndicator color={theme.accent} /></View>}
    </>
  );
}

function ThirdPartySitesPage({ fbConnected, twConnected, onFbToggle, onTwToggle }: {
  fbConnected: boolean; twConnected: boolean; onFbToggle: () => void; onTwToggle: () => void;
}) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);
  return (
    <>
      <SectionLabel text="CONNECTED ACCOUNTS" />
      <Card>
        <View style={r.container}>
          <Image source={require('../assets/icons/ad_facebook_blue.png')} style={r.img} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={r.label}>Facebook</Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{fbConnected ? 'Connected' : 'Not connected'}</Text>
          </View>
          <TouchableOpacity style={{ borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: fbConnected ? theme.divider : FB_COLOR }} onPress={onFbToggle} testID="settings-fb-toggle">
            <Text style={{ fontSize: 13, fontWeight: '600', color: fbConnected ? theme.textSecondary : '#FFFFFF' }}>{fbConnected ? 'Disconnect' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
        <Divider />
        <View style={r.container}>
          <Image source={require('../assets/icons/ad_twitter_blue.png')} style={r.img} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={r.label}>Twitter / X</Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{twConnected ? 'Connected' : 'Not connected'}</Text>
          </View>
          <TouchableOpacity style={{ borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: twConnected ? theme.divider : TW_COLOR }} onPress={onTwToggle} testID="settings-tw-toggle">
            <Text style={{ fontSize: 13, fontWeight: '600', color: twConnected ? theme.textSecondary : '#FFFFFF' }}>{twConnected ? 'Disconnect' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
      </Card>
      <SectionLabel text="POST SHARING" />
      <Card>
        <View style={r.container}>
          <Ionicons name="share-social-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <Text style={r.label}>Auto-share updates to connected accounts</Text>
        </View>
        <Divider />
        <View style={r.container}>
          <Ionicons name="newspaper-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <Text style={r.label}>Share posts to Facebook</Text>
          <Switch value={fbConnected} disabled trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" />
        </View>
        <Divider />
        <View style={r.container}>
          <Ionicons name="newspaper-outline" size={22} color={theme.accent} style={r.ionIcon} />
          <Text style={r.label}>Share posts to Twitter</Text>
          <Switch value={twConnected} disabled trackColor={{ false: theme.divider, true: theme.accent }} thumbColor="#FFFFFF" />
        </View>
      </Card>
    </>
  );
}

function ApplicationPage() {
  return (
    <>
      <SectionLabel text="INFO" />
      <Card>
        <Row iconName="information-circle-outline" label="Version" right="1.0.0" testID="settings-version-text" />
        <Divider />
        <Row iconName="construct-outline" label="Services" onPress={() => Alert.alert('Services', 'max99 Fusion Gateway v4\nTCP Protocol: binary FusionPacket')} showChevron testID="settings-services" />
      </Card>
      <SectionLabel text="STORAGE" />
      <Card>
        <Row iconName="trash-outline" label="Clear cached images"
          onPress={() => Alert.alert('Confirmation', 'Sure you want to clear cached images?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'OK', onPress: () => Alert.alert('Done', 'Cached images cleared') },
          ])}
          testID="settings-app-clear-cache" />
      </Card>
    </>
  );
}

function AboutMigPage() {
  const theme = useAppTheme();
  return (
    <>
      <View style={{ alignItems: 'center', paddingVertical: 32, backgroundColor: theme.cardBg, borderBottomWidth: 1, borderColor: theme.divider, marginBottom: 4 }}>
        <Image source={require('../assets/icons/ad_info_green.png')} style={{ width: 64, height: 64, marginBottom: 12, tintColor: theme.accent }} resizeMode="contain" />
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4 }}>max99</Text>
        <Text style={{ fontSize: 13, color: theme.textSecondary }}>Version 1.0.0</Text>
      </View>
      <SectionLabel text="ABOUT" />
      <Card>
        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 22 }}>
            max99 is a social platform connecting millions of users through chat, games, and shared experiences. Built on the Fusion protocol, max99 supports real-time messaging, chatrooms, leaderboards, and virtual currency.
          </Text>
        </View>
      </Card>
      <SectionLabel text="LEGAL" />
      <Card>
        <Row iconName="document-text-outline" label="Terms of service"    onPress={() => Alert.alert('Terms of Service', 'By using max99 you agree to our Terms of Service. For the full terms, visit chatmeapp.my.id/terms.')} showChevron testID="settings-terms" />
        <Divider />
        <Row iconName="lock-closed-outline"   label="Privacy policy"      onPress={() => Alert.alert('Privacy Policy', 'Your data is protected in accordance with our Privacy Policy. For details, visit chatmeapp.my.id/privacy.')} showChevron testID="settings-privacy-policy" />
        <Divider />
        <Row iconName="code-outline"          label="Open source licenses" onPress={() => Alert.alert('Open Source', 'This app uses open source software. See NOTICES file for details.')} showChevron testID="settings-oss" />
      </Card>
      <SectionLabel text="SUPPORT" />
      <Card>
        <Row iconName="mail-outline" label="Contact support" onPress={() => Alert.alert('Support', 'Email us at support@chatmeapp.my.id')} showChevron testID="settings-support" />
      </Card>
    </>
  );
}

function ChatThemePage({ selectedThemeId, onSelect }: { selectedThemeId: number; onSelect: (id: number) => void }) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);

  const THEME_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
    1: 'moon-outline', 2: 'sunny-outline', 3: 'water-outline', 4: 'leaf-outline',
    5: 'partly-sunny-outline', 6: 'planet-outline', 7: 'contrast-outline',
  };

  return (
    <>
      <SectionLabel text="PILIH TEMA CHATROOM" />
      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 18 }}>Tema dipasang ke semua chatroom. Perubahan tersimpan otomatis.</Text>
      </View>
      <Card>
        {CHATROOM_THEMES.map((t, idx) => {
          const isSelected = t.themeId === selectedThemeId;
          const bgColor    = `#${t.background_color}`;
          const textColor  = `#${t.client_message_color}`;
          const icon = THEME_ICONS[t.themeId] ?? 'color-palette-outline';
          return (
            <View key={t.themeId}>
              <TouchableOpacity
                style={[r.container, isSelected && { backgroundColor: theme.accentSoft }]}
                activeOpacity={0.6}
                onPress={() => onSelect(t.themeId)}
                testID={`settings-theme-${t.themeId}`}
              >
                <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: bgColor, marginRight: 16, alignItems: 'center', justifyContent: 'center', borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? theme.accent : '#00000022' }}>
                  <Ionicons name={icon} size={20} color={textColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[r.label, { flex: 0 }, isSelected && { color: theme.accent, fontWeight: '700' }]}>{t.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                    {[t.background_color, t.sender_username_color, t.admin_username_color, t.emote_message_color].map((col, i) => (
                      <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: `#${col}`, borderWidth: 0.5, borderColor: '#00000030' }} />
                    ))}
                  </View>
                </View>
                {isSelected
                  ? <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  : <Ionicons name="ellipse-outline"  size={22} color={theme.divider} />}
              </TouchableOpacity>
              {idx < CHATROOM_THEMES.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>

      <SectionLabel text="PREVIEW TEMA" />
      {(() => {
        const t = getThemeById(selectedThemeId);
        return (
          <View style={{ marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.divider }}>
            <View style={{ backgroundColor: `#${t.background_color}`, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FFFFFF22', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="chatbubbles" size={16} color={`#${t.sender_username_color}`} />
              <Text style={{ color: `#${t.sender_username_color}`, fontWeight: '700', fontSize: 13 }}>#max99-lounge</Text>
            </View>
            <View style={{ backgroundColor: `#${t.background_color}`, padding: 12, gap: 8 }}>
              <View>
                <Text style={{ color: `#${t.admin_username_color}`, fontSize: 12, fontWeight: '700' }}>Admin [5]</Text>
                <Text style={{ color: `#${t.admin_message_color}`, fontSize: 12 }}>Selamat datang di max99!</Text>
              </View>
              <View>
                <Text style={{ color: `#${t.sender_username_color}`, fontSize: 12, fontWeight: '700' }}>kamu [2]</Text>
                <Text style={{ color: `#${t.client_message_color}`, fontSize: 12 }}>Halo semuanya 👋</Text>
              </View>
              <View>
                <Text style={{ color: `#${t.recp_username_color}`, fontSize: 12, fontWeight: '700' }}>temanmu [3]</Text>
                <Text style={{ color: `#${t.recp_message_color}`, fontSize: 12 }}>Hai! Lagi ngapain?</Text>
              </View>
              <View>
                <Text style={{ color: `#${t.emote_message_color}`, fontSize: 12, fontStyle: 'italic' }}>✦ temanmu sends a gift!</Text>
              </View>
            </View>
          </View>
        );
      })()}
      <View style={{ height: 20 }} />
    </>
  );
}

function LanguagePage({ selected, loading, onSelect }: { selected: string; loading: boolean; onSelect: (id: string) => void; }) {
  const theme = useAppTheme();
  const r = makeRowStyles(theme);
  return (
    <>
      {loading && <ActivityIndicator color={theme.accent} style={{ marginBottom: 8 }} />}
      <Card>
        {LANGUAGES.map((lang, idx) => (
          <View key={lang.id}>
            <TouchableOpacity style={r.container} activeOpacity={0.6} onPress={() => { if (!loading) onSelect(lang.id); }} testID={`settings-lang-${lang.id}`}>
              <Ionicons name="language-outline" size={22} color={theme.accent} style={r.ionIcon} />
              <Text style={r.label}>{lang.name}</Text>
              {selected === lang.id && <Ionicons name="checkmark" size={20} color={theme.accent} />}
            </TouchableOpacity>
            {idx < LANGUAGES.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    </>
  );
}

// ─── Style factories ──────────────────────────────────────────────────────────

function makeRootStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    root:         { flex: 1, backgroundColor: theme.screenBg },
    header:       { backgroundColor: theme.headerBg, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
    backBtn:      { marginRight: 12, padding: 4 },
    backIcon:     { width: 20, height: 20 },
    headerIcon:   { width: 22, height: 22, tintColor: theme.accent, marginRight: 10 },
    headerTitle:  { color: theme.textOnAccent, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
    body:         { flex: 1 },
    heroGradient: {
      alignItems: 'center',
      paddingBottom: 24,
      paddingHorizontal: 20,
    },
    heroCloseBtn: {
      position: 'absolute',
      top: 16,
      left: 16,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: 'rgba(45,122,79,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#1A5C36',
      letterSpacing: 0.3,
    },
  });
}

function makeRowStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, backgroundColor: theme.cardBg },
    ionIcon:   { marginRight: 16, width: 24, textAlign: 'center' },
    img:       { width: 24, height: 24, marginRight: 16 },
    label:     { flex: 1, fontSize: 15, color: theme.textPrimary },
    right:     { fontSize: 13, color: theme.textSecondary },
  });
}

function makeFormStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    field:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 4, backgroundColor: theme.cardBg },
    icon:    { marginRight: 12 },
    imgIcon: { width: 20, height: 20, marginRight: 12, tintColor: theme.textSecondary },
    input:   { flex: 1, height: 44, fontSize: 15, color: theme.textPrimary },
    btn:     { marginHorizontal: 20, marginVertical: 14, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  });
}
