import { useEffect, useRef, useState } from 'react';
import {
  Animated, Image, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { LiveStream } from '../services/liveService';

const SOLO_PINK   = '#EC4899';
const SOLO_ROSE   = '#BE185D';

interface Props {
  stream: LiveStream;
  cardW: number;
  cardH: number;
  onPress: () => void;
}

function PulseBadge() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.4, duration: 650, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 650, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    ).start();
    return () => { scale.stopAnimation(); opacity.stopAnimation(); };
  }, []);

  return (
    <View style={st.liveBadge}>
      <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{
          position: 'absolute',
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: '#fff',
          transform: [{ scale }],
          opacity,
        }} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
      </View>
      <MaterialCommunityIcons name="video" size={10} color="#fff" style={{ marginLeft: 2 }} />
      <Text style={st.liveTxt}>LIVE</Text>
    </View>
  );
}

export default function LiveSoloCard({ stream, cardW, cardH, onPress }: Props) {
  const [imgError, setImgError] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    return () => glowAnim.stopAnimation();
  }, []);

  const bgImg = stream.thumbnailUrl ?? stream.hostAvatar;
  const showImg = !!bgImg && !imgError;
  const initial = (stream.hostDisplayName ?? stream.hostUsername ?? '?')[0].toUpperCase();

  const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

  const borderOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <View style={[st.outer, { width: cardW }]}>
      <Animated.View style={[
        st.glowShadow,
        { width: cardW, height: cardH, opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] }) },
      ]} />

      <TouchableOpacity style={[st.card, { width: cardW, height: cardH }]} onPress={onPress} activeOpacity={0.87}>
        {showImg ? (
          <Image source={{ uri: bgImg! }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <LinearGradient
            colors={[SOLO_ROSE + 'DD', SOLO_PINK + '88', '#1A0010']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
          />
        )}

        <LinearGradient
          colors={['rgba(236,72,153,0.15)', 'transparent', 'rgba(190,24,93,0.10)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {!showImg && (
          <View style={st.fallback}>
            <Text style={[st.fallbackInitial, { fontSize: cardW * 0.32 }]}>{initial}</Text>
          </View>
        )}

        <Animated.View style={[StyleSheet.absoluteFill, st.pinkBorder, { opacity: borderOpacity }]} />

        <LinearGradient
          colors={['transparent', 'rgba(10,0,20,0.5)', 'rgba(10,0,20,0.93)']}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          style={st.bottomGrad}
        />

        <PulseBadge />

        <View style={st.viewerBadge}>
          <Ionicons name="eye" size={10} color="#fff" />
          <Text style={st.viewerTxt}>{fmtNum(stream.viewerCount)}</Text>
        </View>

        {stream.totalGifts > 0 && (
          <View style={st.giftBadge}>
            <Text style={st.giftEmoji}>💎</Text>
            <Text style={st.giftTxt}>{fmtNum(stream.totalGifts)}</Text>
          </View>
        )}

        <View style={st.infoOverlay}>
          <Text style={st.title} numberOfLines={2}>{stream.title}</Text>
          <View style={st.hostRow}>
            <View style={st.pinkDot} />
            <Text style={st.hostTxt} numberOfLines={1}>
              @{stream.hostUsername}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  outer: {
    position: 'relative',
  },
  glowShadow: {
    position: 'absolute',
    top: 4, left: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    shadowColor: SOLO_PINK,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A0010',
    elevation: 8,
    shadowColor: SOLO_PINK,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pinkBorder: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SOLO_PINK,
  },
  bottomGrad: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '55%',
  },
  liveBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: SOLO_ROSE,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    shadowColor: SOLO_ROSE,
    shadowOpacity: 0.8, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  liveTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  viewerBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  viewerTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  giftBadge: {
    position: 'absolute', bottom: 52, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 0.5, borderColor: 'rgba(236,72,153,0.5)',
  },
  giftEmoji: { fontSize: 9 },
  giftTxt: { color: SOLO_PINK, fontSize: 10, fontWeight: '700' },
  infoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 10, paddingBottom: 10, paddingTop: 6,
    gap: 4,
  },
  title: {
    fontSize: 13, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 17,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pinkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SOLO_PINK },
  hostTxt: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flexShrink: 1 },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fallbackInitial: { fontWeight: '900', opacity: 0.3, letterSpacing: -1, color: SOLO_PINK },
});
