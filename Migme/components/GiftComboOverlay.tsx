/**
 * GiftComboOverlay.tsx
 *
 * Floating gift combo banner + tap button for Solo Live modals.
 *
 * Banner:      slides in from left, position top ~38%, left side.
 * Tap button:  appears at bottom ~30% right side. Gated by `tapVisible` state.
 *              Animation starts in useEffect AFTER render (view exists + has size).
 *              Uses useNativeDriver: false so no native-thread / mount-timing race.
 *
 * Tap button hides together with banner after 2.5 s idle (no tapping).
 * Lucky gifts: combo xN shown below tap button.
 * Other gifts: combo xN shown inside banner.
 */

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import {
  Animated, Dimensions, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { API_BASE, buildHeaders } from '../services/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_W = Math.round(SCREEN_W * 0.5);

const PINK   = '#FF6B9D';
const YELLOW = '#FFCA28';
const GOLD   = '#FFB300';

export interface GiftComboInfo {
  streamId:          string;
  giftId:            string;
  giftName:          string;
  giftEmoji:         string;
  giftImageUrl?:     string | null;
  price:             number;
  senderDisplayName: string;
  senderAvatarUrl?:  string | null;
  canTap:            boolean;
  category?:         string;
  initialCombo?:     number;
}

export interface GiftComboHandle {
  show(info: GiftComboInfo): void;
  addCombo(): void;
  hide(): void;
}

const GiftComboOverlay = forwardRef<GiftComboHandle>(function GiftComboOverlay(_, ref) {
  const [renderInfo,  setRenderInfo]  = useState<GiftComboInfo | null>(null);
  const [renderCombo, setRenderCombo] = useState(1);
  const [tapVisible,  setTapVisible]  = useState(false);

  const infoRef      = useRef<GiftComboInfo | null>(null);
  const comboRef     = useRef(1);
  const isShowingRef = useRef(false);

  // ── Banner animations (native driver OK — view always visible when animated)
  const slideX   = useRef(new Animated.Value(-BANNER_W - 20)).current;
  const bannerOp = useRef(new Animated.Value(0)).current;

  // ── Tap button animations (JS driver — avoids native-thread timing race)
  const tapOp      = useRef(new Animated.Value(0)).current;
  const tapScale   = useRef(new Animated.Value(0.6)).current;

  // ── Combo bounce (JS driver, shared between banner & tap)
  const comboScale = useRef(new Animated.Value(1)).current;

  // ── Press feedback (native driver fine — Pressable is always mounted)
  const pressScale = useRef(new Animated.Value(1)).current;

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  // ── Hide everything ──────────────────────────────────────────────────────
  const hideAll = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideX,   { toValue: -BANNER_W - 20, duration: 260, useNativeDriver: true }),
      Animated.timing(bannerOp, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(tapOp,    { toValue: 0, duration: 200, useNativeDriver: false }),
      Animated.timing(tapScale, { toValue: 0.6, duration: 200, useNativeDriver: false }),
    ]).start(() => {
      isShowingRef.current = false;
      infoRef.current      = null;
      comboRef.current     = 1;
      setRenderInfo(null);
      setRenderCombo(1);
      setTapVisible(false);
    });
  }, [slideX, bannerOp, tapOp, tapScale]);

  // ── Reset idle timer ─────────────────────────────────────────────────────
  const resetTimer = useCallback((ms: number) => {
    clearTimer();
    hideTimer.current = setTimeout(hideAll, ms);
  }, [hideAll]);

  // ── Combo bounce ─────────────────────────────────────────────────────────
  const bumpCombo = useCallback(() => {
    comboRef.current += 1;
    setRenderCombo(comboRef.current);
    Animated.sequence([
      Animated.timing(comboScale, { toValue: 1.5, duration: 80, useNativeDriver: false }),
      Animated.spring(comboScale,  { toValue: 1,   useNativeDriver: false, friction: 4 }),
    ]).start();
  }, [comboScale]);

  // ── Slide banner in ───────────────────────────────────────────────────────
  const slideIn = useCallback(() => {
    slideX.setValue(-BANNER_W - 20);
    bannerOp.setValue(0);
    Animated.parallel([
      Animated.spring(slideX,   { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.timing(bannerOp, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [slideX, bannerOp]);

  // ── useEffect: animate tap button IN after it mounts (tapVisible=true) ───
  useEffect(() => {
    if (!tapVisible) return;
    tapOp.setValue(0);
    tapScale.setValue(0.6);
    Animated.parallel([
      Animated.timing(tapOp,    { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.spring(tapScale, { toValue: 1, useNativeDriver: false, friction: 5, tension: 80 }),
    ]).start();
  }, [tapVisible]);   // fires after render when tapVisible becomes true

  // ── Public API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    show(info: GiftComboInfo) {
      clearTimer();
      const startCombo     = Math.max(1, info.initialCombo ?? 1);
      infoRef.current      = info;
      comboRef.current     = startCombo;
      isShowingRef.current = true;
      setRenderInfo(info);
      setRenderCombo(startCombo);
      slideIn();

      if (info.canTap) {
        setTapVisible(true);   // useEffect will animate it in after render
        resetTimer(2500);
      } else {
        setTapVisible(false);
        resetTimer(4000);
      }
    },

    addCombo() {
      if (!isShowingRef.current) return;
      clearTimer();
      bumpCombo();
      resetTimer(infoRef.current?.canTap ? 2500 : 4000);
    },

    hide() {
      clearTimer();
      hideAll();
    },
  }), [slideIn, resetTimer, hideAll, bumpCombo]);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleTap = useCallback(async () => {
    const info = infoRef.current;
    if (!info?.canTap || !isShowingRef.current) return;
    bumpCombo();
    resetTimer(2500);

    try {
      const headers = await buildHeaders();
      fetch(`${API_BASE}/api/live/streams/${info.streamId}/gift`, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          giftName:    info.giftName,
          amountCoins: info.price,
          giftId:      info.giftId,
          qty:         1,
          isSelfGift:  false,
        }),
      }).catch(() => {});
    } catch { }
  }, [bumpCombo, resetTimer]);

  const onPressIn  = () => Animated.spring(pressScale, { toValue: 0.85, useNativeDriver: true, friction: 6 }).start();
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, friction: 6 }).start();

  return (
    <View style={s.overlay} pointerEvents="box-none">

      {/* ── Banner ── */}
      {renderInfo && (
        <Animated.View
          style={[s.banner, { transform: [{ translateX: slideX }], opacity: bannerOp }]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={['#FFB3CC', '#FFF0A0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.bannerGrad}
          >
            {/* Sender avatar */}
            {renderInfo.senderAvatarUrl
              ? <Image source={{ uri: renderInfo.senderAvatarUrl }} style={s.avatar} />
              : (
                <LinearGradient colors={[PINK, '#C026D3']} style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarInitial}>
                    {(renderInfo.senderDisplayName[0] ?? '?').toUpperCase()}
                  </Text>
                </LinearGradient>
              )
            }
            {/* Sender name + gift name */}
            <View style={s.textCol}>
              <Text style={s.senderName} numberOfLines={1}>{renderInfo.senderDisplayName}</Text>
              <View style={s.giftRow}>
                {/* Gift image (preferred) or emoji fallback */}
                {renderInfo.giftImageUrl
                  ? <Image source={{ uri: renderInfo.giftImageUrl }} style={s.giftImg} resizeMode="contain" />
                  : <Text style={s.giftEmojiSmall}>{renderInfo.giftEmoji}</Text>
                }
                <Text style={s.giftLabel} numberOfLines={1}>{renderInfo.giftName}</Text>
              </View>
            </View>
            {/* Combo multiplier — always shown in banner for all gift types */}
            <Animated.Text style={[s.comboInBanner, { transform: [{ scale: comboScale }] }]}>
              x{renderCombo}
            </Animated.Text>
          </LinearGradient>
          <View style={s.bannerBorder} />
        </Animated.View>
      )}

      {/* ── Tap button ──────────────────────────────────────────────────── */}
      {/* Gated by tapVisible so it has real dimensions before animation    */}
      {/* No combo counter here — it lives in the banner only              */}
      {tapVisible && renderInfo?.canTap && (
        <Animated.View
          style={[s.tapArea, { opacity: tapOp, transform: [{ scale: tapScale }] }]}
          pointerEvents="box-none"
        >
          <Pressable onPress={handleTap} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={14}>
            <Animated.View style={{ transform: [{ scale: pressScale }] }}>
              <LinearGradient
                colors={[PINK, '#FF8C42', YELLOW]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.tapBtn}
              >
                {renderInfo.giftImageUrl
                  ? <Image source={{ uri: renderInfo.giftImageUrl }} style={s.tapGiftImg} resizeMode="contain" />
                  : <Text style={s.tapEmoji}>{renderInfo.giftEmoji}</Text>
                }
                <Text style={s.tapLabel}>TAP</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}

    </View>
  );
});

export default GiftComboOverlay;

const s = StyleSheet.create({
  overlay: {
    position:      'absolute',
    top:           0,
    left:          0,
    right:         0,
    bottom:        0,
    zIndex:        600,
    elevation:     600,
    pointerEvents: 'box-none' as any,
  },

  // Banner — left side, top 38%
  banner: {
    position: 'absolute',
    top:      '38%',
    left:     8,
    width:    BANNER_W,
  },
  bannerGrad: {
    flexDirection:   'row',
    alignItems:      'center',
    borderRadius:    28,
    paddingVertical: 7,
    paddingLeft:     6,
    paddingRight:    12,
    gap:             8,
  },
  bannerBorder: {
    position:     'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 28,
    borderWidth:  1.5,
    borderColor:  '#FFB3CCAA',
  },
  avatar:         { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial:  { color: '#fff', fontSize: 13, fontWeight: '800' },
  textCol:    { flex: 1 },
  senderName: { color: '#7D2150', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  giftRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  giftImg:         { width: 16, height: 16, borderRadius: 3 },
  giftEmojiSmall:  { fontSize: 13 },
  giftLabel:       { color: '#C05080', fontSize: 10, flexShrink: 1 },
  comboInBanner: {
    color:            GOLD,
    fontSize:         26,
    fontWeight:       '900',
    textShadowColor:  GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    minWidth:         44,
    textAlign:        'right',
  },

  // Tap button — right side, top 50% (lower in video area, just above chat)
  tapArea: {
    position:   'absolute',
    top:        '50%',
    right:      16,
    alignItems: 'center',
    zIndex:     601,
    elevation:  601,
  },
  tapBtn: {
    width:          72,
    height:         72,
    borderRadius:   36,
    justifyContent: 'center',
    alignItems:     'center',
    shadowColor:    PINK,
    shadowOpacity:  0.9,
    shadowRadius:   16,
    shadowOffset:   { width: 0, height: 0 },
    elevation:      16,
  },
  tapGiftImg: { width: 30, height: 30, borderRadius: 4 },
  tapEmoji:   { fontSize: 26 },
  tapLabel:   { color: '#fff', fontSize: 11, fontWeight: '900', marginTop: 2, letterSpacing: 0.5 },
});
