import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { Skia, ClipOp } from '@shopify/react-native-skia';
import type { BeautyParams } from './BeautyCameraView';

// ── Module-level model source (HybridObject must not be re-created per render) ─
// react-native-fast-tflite v3 uses NitroModules — the require() returns a
// HybridObject. Keeping it at module scope avoids breaking its native binding.
let FACE_LANDMARK_MODEL: ReturnType<typeof require> | null = null;
try { FACE_LANDMARK_MODEL = require('../assets/models/face_landmark.tflite'); } catch {}

// ── Lazy-load hooks (avoid crash in Expo Go) ─────────────────────────────────
type UseSkiaFPFn = typeof import('react-native-vision-camera').useSkiaFrameProcessor;
type UseTfliteFn = typeof import('react-native-fast-tflite').useTensorflowModel;
type UseResizeFn = typeof import('vision-camera-resize-plugin').useResizePlugin;

let _useSkiaFP:  UseSkiaFPFn  | null = null;
let _useTflite:  UseTfliteFn  | null = null;
let _useResize:  UseResizeFn  | null = null;

try {
  _useSkiaFP = require('react-native-vision-camera').useSkiaFrameProcessor;
  _useTflite = require('react-native-fast-tflite').useTensorflowModel;
  _useResize = require('vision-camera-resize-plugin').useResizePlugin;
} catch {}

export const FACE_MESH_AVAILABLE =
  _useSkiaFP != null && _useTflite != null && _useResize != null;

// ── MediaPipe face_landmark.tflite key point indices ─────────────────────────
// Input:  192×192 RGB float32  (values 0–1)
// Output: Float32Array [1404] = 468 landmarks × 3 (x, y, z) in 0–192 space
const LM = {
  NOSE_TIP:    1,
  NOSE_BOTTOM: 94,
  NOSE_L:      327,
  NOSE_R:      98,
  L_EYE_OUT:   33,
  L_EYE_IN:    133,
  L_EYE_TOP:   159,
  L_EYE_BOT:   145,
  R_EYE_OUT:   263,
  R_EYE_IN:    362,
  R_EYE_TOP:   386,
  R_EYE_BOT:   374,
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  facing: 'front' | 'back';
  beautyParams: BeautyParams;
  style?: object;
}

// ── Helper: extract landmark xy in frame space ────────────────────────────────
// lm: Float32Array [1404], idx: landmark index, fw/fh: frame dimensions
// Model outputs in 0–192 space → scale to frame
function lmX(lm: Float32Array, idx: number, fw: number): number {
  'worklet';
  return (lm[idx * 3] / 192) * fw;
}
function lmY(lm: Float32Array, idx: number, fh: number): number {
  'worklet';
  return (lm[idx * 3 + 1] / 192) * fh;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FaceMeshCameraView({ facing, beautyParams, style }: Props) {
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

  // ── TFLite model ─────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tflite = _useTflite!(FACE_LANDMARK_MODEL!, []);

  // Store the loaded model in a SharedValue so the worklet can access it
  // WITHOUT passing `tflite` through the deps array (which would serialize
  // the HybridObject and break its native `this` binding in fast-tflite v3).
  const tfliteModelSV = useSharedValue<any>(null);
  useEffect(() => {
    tfliteModelSV.value = tflite.model ?? null;
  }, [tflite.model, tfliteModelSV]);

  // ── Resize plugin (preprocesses camera frame for TFLite 192×192 input) ──
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { resize } = _useResize!();

  // ── Shared values (slider → worklet, zero-copy) ──────────────────────────
  const svEnabled   = useSharedValue(beautyParams.enabled   ? 1 : 0);
  const svBright    = useSharedValue(beautyParams.brightSkin);
  const svSmooth    = useSharedValue(beautyParams.smoothSkin);
  const svRosy      = useSharedValue(beautyParams.rosyCheeks);
  const svWhite     = useSharedValue(beautyParams.whiteSkin);
  const svCool      = useSharedValue(beautyParams.coolTone);
  const svWarm      = useSharedValue(beautyParams.warmTone);
  const svSlimFace  = useSharedValue(beautyParams.slimFace);
  const svSlimChin  = useSharedValue(beautyParams.slimChin);
  const svSlimNose  = useSharedValue(beautyParams.slimNose);
  const svBigEyes   = useSharedValue(beautyParams.bigEyes);

  useEffect(() => {
    svEnabled.value  = beautyParams.enabled  ? 1 : 0;
    svBright.value   = beautyParams.brightSkin;
    svSmooth.value   = beautyParams.smoothSkin;
    svRosy.value     = beautyParams.rosyCheeks;
    svWhite.value    = beautyParams.whiteSkin;
    svCool.value     = beautyParams.coolTone;
    svWarm.value     = beautyParams.warmTone;
    svSlimFace.value = beautyParams.slimFace;
    svSlimChin.value = beautyParams.slimChin;
    svSlimNose.value = beautyParams.slimNose;
    svBigEyes.value  = beautyParams.bigEyes;
  }, [beautyParams, svEnabled, svBright, svSmooth, svRosy, svWhite,
      svCool, svWarm, svSlimFace, svSlimChin, svSlimNose, svBigEyes]);

  const CLIP_INT = ClipOp.Intersect;

  // ── Skia Frame Processor ─────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frameProcessor = _useSkiaFP!(
    (frame) => {
      'worklet';

      frame.render();

      if (!svEnabled.value) return;

      const fw = frame.width;
      const fh = frame.height;
      const fullRect = { x: 0, y: 0, width: fw, height: fh };

      // ── COLOR FILTERS (pixel-level → visible to viewers) ──────────────
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

      // ── FACE SHAPE WARP via ML-free Skia (slimFace, slimChin) ────────
      // These still use bounding-box scale (no TFLite needed for whole face)
      const slimFaceV = svSlimFace.value;
      const slimChinV = svSlimChin.value;

      // ── MEDIAPIPE 468-LANDMARK WARP (slimNose, bigEyes) ──────────────
      const slimNoseV = svSlimNose.value;
      const bigEyesV  = svBigEyes.value;
      const needLandmarks = slimNoseV > 0 || bigEyesV > 0 || slimFaceV > 0 || slimChinV > 0;

      if (!needLandmarks) return;
      const activeModel = tfliteModelSV.value;
      if (activeModel == null) return;

      // Resize frame to 192×192 float32 for TFLite input
      const input = resize(frame, {
        scale:       { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType:    'float32',
        mirror:      true,
      });

      // Run inference — synchronous, worklet-safe
      // resize() returns Float32Array; runSync needs ArrayBuffer → pass .buffer
      const outputs = activeModel.runSync([input.buffer as ArrayBuffer]);
      const lm = outputs[0] as unknown as Float32Array;
      if (!lm || lm.length < 1404) return;

      // ── MANCUNGKAN HIDUNG ────────────────────────────────────────────
      if (slimNoseV > 0) {
        const ntX  = lmX(lm, 1,  fw);   // nose tip
        const ntY  = lmY(lm, 1,  fh);
        const nlX  = lmX(lm, 327, fw);  // nose left wing
        const nrX  = lmX(lm, 98,  fw);  // nose right wing
        const nbY  = lmY(lm, 94,  fh);  // nose bottom

        const noseW  = Math.abs(nlX - nrX) * 1.3;
        const noseH  = Math.abs(nbY - ntY) * 1.4;
        const noseCX = ntX;
        const noseCY = (ntY + nbY) / 2;

        const nosePath = Skia.Path.Make();
        nosePath.addOval({
          x:      noseCX - noseW / 2,
          y:      noseCY - noseH / 2,
          width:  noseW,
          height: noseH,
        });

        const noseAmt = slimNoseV * 0.0008; // max ~8% at 100
        frame.save();
        frame.clipPath(nosePath, CLIP_INT, true);
        frame.translate(noseCX, noseCY);
        frame.scale(1 - noseAmt, 1);
        frame.translate(-noseCX, -noseCY);
        frame.render();
        frame.restore();
      }

      // ── PERBESAR MATA KIRI ───────────────────────────────────────────
      if (bigEyesV > 0) {
        const applyEyeWarp = (
          outIdx: number, inIdx: number, topIdx: number, botIdx: number
        ) => {
          'worklet';
          const ex1 = lmX(lm, outIdx, fw);
          const ex2 = lmX(lm, inIdx,  fw);
          const ey1 = lmY(lm, topIdx, fh);
          const ey2 = lmY(lm, botIdx, fh);
          const ecx = (ex1 + ex2) / 2;
          const ecy = (ey1 + ey2) / 2;
          const ew  = Math.abs(ex2 - ex1) * 1.4;
          const eh  = Math.abs(ey2 - ey1) * 2.2;

          const eyePath = Skia.Path.Make();
          eyePath.addOval({
            x:      ecx - ew / 2,
            y:      ecy - eh / 2,
            width:  ew,
            height: eh,
          });

          const eyeAmt = 1 + bigEyesV * 0.0008; // scale up
          frame.save();
          frame.clipPath(eyePath, CLIP_INT, true);
          frame.translate(ecx, ecy);
          frame.scale(eyeAmt, eyeAmt);
          frame.translate(-ecx, -ecy);
          frame.render();
          frame.restore();
        };

        // Left eye (33=outer, 133=inner, 159=top, 145=bottom)
        applyEyeWarp(33, 133, 159, 145);
        // Right eye (263=outer, 362=inner, 386=top, 374=bottom)
        applyEyeWarp(263, 362, 386, 374);
      }

      // ── TIPISKAN WAJAH & DAGU (bounding-box scale, no TFLite needed) ─
      // We do this AFTER landmark warp for better visual stacking
      if (slimFaceV > 0 || slimChinV > 0) {
        // Derive rough face bounding box from landmark extremes
        const faceL  = lmX(lm, 234, fw);  // left cheek
        const faceR  = lmX(lm, 454, fw);  // right cheek
        const faceT  = lmY(lm, 10,  fh);  // forehead
        const faceB  = lmY(lm, 152, fh);  // chin bottom
        const faceCX = (faceL + faceR) / 2;
        const faceCY = (faceT + faceB) / 2;
        const faceW  = Math.abs(faceR - faceL) * 1.2;
        const faceH  = Math.abs(faceB - faceT) * 1.1;

        if (slimFaceV > 0) {
          const facePath = Skia.Path.Make();
          facePath.addOval({ x: faceCX - faceW/2, y: faceCY - faceH/2, width: faceW, height: faceH });
          const amt = slimFaceV * 0.0010;
          frame.save();
          frame.clipPath(facePath, CLIP_INT, true);
          frame.translate(faceCX, faceCY);
          frame.scale(1 - amt, 1);
          frame.translate(-faceCX, -faceCY);
          frame.render();
          frame.restore();
        }

        if (slimChinV > 0) {
          const chinT  = faceT + faceH * 0.62;
          const chinH  = faceH * 0.38;
          const chinCY = chinT + chinH / 2;
          const chinPath = Skia.Path.Make();
          chinPath.addOval({
            x:      faceCX - faceW * 0.40,
            y:      chinT,
            width:  faceW * 0.80,
            height: chinH,
          });
          const amt = slimChinV * 0.0007;
          frame.save();
          frame.clipPath(chinPath, CLIP_INT, true);
          frame.translate(faceCX, chinT + chinH / 2);
          frame.scale(1 - amt, 1 - amt * 0.6);
          frame.translate(-faceCX, -chinCY);
          frame.render();
          frame.restore();
        }
      }
    },
    [tfliteModelSV, resize, svEnabled, svBright, svSmooth, svRosy, svWhite,
     svCool, svWarm, svSlimFace, svSlimChin, svSlimNose, svBigEyes],
  );

  // ── Render guards ────────────────────────────────────────────────────────
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
          ? <Text style={styles.txt}>Izin kamera diperlukan</Text>
          : <><ActivityIndicator color="#FF6B9D" /><Text style={styles.txt}>Memuat kamera...</Text></>
        }
      </View>
    );
  }

  const modelState = tflite.state;

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
      {modelState === 'loading' && (
        <View style={styles.badge} pointerEvents="none">
          <ActivityIndicator size="small" color="#FF6B9D" />
          <Text style={styles.badgeTxt}>Memuat model AI...</Text>
        </View>
      )}
      {modelState === 'loaded' && (
        <View style={styles.badge} pointerEvents="none">
          <View style={styles.dot} />
          <Text style={styles.badgeTxt}>MediaPipe 468pt</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0010',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  txt: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  badge: {
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
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  badgeTxt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
});
