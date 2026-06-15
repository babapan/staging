import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { KomalSeat } from '../services/liveService';

interface Props {
  seats:           KomalSeat[];
  isHost:          boolean;
  currentUsername: string | null;
  onMuteSeat?:     (seatNum: number, muted: boolean) => void;
  onJoinSeat?:     (seatNum: number) => void;
  onLeaveSeat?:    (seatNum: number) => void;
  onClose?:        () => void;
}

const SEAT_SIZE   = 46;
const AVATAR_SIZE = 34;

const SEAT_GRADIENTS = [
  ['#FF6B9D', '#FF3CAC'],
  ['#7C3AED', '#A855F7'],
  ['#06B6D4', '#0EA5E9'],
];

function SoundRipple({ color, delay }: { color: string; delay: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.65, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, scale, opacity]);

  const size = SEAT_SIZE + 4;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:     'absolute',
        width:        size,
        height:       size,
        borderRadius: size / 2,
        borderWidth:  2,
        borderColor:  color,
        transform:    [{ scale }],
        opacity,
      }}
    />
  );
}

function SeatItem({
  seat, idx, isHost, currentUsername, onMuteSeat, onJoinSeat, onLeaveSeat,
}: {
  seat: KomalSeat;
  idx: number;
  isHost: boolean;
  currentUsername: string | null;
  onMuteSeat?: (n: number, muted: boolean) => void;
  onJoinSeat?:  (n: number) => void;
  onLeaveSeat?: (n: number) => void;
}) {
  const isEmpty    = !seat.username;
  const isMine     = !isEmpty && !!currentUsername && seat.username?.toLowerCase() === currentUsername.toLowerCase();
  const gradColors = SEAT_GRADIENTS[idx];
  const initials   = seat.displayName
    ? seat.displayName.slice(0, 2).toUpperCase()
    : seat.username?.slice(0, 2).toUpperCase() ?? '?';
  const shortName  = (seat.displayName ?? seat.username ?? '').slice(0, 7);
  const speaking   = !isEmpty && !seat.isMuted;

  return (
    <View style={kst.seatWrapper}>
      <TouchableOpacity
        activeOpacity={isEmpty ? 0.75 : 0.9}
        onPress={() => {
          if (isEmpty && !isHost) onJoinSeat?.(seat.seatNum);
          if (!isEmpty && isMine && !isHost) onLeaveSeat?.(seat.seatNum);
          if (!isEmpty && isHost) onMuteSeat?.(seat.seatNum, !seat.isMuted);
        }}
        style={kst.seatTouchable}
      >
        {/* ── Sound ripple rings (2 rings, staggered) ── */}
        {speaking && (
          <View style={kst.rippleWrapper} pointerEvents="none">
            <SoundRipple color={gradColors[0]} delay={0}   />
            <SoundRipple color={gradColors[1]} delay={400} />
          </View>
        )}

        <LinearGradient
          colors={gradColors as [string, string]}
          style={kst.seatRing}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={kst.seatInner}>
            {isEmpty ? (
              <View style={kst.emptyCircle}>
                <LinearGradient
                  colors={[gradColors[0] + '22', gradColors[1] + '44']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Ionicons name="add" size={20} color="rgba(255,255,255,0.85)" />
              </View>
            ) : (
              <View style={kst.occupiedCircle}>
                {seat.avatarUrl ? (
                  <Image source={{ uri: seat.avatarUrl }} style={kst.avatar} />
                ) : (
                  <LinearGradient
                    colors={gradColors as [string, string]}
                    style={kst.avatarFallback}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={kst.avatarInitials}>{initials}</Text>
                  </LinearGradient>
                )}

                {/* mic badge */}
                <View style={[kst.mutedBadge, !seat.isMuted && kst.activeBadge]}>
                  <MaterialCommunityIcons
                    name={seat.isMuted ? 'microphone-off' : 'microphone'}
                    size={10}
                    color="#fff"
                  />
                </View>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* host mute toggle button */}
        {!isEmpty && isHost && (
          <View style={kst.hostCtrl}>
            <LinearGradient
              colors={seat.isMuted ? ['#EF4444', '#B91C1C'] : ['#10B981', '#047857']}
              style={kst.hostCtrlInner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons
                name={seat.isMuted ? 'microphone-off' : 'microphone'}
                size={10}
                color="#fff"
              />
            </LinearGradient>
          </View>
        )}

        {/* leave hint for own seat */}
        {!isEmpty && isMine && !isHost && (
          <View style={kst.leaveHint}>
            <Ionicons name="exit-outline" size={10} color="rgba(255,255,255,0.8)" />
          </View>
        )}
      </TouchableOpacity>

    </View>
  );
}

export default function KomalSeatsPanel({
  seats, isHost, currentUsername, onMuteSeat, onJoinSeat, onLeaveSeat, onClose,
}: Props) {
  const displaySeats: KomalSeat[] = [1, 2, 3].map(n => {
    const found = seats.find(s => s.seatNum === n);
    return found ?? { seatNum: n, username: null, displayName: null, avatarUrl: null, isMuted: false };
  });

  return (
    <View style={kst.panel} pointerEvents="box-none">
      {onClose && (
        <TouchableOpacity style={kst.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {displaySeats.map((seat, idx) => (
        <SeatItem
          key={seat.seatNum}
          seat={seat}
          idx={idx}
          isHost={isHost}
          currentUsername={currentUsername}
          onMuteSeat={onMuteSeat}
          onJoinSeat={onJoinSeat}
          onLeaveSeat={onLeaveSeat}
        />
      ))}

      <View style={kst.komalBadge}>
        <LinearGradient
          colors={['#7C3AED', '#C026D3']}
          style={kst.komalBadgeInner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={kst.komalBadgeTxt}>🎙 Komal</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const kst = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap:        6,
  },
  closeBtn: {
    alignSelf:    'flex-end',
    marginRight:  2,
    marginBottom: 2,
  },
  seatWrapper: {
    alignItems: 'center',
    gap:        4,
  },
  seatTouchable: {
    position:       'relative',
    alignItems:     'center',
    justifyContent: 'center',
  },
  rippleWrapper: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
  },
  seatRing: {
    width:        SEAT_SIZE + 4,
    height:       SEAT_SIZE + 4,
    borderRadius: (SEAT_SIZE + 4) / 2,
    padding:      2,
  },
  seatInner: {
    flex:            1,
    borderRadius:    SEAT_SIZE / 2,
    overflow:        'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  emptyCircle: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  occupiedCircle: {
    flex:     1,
    position: 'relative',
  },
  avatar: {
    width:        '100%',
    height:       '100%',
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width:          '100%',
    height:         '100%',
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color:      '#fff',
    fontSize:   13,
    fontWeight: '800',
  },
  mutedBadge: {
    position:        'absolute',
    bottom:          1,
    right:           1,
    width:           18,
    height:          18,
    borderRadius:    9,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
  },
  activeBadge: {
    backgroundColor: '#10B981',
  },
  hostCtrl: {
    position:     'absolute',
    top:          -4,
    right:        -4,
    width:        22,
    height:       22,
    borderRadius: 11,
    overflow:     'hidden',
    borderWidth:  1.5,
    borderColor:  'rgba(255,255,255,0.6)',
  },
  hostCtrlInner: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  leaveHint: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    width:           20,
    height:          20,
    borderRadius:    10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.3)',
  },
  komalBadge: {
    marginTop:    4,
    borderRadius: 8,
    overflow:     'hidden',
  },
  komalBadgeInner: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      8,
  },
  komalBadgeTxt: {
    color:         '#fff',
    fontSize:      10,
    fontWeight:    '800',
    letterSpacing: 0.4,
  },
});
