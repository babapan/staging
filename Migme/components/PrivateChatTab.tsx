import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import LottieView from 'lottie-react-native';
import GiftWebmFullscreen from './GiftWebmFullscreen';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE, buildHeaders as buildAuthHeaders } from '../services/auth';
import { WS_URL } from '../config/connection';
import { getUser } from '../services/storage';
import { notificationService } from '../services/notificationService';
import { playNotificationSound } from '../services/notificationSound';
import { messageQueue } from '../services/messageQueue';
import {
  useMessageStatusTracker,
  type MessageStatusEvent as MsgStatusEvent,
  type ReadReceiptEvent,
} from '../services/serverGeneratedReceivedEventPusher';
import GiftPickerModal, { type GiftItem, GIFTS } from './GiftPickerModal';
import PrivateGiftModal, { type PrivateVirtualGift } from './PrivateGiftModal';
import { lookupGiftByName, lookupGiftByEmoji, updateGiftCache } from '../services/giftCache';
import { STICKER_PACKS, UNICODE_TO_EMOTICON, parseMessageWithEmoticons } from '../constants/emoticons';
import { useAppTheme } from '../services/themeContext';
import { useFontSize } from '../services/fontSizeContext';
import ChatroomInputBar from './ChatroomInputBar';

// ── Sticker helpers — mirrors RoomChatModal sticker encode/parse/map ──────────
const STICKER_IMAGE_MAP: Record<string, ReturnType<typeof require>> = {};
for (const pack of STICKER_PACKS) {
  for (const sticker of pack.stickers) {
    STICKER_IMAGE_MAP[sticker.key] = sticker.image;
  }
}
const STICKER_PREFIX = '[[sticker:';
const STICKER_SUFFIX = ']]';
function encodeStickerText(key: string, label: string): string {
  return `${STICKER_PREFIX}${key}:${label}${STICKER_SUFFIX}`;
}
function parseStickerText(text: string): { key: string; label: string } | null {
  if (!text.startsWith(STICKER_PREFIX) || !text.endsWith(STICKER_SUFFIX)) return null;
  const inner = text.slice(STICKER_PREFIX.length, -STICKER_SUFFIX.length);
  const colonIdx = inner.indexOf(':');
  if (colonIdx === -1) return null;
  return { key: inner.slice(0, colonIdx), label: inner.slice(colonIdx + 1) };
}


// Tick colours — mirror Android ChatSyncMessageListAdapter status icon tints
const TICK_SENDING  = '#AAAAAA';
const TICK_RECEIVED = '#AAAAAA';
const TICK_READ     = '#2196F3';

// ── Emote / slash-command constants (mirrors server chatroom EMOTES) ──────────
const EMOTE_COLOR = '#800020';
type EmoteDef = { action: string; actionTarget: string; random?: 'roll' | '8ball' | 'rps' };
const EMOTES: Record<string, EmoteDef> = {
  '/roll':     { action: `%s rolls %r`,                                 actionTarget: `%s rolls %r`, random: 'roll' },
  '/brb':      { action: `%s will be right back`,                       actionTarget: `%s will be right back` },
  '/off':      { action: `%s has been off`,                             actionTarget: `%s has been off` },
  '/slap':     { action: `* %s slaps himself`,                          actionTarget: `* %s slaps %t` },
  '/hug':      { action: `* %s gives himself a hug`,                    actionTarget: `* %s hugs %t` },
  '/kiss':     { action: `* %s kisses %t`,                              actionTarget: `* %s kisses %t` },
  '/wave':     { action: `* %s waves`,                                  actionTarget: `* %s waves at %t` },
  '/dance':    { action: `* %s dances`,                                 actionTarget: `* %s dances with %t` },
  '/cry':      { action: `* %s cries`,                                  actionTarget: `* %s cries on %t's shoulder` },
  '/laugh':    { action: `* %s laughs out loud`,                        actionTarget: `* %s laughs at %t` },
  '/poke':     { action: `* %s pokes himself`,                          actionTarget: `* %s pokes %t` },
  '/punch':    { action: `* %s punches the air`,                        actionTarget: `* %s punches %t` },
  '/love':     { action: `* %s has too much love to give`,              actionTarget: `* %s loves %t` },
  '/hi':       { action: `* %s waves hi to everyone`,                   actionTarget: `* %s waves hi at %t` },
  '/clap':     { action: `* %s claps`,                                  actionTarget: `* %s claps for %t` },
  '/bow':      { action: `* %s bows`,                                   actionTarget: `* %s bows to %t` },
  '/sit':      { action: `* %s sits down`,                              actionTarget: `* %s sits next to %t` },
  '/stand':    { action: `* %s stands up`,                              actionTarget: `* %s stands next to %t` },
  '/sleep':    { action: `* %s falls asleep`,                           actionTarget: `* %s falls asleep on %t's shoulder` },
  '/yawn':     { action: `* %s yawns`,                                  actionTarget: `* %s yawns at %t` },
  '/facepalm': { action: `* %s facepalms`,                              actionTarget: `* %s facepalms at %t` },
  '/shrug':    { action: `* %s shrugs`,                                 actionTarget: `* %s shrugs at %t` },
  '/lol':      { action: `* %s LOLs`,                                   actionTarget: `* %s LOLs at %t` },
  '/think':    { action: `* %s is thinking...`,                         actionTarget: `* %s is thinking about %t` },
  '/wink':     { action: `* %s winks`,                                  actionTarget: `* %s winks at %t` },
  '/smile':    { action: `* %s smiles`,                                 actionTarget: `* %s smiles at %t` },
  '/stare':    { action: `* %s stares into the void`,                   actionTarget: `* %s stares at %t` },
  '/shake':    { action: `* %s shakes his head`,                        actionTarget: `* %s shakes %t's hand` },
  '/tackle':   { action: `* %s tackles himself`,                        actionTarget: `* %s tackles %t` },
  '/throw':    { action: `* %s throws something`,                       actionTarget: `* %s throws something at %t` },
  '/pat':      { action: `* %s pats himself on the back`,               actionTarget: `* %s pats %t on the head` },
  '/rofl':     { action: `* %s rolls on the floor laughing`,            actionTarget: `* %s rolls on the floor laughing at %t` },
  '/8ball':    { action: `* %s asks the Magic 8ball... %r`,             actionTarget: `* %s asks the Magic 8ball about %t... %r`, random: '8ball' },
  '/flip':     { action: `* %s flips a coin... It's %r!`,              actionTarget: `* %s flips a coin... It's %r!`, random: 'roll' },
  '/rps':      { action: `* %s plays rock-paper-scissors... %r!`,       actionTarget: `* %s challenges %t to rock-paper-scissors... %r!`, random: 'rps' },
};
const EIGHT_BALL_ANSWERS = ['Yep', 'OK', 'Maybe', 'No', "Don't Bother", 'Definitely', 'Ask again later', 'Not likely'];
const RPS_CHOICES = ['Rock 🪨', 'Paper 📄', 'Scissors ✂️'];
function resolveEmoteRandom(type?: 'roll' | '8ball' | 'rps'): string {
  if (type === 'roll')  return String(Math.floor(Math.random() * 6) + 1);
  if (type === '8ball') return EIGHT_BALL_ANSWERS[Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length)];
  if (type === 'rps')   return RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
  return '';
}

interface PvtMessage {
  id: string;
  senderId: string | null;
  senderUsername: string;
  text: string;
  type: string;
  createdAt: string;
  // Read receipt — mirrors FusionPktMessageStatusEvent (pkt 505) READ status
  readAt?: string | null;
  readBy?: string | null;
  // Gift fields — client-side enrichment for inline image display
  giftImageUrl?: string;
  giftEmoji?: string;
  giftName?: string;
}

function toMediaUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? `${API_BASE}${raw}` : `${API_BASE}/${raw}`;
}

// Extract emoji character(s) embedded in a gift text.
// Format: << sender [level] gives a giftName EMOJI to recipient [level]! >>
// The emoji is the non-ASCII cluster that sits between the gift name and " to ".
function extractGiftEmoji(text: string): string | null {
  const match = text.match(/gives an? [\w\s]+?\s+([^\x00-\x7F]\S*)\s+to\b/i);
  return match ? match[1] : null;
}

function enrichGiftMessage(msg: PvtMessage): PvtMessage {
  // Already fully enriched with both image and emoji
  if (msg.giftImageUrl && msg.giftEmoji) return msg;
  if (msg.type !== 'gift' && !(msg.text?.startsWith('<< ') && msg.text?.endsWith(' >>'))) return msg;

  const text = msg.text ?? '';

  // 1. Try emoji-based lookup first (works regardless of name language mismatch)
  const extractedEmoji = msg.giftEmoji ?? extractGiftEmoji(text);
  if (extractedEmoji) {
    const byEmoji = lookupGiftByEmoji(extractedEmoji);
    if (byEmoji) {
      return {
        ...msg,
        giftEmoji: extractedEmoji,
        giftImageUrl: msg.giftImageUrl ?? byEmoji.imageUrl,
        giftName: msg.giftName ?? byEmoji.name,
      };
    }
    // Cache not populated yet — store emoji so renderer can show it as fallback
    if (!msg.giftEmoji) {
      return { ...msg, giftEmoji: extractedEmoji };
    }
  }

  // 2. Fallback: name-based lookup
  const name = msg.giftName ?? (() => {
    const match = text.match(/gives an? ([\w\s]+?)(?:\s+[^\w\s]|\s+to\b)/i);
    return match ? match[1].trim() : null;
  })();
  if (!name) return msg;
  const cached = lookupGiftByName(name);
  const staticFound = GIFTS.find(g => g.name.toLowerCase() === name.toLowerCase());
  const found = cached ?? staticFound;
  if (!found) return msg;
  return {
    ...msg,
    giftEmoji: msg.giftEmoji ?? found.emoji,
    giftImageUrl: msg.giftImageUrl ?? found.imageUrl,
    giftName: msg.giftName ?? found.name,
  };
}

export interface PrivateChatHandle {
  getUnreadCount: () => number;
  clearUnread: () => void;
  /** Clear the local message list (does not delete on server). */
  clearMessages: () => void;
}

interface Props {
  conversationId: string;
  peerUsername: string;
  peerDisplayName: string;
  color: string;
  currentUserId: string | null;
  isActive: boolean;
  onNewMessage: () => void;
}

const PrivateChatTab = forwardRef<PrivateChatHandle, Props>(function PrivateChatTab(
  { conversationId, peerUsername, peerDisplayName, color, currentUserId, isActive, onNewMessage },
  ref,
) {
  const theme = useAppTheme();
  const { fs } = useFontSize();
  const [messages, setMessages]       = useState<PvtMessage[]>([]);
  const [inputText, setInputText]     = useState('');
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [showPicker, setShowPicker]               = useState(false);
  const [pickerEmoticonOnly, setPickerEmoticonOnly] = useState(false);
  const [showPrivateGiftModal, setShowPrivateGiftModal] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);

  // ─── Gift splash animation ───────────────────────────────────────────────────
  type GiftSplashData = {
    videoUrl?: string | null;
    lottieUrl?: string | null;
    imageUrl?: string | null;
    emoji: string;
    giftName?: string;
    isLuxury?: boolean;
  };
  const [giftSplash,       setGiftSplash]       = useState<GiftSplashData | null>(null);
  const splashScale   = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(0)).current;

  const triggerGiftSplash = useCallback((anim: GiftSplashData) => {
    splashScale.setValue(0.3);
    splashOpacity.setValue(0);
    setGiftSplash(anim);
    const holdMs = anim.isLuxury ? 9000 : 2400;
    const fadeMs = anim.isLuxury ? 600  : 350;
    Animated.sequence([
      Animated.parallel([
        Animated.spring(splashScale,   { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
        Animated.timing(splashOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(holdMs),
      Animated.timing(splashOpacity, { toValue: 0, duration: fadeMs, useNativeDriver: true }),
    ]).start(() => setGiftSplash(null));
  }, [splashScale, splashOpacity]);
  const [creditCurrency, setCreditCurrency] = useState('IDR');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Per-message delivery status tracker — mirrors ServerGeneratedReceivedEventPusher.java
  const tracker = useMessageStatusTracker(conversationId);
  const unreadRef                     = useRef(0);
  const flatListRef                   = useRef<FlatList>(null);
  const inputRef                      = useRef<TextInput>(null);
  const inputTextRef                  = useRef('');
  const wsRef                         = useRef<WebSocket | null>(null);
  const isActiveRef                   = useRef(false);
  const myUsernameRef                 = useRef('');
  const myLevelRef                    = useRef(1);
  const peerLevelRef                  = useRef(1);
  const suppressKbHide                = useRef(false);
  const kbHideTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      suppressKbHide.current = false;
      if (kbHideTimer.current) { clearTimeout(kbHideTimer.current); kbHideTimer.current = null; }
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (suppressKbHide.current) { suppressKbHide.current = false; return; }
      kbHideTimer.current = setTimeout(() => { kbHideTimer.current = null; setKeyboardHeight(0); }, 350);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (kbHideTimer.current) clearTimeout(kbHideTimer.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getUnreadCount: () => unreadRef.current,
    clearUnread: () => { unreadRef.current = 0; },
    clearMessages: () => {
      setMessages([]);
      unreadRef.current = 0;
    },
  }));

  // Scroll is handled via onContentSizeChange on the FlatList — no useEffect needed.

  const buildHeaders = useCallback(async (json = false) => {
    const extra: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
    return buildAuthHeaders(extra);
  }, []);

  const fetchCreditBalance = useCallback(async () => {
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/credit/balance`, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        setCreditBalance(data.balance ?? 0);
        setCreditCurrency(data.currency ?? 'IDR');
      }
    } catch {}
  }, [buildHeaders]);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await buildHeaders();
      const res = await fetch(
        `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
        { credentials: 'include', headers },
      );
      if (res.ok) {
        const data = await res.json();
        const loaded: PvtMessage[] = (data.messages ?? []).map((m: PvtMessage) =>
          enrichGiftMessage(m.type === 'emote' ? { ...m, senderUsername: '' } : m)
        );
        setMessages(loaded);
        tracker.seedFromMessages(loaded);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch {}
    finally { setLoading(false); }
  }, [conversationId, buildHeaders, tracker.seedFromMessages]);

  const markConversationRead = useCallback(async () => {
    try {
      const headers = await buildHeaders(true);
      await fetch(
        `${API_BASE}/api/chatsync/conversations/${conversationId}/read`,
        { method: 'POST', credentials: 'include', headers },
      );
    } catch {}
  }, [conversationId, buildHeaders]);

  const connectWS = useCallback(async () => {
    if (!isActiveRef.current) return;
    let storedUser: Awaited<ReturnType<typeof getUser>>;
    try { storedUser = await getUser(); } catch { storedUser = null; }
    if (!storedUser || !isActiveRef.current) return;

    myUsernameRef.current = storedUser.username;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      if (!isActiveRef.current) return;
      try {
        const payload = JSON.parse(e.data as string);
        if (payload.type === 'WELCOME') {
          ws.send(JSON.stringify({
            type: 'AUTH',
            sessionUserId: storedUser!.id,
            username: storedUser!.username,
          }));
          return;
        }
        if (payload.type === 'CHAT_MESSAGE' && payload.conversationId === conversationId) {
          const raw = payload.message as PvtMessage;
          const normalized = raw.type === 'emote' ? { ...raw, senderUsername: '' } : raw;
          const msg = enrichGiftMessage(normalized);
          setMessages(prev => {
            const exists = prev.find(m => m.id === msg.id);
            if (exists) return prev;
            return [...prev, msg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          if (msg.senderId !== storedUser?.id) {
            // Play alert sound on every incoming PM (when alert sound is enabled)
            playNotificationSound().catch(() => {});
          }
          if (!isActive) {
            unreadRef.current += 1;
            onNewMessage();
            Vibration.vibrate([0, 80, 60, 80]);
            if (msg.senderId !== storedUser?.id) {
              notificationService.showMessageNotification({
                senderName:     msg.senderUsername,
                text:           msg.text,
                conversationId,
                isRoom:         false,
              }).catch(() => {});
            }
          } else {
            markConversationRead();
          }
        }
        if (payload.type === 'MESSAGE_STATUS' && payload.conversationId === conversationId) {
          tracker.handleMessageStatus(payload as MsgStatusEvent);
        }
        if (payload.type === 'READ_RECEIPT' && payload.conversationId === conversationId) {
          tracker.handleReadReceipt(payload as ReadReceiptEvent);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (isActiveRef.current) {
        setTimeout(() => { if (isActiveRef.current) connectWS(); }, 3000);
      }
    };
  }, [conversationId, isActive, onNewMessage]);

  // Prefetch gift list from API to populate image cache for gift message rendering
  useEffect(() => {
    fetch(`${API_BASE}/api/store/gifts`)
      .then(r => r.json())
      .then(data => {
        const apiGifts: any[] = data.gifts ?? [];
        if (apiGifts.length > 0) {
          updateGiftCache(apiGifts.map((g: any) => ({
            name: g.name ?? '',
            emoji: g.hotKey ?? '🎁',
            imageUrl: g.location64x64Png ?? undefined,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch real user levels for both sender and peer so gift messages show correct [level]
  useEffect(() => {
    getUser().then(u => {
      if (!u) return;
      fetch(`${API_BASE}/api/reputation/${encodeURIComponent(u.username)}/level`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.level) myLevelRef.current = d.level; })
        .catch(() => {});
    });
    fetch(`${API_BASE}/api/reputation/${encodeURIComponent(peerUsername)}/level`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.level) peerLevelRef.current = d.level; })
      .catch(() => {});
  }, [peerUsername]);

  useEffect(() => {
    isActiveRef.current = true;
    loadMessages();
    connectWS();
    fetchCreditBalance();
    return () => {
      isActiveRef.current = false;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);


  // Mark conversation as read whenever this tab becomes the active one
  useEffect(() => {
    if (isActive) {
      markConversationRead();
      unreadRef.current = 0;
    }
  }, [isActive, markConversationRead]);

  // ─── Send Gift ───────────────────────────────────────────────────────────────
  const sendGift = useCallback(async (gift: GiftItem, anim?: { videoUrl?: string | null; lottieUrl?: string | null; imageUrl?: string | null; emoji: string; giftName?: string; isLuxury?: boolean }) => {
    const senderName = myUsernameRef.current || peerUsername;
    const senderLevel = myLevelRef.current;
    const recipLevel  = peerLevelRef.current;
    const article = /^[aeiou]/i.test(gift.name) ? 'an' : 'a';
    const text = `<< ${senderName} [${senderLevel}] gives ${article} ${gift.name} ${gift.emoji} to ${peerDisplayName} [${recipLevel}]! >>`;
    const tempId = `__temp_gift_${Date.now()}`;
    const optimistic: PvtMessage = {
      id: tempId,
      senderId: currentUserId,
      senderUsername: senderName,
      text,
      type: 'gift',
      createdAt: new Date().toISOString(),
      giftEmoji: gift.emoji,
      giftImageUrl: gift.imageUrl,
      giftName: gift.name,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const headers = await buildHeaders(true);

      // Parse numeric gift ID (API gifts have integer IDs, static gifts use "g1" etc.)
      const numericId = parseInt(gift.id, 10);
      const giftIdPayload = !isNaN(numericId) ? { giftId: numericId } : {};

      // Step 1: Validate credit and deduct — MUST succeed before saving message
      const giftRes = await fetch(`${API_BASE}/api/gifts/send`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          recipientUsername: peerUsername,
          giftName: gift.name,
          giftEmoji: gift.emoji,
          ...giftIdPayload,
        }),
      });

      if (!giftRes.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        const errData = await giftRes.json().catch(() => ({}));
        const errMsg = errData.message ?? 'Gagal mengirim gift. Coba lagi.';
        Alert.alert('Kirim Gift Gagal', errMsg);
        return;
      }

      const giftData = await giftRes.json();
      if (typeof giftData.newBalance === 'number') {
        setCreditBalance(giftData.newBalance);
      }

      // Show gift splash animation after successful send
      if (anim) {
        triggerGiftSplash(anim);
      }


      // Step 2: Save chat message only after successful credit deduction
      const msgRes = await fetch(
        `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ text, type: 'gift' }),
        },
      );

      if (msgRes.ok) {
        const data = await msgRes.json();
        const sm: PvtMessage = {
          ...data.message as PvtMessage,
          giftEmoji: gift.emoji,
          giftImageUrl: gift.imageUrl,
          giftName: gift.name,
        };
        setMessages(prev => {
          const hasReal = prev.some(m => m.id === sm.id);
          if (hasReal) return prev.filter(m => m.id !== tempId);
          const hasTemp = prev.some(m => m.id === tempId);
          if (hasTemp) return prev.map(m => m.id === tempId ? sm : m);
          return [...prev, sm];
        });
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  }, [conversationId, buildHeaders, currentUserId, peerUsername, peerDisplayName]);

  // ─── Send Sticker ────────────────────────────────────────────────────────────
  const sendSticker = useCallback(async (key: string, label: string) => {
    const text = encodeStickerText(key, label);
    const tempId = `__temp_sticker_${Date.now()}`;
    const optimistic: PvtMessage = {
      id: tempId,
      senderId: currentUserId,
      senderUsername: myUsernameRef.current,
      text,
      type: 'sticker',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    let serverMsg: PvtMessage | null = null;
    try {
      const headers = await buildHeaders(true);
      const res = await fetch(
        `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ text, type: 'sticker' }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        serverMsg = data.message as PvtMessage;
      }
    } catch {}

    if (serverMsg) {
      const sm = serverMsg;
      setMessages(prev => {
        const hasReal = prev.some(m => m.id === sm.id);
        if (hasReal) return prev.filter(m => m.id !== tempId);
        const hasTemp = prev.some(m => m.id === tempId);
        if (hasTemp) return prev.map(m => m.id === tempId ? sm : m);
        return [...prev, sm];
      });
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  }, [conversationId, buildHeaders, currentUserId]);

  // ─── Send Message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputTextRef.current.trim();
    if (!text || sending) return;

    // ── Emote / slash-command interceptor ────────────────────────────────────
    if (text.startsWith('/')) {
      const tokens = text.split(/\s+/);
      const cmd = (tokens[0] ?? '').toLowerCase();
      const explicitTarget = tokens[1] ?? '';
      const s = myUsernameRef.current || 'me';
      // In private chat: default target is peerUsername (always has someone to emote to)
      const t = explicitTarget || peerUsername;

      // /me [action]
      if (cmd === '/me') {
        const rest = tokens.slice(1).join(' ');
        if (!rest) {
          setInputText('');
          inputTextRef.current = '';
          return;
        }
        const emoteText = `* ${s} ${rest}`;
        setInputText('');
        inputTextRef.current = '';
        const tempId = `__temp_emote_${Date.now()}`;
        const optimistic: PvtMessage = {
          id: tempId, senderId: currentUserId,
          senderUsername: '', text: emoteText,
          type: 'emote', createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        try {
          const headers = await buildHeaders(true);
          const res = await fetch(
            `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
            { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ text: emoteText, type: 'emote' }) },
          );
          if (res.ok) {
            const data = await res.json();
            const sm = data.message as PvtMessage;
            setMessages(prev => {
              if (prev.some(m => m.id === sm.id)) return prev.filter(m => m.id !== tempId);
              return prev.map(m => m.id === tempId ? { ...sm, senderUsername: '', type: 'emote' } : m);
            });
          } else {
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }
        } catch {
          setMessages(prev => prev.filter(m => m.id !== tempId));
        }
        return;
      }

      const emoteDef = EMOTES[cmd];
      if (emoteDef) {
        const rndVal = resolveEmoteRandom(emoteDef.random);
        const template = emoteDef.actionTarget;
        const emoteText = template.replace(/%s/g, s).replace(/%t/g, t).replace(/%r/g, rndVal);
        setInputText('');
        inputTextRef.current = '';
        const tempId = `__temp_emote_${Date.now()}`;
        const optimistic: PvtMessage = {
          id: tempId, senderId: currentUserId,
          senderUsername: '', text: emoteText,
          type: 'emote', createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        try {
          const headers = await buildHeaders(true);
          const res = await fetch(
            `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
            { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ text: emoteText, type: 'emote' }) },
          );
          if (res.ok) {
            const data = await res.json();
            const sm = data.message as PvtMessage;
            setMessages(prev => {
              if (prev.some(m => m.id === sm.id)) return prev.filter(m => m.id !== tempId);
              return prev.map(m => m.id === tempId ? { ...sm, senderUsername: '', type: 'emote' } : m);
            });
          } else {
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }
        } catch {
          setMessages(prev => prev.filter(m => m.id !== tempId));
        }
        return;
      }
    }
    // ── End emote interceptor ─────────────────────────────────────────────────

    if (text.toLowerCase().startsWith('/gift')) {
      const args = text.slice(5).trim();

      // Support both "/gift {giftname}" and "/gift {username} {giftname}"
      // If first word matches peer username (or any non-gift word), skip it.
      const findGift = (query: string): GiftItem | null => {
        const q = query.toLowerCase();
        // Try cache first (English names from server API)
        const fromCache = lookupGiftByName(q);
        if (fromCache) {
          const base = GIFTS.find(g => g.emoji === fromCache.emoji) ??
            { id: q, name: q, emoji: fromCache.emoji ?? '🎁', coins: 0, currency: 'IDR', category: 'Populer' };
          return { ...base, imageUrl: fromCache.imageUrl, name: fromCache.name, emoji: fromCache.emoji };
        }
        // Try static GIFTS list (Indonesian names)
        const byName = GIFTS.find(g =>
          g.name.toLowerCase() === q ||
          g.id === q ||
          g.emoji === q,
        );
        if (byName) {
          // Enrich with CDN imageUrl from cache using emoji
          const byEmoji = lookupGiftByEmoji(byName.emoji);
          return byEmoji?.imageUrl ? { ...byName, imageUrl: byEmoji.imageUrl } : byName;
        }
        return null;
      };

      // Try full args as gift name first, then skip first word (username)
      const words = args.split(/\s+/);
      let resolvedGift: GiftItem | null = findGift(args);
      if (!resolvedGift && words.length >= 2) {
        // Skip first word (likely a username) and try the rest as gift name
        resolvedGift = findGift(words.slice(1).join(' '));
      }
      // Fallback to GIFTS[0] if nothing found
      const baseGift = resolvedGift ?? (() => {
        const byEmoji = lookupGiftByEmoji(GIFTS[0].emoji);
        return byEmoji?.imageUrl ? { ...GIFTS[0], imageUrl: byEmoji.imageUrl } : GIFTS[0];
      })();

      setInputText('');
      inputTextRef.current = '';
      setTimeout(() => inputRef.current?.focus(), 50);
      sendGift(baseGift);
      return;
    }

    setInputText('');
    inputTextRef.current = '';
    setSending(true);

    const tempId = `__temp_${Date.now()}`;
    const optimistic: PvtMessage = {
      id: tempId,
      senderId: currentUserId,
      senderUsername: myUsernameRef.current,
      text,
      type: 'text',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    let serverMsg: PvtMessage | null = null;
    try {
      const headers = await buildHeaders(true);
      const res = await fetch(
        `${API_BASE}/api/chatsync/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ text, type: 'text' }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        serverMsg = data.message as PvtMessage;
      }
    } catch {}

    if (serverMsg) {
      setMessages(prev => {
        const hasReal = prev.some(m => m.id === serverMsg!.id);
        if (hasReal) return prev.filter(m => m.id !== tempId);
        const hasTemp = prev.some(m => m.id === tempId);
        if (hasTemp) return prev.map(m => m.id === tempId ? serverMsg! : m);
        return [...prev, serverMsg!];
      });
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }

    setSending(false);
  }, [inputText, sending, conversationId, buildHeaders, currentUserId, sendGift, peerUsername]);

  const renderMessage = useCallback(({ item }: { item: PvtMessage }) => {
    const isOwn = item.senderId === currentUserId;
    const isSystem = item.type === 'system';

    if (isSystem) {
      const systemSegments = parseMessageWithEmoticons(item.text ?? '');
      return (
        <View style={styles.systemRow}>
          <Text style={[styles.systemText, { color: theme.textSecondary, fontSize: fs(12) }]}>
            {systemSegments.map((seg, i) =>
              seg.type === 'text' ? (
                <Text key={i}>{seg.content}</Text>
              ) : (
                <Image key={i} source={seg.image as any} style={styles.inlineEmote} resizeMode="contain" />
              )
            )}
          </Text>
        </View>
      );
    }

    // Emote message — mirrors chatroom emote rendering (maroon color, centered, no username)
    const isEmote = item.type === 'emote' || (item.senderUsername === '' && item.type !== 'system');
    if (isEmote) {
      return (
        <View style={styles.emoteRow} testID={`msg-emote-pvt-${item.id}`}>
          <Text style={[styles.emoteText, { fontSize: fs(13) }]}>{item.text}</Text>
        </View>
      );
    }

    // Sticker message
    const stickerData = parseStickerText(item.text ?? '');
    if (stickerData || item.type === 'sticker') {
      const sd = stickerData ?? { key: '', label: item.text ?? '' };
      const stickerImg = STICKER_IMAGE_MAP[sd.key];
      return (
        <View
          style={[styles.stickerMsgRow, isOwn && styles.stickerMsgRowOwn]}
          testID={`msg-sticker-pvt-${item.id}`}
        >
          {!isOwn && (
            <View style={[styles.stickerAvatar, { backgroundColor: color }]}>
              <Text style={styles.stickerAvatarText}>
                {(item.senderUsername ?? '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[
            styles.stickerMsgBubble,
            { backgroundColor: theme.inputBg },
            isOwn && { backgroundColor: theme.accentSoft, borderTopLeftRadius: 12, borderTopRightRadius: 2 },
          ]}>
            {!isOwn && (
              <Text style={[styles.stickerSenderName, { color }]} numberOfLines={1}>
                {item.senderUsername}
              </Text>
            )}
            {stickerImg ? (
              <Image source={stickerImg} style={[styles.stickerMsgImg, { backgroundColor: theme.border }]} resizeMode="contain" />
            ) : (
              <Text style={[styles.stickerFallback, { color: theme.textSecondary }]}>✨ {sd.label}</Text>
            )}
            <Text style={[styles.stickerMsgLabel, { color: theme.textSecondary }]}>{sd.label}</Text>
          </View>
        </View>
      );
    }

    // Gift message — sticker-style: big image, "x N" counter, no bubble/text
    const enriched = enrichGiftMessage(item);
    const isGift = enriched.type === 'gift' || (enriched.text?.startsWith('<< ') && enriched.text?.endsWith(' >>'));
    if (isGift) {
      const giftImgUrl = toMediaUrl(enriched.giftImageUrl);
      // Parse qty from name e.g. "3x rose" → qty=3, displayName="rose"
      const nameRaw = enriched.giftName ?? '';
      const qtyMatch = nameRaw.match(/^(\d+)x\s+(.+)$/i);
      const giftQty  = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      return (
        <View style={[styles.giftVisualRow, isOwn && styles.giftVisualRowOwn]} testID={`msg-gift-pvt-${enriched.id}`}>
          {!isOwn && (
            <View style={[styles.stickerAvatar, { backgroundColor: color }]}>
              <Text style={styles.stickerAvatarText}>
                {peerUsername.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.giftVisualWrap}>
            {giftImgUrl ? (
              <Image source={{ uri: giftImgUrl }} style={styles.giftVisualImg} resizeMode="contain" />
            ) : (
              <Text style={styles.giftVisualEmoji}>{enriched.giftEmoji ?? '🎁'}</Text>
            )}
            <Text style={styles.giftVisualQty}>x {giftQty}</Text>
          </View>
        </View>
      );
    }

    const bodySegments = parseMessageWithEmoticons(item.text ?? '');

    return (
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        {!isOwn && (
          <View style={[styles.bubbleAvatar, { backgroundColor: color }]}>
            <Text style={styles.bubbleAvatarText}>
              {peerUsername.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          isOwn
            ? [styles.bubbleOwn, { backgroundColor: theme.isDark ? theme.accentSoft : '#DCF8C6' }]
            : [styles.bubbleTheir, { backgroundColor: theme.cardBg }],
        ]}>
          {!isOwn && (
            <Text style={[styles.bubbleSender, { color }]}>{peerUsername}</Text>
          )}
          <Text style={[styles.bubbleText, { color: theme.textPrimary, fontSize: fs(14) }]}>
            {bodySegments.map((seg, i) =>
              seg.type === 'text' ? (
                <Text key={i}>{seg.content}</Text>
              ) : (
                <Image key={i} source={seg.image as any} style={styles.inlineEmote} resizeMode="contain" />
              )
            )}
          </Text>
          <View style={styles.bubbleTsRow}>
            <Text style={[styles.bubbleTs, { color: theme.textSecondary }]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isOwn && (() => {
              const tick = tracker.getTickForMessage(item.id);
              const tickColor =
                tick.colorKey === 'read'     ? TICK_READ     :
                tick.colorKey === 'received' ? TICK_RECEIVED :
                                               TICK_SENDING;
              return (
                <Text
                  style={[styles.tickText, { color: tickColor }]}
                  testID={`tick-${item.id}`}
                >
                  {tick.symbol}
                </Text>
              );
            })()}
          </View>
        </View>
      </View>
    );
  }, [currentUserId, color, peerUsername, tracker, theme, fs]);

  return (
    <View style={[styles.root, { backgroundColor: theme.screenBg }, Platform.OS === 'android' ? { paddingBottom: keyboardHeight } : undefined]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={color} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textPrimary }]}>Belum ada pesan</Text>
              <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>Kirim pesan pertama ke {peerUsername}!</Text>
            </View>
          }
        />
      )}

      <ChatroomInputBar
        inputRef={inputRef}
        inputText={inputText}
        inputTextRef={inputTextRef}
        onChangeInputText={setInputText}
        onOpenPicker={() => setShowPrivateGiftModal(true)}
        onOpenEmoticon={() => { setPickerEmoticonOnly(true); setShowPicker(true); }}
        onSendMessage={sendMessage}
      />

      {/* ── Private Gift Modal (dark party-style, no Lucky) ── */}
      <PrivateGiftModal
        visible={showPrivateGiftModal}
        onClose={() => setShowPrivateGiftModal(false)}
        currentUsername={myUsernameRef.current ?? ''}
        recipientName={peerDisplayName}
        onSendGift={(pvGift: PrivateVirtualGift, qty: number) => {
          setShowPrivateGiftModal(false);
          const totalCoins = pvGift.price * qty;
          const giftItem: GiftItem = {
            id:       String(pvGift.id),
            name:     qty > 1 ? `${qty}x ${pvGift.name}` : pvGift.name,
            emoji:    pvGift.hotKey ?? '🎁',
            imageUrl: pvGift.imageUrl ?? undefined,
            coins:    totalCoins,
            currency: 'IDR',
            category: pvGift.category ?? 'Populer',
          };
          const anim = {
            videoUrl:  pvGift.videoUrl  ?? null,
            lottieUrl: pvGift.lottieUrl ?? null,
            imageUrl:  pvGift.imageUrl  ?? null,
            emoji:     pvGift.hotKey    ?? '🎁',
            giftName:  pvGift.name,
            isLuxury:  (pvGift.category ?? '').toLowerCase() === 'luxury',
          };
          sendGift(giftItem, anim);
        }}
      />

      {/* ── Emoticon / Sticker picker (unchanged) ── */}
      <GiftPickerModal
        visible={showPicker}
        emoticonOnly={pickerEmoticonOnly}
        onClose={() => setShowPicker(false)}
        onSelectEmoticon={(unicode) => {
          const emoticon = UNICODE_TO_EMOTICON[unicode];
          const token = emoticon ? `:${emoticon.key}:` : unicode;
          setInputText(prev => {
            const next = prev + token;
            inputTextRef.current = next;
            return next;
          });
          setShowPicker(false);
        }}
        onSelectGift={(gift: GiftItem) => {
          setShowPicker(false);
          sendGift(gift);
        }}
        onSelectSticker={(stickerKey, label) => {
          setShowPicker(false);
          sendSticker(stickerKey, label);
        }}
        creditAmount={creditBalance}
        currency={creditCurrency}
        recipientName={peerDisplayName}
      />

      {/* ── Gift splash animation overlay ── */}
      {giftSplash && (() => {
        const isLux = !!giftSplash.isLuxury;
        const contentSize = Math.round(Math.min(320, 320));
        return (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isLux ? 'rgba(0,0,0,0.55)' : 'transparent',
              opacity: splashOpacity,
              transform: [{ scale: splashScale }],
            }}
          >
            {giftSplash.videoUrl ? (
              <GiftWebmFullscreen
                uri={giftSplash.videoUrl}
                onFinish={() => setGiftSplash(null)}
              />
            ) : giftSplash.lottieUrl ? (
              <LottieView
                source={{ uri: giftSplash.lottieUrl! }}
                autoPlay
                loop={false}
                style={{ width: isLux ? contentSize : 200, height: isLux ? contentSize : 200 }}
              />
            ) : giftSplash.imageUrl ? (
              <Image
                source={{ uri: giftSplash.imageUrl }}
                style={{ width: isLux ? contentSize : 220, height: isLux ? contentSize : 220 }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ fontSize: isLux ? 140 : 110, textAlign: 'center' }}>
                {giftSplash.emoji}
              </Text>
            )}
            {!!giftSplash.giftName && !giftSplash.videoUrl && (
              <Text style={{
                marginTop: 16,
                color: '#FFD700', fontWeight: '900',
                fontSize: isLux ? 26 : 16,
                letterSpacing: 1, textAlign: 'center',
                textShadowColor: 'rgba(0,0,0,0.9)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 8,
              }}>
                {giftSplash.giftName}
              </Text>
            )}
          </Animated.View>
        );
      })()}
    </View>
  );
});

export default PrivateChatTab;

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubText: { fontSize: 13, textAlign: 'center' },

  systemRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  systemText: {
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },

  emoteRow: {
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  emoteText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: EMOTE_COLOR,
    textAlign: 'center',
  },

  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
    gap: 6,
  },
  bubbleRowOwn: {
    flexDirection: 'row-reverse',
  },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubbleAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleTheir: {
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inlineEmote: {
    width: 18,
    height: 18,
    marginHorizontal: 1,
  },
  bubbleTsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 3,
  },
  bubbleTs: {
    fontSize: 10,
  },
  tickText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Gift bubble ──────────────────────────────────────────────────────────
  giftMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 10,
    marginBottom: 6,
    gap: 8,
  },
  giftMsgInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    gap: 4,
  },
  giftMsgInlineImg: {
    width: 64,
    height: 64,
  },
  giftMsgIcon: {
    fontSize: 20,
  },
  giftMsgText: {
    flex: 1,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  giftMsgTextInline: {
    flexShrink: 1,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Gift visual (sticker-style, no bubble) ────────────────────────────────
  giftVisualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginHorizontal: 40,
    marginBottom: 10,
    gap: 6,
  },
  giftVisualRowOwn: {
    flexDirection: 'row-reverse',
  },
  giftVisualWrap: {
    alignItems: 'center',
    position: 'relative',
  },
  giftVisualImg: {
    width: 130,
    height: 130,
  },
  giftVisualEmoji: {
    fontSize: 80,
    lineHeight: 90,
  },
  giftVisualQty: {
    position: 'absolute',
    bottom: -4,
    right: -8,
    color: '#7C3AED',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Sticker bubble ───────────────────────────────────────────────────────
  stickerMsgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 10,
    marginBottom: 6,
    gap: 6,
  },
  stickerMsgRowOwn: {
    flexDirection: 'row-reverse',
  },
  stickerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stickerAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stickerMsgBubble: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderTopLeftRadius: 2,
    padding: 6,
    maxWidth: '75%',
  },
  stickerSenderName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  stickerMsgImg: {
    width: 160,
    height: 96,
    borderRadius: 8,
  },
  stickerMsgLabel: {
    fontSize: 10,
    marginTop: 3,
    alignSelf: 'center',
  },
  stickerFallback: {
    fontSize: 14,
    paddingVertical: 4,
  },

});
