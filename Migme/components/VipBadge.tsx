import { Image } from 'react-native';

const VIP_ASSETS: Record<number, ReturnType<typeof require>> = {
  1: require('../assets/vip/vip1.png'),
  2: require('../assets/vip/vip2.png'),
  3: require('../assets/vip/vip3.png'),
  4: require('../assets/vip/vip4.png'),
  5: require('../assets/vip/vip5.png'),
};

interface VipBadgeProps {
  level: number;
  size?: number;
}

export default function VipBadge({ level, size = 28 }: VipBadgeProps) {
  if (!level || level < 1 || level > 5) return null;
  const src = VIP_ASSETS[level];
  if (!src) return null;
  return (
    <Image
      source={src}
      style={{ width: size, height: size * 0.85 }}
      resizeMode="contain"
    />
  );
}

export const VIP_BOX_COLORS: Record<number, { border: string; bg: string; glow: string }> = {
  1: { border: '#22C55E', bg: 'rgba(34,197,94,0.12)',  glow: '#22C55E' },
  2: { border: '#A855F7', bg: 'rgba(168,85,247,0.12)', glow: '#A855F7' },
  3: { border: '#EF4444', bg: 'rgba(239,68,68,0.12)',  glow: '#EF4444' },
  4: { border: '#F59E0B', bg: 'rgba(245,158,11,0.14)', glow: '#F59E0B' },
  5: { border: '#F97316', bg: 'rgba(249,115,22,0.14)', glow: '#F97316' },
};
