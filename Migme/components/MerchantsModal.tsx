import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { getSession } from '../services/storage';
import { API_BASE } from '../services/auth';
import { useAppTheme } from '../services/themeContext';

const MENTOR_BADGE = '#FF0000';
const HEAD_MENTOR_BADGE = '#8E24AA';
const MERCHANT_BADGE = '#1565C0';
const TAG_TOP    = '#FF6F00';

type MerchantFilter = 'all' | '2' | '3';

const MERCHANT_FILTERS: Array<{ value: MerchantFilter; label: string }> = [
  { value: 'all', label: 'All Merchants' },
  { value: '2', label: 'Mentor' },
  { value: '3', label: 'HeadMentor' },
];

function colorFromType(type: number | undefined): string | null {
  switch (type) {
    case 1: return '#FF0000';
    case 2: return '#FF69B4';
    default: return null;
  }
}

function merchantTypeMeta(type: number | undefined): { label: string; color: string } | null {
  if ((type ?? 0) >= 3) return { label: 'HeadMentor', color: HEAD_MENTOR_BADGE };
  if (type === 2) return { label: 'Mentor', color: MENTOR_BADGE };
  if (type === 1) return { label: 'Merchant', color: MERCHANT_BADGE };
  return null;
}

function merchantNameColor(merchant: Merchant): string {
  return merchant.usernameColor || colorFromType(merchant.usernameColorType) || (merchant.merchantType === 2 ? MENTOR_BADGE : '#990099');
}

function tagTypeMeta(type: number | undefined, accent: string): { label: string; color: string } {
  if (type === 1) return { label: 'TOP TAG',     color: TAG_TOP };
  return             { label: 'NON-TOP TAG', color: accent  };
}

function fmtValidity(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60)   return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}

function categoryColor(cat: string | null): string {
  switch ((cat ?? '').toLowerCase()) {
    case 'food':    return '#F9A825';
    case 'fashion': return '#E91E63';
    case 'tech':    return '#1565C0';
    case 'health':  return '#388E3C';
    default:        return '#00A8CC';
  }
}

interface Merchant {
  id: string; username: string; displayName: string; description: string | null;
  category: string | null; logoUrl: string | null; websiteUrl: string | null;
  status: number; usernameColor: string; usernameColorType: number;
  merchantType: number; mentor: string | null; referrer: string | null;
  totalPoints: number; createdAt: string;
  displayPicture?: string | null;
}
interface MerchantLocation {
  id: string; merchantUsername: string; name: string; address: string | null;
  phoneNumber: string | null; emailAddress: string | null; notes: string | null;
  countryId: number | null; country: string | null;
}
interface MerchantTag {
  id: string; merchantUsername: string; userId: string; type: number;
  status: number; amount: number | null; currency: string | null;
  expiresAt: string | null; createdAt: string;
}
interface MerchantDetail { merchant: Merchant; locations: MerchantLocation[]; }

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}
function fetchOpts(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' } : {};
}
async function fetchMerchants(search?: string, type?: MerchantFilter): Promise<Merchant[]> {
  try {
    const headers = await buildHeaders();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type && type !== 'all') params.set('type', type);
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/merchants${q}`, { headers, ...fetchOpts() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.merchants ?? [];
  } catch { return []; }
}
async function fetchMerchantDetail(username: string): Promise<MerchantDetail | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/merchants/${encodeURIComponent(username)}`, { headers, ...fetchOpts() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function fetchActiveTag(username: string): Promise<MerchantTag | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}/api/merchant-tags/tag/${encodeURIComponent(username)}`, { headers, ...fetchOpts() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tag ?? null;
  } catch { return null; }
}

function MerchantAvatar({ name, logoUrl, displayPicture, color, size = 44 }: { name: string; logoUrl: string | null; displayPicture?: string | null; color: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const imgUri = logoUrl || displayPicture || null;
  if (imgUri) {
    return <Image source={{ uri: imgUri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.35, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

interface Props { visible: boolean; onClose: () => void; }

export default function MerchantsModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const theme  = useAppTheme();

  const [merchants, setMerchants]         = useState<Merchant[]>([]);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [search, setSearch]               = useState('');
  const [merchantFilter, setMerchantFilter] = useState<MerchantFilter>('all');
  const [filterOpen, setFilterOpen]       = useState(false);
  const [selected, setSelected]           = useState<MerchantDetail | null>(null);
  const [activeTag, setActiveTag]         = useState<MerchantTag | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (q?: string, type: MerchantFilter = 'all', isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const result = await fetchMerchants(q, type);
    setMerchants(result);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) { load(undefined, merchantFilter); }
    else { setSearch(''); setMerchantFilter('all'); setFilterOpen(false); setSelected(null); setActiveTag(null); }
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(() => { if (visible) load(search || undefined, merchantFilter); }, 300);
    return () => clearTimeout(timer);
  }, [search, merchantFilter]);

  const openDetail = async (m: Merchant) => {
    setDetailLoading(true);
    const [detail, tag] = await Promise.all([fetchMerchantDetail(m.username), fetchActiveTag(m.username)]);
    setDetailLoading(false);
    if (detail) {
      setSelected(detail);
      setActiveTag(tag);
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    }
  };

  const closeDetail = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setSelected(null);
      setActiveTag(null);
    });
  };

  const detailTranslate = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  const s = makeStyles(theme);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={selected ? closeDetail : onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={selected ? closeDetail : onClose} style={s.backBtn} testID="button-merchants-back">
            <Ionicons name="arrow-back" size={24} color={theme.textOnAccent} />
          </TouchableOpacity>
          <Image source={require('../assets/icons/ad_solidmerch.png')} style={s.headerIcon} resizeMode="contain" />
          <Text style={s.headerTitle}>Merchants</Text>
        </View>

        {/* ── Search Bar ── */}
        {!selected && (
          <>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                style={s.searchInput}
                placeholder="Search merchants..."
                placeholderTextColor={theme.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="none"
                testID="input-merchant-search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} testID="button-clear-search">
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={s.filterWrap}>
              <TouchableOpacity
                style={s.filterButton}
                activeOpacity={0.75}
                onPress={() => setFilterOpen((open) => !open)}
                testID="button-merchant-filter"
              >
                <Text style={s.filterLabel}>{MERCHANT_FILTERS.find((f) => f.value === merchantFilter)?.label ?? 'All Merchants'}</Text>
                <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textPrimary} />
              </TouchableOpacity>
              {filterOpen && (
                <View style={s.filterMenu}>
                  {MERCHANT_FILTERS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[s.filterOption, merchantFilter === option.value && s.filterOptionActive]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setMerchantFilter(option.value);
                        setFilterOpen(false);
                      }}
                      testID={`button-merchant-filter-${option.value}`}
                    >
                      <Text style={[s.filterOptionText, merchantFilter === option.value && s.filterOptionTextActive]}>
                        {option.label}
                      </Text>
                      {merchantFilter === option.value && <Ionicons name="checkmark" size={16} color={theme.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Merchant List ── */}
        {!selected && (
          loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} size="large" />
          ) : merchants.length === 0 ? (
            <View style={s.emptyWrap}>
              <Image source={require('../assets/icons/ad_solidmerch.png')} style={s.emptyIcon} resizeMode="contain" />
              <Text style={s.emptyTitle}>No Merchants Found</Text>
              <Text style={s.emptySub}>{search ? `No results for "${search}"` : 'No merchants are registered yet.'}</Text>
            </View>
          ) : (
            <FlatList
              data={merchants}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => load(search || undefined, merchantFilter, true)}
                  tintColor={theme.accent}
                  colors={[theme.accent]}
                />
              }
              ItemSeparatorComponent={() => <View style={s.separator} />}
              renderItem={({ item }) => {
                const catColor  = categoryColor(item.category);
                const nameColor = merchantNameColor(item);
                const typeMeta  = merchantTypeMeta(item.merchantType);
                return (
                  <TouchableOpacity
                    style={s.merchantCard}
                    activeOpacity={0.7}
                    onPress={() => openDetail(item)}
                    testID={`merchant-card-${item.username}`}
                  >
                    <MerchantAvatar name={item.displayName} logoUrl={item.logoUrl} displayPicture={item.displayPicture} color={catColor} />
                    <View style={s.merchantInfo}>
                      <View style={s.merchantTopRow}>
                        <Text style={[s.merchantName, { color: nameColor }]} numberOfLines={1}>{item.displayName}</Text>
                        {typeMeta && (
                          <View style={[s.typeBadge, { backgroundColor: typeMeta.color }]}>
                            <Text style={s.typeBadgeText}>{typeMeta.label}</Text>
                          </View>
                        )}
                        {item.category && (
                          <View style={[s.categoryTag, { backgroundColor: catColor + '22', borderColor: catColor }]}>
                            <Text style={[s.categoryTagText, { color: catColor }]}>{item.category}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.merchantUsername}>@{item.username}</Text>
                      {item.description && <Text style={s.merchantDesc} numberOfLines={2}>{item.description}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.divider} />
                  </TouchableOpacity>
                );
              }}
            />
          )
        )}

        {/* ── Detail Loading Overlay ── */}
        {detailLoading && (
          <View style={[s.detailLoader, { backgroundColor: theme.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)' }]}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}

        {/* ── Detail Panel ── */}
        {selected && (
          <Animated.View style={[s.detailPanel, { transform: [{ translateX: detailTranslate }] }]}>
            <ScrollView
              contentContainerStyle={[s.detailContent, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Hero */}
              <View style={s.detailHero}>
                <MerchantAvatar
                  name={selected.merchant.displayName}
                  logoUrl={selected.merchant.logoUrl}
                  displayPicture={selected.merchant.displayPicture}
                  color={categoryColor(selected.merchant.category)}
                  size={72}
                />
                {merchantTypeMeta(selected.merchant.merchantType) && (
                  <View style={[s.typeBadgeLg, { backgroundColor: merchantTypeMeta(selected.merchant.merchantType)!.color }]}>
                    <Ionicons name={selected.merchant.merchantType === 2 ? 'ribbon' : selected.merchant.merchantType >= 3 ? 'star' : 'storefront'} size={12} color="#FFFFFF" />
                    <Text style={s.typeBadgeLgText}>{merchantTypeMeta(selected.merchant.merchantType)!.label}</Text>
                  </View>
                )}
                <Text style={[s.detailName, { color: merchantNameColor(selected.merchant) }]}>
                  {selected.merchant.displayName}
                </Text>
                <Text style={s.detailUsername}>@{selected.merchant.username}</Text>
                {selected.merchant.category && (
                  <View style={[s.categoryTag, { alignSelf: 'center', marginTop: 6,
                    backgroundColor: categoryColor(selected.merchant.category) + '22',
                    borderColor: categoryColor(selected.merchant.category) }]}>
                    <Text style={[s.categoryTagText, { color: categoryColor(selected.merchant.category) }]}>
                      {selected.merchant.category}
                    </Text>
                  </View>
                )}
              </View>

              {/* Active Merchant Tag */}
              {activeTag && activeTag.status === 1 && (
                <View style={[s.tagBanner, { borderColor: tagTypeMeta(activeTag.type, theme.accent).color }]}>
                  <View style={[s.tagDot, { backgroundColor: tagTypeMeta(activeTag.type, theme.accent).color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tagTypeText, { color: tagTypeMeta(activeTag.type, theme.accent).color }]}>
                      {tagTypeMeta(activeTag.type, theme.accent).label}
                    </Text>
                    {activeTag.amount != null && (
                      <Text style={s.tagAmountText}>
                        IDR {Math.round(Number(activeTag.amount)).toLocaleString('id-ID')}
                      </Text>
                    )}
                  </View>
                  {activeTag.expiresAt && (
                    <View style={s.tagExpiry}>
                      <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
                      <Text style={s.tagExpiryText}>
                        {new Date(activeTag.expiresAt) > new Date()
                          ? `Expires ${fmtValidity(Math.floor((new Date(activeTag.expiresAt).getTime() - Date.now()) / 1000))}`
                          : 'Expired'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Points Badge */}
              <View style={s.pointsBadge}>
                <Image source={require('../assets/icons/ad_solidmerch.png')} style={s.pointsIcon} resizeMode="contain" />
                <View>
                  <Text style={s.pointsValue}>{selected.merchant.totalPoints.toLocaleString()}</Text>
                  <Text style={s.pointsLabel}>Total Points Earned</Text>
                </View>
              </View>

              {/* Description */}
              {selected.merchant.description && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>About</Text>
                  <View style={s.infoCard}>
                    <Text style={s.descText}>{selected.merchant.description}</Text>
                  </View>
                </View>
              )}

              {/* Website */}
              {selected.merchant.websiteUrl && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Website</Text>
                  <TouchableOpacity style={s.infoCard} onPress={() => Linking.openURL(selected.merchant.websiteUrl!)} testID="button-merchant-website">
                    <View style={s.linkRow}>
                      <Ionicons name="globe-outline" size={18} color={theme.accent} style={{ marginRight: 8 }} />
                      <Text style={s.linkText} numberOfLines={1}>{selected.merchant.websiteUrl}</Text>
                      <Ionicons name="open-outline" size={14} color={theme.textSecondary} />
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Mentor / Referrer */}
              {(selected.merchant.mentor || selected.merchant.referrer) && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Network</Text>
                  <View style={s.infoCard}>
                    {selected.merchant.mentor && (
                      <View style={s.metaRow}>
                        <Ionicons name="person-circle-outline" size={16} color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={s.metaLabel}>Mentor</Text>
                        <Text style={[s.metaValue, { color: '#990099' }]}>@{selected.merchant.mentor}</Text>
                      </View>
                    )}
                    {selected.merchant.referrer && (
                      <View style={[s.metaRow, selected.merchant.mentor ? s.metaRowBorder : {}]}>
                        <Ionicons name="people-outline" size={16} color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={s.metaLabel}>Referrer</Text>
                        <Text style={[s.metaValue, { color: '#990099' }]}>@{selected.merchant.referrer}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Locations */}
              {selected.locations.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Locations ({selected.locations.length})</Text>
                  {selected.locations.map((loc) => (
                    <View key={loc.id} style={[s.infoCard, s.locationCard]}>
                      <View style={s.locationHeader}>
                        <Ionicons name="location" size={18} color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={s.locationName}>{loc.name}</Text>
                        {loc.country && (
                          <View style={s.countryTag}>
                            <Text style={[s.countryTagText, { color: theme.accent }]}>{loc.country}</Text>
                          </View>
                        )}
                      </View>
                      {loc.address && (
                        <View style={s.locationRow}>
                          <Ionicons name="map-outline" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
                          <Text style={s.locationText}>{loc.address}</Text>
                        </View>
                      )}
                      {loc.phoneNumber && (
                        <TouchableOpacity style={s.locationRow} onPress={() => Linking.openURL(`tel:${loc.phoneNumber}`)} testID={`button-loc-phone-${loc.id}`}>
                          <Ionicons name="call-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={[s.locationText, { color: theme.accent }]}>{loc.phoneNumber}</Text>
                        </TouchableOpacity>
                      )}
                      {loc.emailAddress && (
                        <TouchableOpacity style={s.locationRow} onPress={() => Linking.openURL(`mailto:${loc.emailAddress}`)} testID={`button-loc-email-${loc.id}`}>
                          <Ionicons name="mail-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={[s.locationText, { color: theme.accent }]}>{loc.emailAddress}</Text>
                        </TouchableOpacity>
                      )}
                      {loc.notes && <Text style={s.locationNotes}>{loc.notes}</Text>}
                    </View>
                  ))}
                </View>
              )}

              {selected.locations.length === 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Locations</Text>
                  <View style={[s.infoCard, { alignItems: 'center', paddingVertical: 20 }]}>
                    <Ionicons name="location-outline" size={32} color={theme.divider} />
                    <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 8 }}>No locations added yet</Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.screenBg },

    header: {
      backgroundColor: theme.headerBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
    },
    backBtn:     {},
    headerIcon:  { width: 22, height: 22, tintColor: theme.textOnAccent },
    headerTitle: { flex: 1, color: theme.textOnAccent, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },

    searchWrap: {
      backgroundColor: theme.inputBg,
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginVertical: 12,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary, padding: 0 },
    filterWrap: {
      marginHorizontal: 16,
      marginTop: -4,
      marginBottom: 12,
      zIndex: 5,
    },
    filterButton: {
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filterLabel: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
    filterMenu: {
      backgroundColor: theme.cardBg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      marginTop: 6,
      overflow: 'hidden',
    },
    filterOption: {
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    filterOptionActive: { backgroundColor: theme.accentSoft },
    filterOptionText: { fontSize: 13, color: theme.textPrimary },
    filterOptionTextActive: { fontWeight: '800', color: theme.accent },

    listContent:  { paddingHorizontal: 16, paddingBottom: 24 },
    separator:    { height: 1, backgroundColor: theme.divider },

    merchantCard: {
      backgroundColor: theme.cardBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 14,
    },
    merchantInfo:   { flex: 1, gap: 2 },
    merchantTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    merchantName:   { fontSize: 15, fontWeight: '700', flexShrink: 1 },
    merchantUsername:{ fontSize: 12, color: theme.textSecondary },
    merchantDesc:   { fontSize: 12, color: theme.textSecondary, lineHeight: 16, marginTop: 2 },

    typeBadge:     { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    typeBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
    typeBadgeLg:   { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, gap: 4, marginBottom: 4 },
    typeBadgeLgText:{ fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.8 },

    categoryTag:     { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
    categoryTagText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

    emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
    emptyIcon:  { width: 64, height: 64, tintColor: theme.divider, marginBottom: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textSecondary },
    emptySub:   { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    detailLoader: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailPanel: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.screenBg,
      top: 56,
    },
    detailContent: { paddingHorizontal: 16, paddingTop: 0 },

    detailHero: {
      backgroundColor: theme.cardBg,
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 24,
      marginBottom: 12,
      gap: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
    },
    detailName:     { fontSize: 22, fontWeight: '800', marginTop: 8, textAlign: 'center' },
    detailUsername: { fontSize: 14, color: theme.textSecondary },

    tagBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.cardBg,
      borderRadius: 10,
      borderWidth: 1.5,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 12,
      gap: 10,
    },
    tagDot:        { width: 8, height: 8, borderRadius: 4 },
    tagTypeText:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
    tagAmountText: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },
    tagExpiry:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
    tagExpiryText: { fontSize: 11, color: theme.textSecondary },

    pointsBadge: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
      marginBottom: 16,
      gap: 14,
    },
    pointsIcon:  { width: 32, height: 32, tintColor: theme.textOnAccent },
    pointsValue: { fontSize: 22, fontWeight: '800', color: theme.textOnAccent },
    pointsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

    section:      { marginBottom: 16 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },

    infoCard: {
      backgroundColor: theme.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    descText: { fontSize: 14, color: theme.textPrimary, lineHeight: 21, padding: 16 },

    metaRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    metaRowBorder: { borderTopWidth: 1, borderTopColor: theme.divider },
    metaLabel:     { fontSize: 13, color: theme.textSecondary, flex: 1 },
    metaValue:     { fontSize: 13, fontWeight: '600' },

    linkRow:  { flexDirection: 'row', alignItems: 'center', padding: 14 },
    linkText: { flex: 1, fontSize: 14, color: theme.accent, textDecorationLine: 'underline' },

    locationCard:   { marginBottom: 8, padding: 14 },
    locationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    locationName:   { fontSize: 15, fontWeight: '700', color: theme.textPrimary, flex: 1 },
    countryTag:     { backgroundColor: theme.accentSoft, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    countryTagText: { fontSize: 10, fontWeight: '600' },
    locationRow:    { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
    locationText:   { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    locationNotes:  { fontSize: 12, color: theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
  });
}
