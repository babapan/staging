#import "BeautyFilterModule.h"
#import "BeautyFrameProcessor.h"
#import <React/RCTLog.h>

// Import ProcessorProvider from @livekit/react-native-webrtc
#import <RCTWebRTC/videoEffects/ProcessorProvider.h>

static BeautyFrameProcessor *sharedProcessor = nil;

@implementation BeautyFilterModule

RCT_EXPORT_MODULE(BeautyFilter)

+ (void)load {
    // Register our processor so WebRTC picks it up when "beauty" is requested
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedProcessor = [[BeautyFrameProcessor alloc] init];
        [ProcessorProvider addProcessor:sharedProcessor forName:@"beauty"];
    });
}

RCT_EXPORT_METHOD(setBeautyParams:(NSDictionary *)params) {
    if (!sharedProcessor) return;
    if (params[@"smooth"])   sharedProcessor.smooth   = [params[@"smooth"]   floatValue];
    if (params[@"bright"])   sharedProcessor.bright   = [params[@"bright"]   floatValue];
    if (params[@"rosiness"]) sharedProcessor.rosiness = [params[@"rosiness"] floatValue];
    if (params[@"enabled"])  sharedProcessor.enabled  = [params[@"enabled"]  boolValue];
}

@end
