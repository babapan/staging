#import "BeautyFrameProcessor.h"
#import <CoreImage/CoreImage.h>
#import <WebRTC/RTCCVPixelBuffer.h>
#import <WebRTC/RTCI420Buffer.h>

@implementation BeautyFrameProcessor {
    CIContext *_ciContext;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        // Use Metal GPU context for performance
        _ciContext = [CIContext contextWithOptions:@{kCIContextUseSoftwareRenderer: @NO}];
        _smooth   = 0.0f;
        _bright   = 0.0f;
        _rosiness = 0.0f;
        _enabled  = NO;
    }
    return self;
}

- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer didCaptureVideoFrame:(RTCVideoFrame *)frame {
    if (!_enabled || (_smooth < 0.01f && _bright < 0.01f && _rosiness < 0.01f)) {
        return frame;
    }

    // Work only with pixel buffer frames (CVPixelBuffer path — most common on iOS)
    id<RTCVideoFrameBuffer> buffer = frame.buffer;
    if (![buffer isKindOfClass:[RTCCVPixelBuffer class]]) {
        return frame;
    }

    RTCCVPixelBuffer *cvBuffer = (RTCCVPixelBuffer *)buffer;
    CVPixelBufferRef pixelBuffer = cvBuffer.pixelBuffer;

    CIImage *image = [CIImage imageWithCVPixelBuffer:pixelBuffer];

    // ── Skin smoothing: Gaussian blur ─────────────────────────────────────────
    if (_smooth > 0.01f) {
        float radius = _smooth * 4.0f;  // 0–4px radius
        CIFilter *blur = [CIFilter filterWithName:@"CIGaussianBlur"];
        [blur setValue:image forKey:kCIInputImageKey];
        [blur setValue:@(radius) forKey:kCIInputRadiusKey];
        image = [blur outputImage];
    }

    // ── Brightness + rosiness via color controls ──────────────────────────────
    if (_bright > 0.01f || _rosiness > 0.01f) {
        // Brightness adjustment
        CIFilter *bri = [CIFilter filterWithName:@"CIColorControls"];
        [bri setValue:image forKey:kCIInputImageKey];
        [bri setValue:@(_bright * 0.3f) forKey:kCIInputBrightnessKey];  // 0–0.3
        [bri setValue:@(1.0f + _bright * 0.2f) forKey:kCIInputSaturationKey]; // subtle warmth
        image = [bri outputImage];

        // Rosiness: boost red channel via color matrix
        if (_rosiness > 0.01f) {
            float rs = _rosiness * 0.15f;  // 0–0.15 red boost
            CIFilter *cm = [CIFilter filterWithName:@"CIColorMatrix"];
            [cm setValue:image forKey:kCIInputImageKey];
            [cm setValue:[CIVector vectorWithX:1+rs Y:0 Z:0 W:0] forKey:@"inputRVector"];
            [cm setValue:[CIVector vectorWithX:0 Y:1 Z:0 W:0]    forKey:@"inputGVector"];
            [cm setValue:[CIVector vectorWithX:0 Y:0 Z:1 W:0]    forKey:@"inputBVector"];
            [cm setValue:[CIVector vectorWithX:0 Y:0 Z:0 W:1]    forKey:@"inputAVector"];
            image = [cm outputImage];
        }
    }

    // ── Render back to a new CVPixelBuffer ───────────────────────────────────
    CVPixelBufferRef outBuffer = NULL;
    size_t w = CVPixelBufferGetWidth(pixelBuffer);
    size_t h = CVPixelBufferGetHeight(pixelBuffer);

    NSDictionary *attrs = @{
        (NSString *)kCVPixelBufferIOSurfacePropertiesKey: @{},
        (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
    };
    CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA,
                        (__bridge CFDictionaryRef)attrs, &outBuffer);

    if (!outBuffer) return frame;

    [_ciContext render:image toCVPixelBuffer:outBuffer];

    RTCCVPixelBuffer *outRTCBuffer = [[RTCCVPixelBuffer alloc] initWithPixelBuffer:outBuffer];
    CVBufferRelease(outBuffer);

    RTCVideoFrame *processed = [[RTCVideoFrame alloc]
        initWithBuffer:outRTCBuffer
              rotation:frame.rotation
           timeStampNs:frame.timeStampNs];

    return processed;
}

@end
