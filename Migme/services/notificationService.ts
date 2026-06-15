import { AppState, NativeModules, Platform } from 'react-native';

export interface MessageNotificationParams {
  senderName:     string;
  text:           string;
  conversationId: string;
  isRoom?:        boolean;
}

export interface NotificationTapData {
  conversationId: string;
  isRoom:         boolean;
}

type TapHandler = (data: NotificationTapData) => void;

// Check if expo-notifications native module is compiled into this build.
// ExpoPushTokenManager is the core native module that expo-notifications requires.
function isNotificationsNativeAvailable(): boolean {
  try {
    return !!(
      NativeModules.ExpoPushTokenManager ||
      NativeModules.ExpoNotifications ||
      NativeModules.RNNotifications
    );
  } catch {
    return false;
  }
}

class NotificationService {
  private _initialized   = false;
  private _hasPermission = false;
  private _tapHandlers: TapHandler[] = [];
  private _notifSub: any = null;

  async init(): Promise<void> {
    if (this._initialized || Platform.OS === 'web') return;

    // Skip entirely if the native module isn't compiled into this dev build.
    // This prevents "Cannot find native module 'ExpoPushTokenManager'" crashes.
    if (!isNotificationsNativeAvailable()) {
      this._initialized = true;
      return;
    }

    this._initialized = true;

    try {
      const Notifications: typeof import('expo-notifications') = require('expo-notifications');

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound:  true,
          shouldSetBadge:   true,
          shouldShowBanner: true,
          shouldShowList:   true,
          shouldShowAlert:  true,
        }),
      });

      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      this._hasPermission = status === 'granted';

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name:             'Chat Messages',
          importance:       Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor:       '#4CAF50',
          sound:            'default',
          description:      'Incoming private and room chat messages',
        });
      }

      this._notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as unknown as NotificationTapData | undefined;
        if (data?.conversationId) {
          this._tapHandlers.slice().forEach((h) => h(data));
        }
      });
    } catch {
      this._hasPermission = false;
    }
  }

  async showMessageNotification(params: MessageNotificationParams): Promise<void> {
    if (Platform.OS === 'web' || !this._hasPermission) return;
    if (AppState.currentState === 'active') return;
    if (!isNotificationsNativeAvailable()) return;

    try {
      const Notifications: typeof import('expo-notifications') = require('expo-notifications');
      const truncated = params.text.length > 80
        ? params.text.slice(0, 80) + '…'
        : params.text;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: params.senderName,
          body:  truncated,
          sound: 'default',
          badge: 1,
          data: { conversationId: params.conversationId, isRoom: params.isRoom ?? false },
          ...(Platform.OS === 'android' ? { channelId: 'messages' } : {}),
        },
        trigger: null,
      });
    } catch {}
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === 'web' || !isNotificationsNativeAvailable()) return;
    try {
      const Notifications = require('expo-notifications');
      await Notifications.setBadgeCountAsync(0);
    } catch {}
  }

  onNotificationTap(handler: TapHandler): () => void {
    this._tapHandlers.push(handler);
    return () => {
      const idx = this._tapHandlers.indexOf(handler);
      if (idx !== -1) this._tapHandlers.splice(idx, 1);
    };
  }

  destroy(): void {
    this._notifSub?.remove?.();
    this._notifSub = null;
    this._tapHandlers = [];
    this._initialized = false;
  }
}

export const notificationService = new NotificationService();
