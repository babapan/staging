/**
 * networkMonitor.ts
 *
 * Mirrors NetworkService.java network-state detection:
 *   - ConnectivityManager WiFi / Mobile tracking
 *   - setWifiConnected / setMobileConnected
 *   - isNetworkAvailable()
 *   - updateNetworkStatus() → notifies TcpGatewayClient
 *
 * Also implements the AlarmManager "keepalive" logic from NetworkService:
 * when the app comes back online after being offline, it triggers a
 * reconnect on the TCP gateway (mirrors startServerConnectionService on
 * network-restored broadcast).
 *
 * Usage:
 *   import { networkMonitor } from './networkMonitor';
 *   networkMonitor.start();                  // call once at app startup
 *   networkMonitor.isNetworkAvailable();     // sync check
 *   networkMonitor.on('online',  handler);   // WiFi or Mobile restored
 *   networkMonitor.on('offline', handler);   // no connectivity
 *   networkMonitor.on('change',  handler);   // any connectivity change
 *
 * React hook:
 *   const { isConnected, isWifi, isMobile } = useNetworkStatus();
 */

import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

function isNetInfoNativeAvailable(): boolean {
  try {
    return !!(NativeModules.RNCNetInfo || NativeModules.NetInfo);
  } catch {
    return false;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NetworkState {
  isConnected: boolean;
  isWifi:      boolean;
  isMobile:    boolean;
  type:        string;
}

type NetworkEvent = 'online' | 'offline' | 'change';
type NetworkListener = (state: NetworkState) => void;

// ─── NetworkMonitor ───────────────────────────────────────────────────────────

class NetworkMonitor {
  private _state: NetworkState = {
    isConnected: true,
    isWifi:      false,
    isMobile:    false,
    type:        'unknown',
  };

  private _listeners: Map<NetworkEvent, NetworkListener[]> = new Map();
  private _unsubscribe: (() => void) | null = null;
  private _started = false;

  // ── EventEmitter ───────────────────────────────────────────────────────────

  on(event: NetworkEvent, cb: NetworkListener): this {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(cb);
    return this;
  }

  off(event: NetworkEvent, cb: NetworkListener): this {
    const arr = this._listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
    return this;
  }

  private emit(event: NetworkEvent, state: NetworkState): void {
    this._listeners.get(event)?.slice().forEach((cb) => cb(state));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get state(): NetworkState { return this._state; }

  isNetworkAvailable(): boolean {
    return this._state.isConnected;
  }

  isWifiConnected(): boolean {
    return this._state.isWifi;
  }

  isMobileConnected(): boolean {
    return this._state.isMobile;
  }

  /**
   * Start listening for connectivity changes.
   * Safe to call multiple times (noop after first call).
   * On web, assumes always connected (no native NetInfo).
   */
  start(): void {
    if (this._started) return;
    this._started = true;

    if (Platform.OS === 'web') {
      // Web: listen to browser online/offline events
      const handleOnline  = () => this._update({ isConnected: true,  isWifi: true,  isMobile: false, type: 'wifi' });
      const handleOffline = () => this._update({ isConnected: false, isWifi: false, isMobile: false, type: 'none' });
      window.addEventListener('online',  handleOnline);
      window.addEventListener('offline', handleOffline);
      this._update({ isConnected: navigator.onLine, isWifi: navigator.onLine, isMobile: false, type: navigator.onLine ? 'wifi' : 'none' });
      this._unsubscribe = () => {
        window.removeEventListener('online',  handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
      return;
    }

    // Native: use @react-native-community/netinfo only if available in this build
    if (!isNetInfoNativeAvailable()) {
      this._update({ isConnected: true, isWifi: false, isMobile: true, type: 'unknown' });
      return;
    }

    try {
      const NetInfo: typeof import('@react-native-community/netinfo').default =
        require('@react-native-community/netinfo').default;

      NetInfo.fetch().then((s) => this._handleNetInfo(s)).catch(() => {});
      const unsub = NetInfo.addEventListener((state) => this._handleNetInfo(state));
      this._unsubscribe = unsub;
    } catch {
      this._update({ isConnected: true, isWifi: false, isMobile: true, type: 'unknown' });
    }
  }

  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._started = false;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _handleNetInfo(s: any): void {
    const isConnected = s.isConnected === true && s.isInternetReachable !== false;
    const type: string = (s.type as string) ?? 'unknown';
    const isWifi   = type === 'wifi';
    const isMobile = type === 'cellular';

    this._update({ isConnected, isWifi, isMobile, type });
  }

  private _update(next: NetworkState): void {
    const prev = this._state;
    this._state = next;

    this.emit('change', next);

    if (next.isConnected && !prev.isConnected) {
      this.emit('online', next);
    } else if (!next.isConnected && prev.isConnected) {
      this.emit('offline', next);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const networkMonitor = new NetworkMonitor();

// ─── React hook ───────────────────────────────────────────────────────────────

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(networkMonitor.state);

  useEffect(() => {
    const handler: NetworkListener = (s) => setState({ ...s });
    networkMonitor.on('change', handler);
    return () => { networkMonitor.off('change', handler); };
  }, []);

  return state;
}
