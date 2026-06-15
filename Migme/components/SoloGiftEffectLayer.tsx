/**
 * SoloGiftEffectLayer.tsx
 *
 * Dedicated fullscreen effect layer for Solo Live gift animations.
 * Sits at zIndex 9999 above all Solo Live UI, pointerEvents="none".
 *
 * Supports:
 *   - WebM / MP4 with alpha channel (via WebView hardware layer)
 *   - Lottie JSON animations (native, supports transparency)
 *
 * Lucky category gifts → NO effect (JP nature, not animation)
 * Luxury category gifts → effect plays (largest/most spectacular)
 *
 * Usage:
 *   const effectRef = useRef<SoloGiftEffectHandle>(null);
 *   effectRef.current?.play({ videoUrl, lottieUrl, category });
 *   <SoloGiftEffectLayer ref={effectRef} />
 */

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import LottieView from 'lottie-react-native';

const { width, height } = Dimensions.get('screen');

const MIN_VISIBLE_MS    = 3_000;
const DEFAULT_FALLBACK_MS = 15_000;

const LUCKY_CATEGORIES = ['lucky', 'Lucky'];

export interface SoloGiftEffectPayload {
  videoUrl?:  string | null;
  lottieUrl?: string | null;
  category?:  string | null;
}

export interface SoloGiftEffectHandle {
  play: (payload: SoloGiftEffectPayload) => void;
}

function buildHtml(source: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { margin: 0; padding: 0; }
      html, body {
        width: 100vw; height: 100vh;
        background: transparent !important;
        background-color: transparent !important;
        overflow: hidden;
      }
      video {
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh;
        object-fit: cover;
        background: transparent !important;
        mix-blend-mode: normal;
      }
    </style>
  </head>
  <body>
    <video id="v" autoplay playsinline webkit-playsinline
      disablepictureinpicture x-webkit-airplay="deny">
      <source src="${source}" type="video/webm">
      <source src="${source}" type="video/mp4">
    </video>
    <script>
      var v = document.getElementById('v');
      if (document.pictureInPictureEnabled !== undefined) {
        try { document.exitPictureInPicture(); } catch(e) {}
      }
      if (typeof v.disablePictureInPicture !== 'undefined') {
        v.disablePictureInPicture = true;
      }
      v.volume = 0;
      v.muted  = true;
      v.ondurationchange = function() {
        if (v.duration && isFinite(v.duration)) {
          window.ReactNativeWebView.postMessage('DURATION:' + v.duration.toFixed(2));
        }
      };
      v.onended = function() {
        window.ReactNativeWebView.postMessage('ENDED');
      };
      v.onerror = function() {
        window.ReactNativeWebView.postMessage('LOG:error code=' + (v.error ? v.error.code : 'unknown'));
      };
      v.oncanplay = function() { v.play().catch(function() {}); };
      v.load();
    </script>
  </body>
</html>`;
}

type EffectMode = 'video' | 'lottie' | 'none';

interface ActiveEffect {
  key:      number;
  mode:     EffectMode;
  videoUrl: string | null;
  lottieUrl: string | null;
}

const SoloGiftEffectLayer = forwardRef<SoloGiftEffectHandle>((_, ref) => {
  const [active, setActive]   = useState<ActiveEffect | null>(null);
  const opacity               = useRef(new Animated.Value(0)).current;
  const isClosing             = useRef(false);
  const mountTime             = useRef(0);
  const fallback              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyCounter            = useRef(0);
  const lottieRef             = useRef<LottieView>(null);

  useImperativeHandle(ref, () => ({
    play(payload: SoloGiftEffectPayload) {
      const cat = payload.category ?? '';
      if (LUCKY_CATEGORIES.includes(cat)) return;

      const hasVideo  = !!payload.videoUrl;
      const hasLottie = !!payload.lottieUrl;

      if (!hasVideo && !hasLottie) return;

      const mode: EffectMode = hasVideo ? 'video' : 'lottie';
      keyCounter.current += 1;

      setActive({
        key:       keyCounter.current,
        mode,
        videoUrl:  payload.videoUrl ?? null,
        lottieUrl: payload.lottieUrl ?? null,
      });
    },
  }));

  useEffect(() => {
    if (!active) return;

    isClosing.current = false;
    mountTime.current = Date.now();
    opacity.setValue(0);

    Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    if (active.mode === 'lottie') {
      scheduleFallback(DEFAULT_FALLBACK_MS);
    } else {
      scheduleFallback(DEFAULT_FALLBACK_MS);
    }

    return () => {
      if (fallback.current) clearTimeout(fallback.current);
    };
  }, [active?.key]);

  const scheduleFallback = (ms: number) => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(handleFadeOut, ms);
  };

  const handleFadeOut = () => {
    if (isClosing.current) return;
    const elapsed = Date.now() - mountTime.current;
    if (elapsed < MIN_VISIBLE_MS) {
      scheduleFallback(MIN_VISIBLE_MS - elapsed);
      return;
    }
    isClosing.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true })
      .start(() => setActive(null));
  };

  if (!active) return null;

  return (
    <Animated.View pointerEvents="none" style={[st.overlay, { opacity }]}>
      {active.mode === 'video' && active.videoUrl ? (
        <WebView
          key={active.key}
          source={{ html: buildHtml(active.videoUrl) }}
          style={st.webview}
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
              const secs = parseFloat(msg.slice(9));
              if (secs > 0 && isFinite(secs)) {
                const elapsed   = Date.now() - mountTime.current;
                const remaining = Math.max(0, secs * 1000 - elapsed) + 2_000;
                scheduleFallback(remaining);
              }
              return;
            }
            if (msg === 'ENDED') { handleFadeOut(); }
          }}
        />
      ) : active.mode === 'lottie' && active.lottieUrl ? (
        <View style={st.lottieWrap}>
          <LottieView
            ref={lottieRef}
            key={active.key}
            source={{ uri: active.lottieUrl }}
            autoPlay
            loop={false}
            style={st.lottie}
            onAnimationFinish={handleFadeOut}
          />
        </View>
      ) : null}
    </Animated.View>
  );
});

export default SoloGiftEffectLayer;

const st = StyleSheet.create({
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
  lottieWrap: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'transparent',
  },
  lottie: {
    width:  width,
    height: height,
  },
});
