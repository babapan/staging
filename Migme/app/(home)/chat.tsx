import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import MultiRoomChatModal, { type PrivateChat } from '../../components/MultiRoomChatModal';
import ViewProfileModal from '../../components/ViewProfileModal';
import CreditsModal from '../../components/CreditsModal';
import { API_BASE, getMe, buildHeaders } from '../../services/auth';
import { useAppTheme } from '../../services/themeContext';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  green: '#00A8CC',
  white: '#FFFFFF',
  text: '#424242',
  ts: '#999999',
  sep: '#F5F5F5',
  unreadBg: '#F0FAF7',
  badgeBg: '#00A8CC',
  groupBadge: '#9C27B0',
  passivated: '#BDBDBD',
  passivatedBg: '#FAFAFA',
  versionChip: '#E8F5E9',
  inputBg: '#F2F2F2',
  inputBorder: '#E0E0E0',
  overlay: 'rgba(0,0,0,0.35)',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConversationMember {
  userId: string;
  username: string;
  displayName: string | null;
  displayGUID: string | null;
}

interface Conversation {
  id: string;
  type: 'private' | 'group';
  name: string;
  avatarInitial: string;
  avatarColor: string;
  displayGUID: string | null;
  groupOwner: string | null;
  lastMessageText: string | null;
  lastMessageType: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isClosed: boolean;
  isPassivated: boolean;
  members: ConversationMember[];
}

type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

interface ContactRow {
  id?: string;
  friendUserId?: string;
  friendUsername?: string;
  friendDisplayName?: string | null;
  username?: string;
  displayName?: string | null;
  displayPicture?: string | null;
  aboutMe?: string | null;
  presence?: PresenceStatus;
  statusMessage?: string;
  country?: string | null;
  migLevel?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function messageTypeLabel(type: string, text: string | null): string {
  switch (type) {
    case 'image':   return '📷 Photo';
    case 'sticker': return '✨ Sticker';
    case 'system':  return text ?? 'System message';
    default:        return text ?? 'Tap to start chatting';
  }
}

function messageTypeIcon(type: string): string | null {
  switch (type) {
    case 'image':   return '📷';
    case 'sticker': return '✨';
    default:        return null;
  }
}

function countryToFlag(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return null;
  const A = 0x1F1E6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

function levelTier(level: number): { bg: string; fg: string } {
  if (level >= 80) return { bg: '#DC2626', fg: '#FFFFFF' };
  if (level >= 50) return { bg: '#F59E0B', fg: '#1F2937' };
  if (level >= 30) return { bg: '#8B5CF6', fg: '#FFFFFF' };
  if (level >= 10) return { bg: '#3B82F6', fg: '#FFFFFF' };
  return { bg: '#6B7280', fg: '#FFFFFF' };
}

function presenceColors(status: PresenceStatus, accent: string, isDark: boolean) {
  switch (status) {
    case 'online': return { ring: '#22C55E', dot: '#22C55E' };
    case 'away':   return { ring: '#F59E0B', dot: '#F59E0B' };
    case 'busy':   return { ring: '#EF4444', dot: '#EF4444' };
    default:       return {
      ring: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
      dot:  isDark ? '#6B7280' : '#9CA3AF',
    };
  }
}

const AVATAR_DEFAULT = require('../../assets/icons/icon_default_avatar.png');
const ICON_VIEW_PROFILE = require('../../assets/icons/ad_avatar_grey.png');
const ICON_SEND_CREDIT  = require('../../assets/icons/ad_solidcredit.png');
const ICON_PRIVATE_CHAT = require('../../assets/icons/ad_chatlarge_grey.png');

// ─── Contact Item Row ─────────────────────────────────────────────────────────
function ContactItem({
  item,
  onMenuPress,
}: {
  item: ContactRow;
  onMenuPress: (item: ContactRow) => void;
}) {
  const theme = useAppTheme();
  const displayName = item.friendDisplayName || item.displayName || item.friendUsername || item.username || '';
  const username = item.friendUsername || item.username || '';
  const statusMsg = item.statusMessage?.trim();
  const status: PresenceStatus = item.presence ?? 'offline';
  const id = item.id || item.friendUserId || username;
  const { ring: ringColor, dot: dotColor } = presenceColors(status, theme.accent, theme.isDark);
  const isOnline = status === 'online';

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isOnline) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pulse]);
  const haloScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  const cardShadow = theme.isDark
    ? { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }
    : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 };

  return (
    <Pressable
      android_ripple={{ color: theme.accentSoft, borderless: false }}
      style={({ pressed }) => [
        cst.row,
        cardShadow,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      testID={`row-contact-${id}`}
    >
      <View style={cst.avatarWrap}>
        <View style={[cst.avatarRing, { borderColor: ringColor }]}>
          {item.displayPicture ? (
            <Image
              source={{ uri: item.displayPicture.startsWith('http') ? item.displayPicture : `${API_BASE}${item.displayPicture}` }}
              style={cst.avatar}
              defaultSource={AVATAR_DEFAULT}
            />
          ) : (
            <Image source={AVATAR_DEFAULT} style={cst.avatar} resizeMode="cover" />
          )}
        </View>
        {isOnline && (
          <Animated.View
            pointerEvents="none"
            style={[cst.presenceHalo, { backgroundColor: dotColor, borderColor: theme.cardBg, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
        )}
        <View style={[cst.presenceDot, { backgroundColor: dotColor, borderColor: theme.cardBg }]} />
      </View>

      <View style={cst.textArea}>
        <View style={cst.nameRow}>
          <Text style={[cst.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          {typeof item.migLevel === 'number' && item.migLevel > 0 ? (() => {
            const tier = levelTier(item.migLevel);
            return (
              <View style={[cst.levelPill, { backgroundColor: tier.bg }]}>
                <Text style={[cst.levelPillText, { color: tier.fg }]}>Lv {item.migLevel}</Text>
              </View>
            );
          })() : null}
          {(() => {
            const flag = countryToFlag(item.country);
            return flag ? <Text style={cst.flagBadge}>{flag}</Text> : null;
          })()}
        </View>
        <Text style={[cst.handle, { color: theme.textSecondary }]} numberOfLines={1}>@{username}</Text>
        {statusMsg ? (
          <Text style={[cst.statusLine, { color: theme.textSecondary }]} numberOfLines={1}>{statusMsg}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[cst.menuBtn, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}
        activeOpacity={0.55}
        onPress={() => onMenuPress(item)}
        testID={`button-menu-contact-${id}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[cst.dot, { backgroundColor: theme.textSecondary }]} />
        <View style={[cst.dot, { backgroundColor: theme.textSecondary }]} />
        <View style={[cst.dot, { backgroundColor: theme.textSecondary }]} />
      </TouchableOpacity>
    </Pressable>
  );
}

// ─── Contact Context Menu ─────────────────────────────────────────────────────
function ContactContextMenu({
  visible,
  contact,
  onClose,
  onViewProfile,
  onSendCredit,
  onPrivateChat,
}: {
  visible: boolean;
  contact: ContactRow | null;
  onClose: () => void;
  onViewProfile: () => void;
  onSendCredit: () => void;
  onPrivateChat: () => void;
}) {
  const theme    = useAppTheme();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 60, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!contact) return null;

  const displayName = contact.friendDisplayName || contact.displayName || contact.friendUsername || contact.username || '';
  const username    = contact.friendUsername || contact.username || '';

  const MENU_ITEMS = [
    { label: 'View Profile', img: ICON_VIEW_PROFILE, action: () => { onClose(); setTimeout(onViewProfile, 180); }, testID: 'button-ctx-view-profile' },
    { label: 'Send Credit',  img: ICON_SEND_CREDIT,  action: () => { onClose(); setTimeout(onSendCredit,  180); }, testID: 'button-ctx-send-credit' },
    { label: 'Private Chat', img: ICON_PRIVATE_CHAT, action: () => { onClose(); setTimeout(onPrivateChat, 180); }, testID: 'button-ctx-private-chat' },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.ctxOverlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.ctxSheet, { backgroundColor: theme.cardBg, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.ctxHeader}>
            <Text style={[styles.ctxName, { color: theme.textPrimary }]} numberOfLines={1}>{displayName}</Text>
            <Text style={[styles.ctxUsername, { color: theme.textSecondary }]} numberOfLines={1}>@{username}</Text>
          </View>
          <View style={[styles.ctxDivider, { backgroundColor: theme.divider }]} />
          {MENU_ITEMS.map((item, idx) => (
            <View key={item.label}>
              <TouchableOpacity style={styles.ctxItem} activeOpacity={0.65} onPress={item.action} testID={item.testID}>
                <Image source={item.img} style={[styles.ctxItemIcon, { tintColor: theme.accent }]} resizeMode="contain" />
                <Text style={[styles.ctxItemLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              </TouchableOpacity>
              {idx < MENU_ITEMS.length - 1 && <View style={[styles.ctxDivider, { backgroundColor: theme.divider }]} />}
            </View>
          ))}
          <View style={[styles.ctxDivider, { backgroundColor: theme.divider }]} />
          <TouchableOpacity style={styles.ctxItem} activeOpacity={0.65} onPress={onClose} testID="button-ctx-cancel">
            <Text style={[styles.ctxItemLabel, { color: theme.textSecondary, textAlign: 'center', flex: 1 }]}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function ConvAvatar({
  displayGUID, avatarColor, avatarInitial, isGroup, isPassivated,
}: {
  displayGUID: string | null;
  avatarColor: string;
  avatarInitial: string;
  isGroup: boolean;
  isPassivated: boolean;
}) {
  const bg = isPassivated ? C.passivated : avatarColor;
  return (
    <View style={[styles.convAvatar, { backgroundColor: bg }]}>
      {displayGUID ? (
        <Image source={{ uri: displayGUID }} style={styles.convAvatarImg} resizeMode="cover" />
      ) : (
        <Text style={styles.convAvatarText}>{avatarInitial}</Text>
      )}
      {isGroup && (
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>G</Text>
        </View>
      )}
    </View>
  );
}

// ─── Conversation Row ─────────────────────────────────────────────────────────
function ConversationItem({
  item,
  onPress,
  onLongPress,
}: {
  item: Conversation;
  onPress: (item: Conversation) => void;
  onLongPress: (item: Conversation) => void;
}) {
  const theme = useAppTheme();
  const isUnread = item.unreadCount > 0;
  const isGroup = item.type === 'group';
  const memberCount = item.members.length;
  const titleSuffix = isGroup ? ` (${memberCount})` : '';
  const previewText = messageTypeLabel(item.lastMessageType, item.lastMessageText);
  const typeIcon = messageTypeIcon(item.lastMessageType);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      testID={`card-conversation-${item.id}`}
    >
      <View style={[
        styles.convItem,
        { backgroundColor: theme.cardBg },
        isUnread && { backgroundColor: theme.accentSoft },
        item.isPassivated && styles.convItemPassivated,
      ]}>
        <ConvAvatar
          displayGUID={item.displayGUID}
          avatarColor={item.avatarColor}
          avatarInitial={item.avatarInitial}
          isGroup={isGroup}
          isPassivated={item.isPassivated}
        />
        <View style={styles.convBody}>
          <View style={styles.convRow}>
            <Text
              style={[
                styles.convName,
                { color: theme.textPrimary },
                isUnread && styles.convNameUnread,
                item.isPassivated && styles.convNamePassivated,
              ]}
              numberOfLines={1}
            >
              {item.name}{titleSuffix}
            </Text>
            <Text style={[styles.convTs, { color: theme.textSecondary }, item.isPassivated && styles.tsPassivated]}>
              {formatTimestamp(item.lastMessageAt)}
            </Text>
          </View>

          <View style={styles.convRow}>
            <View style={styles.previewRow}>
              {typeIcon ? <Text style={styles.typeIconText}>{typeIcon} </Text> : null}
              <Text
                style={[styles.convPreview, { color: theme.textSecondary }, item.isPassivated && styles.previewPassivated]}
                numberOfLines={1}
              >
                {previewText}
              </Text>
            </View>
            {isUnread ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            ) : null}
          </View>

          {(isGroup && item.groupOwner) || item.isPassivated ? (
            <View style={styles.metaRow}>
              {isGroup && item.groupOwner ? (
                <Text style={styles.metaText}>Owner: {item.groupOwner}</Text>
              ) : null}
              {item.isPassivated ? (
                <View style={styles.passivatedChip}>
                  <Text style={styles.passivatedChipText}>Inactive</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const MAX_OPEN_TABS = 5;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const theme = useAppTheme();
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  // ── Conversations ──
  const [conversations,   setConversations]   = useState<Conversation[]>([]);
  const [chatListVersion, setChatListVersion] = useState<number>(0);
  const [convsLoading,    setConvsLoading]    = useState(true);
  const [convsRefreshing, setConvsRefreshing] = useState(false);

  // ── Contact List ──
  const [contacts,         setContacts]         = useState<ContactRow[]>([]);
  const [contactsLoading,  setContactsLoading]  = useState(false);
  const [contactsRefresh,  setContactsRefresh]  = useState(false);
  const [query,            setQuery]            = useState('');
  const [selectedContact,  setSelectedContact]  = useState<ContactRow | null>(null);
  const [menuVisible,      setMenuVisible]      = useState(false);
  const [viewProfileVis,   setViewProfileVis]   = useState(false);
  const [creditsVis,       setCreditsVis]       = useState(false);
  const [myUsername,       setMyUsername]       = useState<string | null>(null);

  // ── Chat modal ──
  const [openRooms,         setOpenRooms]         = useState<{ id: string; name: string; description: string | null; color: string; currentParticipants: number; maxParticipants: number }[]>([]);
  const [openPrivateChats,  setOpenPrivateChats]  = useState<PrivateChat[]>([]);
  const [activeTabId,       setActiveTabId]       = useState<string | null>(null);
  const [modalVisible,      setModalVisible]      = useState(false);
  const [currentUserId,     setCurrentUserId]     = useState<string | null>(null);

  useEffect(() => {
    getMe().then(me => {
      if (me) {
        setCurrentUserId(me.id);
        setMyUsername(me.username);
      }
    });
  }, []);

  // ── Load conversations ──
  const loadConversations = useCallback(async (refresh = false) => {
    if (refresh) setConvsRefreshing(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/chatsync/conversations`, { credentials: 'include', headers });
      const data = await res.json();
      setConversations(data.conversations ?? []);
      if (typeof data.chatListVersion === 'number') setChatListVersion(data.chatListVersion);
    } catch {
      setConversations([]);
    } finally {
      setConvsLoading(false);
      setConvsRefreshing(false);
    }
  }, []);

  // ── Load contacts ──
  const loadContacts = useCallback(async (refresh = false) => {
    if (refresh) setContactsRefresh(true);
    else setContactsLoading(true);
    try {
      const headers = await buildHeaders();
      const opts: RequestInit = Platform.OS === 'web'
        ? { credentials: 'include' }
        : { headers: headers as Record<string, string> };
      const res = await fetch(`${API_BASE}/api/contacts`, opts);
      if (!res.ok) return;
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setContactsLoading(false);
      setContactsRefresh(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load contacts when tab first opened
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'contacts') loadContacts();
    }, [activeTab, loadContacts])
  );

  useEffect(() => {
    if (activeTab === 'contacts' && contacts.length === 0) loadContacts();
  }, [activeTab]);

  // Chat list version polling
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const headers = await buildHeaders();
        const res = await fetch(`${API_BASE}/api/chatsync/version`, { credentials: 'include', headers });
        if (!res.ok || !active) return;
        const data = await res.json();
        const serverVersion: number = data.chatListVersion ?? 0;
        setChatListVersion(prev => {
          if (serverVersion > prev) { loadConversations(); return serverVersion; }
          return prev;
        });
      } catch {}
    };
    const timer = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [loadConversations]);

  // ── Contact sorting + filtering ──
  const sortedContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? contacts.filter(c => {
          const name = (c.friendDisplayName || c.displayName || c.friendUsername || c.username || '').toLowerCase();
          return name.includes(q) || (c.statusMessage || '').toLowerCase().includes(q);
        })
      : contacts;
    const isOnlineLike = (p?: PresenceStatus) => p === 'online' || p === 'away' || p === 'busy';
    const nameOf = (c: ContactRow) =>
      (c.friendDisplayName || c.displayName || c.friendUsername || c.username || '').toLowerCase();
    const online  = list.filter(c =>  isOnlineLike(c.presence)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const offline = list.filter(c => !isOnlineLike(c.presence)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return { online, offline };
  }, [contacts, query]);

  // ── Contact list data (sections flattened for FlatList) ──
  type ContactListItem =
    | { _type: 'header'; label: string; count: number }
    | { _type: 'contact'; data: ContactRow };

  const contactListData = useMemo((): ContactListItem[] => {
    const items: ContactListItem[] = [];
    if (sortedContacts.online.length > 0) {
      items.push({ _type: 'header', label: 'ONLINE', count: sortedContacts.online.length });
      sortedContacts.online.forEach(c => items.push({ _type: 'contact', data: c }));
    }
    if (sortedContacts.offline.length > 0) {
      items.push({ _type: 'header', label: 'OFFLINE', count: sortedContacts.offline.length });
      sortedContacts.offline.forEach(c => items.push({ _type: 'contact', data: c }));
    }
    return items;
  }, [sortedContacts]);

  // ── Conversation handlers ──
  const handleLongPress = useCallback((conv: Conversation) => {
    const options = ['Close Chat', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 0, cancelButtonIndex: 1, title: conv.name },
        async (i) => { if (i === 0) closeConversation(conv.id); },
      );
    } else {
      Alert.alert(conv.name, 'Choose an action', [
        { text: 'Close Chat', style: 'destructive', onPress: () => closeConversation(conv.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, []);

  const closeConversation = useCallback(async (id: string) => {
    try {
      const headers = await buildHeaders();
      await fetch(`${API_BASE}/api/chatsync/conversations/${id}`, { method: 'DELETE', credentials: 'include', headers });
      loadConversations();
    } catch {
      Alert.alert('Error', 'Could not close conversation.');
    }
  }, [loadConversations]);

  const handleConversationPress = useCallback((conv: Conversation) => {
    const peer = conv.members.find(m => m.userId !== currentUserId) ?? conv.members[0];
    const chatEntry: PrivateChat = {
      id: conv.id,
      peerUsername: peer?.username ?? conv.name,
      peerDisplayName: peer?.displayName ?? conv.name,
      color: conv.avatarColor,
    };
    setOpenPrivateChats(prev => {
      const exists = prev.find(c => c.id === conv.id);
      if (exists) return prev;
      return prev.length >= MAX_OPEN_TABS ? [...prev.slice(1), chatEntry] : [...prev, chatEntry];
    });
    setConversations(prev => prev.filter(c => c.id !== conv.id));
    setActiveTabId(conv.id);
    setModalVisible(true);
  }, [currentUserId]);

  const handleRemovePrivateChat = useCallback((chatId: string) => {
    setOpenPrivateChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      if (next.length === 0) { setActiveTabId(null); setModalVisible(false); }
      else if (activeTabId === chatId) { setActiveTabId(next[next.length - 1]?.id ?? null); }
      return next;
    });
    setConversations(prev => prev.filter(c => c.id !== chatId));
    closeConversation(chatId);
  }, [activeTabId, closeConversation]);

  const handleRemoveRoom = useCallback((roomId: string) => {
    setOpenRooms(prev => {
      const next = prev.filter(r => r.id !== roomId);
      if (next.length === 0 && openPrivateChats.length === 0) { setActiveTabId(null); setModalVisible(false); }
      else if (activeTabId === roomId) {
        const allIds = [...next.map(r => r.id), ...openPrivateChats.map(c => c.id)];
        setActiveTabId(allIds[allIds.length - 1] ?? null);
      }
      return next;
    });
  }, [activeTabId, openPrivateChats]);

  const handleOpenPrivateChat = useCallback(async (username: string, displayName: string) => {
    try {
      const headers = await buildHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`${API_BASE}/api/chatsync/conversations/private`, {
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ targetUsername: username }),
      });
      if (!res.ok) return;
      const { conversation: conv } = await res.json();
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

  // Contact private chat
  const handleContactPrivateChat = useCallback(async () => {
    if (!selectedContact) return;
    const uname = selectedContact.friendUsername || selectedContact.username || '';
    const dname = selectedContact.friendDisplayName || selectedContact.displayName || uname;
    if (!uname) return;
    await handleOpenPrivateChat(uname, dname);
  }, [selectedContact, handleOpenPrivateChat]);

  const selectedUsername = selectedContact
    ? (selectedContact.friendUsername || selectedContact.username || '')
    : '';

  return (
    <View style={[styles.container, { backgroundColor: theme.screenBg }]}>
      {/* ── Tab bar ── */}
      <View style={[styles.tabRow, { backgroundColor: theme.tabBg, borderBottomColor: theme.tabBorder }]}>
        {([
          ['chats',    'Chats',        require('../../assets/icons/ad_chatlarge_grey.png')],
          ['contacts', 'Contact List', require('../../assets/icons/ad_userppl_grey.png')],
        ] as const).map(([t, label, icon]) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && { borderBottomColor: theme.tabActiveColor }]}
            onPress={() => setActiveTab(t)}
            testID={`tab-${t}`}
          >
            <Image
              source={icon}
              style={[styles.tabIcon, { tintColor: activeTab === t ? theme.tabActiveColor : theme.tabInactiveColor }]}
              resizeMode="contain"
            />
            <Text style={[styles.tabLabel, { color: activeTab === t ? theme.tabActiveColor : theme.tabInactiveColor }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chat list version bar */}
      {activeTab === 'chats' && chatListVersion > 0 && (
        <View style={styles.versionBar}>
          <Text style={styles.versionText}>Chat list v{chatListVersion}</Text>
        </View>
      )}

      {/* ── Chats Tab ── */}
      {activeTab === 'chats' && (
        convsLoading ? (
          <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <Image source={require('../../assets/icons/ad_chatlarge_grey.png')} style={[styles.emptyIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No chats yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Start a private chat from someone's profile or the People tab.</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConversationItem item={item} onPress={handleConversationPress} onLongPress={handleLongPress} />
            )}
            refreshControl={
              <RefreshControl refreshing={convsRefreshing} onRefresh={() => loadConversations(true)} tintColor={theme.accent} />
            }
            ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
          />
        )
      )}

      {/* ── Contact List Tab ── */}
      {activeTab === 'contacts' && (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={[cst.searchBar, {
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : C.inputBg,
            borderColor: theme.isDark ? 'rgba(255,255,255,0.10)' : C.inputBorder,
          }]}>
            <Image
              source={require('../../assets/icons/ad_userppl_grey.png')}
              style={[cst.searchIcon, { tintColor: theme.textSecondary }]}
              resizeMode="contain"
            />
            <TextInput
              style={[cst.searchInput, { color: theme.textPrimary }]}
              placeholder="Search contacts..."
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {contactsLoading ? (
            <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
          ) : contacts.length === 0 ? (
            <View style={styles.empty}>
              <Image source={require('../../assets/icons/ad_userppl_grey.png')} style={[styles.emptyIcon, { tintColor: theme.textSecondary }]} resizeMode="contain" />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No contacts yet</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Add friends from the People tab to see them here.</Text>
            </View>
          ) : (
            <FlatList
              data={contactListData}
              keyExtractor={(item, i) =>
                item._type === 'header' ? `hdr-${item.label}-${i}` : (item.data.id || item.data.friendUserId || item.data.friendUsername || String(i))
              }
              renderItem={({ item }) => {
                if (item._type === 'header') {
                  const isOnline = item.label === 'ONLINE';
                  return (
                    <View style={[cst.sectionHeader, { backgroundColor: theme.screenBg }]}>
                      <View style={[cst.sectionBar, { backgroundColor: isOnline ? '#22C55E' : (theme.isDark ? 'rgba(255,255,255,0.20)' : '#BDBDBD') }]} />
                      <Text style={[cst.sectionText, { color: theme.textSecondary }]}>
                        {item.label} ({item.count})
                      </Text>
                    </View>
                  );
                }
                return (
                  <ContactItem
                    item={item.data}
                    onMenuPress={(c) => { setSelectedContact(c); setMenuVisible(true); }}
                  />
                );
              }}
              refreshControl={
                <RefreshControl
                  refreshing={contactsRefresh}
                  onRefresh={() => loadContacts(true)}
                  tintColor={theme.accent}
                  colors={[theme.accent]}
                />
              }
              contentContainerStyle={cst.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Resume pill */}
      {(openPrivateChats.length > 0 || openRooms.length > 0) && !modalVisible && (
        <TouchableOpacity
          style={[styles.resumePill, { backgroundColor: theme.accent }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
          testID="button-resume-chat"
        >
          <Text style={styles.resumePillText}>
            💬  Resume ({openRooms.length + openPrivateChats.length} {openRooms.length + openPrivateChats.length === 1 ? 'tab' : 'tabs'})
          </Text>
        </TouchableOpacity>
      )}

      {/* Multi-tab chat modal */}
      {(openPrivateChats.length > 0 || openRooms.length > 0) && (
        <MultiRoomChatModal
          visible={modalVisible}
          openRooms={openRooms}
          openPrivateChats={openPrivateChats}
          activeTabId={activeTabId}
          currentUserId={currentUserId}
          onMinimize={() => setModalVisible(false)}
          onRemoveRoom={handleRemoveRoom}
          onRemovePrivateChat={handleRemovePrivateChat}
          onChangeActiveTab={setActiveTabId}
          onOpenPrivateChat={handleOpenPrivateChat}
          onIncomingPrivateChat={(convId, peerUsername, peerDisplayName) => {
            const chatEntry: PrivateChat = {
              id: convId,
              peerUsername,
              peerDisplayName,
              color: '#4CAF50',
            };
            setOpenPrivateChats(prev => {
              const exists = prev.find(c => c.id === convId);
              if (exists) return prev;
              return prev.length >= MAX_OPEN_TABS ? [...prev.slice(1), chatEntry] : [...prev, chatEntry];
            });
            setActiveTabId(convId);
            setModalVisible(true);
          }}
        />
      )}

      {/* Contact menus + modals */}
      <ContactContextMenu
        visible={menuVisible}
        contact={selectedContact}
        onClose={() => setMenuVisible(false)}
        onViewProfile={() => setViewProfileVis(true)}
        onSendCredit={() => setCreditsVis(true)}
        onPrivateChat={handleContactPrivateChat}
      />

      <ViewProfileModal
        visible={viewProfileVis}
        username={selectedUsername}
        onClose={() => setViewProfileVis(false)}
      />

      <CreditsModal
        visible={creditsVis}
        onClose={() => setCreditsVis(false)}
        username={myUsername}
        initialTab="transfer"
        initialToUsername={selectedUsername}
      />
    </View>
  );
}

// ─── Contact list styles ───────────────────────────────────────────────────────
const cst = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    height: 42,
  },
  searchIcon: { width: 16, height: 16, marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 14,
    paddingVertical: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
  },
  sectionBar: { width: 4, height: 14, borderRadius: 2 },
  sectionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 8,
  },
  avatarWrap: { width: 56, height: 56, marginRight: 14 },
  avatarRing: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  presenceDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7, borderWidth: 2,
  },
  presenceHalo: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7, borderWidth: 2,
  },
  textArea: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 1 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1, flexShrink: 1 },
  levelPill: {
    marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 8, minHeight: 16, justifyContent: 'center',
  },
  levelPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  flagBadge: { marginLeft: 6, fontSize: 14 },
  handle: { fontSize: 12, fontWeight: '400', opacity: 0.85 },
  statusLine: { fontSize: 12, fontStyle: 'italic', marginTop: 2, opacity: 0.75 },
  menuBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    gap: 3, marginLeft: 4,
  },
  dot: { width: 4, height: 4, borderRadius: 2, opacity: 0.7 },
});

// ─── Chat/Conv styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#D7EDF5' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabIcon: { width: 18, height: 18 },
  tabLabel: { fontSize: 13, fontWeight: '500' },

  versionBar: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 14, paddingVertical: 4,
    backgroundColor: C.versionChip, borderBottomWidth: 1, borderBottomColor: '#C8E6C9',
  },
  versionText: { color: '#388E3C', fontSize: 10, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  convItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  convItemPassivated: { backgroundColor: C.passivatedBg },
  convAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, overflow: 'hidden',
  },
  convAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  convAvatarText: { color: C.white, fontWeight: 'bold', fontSize: 18 },
  groupBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.groupBadge,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.white,
  },
  groupBadgeText: { color: C.white, fontSize: 8, fontWeight: 'bold' },
  convBody: { flex: 1 },
  convRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  convName: { flex: 1, fontWeight: '600', fontSize: 15, marginRight: 8 },
  convNameUnread: { fontWeight: '700' },
  convNamePassivated: { color: C.passivated },
  convTs: { fontSize: 11, flexShrink: 0 },
  tsPassivated: { color: C.passivated },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  typeIconText: { fontSize: 12 },
  convPreview: { flex: 1, fontSize: 13 },
  previewPassivated: { color: C.passivated },
  unreadBadge: {
    backgroundColor: C.badgeBg, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
    minWidth: 20, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { color: C.white, fontSize: 11, fontWeight: 'bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  metaText: { color: C.ts, fontSize: 10 },
  passivatedChip: { backgroundColor: '#EEEEEE', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  passivatedChipText: { color: C.passivated, fontSize: 9, fontWeight: '600' },

  divider: { height: 1, marginLeft: 76 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 64, height: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  resumePill: {
    position: 'absolute', bottom: 16, alignSelf: 'center',
    borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  resumePillText: { color: C.white, fontWeight: '600', fontSize: 14 },

  ctxOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  ctxSheet: { paddingBottom: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 12 },
  ctxHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  ctxName: { fontSize: 16, fontWeight: '700' },
  ctxUsername: { fontSize: 13, marginTop: 2 },
  ctxDivider: { height: 1 },
  ctxItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  ctxItemIcon: { width: 24, height: 24, marginRight: 14 },
  ctxItemLabel: { fontSize: 15, fontWeight: '500' },
});
