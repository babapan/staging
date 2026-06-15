/**
 * videoPlayer.tsx
 *
 * Compatibility shim for expo-video.
 * expo-video requires a native module (ExpoVideo) that is NOT available in
 * Expo Go — it needs a custom dev build or production build.
 *
 * This shim:
 *  - Tries to load expo-video at module init time
 *  - If unavailable (Expo Go), returns no-op hooks/components so the app
 *    never crashes — video slots simply render nothing and the existing
 *    lottie/image/emoji fallback chain takes over automatically.
 */

import React from 'react';

// ── Try to load expo-video once at module level ──────────────────────────────
let _expoVideo: any = null;
try {
  _expoVideo = require('expo-video');
} catch {
  // Running in Expo Go or native module not yet linked — video unavailable
}

export const VIDEO_SUPPORTED: boolean = !!_expoVideo?.useVideoPlayer;

// ── No-op player returned when expo-video is unavailable ─────────────────────
const noopSubscription = { remove: () => {} };
const noopPlayer = {
  play:        () => {},
  pause:       () => {},
  replace:     () => {},
  addListener: (_: string, __: Function) => noopSubscription,
  loop:        false,
  muted:       true,
};
type NoopPlayer = typeof noopPlayer;

// ── useVideoPlayerSafe ───────────────────────────────────────────────────────
// Always a stable hook reference so React hook-call order never changes.
function useNoopVideoPlayer(_source: any, _setup?: (p: NoopPlayer) => void): NoopPlayer {
  return noopPlayer;
}

export const useVideoPlayerSafe: (
  source: { uri: string } | null,
  setup?: (p: any) => void,
) => any = VIDEO_SUPPORTED ? _expoVideo.useVideoPlayer : useNoopVideoPlayer;

// ── VideoViewSafe ─────────────────────────────────────────────────────────────
// Renders nothing when expo-video is unavailable.
export function VideoViewSafe({
  player,
  style,
  contentFit,
  nativeControls,
}: {
  player: any;
  style?: any;
  contentFit?: 'contain' | 'cover' | 'fill';
  nativeControls?: boolean;
}) {
  if (!VIDEO_SUPPORTED) return null;
  const ExpoVideoView = _expoVideo.VideoView;
  return (
    <ExpoVideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
    />
  );
}
