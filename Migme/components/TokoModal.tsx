import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import AvatarWithFrame from './AvatarWithFrame';
import {
  formatCoin,
  getMyFrames,
  getShopFrames,
  purchaseFrame,
  equipFrame,
  unequipFrame,
  getActiveFrame,
  getShopEntryEffects,
  getMyEntryEffects,
  purchaseEntryEffect,
  equipEntryEffect,
  unequipEntryEffect,
  type ShopFrame,
  type UserFrame,
  type ShopEntryEffect,
  type UserEntryEffect,
} from '../services/shopService';
import { invalidateAvatarCache } from './AvatarWithFrame';
import { getCreditBalance } from '../services/credit';

const { width: SW } = Dimensions.get('window');

function formatExpiryLabel(expiresAt: string): { label: string; urgent: boolean } {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diffMs = exp - now;
  if (diffMs <= 0) return { label: 'Kadaluarsa', urgent: true };
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  if (diffDays === 0) return { label: `${diffHours}j lagi`, urgent: true };
  if (diffDays === 1) return { label: `1h ${remHours}j lagi`, urgent: true };
  return { label: `${diffDays} hari lagi`, urgent: diffDays <= 2 };
}

function isLottieUrl(url: string): boolean {
  return url.endsWith('.json') || url.includes('/lottie');
}

function FrameImage({ url, size }: { url: string; size: number }) {
  const [lottieData, setLottieData] = useState<object | null>(null);
  const [lottieError, setLottieError] = useState(false);

  useEffect(() => {
    if (!url || !isLottieUrl(url)) return;
    setLottieData(null);
    setLottieError(false);
    fetch(url)
      .then(r => r.json())
      .then(data => setLottieData(data))
      .catch(() => setLottieError(true));
  }, [url]);

  if (!url) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="image-outline" size={size * 0.4} color="#4B5563" />
      </View>
    );
  }

  if (isLottieUrl(url)) {
    if (lottieError) {
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="image-outline" size={size * 0.4} color="#4B5563" />
        </View>
      );
    }
    if (!lottieData) {
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#A78BFA" size="small" />
        </View>
      );
    }
    return (
      <LottieView
        source={lottieData as any}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" />
  );
}

const TABS = ['Bingkai', 'Efek Masuk'] as const;
type Tab = typeof TABS[number];

interface Props {
  visible: boolean;
  onClose: () => void;
  userAvatar?: string | null;
  userInitial?: string;
  username?: string | null;
  onFrameChanged?: (url: string | null) => void;
}

interface FrameDetailProps {
  frame: ShopFrame;
  frames: ShopFrame[];
  frameIndex: number;
  userAvatar?: string | null;
  userInitial?: string;
  coinBalance: number;
  ownedFrameIds: Set<string>;
  myFrames: UserFrame[];
  onClose: () => void;
  onPurchased: () => void;
  onNavigate: (index: number) => void;
}

function FrameDetail({
  frame,
  frames,
  frameIndex,
  userAvatar,
  userInitial,
  coinBalance,
  ownedFrameIds,
  myFrames,
  onClose,
  onPurchased,
  onNavigate,
}: FrameDetailProps) {
  const [duration, setDuration] = useState<1 | 7 | 30>(7);
  const [buying, setBuying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [frame.id]);

  const price = duration === 1 ? frame.price_1d : duration === 7 ? frame.price_7d : frame.price_30d;
  const isOwned = ownedFrameIds.has(frame.id);
  const equippedUserFrame = myFrames.find(f => f.frame_id === frame.id && f.is_equipped);

  const handleBuy = async () => {
    if (buying) return;
    if (coinBalance < price) {
      Alert.alert('Saldo Tidak Cukup', `Kamu butuh 🪙 ${formatCoin(price)} untuk membeli ini.`);
      return;
    }
    Alert.alert(
      'Konfirmasi Pembelian',
      `Beli "${frame.name}" selama ${duration} hari seharga 🪙 ${formatCoin(price)}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bayar',
          onPress: async () => {
            setBuying(true);
            const result = await purchaseFrame(frame.id, duration);
            setBuying(false);
            if (result.success) {
              Alert.alert('Berhasil! 🎉', result.message);
              onPurchased();
            } else {
              Alert.alert('Gagal', result.message);
            }
          },
        },
      ]
    );
  };

  const handleEquip = async () => {
    const uf = myFrames.find(f => f.frame_id === frame.id);
    if (!uf) return;
    await equipFrame(uf.id);
    onPurchased();
  };

  const handleUnequip = async () => {
    await unequipFrame();
    onPurchased();
  };

  return (
    <Animated.View style={[fd.container, { opacity: fadeAnim }]}>
      {/* Close */}
      <TouchableOpacity style={fd.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Navigation arrows */}
      {frameIndex > 0 && (
        <TouchableOpacity style={[fd.arrow, fd.arrowLeft]} onPress={() => onNavigate(frameIndex - 1)}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
      )}
      {frameIndex < frames.length - 1 && (
        <TouchableOpacity style={[fd.arrow, fd.arrowRight]} onPress={() => onNavigate(frameIndex + 1)}>
          <Ionicons name="chevron-forward" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Avatar preview with frame */}
      <View style={fd.previewArea}>
        <AvatarWithFrame
          size={130}
          displayPicture={userAvatar ?? null}
          avatarFrameUrl={frame.image_url}
          initial={userInitial ?? '?'}
          backgroundColor="#1A6B72"
        />
      </View>

      {/* Frame name */}
      <Text style={fd.frameName}>{frame.name}</Text>

      {isOwned ? (
        <View style={fd.ownedSection}>
          <Text style={fd.ownedText}>✅ Sudah dimiliki</Text>
          {equippedUserFrame ? (
            <TouchableOpacity style={fd.unequipBtn} onPress={handleUnequip}>
              <Text style={fd.unequipBtnText}>Lepas Frame</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={fd.equipBtn} onPress={handleEquip}>
              <Text style={fd.equipBtnText}>Pakai Sekarang</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {/* Duration selector */}
          <View style={fd.durRow}>
            {([1, 7, 30] as const).map(d => {
              const p = d === 1 ? frame.price_1d : d === 7 ? frame.price_7d : frame.price_30d;
              const selected = duration === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[fd.durBtn, selected && fd.durBtnSelected]}
                  onPress={() => setDuration(d)}
                >
                  {d === 7 && (
                    <View style={fd.popularBadge}>
                      <Text style={fd.popularText}>Populer</Text>
                    </View>
                  )}
                  <Text style={[fd.durLabel, selected && fd.durLabelSel]}>{d} Hari</Text>
                  <Text style={[fd.durPrice, selected && fd.durPriceSel]}>🪙 {formatCoin(p)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Buy button */}
          <TouchableOpacity onPress={handleBuy} disabled={buying} style={fd.buyBtn} activeOpacity={0.85}>
            {buying
              ? <ActivityIndicator color="#fff" />
              : <Text style={fd.buyBtnText}>Bayar Sekarang  🪙 {formatCoin(price)}</Text>
            }
          </TouchableOpacity>

          {/* Auto-equip note */}
          <View style={fd.autoRow}>
            <Ionicons name="checkmark-circle" size={18} color="#A78BFA" />
            <Text style={fd.autoText}>Pakaian Otomatis</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
}

// ── Entry Effect Detail ───────────────────────────────────────────────────────
interface EffectDetailProps {
  effect: ShopEntryEffect;
  effects: ShopEntryEffect[];
  effectIndex: number;
  coinBalance: number;
  ownedEffectIds: Set<string>;
  myEffects: UserEntryEffect[];
  onClose: () => void;
  onPurchased: () => void;
  onNavigate: (index: number) => void;
}

function EffectDetail({
  effect,
  effects,
  effectIndex,
  coinBalance,
  ownedEffectIds,
  myEffects,
  onClose,
  onPurchased,
  onNavigate,
}: EffectDetailProps) {
  const [duration, setDuration] = useState<1 | 7 | 30>(7);
  const [buying, setBuying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [lottieData, setLottieData] = useState<object | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [effect.id]);

  useEffect(() => {
    if (!effect.lottie_url) return;
    setLottieData(null);
    fetch(effect.lottie_url).then(r => r.json()).then(d => setLottieData(d)).catch(() => {});
  }, [effect.lottie_url]);

  const price = duration === 1 ? effect.price_1d : duration === 7 ? effect.price_7d : effect.price_30d;
  const isOwned = ownedEffectIds.has(effect.id);
  const equippedUserEffect = myEffects.find(e => e.effect_id === effect.id && e.is_equipped);

  const handleBuy = async () => {
    if (buying) return;
    if (coinBalance < price) {
      Alert.alert('Saldo Tidak Cukup', `Kamu butuh 🪙 ${formatCoin(price)} untuk membeli ini.`);
      return;
    }
    Alert.alert(
      'Konfirmasi Pembelian',
      `Beli "${effect.name}" selama ${duration} hari seharga 🪙 ${formatCoin(price)}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bayar',
          onPress: async () => {
            setBuying(true);
            const result = await purchaseEntryEffect(effect.id, duration);
            setBuying(false);
            if (result.success) {
              Alert.alert('Berhasil! 🎉', result.message);
              onPurchased();
            } else {
              Alert.alert('Gagal', result.message);
            }
          },
        },
      ]
    );
  };

  const handleEquip = async () => {
    const ue = myEffects.find(e => e.effect_id === effect.id);
    if (!ue) return;
    await equipEntryEffect(ue.id);
    onPurchased();
  };

  const handleUnequip = async () => {
    await unequipEntryEffect();
    onPurchased();
  };

  return (
    <Animated.View style={[fd.container, { opacity: fadeAnim }]}>
      <TouchableOpacity style={fd.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={26} color="#fff" />
      </TouchableOpacity>

      {effectIndex > 0 && (
        <TouchableOpacity style={[fd.arrow, fd.arrowLeft]} onPress={() => onNavigate(effectIndex - 1)}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
      )}
      {effectIndex < effects.length - 1 && (
        <TouchableOpacity style={[fd.arrow, fd.arrowRight]} onPress={() => onNavigate(effectIndex + 1)}>
          <Ionicons name="chevron-forward" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Lottie preview */}
      <View style={fd.previewArea}>
        <View style={ef.lottieBox}>
          {lottieData ? (
            <LottieView source={lottieData as any} autoPlay loop style={ef.lottieAnim} resizeMode="contain" />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 48 }}>✨</Text>
              <ActivityIndicator color="#A78BFA" size="small" />
            </View>
          )}
        </View>
      </View>

      <Text style={fd.frameName}>{effect.name}</Text>

      {isOwned ? (
        <View style={fd.ownedSection}>
          <Text style={fd.ownedText}>✅ Sudah dimiliki</Text>
          {equippedUserEffect ? (
            <TouchableOpacity style={fd.unequipBtn} onPress={handleUnequip}>
              <Text style={fd.unequipBtnText}>Lepas Efek</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={fd.equipBtn} onPress={handleEquip}>
              <Text style={fd.equipBtnText}>Pakai Sekarang</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={fd.durRow}>
            {([1, 7, 30] as const).map(d => {
              const p = d === 1 ? effect.price_1d : d === 7 ? effect.price_7d : effect.price_30d;
              const selected = duration === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[fd.durBtn, selected && fd.durBtnSelected]}
                  onPress={() => setDuration(d)}
                >
                  {d === 7 && (
                    <View style={fd.popularBadge}>
                      <Text style={fd.popularText}>Populer</Text>
                    </View>
                  )}
                  <Text style={[fd.durLabel, selected && fd.durLabelSel]}>{d} Hari</Text>
                  <Text style={[fd.durPrice, selected && fd.durPriceSel]}>🪙 {formatCoin(p)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={handleBuy} disabled={buying} style={fd.buyBtn} activeOpacity={0.85}>
            {buying
              ? <ActivityIndicator color="#fff" />
              : <Text style={fd.buyBtnText}>Bayar Sekarang  🪙 {formatCoin(price)}</Text>
            }
          </TouchableOpacity>

          <View style={fd.autoRow}>
            <Ionicons name="checkmark-circle" size={18} color="#A78BFA" />
            <Text style={fd.autoText}>Aktif Otomatis saat masuk room</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
}

export default function TokoModal({ visible, onClose, userAvatar, userInitial, username, onFrameChanged }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Bingkai');

  // ── Frames state ──
  const [shopFrames, setShopFrames] = useState<ShopFrame[]>([]);
  const [myFrames, setMyFrames] = useState<UserFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<ShopFrame | null>(null);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [showMyFrames, setShowMyFrames] = useState(false);

  // ── Effects state ──
  const [shopEffects, setShopEffects] = useState<ShopEntryEffect[]>([]);
  const [myEffects, setMyEffects] = useState<UserEntryEffect[]>([]);
  const [selectedEffect, setSelectedEffect] = useState<ShopEntryEffect | null>(null);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState(0);
  const [showMyEffects, setShowMyEffects] = useState(false);

  const [coinBalance, setCoinBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const ownedFrameIds = new Set(myFrames.map(f => f.frame_id));
  const ownedEffectIds = new Set(myEffects.map(e => e.effect_id));

  const loadData = useCallback(async () => {
    setLoading(true);
    const [frames, owned, effects, ownedEffects, bal] = await Promise.all([
      getShopFrames(),
      getMyFrames(),
      getShopEntryEffects(),
      getMyEntryEffects(),
      username ? getCreditBalance(username) : Promise.resolve(null),
    ]);
    setShopFrames(frames);
    setMyFrames(owned);
    setShopEffects(effects);
    setMyEffects(ownedEffects);
    setCoinBalance(bal ? Number(bal.balance) : 0);
    setLoading(false);
  }, [username]);

  useEffect(() => {
    if (visible) {
      loadData();
      if (username) invalidateAvatarCache(username);
    }
  }, [visible, loadData, username]);

  const handleFramePurchased = useCallback(async () => {
    await loadData();
    if (username) invalidateAvatarCache(username);
    try {
      const activeUrl = await getActiveFrame();
      onFrameChanged?.(activeUrl ?? null);
    } catch {
      onFrameChanged?.(null);
    }
  }, [loadData, onFrameChanged, username]);

  const handleEffectPurchased = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // ── Frames display list ──
  const displayFrames = showMyFrames
    ? myFrames.map(uf => shopFrames.find(sf => sf.id === uf.frame_id)).filter(Boolean) as ShopFrame[]
    : shopFrames;

  // ── Effects display list ──
  const displayEffects = showMyEffects
    ? myEffects.map(ue => shopEffects.find(se => se.id === ue.effect_id)).filter(Boolean) as ShopEntryEffect[]
    : shopEffects;

  const openFrame = (frame: ShopFrame, idx: number) => {
    setSelectedFrame(frame);
    setSelectedFrameIndex(idx);
  };

  const openEffect = (effect: ShopEntryEffect, idx: number) => {
    setSelectedEffect(effect);
    setSelectedEffectIndex(idx);
  };

  const isEffectsTab = activeTab === 'Efek Masuk';
  const showMy = isEffectsTab ? showMyEffects : showMyFrames;
  const setShowMy = isEffectsTab
    ? (v: boolean | ((prev: boolean) => boolean)) => setShowMyEffects(v)
    : (v: boolean | ((prev: boolean) => boolean)) => setShowMyFrames(v);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={ss.root}>

        {/* ── Header ── */}
        <View style={ss.header}>
          <TouchableOpacity onPress={onClose} style={ss.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={ss.backLabel}>Toko</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ss.myBtn, showMy && ss.myBtnActive]}
            onPress={() => setShowMy((v: boolean) => !v)}
          >
            <Ionicons name="shirt-outline" size={16} color={showMy ? '#fff' : '#A78BFA'} />
            <Text style={[ss.myBtnText, showMy && ss.myBtnTextActive]}>
              {isEffectsTab ? 'Efek Saya' : 'Pakaian Saya'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs ── */}
        <View style={ss.tabs}>
          {TABS.map(t => (
            <TouchableOpacity key={t} style={ss.tab} onPress={() => setActiveTab(t)}>
              <Text style={[ss.tabText, activeTab === t && ss.tabTextActive]}>{t}</Text>
              {activeTab === t && <View style={ss.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Coin balance ── */}
        <View style={ss.balanceRow}>
          <Text style={ss.balanceText}>🪙 {formatCoin(coinBalance)}</Text>
          <TouchableOpacity style={ss.topupBtn}>
            <Text style={ss.topupText}>Top up</Text>
          </TouchableOpacity>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={ss.center}>
            <ActivityIndicator color="#A78BFA" size="large" />
          </View>
        ) : isEffectsTab ? (
          displayEffects.length === 0 ? (
            <View style={ss.center}>
              <Text style={ss.emptyText}>
                {showMyEffects ? 'Belum ada efek masuk yang kamu miliki' : 'Belum ada efek masuk di toko'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayEffects}
              numColumns={2}
              keyExtractor={item => item.id}
              contentContainerStyle={ss.grid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const isOwned = ownedEffectIds.has(item.id);
                const userEffect = myEffects.find(e => e.effect_id === item.id);
                const expiry = showMyEffects && userEffect ? formatExpiryLabel(userEffect.expires_at) : null;
                const isEquipped = userEffect?.is_equipped ?? false;
                return (
                  <TouchableOpacity
                    style={ss.card}
                    activeOpacity={0.8}
                    onPress={() => openEffect(item, index)}
                  >
                    {isOwned && !showMyEffects && (
                      <View style={ss.ownedBadge}>
                        <Text style={ss.ownedBadgeText}>✓ Dimiliki</Text>
                      </View>
                    )}
                    {isEquipped && showMyEffects && (
                      <View style={[ss.ownedBadge, ss.equippedBadge]}>
                        <Text style={ss.ownedBadgeText}>▶ Dipakai</Text>
                      </View>
                    )}
                    <View style={ss.frameImgWrap}>
                      <FrameImage url={item.lottie_url} size={120} />
                    </View>
                    <Text style={ss.cardName} numberOfLines={2}>{item.name}</Text>
                    {expiry ? (
                      <View style={[ss.expiryRow, expiry.urgent && ss.expiryRowUrgent]}>
                        <Ionicons name="time-outline" size={11} color={expiry.urgent ? '#FCA5A5' : '#86EFAC'} />
                        <Text style={[ss.expiryText, expiry.urgent && ss.expiryTextUrgent]}>
                          {expiry.label}
                        </Text>
                      </View>
                    ) : (
                      <View style={ss.priceRow}>
                        <Text style={ss.cardPrice}>🪙 {formatCoin(item.price_1d)}</Text>
                        <Text style={ss.perDay}>/hari</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )
        ) : (
          displayFrames.length === 0 ? (
            <View style={ss.center}>
              <Text style={ss.emptyText}>
                {showMyFrames ? 'Belum ada frame yang kamu miliki' : 'Belum ada frame di toko'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayFrames}
              numColumns={2}
              keyExtractor={item => item.id}
              contentContainerStyle={ss.grid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const isOwned = ownedFrameIds.has(item.id);
                const userFrame = myFrames.find(f => f.frame_id === item.id);
                const expiry = showMyFrames && userFrame ? formatExpiryLabel(userFrame.expires_at) : null;
                const isEquipped = userFrame?.is_equipped ?? false;
                return (
                  <TouchableOpacity
                    style={ss.card}
                    activeOpacity={0.8}
                    onPress={() => openFrame(item, index)}
                  >
                    {isOwned && !showMyFrames && (
                      <View style={ss.ownedBadge}>
                        <Text style={ss.ownedBadgeText}>✓ Dimiliki</Text>
                      </View>
                    )}
                    {isEquipped && showMyFrames && (
                      <View style={[ss.ownedBadge, ss.equippedBadge]}>
                        <Text style={ss.ownedBadgeText}>▶ Dipakai</Text>
                      </View>
                    )}
                    <View style={ss.frameImgWrap}>
                      <FrameImage url={item.image_url} size={120} />
                    </View>
                    <Text style={ss.cardName} numberOfLines={2}>{item.name}</Text>
                    {expiry ? (
                      <View style={[ss.expiryRow, expiry.urgent && ss.expiryRowUrgent]}>
                        <Ionicons name="time-outline" size={11} color={expiry.urgent ? '#FCA5A5' : '#86EFAC'} />
                        <Text style={[ss.expiryText, expiry.urgent && ss.expiryTextUrgent]}>
                          {expiry.label}
                        </Text>
                      </View>
                    ) : (
                      <View style={ss.priceRow}>
                        <Text style={ss.cardPrice}>🪙 {formatCoin(item.price_1d)}</Text>
                        <Text style={ss.perDay}>/hari</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )
        )}

        {/* ── Frame Detail Modal ── */}
        <Modal
          visible={!!selectedFrame}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setSelectedFrame(null)}
        >
          <View style={fd.overlay}>
            {selectedFrame && (
              <FrameDetail
                frame={selectedFrame}
                frames={displayFrames}
                frameIndex={selectedFrameIndex}
                userAvatar={userAvatar}
                userInitial={userInitial}
                coinBalance={coinBalance}
                ownedFrameIds={ownedFrameIds}
                myFrames={myFrames}
                onClose={() => setSelectedFrame(null)}
                onPurchased={() => { handleFramePurchased(); setSelectedFrame(null); }}
                onNavigate={(idx) => {
                  setSelectedFrameIndex(idx);
                  setSelectedFrame(displayFrames[idx]);
                }}
              />
            )}
          </View>
        </Modal>

        {/* ── Effect Detail Modal ── */}
        <Modal
          visible={!!selectedEffect}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setSelectedEffect(null)}
        >
          <View style={fd.overlay}>
            {selectedEffect && (
              <EffectDetail
                effect={selectedEffect}
                effects={displayEffects}
                effectIndex={selectedEffectIndex}
                coinBalance={coinBalance}
                ownedEffectIds={ownedEffectIds}
                myEffects={myEffects}
                onClose={() => setSelectedEffect(null)}
                onPurchased={() => { handleEffectPurchased(); setSelectedEffect(null); }}
                onNavigate={(idx) => {
                  setSelectedEffectIndex(idx);
                  setSelectedEffect(displayEffects[idx]);
                }}
              />
            )}
          </View>
        </Modal>

      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const PURPLE_DARK  = '#0D0820';
const PURPLE_MID   = '#1A0A3B';
const ACCENT       = '#7C3AED';
const ACCENT_LIGHT = '#A78BFA';

const ss = StyleSheet.create({
  root:           { flex: 1, backgroundColor: PURPLE_DARK, paddingTop: 48 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel:      { color: '#fff', fontSize: 18, fontWeight: '700' },
  myBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(124,58,237,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: ACCENT },
  myBtnActive:    { backgroundColor: ACCENT },
  myBtnText:      { color: ACCENT_LIGHT, fontSize: 13, fontWeight: '600' },
  myBtnTextActive:{ color: '#fff' },
  tabs:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16 },
  tab:            { paddingVertical: 10, paddingHorizontal: 14, position: 'relative' },
  tabText:        { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  tabTextActive:  { color: '#fff' },
  tabUnderline:   { position: 'absolute', bottom: 0, left: 14, right: 14, height: 2, backgroundColor: ACCENT, borderRadius: 2 },
  balanceRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  balanceText:    { color: '#FFD700', fontSize: 14, fontWeight: '700' },
  topupBtn:       { backgroundColor: '#F59E0B', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 5 },
  topupText:      { color: '#000', fontSize: 13, fontWeight: '700' },
  grid:           { padding: 10, paddingBottom: 40 },
  card:           { flex: 1, margin: 6, borderRadius: 16, padding: 12, alignItems: 'center', backgroundColor: PURPLE_MID, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', position: 'relative' },
  ownedBadge:     { position: 'absolute', top: 8, right: 8, backgroundColor: '#16A34A', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, zIndex: 1 },
  equippedBadge:  { backgroundColor: '#7C3AED' },
  ownedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  frameImgWrap:   { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  frameImg:       { width: 120, height: 120 },
  frameImgPlaceholder: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  cardName:       { color: '#E0D7FF', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardPrice:      { color: '#FFD700', fontSize: 13, fontWeight: '700' },
  perDay:         { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  expiryRow:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(134,239,172,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  expiryRowUrgent:{ backgroundColor: 'rgba(252,165,165,0.15)' },
  expiryText:     { color: '#86EFAC', fontSize: 11, fontWeight: '600' },
  expiryTextUrgent:{ color: '#FCA5A5' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
});

const ef = StyleSheet.create({
  lottieBox: {
    width:           SW * 0.55,
    height:          SW * 0.55,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    20,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     'rgba(124,58,237,0.3)',
  },
  lottieAnim: {
    width:  '100%',
    height: '100%',
  },
});

const fd = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(5,2,20,0.97)', alignItems: 'center', justifyContent: 'center' },
  container:   { width: SW, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  closeBtn:    { position: 'absolute', top: 52, left: 20, zIndex: 10, padding: 8 },
  arrow:       { position: 'absolute', top: '42%', padding: 12, zIndex: 10 },
  arrowLeft:   { left: 8 },
  arrowRight:  { right: 8 },
  previewArea: { marginTop: 40, marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
  frameName:   { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 28, textAlign: 'center' },
  ownedSection:{ alignItems: 'center', gap: 16, width: '100%' },
  ownedText:   { color: '#4ADE80', fontSize: 16, fontWeight: '600' },
  durRow:      { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%' },
  durBtn:      { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', position: 'relative', minHeight: 80, justifyContent: 'center' },
  durBtnSelected: { backgroundColor: 'rgba(124,58,237,0.4)', borderColor: ACCENT },
  popularBadge:{ position: 'absolute', top: -10, backgroundColor: '#E879F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  popularText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  durLabel:    { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  durLabelSel: { color: '#fff' },
  durPrice:    { color: '#FFD700', fontSize: 12, fontWeight: '700', marginTop: 4 },
  durPriceSel: { color: '#FFD700' },
  buyBtn:      { width: '100%', borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginBottom: 16, backgroundColor: ACCENT },
  equipBtn:    { width: '100%', borderRadius: 30, paddingVertical: 14, alignItems: 'center', backgroundColor: ACCENT },
  equipBtnText:{ color: '#fff', fontSize: 16, fontWeight: '800' },
  unequipBtn:  { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: '#EF4444' },
  unequipBtnText:{ color: '#EF4444', fontWeight: '600', fontSize: 15 },
  buyBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  autoRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoText:    { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
});
