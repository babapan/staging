const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Excludes org.jitsi:webrtc from ALL subproject Gradle configurations.
 *
 * Root cause: react-native-webrtc pulls org.jitsi:webrtc:124.x via its own
 * subproject build.gradle. @livekit/react-native pulls io.github.webrtc-sdk:android:144.x.
 * Both AARs contain identical org.webrtc.* classes → DexMerging / duplicate-class failures.
 *
 * The fix must live in the ROOT android/build.gradle inside allprojects{} so it
 * cascades into every subproject (including react-native-webrtc's Gradle module).
 * Patching only android/app/build.gradle is NOT sufficient.
 *
 * We keep io.github.webrtc-sdk (LiveKit, v144) and drop org.jitsi:webrtc (v124).
 */
module.exports = function withWebRTCDedup(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;

    if (gradle.includes("exclude group: 'org.jitsi'")) {
      return cfg;
    }

    const block = `
allprojects {
    configurations.all {
        exclude group: 'org.jitsi', module: 'webrtc'
        resolutionStrategy {
            force 'io.github.webrtc-sdk:android:144.7559.01'
        }
    }
}
`;

    cfg.modResults.contents = gradle + block;
    return cfg;
  });
};
