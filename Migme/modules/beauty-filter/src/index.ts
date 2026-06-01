import { NativeModules, Platform } from 'react-native';

const { BeautyFilter } = NativeModules;

export interface BeautyParams {
  smooth:   number;  // 0–1
  bright:   number;  // 0–1
  rosiness: number;  // 0–1
  enabled:  boolean;
}

/**
 * Update beauty filter parameters on the native processor.
 * Changes take effect on the next WebRTC video frame — i.e., viewers see it immediately.
 */
export function setBeautyParams(params: BeautyParams): void {
  if (!BeautyFilter) {
    console.warn('[BeautyFilter] Native module not available (run EAS Build)');
    return;
  }
  BeautyFilter.setBeautyParams(params);
}

export const isBeautyFilterAvailable = !!BeautyFilter;
