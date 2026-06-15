import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Image, StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SW = Dimensions.get('window').width;

export interface VipJoinEntry {
  id:          string;
  displayName: string;
  avatarUrl?:  string | null;
  vipLevel:    number;
  hasTopup?:   boolean;
  /** 'vip' = VIP vehicle banner; 'topup' = pink-yellow topup pill */
  mode:        'vip' | 'topup';
}

// ── VIP vehicle configs (tidak diubah) ──────────────────────────────────────
const VIP_CONFIG: Record<number, { label: string; labelColor: string; bg: string; vehicle: any }> = {
  1: { label: 'VIP 1', labelColor: '#A0C4FF', bg: 'rgba(0,80,180,0.88)',   vehicle: require('../assets/vip/vip1.png') },
  2: { label: 'VIP 2', labelColor: '#B9FBC0', bg: 'rgba(0,150,55,0.88)',   vehicle: require('../assets/vip/vip2.png') },
  3: { label: 'VIP 3', labelColor: '#FFD6A5', bg: 'rgba(200,75,0,0.90)',   vehicle: require('../assets/vip/vip3.png') },
  4: { label: 'VIP 4', labelColor: '#FFC8DD', bg: 'rgba(155,0,115,0.90)',  vehicle: require('../assets/vip/vip4.png') },
  5: { label: 'VIP 5', labelColor: '#FFD700', bg: 'rgba(130,0,0,0.94)',    vehicle: require('../assets/vip/vip5.png') },
};

interface Props {
  queue:      React.MutableRefObject<VipJoinEntry[]>;
  showingRef: React.MutableRefObject<boolean>;
}

export default function VipEntranceBanner({ queue, showingRef }: Props) {
  const [entry, setEntry] = useState<VipJoinEntry | null>(null);
  const slideX  = useRef(new Animated.Value(SW)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNext = useCallback(() => {
    const next = queue.current.shift();
    if (!next) { showingRef.current = false; return; }
    showingRef.current = true;
    setEntry(next);

    slideX.setValue(SW);
    opacity.setValue(1);
    Animated.spring(slideX, {
      toValue: 0, useNativeDriver: true, tension: 55, friction: 9,
    }).start();

    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setEntry(null);
        showNext();
      });
    }, 2800);
  }, [queue, showingRef, slideX, opacity]);

  useEffect(() => {
    (queue as any).__showNext = showNext;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [queue, showNext]);

  if (!entry) return null;

  // ── Topup pill banner (non-VIP user yang sudah top-up) ───────────────────
  if (entry.mode === 'topup') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[st.topupWrap, { transform: [{ translateX: slideX }], opacity }]}
      >
        <LinearGradient
          colors={['#FF79C6', '#FFB347', '#FFE066']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={st.topupGrad}
        >
          {/* Coin icon badge */}
          <View style={st.topupBadge}>
            <Text style={st.topupBadgeIcon}>💰</Text>
          </View>

          {/* Display name */}
          <Text style={st.topupName} numberOfLines={1}>
            {entry.displayName}
          </Text>

          {/* Join text */}
          <Text style={st.topupJoin}> bergabung</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── VIP vehicle banner (tidak diubah dari versi asli) ────────────────────
  const cfg     = VIP_CONFIG[entry.vipLevel] ?? VIP_CONFIG[1];
  const initial = (entry.displayName?.[0] ?? '?').toUpperCase();

  return (
    <Animated.View
      pointerEvents="none"
      style={[st.vipWrap, { backgroundColor: cfg.bg, transform: [{ translateX: slideX }], opacity }]}
    >
      <Image source={cfg.vehicle} style={st.vehicle} resizeMode="contain" />
      <View style={st.info}>
        {entry.avatarUrl ? (
          <Image source={{ uri: entry.avatarUrl }} style={st.avatar} />
        ) : (
          <View style={st.avatarFallback}>
            <Text style={st.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={st.textCol}>
          <Text style={st.vipName} numberOfLines={1}>{entry.displayName}</Text>
          <View style={st.tagRow}>
            <View style={[st.vipTag, { borderColor: cfg.labelColor }]}>
              <Text style={[st.vipLabel, { color: cfg.labelColor }]}>{cfg.label}</Text>
            </View>
            <Text style={st.joinTxt}> bergabung</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  // ── Topup pill banner ──────────────────────────────────────────────────────
  topupWrap: {
    position:  'absolute',
    right:     0,
    top:       '38%',
    height:    42,
    maxWidth:  SW * 0.78,
    zIndex:    50,
    elevation: 20,
    borderTopLeftRadius:    21,
    borderBottomLeftRadius: 21,
    overflow: 'hidden',
    shadowColor:   '#FF79C6',
    shadowOpacity: 0.45,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 3 },
  },
  topupGrad: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    paddingLeft:    8,
    paddingRight:   18,
    gap:            6,
  },
  topupBadge: {
    width:           30,
    height:          30,
    borderRadius:    15,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  topupBadgeIcon: {
    fontSize: 16,
  },
  topupName: {
    fontSize:   14,
    fontWeight: '800',
    color:      '#fff',
    flexShrink: 1,
    textShadowColor:  'rgba(0,0,0,0.28)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  topupJoin: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#fff5c0',
    flexShrink: 0,
    textShadowColor:  'rgba(0,0,0,0.22)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },

  // ── VIP vehicle banner (tidak diubah) ──────────────────────────────────────
  vipWrap: {
    position:  'absolute',
    right:     0,
    top:       '36%',
    width:     SW * 0.75,
    height:    68,
    flexDirection: 'row',
    alignItems:    'center',
    borderTopLeftRadius:    34,
    borderBottomLeftRadius: 34,
    overflow:  'hidden',
    zIndex:    50,
    elevation: 20,
  },
  vehicle: {
    width: 96, height: 58, marginLeft: 2, flexShrink: 0,
  },
  info: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  textCol:       { flex: 1 },
  vipName:       { fontSize: 13, fontWeight: '800', color: '#fff' },
  tagRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  vipTag: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1, marginRight: 2,
  },
  vipLabel: { fontSize: 10, fontWeight: '800' },
  joinTxt:  { fontSize: 11, color: 'rgba(255,255,255,0.82)' },
});
