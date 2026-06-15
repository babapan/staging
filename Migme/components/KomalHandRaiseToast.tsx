import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { KomalHandRaiseRequest } from '../services/liveService';

const AUTO_DISMISS_MS = 12000;

interface CardProps {
  req:       KomalHandRaiseRequest;
  onApprove: () => void;
  onDismiss: () => void;
}

function HandRaiseCard({ req, onApprove, onDismiss }: CardProps) {
  const slideX   = useRef(new Animated.Value(260)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const opacity  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // slide in
    Animated.spring(slideX, {
      toValue: 0, tension: 80, friction: 12, useNativeDriver: true,
    }).start();
    // countdown bar
    Animated.timing(progress, {
      toValue: 0, duration: AUTO_DISMISS_MS, useNativeDriver: false,
    }).start();
    // auto-dismiss
    const tid = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0, duration: 250, useNativeDriver: true,
      }).start(() => onDismiss());
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(tid);
  }, []);

  const initials = (req.displayName ?? req.username).slice(0, 2).toUpperCase();
  const name     = (req.displayName ?? req.username).slice(0, 14);

  return (
    <Animated.View style={[hst.card, { transform: [{ translateX: slideX }], opacity }]}>
      {/* Avatar */}
      <View style={hst.avatarWrap}>
        {req.avatarUrl ? (
          <Image source={{ uri: req.avatarUrl }} style={hst.avatar} />
        ) : (
          <LinearGradient colors={['#7C3AED', '#C026D3']} style={hst.avatarFallback}>
            <Text style={hst.avatarInitials}>{initials}</Text>
          </LinearGradient>
        )}
        {/* hand emoji badge */}
        <View style={hst.handBadge}>
          <Text style={{ fontSize: 9 }}>✋</Text>
        </View>
      </View>

      {/* Text */}
      <View style={hst.textWrap}>
        <Text style={hst.nameText} numberOfLines={1}>{name}</Text>
        <Text style={hst.subText}>ingin naik Komal</Text>
      </View>

      {/* Approve / Dismiss buttons */}
      <View style={hst.btnRow}>
        <TouchableOpacity style={hst.approveBtn} onPress={onApprove} activeOpacity={0.75}>
          <LinearGradient colors={['#10B981', '#059669']} style={hst.btnGrad}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={hst.rejectBtn} onPress={onDismiss} activeOpacity={0.75}>
          <LinearGradient colors={['#EF4444', '#DC2626']} style={hst.btnGrad}>
            <Ionicons name="close" size={13} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Countdown bar */}
      <Animated.View
        style={[
          hst.progressBar,
          {
            width: progress.interpolate({
              inputRange: [0, 1], outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

interface Props {
  requests:  KomalHandRaiseRequest[];
  onApprove: (username: string) => void;
  onDismiss: (username: string) => void;
}

export default function KomalHandRaiseToast({ requests, onApprove, onDismiss }: Props) {
  if (!requests.length) return null;
  return (
    <View style={hst.container} pointerEvents="box-none">
      {requests.map(req => (
        <HandRaiseCard
          key={req.username}
          req={req}
          onApprove={() => onApprove(req.username)}
          onDismiss={() => onDismiss(req.username)}
        />
      ))}
    </View>
  );
}

const hst = StyleSheet.create({
  container: {
    position: 'absolute',
    top:      72,
    right:    10,
    gap:      6,
    zIndex:   60,
    alignItems: 'flex-end',
  },
  card: {
    width:           226,
    backgroundColor: 'rgba(14,14,22,0.93)',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.10)',
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 10,
    paddingVertical:   9,
    gap:             8,
    overflow:        'hidden',
  },
  avatarWrap: {
    position: 'relative',
    width:    34,
    height:   34,
  },
  avatar: {
    width:        34,
    height:       34,
    borderRadius: 17,
  },
  avatarFallback: {
    width:          34,
    height:         34,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color:      '#fff',
    fontSize:   13,
    fontWeight: '700',
  },
  handBadge: {
    position:        'absolute',
    bottom:          -2,
    right:           -2,
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: 'rgba(14,14,22,0.9)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  textWrap: {
    flex: 1,
  },
  nameText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '700',
    lineHeight: 15,
  },
  subText: {
    color:    'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 13,
  },
  btnRow: {
    flexDirection: 'row',
    gap:           5,
  },
  approveBtn: {
    width:        26,
    height:       26,
    borderRadius: 13,
    overflow:     'hidden',
  },
  rejectBtn: {
    width:        26,
    height:       26,
    borderRadius: 13,
    overflow:     'hidden',
  },
  btnGrad: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  progressBar: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    height:          2,
    backgroundColor: 'rgba(124,58,237,0.7)',
    borderRadius:    1,
  },
});
