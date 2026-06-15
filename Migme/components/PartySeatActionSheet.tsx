import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AvatarWithFrame from './AvatarWithFrame';

const { height: SH } = Dimensions.get('window');

export interface SeatActionTarget {
  seatIndex: number;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  avatarFrameUrl?: string | null;
  isMuted: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  target: SeatActionTarget | null;
  isOwnerOrAdmin: boolean;
  isMe: boolean;
  onViewProfile: (username: string) => void;
  onToggleMute: (seatIndex: number, currentlyMuted: boolean) => void;
  onKickFromSeat?: (seatIndex: number) => void;
  onSendGift?: (username: string) => void;
}

export default function PartySeatActionSheet({
  visible,
  onClose,
  target,
  isOwnerOrAdmin,
  isMe,
  onViewProfile,
  onToggleMute,
  onKickFromSeat,
  onSendGift,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 14 }),
        Animated.timing(bgOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 200, useNativeDriver: true }),
        Animated.timing(bgOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!target) return null;

  const canMute = isOwnerOrAdmin || isMe;
  const muteLabel = target.isMuted ? 'Buka Mic' : 'Tutup Mic';
  const muteIcon  = target.isMuted ? 'microphone' : 'microphone-off';

  const actions: { key: string; icon: string; label: string; iconFamily?: 'mci' | 'ion'; onPress: () => void; danger?: boolean; highlight?: boolean }[] = [
    {
      key: 'id',
      icon: 'card-account-details-outline',
      label: 'ID',
      onPress: () => { onClose(); onViewProfile(target.username); },
    },
    ...(!isMe && onSendGift ? [{
      key: 'gift',
      icon: 'gift',
      label: 'Hadiah',
      iconFamily: 'ion' as const,
      highlight: true,
      onPress: () => { onClose(); onSendGift(target.username); },
    }] : []),
    ...(canMute ? [{
      key: 'mute',
      icon: muteIcon,
      label: muteLabel,
      onPress: () => { onClose(); onToggleMute(target.seatIndex, target.isMuted); },
    }] : []),
    ...(isOwnerOrAdmin && !isMe && onKickFromSeat ? [{
      key: 'kick',
      icon: 'account-remove-outline',
      label: 'Keluarkan',
      danger: true,
      onPress: () => { onClose(); onKickFromSeat(target.seatIndex); },
    }] : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* User row */}
        <View style={styles.userRow}>
          <AvatarWithFrame
            displayPicture={target.avatarUrl ?? null}
            avatarFrameUrl={target.avatarFrameUrl ?? null}
            size={40}
            initial={(target.displayName || target.username || '?').slice(0, 2).toUpperCase()}
          />
          <Text style={styles.username} numberOfLines={1}>
            {target.displayName || target.username}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {actions.map(action => (
            <TouchableOpacity
              key={action.key}
              style={styles.actionItem}
              onPress={action.onPress}
              activeOpacity={0.75}
            >
              <View style={[
                styles.actionCircle,
                action.danger && styles.actionCircleDanger,
                action.highlight && styles.actionCircleHighlight,
              ]}>
                {action.iconFamily === 'ion' ? (
                  <Ionicons
                    name={action.icon as any}
                    size={22}
                    color={action.highlight ? '#fff' : '#1a1a2e'}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={action.icon as any}
                    size={22}
                    color={action.danger ? '#EF4444' : '#1a1a2e'}
                  />
                )}
              </View>
              <Text style={[styles.actionLabel, action.danger && styles.actionLabelDanger]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 24,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircleDanger: {
    backgroundColor: '#FEF2F2',
  },
  actionCircleHighlight: {
    backgroundColor: '#F59E0B',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  actionLabelDanger: {
    color: '#EF4444',
  },
});
