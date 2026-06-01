package com.migme.beautyfilter;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.opengl.GLES20;

import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor;

import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoFrame;
import org.webrtc.VideoFrame.I420Buffer;
import org.webrtc.YuvConverter;
import org.webrtc.JavaI420Buffer;

import java.nio.ByteBuffer;

/**
 * Implements VideoFrameProcessor to apply beauty filters (skin smoothing + brightening)
 * on every WebRTC video frame before it is sent via LiveKit to viewers.
 *
 * Registered into ProcessorProvider as "beauty" from BeautyFilterModule.
 */
public class BeautyFrameProcessor implements VideoFrameProcessor {

    private volatile float smooth   = 0f;   // 0-1 blur strength
    private volatile float bright   = 0f;   // 0-1 brightness
    private volatile float rosiness = 0f;   // 0-1 redness
    private volatile boolean enabled = false;

    public void setParams(float smooth, float bright, float rosiness, boolean enabled) {
        this.smooth   = smooth;
        this.bright   = bright;
        this.rosiness = rosiness;
        this.enabled  = enabled;
    }

    @Override
    public VideoFrame process(VideoFrame frame, SurfaceTextureHelper textureHelper) {
        if (!enabled || (smooth < 0.01f && bright < 0.01f && rosiness < 0.01f)) {
            frame.retain();
            return frame;
        }

        I420Buffer i420 = frame.getBuffer().toI420();
        if (i420 == null) {
            frame.retain();
            return frame;
        }

        int width  = i420.getWidth();
        int height = i420.getHeight();

        // Convert I420 → Bitmap (ARGB_8888) for CPU processing
        Bitmap bmp = i420ToBitmap(i420, width, height);
        i420.release();

        if (bmp == null) {
            frame.retain();
            return frame;
        }

        // Apply skin brightening + rosiness via ColorMatrix
        bmp = applyColorEffects(bmp, bright, rosiness);

        // Apply skin smoothing via box blur
        if (smooth > 0.01f) {
            bmp = boxBlur(bmp, (int)(smooth * 4) + 1);
        }

        // Convert Bitmap back to I420Buffer
        I420Buffer outI420 = bitmapToI420(bmp, width, height);
        bmp.recycle();

        if (outI420 == null) {
            frame.retain();
            return frame;
        }

        VideoFrame processed = new VideoFrame(outI420, frame.getRotation(), frame.getTimestampNs());
        outI420.release();
        return processed;
    }

    // ── I420 → Bitmap ──────────────────────────────────────────────────────────
    private Bitmap i420ToBitmap(I420Buffer i420, int width, int height) {
        try {
            int[] argb = new int[width * height];
            ByteBuffer yBuf = i420.getDataY();
            ByteBuffer uBuf = i420.getDataU();
            ByteBuffer vBuf = i420.getDataV();
            int yStride = i420.getStrideY();
            int uStride = i420.getStrideU();
            int vStride = i420.getStrideV();

            for (int row = 0; row < height; row++) {
                for (int col = 0; col < width; col++) {
                    int y = yBuf.get(row * yStride + col) & 0xFF;
                    int u = uBuf.get((row / 2) * uStride + (col / 2)) & 0xFF;
                    int v = vBuf.get((row / 2) * vStride + (col / 2)) & 0xFF;

                    int r = clamp((int)(y + 1.402f * (v - 128)));
                    int g = clamp((int)(y - 0.344f * (u - 128) - 0.714f * (v - 128)));
                    int b = clamp((int)(y + 1.772f * (u - 128)));

                    argb[row * width + col] = 0xFF000000 | (r << 16) | (g << 8) | b;
                }
            }

            return Bitmap.createBitmap(argb, width, height, Bitmap.Config.ARGB_8888);
        } catch (Exception e) {
            return null;
        }
    }

    // ── Bitmap → I420Buffer ────────────────────────────────────────────────────
    private I420Buffer bitmapToI420(Bitmap bmp, int width, int height) {
        try {
            int[] pixels = new int[width * height];
            bmp.getPixels(pixels, 0, width, 0, 0, width, height);

            int uvWidth  = (width  + 1) / 2;
            int uvHeight = (height + 1) / 2;

            ByteBuffer yBuf = ByteBuffer.allocateDirect(width * height);
            ByteBuffer uBuf = ByteBuffer.allocateDirect(uvWidth * uvHeight);
            ByteBuffer vBuf = ByteBuffer.allocateDirect(uvWidth * uvHeight);

            for (int row = 0; row < height; row++) {
                for (int col = 0; col < width; col++) {
                    int px = pixels[row * width + col];
                    int r = (px >> 16) & 0xFF;
                    int g = (px >>  8) & 0xFF;
                    int b =  px        & 0xFF;

                    int y = clamp((int)( 0.257f * r + 0.504f * g + 0.098f * b + 16));
                    yBuf.put((byte) y);

                    if ((row % 2 == 0) && (col % 2 == 0)) {
                        int u = clamp((int)(-0.148f * r - 0.291f * g + 0.439f * b + 128));
                        int v = clamp((int)( 0.439f * r - 0.368f * g - 0.071f * b + 128));
                        uBuf.put((byte) u);
                        vBuf.put((byte) v);
                    }
                }
            }

            yBuf.rewind(); uBuf.rewind(); vBuf.rewind();

            return JavaI420Buffer.wrap(
                width, height,
                yBuf, width,
                uBuf, uvWidth,
                vBuf, uvWidth,
                null
            );
        } catch (Exception e) {
            return null;
        }
    }

    // ── Color effects (brightness + rosiness) ─────────────────────────────────
    private Bitmap applyColorEffects(Bitmap src, float bright, float rosiness) {
        float br = bright   * 60f;   // 0–60 pixel value boost
        float rs = rosiness * 30f;   // 0–30 extra red boost

        ColorMatrix cm = new ColorMatrix(new float[]{
            1, 0, 0, 0, br + rs,
            0, 1, 0, 0, br,
            0, 0, 1, 0, br,
            0, 0, 0, 1, 0
        });

        Paint paint = new Paint();
        paint.setColorFilter(new ColorMatrixColorFilter(cm));

        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        new Canvas(out).drawBitmap(src, 0, 0, paint);
        src.recycle();
        return out;
    }

    // ── Simple box blur ────────────────────────────────────────────────────────
    private Bitmap boxBlur(Bitmap src, int radius) {
        if (radius < 1) return src;
        int w = src.getWidth();
        int h = src.getHeight();
        int[] pix = new int[w * h];
        src.getPixels(pix, 0, w, 0, 0, w, h);
        src.recycle();

        int[] tmp = new int[w * h];
        int r2 = Math.max(1, radius);

        // Horizontal pass
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int ra = 0, ga = 0, ba = 0, cnt = 0;
                for (int kx = -r2; kx <= r2; kx++) {
                    int nx = Math.min(Math.max(x + kx, 0), w - 1);
                    int px = pix[y * w + nx];
                    ra += (px >> 16) & 0xFF;
                    ga += (px >>  8) & 0xFF;
                    ba +=  px        & 0xFF;
                    cnt++;
                }
                tmp[y * w + x] = 0xFF000000 | ((ra/cnt) << 16) | ((ga/cnt) << 8) | (ba/cnt);
            }
        }

        // Vertical pass
        int[] out = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int ra = 0, ga = 0, ba = 0, cnt = 0;
                for (int ky = -r2; ky <= r2; ky++) {
                    int ny = Math.min(Math.max(y + ky, 0), h - 1);
                    int px = tmp[ny * w + x];
                    ra += (px >> 16) & 0xFF;
                    ga += (px >>  8) & 0xFF;
                    ba +=  px        & 0xFF;
                    cnt++;
                }
                out[y * w + x] = 0xFF000000 | ((ra/cnt) << 16) | ((ga/cnt) << 8) | (ba/cnt);
            }
        }

        return Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888);
    }

    private int clamp(int v) { return Math.min(255, Math.max(0, v)); }
}
