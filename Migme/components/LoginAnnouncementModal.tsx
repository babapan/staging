// LoginAnnouncementModal — popup that shows once after a successful login
// when the admin has published a new version of the announcement.
// Configured from the admin panel ("Broadcast Pesan" → "Popup Pengumuman Login").
import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../services/auth';

interface Announcement {
  enabled: boolean;
  title?: string;
  body?: string;
  imageUrl?: string;
  version?: number;
}

const SEEN_KEY_PREFIX = 'login_announcement_seen_v';

async function fetchAnnouncement(): Promise<Announcement | null> {
  try {
    const res = await fetch(`${API_BASE}/api/system/login-announcement`, {
      method: 'GET',
      credentials: Platform.OS === 'web' ? 'include' : 'omit',
    });
    if (!res.ok) return null;
    return (await res.json()) as Announcement;
  } catch {
    return null;
  }
}

interface Props {
  /** Bumped by the parent every time the user finishes login, so the modal
   *  re-checks even if the component instance never unmounts. */
  triggerKey?: string | number;
}

export default function LoginAnnouncementModal({ triggerKey }: Props) {
  const [data, setData] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ann = await fetchAnnouncement();
      if (cancelled || !ann || !ann.enabled || !(ann.body || '').trim()) return;
      const ver = ann.version ?? 0;
      try {
        const seen = await AsyncStorage.getItem(`${SEEN_KEY_PREFIX}${ver}`);
        if (seen === '1') return;
      } catch {
        // ignore — show by default if storage fails
      }
      setData(ann);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [triggerKey]);

  const dismiss = async () => {
    setVisible(false);
    if (data?.version != null) {
      try {
        await AsyncStorage.setItem(`${SEEN_KEY_PREFIX}${data.version}`, '1');
      } catch {
        // ignore
      }
    }
  };

  if (!data || !visible) return null;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!!data.imageUrl && (
            <Image
              source={{ uri: data.imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          )}
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={3}>
              {data.title || 'Pengumuman'}
            </Text>
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.message}>{data.body}</Text>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={dismiss}
            >
              <Text style={styles.buttonText}>OK, Mengerti</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: '#E5E7EB',
  },
  body: {
    padding: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0B1220',
    marginBottom: 10,
  },
  scroll: {
    maxHeight: 260,
    marginBottom: 14,
  },
  message: {
    fontSize: 14,
    color: '#243047',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#6366F1',
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
