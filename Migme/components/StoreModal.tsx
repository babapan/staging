import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE } from '../services/auth';
import { getCreditBalance, formatCredit } from '../services/credit';
import { useAppTheme } from '../services/themeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_W - 48) / 3;

const GOLD = '#F9A825';
const RED  = '#E53935';

type TabKey = 'gifts' | 'stickers';

interface Gift {
  id: number;
  name: string;
  hotKey: string;
  price: number;
  currency: string;
  numSold: number;
}

interface StickerPack {
  id: number;
  name: string;
  description: string | null;
  price: number;
  type: number;
}

const SORT_OPTIONS = ['Terbaru', 'Populer', 'Harga ↑', 'Harga ↓'];

interface Props {
  visible: boolean;
  onClose: () => void;
  username: string | null;
}

export default function StoreModal({ visible, onClose, username }: Props) {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();

  const searchRef = useRef<TextInput>(null);
  const [tab, setTab]               = useState<TabKey>('gifts');
  const [gifts, setGifts]           = useState<Gift[]>([]);
  const [stickers, setStickers]     = useState<StickerPack[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance]           = useState(0);
  const [balanceCurrency, setBalanceCurrency] = useState('IDR');
  const [sortIdx, setSortIdx]       = useState(0);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<{ gifts?: Gift[]; stickers?: StickerPack[] } | null>(null);
  const [searching, setSearching]       = useState(false);
  const [recipientUsername, setRecipientUsername] = useState('');

  const fetchBalance = useCallback(async () => {
    if (!username) return;
    try {
      const credit = await getCreditBalance(username);
      setBalance(credit?.balance ?? 0);
      setBalanceCurrency(credit?.currency ?? 'IDR');
    } catch {}
  }, [username]);

  const fetchData = useCallback(async () => {
    try {
      const [giftsRes, stickersRes] = await Promise.all([
        fetch(`${API_BASE}/api/store/gifts`),
        fetch(`${API_BASE}/api/store/stickers`),
      ]);
      if (giftsRes.ok) {
        const d = await giftsRes.json();
        setGifts(d.gifts ?? []);
      }
      if (stickersRes.ok) {
        const d = await stickersRes.json();
        setStickers(d.stickers ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      Promise.all([fetchData(), fetchBalance()]).finally(() => setLoading(false));
    }
  }, [visible, fetchData, fetchBalance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchBalance()]);
    setRefreshing(false);
  }, [fetchData, fetchBalance]);

  const onSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/store/search?q=${encodeURIComponent(q.trim())}&type=${tab}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? {});
      }
    } catch {}
    setSearching(false);
  }, [tab]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults(null); return; }
    const timer = setTimeout(() => onSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, tab]);

  const sortedGifts = (): Gift[] => {
    const arr = [...gifts];
    switch (sortIdx) {
      case 1: return arr.sort((a, b) => b.numSold - a.numSold);
      case 2: return arr.sort((a, b) => a.price - b.price);
      case 3: return arr.sort((a, b) => b.price - a.price);
      default: return arr;
    }
  };

  const sortedStickers = (): StickerPack[] => {
    const arr = [...stickers];
    switch (sortIdx) {
      case 2: return arr.sort((a, b) => a.price - b.price);
      case 3: return arr.sort((a, b) => b.price - a.price);
      default: return arr;
    }
  };

  const buyGift = async (gift: Gift) => {
    if (!username) return;
    if (balance < gift.price) {
      Alert.alert('Kredit Tidak Cukup', `Kamu butuh ${formatCredit(gift.price, balanceCurrency)} tapi hanya punya ${formatCredit(balance, balanceCurrency)}.`, [{ text: 'OK' }]);
      return;
    }
    const toUser = recipientUsername.trim();
    const confirmMsg = toUser
      ? `Harga: ${formatCredit(gift.price, balanceCurrency)}\nDikirim ke: @${toUser}\nSaldo sekarang: ${formatCredit(balance, balanceCurrency)}\n\nLanjutkan?`
      : `Harga: ${formatCredit(gift.price, balanceCurrency)}\nSaldo sekarang: ${formatCredit(balance, balanceCurrency)}\n\nLanjutkan pembelian?`;
    Alert.alert(
      `Beli ${capitalize(gift.name)}`,
      confirmMsg,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Beli',
          onPress: async () => {
            setPurchasing(gift.id);
            try {
              const res = await fetch(`${API_BASE}/api/store/purchase/gift/${gift.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  recipientUsername: toUser || undefined,
                  message: '',
                  isPrivate: false,
                }),
              });
              const data = await res.json();
              if (res.ok) {
                setBalance(data.newBalance);
                Alert.alert('Berhasil!', data.message ?? `Gift "${gift.name}" berhasil dibeli!`);
              } else {
                Alert.alert('Gagal', data.message ?? 'Pembelian gagal');
              }
            } catch {
              Alert.alert('Error', 'Koneksi gagal, coba lagi.');
            } finally {
              setPurchasing(null);
            }
          },
        },
      ]
    );
  };

  const buySticker = async (pack: StickerPack) => {
    if (!username) return;
    if (pack.price <= 0) {
      Alert.alert('Gratis!', `Pack "${pack.name}" gratis — sudah tersedia.`);
      return;
    }
    if (balance < pack.price) {
      Alert.alert('Kredit Tidak Cukup', `Kamu butuh ${formatCredit(pack.price, balanceCurrency)} tapi hanya punya ${formatCredit(balance, balanceCurrency)}.`, [{ text: 'OK' }]);
      return;
    }
    Alert.alert(
      `Beli Pack "${pack.name}"`,
      `Harga: ${formatCredit(pack.price, balanceCurrency)}\nSaldo sekarang: ${formatCredit(balance, balanceCurrency)}\n\nLanjutkan pembelian?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Beli',
          onPress: async () => {
            setPurchasing(pack.id);
            try {
              const res = await fetch(`${API_BASE}/api/store/purchase/sticker/${pack.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (res.ok) {
                setBalance(data.newBalance);
                Alert.alert('Berhasil!', data.message ?? `Pack "${pack.name}" berhasil dibeli!`);
              } else {
                Alert.alert('Gagal', data.message ?? 'Pembelian gagal');
              }
            } catch {
              Alert.alert('Error', 'Koneksi gagal, coba lagi.');
            } finally {
              setPurchasing(null);
            }
          },
        },
      ]
    );
  };

  const s = makeStyles(theme);

  const renderGiftItem = ({ item }: { item: Gift }) => {
    const isBuying = purchasing === item.id;
    return (
      <TouchableOpacity
        style={s.giftCard}
        activeOpacity={0.75}
        onPress={() => buyGift(item)}
        testID={`card-gift-${item.id}`}
      >
        <Text style={s.giftEmoji}>{item.hotKey}</Text>
        <Text style={s.giftName} numberOfLines={1}>{capitalize(item.name)}</Text>
        <View style={s.priceRow}>
          <Ionicons name="diamond-outline" size={11} color={GOLD} />
          <Text style={s.priceText}>{item.price}</Text>
        </View>
        <TouchableOpacity
          style={[s.buyBtn, isBuying && s.buyBtnDisabled]}
          onPress={() => buyGift(item)}
          disabled={isBuying}
          testID={`button-buy-gift-${item.id}`}
        >
          {isBuying ? (
            <ActivityIndicator size="small" color={theme.textOnAccent} />
          ) : (
            <Text style={s.buyBtnText}>Beli</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderStickerItem = ({ item }: { item: StickerPack }) => {
    const isBuying = purchasing === item.id;
    const isFree = item.price <= 0;
    return (
      <View style={s.stickerCard} testID={`card-sticker-${item.id}`}>
        <View style={s.stickerIconWrap}>
          <Ionicons name="happy-outline" size={36} color={theme.accent} />
        </View>
        <View style={s.stickerInfo}>
          <Text style={s.stickerName} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={s.stickerDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={s.stickerPriceRow}>
            <Ionicons name="diamond-outline" size={12} color={isFree ? theme.accent : GOLD} />
            <Text style={[s.stickerPriceText, isFree && { color: theme.accent }]}>
              {isFree ? 'Gratis' : formatCredit(item.price, balanceCurrency)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.stickerBuyBtn, isFree && s.stickerBuyBtnFree, isBuying && s.buyBtnDisabled]}
          onPress={() => buySticker(item)}
          disabled={isBuying}
          testID={`button-buy-sticker-${item.id}`}
        >
          {isBuying ? (
            <ActivityIndicator size="small" color={theme.textOnAccent} />
          ) : (
            <Text style={s.buyBtnText}>{isFree ? 'Dapatkan' : 'Beli'}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.screenBg }}>

        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} testID="button-store-close">
            <Ionicons name="arrow-back" size={22} color={theme.textOnAccent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Store</Text>
          <View style={s.creditBadge}>
            <Ionicons name="diamond-outline" size={14} color={GOLD} />
            <Text style={s.creditText}>{formatCredit(balance, balanceCurrency)}</Text>
          </View>
        </View>

        {/* Balance row */}
        <View style={s.balanceBar}>
          <Ionicons name="wallet-outline" size={14} color={theme.textSecondary} />
          <Text style={s.balanceText}>Saldo: {formatCredit(balance, balanceCurrency)}</Text>
        </View>

        {/* Search bar */}
        <View style={s.searchRow}>
          <View style={s.searchBar}>
            <Ionicons name="search" size={15} color={theme.textSecondary} />
            <TextInput
              ref={searchRef}
              style={s.searchInput}
              placeholder={tab === 'gifts' ? 'Cari hadiah...' : 'Cari stiker...'}
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={onSearch}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="input-store-search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }} testID="button-clear-store-search">
                <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {(['gifts', 'stickers'] as TabKey[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tabItem, tab === t && s.tabItemActive]}
              onPress={() => setTab(t)}
              testID={`tab-store-${t}`}
            >
              <Ionicons
                name={t === 'gifts' ? 'gift-outline' : 'happy-outline'}
                size={16}
                color={tab === t ? theme.accent : theme.textSecondary}
              />
              <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
                {t === 'gifts' ? 'Hadiah' : 'Stiker'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sortScroll} contentContainerStyle={s.sortRow}>
          {SORT_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt}
              style={[s.sortChip, sortIdx === i && s.sortChipActive]}
              onPress={() => setSortIdx(i)}
              testID={`chip-sort-${i}`}
            >
              <Text style={[s.sortChipText, sortIdx === i && s.sortChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recipient row */}
        {tab === 'gifts' && !searchQuery && (
          <View style={s.recipientRow}>
            <Ionicons name="person-outline" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              style={s.recipientInput}
              placeholder="Kirim ke username (opsional)"
              placeholderTextColor={theme.textSecondary}
              value={recipientUsername}
              onChangeText={setRecipientUsername}
              autoCapitalize="none"
              autoCorrect={false}
              testID="input-store-recipient"
            />
            {recipientUsername.length > 0 && (
              <TouchableOpacity onPress={() => setRecipientUsername('')} testID="button-clear-recipient">
                <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={s.loadingText}>Memuat store...</Text>
          </View>
        ) : searching ? (
          <View style={s.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={s.loadingText}>Mencari...</Text>
          </View>
        ) : searchResults ? (
          tab === 'gifts' ? (
            <FlatList
              key="search-gifts"
              data={searchResults.gifts ?? []}
              keyExtractor={item => String(item.id)}
              renderItem={renderGiftItem}
              numColumns={3}
              contentContainerStyle={s.gridContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<EmptyState icon="search-outline" text={`Tidak ditemukan "${searchQuery}"`} theme={theme} />}
              testID="list-gifts-search"
            />
          ) : (
            <FlatList
              key="search-stickers"
              data={searchResults.stickers ?? []}
              keyExtractor={item => String(item.id)}
              renderItem={renderStickerItem}
              contentContainerStyle={s.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={s.separator} />}
              ListEmptyComponent={<EmptyState icon="search-outline" text={`Tidak ditemukan "${searchQuery}"`} theme={theme} />}
              testID="list-stickers-search"
            />
          )
        ) : tab === 'gifts' ? (
          <FlatList
            key="main-gifts"
            data={sortedGifts()}
            keyExtractor={item => String(item.id)}
            renderItem={renderGiftItem}
            numColumns={3}
            contentContainerStyle={s.gridContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
            ListEmptyComponent={<EmptyState icon="gift-outline" text="Tidak ada hadiah tersedia" theme={theme} />}
            testID="list-gifts"
          />
        ) : (
          <FlatList
            key="main-stickers"
            data={sortedStickers()}
            keyExtractor={item => String(item.id)}
            renderItem={renderStickerItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
            ListEmptyComponent={<EmptyState icon="happy-outline" text="Tidak ada stiker tersedia" theme={theme} />}
            testID="list-stickers"
          />
        )}
      </View>
    </Modal>
  );
}

function EmptyState({ icon, text, theme }: { icon: any; text: string; theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
      <Ionicons name={icon} size={52} color={theme.divider} />
      <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function makeStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    header: {
      backgroundColor: theme.headerBg,
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: theme.textOnAccent,
      fontSize: 18,
      fontWeight: 'bold',
      marginLeft: 4,
    },
    creditBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
      gap: 4,
    },
    creditText: {
      color: theme.textOnAccent,
      fontSize: 13,
      fontWeight: '700',
    },

    balanceBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    balanceText: {
      fontSize: 13,
      color: theme.textSecondary,
    },

    searchRow: {
      backgroundColor: theme.cardBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.inputBg,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: theme.textPrimary,
      padding: 0,
    },

    recipientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    recipientInput: {
      flex: 1,
      fontSize: 13,
      color: theme.textPrimary,
      padding: 0,
    },

    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: theme.accent,
    },
    tabLabel: {
      fontSize: 14,
      color: theme.textSecondary,
      fontWeight: '500',
    },
    tabLabelActive: {
      color: theme.accent,
      fontWeight: '700',
    },

    sortScroll: {
      backgroundColor: theme.cardBg,
      maxHeight: 44,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    sortRow: {
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    sortChip: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 16,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sortChipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    sortChipText: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    sortChipTextActive: {
      color: theme.textOnAccent,
      fontWeight: '600',
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
    },

    gridContent: {
      padding: 12,
      gap: 8,
    },
    giftCard: {
      width: ITEM_SIZE,
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      margin: 4,
      alignItems: 'center',
      padding: 10,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.25 : 0.06,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
    },
    giftEmoji: {
      fontSize: 36,
      marginBottom: 6,
    },
    giftName: {
      fontSize: 12,
      color: theme.textPrimary,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 4,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: 8,
    },
    priceText: {
      fontSize: 12,
      color: GOLD,
      fontWeight: '700',
    },
    buyBtn: {
      backgroundColor: theme.accent,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 5,
      alignItems: 'center',
      minWidth: 50,
    },
    buyBtnDisabled: {
      opacity: 0.5,
    },
    buyBtnText: {
      color: theme.textOnAccent,
      fontSize: 12,
      fontWeight: '700',
    },

    listContent: {
      padding: 12,
    },
    stickerCard: {
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.25 : 0.06,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: theme.isDark ? 1 : 0,
      borderColor: theme.border,
    },
    stickerIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    stickerInfo: {
      flex: 1,
      marginRight: 10,
    },
    stickerName: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
      marginBottom: 2,
    },
    stickerDesc: {
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
      marginBottom: 4,
    },
    stickerPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    stickerPriceText: {
      fontSize: 13,
      color: GOLD,
      fontWeight: '700',
    },
    stickerBuyBtn: {
      backgroundColor: theme.accent,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 7,
      alignItems: 'center',
      minWidth: 64,
    },
    stickerBuyBtnFree: {
      backgroundColor: theme.accent,
      opacity: 0.85,
    },

    separator: {
      height: 8,
    },
  });
}
