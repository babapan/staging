import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, getMe, buildHeaders } from '../../services/auth';
import MultiRoomChatModal, { type PrivateChat } from '../../components/MultiRoomChatModal';
import { useAppTheme } from '../../services/themeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const RECENT_ROOMS_KEY = 'recent_chatrooms_v1';
const KICKED_ROOMS_KEY = 'kicked_rooms_v1';
const KICK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RECENT = 20;

// ─── Constants — matched from Java CreateChatroomFragment ─────────────────────
const C = {
  green:   '#00A8CC',
  white:   '#FFFFFF',
  catBg:   '#F2F2F2',
  catText: '#424242',
  ts:      '#999999',
  sep:     '#E8E8E8',
  border:  '#DEDEDE',
  error:   '#E53935',
  inputBg: '#FAFAFA',
  sheet:   '#FFFFFF',
};

// Mirrors Java CreateChatroomFragment.DEFAULT_LANGUAGE = "English"
// + SystemController.requestGetSystemLanguageList common languages
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'tl', name: 'Filipino' },
];

// Avatar color options (CHATROOM_COLORS from schema)
const COLORS = ['#00A8CC', '#9C27B0', '#F44336', '#795548', '#FF9800', '#2196F3', '#E91E63', '#0096C7'];

const MAX_NAME_LEN = 15; // Java: "max. 15 characters"

// Categories that make sense for user creation (showInBrowser: true)
const CREATEABLE_CATEGORIES = [
  { id: 8, label: 'Recommended' },
  { id: 7, label: 'Games' },
  { id: 4, label: 'Find Friends' },
  { id: 5, label: 'Game Zone' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Chatroom {
  id: string;
  name: string;
  description: string | null;
  categoryId: number;
  currentParticipants: number;
  maxParticipants: number;
  color: string;
  creatorUsername?: string | null;
}

interface Category {
  id: number;
  label: string;
  key: string;
  icon: string;
  showInBrowser: boolean;
}

// ─── Create Room Modal ────────────────────────────────────────────────────────
// Mirrors CreateChatroomFragment: Name, Description, Language, Category, Color
function CreateRoomModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (room: Chatroom) => void;
}) {
  const theme = useAppTheme();
  const slideAnim = useRef(new Animated.Value(600)).current;

  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [lang, setLang]             = useState(LANGUAGES[0]);
  const [color, setColor]           = useState(COLORS[0]);
  const [categoryId, setCategoryId] = useState(CREATEABLE_CATEGORIES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCatPicker, setShowCatPicker]   = useState(false);
  const [nameError, setNameError]   = useState('');

  useEffect(() => {
    if (visible) {
      // reset form
      setName(''); setDesc(''); setLang(LANGUAGES[0]);
      setColor(COLORS[0]); setCategoryId(CREATEABLE_CATEGORIES[0].id);
      setNameError(''); setSubmitting(false);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Room name is required'); return; }
    if (trimmed.length > MAX_NAME_LEN) { setNameError(`Max ${MAX_NAME_LEN} characters`); return; }
    setNameError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/chatrooms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          categoryId,
          maxParticipants: 50,
          language: lang.code,
          color,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message ?? 'Could not create room');
      } else {
        onCreated(data.chatroom);
        onClose();
      }
    } catch {
      Alert.alert('Error', 'Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCatLabel = CREATEABLE_CATEGORIES.find(c => c.id === categoryId)?.label ?? '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={createStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[createStyles.sheet, { backgroundColor: theme.cardBg, transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={[createStyles.header, { borderBottomColor: theme.divider }]}>
            <Text style={[createStyles.headerTitle, { color: theme.textPrimary }]}>Create Chat Room</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="button-close-create-room">
              <Text style={[createStyles.headerClose, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Hint — matches Java: "Create a space to talk about what you love." */}
          <Text style={[createStyles.hint, { color: theme.textSecondary }]}>Create a space to talk about what you love.</Text>

          <ScrollView style={createStyles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Room Name — matches Java: editRoomName, max 15 chars */}
            <Text style={[createStyles.label, { color: theme.textPrimary }]}>Name <Text style={createStyles.required}>*</Text></Text>
            <View style={createStyles.inputRow}>
              <TextInput
                style={[createStyles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textPrimary }, nameError ? createStyles.inputError : null]}
                placeholder="Room name"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={t => { setName(t.slice(0, MAX_NAME_LEN)); setNameError(''); }}
                maxLength={MAX_NAME_LEN}
                testID="input-room-name"
              />
              <Text style={[createStyles.charCount, { color: theme.textSecondary }]}>{name.length}/{MAX_NAME_LEN}</Text>
            </View>
            {nameError ? <Text style={createStyles.errorText}>{nameError}</Text> : null}

            {/* Description — matches Java: editDescription, optional */}
            <Text style={[createStyles.label, { color: theme.textPrimary }]}>
              Description <Text style={[createStyles.optional, { color: theme.textSecondary }]}>(optional)</Text>
            </Text>
            <TextInput
              style={[createStyles.input, createStyles.inputMulti, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="Describe your room..."
              placeholderTextColor={theme.textSecondary}
              value={description}
              onChangeText={setDesc}
              multiline
              numberOfLines={3}
              testID="input-room-description"
            />

            {/* Category */}
            <Text style={[createStyles.label, { color: theme.textPrimary }]}>Category</Text>
            <TouchableOpacity
              style={[createStyles.picker, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => setShowCatPicker(true)}
              testID="button-pick-category"
            >
              <Text style={[createStyles.pickerText, { color: theme.textPrimary }]}>{selectedCatLabel}</Text>
              <Text style={[createStyles.pickerArrow, { color: theme.textSecondary }]}>›</Text>
            </TouchableOpacity>

            {/* Language — matches Java: selectedLang, DEFAULT_LANGUAGE = "English" */}
            <Text style={[createStyles.label, { color: theme.textPrimary }]}>Language</Text>
            <TouchableOpacity
              style={[createStyles.picker, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
              onPress={() => setShowLangPicker(true)}
              testID="button-pick-language"
            >
              <Text style={[createStyles.pickerText, { color: theme.textPrimary }]}>{lang.name}</Text>
              <Text style={[createStyles.pickerArrow, { color: theme.textSecondary }]}>›</Text>
            </TouchableOpacity>


            {/* Preview */}
            <View style={[createStyles.previewRow, { backgroundColor: theme.screenBg }]}>
              <View style={[createStyles.previewAvatar, { backgroundColor: color }]}>
                <Text style={createStyles.previewInitial}>
                  {name.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View>
                <Text style={[createStyles.previewName, { color }]} numberOfLines={1}>
                  {name.trim() || 'Room Name'}
                </Text>
                <Text style={[createStyles.previewSub, { color: theme.textSecondary }]}>{lang.name} · {selectedCatLabel}</Text>
              </View>
            </View>

            {/* Create Button — matches Java: "CREATE CHAT ROOM" */}
            <TouchableOpacity
              style={[createStyles.createBtn, { backgroundColor: theme.accent }, submitting && createStyles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={submitting}
              testID="button-create-room"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={createStyles.createBtnText}>CREATE CHAT ROOM</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>

      {/* Language picker sheet */}
      <Modal visible={showLangPicker} transparent animationType="slide" onRequestClose={() => setShowLangPicker(false)}>
        <View style={pickerStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLangPicker(false)} />
          <View style={[pickerStyles.sheet, { backgroundColor: theme.cardBg }]}>
            <Text style={[pickerStyles.title, { color: theme.textPrimary, borderBottomColor: theme.divider }]}>Select Language</Text>
            <ScrollView>
              {LANGUAGES.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[pickerStyles.item, { borderBottomColor: theme.divider }]}
                  onPress={() => { setLang(l); setShowLangPicker(false); }}
                  testID={`button-lang-${l.code}`}
                >
                  <Text style={[pickerStyles.itemText, { color: theme.textPrimary }, l.code === lang.code && { color: theme.accent, fontWeight: '700' }]}>
                    {l.name}
                  </Text>
                  {l.code === lang.code && <Text style={[pickerStyles.check, { color: theme.accent }]}>✓</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Category picker sheet */}
      <Modal visible={showCatPicker} transparent animationType="slide" onRequestClose={() => setShowCatPicker(false)}>
        <View style={pickerStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCatPicker(false)} />
          <View style={[pickerStyles.sheet, { backgroundColor: theme.cardBg }]}>
            <Text style={[pickerStyles.title, { color: theme.textPrimary, borderBottomColor: theme.divider }]}>Select Category</Text>
            <ScrollView>
              {CREATEABLE_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[pickerStyles.item, { borderBottomColor: theme.divider }]}
                  onPress={() => { setCategoryId(cat.id); setShowCatPicker(false); }}
                  testID={`button-cat-${cat.id}`}
                >
                  <Text style={[pickerStyles.itemText, { color: theme.textPrimary }, cat.id === categoryId && { color: theme.accent, fontWeight: '700' }]}>
                    {cat.label}
                  </Text>
                  {cat.id === categoryId && <Text style={[pickerStyles.check, { color: theme.accent }]}>✓</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Room Item ────────────────────────────────────────────────────────────────
function RoomItem({
  item,
  isLast,
  onPress,
  kickedUntil,
}: {
  item: Chatroom;
  isLast: boolean;
  onPress: (room: Chatroom) => void;
  kickedUntil?: number;
}) {
  const theme = useAppTheme();
  const initial = item.name.charAt(0).toUpperCase();
  const fill = Math.min((item.currentParticipants / item.maxParticipants) * 100, 100);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!kickedUntil || kickedUntil <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [kickedUntil]);

  const isKickCooldown = kickedUntil !== undefined && kickedUntil > now;
  const remainingSec = isKickCooldown ? Math.ceil((kickedUntil - now) / 1000) : 0;
  const remainingMin = isKickCooldown ? Math.ceil(remainingSec / 60) : 0;

  return (
    <>
      <TouchableOpacity
        style={[styles.roomItem, { backgroundColor: theme.cardBg }]}
        activeOpacity={0.7}
        testID={`card-room-${item.id}`}
        onPress={() => onPress(item)}
      >
        <View style={[styles.avatar, { backgroundColor: isKickCooldown ? '#999' : theme.accent }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.roomInfo}>
          <View style={styles.roomNameRow}>
            <Text style={[styles.roomName, { color: isKickCooldown ? '#999' : theme.accent }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.countBadge}>
              <Image
                source={require('../../assets/icons/ad_userppl_grey.png')}
                style={styles.countIcon}
                resizeMode="contain"
              />
              <Text style={styles.countText}>{item.currentParticipants}/{item.maxParticipants}</Text>
            </View>
          </View>
          {isKickCooldown ? (
            <Text style={[styles.roomDesc, { color: '#E53935', fontStyle: 'italic' }]} numberOfLines={2}>
              {'You has been kicked from the chatroom '}
              <Text style={{ fontWeight: '700' }}>{item.name}</Text>
              {` wait ${remainingMin} minute${remainingMin !== 1 ? 's' : ''} to enter again!`}
            </Text>
          ) : item.description ? (
            <Text style={[styles.roomDesc, { color: theme.textSecondary }]} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${fill}%` as `${number}%`,
              backgroundColor: isKickCooldown ? '#999' : C.green,
            }]} />
          </View>
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.itemDivider} />}
    </>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({
  category,
  rooms,
  loading,
  onRefresh,
  onRoomPress,
  kickedRooms,
}: {
  category: Category;
  rooms: Chatroom[];
  loading: boolean;
  onRefresh: () => void;
  onRoomPress: (room: Chatroom) => void;
  kickedRooms?: Record<string, { roomName: string; kickedAt: number }>;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(true);
  const iconSrc = CATEGORY_ICONS[category.key];

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={[styles.catHeader, { backgroundColor: theme.screenBg }]}
        activeOpacity={0.8}
        onPress={() => setExpanded(e => !e)}
        testID={`category-header-${category.id}`}
      >
        {iconSrc ? (
          <MaterialCommunityIcons name={iconSrc.name} size={22} color={iconSrc.color} style={styles.catIcon} />
        ) : (
          <View style={styles.catIcon} />
        )}
        <Text style={[styles.catName, { color: theme.textPrimary }]}>{category.label}</Text>
        <View style={styles.catActions}>
          <TouchableOpacity
            onPress={onRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID={`refresh-category-${category.id}`}
          >
            <Text style={styles.refreshIcon}>↻</Text>
          </TouchableOpacity>
          <Text style={[styles.chevron, expanded && styles.chevronUp]}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={[styles.catDivider, { backgroundColor: theme.divider }]} />

      {expanded && (
        <View style={[styles.roomList, { backgroundColor: theme.cardBg }]}>
          {loading ? (
            <View style={styles.catLoading}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : rooms.length === 0 ? (
            <View style={styles.catEmpty}>
              <Text style={[styles.catEmptyText, { color: theme.textSecondary }]}>No chatrooms in this category</Text>
            </View>
          ) : (
            rooms.map((room, idx) => {
              const kr = kickedRooms?.[room.id];
              const kickedUntil = kr ? kr.kickedAt + KICK_COOLDOWN_MS : undefined;
              return (
                <RoomItem
                  key={room.id}
                  item={room}
                  isLast={idx === rooms.length - 1}
                  onPress={onRoomPress}
                  kickedUntil={kickedUntil}
                />
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

type CategoryIconDef = { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string };
const CATEGORY_ICONS: Record<string, CategoryIconDef> = {
  RECOMMENDED:   { name: 'star-circle',        color: '#F59E0B' },
  GAMES:         { name: 'gamepad-variant',     color: '#10B981' },
  FRIEND_FINDER: { name: 'account-group',       color: '#3B82F6' },
  GAME_ZONE:     { name: 'controller',          color: '#8B5CF6' },
  HELP:          { name: 'help-circle',         color: '#14B8A6' },
  FAVORITES:     { name: 'heart',               color: '#EF4444' },
  RECENT:        { name: 'clock-outline',       color: '#F97316' },
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const MAX_OPEN_TABS = 5;

export default function RoomListScreen() {
  const [categories, setCategories]           = useState<Category[]>([]);
  const [roomsByCategory, setRoomsByCategory] = useState<Record<number, Chatroom[]>>({});
  const [loadingCats, setLoadingCats]         = useState<Record<number, boolean>>({});
  const [initialLoading, setInitialLoading]   = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null);
  const [showCreate, setShowCreate]           = useState(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]         = useState('');
  const [searchResults, setSearchResults]     = useState<Chatroom[]>([]);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [searched, setSearched]               = useState(false);
  const searchDebounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef                        = useRef<TextInput>(null);

  // ── Multi-tab room + private chat state ──────────────────────────────────
  // openRooms: chatroom tabs (WS stays alive for each)
  // openPrivateChats: private chat tabs (each has own WS connection)
  // activeTabId: the tab currently in focus (either a room ID or conv ID)
  // modalVisible: whether the multi-tab modal is shown (tabs survive when hidden)
  const [openRooms, setOpenRooms]               = useState<Chatroom[]>([]);
  const [openPrivateChats, setOpenPrivateChats] = useState<PrivateChat[]>([]);
  const [activeTabId, setActiveTabId]           = useState<string | null>(null);
  const [modalVisible, setModalVisible]         = useState(false);

  // ── Kick cooldown state ───────────────────────────────────────────────────
  // roomId → { roomName, kickedAt }
  const [kickedRooms, setKickedRooms] = useState<Record<string, { roomName: string; kickedAt: number }>>({});

  useEffect(() => {
    AsyncStorage.getItem(KICKED_ROOMS_KEY).then(raw => {
      if (!raw) return;
      try {
        const parsed: Record<string, { roomName: string; kickedAt: number }> = JSON.parse(raw);
        const now = Date.now();
        // Filter out expired cooldowns
        const active: Record<string, { roomName: string; kickedAt: number }> = {};
        for (const [id, entry] of Object.entries(parsed)) {
          if (entry.kickedAt + KICK_COOLDOWN_MS > now) active[id] = entry;
        }
        setKickedRooms(active);
      } catch { /* ignore */ }
    });
  }, []);

  const handleKicked = useCallback((roomId: string, roomName: string) => {
    const kickedAt = Date.now();
    setKickedRooms(prev => {
      const next = { ...prev, [roomId]: { roomName, kickedAt } };
      AsyncStorage.setItem(KICKED_ROOMS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    // Close the room tab (mirrors handleRemoveRoom)
    setOpenRooms(prev => {
      const next = prev.filter(r => r.id !== roomId);
      const stillHasTabs = next.length > 0 || openPrivateChats.length > 0;
      if (!stillHasTabs) {
        setActiveTabId(null);
        setModalVisible(false);
      } else if (activeTabId === roomId) {
        const fallback = next[next.length - 1]?.id ?? openPrivateChats[openPrivateChats.length - 1]?.id ?? null;
        setActiveTabId(fallback);
      }
      return next;
    });
  }, [activeTabId, openPrivateChats]);

  useEffect(() => {
    getMe().then(me => { if (me) setCurrentUserId(me.id); });
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chatrooms/categories`, { credentials: 'include' });
      const data = await res.json();
      const cats: Category[] = data.categories ?? [];
      setCategories(cats);
      return cats;
    } catch {
      return [];
    }
  }, []);

  // ── Recent rooms helpers (persisted via AsyncStorage) ────────────────────
  const RECENT_CATEGORY_ID = 2;

  const loadRecentRooms = useCallback(async (): Promise<Chatroom[]> => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_ROOMS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Chatroom[];
    } catch {
      return [];
    }
  }, []);

  const saveRoomToRecent = useCallback(async (room: Chatroom) => {
    try {
      const existing = await loadRecentRooms();
      const filtered = existing.filter(r => r.id !== room.id);
      const updated = [room, ...filtered].slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
      // Refresh the Recent category in state
      setRoomsByCategory(prev => ({ ...prev, [RECENT_CATEGORY_ID]: updated }));
    } catch {
      // non-fatal
    }
  }, [loadRecentRooms]);

  const loadRoomsForCategory = useCallback(async (categoryId: number) => {
    setLoadingCats(prev => ({ ...prev, [categoryId]: true }));
    try {
      if (categoryId === RECENT_CATEGORY_ID) {
        // Recent: load from local AsyncStorage (rooms the user has actually visited),
        // then refresh live participant counts from the server.
        const recent = await loadRecentRooms();
        setRoomsByCategory(prev => ({ ...prev, [categoryId]: recent }));
        const refreshed = await Promise.all(
          recent.map(async (room) => {
            try {
              const r = await fetch(`${API_BASE}/api/chatrooms/${room.id}`, { credentials: 'include' });
              if (r.ok) {
                const d = await r.json();
                return d.chatroom as Chatroom ?? room;
              }
            } catch { /* ignore */ }
            return room;
          })
        );
        setRoomsByCategory(prev => ({ ...prev, [categoryId]: refreshed }));
      } else {
        const res = await fetch(`${API_BASE}/api/chatrooms?categoryId=${categoryId}`, { credentials: 'include' });
        const data = await res.json();
        setRoomsByCategory(prev => ({ ...prev, [categoryId]: data.chatrooms ?? [] }));
      }
    } catch {
      setRoomsByCategory(prev => ({ ...prev, [categoryId]: [] }));
    } finally {
      setLoadingCats(prev => ({ ...prev, [categoryId]: false }));
    }
  }, [loadRecentRooms]);

  const loadAll = useCallback(async () => {
    const cats = await loadCategories();
    await Promise.all(cats.map(c => loadRoomsForCategory(c.id)));
    setInitialLoading(false);
    setRefreshing(false);
  }, [loadCategories, loadRoomsForCategory]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Open a room: if already a tab → focus it and re-open modal; if new → add tab then open modal
  // Also saves to Recent (AsyncStorage) so it appears in the Recent category
  const handleRoomPress = useCallback((room: Chatroom) => {
    const kr = kickedRooms[room.id];
    if (kr) {
      const remaining = kr.kickedAt + KICK_COOLDOWN_MS - Date.now();
      if (remaining > 0) {
        const remainingMin = Math.ceil(remaining / 60000);
        Alert.alert(
          'Cannot Enter Room',
          `You has been kicked from the chatroom ${room.name} wait ${remainingMin} minute${remainingMin !== 1 ? 's' : ''} to enter again!`,
          [{ text: 'OK' }],
        );
        return;
      }
      // Cooldown expired — clean up
      setKickedRooms(prev => {
        const next = { ...prev };
        delete next[room.id];
        AsyncStorage.setItem(KICKED_ROOMS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }

    // ── Capacity pre-check (mirrors Java AlertPacket flow) ────────────────
    // If the room is already at/over its maxParticipants and the user is not
    // already in this room (not a tab they're rejoining), show a popup BEFORE
    // we open the chat modal so we don't even attempt the WS join. Server still
    // enforces this in gateway.ts, but checking client-side avoids the flash
    // of opening the room modal just to immediately tear it down.
    const alreadyOpen = openRooms.some(r => r.id === room.id);
    if (!alreadyOpen
        && room.maxParticipants > 0
        && room.currentParticipants >= room.maxParticipants) {
      Alert.alert(
        'Room Sudah Penuh',
        `Room "${room.name}" sudah penuh (${room.currentParticipants}/${room.maxParticipants} pengguna). Silakan coba lagi nanti.`,
        [{ text: 'OK' }],
      );
      return;
    }

    setOpenRooms(prev => {
      const exists = prev.find(r => r.id === room.id);
      if (exists) return prev;
      return prev.length >= MAX_OPEN_TABS ? [...prev.slice(1), room] : [...prev, room];
    });
    setActiveTabId(room.id);
    setModalVisible(true);
    // Persist to Recent list
    saveRoomToRecent(room);
  }, [saveRoomToRecent, kickedRooms, openRooms]);

  // Remove a specific room from the tab bar (WS cleans up on unmount)
  const handleRemoveRoom = useCallback((roomId: string) => {
    setOpenRooms(prev => {
      const next = prev.filter(r => r.id !== roomId);
      const stillHasTabs = next.length > 0 || openPrivateChats.length > 0;
      if (!stillHasTabs) {
        setActiveTabId(null);
        setModalVisible(false);
      } else if (activeTabId === roomId) {
        const fallback = next[next.length - 1]?.id ?? openPrivateChats[openPrivateChats.length - 1]?.id ?? null;
        setActiveTabId(fallback);
      }
      return next;
    });
  }, [activeTabId, openPrivateChats]);

  // Remove a private chat tab
  const handleRemovePrivateChat = useCallback((chatId: string) => {
    setOpenPrivateChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      const stillHasTabs = openRooms.length > 0 || next.length > 0;
      if (!stillHasTabs) {
        setActiveTabId(null);
        setModalVisible(false);
      } else if (activeTabId === chatId) {
        const fallback = openRooms[openRooms.length - 1]?.id ?? next[next.length - 1]?.id ?? null;
        setActiveTabId(fallback);
      }
      return next;
    });
  }, [activeTabId, openRooms]);

  // Open or focus a private chat tab — called from participant menu in RoomChatModal
  // Mirrors ActionHandler.java displayPrivateChat: findOrCreateConversation + displayChatConversation
  const handleOpenPrivateChat = useCallback(async (username: string, displayName: string) => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/chatsync/conversations/private`, {
        method: 'POST',
        headers: headers as Record<string, string>,
        body: JSON.stringify({ targetUsername: username }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Private chat', data.message ?? 'Tidak dapat membuka private chat.');
        return;
      }
      const data = await res.json();
      const conv = data.conversation;
      const chatEntry: PrivateChat = {
        id: conv.id,
        peerUsername: username,
        peerDisplayName: displayName || username,
        color: conv.avatarColor ?? '#4CAF50',
      };
      setOpenPrivateChats(prev => {
        const exists = prev.find(c => c.id === conv.id);
        if (exists) return prev;
        return prev.length >= MAX_OPEN_TABS ? [...prev.slice(1), chatEntry] : [...prev, chatEntry];
      });
      setActiveTabId(conv.id);
      setModalVisible(true);
    } catch {
      Alert.alert('Error', 'Tidak dapat membuka private chat saat ini.');
    }
  }, []);

  // Silently add a private chat tab when an incoming message arrives from someone else
  // Called by MultiRoomChatModal when CHAT_MESSAGE is received on the room WebSocket
  const handleIncomingPrivateChat = useCallback((convId: string, peerUsername: string, peerDisplayName: string) => {
    const chatEntry: PrivateChat = {
      id: convId,
      peerUsername,
      peerDisplayName: peerDisplayName || peerUsername,
      color: '#FF9800',
    };
    setOpenPrivateChats(prev => {
      const exists = prev.find(c => c.id === convId);
      if (exists) return prev;
      return prev.length >= MAX_OPEN_TABS ? [...prev.slice(1), chatEntry] : [...prev, chatEntry];
    });
    if (!modalVisible) setModalVisible(true);
  }, [modalVisible]);

  // Back button: hide the modal but keep all tabs/WS connections alive
  const handleMinimize = useCallback(() => {
    setModalVisible(false);
  }, []);

  // Android hardware back: when rooms/chats are open but modal is hidden,
  // re-open the modal instead of letting the system navigate away (which
  // would unmount the screen and lose all tab state).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const hasTabs = openRooms.length > 0 || openPrivateChats.length > 0;
      if (hasTabs && !modalVisible) {
        setModalVisible(true);
        return true; // consumed — prevent system back
      }
      return false; // let the system handle it
    });
    return () => sub.remove();
  }, [openRooms, openPrivateChats, modalVisible]);

  const handleRoomCreated = useCallback((room: Chatroom) => {
    setRoomsByCategory(prev => ({
      ...prev,
      [room.categoryId]: [room, ...(prev[room.categoryId] ?? [])],
    }));
    handleRoomPress(room);
  }, [handleRoomPress]);

  // ── Search handler ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/search/chatrooms?q=${encodeURIComponent(term)}&limit=30`,
        { credentials: 'include' },
      );
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.trim().length === 0) {
      setSearchResults([]);
      setSearched(false);
      setSearchLoading(false);
      return;
    }
    if (text.trim().length < 2) return;
    searchDebounceRef.current = setTimeout(() => doSearch(text), 350);
  }, [doSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearched(false);
    setSearchLoading(false);
    searchInputRef.current?.focus();
  }, []);

  const theme = useAppTheme();

  if (initialLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.screenBg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.screenBg }]}>

      {/* ── Search Bar ── */}
      <View style={[styles.searchBar, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <Image
          source={require('../../assets/icons/ad_search_grey.png')}
          style={[styles.searchIcon, { tintColor: theme.textSecondary }]}
          resizeMode="contain"
        />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Cari chat room..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={handleSearchChange}
          onSubmitEditing={() => doSearch(searchQuery)}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          testID="input-search-room"
        />
        {isSearchActive && (
          <TouchableOpacity
            onPress={handleClearSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="button-clear-room-search"
          >
            <Image
              source={require('../../assets/icons/ad_close_grey.png')}
              style={[styles.clearIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Search Results ── */}
      {isSearchActive ? (
        searchLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        ) : searched && searchResults.length === 0 ? (
          <View style={styles.searchEmpty}>
            <Image
              source={require('../../assets/icons/ad_chatroom_grey.png')}
              style={[styles.searchEmptyIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
            <Text style={[styles.searchEmptyTitle, { color: theme.textPrimary }]}>Tidak ada hasil</Text>
            <Text style={[styles.searchEmptySub, { color: theme.textSecondary }]}>
              Tidak ada chat room dengan nama "{searchQuery}". Coba kata kunci lain.
            </Text>
          </View>
        ) : (
          <>
            {searched && (
              <Text style={[styles.searchCount, { color: theme.textSecondary }]}>
                {searchResults.length} room ditemukan
              </Text>
            )}
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={({ item, index }) => {
                const kr = kickedRooms[item.id];
                const kickedUntil = kr ? kr.kickedAt + KICK_COOLDOWN_MS : undefined;
                return (
                  <RoomItem
                    item={item}
                    isLast={index === searchResults.length - 1}
                    onPress={handleRoomPress}
                    kickedUntil={kickedUntil}
                  />
                );
              }}
              style={[styles.searchList, { backgroundColor: theme.cardBg }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListFooterComponent={<View style={{ height: 100 }} />}
            />
          </>
        )
      ) : (
        /* ── Normal Category List ── */
        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(); }}
              tintColor={theme.accent}
            />
          }
        >
          {categories.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              rooms={roomsByCategory[cat.id] ?? []}
              loading={loadingCats[cat.id] ?? false}
              onRefresh={() => loadRoomsForCategory(cat.id)}
              onRoomPress={handleRoomPress}
              kickedRooms={kickedRooms}
            />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB — Create Room */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
        testID="button-open-create-room"
      >
        <Text style={styles.fabPlus}>+</Text>
      </TouchableOpacity>

      {/* Create Room Modal */}
      <CreateRoomModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleRoomCreated}
      />

      {/* Resume pill — shown when tabs are open but the modal is minimized */}
      {(openRooms.length > 0 || openPrivateChats.length > 0) && !modalVisible && (
        <TouchableOpacity
          style={styles.resumePill}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
          testID="button-resume-chat"
        >
          <Text style={styles.resumePillText}>
            💬  Resume chat ({openRooms.length + openPrivateChats.length} {openRooms.length + openPrivateChats.length === 1 ? 'tab' : 'tabs'})
          </Text>
        </TouchableOpacity>
      )}

      {/* Multi-tab Chat Modal — chatrooms + private chats all stay connected */}
      {(openRooms.length > 0 || openPrivateChats.length > 0) && (
        <MultiRoomChatModal
          visible={modalVisible}
          openRooms={openRooms}
          openPrivateChats={openPrivateChats}
          activeTabId={activeTabId}
          currentUserId={currentUserId}
          onMinimize={handleMinimize}
          onRemoveRoom={handleRemoveRoom}
          onRemovePrivateChat={handleRemovePrivateChat}
          onChangeActiveTab={setActiveTabId}
          onOpenPrivateChat={handleOpenPrivateChat}
          onIncomingPrivateChat={handleIncomingPrivateChat}
          onKicked={handleKicked}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.catBg },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchIcon:  { width: 17, height: 17 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  clearIcon:   { width: 16, height: 16 },

  searchList:  { flex: 1 },
  searchCount: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  searchEmptyIcon:  { width: 56, height: 56, marginBottom: 14 },
  searchEmptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  searchEmptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  section: { marginBottom: 8 },

  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.catBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  catIcon:    { width: 24, height: 24, marginRight: 10 },
  catName:    { flex: 1, fontSize: 14, fontWeight: '600', color: C.catText },
  catActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshIcon:{ fontSize: 18, color: C.ts },
  chevron:    { fontSize: 20, color: C.ts, transform: [{ rotate: '90deg' }] },
  chevronUp:  { transform: [{ rotate: '-90deg' }] },

  catDivider: { height: 1, backgroundColor: C.border },
  roomList:   { backgroundColor: C.white },
  catLoading: { padding: 20, alignItems: 'center' },
  catEmpty:   { paddingHorizontal: 20, paddingVertical: 16 },
  catEmptyText: { color: C.ts, fontSize: 13, fontStyle: 'italic' },

  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { color: C.white, fontWeight: 'bold', fontSize: 18 },
  roomInfo:   { flex: 1 },
  roomNameRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  roomName:   { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  roomDesc:   { color: C.ts, fontSize: 12, marginBottom: 4 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countIcon:  { width: 13, height: 13, tintColor: C.ts },
  countText:  { color: C.ts, fontSize: 11 },
  progressTrack: { height: 3, backgroundColor: '#EEEEEE', borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2 },

  itemDivider: { height: 1, backgroundColor: C.sep, marginLeft: 74 },

  // FAB — floating action button, mirrors ad_chatroomadd_white icon intent
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  fabPlus: { color: C.white, fontSize: 28, fontWeight: '300', lineHeight: 30, marginTop: -2 },

  resumePill: {
    position: 'absolute',
    left: 16,
    right: 86,           // leave space for the FAB on the right
    bottom: 88,
    backgroundColor: '#006D8F',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    alignItems: 'center',
  },
  resumePillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

// ─── Create Room Sheet Styles ─────────────────────────────────────────────────
const createStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.sheet,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.catText },
  headerClose: { fontSize: 18, color: C.ts },

  // "Create a space to talk about what you love." — matches Java hint
  hint: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 13,
    color: C.ts,
    fontStyle: 'italic',
  },

  form: { paddingHorizontal: 20 },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: C.catText,
    marginTop: 14,
    marginBottom: 6,
  },
  required: { color: C.error },
  optional: { color: C.ts, fontWeight: '400' },

  inputRow: { position: 'relative' },
  input: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.catText,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  inputError: { borderColor: C.error },
  charCount: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    fontSize: 10,
    color: C.ts,
  },
  errorText: { color: C.error, fontSize: 11, marginTop: 3 },

  picker: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText:  { fontSize: 14, color: C.catText },
  pickerArrow: { fontSize: 20, color: C.ts },

  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: C.catText,
    transform: [{ scale: 1.15 }],
  },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.catBg,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  previewAvatar:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  previewInitial:  { color: C.white, fontWeight: 'bold', fontSize: 20 },
  previewName:     { fontSize: 15, fontWeight: '600' },
  previewSub:      { color: C.ts, fontSize: 11, marginTop: 2 },

  // "CREATE CHAT ROOM" — matches Java createChatroom button text exactly
  createBtn: {
    backgroundColor: C.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: C.white, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
});

// ─── Picker Sheet Styles ──────────────────────────────────────────────────────
const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingTop: 8,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 15,
    color: C.catText,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
  },
  itemText:         { fontSize: 14, color: C.catText },
  itemTextSelected: { color: C.green, fontWeight: '700' },
  check:            { color: C.green, fontSize: 16, fontWeight: '700' },
});
