#import <Foundation/Foundation.h>
#import <WebRTC/RTCVideoFrame.h>
#import <WebRTC/RTCVideoCapturer.h>

/**
 * Implements VideoFrameProcessorDelegate from @livekit/react-native-webrtc
 * to apply beauty filters (skin smooth + bright + rosiness) on each camera frame
 * before it is sent via LiveKit to viewers.
 */
@interface BeautyFrameProcessor : NSObject

@property(nonatomic, assign) float smooth;
@property(nonatomic, assign) float bright;
@property(nonatomic, assign) float rosiness;
@property(nonatomic, assign) BOOL enabled;

- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer didCaptureVideoFrame:(RTCVideoFrame *)frame;

@end
