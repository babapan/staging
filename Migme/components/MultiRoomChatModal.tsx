import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RoomChatModal, { type RoomChatHandle } from './RoomChatModal';
import PrivateChatTab, { type PrivateChatHandle } from './PrivateChatTab';
import CreditsModal from './CreditsModal';
import { useAppTheme, type AppTheme } from '../services/themeContext';

const { width: SCREEN_W } = Dimensions.get('window');

interface Chatroom {
  id: string;
  name: string;
  description: string | null;
  color: string;
  currentParticipants: number;
  maxParticipants: number;
  creatorUsername?: string | null;
}

export interface PrivateChat {
  id: string;
  peerUsername: string;
  peerDisplayName: string;
  color: string;
}

type TabEntry =
  | { kind: 'room'; data: Chatroom }
  | { kind: 'private'; data: PrivateChat };

interface Props {
  visible: boolean;
  openRooms: Chatroom[];
  openPrivateChats: PrivateChat[];
  activeTabId: string | null;
  currentUserId: string | null;
  onMinimize: () => void;
  onRemoveRoom: (roomId: string) => void;
  onRemovePrivateChat: (chatId: string) => void;
  onChangeActiveTab: (tabId: string) => void;
  onOpenPrivateChat: (username: string, displayName: string) => void;
  onIncomingPrivateChat: (convId: string, peerUsername: string, peerDisplayName: string) => void;
  onKicked?: (roomId: string, roomName: string) => void;
}

function makePalette(appTheme: AppTheme) {
  return {
    headerBg:       appTheme.headerBg,
    white:          '#FFFFFF',
    tabBg:          appTheme.tabBg,
    tabActive:      appTheme.cardBg,
    tabText:        appTheme.tabInactiveColor,
    tabTextActive:  appTheme.tabActiveColor,
    tabClose:       appTheme.tabInactiveColor,
    iconCircle:     'rgba(255,255,255,0.15)',
    pvtTabBg:       appTheme.drawerBg,
    pvtDot:         '#FF9800',
    unreadBadgeBg:  '#F44336',
    menuIcon:       appTheme.textPrimary,
    menuDanger:     '#EF4444',
    menuSep:        appTheme.divider,
  };
}
type Palette = ReturnType<typeof makePalette>;

const BLINK_INTERVAL = 600;

export default function MultiRoomChatModal({
  visible,
  openRooms,
  openPrivateChats,
  activeTabId,
  currentUserId,
  onMinimize,
  onRemoveRoom,
  onRemovePrivateChat,
  onChangeActiveTab,
  onOpenPrivateChat,
  onIncomingPrivateChat,
  onKicked,
}: Props) {
  const insets   = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C        = useMemo(() => makePalette(appTheme), [appTheme]);
  const styles   = useMemo(() => makeStyles(C), [C]);
  const scrollRef    = useRef<ScrollView>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const isUserSwiping = useRef(false);

  const roomRefs    = useRef<Map<string, React.RefObject<RoomChatHandle | null>>>(new Map());
  const pvtRefs     = useRef<Map<string, React.RefObject<PrivateChatHandle | null>>>(new Map());

  const [pageHeight, setPageHeight] = useState(0);
  const [unreadPvt, setUnreadPvt] = useState<Set<string>>(new Set());
  const [unreadRoom, setUnreadRoom] = useState<Set<string>>(new Set());
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const blinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [blinkOn, setBlinkOn] = useState(true);

  // ── Private chat menu state ──────────────────────────────────────────────
  const [showPvtMenu, setShowPvtMenu] = useState(false);
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [showTransferCredit, setShowTransferCredit] = useState(false);
  const [transferToUser, setTransferToUser] = useState('');

  const allTabs: TabEntry[] = [
    ...openRooms.map(r => ({ kind: 'room' as const, data: r })),
    ...openPrivateChats.map(c => ({ kind: 'private' as const, data: c })),
  ];

  for (const room of openRooms) {
    if (!roomRefs.current.has(room.id)) {
      roomRefs.current.set(room.id, createRef<RoomChatHandle>());
    }
  }
  for (const id of Array.from(roomRefs.current.keys())) {
    if (!openRooms.find(r => r.id === id)) roomRefs.current.delete(id);
  }

  for (const chat of openPrivateChats) {
    if (!pvtRefs.current.has(chat.id)) {
      pvtRefs.current.set(chat.id, createRef<PrivateChatHandle>());
    }
  }
  for (const id of Array.from(pvtRefs.current.keys())) {
    if (!openPrivateChats.find(c => c.id === id)) pvtRefs.current.delete(id);
  }

  const activeIndex = allTabs.findIndex(t => t.data.id === activeTabId);
  const safeIndex   = activeIndex >= 0 ? activeIndex : 0;
  const activeTab   = allTabs[safeIndex] ?? null;

  const getActiveRoomRef = useCallback((): RoomChatHandle | null => {
    if (!activeTabId || activeTab?.kind !== 'room') return null;
    return roomRefs.current.get(activeTabId)?.current ?? null;
  }, [activeTabId, activeTab]);

  const scrollToIndex = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    tabScrollRef.current?.scrollTo({ x: Math.max(0, index * 110 - 40), animated: true });
  }, []);

  useEffect(() => {
    if (isUserSwiping.current) return;
    const idx = allTabs.findIndex(t => t.data.id === activeTabId);
    if (idx >= 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: false });
        tabScrollRef.current?.scrollTo({ x: Math.max(0, idx * 110 - 40), animated: false });
      }, 80);
    }
  }, [activeTabId, allTabs.length, visible, pageHeight, scrollToIndex]);

  useEffect(() => {
    if (unreadPvt.size === 0 && unreadRoom.size === 0) {
      if (blinkTimerRef.current) {
        clearInterval(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
      setBlinkOn(true);
      return;
    }
    if (!blinkTimerRef.current) {
      blinkTimerRef.current = setInterval(() => {
        setBlinkOn(v => !v);
      }, BLINK_INTERVAL);
    }
    return () => {
      if (blinkTimerRef.current) {
        clearInterval(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
    };
  }, [unreadPvt.size, unreadRoom.size]);

  const handleTabPress = useCallback((tabId: string) => {
    const idx = allTabs.findIndex(t => t.data.id === tabId);
    if (idx < 0) return;
    onChangeActiveTab(tabId);
    scrollToIndex(idx);
    setUnreadPvt(prev => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    setUnreadRoom(prev => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    pvtRefs.current.get(tabId)?.current?.clearUnread();
  }, [allTabs, onChangeActiveTab, scrollToIndex]);

  const handleCloseTab = useCallback((tabId: string, kind: 'room' | 'private') => {
    const idx      = allTabs.findIndex(t => t.data.id === tabId);
    const isActive = tabId === activeTabId;

    if (kind === 'room') onRemoveRoom(tabId);
    else onRemovePrivateChat(tabId);

    setUnreadPvt(prev => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    setUnreadRoom(prev => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });

    if (isActive && allTabs.length > 1) {
      const nextTab = allTabs.find((t, i) => i !== idx);
      if (nextTab) {
        setTimeout(() => {
          onChangeActiveTab(nextTab.data.id);
          const newIdx = allTabs.findIndex(t => t.data.id === nextTab.data.id);
          const adjustedIdx = newIdx > idx ? newIdx - 1 : newIdx;
          scrollToIndex(Math.max(0, adjustedIdx));
        }, 50);
      }
    }
  }, [allTabs, activeTabId, onRemoveRoom, onRemovePrivateChat, onChangeActiveTab, scrollToIndex]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    const tab = allTabs[pageIndex];
    if (tab && tab.data.id !== activeTabId) {
      isUserSwiping.current = true;
      onChangeActiveTab(tab.data.id);
      tabScrollRef.current?.scrollTo({ x: Math.max(0, pageIndex * 110 - 40), animated: true });
      setUnreadPvt(prev => {
        const next = new Set(prev);
        next.delete(tab.data.id);
        return next;
      });
      setUnreadRoom(prev => {
        if (!prev.has(tab.data.id)) return prev;
        const next = new Set(prev);
        next.delete(tab.data.id);
        return next;
      });
      pvtRefs.current.get(tab.data.id)?.current?.clearUnread();
      setTimeout(() => { isUserSwiping.current = false; }, 300);
    }
  }, [allTabs, activeTabId, onChangeActiveTab]);

  const handleNewPrivateMessage = useCallback((chatId: string) => {
    if (chatId === activeTabId) return;
    setUnreadPvt(prev => new Set([...Array.from(prev), chatId]));
    Vibration.vibrate([0, 80, 60, 100]);
  }, [activeTabId]);

  const handleNewRoomMessage = useCallback((roomId: string) => {
    if (roomId === activeTabId) return;
    setUnreadRoom(prev => {
      if (prev.has(roomId)) return prev;
      return new Set([...Array.from(prev), roomId]);
    });
  }, [activeTabId]);

  const handleIncomingFromRoom = useCallback((convId: string, peerUsername: string, peerDisplayName: string) => {
    const tabExists = openPrivateChats.some(c => c.id === convId);
    if (tabExists) {
      if (convId !== activeTabId) {
        setUnreadPvt(prev => new Set([...Array.from(prev), convId]));
        Vibration.vibrate([0, 80, 60, 100]);
      }
    } else {
      onIncomingPrivateChat(convId, peerUsername, peerDisplayName);
      setUnreadPvt(prev => new Set([...Array.from(prev), convId]));
      Vibration.vibrate([0, 80, 60, 100]);
    }
  }, [openPrivateChats, activeTabId, onIncomingPrivateChat]);

  if (allTabs.length === 0) return null;

  const headerRoom = activeTab?.kind === 'room' ? activeTab.data as Chatroom : null;
  const headerPvt  = activeTab?.kind === 'private' ? activeTab.data as PrivateChat : null;
  const isPvt      = activeTab?.kind === 'private';

  const gradientColors: [string, string, string] = isPvt
    ? ['#52D68A', '#A8EFC4', '#FFFFFF']
    : [C.headerBg, C.headerBg, C.headerBg];

  const pvtGradientStart = { x: 0, y: 0 };
  const pvtGradientEnd   = { x: 0.6, y: 1 };

  const iconColor  = isPvt ? '#1A5C35' : C.white;
  const titleColor = isPvt ? '#0F3D22' : C.white;
  const subColor   = isPvt ? 'rgba(15,61,34,0.55)' : 'rgba(255,255,255,0.65)';

  return (
    <Modal
      visible={visible && allTabs.length > 0}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onMinimize}
    >
      <SafeAreaView style={styles.root}>

        {/* ── Shared header ── */}
        <LinearGradient
          colors={gradientColors}
          start={pvtGradientStart}
          end={pvtGradientEnd}
          style={[
            styles.header,
            { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 8 },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              if (activeTab?.kind === 'private' && openRooms.length > 0) {
                const lastRoom = openRooms[openRooms.length - 1];
                handleTabPress(lastRoom.id);
              } else {
                onMinimize();
              }
            }}
            style={[styles.backBtn, isPvt && styles.backBtnPvt]}
            testID="button-back-multiroom"
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color={isPvt ? iconColor : C.white}
            />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            {headerRoom && (
              <>
                <Text style={[styles.headerTitle, { color: titleColor }]} numberOfLines={1}>{headerRoom.name}</Text>
                {headerRoom.description ? (
                  <Text style={[styles.headerSub, { color: subColor }]} numberOfLines={1}>{headerRoom.description}</Text>
                ) : null}
              </>
            )}
            {headerPvt && (
              <>
                <Text style={[styles.headerTitle, { color: titleColor }]} numberOfLines={1}>{headerPvt.peerUsername}</Text>
                <Text style={[styles.headerSub, { color: subColor }]} numberOfLines={1}>● Online</Text>
              </>
            )}
          </View>

          <View style={styles.headerIcons}>
            {activeTab?.kind === 'room' && (
              <>
                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={() => getActiveRoomRef()?.toggleParticipants()}
                  testID="button-multi-participants"
                >
                  <Ionicons name="person-outline" size={18} color={C.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={() => getActiveRoomRef()?.toggleOverflow()}
                  testID="button-multi-overflow"
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={C.white} />
                </TouchableOpacity>
              </>
            )}
            {activeTab?.kind === 'private' && (
              <TouchableOpacity
                style={styles.iconCirclePvt}
                onPress={() => setShowPvtMenu(true)}
                testID="button-pvt-more"
              >
                <View style={styles.dotsRow}>
                  <View style={[styles.dot, { backgroundColor: iconColor }]} />
                  <View style={[styles.dot, { backgroundColor: iconColor }]} />
                  <View style={[styles.dot, { backgroundColor: iconColor }]} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        {/* ── Tab bar — only shown when viewing a chatroom tab ── */}
        {activeTab?.kind !== 'private' && <View style={styles.tabBarWrapper}>
          <ScrollView
            ref={tabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBar}
            contentContainerStyle={styles.tabBarContent}
          >
            {allTabs.map((tab) => {
              const tabId    = tab.data.id;
              const isActive = tabId === activeTabId;
              const isPrivate = tab.kind === 'private';
              const pvt = tab.kind === 'private' ? tab.data as PrivateChat : null;
              const room = tab.kind === 'room' ? tab.data as Chatroom : null;
              const hasUnreadPvt  = isPrivate && unreadPvt.has(tabId);
              const hasUnreadRoom = !isPrivate && unreadRoom.has(tabId);
              const hasUnread     = hasUnreadPvt || hasUnreadRoom;
              const blinkVisible  = hasUnread ? blinkOn : true;
              const unreadColor   = hasUnreadRoom ? '#F44336' : '#FF9800';
              const unreadColorRgba = hasUnreadRoom
                ? { strong: 'rgba(244,67,54,0.85)', weak: 'rgba(244,67,54,0.2)', border: 'rgba(244,67,54,0.5)' }
                : { strong: 'rgba(255,152,0,0.85)', weak: 'rgba(255,152,0,0.2)', border: 'rgba(255,152,0,0.5)' };

              return (
                <TouchableOpacity
                  key={tabId}
                  style={[
                    styles.tab,
                    isActive && styles.tabActive,
                    isPrivate && !isActive && styles.tabPrivate,
                    hasUnread && !isActive && {
                      backgroundColor: blinkVisible ? unreadColorRgba.strong : unreadColorRgba.weak,
                      borderWidth: 1,
                      borderColor: blinkVisible ? unreadColor : unreadColorRgba.border,
                    },
                  ]}
                  onPress={() => handleTabPress(tabId)}
                  testID={`tab-${isPrivate ? 'private' : 'room'}-${tabId}`}
                  activeOpacity={0.75}
                >
                  {isPrivate ? (
                    <View
                      style={[
                        styles.tabDot,
                        {
                          backgroundColor: hasUnread
                            ? (blinkVisible ? C.pvtDot : 'transparent')
                            : C.pvtDot,
                          borderWidth: hasUnread ? 1 : 0,
                          borderColor: C.pvtDot,
                        },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.tabDot,
                        {
                          backgroundColor: hasUnreadRoom
                            ? (blinkVisible ? '#F44336' : 'transparent')
                            : room?.color,
                          borderWidth: hasUnreadRoom ? 1 : 0,
                          borderColor: '#F44336',
                        },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.tabText,
                      isActive && styles.tabTextActive,
                      hasUnread && !isActive && { color: '#FFFFFF', fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {isPrivate ? pvt!.peerUsername : room!.name}
                  </Text>
                  {/* Tab close (X) intentionally removed: users must leave a
                      room only via the in-room "Leave chat" menu so they get the
                      proper has-left broadcast and confirmation flow. Private
                      chats keep an X because there is no in-tab leave menu. */}
                  {tab.kind === 'private' && (
                    <TouchableOpacity
                      onPress={() => handleCloseTab(tabId, tab.kind)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      testID={`close-tab-${tabId}`}
                    >
                      <Ionicons
                        name="close"
                        size={13}
                        color={isActive ? C.tabTextActive : C.tabClose}
                      />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>}

        {/* ── Swipeable pages ── */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.pageScroll}
          onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        >
          {allTabs.map((tab) => {
            const tabId = tab.data.id;
            const pageStyle = pageHeight > 0
              ? { width: SCREEN_W, height: pageHeight }
              : styles.page;
            if (tab.kind === 'room') {
              const room = tab.data as Chatroom;
              const roomRef = roomRefs.current.get(tabId) as React.RefObject<RoomChatHandle | null>;
              return (
                <View key={tabId} style={pageStyle}>
                  <RoomChatModal
                    ref={roomRef}
                    visible
                    isEmbedded
                    hideHeader
                    room={room}
                    currentUserId={currentUserId}
                    onClose={onMinimize}
                    onLeaveTab={() => handleCloseTab(tabId, 'room')}
                    onOpenPrivateChat={onOpenPrivateChat}
                    onIncomingPrivateMessage={handleIncomingFromRoom}
                    onNewRoomMessage={handleNewRoomMessage}
                    onKicked={onKicked}
                  />
                </View>
              );
            } else {
              const chat = tab.data as PrivateChat;
              const pvtRef = pvtRefs.current.get(tabId) as React.RefObject<PrivateChatHandle | null>;
              return (
                <View key={tabId} style={pageStyle}>
                  <PrivateChatTab
                    ref={pvtRef}
                    conversationId={tabId}
                    peerUsername={chat.peerUsername}
                    peerDisplayName={chat.peerDisplayName}
                    color={chat.color}
                    currentUserId={currentUserId}
                    isActive={tabId === activeTabId}
                    onNewMessage={() => handleNewPrivateMessage(tabId)}
                  />
                </View>
              );
            }
          })}
        </ScrollView>

      </SafeAreaView>

      {/* ── Private Chat Menu (More) ─────────────────────────────────────── */}
      {headerPvt && (
        <Modal
          visible={showPvtMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPvtMenu(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowPvtMenu(false)}>
            <View style={styles.pvtMenuOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.pvtMenuSheet}>
                  {/* Handle bar */}
                  <View style={styles.pvtMenuHandle} />

                  {/* Header */}
                  <View style={styles.pvtMenuHeader}>
                    <View style={[styles.pvtMenuAvatar, { backgroundColor: headerPvt.color }]}>
                      <Text style={styles.pvtMenuAvatarText}>
                        {headerPvt.peerUsername.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pvtMenuName} numberOfLines={1}>
                        {headerPvt.peerUsername}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.pvtMenuDivider} />

                  {/* ── Menu items (from Android ChatFragment.getMenuOptions) ── */}

                  {/* Share profile */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setShowPvtMenu(false);
                      Alert.alert('Share profile', `Share profile ${headerPvt.peerUsername}`);
                    }}
                    testID="pvt-menu-share-profile"
                  >
                    <Ionicons name="person-circle-outline" size={22} color={C.menuIcon} />
                    <Text style={styles.pvtMenuItemText}>Share profile</Text>
                  </TouchableOpacity>

                  {/* Add people */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setShowPvtMenu(false);
                      Alert.alert('Add people', 'Buat grup baru dengan menambahkan orang lain');
                    }}
                    testID="pvt-menu-add-people"
                  >
                    <Ionicons name="person-add-outline" size={22} color={C.menuIcon} />
                    <Text style={styles.pvtMenuItemText}>Add people</Text>
                  </TouchableOpacity>

                  {/* Transfer credit */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setShowPvtMenu(false);
                      setTransferToUser(headerPvt.peerUsername);
                      setShowTransferCredit(true);
                    }}
                    testID="pvt-menu-transfer-credit"
                  >
                    <Ionicons name="card-outline" size={22} color={C.menuIcon} />
                    <Text style={styles.pvtMenuItemText}>Transfer credit</Text>
                  </TouchableOpacity>

                  {/* Report abuse */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setShowPvtMenu(false);
                      Alert.alert('Report abuse', `Laporkan ${headerPvt.peerUsername}?`, [
                        { text: 'Batal', style: 'cancel' },
                        { text: 'Laporkan', style: 'destructive', onPress: () => {} },
                      ]);
                    }}
                    testID="pvt-menu-report-abuse"
                  >
                    <Ionicons name="flag-outline" size={22} color={C.menuDanger} />
                    <Text style={[styles.pvtMenuItemText, { color: C.menuDanger }]}>Report abuse</Text>
                  </TouchableOpacity>

                  {/* Clear messages — local only, mirrors Android "Hapus pesan" */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setShowPvtMenu(false);
                      Alert.alert(
                        'Hapus pesan',
                        `Hapus semua pesan dengan ${headerPvt.peerUsername}? Pesan hanya dihapus dari tampilan kamu.`,
                        [
                          { text: 'Batal', style: 'cancel' },
                          {
                            text: 'Hapus',
                            style: 'destructive',
                            onPress: () => {
                              pvtRefs.current.get(headerPvt.id)?.current?.clearMessages();
                            },
                          },
                        ],
                      );
                    }}
                    testID="pvt-menu-clear-messages"
                  >
                    <Ionicons name="trash-outline" size={22} color={C.menuIcon} />
                    <Text style={styles.pvtMenuItemText}>Hapus pesan</Text>
                  </TouchableOpacity>

                  {/* Mute / Unmute */}
                  <TouchableOpacity
                    style={styles.pvtMenuItem}
                    onPress={() => {
                      setMutedChats(prev => {
                        const next = new Set(prev);
                        if (next.has(headerPvt.id)) next.delete(headerPvt.id);
                        else next.add(headerPvt.id);
                        return next;
                      });
                      setShowPvtMenu(false);
                    }}
                    testID="pvt-menu-mute"
                  >
                    <Ionicons
                      name={mutedChats.has(headerPvt.id) ? 'notifications-outline' : 'notifications-off-outline'}
                      size={22}
                      color={C.menuIcon}
                    />
                    <Text style={styles.pvtMenuItemText}>
                      {mutedChats.has(headerPvt.id) ? 'Unmute' : 'Mute'}
                    </Text>
                  </TouchableOpacity>

                  {/* Leave chat */}
                  <TouchableOpacity
                    style={[styles.pvtMenuItem, { marginBottom: 8 }]}
                    onPress={() => {
                      setShowPvtMenu(false);
                      Alert.alert('Leave chat', `Keluar dari chat dengan ${headerPvt.peerUsername}?`, [
                        { text: 'Batal', style: 'cancel' },
                        {
                          text: 'Keluar',
                          style: 'destructive',
                          onPress: () => onRemovePrivateChat(headerPvt.id),
                        },
                      ]);
                    }}
                    testID="pvt-menu-leave-chat"
                  >
                    <Ionicons name="exit-outline" size={22} color={C.menuDanger} />
                    <Text style={[styles.pvtMenuItemText, { color: C.menuDanger }]}>Leave chat</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* ── Transfer Credit Modal ─────────────────────────────────────────── */}
      <CreditsModal
        visible={showTransferCredit}
        onClose={() => setShowTransferCredit(false)}
        username={currentUserId}
        initialTab="transfer"
        initialToUsername={transferToUser}
      />
    </Modal>
  );
}

function makeStyles(C: Palette) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.headerBg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  backBtnPvt: {
    width: 38, height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6,
  },
  headerInfo:  { flex: 1 },
  headerTitle: { color: C.white, fontSize: 17, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  iconCircle:  {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.iconCircle,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCirclePvt: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5, height: 5, borderRadius: 2.5,
  },

  tabBarWrapper: {
    backgroundColor: C.tabBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tabBar: { height: 40 },
  tabBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    maxWidth: 150,
  },
  tabActive: {
    backgroundColor: C.tabActive,
  },
  tabPrivate: {
    backgroundColor: 'rgba(255,152,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.35)',
  },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tabText: {
    fontSize: 12,
    color: C.tabText,
    fontWeight: '500',
    flexShrink: 1,
  },
  tabTextActive: {
    color: C.tabTextActive,
    fontWeight: '700',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.unreadBadgeBg,
  },

  pageScroll: { flex: 1 },
  page: {
    width: SCREEN_W,
    flex: 1,
  },

  // ── Private chat menu (More) bottom sheet ──────────────────────────────
  pvtMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pvtMenuSheet: {
    backgroundColor: C.tabActive,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  pvtMenuHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.menuSep,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  pvtMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  pvtMenuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pvtMenuAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  pvtMenuName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.menuIcon,
  },
  pvtMenuUsername: {
    fontSize: 12,
    color: C.tabText,
    marginTop: 1,
  },
  pvtMenuDivider: {
    height: 1,
    backgroundColor: C.menuSep,
    marginBottom: 6,
  },
  pvtMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 16,
  },
  pvtMenuItemText: {
    fontSize: 15,
    color: C.menuIcon,
    fontWeight: '500',
  },
  });
}
