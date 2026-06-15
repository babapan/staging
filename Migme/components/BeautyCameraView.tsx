import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
// Skia is available as a global inside useSkiaFrameProcessor worklets,
// but we import it here so TypeScript can resolve the type.
// The import is safe — @shopify/react-native-skia is always installed;
// the component that uses it (BeautyCameraSkiaWarp) only mounts when
// USE_SKIA_WARP is true, i.e. the native module is confirmed available.
import { Skia, ClipOp } from '@shopify/react-native-skia';
import FaceMeshCameraView, { FACE_MESH_AVAILABLE } from './FaceMeshCameraView';

// ── Beauty params ──────────────────────────────────────────────────────────────
export interface BeautyParams {
  enabled:    boolean;
  smoothSkin: number;  // 0-100
  brightSkin: number;  // 0-100
  slimFace:   number;  // 0-100 → Skia face-oval warp (EAS) / scaleX fallback
  slimChin:   number;  // 0-100 → Skia chin-oval warp (EAS) / scaleY fallback
  bigEyes:    number;  // 0-100 → MediaPipe 468-landmark eye warp
  slimNose:   number;  // 0-100 → MediaPipe 468-landmark nose slim
  rosyCheeks: number;  // 0-100
  whiteSkin:  number;  // 0-100 → putihkan wajah (strong white overlay)
  coolTone:   number;  // 0-100 → efek sejuk (blue/cyan tint)
  warmTone:   number;  // 0-100 → efek hangat (amber/orange tint)
}

export const DEFAULT_BEAUTY_PARAMS: BeautyParams = {
  enabled: false, smoothSkin: 0, brightSkin: 0,
  slimFace: 0, slimChin: 0, bigEyes: 0, slimNose: 0,
  rosyCheeks: 0, whiteSkin: 0, coolTone: 0, warmTone: 0,
};

// ── Feature detection ─────────────────────────────────────────────────────────
// Checks run once at module load — results never change during app lifetime.

const FACE_DETECTION_AVAILABLE = (() => {
  try {
    const { VisionCameraProxy } = require('react-native-vision-camera');
    return VisionCameraProxy.getFrameProcessorPlugin('detectFaces') != null;
  } catch { return false; }
})();

const SKIA_FP_AVAILABLE = (() => {
  try {
    const vcam = require('react-native-vision-camera');
    const skia = require('@shopify/react-native-skia');
    return typeof vcam.useSkiaFrameProcessor === 'function' && skia.Skia != null;
  } catch { return false; }
})();

// USE_SKIA_WARP: full Skia + ML Kit face detector (warp + color filters)
// USE_SKIA_COLORS: Skia only (color filters + basic full-frame slim), no face detector
const USE_SKIA_WARP   = FACE_DETECTION_AVAILABLE && SKIA_FP_AVAILABLE;
const USE_SKIA_COLORS = SKIA_FP_AVAILABLE;

// Lazy-load hooks — avoids crashes in Expo Go where native plugins aren't linked
type UseFaceDetectorFn =
  typeof import('react-native-vision-camera-face-detector').useFaceDetector;
type UseSkiaFPFn =
  typeof import('react-native-vision-camera').useSkiaFrameProcessor;

let _useFaceDetector:    UseFaceDetectorFn | null = null;
let _useSkiaFrameProc:   UseSkiaFPFn       | null = null;

// Load Skia frame processor whenever Skia is available (not just when face detector is too)
if (USE_SKIA_COLORS) {
  try {
    _useSkiaFrameProc = require('react-native-vision-camera').useSkiaFrameProcessor;
  } catch {}
}
if (USE_SKIA_WARP) {
  try {
    _useFaceDetector = require('react-native-vision-camera-face-detector').useFaceDetector;
  } catch {}
} else if (FACE_DETECTION_AVAILABLE) {
  try {
    _useFaceDetector = require('react-native-vision-camera-face-detector').useFaceDetector;
  } catch {}
}

// ClipOp.Intersect = 1, ClipOp.Difference = 0
const CLIP_INTERSECT = ClipOp.Intersect;

// ── Shared props ──────────────────────────────────────────────────────────────
interface Props {
  facing: 'front' | 'back';
  beautyParams: BeautyParams;
  style?: object;
}

// ── Color overlay (View-based, works across all build types) ──────────────────
function ColorOverlays({
  brightOpacity, smoothOpacity, rosyOpacity, whiteOpacity, coolOpacity, warmOpacity,
}: {
  brightOpacity: number; smoothOpacity: number; rosyOpacity: number;
  whiteOpacity: number;  coolOpacity: number;   warmOpacity: number;
}) {
  if (brightOpacity <= 0 && smoothOpacity <= 0 && rosyOpacity <= 0 &&
      whiteOpacity <= 0 && coolOpacity <= 0 && warmOpacity <= 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {brightOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(255,255,255,1)', opacity: brightOpacity }]} />
      )}
      {smoothOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(255,248,240,1)', opacity: smoothOpacity }]} />
      )}
      {rosyOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(255,140,120,1)', opacity: rosyOpacity }]} />
      )}
      {whiteOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(240,240,255,1)', opacity: whiteOpacity }]} />
      )}
      {coolOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(90,170,255,1)', opacity: coolOpacity }]} />
      )}
      {warmOpacity > 0 && (
        <View style={[StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(255,155,60,1)', opacity: warmOpacity }]} />
      )}
    </View>
  );
}

// ── Face indicator badge ──────────────────────────────────────────────────────
function FaceIndicator({ detected }: { detected: boolean }) {
  return (
    <View style={styles.faceIndicator} pointerEvents="none">
      <View style={[styles.faceDot,
        { backgroundColor: detected ? '#4ADE80' : 'rgba(255,255,255,0.3)' }]} />
      <Text style={styles.faceLabel}>
        {detected ? 'Wajah terdeteksi' : 'Mencari wajah...'}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BeautyCameraSkiaWarp
// EAS build — Skia face processor + ML Kit face detection.
// Warp hanya di area oval wajah; background tidak ikut terdeformasi.
// ═══════════════════════════════════════════════════════════════════════════════
function BeautyCameraSkiaWarp({ facing, beautyParams, style }: Props) {
  const device = useCameraDevice(facing);
  // HD format: try 1080p@30fps, fallback to device best
  const hdFormat = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
    { fps: 30 },
  ]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Reset camera error when app comes back to foreground (e.g., after minimize)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        setCameraError(null);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // Shared values — readable inside Skia worklet without React re-renders
  const svEnabled   = useSharedValue(beautyParams.enabled   ? 1 : 0);
  const svSlimFace  = useSharedValue(beautyParams.slimFace);
  const svSlimChin  = useSharedValue(beautyParams.slimChin);
  const svBright    = useSharedValue(beautyParams.brightSkin);
  const svSmooth    = useSharedValue(beautyParams.smoothSkin);
  const svRosy      = useSharedValue(beautyParams.rosyCheeks);
  const svWhite     = useSharedValue(beautyParams.whiteSkin);
  const svCool      = useSharedValue(beautyParams.coolTone);
  const svWarm      = useSharedValue(beautyParams.warmTone);

  useEffect(() => {
    svEnabled.value  = beautyParams.enabled ? 1 : 0;
    svSlimFace.value = beautyParams.slimFace;
    svSlimChin.value = beautyParams.slimChin;
    svBright.value   = beautyParams.brightSkin;
    svSmooth.value   = beautyParams.smoothSkin;
    svRosy.value     = beautyParams.rosyCheeks;
    svWhite.value    = beautyParams.whiteSkin;
    svCool.value     = beautyParams.coolTone;
    svWarm.value     = beautyParams.warmTone;
  }, [beautyParams, svEnabled, svSlimFace, svSlimChin, svBright, svSmooth, svRosy, svWhite, svCool, svWarm]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { detectFaces } = _useFaceDetector!({
    performanceMode: 'fast',
    classificationMode: 'none',
    landmarkMode: 'none',
    contourMode: 'none',
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frameProcessor = _useSkiaFrameProc!(
    (frame) => {
      'worklet';

      // Step 1 — Render base camera frame (full frame, no transform)
      frame.render();

      if (!svEnabled.value) return;

      const fw = frame.width;
      const fh = frame.height;
      const fullRect = { x: 0, y: 0, width: fw, height: fh };

      // ── COLOR FILTERS — drawn at pixel level → encoded into LiveKit stream ──
      // Viewers see these effects exactly as host sees them.

      // Cerahkan Kulit — putih lembut
      const brightV = svBright.value;
      if (brightV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 1, 1, brightV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      // Kulit Halus — ivory hangat
      const smoothV = svSmooth.value;
      if (smoothV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.973, 0.941, smoothV * 0.0022]));
        frame.drawRect(fullRect, p);
      }

      // Kemerahan Pipi — pink/rose
      const rosyV = svRosy.value;
      if (rosyV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.549, 0.471, rosyV * 0.0025]));
        frame.drawRect(fullRect, p);
      }

      // Putihkan Wajah — putih bersih + sedikit lavender
      const whiteV = svWhite.value;
      if (whiteV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([0.941, 0.941, 1, whiteV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      // Sejuk — blue/cyan tint
      const coolV = svCool.value;
      if (coolV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([0.353, 0.667, 1, coolV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      // Hangat — amber/orange tint
      const warmV = svWarm.value;
      if (warmV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.608, 0.235, warmV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      // ── FACE WARP — slim face/chin (needs face detection) ─────────────────
      const slimFace = svSlimFace.value;
      const slimChin = svSlimChin.value;
      if (slimFace === 0 && slimChin === 0) return;

      // Detect faces using ML Kit (native, fast path)
      const faces = detectFaces(frame);
      if (faces.length === 0) return;

      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const { bounds } = face;
        const cx = bounds.x + bounds.width  / 2;
        const cy = bounds.y + bounds.height / 2;

        // ── TIPISKAN WAJAH — horizontal warp di dalam oval wajah ──────────
        if (slimFace > 0) {
          const slimAmt = slimFace * 0.0012;

          const facePath = Skia.Path.Make();
          facePath.addOval({
            x: bounds.x,
            y: bounds.y,
            width:  bounds.width,
            height: bounds.height,
          });

          frame.save();
          frame.clipPath(facePath, CLIP_INTERSECT, true);
          frame.translate(cx, cy);
          frame.scale(1 - slimAmt, 1);
          frame.translate(-cx, -cy);
          frame.render();
          frame.restore();
        }

        // ── TIPISKAN DAGU — vertical warp di area dagu bawah wajah ───────
        if (slimChin > 0) {
          const chinAmt  = slimChin * 0.0008;
          const chinTop  = bounds.y + bounds.height * 0.62;
          const chinH    = bounds.height * 0.38;
          const chinCX   = cx;
          const chinCY   = chinTop + chinH / 2;

          const chinPath = Skia.Path.Make();
          chinPath.addOval({
            x:      bounds.x + bounds.width * 0.10,
            y:      chinTop,
            width:  bounds.width * 0.80,
            height: chinH,
          });

          frame.save();
          frame.clipPath(chinPath, CLIP_INTERSECT, true);
          frame.translate(chinCX, chinCY);
          frame.scale(1 - chinAmt, 1 - chinAmt * 0.6);
          frame.translate(-chinCX, -chinCY);
          frame.render();
          frame.restore();
        }
      }
    },
    [detectFaces, svEnabled, svSlimFace, svSlimChin, svBright, svSmooth, svRosy, svWhite, svCool, svWarm],
  );

  // On camera error: show silent dark loading — camera recovers when back to foreground
  if (cameraError) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator color="rgba(255,107,157,0.5)" />
      </View>
    );
  }

  if (!device || !hasPermission) {
    return (
      <View style={[styles.placeholder, style]}>
        {!hasPermission
          ? <Text style={styles.placeholderTxt}>Izin kamera diperlukan</Text>
          : <><ActivityIndicator color="#FF6B9D" /><Text style={styles.placeholderTxt}>Memuat kamera...</Text></>
        }
      </View>
    );
  }

  // Colors applied at frame processor level (Skia) — visible to LiveKit viewers.
  // No View overlays needed here; they would double-apply the effect on host screen.
  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Camera
        key={device.id}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        format={hdFormat}
        pixelFormat="yuv"
        resizeMode="cover"
        videoStabilizationMode="auto"
        frameProcessor={frameProcessor}
        onError={(e) => setCameraError(e.code)}
      />
      {beautyParams.enabled && <FaceIndicator detected={faceDetected} />}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BeautyCameraSkiaColors
// EAS build — Skia frame processor + color filters only (no face detector).
// Dipakai saat Skia tersedia tapi ML Kit face detector tidak terdaftar.
// Color filters ter-encode ke frame → kelihatan oleh viewer LiveKit.
// ═══════════════════════════════════════════════════════════════════════════════
function BeautyCameraSkiaColors({ facing, beautyParams, style }: Props) {
  const device = useCameraDevice(facing);
  const hdFormat = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
    { fps: 30 },
  ]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') setCameraError(null);
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  const svEnabled   = useSharedValue(beautyParams.enabled ? 1 : 0);
  const svBright    = useSharedValue(beautyParams.brightSkin);
  const svSmooth    = useSharedValue(beautyParams.smoothSkin);
  const svRosy      = useSharedValue(beautyParams.rosyCheeks);
  const svWhite     = useSharedValue(beautyParams.whiteSkin);
  const svCool      = useSharedValue(beautyParams.coolTone);
  const svWarm      = useSharedValue(beautyParams.warmTone);
  const svSlimFace  = useSharedValue(beautyParams.slimFace);
  const svSlimChin  = useSharedValue(beautyParams.slimChin);

  useEffect(() => {
    svEnabled.value  = beautyParams.enabled ? 1 : 0;
    svBright.value   = beautyParams.brightSkin;
    svSmooth.value   = beautyParams.smoothSkin;
    svRosy.value     = beautyParams.rosyCheeks;
    svWhite.value    = beautyParams.whiteSkin;
    svCool.value     = beautyParams.coolTone;
    svWarm.value     = beautyParams.warmTone;
    svSlimFace.value = beautyParams.slimFace;
    svSlimChin.value = beautyParams.slimChin;
  }, [beautyParams, svEnabled, svBright, svSmooth, svRosy, svWhite, svCool, svWarm, svSlimFace, svSlimChin]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frameProcessor = _useSkiaFrameProc!(
    (frame) => {
      'worklet';

      frame.render();

      if (!svEnabled.value) return;

      const fw = frame.width;
      const fh = frame.height;
      const fullRect = { x: 0, y: 0, width: fw, height: fh };

      // ── COLOR FILTERS — encoded into LiveKit stream (viewers see these) ──

      const brightV = svBright.value;
      if (brightV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 1, 1, brightV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      const smoothV = svSmooth.value;
      if (smoothV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.973, 0.941, smoothV * 0.0022]));
        frame.drawRect(fullRect, p);
      }

      const rosyV = svRosy.value;
      if (rosyV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.549, 0.471, rosyV * 0.0025]));
        frame.drawRect(fullRect, p);
      }

      const whiteV = svWhite.value;
      if (whiteV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([0.941, 0.941, 1, whiteV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      const coolV = svCool.value;
      if (coolV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([0.353, 0.667, 1, coolV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      const warmV = svWarm.value;
      if (warmV > 0) {
        const p = Skia.Paint();
        p.setColor(Skia.Color([1, 0.608, 0.235, warmV * 0.003]));
        frame.drawRect(fullRect, p);
      }

      // ── SLIM FACE / CHIN — full-frame scale (no face bbox needed) ────────
      const slimFaceV = svSlimFace.value;
      const slimChinV = svSlimChin.value;
      if (slimFaceV > 0 || slimChinV > 0) {
        const cx = fw / 2;
        const cy = fh / 2;
        const sx = slimFaceV > 0 ? 1 - slimFaceV * 0.0012 : 1;
        const sy = slimChinV > 0 ? 1 - slimChinV * 0.0008 : 1;
        frame.save();
        frame.translate(cx, cy);
        frame.scale(sx, sy);
        frame.translate(-cx, -cy);
        frame.render();
        frame.restore();
      }
    },
    [svEnabled, svBright, svSmooth, svRosy, svWhite, svCool, svWarm, svSlimFace, svSlimChin],
  );

  if (cameraError) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator color="rgba(255,107,157,0.5)" />
      </View>
    );
  }

  if (!device || !hasPermission) {
    return (
      <View style={[styles.placeholder, style]}>
        {!hasPermission
          ? <Text style={styles.placeholderTxt}>Izin kamera diperlukan</Text>
          : <><ActivityIndicator color="#FF6B9D" /><Text style={styles.placeholderTxt}>Memuat kamera...</Text></>
        }
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Camera
        key={device.id}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        format={hdFormat}
        pixelFormat="yuv"
        resizeMode="cover"
        videoStabilizationMode="auto"
        frameProcessor={frameProcessor}
        onError={(e) => setCameraError(e.code)}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BeautyCameraSimple
// Expo Go / no Skia — plain Camera + View overlays.
// slimFace/slimChin: whole-frame scaleX/scaleY (approximate, not face-accurate).
// ═══════════════════════════════════════════════════════════════════════════════
function BeautyCameraSimple({ facing, beautyParams, style }: Props) {
  const device = useCameraDevice(facing);
  // HD format: try 1080p@30fps, fallback to device best
  const hdFormat = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
    { fps: 30 },
  ]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permRequested, setPermRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!hasPermission && !permRequested) {
      setPermRequested(true);
      requestPermission();
    }
  }, [hasPermission, permRequested, requestPermission]);

  // Reset camera error when app comes back to foreground (e.g., after minimize)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        setCameraError(null);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // On camera error: show silent dark loading screen — camera recovers on foreground
  if (cameraError) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator color="rgba(255,107,157,0.5)" />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator color="#FF6B9D" />
        <Text style={styles.placeholderTxt}>Memuat kamera...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderTxt}>Izin kamera diperlukan</Text>
      </View>
    );
  }

  const brightOpacity  = beautyParams.enabled ? (beautyParams.brightSkin  / 100) * 0.32 : 0;
  const smoothOpacity  = beautyParams.enabled ? (beautyParams.smoothSkin  / 100) * 0.25 : 0;
  const rosyOpacity    = beautyParams.enabled ? (beautyParams.rosyCheeks  / 100) * 0.28 : 0;
  const whiteOpacity2  = beautyParams.enabled ? (beautyParams.whiteSkin   / 100) * 0.35 : 0;
  const coolOpacity2   = beautyParams.enabled ? (beautyParams.coolTone    / 100) * 0.30 : 0;
  const warmOpacity2   = beautyParams.enabled ? (beautyParams.warmTone    / 100) * 0.30 : 0;
  const slimFaceScale  = beautyParams.enabled && beautyParams.slimFace > 0
    ? 1 - (beautyParams.slimFace / 100) * 0.12 : 1;
  const slimChinScale  = beautyParams.enabled && beautyParams.slimChin > 0
    ? 1 - (beautyParams.slimChin / 100) * 0.06 : 1;
  const cameraTransform = slimFaceScale !== 1 || slimChinScale !== 1
    ? { transform: [{ scaleX: slimFaceScale }, { scaleY: slimChinScale }] } : null;

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Camera
        key={device.id}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        format={hdFormat}
        pixelFormat="yuv"
        resizeMode="cover"
        videoStabilizationMode="auto"
        onError={(e) => setCameraError(e.code)}
      />
      <ColorOverlays
        brightOpacity={brightOpacity}
        smoothOpacity={smoothOpacity}
        rosyOpacity={rosyOpacity}
        whiteOpacity={whiteOpacity2}
        coolOpacity={coolOpacity2}
        warmOpacity={warmOpacity2}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main export — routes to the best available component
// Priority: FaceMesh (TFLite 468-pt) > SkiaWarp (Skia+ML Kit) > SkiaColors (Skia only) > Simple
// SkiaColors: color filters + basic slim via Skia frame processor — masuk ke stream LiveKit.
// ═══════════════════════════════════════════════════════════════════════════════
export default function BeautyCameraView(props: Props) {
  if (FACE_MESH_AVAILABLE) {
    return <FaceMeshCameraView {...props} />;
  }
  if (USE_SKIA_WARP && _useFaceDetector && _useSkiaFrameProc) {
    return <BeautyCameraSkiaWarp {...props} />;
  }
  if (USE_SKIA_COLORS && _useSkiaFrameProc) {
    return <BeautyCameraSkiaColors {...props} />;
  }
  return <BeautyCameraSimple {...props} />;
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0010',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  placeholderTxt: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  faceIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  faceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  faceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
});
