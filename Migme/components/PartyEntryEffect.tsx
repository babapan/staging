/**
 * PartyEntryEffect — sliding banner + helicopter Lottie
 *
 * Posisi: tepat di bawah baris kursi terakhir
 * Animasi: banner geser kanan→tengah (berhenti 3 detik)→keluar pelan ke kiri
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';

const { width: SW, height: SH } = Dimensions.get('window');

const AVATAR_D  = 36;    // diameter avatar circle
const BANNER_H  = 38;    // tinggi banner
const HOLD_MS   = 3000;  // pause di tengah = 3 detik
const SLIDE_IN_MS  = 420;   // durasi geser masuk
const SLIDE_OUT_MS = 700;   // durasi keluar — lebih lambat

// Banner lebar 50% layar — compact kapsul gaya China app
const BANNER_W  = SW * 0.50;
const OVERLAP   = AVATAR_D * 0.40; // seberapa banyak avatar mencuat ke kiri

// Posisi vertikal: di bawah kursi baris terakhir
const BANNER_TOP = SH * 0.515;

// Wrapper left offset (avatar mencuat ke kiri)
const WRAPPER_LEFT = -(AVATAR_D - OVERLAP);

// ─── Posisi X di mana banner berhenti (tengah layar) ─────────────────────────
// Saat translateX = CENTER_STOP, banner kiri ada di tengah layar - BANNER_W/2
// banner.left_on_screen = translateX (karena wrapper.left + translateX + avatar_offset = translateX)
const CENTER_STOP = (SW - BANNER_W) / 2;

// ── Avatar circle ─────────────────────────────────────────────────────────────
function AvatarCircle({ avatarUrl, initials }: { avatarUrl?: string | null; initials: string }) {
  return (
    <View style={styles.avatarOuter}>
      <View style={styles.avatarGlowRing} />
      <View style={styles.avatarBorder}>
        <View style={styles.avatarCircle}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitials}>{initials}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface PartyEntryEffectProps {
  visible:      boolean;
  username:     string;
  displayName?: string | null;
  avatarUrl?:   string | null;
  effectUrl?:   string | null;
  mode?:        'self' | 'other';
  onDone:       () => void;
}

export default function PartyEntryEffect({
  visible,
  username,
  displayName,
  avatarUrl,
  effectUrl,
  mode = 'other',
  onDone,
}: PartyEntryEffectProps) {
  const translateX  = useRef(new Animated.Value(SW + 20)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const lottieRef   = useRef<LottieView>(null);
  const [lottieReady, setLottieReady] = useState(false);
  const [customLottieData, setCustomLottieData] = useState<object | null>(null);

  const isSelf   = mode === 'self';
  const label    = (displayName && displayName.trim()) ? displayName.trim() : username;
  const initials = label.slice(0, 2).toUpperCase();

  // Fetch custom lottie JSON when effectUrl changes
  useEffect(() => {
    if (!effectUrl) { setCustomLottieData(null); return; }
    fetch(effectUrl)
      .then(r => r.json())
      .then(data => setCustomLottieData(data))
      .catch(() => setCustomLottieData(null));
  }, [effectUrl]);

  useEffect(() => {
    if (!visible) {
      setLottieReady(false);
      return;
    }

    // Reset posisi ke kanan layar
    translateX.setValue(SW + 20);
    glowOpacity.setValue(0);
    setLottieReady(false);

    const seq = Animated.sequence([
      // Fase 1: slide masuk dari kanan → berhenti di TENGAH layar
      Animated.parallel([
        Animated.timing(translateX, {
          toValue:         CENTER_STOP,
          duration:        SLIDE_IN_MS,
          easing:          Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue:         1,
          duration:        350,
          useNativeDriver: true,
        }),
      ]),
      // Fase 2: tahan 3 detik di tengah
      Animated.delay(HOLD_MS),
      // Fase 3: keluar pelan-pelan ke KIRI
      Animated.parallel([
        Animated.timing(translateX, {
          toValue:         -(SW + 20),
          duration:        SLIDE_OUT_MS,
          easing:          Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue:         0,
          duration:        SLIDE_OUT_MS * 0.6,
          useNativeDriver: true,
        }),
      ]),
    ]);

    seq.start(({ finished }) => {
      if (finished) onDone();
    });

    // Mulai Lottie sedikit terlambat biar banner sudah masuk
    const lt = setTimeout(() => {
      setLottieReady(true);
    }, 300);

    return () => {
      seq.stop();
      clearTimeout(lt);
    };
  }, [visible, username]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateX }] }]}
      pointerEvents="none"
    >
      {/* Glow halo */}
      <Animated.View style={[styles.glowHalo, { opacity: glowOpacity }]} />

      {/* Entry Effect Lottie — custom dari DB atau fallback helicopter */}
      {lottieReady && (
        <LottieView
          ref={lottieRef}
          source={
            customLottieData
              ? customLottieData as any
              : require('../assets/lottie/helicopter_animation.json')
          }
          autoPlay
          loop={false}
          speed={0.65}
          style={styles.lottie}
          resizeMode="contain"
        />
      )}

      {/* Banner body */}
      <LinearGradient
        colors={['rgba(109,40,217,0.82)', 'rgba(139,92,246,0.78)', 'rgba(167,139,250,0.72)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.banner}
      >
        {/* Highlight strip atas */}
        <View style={styles.innerHighlight} />

        <View style={styles.textArea}>
          <Text style={styles.username} numberOfLines={1}>{label}</Text>
          <Text style={styles.subText} numberOfLines={1}>
            {isSelf ? 'Selamat Datang! 🎉' : 'has entered the room'}
          </Text>
        </View>

        {/* Dekorasi bintang */}
        <View style={styles.starsWrap}>
          <Text style={{ fontSize: 13, opacity: 0.9 }}>⭐</Text>
          <Text style={{ fontSize: 9, opacity: 0.65, marginTop: -3 }}>✦</Text>
        </View>
      </LinearGradient>

      {/* Avatar — mencuat ke kiri */}
      <AvatarCircle avatarUrl={avatarUrl} initials={initials} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position:      'absolute',
    top:           BANNER_TOP,
    left:          WRAPPER_LEFT,
    width:         BANNER_W + (AVATAR_D - OVERLAP),
    zIndex:        9997,
    flexDirection: 'row',
    alignItems:    'center',
  },
  glowHalo: {
    position:        'absolute',
    left:            AVATAR_D - OVERLAP - 4,
    top:             -8,
    width:           BANNER_W + 8,
    height:          BANNER_H + 16,
    borderRadius:    BANNER_H,
    backgroundColor: 'transparent',
    shadowColor:     '#8B5CF6',
    shadowOpacity:   0.8,
    shadowRadius:    14,
    shadowOffset:    { width: 0, height: 0 },
    elevation:       12,
  },
  banner: {
    width:                   BANNER_W,
    height:                  BANNER_H,
    borderRadius:            BANNER_H / 2,
    flexDirection:           'row',
    alignItems:              'center',
    // Padding kiri lebih besar agar teks username tidak tertutup avatar
    paddingLeft:             AVATAR_D + 10,
    paddingRight:            10,
    overflow:                'hidden',
  },
  innerHighlight: {
    position:             'absolute',
    top:                  0,
    left:                 0,
    right:                0,
    height:               BANNER_H * 0.40,
    backgroundColor:      'rgba(255,255,255,0.14)',
    borderRadius:         BANNER_H / 2,
  },
  textArea: {
    flex:           1,
    justifyContent: 'center',
  },
  username: {
    fontSize:         13,
    fontWeight:       '800',
    color:            '#ECFDF5',
    textShadowColor:  'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing:    0.1,
  },
  subText: {
    fontSize:   10,
    fontWeight: '500',
    color:      'rgba(209,250,229,0.90)',
    marginTop:  1,
  },
  starsWrap: {
    alignItems:   'flex-end',
    marginLeft:   4,
    paddingRight: 2,
  },
  // ── Avatar ──
  avatarOuter: {
    position:       'absolute',
    left:           0,
    alignSelf:      'center',
    alignItems:     'center',
    justifyContent: 'center',
    width:          AVATAR_D + 8,
    height:         AVATAR_D + 8,
  },
  avatarGlowRing: {
    position:        'absolute',
    width:           AVATAR_D + 8,
    height:          AVATAR_D + 8,
    borderRadius:    (AVATAR_D + 8) / 2,
    backgroundColor: 'transparent',
    shadowColor:     '#A78BFA',
    shadowOpacity:   0.9,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 0 },
    elevation:       10,
  },
  avatarBorder: {
    width:           AVATAR_D + 3,
    height:          AVATAR_D + 3,
    borderRadius:    (AVATAR_D + 3) / 2,
    padding:         2,
    backgroundColor: '#7C3AED',
    shadowColor:     '#8B5CF6',
    shadowOpacity:   0.7,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 0 },
    elevation:       8,
  },
  avatarCircle: {
    width:           AVATAR_D,
    height:          AVATAR_D,
    borderRadius:    AVATAR_D / 2,
    backgroundColor: '#5B21B6',
    overflow:        'hidden',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarImg: {
    width:      '100%',
    height:     '100%',
    resizeMode: 'cover',
  },
  avatarInitials: {
    fontSize:   17,
    fontWeight: '800',
    color:      '#ECFDF5',
  },
  // ── Lottie helicopter — lebih besar dari banner ──
  lottie: {
    position: 'absolute',
    right:    -40,
    top:      -(300 * 0.55),  // naik jauh di atas banner
    width:    300,
    height:   300,
    zIndex:   9998,
  },
});
