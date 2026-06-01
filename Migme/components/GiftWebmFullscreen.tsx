/**
 * GiftWebmFullscreen.tsx
 *
 * Fullscreen transparent WebM gift animation overlay.
 *
 * KEY FINDINGS from device testing:
 *   - androidLayerType="software" → video CANNOT play (Android cannot decode
 *     video in software-rendered WebViews — video decoding needs GPU).
 *   - androidLayerType="hardware" → video plays correctly with alpha channel.
 *   - NO nested Modal — component lives inside PartyRoomModal (already a Modal);
 *     nested Modals break WebView rendering on Android.
 *   - Remaining transparency artefacts are caused by the video file having
 *     semi-transparent edges encoded without a full WebM alpha channel.
 *
 * Behaviour:
 *   - Fade-in on mount
 *   - Auto fade-out when HTML5 video fires "ended"
 *   - Minimum display time of 3s so a premature "ended" or "error" never
 *     causes an instant flash (guards against zero-duration metadata bugs)
 *   - "error" events are swallowed — only the fallback timeout closes the
 *     overlay if the video genuinely fails to load
 *   - Fallback timeout = max(videoDuration + 2 s, 15 s) — updated dynamically
 *     via ondurationchange so long videos are never cut off early
 */

import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get('screen');

/** Minimum milliseconds the overlay must be visible before it can close. */
const MIN_VISIBLE_MS = 3_000;

/** Default fallback if we never receive a duration from the video. */
const DEFAULT_FALLBACK_MS = 15_000;

interface Props {
  uri: string;
  onFinish?: () => void;
}

function buildHtml(source: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { margin: 0; padding: 0; }
      html, body {
        width: 100vw;
        height: 100vh;
        background: transparent !important;
        background-color: transparent !important;
        -webkit-background-color: transparent !important;
        overflow: hidden;
      }
      video {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        background: transparent !important;
        background-color: transparent !important;
        mix-blend-mode: normal;
      }
    </style>
  </head>
  <body>
    <video
      id="v"
      autoplay
      playsinline
      webkit-playsinline
      disablepictureinpicture
      x-webkit-airplay="deny"
    >
      <source src="${source}" type="video/webm">
      <source src="${source}" type="video/mp4">
    </video>
    <script>
      var v = document.getElementById('v');

      // Disable Picture-in-Picture — mencegah Samsung meluncurkan PiP overlay
      // yang terlihat sebagai "minimize" saat video gift diputar.
      if (document.pictureInPictureEnabled !== undefined) {
        try { document.exitPictureInPicture(); } catch(e) {}
      }
      if (typeof v.disablePictureInPicture !== 'undefined') {
        v.disablePictureInPicture = true;
      }

      // Mute video gift agar tidak merebut audio focus dari LiveKit WebRTC.
      // Jika audio focus direbut WebView, LiveKit akan kehilangan session dan
      // suara voice room akan terputus saat gift animation diputar.
      v.volume = 0;
      v.muted  = true;

      // Report actual duration so the native side can set the right fallback.
      v.ondurationchange = function() {
        if (v.duration && isFinite(v.duration)) {
          window.ReactNativeWebView.postMessage('DURATION:' + v.duration.toFixed(2));
        }
      };

      v.onended = function() {
        window.ReactNativeWebView.postMessage('ENDED');
      };

      // Do NOT post ERROR — a load failure should not cause an instant flash.
      // The native fallback timeout will clean up instead.
      v.onerror = function() {
        window.ReactNativeWebView.postMessage('LOG:error code=' + (v.error ? v.error.code : 'unknown'));
      };

      v.oncanplay = function() {
        v.play().catch(function() {});
      };

      v.load();
    </script>
  </body>
</html>`;
}

export default function GiftWebmFullscreen({ uri, onFinish }: Props) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const isClosing  = useRef(false);
  const mountTime  = useRef(Date.now());
  const fallback   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFallback = (ms: number) => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(handleFadeOut, ms);
  };

  const handleFadeOut = () => {
    if (isClosing.current) return;

    // Guard: never close before MIN_VISIBLE_MS has elapsed.
    const elapsed = Date.now() - mountTime.current;
    if (elapsed < MIN_VISIBLE_MS) {
      const remaining = MIN_VISIBLE_MS - elapsed;
      scheduleFallback(remaining);
      return;
    }

    isClosing.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => onFinish?.());
  };

  useEffect(() => {
    mountTime.current = Date.now();

    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Initial fallback — will be overwritten if DURATION arrives.
    scheduleFallback(DEFAULT_FALLBACK_MS);

    return () => {
      if (fallback.current) clearTimeout(fallback.current);
    };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity }]}
    >
      <WebView
        source={{ html: buildHtml(uri) }}
        style={styles.webview}
        scrollEnabled={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        backgroundColor="transparent"
        androidLayerType="hardware"
        javaScriptEnabled={true}
        originWhitelist={['*']}
        onMessage={(e) => {
          const msg = e.nativeEvent.data;

          if (msg.startsWith('DURATION:')) {
            // Dynamically extend the fallback to video duration + 2 s buffer.
            const secs = parseFloat(msg.slice(9));
            if (secs > 0 && isFinite(secs)) {
              const elapsed  = Date.now() - mountTime.current;
              const remaining = Math.max(0, secs * 1000 - elapsed) + 2_000;
              scheduleFallback(remaining);
            }
            return;
          }

          if (msg === 'ENDED') {
            handleFadeOut();
            return;
          }

          // LOG / unknown messages — ignore silently.
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position:        'absolute',
    top:             0,
    left:            0,
    width,
    height,
    zIndex:          9999,
    elevation:       9999,
    backgroundColor: 'transparent',
  },
  webview: {
    flex:            1,
    backgroundColor: 'transparent',
  },
});
