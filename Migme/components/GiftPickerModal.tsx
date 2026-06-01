import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMOTICONS, STICKER_PACKS, EXTRA_EMOTICON_CATEGORIES, type EmoticonCategory } from '../constants/emoticons';
import { API_BASE } from '../services/auth';
import { useAppTheme } from '../services/themeContext';
import { updateGiftCache } from '../services/giftCache';

const { width: SCREEN_W } = Dimensions.get('window');

const GIFT_CATEGORIES = ['Semua', 'Populer', 'Cinta', 'Spesial', 'Lucu'];

// Standard (max99 default-pack) emoticons are the first 38 entries in EMOTICONS;
// the rest are game-card emoticons that should not appear in the picker.
const STANDARD_EMOTICONS = EMOTICONS.slice(0, 38);

const EMOTICON_PICKER_CATEGORIES: EmoticonCategory[] = [
  { id: 'standar', label: 'Standar', emoticons: STANDARD_EMOTICONS },
  ...EXTRA_EMOTICON_CATEGORIES,
];

function priceToIDR(amount: number, _currency?: string): string {
  return `🪙 ${Math.round(amount).toLocaleString('id-ID')}`;
}

export interface GiftItem {
  id: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  coins: number;
  currency: string;
  category: string;
}

export const GIFTS: GiftItem[] = [
  { id: 'g1',  name: 'Bunga',       emoji: '🌸', coins: 1000,  currency: 'IDR', category: 'Populer' },
  { id: 'g2',  name: 'Cake',        emoji: '🎂', coins: 2500,  currency: 'IDR', category: 'Populer' },
  { id: 'g3',  name: 'Balon',       emoji: '🎈', coins: 1500,  currency: 'IDR', category: 'Populer' },
  { id: 'g4',  name: 'Hadiah',      emoji: '🎁', coins: 3000,  currency: 'IDR', category: 'Populer' },
  { id: 'g5',  name: 'Hati',        emoji: '❤️',  coins: 500,   currency: 'IDR', category: 'Cinta' },
  { id: 'g6',  name: 'Hati Merah',  emoji: '💖', coins: 1000,  currency: 'IDR', category: 'Cinta' },
  { id: 'g7',  name: 'Mawar',       emoji: '🌹', imageUrl: '/gifts/rose.png', coins: 1500, currency: 'IDR', category: 'Cinta' },
  { id: 'g8',  name: 'Cupid',       emoji: '💘', coins: 2000,  currency: 'IDR', category: 'Cinta' },
  { id: 'g9',  name: 'Berlian',     emoji: '💎', coins: 10000, currency: 'IDR', category: 'Spesial' },
  { id: 'g10', name: 'Mahkota',     emoji: '👑', coins: 8000,  currency: 'IDR', category: 'Spesial' },
  { id: 'g11', name: 'Trofi',       emoji: '🏆', coins: 5000,  currency: 'IDR', category: 'Spesial' },
  { id: 'g12', name: 'Bintang',     emoji: '⭐', coins: 2000,  currency: 'IDR', category: 'Spesial' },
  { id: 'g13', name: 'Teddy',       emoji: '🧸', coins: 3500,  currency: 'IDR', category: 'Lucu' },
  { id: 'g14', name: 'Unicorn',     emoji: '🦄', coins: 4500,  currency: 'IDR', category: 'Lucu' },
  { id: 'g15', name: 'Anjing',      emoji: '🐶', coins: 2000,  currency: 'IDR', category: 'Lucu' },
  { id: 'g16', name: 'Kucing',      emoji: '🐱', coins: 2000,  currency: 'IDR', category: 'Lucu' },
  { id: 'g17', name: 'Pizza',       emoji: '🍕', coins: 1500,  currency: 'IDR', category: 'Lucu' },
  { id: 'g18', name: 'Es Krim',     emoji: '🍦', coins: 1000,  currency: 'IDR', category: 'Lucu' },
  { id: 'g19', name: 'Alien',       emoji: '👾', coins: 4000,  currency: 'IDR', category: 'Spesial' },
  { id: 'g20', name: 'Roket',       emoji: '🚀', coins: 6000,  currency: 'IDR', category: 'Spesial' },
  { id: 'g21', name: 'Matahari',    emoji: '🌟', coins: 3500,  currency: 'IDR', category: 'Populer' },
  { id: 'g22', name: 'Pelangi',     emoji: '🌈', coins: 4000,  currency: 'IDR', category: 'Populer' },
  { id: 'g23', name: 'Cincin',      emoji: '💍', coins: 9000,  currency: 'IDR', category: 'Cinta' },
  { id: 'g24', name: 'Coklat',      emoji: '🍫', coins: 1200,  currency: 'IDR', category: 'Cinta' },
];

type MainTab = 'gifts' | 'emoticons' | 'stickers';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectEmoticon: (unicode: string) => void;
  onSelectGift: (gift: GiftItem) => void;
  onSelectSticker: (stickerKey: string, label: string) => void;
  creditAmount: number;
  currency: string;
  recipientName?: string;
  // Which tab to show first when the modal opens. Defaults to 'gifts'.
  initialTab?: MainTab;
  // When true, only the emoticon picker is shown (no top tab bar). Used by
  // the dedicated emoticon icon in the chat input bar.
  emoticonOnly?: boolean;
}

const GIFT_COL = 4;
const GIFT_ITEM_W = (SCREEN_W - 24) / GIFT_COL;
const EMOTICON_COL = 5;
const EMOTICON_ITEM_W = (SCREEN_W - 16) / EMOTICON_COL;
const STICKER_COL = 2;
const STICKER_ITEM_W = (SCREEN_W - 24) / STICKER_COL;

export default function GiftPickerModal({ visible, onClose, onSelectEmoticon, onSelectGift, onSelectSticker, creditAmount, currency, recipientName, initialTab, emoticonOnly }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const [mainTab, setMainTab] = useState<MainTab>(emoticonOnly ? 'emoticons' : (initialTab ?? 'gifts'));

  // Reset to the requested tab every time the modal becomes visible so the
  // emoticon icon and the gift icon each open the right view.
  useEffect(() => {
    if (visible) {
      setMainTab(emoticonOnly ? 'emoticons' : (initialTab ?? 'gifts'));
    }
  }, [visible, initialTab, emoticonOnly]);
  const [giftCat, setGiftCat] = useState('Semua');
  const [emoticonCat, setEmoticonCat] = useState('standar');
  const [stickerPack, setStickerPack] = useState(0);
  const [selectedGift, setSelectedGift] = useState<GiftItem | null>(null);
  const [liveGifts, setLiveGifts] = useState<GiftItem[]>(GIFTS);
  const [giftsLoading, setGiftsLoading] = useState(false);

  // Fetch gifts from API so ImageKit images show up
  useEffect(() => {
    if (!visible) return;
    setGiftsLoading(true);
    fetch(`${API_BASE}/api/store/gifts`)
      .then(r => r.json())
      .then(data => {
        const apiGifts: any[] = data.gifts ?? [];
        if (apiGifts.length > 0) {
          const mapped: GiftItem[] = apiGifts.map((g: any) => {
            const staticMatch = GIFTS.find(s => s.name.toLowerCase() === (g.name ?? '').toLowerCase());
            return {
              id: String(g.id),
              name: g.name ?? '',
              emoji: g.hotKey ?? staticMatch?.emoji ?? '🎁',
              imageUrl: g.location64x64Png ?? staticMatch?.imageUrl,
              coins: g.price ?? staticMatch?.coins ?? 0,
              currency: g.currency ?? staticMatch?.currency ?? 'IDR',
              category: staticMatch?.category ?? 'Populer',
            };
          });
          setLiveGifts(mapped);
          updateGiftCache(mapped.map(g => ({ name: g.name, emoji: g.emoji, imageUrl: g.imageUrl })));
        }
      })
      .catch(() => {})
      .finally(() => setGiftsLoading(false));
  }, [visible]);

  const filteredGifts = giftCat === 'Semua'
    ? liveGifts
    : liveGifts.filter(g => g.category === giftCat);

  const currentPack = STICKER_PACKS[stickerPack];

  const balanceStr = `🪙 ${Math.round(creditAmount).toLocaleString('id-ID')}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { backgroundColor: theme.cardBg, paddingBottom: insets.bottom || 8 }]}>

          {/* ── Main Tab Bar ──
              In emoticonOnly mode, the bar collapses to a title + close
              button because the only content shown is the emoticon picker. */}
          <View style={[styles.mainTabBar, { backgroundColor: theme.cardBg }]}>
            {emoticonOnly ? (
              <>
                <View style={[styles.mainTabBtn, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="happy-outline" size={20} color={theme.accent} />
                  <Text style={[styles.mainTabTxt, styles.mainTabTxtActive, { color: theme.accent }]}>Emoticon</Text>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.mainTabBtn, mainTab === 'gifts' && { backgroundColor: theme.accentSoft }]}
                  onPress={() => { setMainTab('gifts'); setSelectedGift(null); }}
                  testID="tab-gifts"
                >
                  <Ionicons name="gift-outline" size={20} color={mainTab === 'gifts' ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.mainTabTxt, { color: mainTab === 'gifts' ? theme.accent : theme.textSecondary }, mainTab === 'gifts' && styles.mainTabTxtActive]}>Gift</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mainTabBtn, mainTab === 'stickers' && { backgroundColor: theme.accentSoft }]}
                  onPress={() => { setMainTab('stickers'); setSelectedGift(null); }}
                  testID="tab-stickers"
                >
                  <Ionicons name="images-outline" size={20} color={mainTab === 'stickers' ? theme.accent : theme.textSecondary} />
                  <Text style={[styles.mainTabTxt, { color: mainTab === 'stickers' ? theme.accent : theme.textSecondary }, mainTab === 'stickers' && styles.mainTabTxtActive]}>Sticker</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={{ flex: 1 }} />

            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="button-close-picker">
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.divider }]} />

          {/* ── GIFTS TAB ── */}
          {mainTab === 'gifts' && (
            <View style={styles.tabContent}>
              {/* Credit balance */}
              <View style={styles.balanceRow}>
                <Ionicons name="wallet-outline" size={14} color="#27AE60" />
                <Text style={styles.balanceIDR} testID="text-gift-balance">{balanceStr}</Text>
              </View>

              {/* Category tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}>
                {GIFT_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catBtn,
                      { backgroundColor: theme.inputBg, borderColor: 'transparent' },
                      giftCat === cat && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    ]}
                    onPress={() => { setGiftCat(cat); setSelectedGift(null); }}
                    testID={`gift-cat-${cat}`}
                  >
                    <Text style={[styles.catTxt, { color: giftCat === cat ? theme.accent : theme.textSecondary }, giftCat === cat && styles.catTxtActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Gift grid */}
              {giftsLoading && (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={theme.accent} />
                </View>
              )}
              <FlatList
                data={filteredGifts}
                keyExtractor={g => g.id}
                numColumns={GIFT_COL}
                style={styles.giftGrid}
                contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 8 }}
                renderItem={({ item }) => {
                  const resolvedImageUrl = item.imageUrl
                    ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${API_BASE}${item.imageUrl}`)
                    : null;
                  return (
                    <View
                      style={styles.giftCell}
                      testID={`gift-item-${item.id}`}
                    >
                      {resolvedImageUrl ? (
                        <Image
                          source={{ uri: resolvedImageUrl }}
                          style={styles.giftImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={styles.giftEmoji}>{item.emoji}</Text>
                      )}
                      <Text style={[styles.giftName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.giftPriceIDR}>{priceToIDR(item.coins, item.currency)}</Text>
                    </View>
                  );
                }}
              />

              {/* Send button */}
              {selectedGift && (
                <View style={[styles.sendGiftBar, { backgroundColor: theme.drawerBg, borderTopColor: theme.divider }]}>
                  <Text style={[styles.sendGiftName, { color: theme.textPrimary }]}>
                    {selectedGift.imageUrl ? '' : selectedGift.emoji + ' '}{selectedGift.name}
                  </Text>
                  <View style={styles.sendGiftPriceCol}>
                    <Text style={styles.sendGiftPriceIDR} testID="text-send-price-idr">{priceToIDR(selectedGift.coins, selectedGift.currency)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.sendGiftBtn, { backgroundColor: theme.accent }, !recipientName && styles.sendGiftBtnAll]}
                    onPress={() => { onSelectGift(selectedGift); setSelectedGift(null); }}
                    testID="button-send-gift"
                  >
                    <Text style={[styles.sendGiftBtnTxt, { color: theme.textOnAccent }]}>
                      {recipientName ? `Kirim ke ${recipientName}` : '🎊 Gift ke Semua'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── EMOTICONS TAB ── */}
          {mainTab === 'emoticons' && (
            <View style={styles.tabContent}>
              {/* Emoticon category tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
                contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}
              >
                {EMOTICON_PICKER_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catBtn,
                      { backgroundColor: theme.inputBg, borderColor: 'transparent' },
                      emoticonCat === cat.id && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    ]}
                    onPress={() => setEmoticonCat(cat.id)}
                    testID={`emoticon-cat-${cat.id}`}
                  >
                    <Text style={[
                      styles.catTxt,
                      { color: emoticonCat === cat.id ? theme.accent : theme.textSecondary },
                      emoticonCat === cat.id && styles.catTxtActive,
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FlatList
                key={emoticonCat}
                data={(EMOTICON_PICKER_CATEGORIES.find(c => c.id === emoticonCat)?.emoticons) ?? []}
                keyExtractor={e => e.key}
                numColumns={EMOTICON_COL}
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.emoticonCell, { width: EMOTICON_ITEM_W }]}
                    onPress={() => onSelectEmoticon(item.unicode || (item.hotkeys[0] ?? ''))}
                    testID={`emoticon-${item.key}`}
                  >
                    <Image source={item.image as any} style={styles.emoticonImg} resizeMode="contain" />
                    <Text style={[styles.emoticonLabel, { color: theme.textSecondary }]} numberOfLines={1}>{item.label}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* ── STICKERS TAB ── */}
          {mainTab === 'stickers' && (
            <View style={styles.tabContent}>
              {/* Pack selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.packScroll} contentContainerStyle={{ paddingHorizontal: 8, gap: 8 }}>
                {STICKER_PACKS.map((pack, idx) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={[
                      styles.packThumb,
                      { borderColor: 'transparent' },
                      stickerPack === idx && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    ]}
                    onPress={() => setStickerPack(idx)}
                    testID={`sticker-pack-${pack.id}`}
                  >
                    <Image source={pack.coverImage as any} style={styles.packThumbImg} resizeMode="contain" />
                    <Text style={[styles.packThumbTxt, { color: stickerPack === idx ? theme.accent : theme.textSecondary }, stickerPack === idx && styles.packThumbTxtActive]} numberOfLines={1}>
                      {pack.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={[styles.divider, { backgroundColor: theme.divider }]} />

              {/* Sticker grid */}
              <FlatList
                key={currentPack.id}
                data={currentPack.stickers}
                keyExtractor={s => s.key}
                numColumns={STICKER_COL}
                contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.stickerCell, { width: STICKER_ITEM_W, backgroundColor: theme.inputBg }]}
                    onPress={() => onSelectSticker(item.key, item.label)}
                    testID={`sticker-${item.key}`}
                  >
                    <Image source={item.image as any} style={styles.stickerImg} resizeMode="contain" />
                    <Text style={[styles.stickerLabel, { color: theme.textSecondary }]} numberOfLines={1}>{item.label}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '75%',
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },

  /* ── Main Tab Bar ── */
  mainTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  mainTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    marginRight: 4,
  },
  mainTabTxt: {
    fontSize: 13,
  },
  mainTabTxtActive: {
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  divider: {
    height: 1,
  },

  tabContent: {
    flex: 1,
  },

  /* ── Balance row ── */
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  balanceIDR: {
    fontSize: 13,
    color: '#27AE60',
    fontWeight: '700',
  },

  /* ── Gift Category Tabs ── */
  catScroll: {
    flexGrow: 0,
    paddingVertical: 6,
  },
  catBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  catTxt: {
    fontSize: 12,
  },
  catTxtActive: {
    fontWeight: '700',
  },

  /* ── Gift Grid ── */
  giftGrid: {
    flex: 1,
  },
  giftCell: {
    width: GIFT_ITEM_W,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    margin: 2,
  },
  giftEmoji: {
    fontSize: 34,
    lineHeight: 42,
  },
  giftImage: {
    width: 52,
    height: 52,
    borderRadius: 4,
  },
  giftName: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  giftPriceIDR: {
    fontSize: 10,
    color: '#27AE60',
    fontWeight: '600',
    marginTop: 2,
  },

  /* ── Send Gift Bar ── */
  sendGiftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  sendGiftName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  sendGiftPriceCol: {
    alignItems: 'flex-end',
  },
  sendGiftPriceIDR: {
    fontSize: 13,
    color: '#27AE60',
    fontWeight: '700',
  },
  sendGiftBtn: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sendGiftBtnAll: {
    backgroundColor: '#B45309',
  },
  sendGiftBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* ── Emoticons ── */
  emoticonCell: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    margin: 1,
  },
  emoticonImg: {
    width: 44,
    height: 44,
  },
  emoticonLabel: {
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },

  /* ── Sticker Pack Selector ── */
  packScroll: {
    flexGrow: 0,
    paddingVertical: 8,
  },
  packThumb: {
    alignItems: 'center',
    width: 72,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderWidth: 1.5,
  },
  packThumbImg: {
    width: 60,
    height: 36,
  },
  packThumbTxt: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  packThumbTxtActive: {
    fontWeight: '700',
  },

  /* ── Sticker Grid ── */
  stickerCell: {
    alignItems: 'center',
    padding: 6,
    margin: 3,
    borderRadius: 10,
  },
  stickerImg: {
    width: STICKER_ITEM_W - 24,
    height: (STICKER_ITEM_W - 24) * 0.6,
  },
  stickerLabel: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
});
