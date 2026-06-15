/**
 * FloatingPartyBubble.tsx
 *
 * Floating draggable widget shown when Party Room is minimized.
 * Audio/WS stays connected — only the full-screen modal is hidden.
 * Tap to restore the full room. Drag anywhere on screen.
 * Snaps to left or right edge after release.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

const BUBBLE_SIZE  = 72;
const SNAP_MARGIN  = 16;
const WAVEFORM_BARS = 5;

// ── Animated waveform bars (green) ───────────────────────────────────────────
function WaveformBars() {
  const anims = useRef(
    Array.from({ length: WAVEFORM_BARS }, (_, i) =>
      new Animated.Value(0.3 + (i % 2) * 0.2)
    )
  ).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(anim, {
            toValue: 1,
            duration: 380 + i * 40,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 380 + i * 40,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <View style={waveStyles.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            { transform: [{ scaleY: anim }] },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  bar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#22C55E',
  },
});

// ── Glow ring animation ───────────────────────────────────────────────────────
function GlowRing({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.18, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.15, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: BUBBLE_SIZE,
        height: BUBBLE_SIZE,
        borderRadius: 18,
        borderWidth: 2.5,
        borderColor: '#22C55E',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  roomName:    string;
  hostAvatar?: string | null;
  roomColor?:  string;
  onRestore:   () => void;
}

export default function FloatingPartyBubble({
  roomName,
  hostAvatar,
  roomColor = '#7C3AED',
  onRestore,
}: Props) {
  const insets = useSafeAreaInsets();

  // Start position: bottom-right corner, above tab bar
  const startX = SW - BUBBLE_SIZE - SNAP_MARGIN;
  const startY = SH - BUBBLE_SIZE - 100 - insets.bottom;

  const pan = useRef(new Animated.ValueXY({ x: startX, y: startY })).current;
  const lastPos = useRef({ x: startX, y: startY });

  const bounceScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bounceScale, {
      toValue: 1,
      tension: 55,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,

      onPanResponderGrant: () => {
        pan.setOffset({ x: lastPos.current.x, y: lastPos.current.y });
        pan.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),

      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const curX = lastPos.current.x + g.dx;
        const curY = Math.max(
          insets.top + 20,
          Math.min(lastPos.current.y + g.dy, SH - BUBBLE_SIZE - insets.bottom - 20)
        );

        // Snap to nearest horizontal edge
        const snapX = curX + BUBBLE_SIZE / 2 < SW / 2
          ? SNAP_MARGIN
          : SW - BUBBLE_SIZE - SNAP_MARGIN;

        Animated.spring(pan, {
          toValue: { x: snapX, y: curY },
          tension: 70,
          friction: 10,
          useNativeDriver: false,
        }).start(() => {
          lastPos.current = { x: snapX, y: curY };
        });
      },
    })
  ).current;

  // Track pan position for snap logic (cleanup on unmount)
  useEffect(() => {
    const id = pan.addListener(({ x, y }) => {
      lastPos.current = { x, y };
    });
    return () => pan.removeListener(id);
  }, [pan]);

  const initials = (roomName ?? '?').slice(0, 2).toUpperCase();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Inner view handles bounce scale separately — native driver can't mix with pan */}
      <Animated.View style={{ transform: [{ scale: bounceScale }], alignItems: 'center' }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onRestore}
        style={styles.bubble}
      >
        {/* Glow ring */}
        <GlowRing color="#22C55E" />

        {/* Avatar or initials */}
        {hostAvatar ? (
          <Image
            source={{ uri: hostAvatar }}
            style={styles.avatar}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: roomColor, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}

        {/* Animated waveform at bottom */}
        <WaveformBars />

        {/* LIVE badge */}
        <View style={styles.liveBadge}>
          <Text style={styles.liveTxt}>LIVE</Text>
        </View>
      </TouchableOpacity>

      {/* Room name label below bubble */}
      <View style={styles.nameTag}>
        <Text style={styles.nameText} numberOfLines={1}>
          {roomName}
        </Text>
      </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position:  'absolute',
    width:     BUBBLE_SIZE,
    alignItems: 'center',
    zIndex:    9999,
    elevation: 20,
  },
  bubble: {
    width:        BUBBLE_SIZE,
    height:       BUBBLE_SIZE,
    borderRadius: 18,
    overflow:     'hidden',
    backgroundColor: '#111',
    shadowColor:  '#22C55E',
    shadowOpacity: 0.5,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 0 },
    elevation:     16,
  },
  avatar: {
    width:  BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: 18,
  },
  initials: {
    color:      '#fff',
    fontSize:   22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  liveBadge: {
    position:        'absolute',
    top:             6,
    left:            6,
    backgroundColor: '#EF4444',
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:   1,
  },
  liveTxt: {
    color:      '#fff',
    fontSize:   8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  nameTag: {
    marginTop:       5,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius:    6,
    paddingHorizontal: 6,
    paddingVertical:   2,
    maxWidth:          BUBBLE_SIZE + 20,
  },
  nameText: {
    color:     '#fff',
    fontSize:  9,
    fontWeight: '700',
    textAlign:  'center',
  },
});
