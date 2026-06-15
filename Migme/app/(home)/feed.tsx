import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { API_BASE, buildHeaders, getMe } from '../../services/auth';
import { useAppTheme } from '../../services/themeContext';
import ViewProfileModal from '../../components/ViewProfileModal';
import AvatarWithFrame from '../../components/AvatarWithFrame';

const SCREEN_H = Dimensions.get('window').height;

// ─── Constants (mirroring Android's Constants.MAX_MESSAGE_LENGTH) ─────────────
const MAX_CHARS = 500;

// ─── Theme colours ────────────────────────────────────────────────────────────
const C = {
  green:     '#00A8CC',
  darkGreen: '#006D8F',
  white:     '#FFFFFF',
  bg:        '#F2F2F2',
  cardBg:    '#FFFFFF',
  text:      '#212121',
  ts:        '#9E9E9E',
  sep:       '#EEEEEE',
  actionSep: '#E0E0E0',
  grey:      '#757575',
  inputBg:   '#FAFAFA',
  charOk:    '#9E9E9E',
  charWarn:  '#FB8C00',
  charError: '#E53935',
  overlayBg: 'rgba(0,0,0,0.55)',
  fabBg:     '#00A8CC',
  avatarBg:  '#005F73',
  previewBg: '#F5F5F5',
  privacySep:'#E8E8E8',
  twitterBlue: '#1DA1F2',
  facebookBlue: '#1877F2',
};

// ─── Emoji list (mirroring AttachmentPagerFragment emoticon grid) ─────────────
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇',
  '🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
  '😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪',
  '😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','😵','🤯',
  '🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮',
  '😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢',
  '😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤',
  '😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
];

// ─── Hot Topics (mirroring PostsDatastore.getHotTopics) ───────────────────────
const HOT_TOPICS = [
  '#max99', '#trending', '#fun', '#music', '#gaming',
  '#food', '#travel', '#selfie', '#love', '#friends',
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface FeedPost {
  id: string;
  authorUsername: string;
  authorDisplayPicture?: string | null;
  authorIsAdmin?: boolean;
  authorMerchantType?: number | null;  // 1=Merchant L1, 2=Mentor L2, 3=Head Mentor L3
  authorMigLevel?: number | null;
  authorCountry?: string | null;
  comment: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  mediaType?: string;
  numLikes: number;
  numDislikes: number;
  numComments: number;
  createdAt: string;
  type: number;
  repostId?: string | null;
  repostAuthorUsername?: string | null;
  repostComment?: string | null;
}

// ─── Identity helpers (mirror Home contact list for visual consistency) ──────
// Convert ISO-3166 alpha-2 country code → flag emoji ("ID" → 🇮🇩). Returns
// null for invalid input so callers can skip rendering.
function countryToFlag(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return null;
  const A = 0x1F1E6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}
// Tiered level pill colors — same tier mapping as Home for consistency.
function levelTier(level: number): { bg: string; fg: string } {
  if (level >= 80) return { bg: '#DC2626', fg: '#FFFFFF' };
  if (level >= 50) return { bg: '#F59E0B', fg: '#1F2937' };
  if (level >= 30) return { bg: '#8B5CF6', fg: '#FFFFFF' };
  if (level >= 10) return { bg: '#3B82F6', fg: '#FFFFFF' };
  return { bg: '#6B7280', fg: '#FFFFFF' };
}

// ─── Role styling: badge + username color ─────────────────────────────────────
// Admin Global: orange "A"
// Merchant L1 : purple "A"
// Merchant L2 : red    "MT"
// Merchant L3 : pink   "HM"
function getRoleStyle(post: { authorIsAdmin?: boolean; authorMerchantType?: number | null }):
  | { color: string; badgeLabel: string } | null {
  if (post.authorIsAdmin) return { color: '#FF6F00', badgeLabel: 'A' };
  switch (post.authorMerchantType) {
    case 1: return { color: '#990099', badgeLabel: 'A'  };
    case 2: return { color: '#FF0000', badgeLabel: 'MT' };
    case 3: return { color: '#FF2EA7', badgeLabel: 'HM' };
    default: return null;
  }
}

// ─── Bulat badge dengan huruf di tengah ───────────────────────────────────────
function RoleBadge({ color, label }: { color: string; label: string }) {
  // Lebar menyesuaikan jumlah huruf agar "MT"/"HM" tetap muat
  const size = label.length > 1 ? 22 : 18;
  return (
    <View
      style={{
        minWidth: size,
        height: 18,
        paddingHorizontal: label.length > 1 ? 5 : 0,
        borderRadius: 9,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: 'Roboto_700Bold', lineHeight: 12 }}>
        {label}
      </Text>
    </View>
  );
}

interface PostComment {
  id: string;
  postId: string;
  authorUsername: string;
  text: string;
  createdAt: string;
}

type PostPrivacy   = 'everyone' | 'friends' | 'private';
type CreateAction  = 'new_post' | 'reply' | 'repost';

// ─── Rich text: colour #hashtags and @mentions (mirrors SpannableBuilder.java) ─
function RichText({ text, style, testID }: { text: string; style?: any; testID?: string }) {
  const theme = useAppTheme();
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <Text style={style} testID={testID}>
      {parts.map((part, i) => {
        if (/^#\w+/.test(part)) {
          return (
            <Text key={i} style={{ color: theme.accent, fontWeight: '600' }}>{part}</Text>
          );
        }
        if (/^@\w+/.test(part)) {
          return (
            <Text key={i} style={{ color: theme.isDark ? '#FF7070' : '#8B0000', fontWeight: '600' }}>{part}</Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function useSlideUp(visible: boolean) {
  const anim = useRef(new Animated.Value(700)).current;
  useEffect(() => {
    if (visible) {
      Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 700, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);
  return anim;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ username, displayPicture, avatarFrameUrl, size = 42 }: {
  username: string;
  displayPicture?: string | null;
  avatarFrameUrl?: string | null;
  size?: number;
}) {
  const theme = useAppTheme();
  return (
    <AvatarWithFrame
      size={size}
      username={username}
      displayPicture={displayPicture}
      avatarFrameUrl={avatarFrameUrl}
      initial={username.slice(0, 2).toUpperCase()}
      backgroundColor={theme.accent}
    />
  );
}

// ─── Privacy Popup (mirroring getPrivacyMenuOptions) ─────────────────────────
interface PrivacyPopupProps {
  visible: boolean;
  privacy: PostPrivacy;
  allowReplies: boolean;
  onSelect: (privacy: PostPrivacy) => void;
  onToggleReplies: () => void;
  onClose: () => void;
}

function PrivacyPopup({ visible, privacy, allowReplies, onSelect, onToggleReplies, onClose }: PrivacyPopupProps) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={ss.popupOverlay} onPress={onClose}>
        <Pressable style={[ss.popupBox, { backgroundColor: theme.cardBg }]} onPress={e => e.stopPropagation()}>
          <Text style={[ss.popupTitle, { color: theme.textSecondary }]}>Post visibility</Text>

          {([
            { value: 'everyone', label: 'Public',  icon: require('../../assets/icons/ad_public_grey.png') },
            { value: 'friends',  label: 'Friends', icon: require('../../assets/icons/ad_userppl_grey.png') },
            { value: 'private',  label: 'Private', icon: require('../../assets/icons/ad_private_grey.png') },
          ] as { value: PostPrivacy; label: string; icon: any }[]).map((opt, i) => (
            <View key={opt.value}>
              <TouchableOpacity
                style={ss.popupRow}
                onPress={() => { onSelect(opt.value); onClose(); }}
                testID={`button-privacy-${opt.value}`}
              >
                <Image source={opt.icon} style={ss.popupIcon} resizeMode="contain" />
                <Text style={[ss.popupLabel, { color: theme.textPrimary }, privacy === opt.value && { color: theme.accent, fontWeight: '700' }]}>
                  {opt.label}
                </Text>
                {privacy === opt.value && (
                  <View style={[ss.popupCheck, { backgroundColor: theme.accent }]} />
                )}
              </TouchableOpacity>
              {i < 2 && <View style={[ss.popupSep, { backgroundColor: theme.divider }]} />}
            </View>
          ))}

          <View style={[ss.popupSep, { marginVertical: 4, backgroundColor: theme.divider }]} />

          <TouchableOpacity
            style={ss.popupRow}
            onPress={onToggleReplies}
            testID="button-toggle-replies"
          >
            <Image source={require('../../assets/icons/ad_reply_grey.png')} style={ss.popupIcon} resizeMode="contain" />
            <Text style={[ss.popupLabel, { color: theme.textPrimary }]}>Allow replies</Text>
            <View style={[ss.toggleDot, allowReplies && { backgroundColor: theme.accent, borderColor: theme.accent }]} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Privacy button icon helper (mirroring resetPrivacyDisplay) ───────────────
function privacyIcon(p: PostPrivacy) {
  if (p === 'private') return require('../../assets/icons/ad_private_grey.png');
  if (p === 'friends')  return require('../../assets/icons/ad_userppl_grey.png');
  return require('../../assets/icons/ad_public_grey.png');
}

// ─── SimplePostPreviewHolder (mirroring holder_simplepostpreview.xml) ─────────
function SimplePostPreview({ post }: { post: FeedPost }) {
  const theme = useAppTheme();
  return (
    <View style={[ss.postPreviewBox, { backgroundColor: theme.inputBg, borderLeftColor: theme.accent }]}>
      <Text style={[ss.postPreviewAuthor, { color: theme.accent }]} numberOfLines={1}>{post.authorUsername}</Text>
      <Text style={[ss.postPreviewContent, { color: theme.textSecondary }]} numberOfLines={2}>{post.comment}</Text>
    </View>
  );
}

// ─── Reputation Privileges (from /api/reputation/:username/level) ─────────────
// Mirrors ReputationLevelData.java — fetched at screen mount and cached locally.
interface ReputationPrivileges {
  level: number;
  levelName: string;
  publishPhoto: boolean;           // can attach photos to posts
  postCommentLikeUserWall: boolean; // can post / comment / like
  addToPhotoWall: boolean;          // can add to photo wall
}

const DEFAULT_PRIVILEGES: ReputationPrivileges = {
  level: 1, levelName: 'Newbie',
  publishPhoto: false, postCommentLikeUserWall: false, addToPhotoWall: false,
};

// ─── Create Post Modal (ShareboxFragment equivalent) ─────────────────────────
interface CreatePostModalProps {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
  action?: CreateAction;
  originalPost?: FeedPost | null;
  prefix?: string;
  allUsernames?: string[];
  canPhoto?: boolean; // mirrors publishPhoto privilege
}

function CreatePostModal({
  visible,
  onClose,
  onPosted,
  action = 'new_post',
  originalPost = null,
  prefix = '',
  allUsernames = [],
  canPhoto = false,
}: CreatePostModalProps) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ uri: string } | null>(null);
  const [video, setVideo] = useState<{ uri: string } | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [privacy, setPrivacy] = useState<PostPrivacy>('everyone');
  const [allowReplies, setAllowReplies] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [postToTwitter, setPostToTwitter] = useState(false);
  const [postToFacebook, setPostToFacebook] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionType, setSuggestionType] = useState<'mention' | 'hashtag' | null>(null);
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  const theme = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useSlideUp(visible);
  const [kbHeight, setKbHeight] = useState(0);
  const kbHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      if (kbHideTimer.current) { clearTimeout(kbHideTimer.current); kbHideTimer.current = null; }
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      kbHideTimer.current = setTimeout(() => { kbHideTimer.current = null; setKbHeight(0); }, 80);
    });
    return () => { showSub.remove(); hideSub.remove(); if (kbHideTimer.current) clearTimeout(kbHideTimer.current); };
  }, []);

  useEffect(() => {
    getMe().then(me => { if (me) setCurrentUser(me.username); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      setText(prefix || '');
      setPhoto(null);
      setVideo(null);
      setLocation('');
      setShowLocation(false);
      setShowEmojiPicker(false);
      setSuggestions([]);
      setSuggestionType(null);
    }
  }, [visible, prefix]);

  const remaining = MAX_CHARS - text.length;
  const overLimit  = remaining < 0;
  const canPost = (text.trim().length > 0 || photo !== null || video !== null || action === 'repost') && !overLimit && !posting && !uploadingVideo;

  const charColor = overLimit ? C.charError : remaining <= 50 ? C.charWarn : C.charOk;

  // ── Text change: detect @ and # (mirroring onTextChanged) ─────────────────
  const handleTextChange = (val: string) => {
    setText(val);
    const lastChar = val.slice(-1);
    if (lastChar === '@') {
      setSuggestionType('mention');
      setSuggestions(allUsernames.map(u => `@${u}`));
    } else if (lastChar === '#') {
      setSuggestionType('hashtag');
      setSuggestions(HOT_TOPICS);
    } else {
      setSuggestionType(null);
      setSuggestions([]);
    }
  };

  const insertSuggestion = (s: string) => {
    const base = text.slice(0, -1); // remove the @ or #
    setText(base + s + ' ');
    setSuggestions([]);
    setSuggestionType(null);
  };

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
  };

  // ── Camera (mirroring attach_photo_button → takePhoto) ────────────────────
  const handleCamera = async () => {
    if (!canPhoto) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa melampirkan foto.');
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto({ uri: result.assets[0].uri });
      setShowEmojiPicker(false);
    }
  };

  // ── Gallery (mirroring attach_gallery_button → pickFromGallery) ────────────
  const handleGallery = async () => {
    if (!canPhoto) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa melampirkan foto.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto({ uri: result.assets[0].uri });
      setVideo(null);
      setShowEmojiPicker(false);
    }
  };

  // ── Video picker — dengan pilihan durasi (16 / 20 / 60 detik) ──────────────
  const handleVideoPicker = async () => {
    if (!canPhoto) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa melampirkan video.');
      return;
    }
    // Tampilkan pilihan durasi dulu (mirip TikTok: 16s / 20s / 60s)
    Alert.alert(
      'Pilih Durasi Video',
      'Berapa lama video yang ingin kamu upload?',
      [
        { text: '16 detik', onPress: () => _pickVideo(16) },
        { text: '20 detik', onPress: () => _pickVideo(20) },
        { text: '60 detik', onPress: () => _pickVideo(60) },
        { text: 'Batal', style: 'cancel' },
      ],
    );
  };

  const _pickVideo = async (maxDuration: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'] as any,
      allowsEditing: true,
      videoMaxDuration: maxDuration,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const duration = asset.duration ?? 0;
      if (duration > 0 && duration > maxDuration * 1000 + 500) {
        Alert.alert(
          'Video terlalu panjang',
          `Video yang dipilih melebihi ${maxDuration} detik. Pilih video yang lebih pendek.`,
        );
        return;
      }
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      const sizeBytes = (fileInfo as any).size ?? 0;
      if (sizeBytes > 50 * 1024 * 1024) {
        Alert.alert('Video terlalu besar', 'Ukuran video maksimal 50MB. Pilih video yang lebih kecil.');
        return;
      }
      setVideo({ uri: asset.uri });
      setPhoto(null);
      setShowEmojiPicker(false);
    }
  };

  // ── Location (mirroring location_button → fetch GPS + reverse-geocode) ───
  // Tapping the pin icon expands the location row AND auto-fills it with the
  // user's current city/region. Pressing it again hides & clears the row.
  const handleToggleLocation = async () => {
    if (showLocation) {
      setShowLocation(false);
      setLocation('');
      return;
    }
    setShowLocation(true);
    if (location.trim().length > 0) return; // user already typed something
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Izin lokasi ditolak',
          'Aktifkan izin lokasi di pengaturan untuk menandai postingan dengan wilayah kamu, atau ketik manual.',
        );
        return;
      }
      const services = await Location.hasServicesEnabledAsync().catch(() => true);
      if (!services) {
        Alert.alert('GPS mati', 'Aktifkan GPS perangkat lalu coba lagi.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }).catch(() => [] as Location.LocationGeocodedAddress[]);
      const p = places[0];
      if (p) {
        // Prefer "City, Region" — fall back through district/subregion/country
        // to mirror Android's getAddressLine(0) shortform behavior.
        const city = p.city || p.subregion || p.district || p.name || '';
        const region = p.region || p.country || '';
        const formatted = [city, region].filter(Boolean).join(', ').trim();
        if (formatted) setLocation(formatted);
      }
    } catch {
      Alert.alert('Lokasi gagal', 'Tidak dapat mengambil lokasi sekarang. Coba lagi atau ketik manual.');
    } finally {
      setFetchingLocation(false);
    }
  };

  // ── Upload video — tries ImageKit direct upload first, falls back via server ─
  const uploadVideo = async (videoUri: string): Promise<string> => {
    const me = await getMe();
    if (!me) throw new Error('Sesi tidak valid. Silakan login ulang.');

    setUploadingVideo(true);
    try {
      // 1. Try direct ImageKit upload (avoids server bottleneck for large files)
      const authHeaders = await buildHeaders();
      const authRes = await fetch(`${API_BASE}/api/imagekit/auth`, {
        headers: authHeaders as any, credentials: 'include',
      });
      if (authRes.ok) {
        const auth = await authRes.json();
        if (auth.publicKey && auth.signature) {
          const fileName = `video_${me.username}_${Date.now()}.mp4`;
          const formData = new FormData();
          formData.append('file', { uri: videoUri, type: 'video/mp4', name: fileName } as any);
          formData.append('publicKey', auth.publicKey);
          formData.append('signature', auth.signature);
          formData.append('expire', String(auth.expire));
          formData.append('token', auth.token);
          formData.append('fileName', fileName);
          formData.append('folder', '/migme/videos');
          const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
            method: 'POST',
            body: formData,
          });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            if (data.url) return data.url;
          }
        }
      }
    } catch {}

    // 2. Fallback: base64 via server (max 25MB)
    const base64 = await FileSystem.readAsStringAsync(videoUri, { encoding: 'base64' });
    const sizeBytes = Math.round(base64.length * 0.75);
    if (sizeBytes > 25 * 1024 * 1024) {
      throw new Error(`Video ${(sizeBytes / 1024 / 1024).toFixed(1)}MB terlalu besar untuk diunggah via server. Max 25MB.`);
    }
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/imageserver/upload`, {
      method: 'POST',
      headers: { ...headers as any, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: me.username,
        imageKey: `video_${me.username}_${Date.now()}`,
        mimeType: 'video/mp4',
        base64Data: base64,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Upload video gagal.');
    if (!data.url) throw new Error('Server tidak mengembalikan URL video.');
    return data.url;
  };

  // ── Upload photo to ImageKit CDN via imageserver endpoint ─────────────────
  const uploadPhoto = async (photoUri: string): Promise<string> => {
    const me = await getMe();
    if (!me) throw new Error('Sesi tidak valid. Silakan login ulang.');
    const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
    const sizeBytes = Math.round(base64.length * 0.75);
    if (sizeBytes > 5 * 1024 * 1024) {
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
      throw new Error(`Ukuran foto ${sizeMb}MB melebihi batas 5MB. Silakan pilih foto yang lebih kecil.`);
    }
    const ext = photoUri.toLowerCase().includes('.png') ? 'png' : 'jpeg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const imageKey = `feed_${me.username}_${Date.now()}`;
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/imageserver/upload`, {
      method: 'POST',
      headers: { ...headers as any, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: me.username, imageKey, mimeType, base64Data: base64 }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? `Upload gagal (${res.status}). Periksa konfigurasi ImageKit di server.`);
    }
    if (!data.url) throw new Error('Server tidak mengembalikan URL gambar.');
    return data.url;
  };

  // ── Post (mirroring handlePost) ────────────────────────────────────────────
  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      let imageUrl: string | undefined;
      let videoUrl: string | undefined;

      // Upload video first if selected
      if (video) {
        try {
          videoUrl = await uploadVideo(video.uri);
        } catch (err: unknown) {
          setPosting(false);
          setUploadingVideo(false);
          const msg = err instanceof Error ? err.message : 'Upload video gagal.';
          Alert.alert('Upload Video Gagal', msg);
          return;
        } finally {
          setUploadingVideo(false);
        }
      } else if (photo) {
        try {
          imageUrl = await uploadPhoto(photo.uri);
        } catch (uploadErr: unknown) {
          const msg = uploadErr instanceof Error ? uploadErr.message : 'Upload foto gagal.';
          setPosting(false);
          Alert.alert(
            'Upload Foto Gagal',
            msg + '\n\nKamu bisa posting tanpa foto, atau batal untuk mencoba lagi.',
            [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Posting Tanpa Foto',
                onPress: async () => {
                  setPosting(true);
                  try {
                    const h = await buildHeaders();
                    const body: any = { comment: text.trim(), type: 1, privacy, allowReplies };
                    if (action === 'repost' && originalPost) body.repostId = originalPost.id;
                    const r = await fetch(`${API_BASE}/api/feed/post`, {
                      method: 'POST',
                      headers: { ...h as any, 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    });
                    if (!r.ok) {
                      const d = await r.json().catch(() => ({}));
                      Alert.alert('Gagal', d.message || 'Post gagal dikirim. Coba lagi.');
                      return;
                    }
                    onPosted();
                    onClose();
                  } catch {} finally { setPosting(false); }
                },
              },
            ],
          );
          return;
        }
      }

      const body: any = {
        comment: text.trim(),
        type: 1,
        privacy,
        allowReplies,
        postToTwitter,
        postToFacebook,
        location: location.trim() || undefined,
        imageUrl,
        videoUrl,
        mediaType: videoUrl ? 'video' : (imageUrl ? 'image' : 'text'),
      };
      if (action === 'repost' && originalPost) {
        body.repostId = originalPost.id;
      }
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post`, {
        method: 'POST',
        headers: { ...headers as any, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        Alert.alert('Gagal', d.message || 'Post gagal dikirim. Coba lagi.');
        return;
      }
      onPosted();
      onClose();
    } catch {
    } finally {
      setPosting(false);
      setUploadingVideo(false);
    }
  };

  const titleText =
    action === 'reply'  ? 'Leave your comment' :
    action === 'repost' ? 'Repost'              : 'Share';

  const placeholderText =
    action === 'reply'  ? 'Leave your comment' :
    action === 'repost' ? 'Add your thoughts...' : 'Tell your story!';

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
        <View style={[ss.modalOuter, { paddingBottom: kbHeight }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View style={[ss.createSheet, { backgroundColor: theme.cardBg, transform: [{ translateY: slideAnim }] }]}>
            {/* flex column: Header + Author + [flex content] + Footer */}

            {/* ── Header (mirroring main_sharebox_container top bar) ─────── */}
            <View style={[ss.modalHeader, { borderBottomColor: theme.divider }]}>
              <TouchableOpacity onPress={onClose} style={ss.modalCloseBtn} testID="button-close-create-post">
                <Image source={require('../../assets/icons/ic_cancel.png')} style={[ss.modalCloseIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
              </TouchableOpacity>
              <Text style={[ss.modalTitle, { color: theme.textPrimary }]}>{titleText}</Text>
              <TouchableOpacity
                onPress={handlePost}
                disabled={!canPost}
                style={[ss.postSendBtn, { backgroundColor: canPost ? theme.accent : undefined }, !canPost && ss.postSendBtnDisabled]}
                testID="button-submit-post"
              >
                {posting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Image source={require('../../assets/icons/ad_send_green.png')} style={ss.sendIcon} resizeMode="contain" />
                }
              </TouchableOpacity>
            </View>

            {/* ── Author row + Privacy button ────────────────────────────── */}
            <View style={ss.authorRow}>
              <Avatar username={currentUser || 'me'} size={38} />
              <View style={ss.authorMeta}>
                <Text style={[ss.authorName, { color: theme.textPrimary }]}>{currentUser || 'You'}</Text>
                {action !== 'reply' && (
                  <TouchableOpacity
                    style={[ss.privacyBtn, { backgroundColor: theme.inputBg }]}
                    onPress={() => setShowPrivacy(true)}
                    testID="button-privacy"
                  >
                    <Image source={privacyIcon(privacy)} style={ss.privacyIcon} resizeMode="contain" />
                    <Text style={[ss.privacyText, { color: theme.textSecondary }]}>
                      {privacy === 'everyone' ? 'Everyone' : privacy === 'friends' ? 'Friends' : 'Only me'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── Scrollable content area (mirroring ScrollViewEx) ──────── */}
            {/* View with flex:1 ensures ScrollView fills remaining space */}
            <View style={ss.contentArea}>
            <ScrollView style={ss.contentScroll} contentContainerStyle={ss.contentScrollInner} keyboardShouldPersistTaps="handled">

              {/* Autocomplete suggestions (@ mention / # hashtag) ──────── */}
              {suggestions.length > 0 && (
                <View style={[ss.suggestBox, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                  {suggestions.map((s, i) => (
                    <TouchableOpacity
                      key={s}
                      style={[ss.suggestRow, i < suggestions.length - 1 && [ss.suggestRowBorder, { borderBottomColor: theme.divider }]]}
                      onPress={() => insertSuggestion(s)}
                      testID={`button-suggest-${s}`}
                    >
                      {suggestionType === 'mention' && (
                        <Image source={require('../../assets/icons/ad_avatar_grey.png')} style={[ss.suggestIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
                      )}
                      <Text style={[ss.suggestText, { color: theme.textPrimary }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Main text field (mirroring share_field AutoCompleteTextViewEx) */}
              <TextInput
                ref={inputRef}
                style={[ss.shareField, { color: theme.textPrimary }]}
                placeholder={placeholderText}
                placeholderTextColor={theme.textSecondary}
                multiline
                value={text}
                onChangeText={handleTextChange}
                autoFocus
                textAlignVertical="top"
                testID="input-post-text"
              />

              {/* Photo thumbnail (mirroring thumbnail_box) ───────────────── */}
              {photo && (
                <View style={ss.thumbBox}>
                  <Image source={{ uri: photo.uri }} style={ss.thumbImage} resizeMode="cover" />
                  <TouchableOpacity
                    style={ss.thumbRemove}
                    onPress={() => setPhoto(null)}
                    testID="button-remove-photo"
                  >
                    <Image source={require('../../assets/icons/ic_cancel.png')} style={ss.thumbRemoveIcon} resizeMode="contain" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Video thumbnail preview */}
              {video && (
                <View style={ss.videoThumbBox}>
                  <View style={ss.videoThumbInner}>
                    <Ionicons name="videocam" size={32} color="#fff" />
                    <Text style={ss.videoThumbLabel} numberOfLines={1}>{video.uri.split('/').pop()}</Text>
                  </View>
                  {uploadingVideo && (
                    <View style={ss.videoUploadOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={{ color: '#fff', fontSize: 12, marginLeft: 6 }}>Mengunggah…</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={ss.thumbRemove}
                    onPress={() => setVideo(null)}
                    testID="button-remove-video"
                  >
                    <Image source={require('../../assets/icons/ic_cancel.png')} style={ss.thumbRemoveIcon} resizeMode="contain" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Repost preview (mirroring SimplePostPreviewHolder for REPOST) */}
              {action === 'repost' && originalPost && (
                <SimplePostPreview post={originalPost} />
              )}

              {/* Location field (mirroring location_text) ───────────────── */}
              {showLocation && (
                <View style={[ss.locationRow, { backgroundColor: theme.inputBg }]}>
                  <Image source={require('../../assets/icons/ad_location_grey.png')} style={[ss.locationIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
                  <TextInput
                    style={[ss.locationInput, { color: theme.textPrimary }]}
                    placeholder="Add location"
                    placeholderTextColor={theme.textSecondary}
                    value={location}
                    onChangeText={setLocation}
                    testID="input-location"
                  />
                  {location.length > 0 && (
                    <TouchableOpacity onPress={() => { setLocation(''); setShowLocation(false); }} testID="button-clear-location">
                      <Image source={require('../../assets/icons/ic_cancel.png')} style={{ width: 14, height: 14, tintColor: theme.textSecondary }} resizeMode="contain" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
            </View>{/* end contentArea */}

            {/* ── Char counter (mirroring char_count_container) ────────── */}
            <Text style={[ss.charCount, { color: charColor }]} testID="text-char-count">
              {remaining}
            </Text>

            {/* ── Footer separator (mirroring action_buttons_separator) ── */}
            <View style={[ss.footerSep, { backgroundColor: theme.divider }]} />

            {/* ── Action bar (mirroring action_buttons_container) ─────── */}
            <View style={ss.footerBar}>

              {/* Camera button (ad_camera_grey = attach_photo_button) */}
              {/* Locked (dimmed) when publishPhoto privilege is false (Level < 2) */}
              <TouchableOpacity
                style={[ss.footerBtn, !canPhoto && ss.footerBtnLocked]}
                onPress={handleCamera}
                testID="button-attach-camera"
              >
                <Image
                  source={require('../../assets/icons/ad_camera_grey.png')}
                  style={[ss.footerIcon, !canPhoto && ss.footerIconLocked]}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              {/* Gallery button (ad_gallery_grey = attach_gallery_button) */}
              {/* Locked (dimmed) when publishPhoto privilege is false (Level < 2) */}
              <TouchableOpacity
                style={[ss.footerBtn, !canPhoto && ss.footerBtnLocked]}
                onPress={handleGallery}
                testID="button-attach-gallery"
              >
                <Image
                  source={require('../../assets/icons/ad_gallery_grey.png')}
                  style={[ss.footerIcon, !canPhoto && ss.footerIconLocked]}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              {/* Video button hidden — akan diaktifkan kembali nanti */}

              {/* Emoticon button (ad_emoticon_grey = emoticon_button) */}
              <TouchableOpacity
                style={ss.footerBtn}
                onPress={() => { setShowEmojiPicker(p => !p); inputRef.current?.blur(); }}
                testID="button-emoticon"
              >
                <Image
                  source={require('../../assets/icons/ad_emoticon_grey.png')}
                  style={[ss.footerIcon, showEmojiPicker && { tintColor: theme.accent }]}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              {/* Location button (ad_location_grey) — taps trigger GPS lookup */}
              {action !== 'reply' && (
                <TouchableOpacity
                  style={ss.footerBtn}
                  onPress={handleToggleLocation}
                  disabled={fetchingLocation}
                  testID="button-location"
                >
                  {fetchingLocation ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Image
                      source={require('../../assets/icons/ad_location_grey.png')}
                      style={[ss.footerIcon, showLocation && { tintColor: theme.accent }]}
                      resizeMode="contain"
                    />
                  )}
                </TouchableOpacity>
              )}

              <View style={{ flex: 1 }} />

              {/* Twitter toggle (ad_twitter_grey/blue, for new_post & repost) */}
              {(action === 'new_post' || action === 'repost') && (
                <TouchableOpacity
                  style={ss.footerBtn}
                  onPress={() => setPostToTwitter(p => !p)}
                  testID="button-twitter"
                >
                  <Image
                    source={postToTwitter
                      ? require('../../assets/icons/ad_twitter_blue.png')
                      : require('../../assets/icons/ad_twitter_grey.png')}
                    style={ss.footerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}

              {/* Facebook toggle (ad_facebook_grey/blue, for new_post & repost) */}
              {(action === 'new_post' || action === 'repost') && (
                <TouchableOpacity
                  style={ss.footerBtn}
                  onPress={() => setPostToFacebook(p => !p)}
                  testID="button-facebook"
                >
                  <Image
                    source={postToFacebook
                      ? require('../../assets/icons/ad_facebook_blue.png')
                      : require('../../assets/icons/ad_facebook_grey.png')}
                    style={ss.footerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Emoticon grid (mirroring emoticon_grid FrameLayout) ────── */}
            {showEmojiPicker && (
              <View style={[ss.emojiGrid, { backgroundColor: theme.inputBg }]}>
                <ScrollView horizontal={false} style={{ maxHeight: 180 }}>
                  <View style={ss.emojiWrap}>
                    {EMOJIS.map(emoji => (
                      <TouchableOpacity
                        key={emoji}
                        style={ss.emojiCell}
                        onPress={() => insertEmoji(emoji)}
                        testID={`button-emoji-${emoji}`}
                      >
                        <Text style={ss.emojiChar}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

          </Animated.View>
        </View>
      </Modal>

      {/* Privacy popup (mirroring createPrivacyOptionsPopupMenu) */}
      <PrivacyPopup
        visible={showPrivacy}
        privacy={privacy}
        allowReplies={allowReplies}
        onSelect={setPrivacy}
        onToggleReplies={() => setAllowReplies(p => !p)}
        onClose={() => setShowPrivacy(false)}
      />
    </>
  );
}

// ─── Share Popup (ShareToFragment equivalent) ─────────────────────────────────
const SHARE_ITEMS = [
  { key: 'chat',     label: 'Chat',     icon: require('../../assets/icons/ad_chat_grey.png') },
  { key: 'email',    label: 'Email',    icon: require('../../assets/icons/ad_email_grey.png') },
  { key: 'facebook', label: 'Facebook', icon: require('../../assets/icons/ad_facebook_outline.png') },
  { key: 'twitter',  label: 'Twitter',  icon: require('../../assets/icons/ad_twitter_outline.png') },
  { key: 'other',    label: 'Other',    icon: require('../../assets/icons/ad_share_dark_grey.png') },
];

function SharePopup({ visible, post, onClose }: { visible: boolean; post: FeedPost | null; onClose: () => void }) {
  const theme = useAppTheme();
  const slideAnim = useSlideUp(visible);
  const insets = useSafeAreaInsets();

  const handleShare = async (key: string) => {
    onClose();
    if (!post) return;
    const url = `https://chatmeapp.my.id/share/post/${post.authorUsername}/${post.id}`;
    const content = post.comment;
    switch (key) {
      case 'email':
        Linking.openURL(`mailto:?subject=Check this post on max99&body=${encodeURIComponent(content + '\n\n' + url)}`);
        break;
      case 'facebook':
        Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
        break;
      case 'twitter':
        Linking.openURL(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(content)}`);
        break;
      default:
        try { await Share.share({ message: `${content}\n\n${url}`, url }); } catch {}
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={ss.modalOuter} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[ss.modalSheet, { backgroundColor: theme.cardBg, transform: [{ translateY: slideAnim }] }]}>
          <View style={[ss.shareHeader, { borderBottomColor: theme.divider }]}>
            <Text style={[ss.shareHeaderText, { color: theme.textPrimary }]}>Share to</Text>
          </View>
          {SHARE_ITEMS.map((item, idx) => (
            <View key={item.key}>
              <TouchableOpacity style={ss.shareRow} onPress={() => handleShare(item.key)} activeOpacity={0.7} testID={`button-share-dest-${item.key}`}>
                <Image source={item.icon} style={ss.shareItemIcon} resizeMode="contain" />
                <Text style={[ss.shareItemLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              </TouchableOpacity>
              {idx < SHARE_ITEMS.length - 1 && <View style={[ss.shareDivider, { backgroundColor: theme.divider }]} />}
            </View>
          ))}
          <View style={{ height: Math.max(insets.bottom, 16) }} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comment Modal (SinglePostFragment REPLY_TAB equivalent) ──────────────────
function CommentModal({
  visible, post, onClose, onCommented, allUsernames,
}: {
  visible: boolean;
  post: FeedPost | null;
  onClose: () => void;
  onCommented: (postId: string) => void;
  allUsernames: string[];
}) {
  const theme = useAppTheme();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [showReplyBox, setShowReplyBox] = useState(false);
  const slideAnim = useSlideUp(visible);
  const insets = useSafeAreaInsets();
  const [kbHeight, setKbHeight] = useState(0);
  const kbHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      if (kbHideTimer.current) { clearTimeout(kbHideTimer.current); kbHideTimer.current = null; }
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      kbHideTimer.current = setTimeout(() => { kbHideTimer.current = null; setKbHeight(0); }, 80);
    });
    return () => { showSub.remove(); hideSub.remove(); if (kbHideTimer.current) clearTimeout(kbHideTimer.current); };
  }, []);

  useEffect(() => {
    getMe().then(me => { if (me) setCurrentUser(me.username); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible && post) { loadComments(post.id); setShowReplyBox(false); }
    else { setComments([]); setText(''); }
  }, [visible, post]);

  const loadComments = async (postId: string) => {
    setLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post/${postId}/comments`, { headers, credentials: 'include' });
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch { setComments([]); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!text.trim() || sending || !post) return;
    setSending(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post/${post.id}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { ...headers as any, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Gagal', data.message || 'Komentar tidak terkirim. Coba lagi.');
        return;
      }
      if (data.comment) {
        setComments(prev => [...prev, data.comment]);
        setText('');
        onCommented(post.id);
        setShowReplyBox(false);
      } else {
        Alert.alert('Gagal', 'Komentar tidak terkirim. Coba lagi.');
      }
    } catch (err) {
      Alert.alert('Error', 'Tidak dapat terhubung ke server. Periksa koneksi internet.');
    } finally { setSending(false); }
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[ss.modalOuter, { paddingBottom: kbHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[ss.commentSheet, { backgroundColor: theme.cardBg, transform: [{ translateY: slideAnim }], paddingBottom: Math.max(insets.bottom, 16) }]}>

          <View style={[ss.modalHeader, { borderBottomColor: theme.divider }]}>
            <TouchableOpacity onPress={onClose} style={ss.modalCloseBtn} testID="button-close-comments">
              <Image source={require('../../assets/icons/ic_cancel.png')} style={[ss.modalCloseIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
            </TouchableOpacity>
            <Text style={[ss.modalTitle, { color: theme.textPrimary }]}>Replies</Text>
            <Text style={[ss.commentCount, { color: theme.textSecondary }]}>{post.numComments}</Text>
          </View>

          {/* Original post preview (mirroring SinglePostFragment header) */}
          <View style={[ss.originalPostBox, { backgroundColor: theme.inputBg }]}>
            <Avatar username={post.authorUsername} size={32} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[ss.username, { color: theme.accent }]}>{post.authorUsername}</Text>
              <Text style={[ss.originalPostText, { color: theme.textSecondary }]} numberOfLines={2}>{post.comment}</Text>
            </View>
          </View>

          <View style={[ss.commentListSep, { backgroundColor: theme.divider }]} />

          {loading ? (
            <View style={ss.commentCenter}><ActivityIndicator color={theme.accent} /></View>
          ) : comments.length === 0 ? (
            <View style={ss.commentCenter}>
              <Text style={[ss.noCommentText, { color: theme.textSecondary }]}>No replies yet. Be the first!</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              style={ss.commentList}
              renderItem={({ item }) => (
                <View style={ss.commentItem} testID={`comment-item-${item.id}`}>
                  <Avatar username={item.authorUsername} size={34} />
                  <View style={[ss.commentBubble, { backgroundColor: theme.inputBg }]}>
                    <Text style={[ss.commentAuthor, { color: theme.accent }]}>{item.authorUsername}</Text>
                    <RichText text={item.text} style={[ss.commentText, { color: theme.textPrimary }]} />
                    <Text style={[ss.commentTs, { color: '#666' }]}>{timeAgo(item.createdAt)}</Text>
                  </View>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            />
          )}

          {/* Reply input bar (mirroring ShareboxFragment REPLY_POST mode) */}
          {showReplyBox ? (
            <View style={[ss.replyInputBar, { borderTopColor: theme.divider }]}>
              <Avatar username={currentUser || 'me'} size={32} />
              <TextInput
                style={[ss.replyInput, { backgroundColor: theme.inputBg, color: theme.textPrimary }]}
                placeholder="Write a reply..."
                placeholderTextColor={theme.textSecondary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={MAX_CHARS}
                autoFocus
                testID="input-comment-text"
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!text.trim() || sending}
                style={[ss.replySendBtn, { backgroundColor: text.trim() && !sending ? theme.accent : undefined }, (!text.trim() || sending) && ss.replySendBtnDisabled]}
                testID="button-send-comment"
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Image source={require('../../assets/icons/ad_send_green.png')} style={ss.sendIcon} resizeMode="contain" />
                }
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[ss.replyTrigger, { borderTopColor: theme.divider, backgroundColor: theme.inputBg }]}
              onPress={() => setShowReplyBox(true)}
              testID="button-open-reply"
            >
              <Avatar username={currentUser || 'me'} size={30} />
              <Text style={[ss.replyTriggerText, { color: theme.textSecondary }]}>Write a reply...</Text>
              <Image source={require('../../assets/icons/ad_reply_grey.png')} style={[ss.replyTriggerIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── PostImage ─────────────────────────────────────────────────────────────────
function PostImage({ uri, postId }: { uri: string; postId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const [fullVisible, setFullVisible] = useState(false);
  if (err) return null;
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setFullVisible(true)}
        style={ss.postImageBox}
        testID={`button-img-post-${postId}`}
      >
        {!loaded && <ActivityIndicator color={C.green} style={StyleSheet.absoluteFill} />}
        <Image
          source={{ uri }}
          style={[ss.postImage, !loaded && { opacity: 0 }]}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          testID={`img-post-${postId}`}
        />
      </TouchableOpacity>
      <FullPhotoViewer uri={uri} visible={fullVisible} onClose={() => setFullVisible(false)} />
    </>
  );
}

// ─── PostVideo ─────────────────────────────────────────────────────────────────
function PostVideo({ uri, postId, onPress }: { uri: string; postId: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={ss.postVideoBox}
      activeOpacity={0.9}
      testID={`button-video-${postId}`}
    >
      {/* Dark background — VideoView paused tidak reliable render first frame */}
      <View style={[ss.postVideo, { backgroundColor: '#111' }]} />
      <View style={ss.videoPlayBadge}>
        <Ionicons name="play-circle" size={54} color="rgba(255,255,255,0.92)" />
      </View>
      <View style={ss.videoTagBadge}>
        <Ionicons name="videocam" size={11} color="#fff" style={{ marginRight: 3 }} />
        <Text style={ss.videoTagText}>VIDEO</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── VideoCommentSheet — comment overlay di atas video (tidak menutup video) ──
function VideoCommentSheet({
  visible, post, onClose, onCommented,
}: {
  visible: boolean;
  post: FeedPost | null;
  onClose: () => void;
  onCommented: (postId: string) => void;
}) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const kbHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEv, e => {
      if (kbHideTimer.current) clearTimeout(kbHideTimer.current);
      setKbHeight(e.endCoordinates.height);
    });
    const s2 = Keyboard.addListener(hideEv, () => {
      kbHideTimer.current = setTimeout(() => setKbHeight(0), 80);
    });
    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    getMe().then(me => { if (me) setCurrentUser(me.username); }).catch(() => {});
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : SCREEN_H,
      duration: 280,
      useNativeDriver: true,
    }).start();
    if (visible && post) {
      loadComments(post.id);
      setText('');
    } else {
      setComments([]);
    }
  }, [visible, post?.id]);

  const loadComments = async (postId: string) => {
    setLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post/${postId}/comments`, { headers, credentials: 'include' });
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch { setComments([]); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!text.trim() || sending || !post) return;
    setSending(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post/${post.id}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { ...headers as any, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.comment) {
        setComments(prev => [...prev, data.comment]);
        setText('');
        onCommented(post.id);
        Keyboard.dismiss();
      } else {
        Alert.alert('Gagal', data.message || 'Komentar tidak terkirim.');
      }
    } catch {
      Alert.alert('Error', 'Tidak dapat terhubung ke server.');
    } finally { setSending(false); }
  };

  if (!post) return null;

  return (
    <>
      {/* Backdrop semi-transparan — tap untuk tutup sheet */}
      {visible && (
        <Pressable
          style={vss.commentBackdrop}
          onPress={() => { Keyboard.dismiss(); onClose(); }}
        />
      )}

      <Animated.View
        style={[
          vss.commentSheet,
          { transform: [{ translateY: slideAnim }], paddingBottom: kbHeight || 16 },
        ]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        {/* Handle bar */}
        <View style={vss.commentHandle} />

        {/* Header */}
        <View style={vss.commentHeader}>
          <Text style={vss.commentHeaderTitle}>
            {comments.length} Komentar
          </Text>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); onClose(); }} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Caption post */}
        {post.comment ? (
          <View style={vss.commentCaption}>
            <Text style={vss.commentCaptionUser}>@{post.authorUsername}</Text>
            <Text style={vss.commentCaptionText} numberOfLines={2}>{post.comment}</Text>
          </View>
        ) : null}

        {/* Comments list */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : comments.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Belum ada komentar. Jadilah yang pertama!</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={c => c.id}
            style={{ flex: 1, paddingHorizontal: 14 }}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => (
              <View style={vss.commentItem}>
                <View style={vss.commentAvatar}>
                  <Text style={vss.commentAvatarText}>{item.authorUsername.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={vss.commentItemUser}>{item.authorUsername}</Text>
                  <Text style={vss.commentItemText}>{item.text}</Text>
                  <Text style={vss.commentItemTs}>{timeAgo(item.createdAt)}</Text>
                </View>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        )}

        {/* Input bar — dengan safe area bottom supaya tidak ditimpa nav bar Android */}
        <View style={[vss.commentInputBar, { paddingBottom: kbHeight > 0 ? 10 : Math.max(insets.bottom, 10) }]}>
          <View style={vss.commentAvatar}>
            <Text style={vss.commentAvatarText}>{currentUser.slice(0, 2).toUpperCase()}</Text>
          </View>
          <TextInput
            ref={inputRef}
            style={vss.commentInput}
            placeholder="Tambahkan komentar..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_CHARS}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={[vss.commentSendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="send" size={20} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

// ─── AnimRailBtn — tombol side rail dengan animasi spring ────────────────────
function AnimRailBtn({
  onPress, testID, children, count,
}: {
  onPress: () => void;
  testID?: string;
  children: React.ReactNode;
  count?: string | number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    scale.value = withSequence(withSpring(0.78, { damping: 6 }), withSpring(1, { damping: 5 }));
    onPress();
  };
  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity style={vss.railBtn} onPress={handlePress} testID={testID} activeOpacity={0.85}>
        {children}
        {count !== undefined && <Text style={vss.railCount}>{count}</Text>}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ─── VideoFeedItem — satu item dalam TikTok-style vertical scroll ──────────────
function VideoFeedItem({
  post, isActive, onLike, onCommentInline, onShare, canInteract, likesMap, setLikesMap,
}: {
  post: FeedPost;
  isActive: boolean;
  onLike: (post: FeedPost) => void;
  onCommentInline: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  canInteract: boolean;
  likesMap: Record<string, { count: number; liked: boolean }>;
  setLikesMap: React.Dispatch<React.SetStateAction<Record<string, { count: number; liked: boolean }>>>;
}) {
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const SCREEN_W = Dimensions.get('window').width;
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animasi heart saat like
  const heartScale = useSharedValue(1);
  const heartAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const player = useVideoPlayer(post.videoUrl ?? '', p => {
    p.loop = true;
    p.muted = false;
  });

  // Pantau status player — reset ready saat video baru
  useEffect(() => {
    setReady(false);
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        setReady(true);
        if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      } else if (status === 'error') {
        // Tetap tampilkan video, sembunyikan spinner
        setReady(true);
      }
    });

    // Fallback: jika setelah 5 detik masih loading, sembunyikan spinner
    readyTimerRef.current = setTimeout(() => setReady(true), 5000);

    return () => {
      sub.remove();
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [player, post.videoUrl]);

  // Auto-play saat item menjadi aktif, pause saat tidak aktif
  useEffect(() => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    if (isActive && post.videoUrl) {
      playTimerRef.current = setTimeout(() => {
        try { player.play(); } catch {}
        setPaused(false);
      }, 250);
    } else {
      try { player.pause(); } catch {}
    }
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isActive, post.videoUrl]);

  // Tap tengah layar = toggle pause/play
  const handleTapCenter = () => {
    if (paused) {
      try { player.play(); } catch {}
      setPaused(false);
    } else {
      try { player.pause(); } catch {}
      setPaused(true);
    }
  };

  const entry = likesMap[post.id] ?? { count: post.numLikes, liked: false };

  const handleLike = () => {
    if (!canInteract || entry.liked) return;
    // Animasi heart bounce besar
    heartScale.value = withSequence(
      withSpring(1.5, { damping: 4, stiffness: 200 }),
      withSpring(0.9, { damping: 6 }),
      withSpring(1, { damping: 5 }),
    );
    setLikesMap(prev => ({
      ...prev,
      [post.id]: { count: (prev[post.id]?.count ?? post.numLikes) + 1, liked: true },
    }));
    onLike(post);
  };

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_HEIGHT, backgroundColor: '#000' }}>
      {/* VideoView langsung di dalam container — key memaksa surface fresh saat URL berubah */}
      {post.videoUrl ? (
        <VideoView
          key={post.videoUrl}
          player={player}
          style={StyleSheet.absoluteFill}
          allowsFullscreen={false}
          nativeControls={false}
          contentFit="contain"
        />
      ) : null}

      {/* Overlay loading/pause — pointerEvents box-none agar sentuhan tembus ke VideoView */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Loading spinner — absoluteFill + center agar selalu tepat di tengah layar */}
        {!ready && isActive && !paused && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}

        {/* Area tengah — tap untuk play/pause */}
        <Pressable
          style={vss.tapZone}
          onPress={handleTapCenter}
          testID={`button-vf-tap-${post.id}`}
        >
          {paused && (
            <View style={vss.pauseOverlay}>
              <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.85)" />
            </View>
          )}
        </Pressable>

        {/* Author + caption — bottom-left, tidak menangkap sentuhan */}
        <View style={vss.bottomInfo} pointerEvents="none">
          <Text style={vss.authorName}>@{post.authorUsername}</Text>
          {post.comment ? (
            <Text style={vss.caption} numberOfLines={3}>{post.comment}</Text>
          ) : null}
        </View>

        {/* TikTok side rail — right */}
        <View style={vss.sideRail} pointerEvents="box-none">
          {/* Like */}
          <Reanimated.View style={heartAnimStyle}>
            <TouchableOpacity style={vss.railBtn} onPress={handleLike} testID={`button-vf-like-${post.id}`} activeOpacity={0.85}>
              <View style={[vss.railIconBg, entry.liked && vss.railIconBgLiked]}>
                <Ionicons
                  name={entry.liked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={entry.liked ? '#EF4444' : '#fff'}
                />
              </View>
              <Text style={vss.railCount}>{entry.count}</Text>
            </TouchableOpacity>
          </Reanimated.View>

          {/* Comment */}
          <AnimRailBtn
            onPress={() => onCommentInline(post)}
            testID={`button-vf-comment-${post.id}`}
            count={post.numComments}
          >
            <View style={vss.railIconBg}>
              <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
            </View>
          </AnimRailBtn>

          {/* Share */}
          <AnimRailBtn
            onPress={() => onShare(post)}
            testID={`button-vf-share-${post.id}`}
            count="Bagikan"
          >
            <View style={vss.railIconBg}>
              <Ionicons name="share-social" size={26} color="#fff" />
            </View>
          </AnimRailBtn>
        </View>
      </View>
    </View>
  );
}

// ─── VideoFeedModal (TikTok-style — scroll vertikal antar video) ───────────────
function VideoFeedModal({
  visible, posts, startIndex, onClose, onLike, onShare, canInteract,
}: {
  visible: boolean;
  posts: FeedPost[];
  startIndex: number;
  onClose: () => void;
  onLike: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  canInteract: boolean;
}) {
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [likesMap, setLikesMap] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [commentingPost, setCommentingPost] = useState<FeedPost | null>(null);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible) {
      setActiveIndex(startIndex);
      setCommentingPost(null);
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: startIndex, animated: false });
      }, 100);
    }
  }, [visible, startIndex]);

  // Tutup comment sheet saat scroll ke video lain
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
      setCommentingPost(null);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={() => {
        if (commentingPost) { setCommentingPost(null); }
        else { onClose(); }
      }}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Video scroll list */}
        <FlatList
          ref={flatRef}
          data={posts}
          keyExtractor={p => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={SCREEN_HEIGHT}
          decelerationRate="fast"
          scrollEnabled={!commentingPost}
          getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item, index }) => (
            <VideoFeedItem
              post={item}
              isActive={index === activeIndex && visible}
              onLike={onLike}
              onCommentInline={p => setCommentingPost(p)}
              onShare={p => { onClose(); setTimeout(() => onShare(p), 350); }}
              canInteract={canInteract}
              likesMap={likesMap}
              setLikesMap={setLikesMap}
            />
          )}
        />

        {/* Close button — di atas FlatList */}
        <TouchableOpacity
          style={vss.closeBtn}
          onPress={onClose}
          testID="button-close-video-feed"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Inline comment sheet — slide up di atas video */}
        <VideoCommentSheet
          visible={commentingPost !== null}
          post={commentingPost}
          onClose={() => setCommentingPost(null)}
          onCommented={_postId => {}}
        />
      </View>
    </Modal>
  );
}

const vss = StyleSheet.create({
  closeBtn:     { position: 'absolute', top: 48, left: 16, padding: 8, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20 },
  pauseOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tapZone:      { position: 'absolute', top: 0, left: 0, right: 110, bottom: 100 },
  bottomInfo:   { position: 'absolute', bottom: 90, left: 16, right: 110, zIndex: 10 },
  authorName:   { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  caption:      { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  sideRail:     { position: 'absolute', right: 12, bottom: 100, alignItems: 'center', gap: 20, zIndex: 10 },
  railBtn:      { alignItems: 'center', gap: 5 },
  railCount:    { color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  railIconBg:   { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  railIconBgLiked: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)' },

  // ── VideoCommentSheet styles ──
  commentBackdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 30 },
  commentSheet:        {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.62,
    backgroundColor: 'rgba(18,18,18,0.97)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 40,
    overflow: 'hidden',
  },
  commentHandle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginTop: 10 },
  commentHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  commentHeaderTitle:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  commentCaption:      { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  commentCaptionUser:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  commentCaptionText:  { color: 'rgba(255,255,255,0.8)', fontSize: 13, flex: 1 },
  commentItem:         { flexDirection: 'row', alignItems: 'flex-start' },
  commentAvatar:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#444', alignItems: 'center', justifyContent: 'center' },
  commentAvatarText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  commentItemUser:     { color: '#fff', fontWeight: '600', fontSize: 13, marginBottom: 2 },
  commentItemText:     { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  commentItemTs:       { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  commentInputBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', gap: 10 },
  commentInput:        { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 80 },
  commentSendBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
});

// ─── FullPhotoViewer ──────────────────────────────────────────────────────────
function FullPhotoViewer({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ss.photoViewerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="button-close-photo-backdrop" />
        <Image source={{ uri }} style={ss.photoViewerImage} resizeMode="contain" testID="img-photo-full" />
        <TouchableOpacity
          style={ss.photoViewerCloseBtn}
          onPress={onClose}
          testID="button-close-photo"
          activeOpacity={0.8}
        >
          <Image
            source={require('../../assets/icons/ic_cancel.png')}
            style={ss.photoViewerCloseIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({
  item, onReply, onRepost, onShare, onAuthorPress, canInteract, currentUserIsAdmin, onDelete, onVideoOpen,
}: {
  item: FeedPost;
  onReply: (post: FeedPost) => void;
  onRepost: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onAuthorPress: (username: string) => void;
  canInteract: boolean;
  currentUserIsAdmin: boolean;
  onDelete: (post: FeedPost) => void;
  onVideoOpen: (post: FeedPost) => void;
}) {
  const theme = useAppTheme();
  const [reposted, setReposted] = useState(false);
  const [liked, setLiked]       = useState(false);
  const [localLikes, setLocalLikes] = useState(item.numLikes);

  useEffect(() => { setLocalLikes(item.numLikes); }, [item.numLikes]);

  const likeScale = useSharedValue(1);
  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  // Like = primary heart action. Server endpoint /api/feed/post/:id/like is
  // idempotent-ish (no unlike on backend yet) so we keep liked locked once
  // toggled and just bump the count locally for instant feedback.
  const handleLike = async () => {
    if (!canInteract) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa berinteraksi dengan postingan.');
      return;
    }
    if (liked) return;
    likeScale.value = withSequence(
      withTiming(1.3, { duration: 100 }),
      withSpring(1, { damping: 5, stiffness: 220 })
    );
    setLiked(true);
    setLocalLikes(n => n + 1);
    try {
      await fetch(`${API_BASE}/api/feed/post/${item.id}/like`, { method: 'POST', credentials: 'include' });
    } catch {}
  };

  const handleRepost = () => {
    if (!canInteract) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa berinteraksi dengan postingan.');
      return;
    }
    if (reposted) return;
    setReposted(true);
    onRepost(item);
  };

  const handleReply = () => {
    if (!canInteract) {
      Alert.alert('Level terlalu rendah', 'Kamu perlu mencapai Level 2 (Newcomer) untuk bisa berkomentar.');
      return;
    }
    onReply(item);
  };

  // Themed shadow + border so cards feel like floating "premium" tiles in
  // both light and dark themes (matches the Home contact list treatment).
  const cardShadow = theme.isDark
    ? { shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }
    : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 };

  // Pre-compute level + flag once so render JSX stays simple.
  const flag = countryToFlag(item.authorCountry);
  const showLevel = typeof item.authorMigLevel === 'number' && item.authorMigLevel > 0;

  return (
    <View
      style={[
        ss.card,
        cardShadow,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
        },
      ]}
      testID={`card-post-${item.id}`}
    >
      <View style={ss.cardHeaderRow}>
      <TouchableOpacity
        style={[ss.cardHeader, { flex: 1 }]}
        activeOpacity={0.7}
        onPress={() => onAuthorPress(item.authorUsername)}
        testID={`button-author-${item.id}`}
      >
        <Avatar username={item.authorUsername} displayPicture={item.authorDisplayPicture} avatarFrameUrl={(item as any).authorAvatarFrameUrl} size={44} />
        <View style={ss.cardMeta}>
          {(() => {
            const role = getRoleStyle(item);
            return (
              <View style={ss.identityRow}>
                <Text
                  style={[ss.username, { color: role ? role.color : theme.textPrimary }]}
                  testID={`text-username-${item.id}`}
                  numberOfLines={1}
                >
                  {item.authorUsername}
                </Text>
                {role && <RoleBadge color={role.color} label={role.badgeLabel} />}
                {showLevel && (() => {
                  const tier = levelTier(item.authorMigLevel as number);
                  return (
                    <View style={[ss.levelPill, { backgroundColor: tier.bg }]}>
                      <Text style={[ss.levelPillText, { color: tier.fg }]}>Lv {item.authorMigLevel}</Text>
                    </View>
                  );
                })()}
                {flag ? <Text style={ss.flagBadge}>{flag}</Text> : null}
              </View>
            );
          })()}
          <View style={ss.timestampRow}>
            <Ionicons name="time-outline" size={11} color="#666" style={{ marginRight: 3 }} />
            <Text style={[ss.timestamp, { color: '#666' }]} testID={`text-timestamp-${item.id}`}>
              {timeAgo(item.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Admin global delete — trash icon, only visible to admin */}
      {currentUserIsAdmin && (
        <TouchableOpacity
          style={ss.adminDeleteBtn}
          onPress={() => {
            Alert.alert(
              'Hapus Post',
              `Hapus postingan dari @${item.authorUsername}?`,
              [
                { text: 'Batal', style: 'cancel' },
                { text: 'Hapus', style: 'destructive', onPress: () => onDelete(item) },
              ],
            );
          }}
          testID={`button-admin-delete-${item.id}`}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      )}
      </View>{/* end cardHeaderRow */}

      {item.comment.trim().length > 0 && (
        <RichText text={item.comment} style={[ss.postBody, { color: theme.textPrimary }]} testID={`text-body-${item.id}`} />
      )}

      {item.repostId && item.repostAuthorUsername ? (
        <View style={[ss.repostPreviewBox, { backgroundColor: theme.screenBg, borderColor: theme.divider, borderLeftColor: theme.accent }]}>
          <View style={ss.repostPreviewHeader}>
            <Avatar username={item.repostAuthorUsername} size={22} />
            <Text style={[ss.repostPreviewAuthor, { color: theme.textSecondary }]} numberOfLines={1}>{item.repostAuthorUsername}</Text>
          </View>
          {item.repostComment ? (
            <RichText text={item.repostComment} style={[ss.repostPreviewContent, { color: theme.textPrimary }]} />
          ) : null}
        </View>
      ) : null}

      {/* Video feed hidden — akan diaktifkan kembali nanti */}
      {item.imageUrl ? (
        <PostImage uri={item.imageUrl} postId={item.id} />
      ) : null}

      {/* Action row: Like | Reply | Repost | Share */}
      <View style={ss.cardActions}>
        <TouchableOpacity
          style={[
            ss.actionChip,
            liked && { backgroundColor: theme.isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.10)' },
            !canInteract && ss.actionBtnLocked,
          ]}
          onPress={handleLike}
          testID={`button-like-${item.id}`}
          activeOpacity={0.7}
        >
          <Reanimated.View style={likeAnimStyle}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? '#EF4444' : theme.textSecondary}
            />
          </Reanimated.View>
          <Text
            style={[
              ss.actionCount,
              { color: liked ? '#EF4444' : theme.textSecondary, fontWeight: liked ? '700' : '500' },
              !canInteract && ss.actionCountLocked,
            ]}
          >
            {localLikes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[ss.actionChip, !canInteract && ss.actionBtnLocked]}
          onPress={handleReply}
          testID={`button-reply-${item.id}`}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={17} color={theme.textSecondary} />
          <Text style={[ss.actionCount, { color: theme.textSecondary }, !canInteract && ss.actionCountLocked]}>
            {item.numComments}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            ss.actionChip,
            reposted && { backgroundColor: theme.isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.10)' },
            !canInteract && ss.actionBtnLocked,
          ]}
          onPress={handleRepost}
          testID={`button-repost-${item.id}`}
          activeOpacity={0.7}
        >
          <Ionicons
            name={reposted ? 'repeat' : 'repeat-outline'}
            size={18}
            color={reposted ? '#22C55E' : theme.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={ss.actionChip}
          onPress={() => onShare(item)}
          testID={`button-share-${item.id}`}
          activeOpacity={0.7}
        >
          <Ionicons name="share-social-outline" size={17} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const PAGE_SIZE = 15;

// ─── Feed Screen ──────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const theme = useAppTheme();
  const { openPostId } = useLocalSearchParams<{ openPostId?: string }>();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [createVisible, setCreateVisible] = useState(false);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [repostTarget, setRepostTarget] = useState<FeedPost | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [videoFeedVisible, setVideoFeedVisible] = useState(false);
  const [videoFeedStartIndex, setVideoFeedStartIndex] = useState(0);

  // ── Reputation privileges (mirrors ReputationLevelData.java) ───────────────
  const [privileges, setPrivileges] = useState<ReputationPrivileges>(DEFAULT_PRIVILEGES);

  const allUsernames = [...new Set(posts.map(p => p.authorUsername))];

  const normalizePosts = (rawPosts: FeedPost[]) =>
    rawPosts.map(p => ({
      ...p,
      imageUrl: p.imageUrl
        ? (p.imageUrl.startsWith('http') ? p.imageUrl : `${API_BASE}${p.imageUrl}`)
        : null,
      videoUrl: p.videoUrl
        ? (p.videoUrl.startsWith('http') ? p.videoUrl : `${API_BASE}${p.videoUrl}`)
        : null,
    }));

  const loadFeed = useCallback(async () => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed?limit=${PAGE_SIZE}&offset=0`, { headers, credentials: 'include' });
      const data = await res.json();
      const rawPosts: FeedPost[] = Array.isArray(data) ? data : (data.posts ?? []);
      setPosts(normalizePosts(rawPosts));
      setHasMore(data.hasMore ?? false);
      setOffset(PAGE_SIZE);
    } catch { setPosts([]); setHasMore(false); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed?limit=${PAGE_SIZE}&offset=${offset}`, { headers, credentials: 'include' });
      const data = await res.json();
      const rawPosts: FeedPost[] = Array.isArray(data) ? data : (data.posts ?? []);
      setPosts(prev => [...prev, ...normalizePosts(rawPosts)]);
      setHasMore(data.hasMore ?? false);
      setOffset(prev => prev + PAGE_SIZE);
    } catch {}
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, offset]);

  // Fetch the current user's level privileges from the reputation system.
  // Mirrors Java's ReputationServiceI.getUserLevel() / getLevelDataForScore().
  const loadPrivileges = useCallback(async () => {
    try {
      const me = await getMe();
      if (!me?.username) return;
      const res = await fetch(`${API_BASE}/api/reputation/${me.username}/level`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.privileges) {
          setPrivileges({
            level:                    data.level,
            levelName:                data.levelName,
            publishPhoto:             data.privileges.publishPhoto        ?? false,
            postCommentLikeUserWall:  data.privileges.postCommentLikeUserWall ?? false,
            addToPhotoWall:           data.privileges.addToPhotoWall      ?? false,
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => { loadFeed(); loadPrivileges(); }, [loadFeed, loadPrivileges]);

  // Refresh feed whenever this tab comes into focus so avatar frames
  // (and other profile changes) are always up-to-date
  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  useEffect(() => {
    getMe().then(me => {
      if (me?.username) setMyUsername(me.username);
      if ((me as any)?.isAdmin) setIsAdmin(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!openPostId) return;
    const fetchAndOpenPost = async () => {
      try {
        const headers = await buildHeaders();
        const existing = posts.find(p => p.id === openPostId);
        if (existing) {
          setCommentPost(existing);
          return;
        }
        const res = await fetch(`${API_BASE}/api/feed/post/${openPostId}`, { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const post: FeedPost = data.post ?? data;
          if (post?.id) {
            if (post.imageUrl && !post.imageUrl.startsWith('http')) {
              post.imageUrl = `${API_BASE}${post.imageUrl}`;
            }
            setCommentPost(post);
          }
        }
      } catch {}
      router.setParams({ openPostId: undefined } as any);
    };
    fetchAndOpenPost();
  }, [openPostId]);

  const handleCommented = (postId: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, numComments: p.numComments + 1 } : p));
  };

  const handleRepostLike = async (postId: string) => {
    try {
      await fetch(`${API_BASE}/api/feed/post/${postId}/like`, { method: 'POST', credentials: 'include' });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, numLikes: p.numLikes + 1 } : p));
    } catch {}
  };

  const handleDeletePost = async (post: FeedPost) => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/feed/post/${post.id}`, {
        method: 'DELETE',
        headers: headers as any,
        credentials: 'include',
      });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== post.id));
      } else {
        const d = await res.json().catch(() => ({}));
        Alert.alert('Gagal', d.message || 'Tidak dapat menghapus post.');
      }
    } catch {
      Alert.alert('Error', 'Tidak dapat terhubung ke server.');
    }
  };

  const videoPosts = posts.filter(p => p.videoUrl);

  const handleVideoOpen = (post: FeedPost) => {
    const idx = videoPosts.findIndex(p => p.id === post.id);
    setVideoFeedStartIndex(idx >= 0 ? idx : 0);
    setVideoFeedVisible(true);
  };

  const handleVideoLike = async (post: FeedPost) => {
    try {
      await fetch(`${API_BASE}/api/feed/post/${post.id}/like`, { method: 'POST', credentials: 'include' });
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, numLikes: p.numLikes + 1 } : p));
    } catch {}
  };

  // ── FAB tap handler — gate by postCommentLikeUserWall privilege ───────────
  const handleFabPress = () => {
    if (!privileges.postCommentLikeUserWall) {
      Alert.alert(
        'Level terlalu rendah',
        `Kamu saat ini Level ${privileges.level} (${privileges.levelName}). Capai Level 2 (Newcomer) untuk bisa membuat postingan.`,
      );
      return;
    }
    setCreateVisible(true);
  };

  return (
    <View style={[ss.container, { backgroundColor: theme.screenBg }]}>
      {loading ? (
        <View style={ss.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : posts.length === 0 ? (
        <View style={ss.emptyState}>
          <Image source={require('../../assets/icons/ad_feed_grey.png')} style={[ss.emptyIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
          <Text style={[ss.emptyTitle, { color: theme.textPrimary }]}>No posts yet</Text>
          <Text style={[ss.emptySubtitle, { color: theme.textSecondary }]}>Be the first to share something!</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PostCard
              item={item}
              onReply={p => setCommentPost(p)}
              onRepost={p => { handleRepostLike(p.id); setRepostTarget(p); }}
              onShare={p => setSharePost(p)}
              onAuthorPress={username => setProfileUsername(username)}
              canInteract={privileges.postCommentLikeUserWall}
              currentUserIsAdmin={isAdmin}
              onDelete={handleDeletePost}
              onVideoOpen={handleVideoOpen}
            />
          )}
          contentContainerStyle={ss.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFeed(); }} tintColor={theme.accent} />
          }
          ItemSeparatorComponent={() => <View style={ss.sep} />}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={[ss.loadMoreBtn, { backgroundColor: theme.cardBg, borderColor: theme.divider }]}
                onPress={loadMore}
                disabled={loadingMore}
                testID="button-load-more"
              >
                {loadingMore
                  ? <ActivityIndicator color={theme.accent} size="small" />
                  : <Text style={[ss.loadMoreText, { color: theme.accent }]}>Muat lebih banyak</Text>
                }
              </TouchableOpacity>
            ) : posts.length > 0 ? (
              <Text style={[ss.noMoreText, { color: theme.textSecondary }]}>Semua post sudah ditampilkan</Text>
            ) : null
          }
        />
      )}

      {/* FAB create post button — locked when postCommentLikeUserWall = false */}
      <TouchableOpacity
        style={[ss.fab, { backgroundColor: theme.accent }, !privileges.postCommentLikeUserWall && ss.fabLocked]}
        onPress={handleFabPress}
        activeOpacity={0.85}
        testID="button-create-post"
      >
        <Image source={require('../../assets/icons/ad_plus_white.png')} style={ss.fabIcon} resizeMode="contain" />
      </TouchableOpacity>

      {/* Create new post (action = new_post) */}
      <CreatePostModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onPosted={loadFeed}
        action="new_post"
        allUsernames={allUsernames}
        canPhoto={privileges.publishPhoto}
      />

      {/* Repost modal (action = repost) */}
      <CreatePostModal
        visible={repostTarget !== null}
        onClose={() => setRepostTarget(null)}
        onPosted={() => { setRepostTarget(null); loadFeed(); }}
        action="repost"
        originalPost={repostTarget}
        allUsernames={allUsernames}
        canPhoto={privileges.publishPhoto}
      />

      {/* Share popup (ShareToFragment) */}
      <SharePopup visible={sharePost !== null} post={sharePost} onClose={() => setSharePost(null)} />

      {/* Comment/Reply modal (SinglePostFragment REPLY_TAB) */}
      <CommentModal
        visible={commentPost !== null}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommented={handleCommented}
        allUsernames={allUsernames}
      />

      {/* Mini profile / View Profile when tapping author avatar or username */}
      <ViewProfileModal
        visible={profileUsername !== null}
        username={profileUsername ?? ''}
        currentUserId={myUsername || null}
        onClose={() => setProfileUsername(null)}
      />

      {/* TikTok-style scrollable video feed — hidden, akan diaktifkan kembali nanti */}
      {/* <VideoFeedModal
        visible={videoFeedVisible && videoPosts.length > 0}
        posts={videoPosts}
        startIndex={videoFeedStartIndex}
        onClose={() => setVideoFeedVisible(false)}
        onLike={handleVideoLike}
        onShare={p => { setVideoFeedVisible(false); setTimeout(() => setSharePost(p), 350); }}
        canInteract={privileges.postCommentLikeUserWall}
      /> */}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:      { padding: 10, paddingBottom: 90 },
  sep:       { height: 6 },

  // ── PostCard ────────────────────────────────────────────────────────────────
  // Card now has a softer rounded silhouette + themed hairline border. The
  // shadow is applied dynamically per theme in the component itself.
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardMeta:         { flex: 1, marginLeft: 10, justifyContent: 'center' },
  avatarCircle:     { backgroundColor: C.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText:       { color: C.white, fontWeight: 'bold' },
  // Identity row: username + role badge + level pill + flag, all on one line.
  // Uses flexShrink on the username so long names truncate first instead of
  // pushing the pill/flag off-screen.
  identityRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  username:         { color: C.green, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  // Compact tier-colored pill (background set inline). Same proportions as
  // the Home contact list pill for visual consistency across screens.
  levelPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minHeight: 16,
    justifyContent: 'center',
  },
  levelPillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  flagBadge:        { marginLeft: 6, fontSize: 14 },
  // Timestamp now lives in its own row with a small clock icon prefix to
  // distinguish it visually from the identity line.
  timestampRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  timestamp:        { color: C.ts, fontSize: 11 },
  postBody:         { color: C.text, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  shareCornerBtn:   { padding: 6 },
  shareCornerIcon:  { width: 16, height: 16, tintColor: C.ts },
  // Action bar: no top border, no vertical dividers — chips spaced evenly
  // with their own subtle hover/active background. Cleaner, more modern.
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
    marginTop: 4,
    gap: 6,
  },
  // Each action is a rounded chip; tap-state gets a tinted background. The
  // first three chips flex equally; share doesn't need to (it has no count).
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
    flex: 1,
    minHeight: 36,
  },
  actionIcon:       { width: 18, height: 18 },
  actionCount:      { color: C.grey, fontSize: 13, fontWeight: '500' },
  actionCountActive:{ color: C.green },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:     { width: 64, height: 64, tintColor: C.ts, marginBottom: 16 },
  emptyTitle:    { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  emptySubtitle: { color: C.ts, fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // ── FAB ─────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', bottom: 80, right: 20, width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.fabBg, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  fabLocked:  { backgroundColor: '#BDBDBD' },
  fabIcon:    { width: 22, height: 22, tintColor: C.white },

  // ── Locked states (privilege gates — mirrors ReputationLevelData.java) ──────
  footerBtnLocked:    { opacity: 0.35 },
  footerIconLocked:   {},
  actionBtnLocked:    { opacity: 0.35 },
  actionIconLocked:   {},
  actionCountLocked:  {},

  // ── Shared modal ─────────────────────────────────────────────────────────────
  modalOuter: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlayBg },
  modalSheet: {
    backgroundColor: C.white, borderTopLeftRadius: 14, borderTopRightRadius: 14,
    minHeight: 220, paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.sep,
  },
  modalCloseBtn:  { padding: 4, marginRight: 8 },
  modalCloseIcon: { width: 20, height: 20, tintColor: C.grey },
  modalTitle:     { flex: 1, color: C.text, fontWeight: '700', fontSize: 16 },
  sendIcon:       { width: 24, height: 24 },

  // ── Create Post sheet ────────────────────────────────────────────────────────
  // Explicit height so flex:1 on ScrollView inside works correctly
  createSheet: {
    backgroundColor: C.white, borderTopLeftRadius: 14, borderTopRightRadius: 14,
    height: SCREEN_H * 0.60,
    flexDirection: 'column',
  },

  // ── Author row ───────────────────────────────────────────────────────────────
  authorRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  authorMeta: { flex: 1 },
  authorName: { color: C.text, fontWeight: '700', fontSize: 14 },
  privacyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
    backgroundColor: C.previewBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  privacyIcon: { width: 14, height: 14 },
  privacyText: { color: C.grey, fontSize: 11 },

  // ── Content area wrapper (flex:1 so it fills space between author row and footer)
  contentArea:       { flex: 1 },
  contentScroll:     { flex: 1 },
  contentScrollInner:{ paddingHorizontal: 14, paddingBottom: 8, flexGrow: 1 },

  // ── Autocomplete suggestions ─────────────────────────────────────────────────
  suggestBox: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.sep, borderRadius: 6,
    marginBottom: 6, maxHeight: 130,
  },
  suggestRow:       { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 },
  suggestRowBorder: { borderBottomWidth: 1, borderBottomColor: C.sep },
  suggestIcon:      { width: 16, height: 16, tintColor: C.grey },
  suggestText:      { color: C.text, fontSize: 13 },

  // ── Text field (share_field) ─────────────────────────────────────────────────
  shareField: {
    minHeight: 120, color: C.text, fontSize: 15, lineHeight: 22,
    paddingTop: 8, paddingBottom: 8,
    textAlignVertical: 'top',
  },

  // ── Photo thumbnail (thumbnail_box) ──────────────────────────────────────────
  thumbBox:       { width: 100, height: 100, marginBottom: 10, borderRadius: 6, overflow: 'hidden' },
  thumbImage:     { width: 100, height: 100 },
  thumbRemove:    { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 },
  thumbRemoveIcon:{ width: 12, height: 12, tintColor: C.white },

  // ── Repost preview (SimplePostPreviewHolder) ─────────────────────────────────
  postPreviewBox: {
    backgroundColor: C.previewBg, borderRadius: 6, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: C.green,
  },
  postPreviewAuthor:  { color: C.green, fontWeight: '700', fontSize: 13, marginBottom: 2 },
  postPreviewContent: { color: C.grey, fontSize: 12, lineHeight: 17 },

  // ── Repost preview inside PostCard ────────────────────────────────────────────
  // Subtle "quote" treatment — accent-colored left border, hairline frame.
  repostPreviewBox: {
    backgroundColor: C.previewBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    borderLeftWidth: 3,
  },
  repostPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  repostPreviewAuthor: { color: C.green, fontWeight: '700', fontSize: 13, flex: 1 },
  repostPreviewContent:{ color: C.grey, fontSize: 13, lineHeight: 18 },

  // ── Location row (location_text) ─────────────────────────────────────────────
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.previewBg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8,
  },
  locationIcon:  { width: 16, height: 16, tintColor: C.grey },
  locationInput: { flex: 1, color: C.text, fontSize: 13 },

  // ── Char counter (char_count_container) ──────────────────────────────────────
  charCount: { textAlign: 'right', fontSize: 12, paddingHorizontal: 14, paddingBottom: 4 },

  // ── Footer separator (action_buttons_separator) ───────────────────────────────
  footerSep: { height: 1, backgroundColor: C.actionSep },

  // ── Footer bar (action_buttons_container) ────────────────────────────────────
  footerBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4, paddingBottom: Platform.OS === 'android' ? 20 : 8, minHeight: 44 },
  footerBtn:      { padding: 8 },
  footerIcon:     { width: 22, height: 22 },
  footerIconActive:{ tintColor: C.green },

  // ── Send button ──────────────────────────────────────────────────────────────
  postSendBtn:        { backgroundColor: C.green, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  postSendBtnDisabled:{ backgroundColor: '#BDBDBD' },

  // ── Emoji grid (emoticon_grid) ────────────────────────────────────────────────
  emojiGrid: { backgroundColor: C.previewBg, paddingVertical: 8, paddingHorizontal: 6, maxHeight: 180 },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  emojiCell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emojiChar: { fontSize: 24 },

  // ── Privacy popup ─────────────────────────────────────────────────────────────
  popupOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  popupBox:      { backgroundColor: C.white, borderRadius: 12, width: 260, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  popupTitle:    { color: C.ts, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', paddingHorizontal: 16, paddingVertical: 8 },
  popupRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  popupIcon:     { width: 20, height: 20 },
  popupLabel:    { flex: 1, color: C.text, fontSize: 15 },
  popupLabelActive:{ color: C.green, fontWeight: '700' },
  popupCheck:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  popupSep:      { height: 1, backgroundColor: C.privacySep, marginHorizontal: 16 },
  toggleDot:     { width: 32, height: 18, borderRadius: 9, backgroundColor: '#CCC', borderWidth: 2, borderColor: '#CCC' },
  toggleDotOn:   { backgroundColor: C.green, borderColor: C.green },

  // ── Share popup ───────────────────────────────────────────────────────────────
  shareHeader:     { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.sep },
  shareHeaderText: { color: C.text, fontWeight: '700', fontSize: 16 },
  shareRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  shareItemIcon:   { width: 28, height: 28 },
  shareItemLabel:  { color: C.text, fontSize: 15 },
  shareDivider:    { height: 1, backgroundColor: C.sep, marginHorizontal: 16 },

  // ── Post image ────────────────────────────────────────────────────────────────
  postImageBox: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 6, overflow: 'hidden',
    backgroundColor: C.previewBg, marginBottom: 12,
  },
  postImage: { width: '100%', height: '100%' },

  // ── Post video ────────────────────────────────────────────────────────────────
  postVideoBox: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#000', marginBottom: 12, position: 'relative',
  },
  postVideo: { width: '100%', height: '100%' },
  videoPlayBadge: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  videoTagBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3,
  },
  videoTagText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Video thumbnail in create post modal ───────────────────────────────────────
  videoThumbBox: {
    width: '100%', height: 80, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#1a1a2e', marginBottom: 10, position: 'relative',
    justifyContent: 'center',
  },
  videoThumbInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
  },
  videoThumbLabel: { color: '#fff', fontSize: 13, flex: 1, opacity: 0.85 },
  videoUploadOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
  },

  // ── Card header row (with admin delete button) ────────────────────────────────
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  adminDeleteBtn: {
    padding: 8, marginLeft: 4,
    backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 6,
  },

  // ── Full photo viewer ─────────────────────────────────────────────────────────
  photoViewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoViewerImage: { width: '100%', height: '100%' },
  photoViewerCloseBtn: {
    position: 'absolute', top: 40, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoViewerCloseIcon: { width: 18, height: 18, tintColor: C.white },

  commentSheet: {
    backgroundColor: C.white, borderTopLeftRadius: 14, borderTopRightRadius: 14,
    minHeight: SCREEN_H * 0.60,
    maxHeight: SCREEN_H * 0.88,
  },
  commentCount:    { color: C.ts, fontSize: 13 },
  originalPostBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, backgroundColor: C.previewBg },
  originalPostText:{ color: C.grey, fontSize: 13, marginTop: 2, lineHeight: 18 },
  commentListSep:  { height: 1, backgroundColor: C.sep },
  commentList:     { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  commentCenter:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  noCommentText:   { color: C.ts, fontSize: 14 },
  commentItem:     { flexDirection: 'row', alignItems: 'flex-start' },
  commentBubble:   { flex: 1, marginLeft: 10, backgroundColor: C.previewBg, borderRadius: 10, padding: 10 },
  commentAuthor:   { color: C.green, fontWeight: '700', fontSize: 13 },
  commentText:     { color: C.text, fontSize: 13, marginTop: 2, lineHeight: 18 },
  commentTs:       { color: C.ts, fontSize: 10, marginTop: 4 },

  // ── Load more footer ──────────────────────────────────────────────────────────
  loadMoreBtn: {
    marginTop: 8, marginHorizontal: 10, marginBottom: 4,
    borderRadius: 8, borderWidth: 1, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  loadMoreText: { fontSize: 14, fontWeight: '600' },
  noMoreText:   { textAlign: 'center', fontSize: 12, paddingVertical: 16, opacity: 0.6 },

  // ── Reply input bar ───────────────────────────────────────────────────────────
  replyInputBar:  { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: C.sep },
  replyInput:     { flex: 1, backgroundColor: C.previewBg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: C.text, maxHeight: 100 },
  replySendBtn:        { backgroundColor: C.green, borderRadius: 18, padding: 8, alignItems: 'center', justifyContent: 'center' },
  replySendBtnDisabled:{ backgroundColor: '#BDBDBD' },
  replyTrigger:     { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.sep, backgroundColor: C.previewBg },
  replyTriggerText: { flex: 1, color: '#BDBDBD', fontSize: 14 },
  replyTriggerIcon: { width: 18, height: 18, tintColor: C.grey },
});
