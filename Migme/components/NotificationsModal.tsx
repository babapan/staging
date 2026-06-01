import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_BASE } from '../services/auth';
import { getSession } from '../services/storage';
import { useAppTheme, type AppTheme } from '../services/themeContext';

interface Notification {
  id: string;
  username: string;
  type: string;
  subject: string | null;
  message: string;
  status: string | number;
  createdAt?: string;
  referenceId?: string | null;
}

interface SystemAlert {
  id: string;
  message: string;
  status?: number;
}

interface ContactRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromDisplayName: string | null;
  toUserId: string;
  toUsername: string;
  status: string;
  createdAt?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

async function buildHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (Platform.OS !== 'web') {
    const cookie = await getSession();
    if (cookie) headers['Cookie'] = cookie;
  }
  return headers;
}

function fetchOpts(): RequestInit {
  return Platform.OS === 'web' ? { credentials: 'include' as RequestCredentials } : {};
}

type Tab = 'alerts' | 'requests';

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.screenBg },

    header: {
      backgroundColor: t.headerBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 14,
    },
    backBtn: { padding: 6, marginRight: 4 },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitle: { color: t.textOnAccent, fontSize: 17, fontWeight: '700' },
    badge: {
      backgroundColor: '#E53935',
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
      paddingHorizontal: 4,
    },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    markBtn: {
      backgroundColor: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    markText: { color: t.textOnAccent, fontSize: 12, fontWeight: '600' },

    tabBar: {
      flexDirection: 'row',
      backgroundColor: t.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: t.divider,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      gap: 4,
    },
    tabBtnActive: {
      borderBottomColor: t.accent,
    },
    tabTxt: { fontSize: 13, color: t.textSecondary, fontWeight: '500' },
    tabTxtActive: { color: t.accent, fontWeight: '700' },
    tabBadge: {
      backgroundColor: '#E53935',
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      marginLeft: 2,
    },
    tabBadgeTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },

    reqCard: {
      flexDirection: 'row',
      backgroundColor: t.cardBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderLeftWidth: 4,
      borderLeftColor: t.accent,
      shadowColor: '#000',
      shadowOpacity: t.isDark ? 0.3 : 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    reqAvatarWrap: { marginRight: 12 },
    reqAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.headerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reqAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    reqBody: { flex: 1 },
    reqName: { fontSize: 15, fontWeight: '700', color: t.textPrimary, marginBottom: 1 },
    reqSub: { fontSize: 12, color: t.textSecondary, marginBottom: 2 },
    reqDesc: { fontSize: 13, color: t.textSecondary, marginBottom: 8 },
    reqButtons: { flexDirection: 'row', gap: 8 },
    btnAccept: {
      backgroundColor: t.headerBg,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 7,
      minWidth: 80,
      alignItems: 'center',
    },
    btnReject: {
      backgroundColor: t.cardBg,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderWidth: 1.5,
      borderColor: t.border,
      minWidth: 60,
      alignItems: 'center',
    },
    btnBusy: { opacity: 0.6 },
    btnAcceptTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    btnRejectTxt: { color: t.textSecondary, fontWeight: '600', fontSize: 13 },
    reqTime: { fontSize: 10, color: t.textSecondary, marginLeft: 6, marginTop: 2 },

    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.cardBg,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 10,
      padding: 12,
      shadowColor: '#000',
      shadowOpacity: t.isDark ? 0.2 : 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    itemUnread: {
      backgroundColor: t.accentSoft,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      position: 'relative',
    },
    dot: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#E53935',
      borderWidth: 1,
      borderColor: t.cardBg,
    },
    itemBody: { flex: 1 },
    subject: {
      fontSize: 13,
      fontWeight: '700',
      color: t.textPrimary,
      marginBottom: 2,
    },
    message: {
      fontSize: 14,
      color: t.textPrimary,
      lineHeight: 20,
    },
    time: { fontSize: 11, color: t.textSecondary, marginTop: 4 },

    sysSection: {
      backgroundColor: t.isDark ? 'rgba(255,193,7,0.1)' : '#FFF8E1',
      padding: 12,
      margin: 12,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: '#FFC107',
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: t.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    sysAlert: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
    sysMsg: { flex: 1, fontSize: 13, color: t.textPrimary },

    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingTop: 60,
    },
    emptyText: { fontSize: 15, color: t.textSecondary },

    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    fab: {
      position: 'absolute',
      right: 20,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
  });
}

export default function NotificationsModal({ visible, onClose }: Props) {
  const theme  = useAppTheme();
  const insets = useSafeAreaInsets();
  const s      = makeStyles(theme);
  const router = useRouter();

  const [tab, setTab]                     = useState<Tab>('requests');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemAlerts, setSystemAlerts]   = useState<SystemAlert[]>([]);
  const [unread, setUnread]               = useState(0);
  const [contactReqs, setContactReqs]     = useState<ContactRequest[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadingReqs, setLoadingReqs]     = useState(false);
  const [marking, setMarking]             = useState(false);
  const [processingId, setProcessingId]   = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/uns/notifications/me?limit=50`, {
        headers,
        ...fetchOpts(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setSystemAlerts(data.systemAlerts ?? []);
      setUnread(data.unread ?? 0);
    } catch {}
    setLoading(false);
  }, []);

  const fetchContactRequests = useCallback(async () => {
    setLoadingReqs(true);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/contacts/requests`, {
        headers,
        ...fetchOpts(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setContactReqs(data.incoming ?? []);
    } catch {}
    setLoadingReqs(false);
  }, []);

  useEffect(() => {
    if (visible) {
      fetchNotifications();
      fetchContactRequests();
    }
  }, [visible, fetchNotifications, fetchContactRequests]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      const headers = await buildHeaders();
      await fetch(`${API_BASE}/api/uns/notifications/me/read-all`, {
        method: 'PATCH',
        headers,
        ...fetchOpts(),
      });
      await fetchNotifications();
    } catch {}
    setMarking(false);
  };

  const handleAccept = async (req: ContactRequest) => {
    setProcessingId(req.id);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/contacts/requests/${req.id}/accept`, {
        method: 'POST',
        headers,
        ...fetchOpts(),
      });
      if (res.ok) setContactReqs(prev => prev.filter(r => r.id !== req.id));
    } catch {}
    setProcessingId(null);
  };

  const handleReject = async (req: ContactRequest) => {
    setProcessingId(req.id);
    try {
      const headers = await buildHeaders();
      const res = await fetch(`${API_BASE}/api/contacts/requests/${req.id}/reject`, {
        method: 'POST',
        headers,
        ...fetchOpts(),
      });
      if (res.ok) setContactReqs(prev => prev.filter(r => r.id !== req.id));
    } catch {}
    setProcessingId(null);
  };

  const isUnread = (n: Notification) =>
    n.status === 'PENDING' || n.status === 0 || n.status === 1;

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diff < 60) return 'baru saja';
      if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h lalu`;
      return `${Math.floor(diff / 86400)}h lalu`;
    } catch { return ''; }
  };

  const getAlertIcon = (item: Notification): { name: string; color: string } => {
    const subj = (item.subject ?? '').toLowerCase();
    if (subj === 'gift received') return { name: 'gift', color: '#E91E63' };
    if (subj === 'mention') return { name: 'at-circle', color: '#9C27B0' };
    if (subj === 'comment') return { name: 'chatbubble-ellipses', color: '#1976D2' };
    if (subj === 'received credit') return { name: 'cash', color: '#388E3C' };
    return { name: 'notifications', color: isUnread(item) ? theme.accent : theme.textSecondary };
  };

  const isNavigable = (item: Notification) => {
    const subj = (item.subject ?? '').toLowerCase();
    return subj === 'comment' || subj === 'mention';
  };

  const handleAlertPress = (item: Notification) => {
    if (!isNavigable(item)) return;
    onClose();
    if (item.referenceId) {
      router.push({
        pathname: '/(home)/feed',
        params: { openPostId: item.referenceId },
      } as any);
    } else {
      router.push('/(home)/feed' as any);
    }
  };

  const renderAlert = ({ item }: { item: Notification }) => {
    const icon = getAlertIcon(item);
    const navigable = isNavigable(item);
    const Wrapper = navigable ? TouchableOpacity : View;
    return (
      <Wrapper
        style={[s.item, isUnread(item) && s.itemUnread]}
        testID={`notification-item-${item.id}`}
        {...(navigable ? { onPress: () => handleAlertPress(item), activeOpacity: 0.7 } : {})}
      >
        <View style={s.iconWrap}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
          {isUnread(item) && <View style={s.dot} />}
        </View>
        <View style={s.itemBody}>
          {item.subject ? (
            <Text style={s.subject} numberOfLines={1}>{item.subject}</Text>
          ) : null}
          <Text style={s.message} numberOfLines={3}>{item.message}</Text>
          <Text style={s.time}>{formatTime(item.createdAt)}</Text>
        </View>
        {navigable && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.textSecondary}
            style={{ alignSelf: 'center', marginLeft: 4 }}
          />
        )}
      </Wrapper>
    );
  };

  const renderRequest = (req: ContactRequest) => {
    const busy = processingId === req.id;
    const name = req.fromDisplayName || req.fromUsername;
    return (
      <View key={req.id} style={s.reqCard} testID={`contact-request-${req.id}`}>
        <View style={s.reqAvatarWrap}>
          <View style={s.reqAvatar}>
            <Text style={s.reqAvatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        </View>
        <View style={s.reqBody}>
          <Text style={s.reqName} numberOfLines={1}>{name}</Text>
          <Text style={s.reqSub} numberOfLines={1}>@{req.fromUsername}</Text>
          <Text style={s.reqDesc}>Ingin berteman denganmu</Text>
          <View style={s.reqButtons}>
            <TouchableOpacity
              style={[s.btnAccept, busy && s.btnBusy]}
              onPress={() => handleAccept(req)}
              disabled={busy}
              testID={`button-accept-${req.id}`}
            >
              {busy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnAcceptTxt}>Terima</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnReject, busy && s.btnBusy]}
              onPress={() => handleReject(req)}
              disabled={busy}
              testID={`button-reject-${req.id}`}
            >
              <Text style={s.btnRejectTxt}>Tolak</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.reqTime}>{formatTime(req.createdAt)}</Text>
      </View>
    );
  };

  const reqCount = contactReqs.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={onClose}
            style={s.backBtn}
            testID="button-notifications-back"
          >
            <Ionicons name="home" size={22} color={theme.textOnAccent} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Ionicons name="notifications" size={18} color={theme.textOnAccent} style={{ marginRight: 6 }} />
            <Text style={s.headerTitle}>Notifikasi</Text>
            {(unread > 0 || reqCount > 0) && (
              <View style={s.badge} testID="badge-unread-count">
                <Text style={s.badgeText}>
                  {(unread + reqCount) > 99 ? '99+' : unread + reqCount}
                </Text>
              </View>
            )}
          </View>

          {tab === 'alerts' && unread > 0 ? (
            <TouchableOpacity
              onPress={markAllRead}
              disabled={marking}
              style={s.markBtn}
              testID="button-mark-all-read"
            >
              {marking
                ? <ActivityIndicator size="small" color={theme.textOnAccent} />
                : <Text style={s.markText}>Tandai dibaca</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={{ width: 88 }} />
          )}
        </View>

        {/* Sub-tab bar */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'requests' && s.tabBtnActive]}
            onPress={() => setTab('requests')}
            testID="tab-requests"
          >
            <Ionicons
              name="person-add-outline"
              size={16}
              color={tab === 'requests' ? theme.accent : theme.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text style={[s.tabTxt, tab === 'requests' && s.tabTxtActive]}>
              Permintaan
            </Text>
            {reqCount > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeTxt}>{reqCount > 9 ? '9+' : reqCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabBtn, tab === 'alerts' && s.tabBtnActive]}
            onPress={() => setTab('alerts')}
            testID="tab-alerts"
          >
            <Ionicons
              name="notifications-outline"
              size={16}
              color={tab === 'alerts' ? theme.accent : theme.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text style={[s.tabTxt, tab === 'alerts' && s.tabTxtActive]}>
              Alerts
            </Text>
            {unread > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeTxt}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Content */}
        {tab === 'requests' ? (
          loadingReqs ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : contactReqs.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="person-add-outline" size={48} color={theme.textSecondary} />
              <Text style={s.emptyText}>Tidak ada permintaan pertemanan</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
              showsVerticalScrollIndicator={false}
              testID="list-contact-requests"
            >
              {contactReqs.map(req => renderRequest(req))}
            </ScrollView>
          )
        ) : (
          loading && notifications.length === 0 ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={item => item.id}
              renderItem={renderAlert}
              ListHeaderComponent={
                systemAlerts.length > 0 ? (
                  <View style={s.sysSection}>
                    <Text style={s.sectionLabel}>System Alerts</Text>
                    {systemAlerts.map(a => (
                      <View key={a.id} style={s.sysAlert} testID={`system-alert-${a.id}`}>
                        <Ionicons name="megaphone" size={16} color={theme.accent} style={{ marginRight: 8 }} />
                        <Text style={s.sysMsg}>{a.message}</Text>
                      </View>
                    ))}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={s.empty}>
                  <Ionicons name="notifications-off-outline" size={48} color={theme.textSecondary} />
                  <Text style={s.emptyText}>Belum ada notifikasi</Text>
                </View>
              }
              contentContainerStyle={notifications.length === 0 ? { flex: 1 } : { paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
              testID="list-notifications"
            />
          )
        )}

        {/* Refresh FAB */}
        <Pressable
          onPress={() => { fetchNotifications(); fetchContactRequests(); }}
          style={[s.fab, { bottom: insets.bottom + 20 }]}
          testID="button-refresh-notifications"
        >
          <Ionicons name="refresh" size={22} color={theme.textOnAccent} />
        </Pressable>
      </View>
    </Modal>
  );
}
