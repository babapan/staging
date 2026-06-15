const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Adds Android packagingOptions to resolve duplicate native .so file conflicts
 * at release build packaging time (:app:packageRelease).
 *
 * Root cause: Multiple native modules (WebRTC, VisionCamera, Skia, MLKit, etc.)
 * each bundle common native libs like libc++_shared.so and libfbjni.so.
 * During release APK packaging (PackageAndroidArtifact$IncrementalSplitterRunnable),
 * Gradle fails when it finds duplicate .so files across AARs/modules.
 *
 * pickFirst rules tell Gradle to keep the first occurrence and discard duplicates
 * instead of throwing an error. Debug builds skip this packaging step so they work fine.
 */
module.exports = function withPackagingOptions(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;

    if (gradle.includes('pickFirst \'**/libc++_shared.so\'')) {
      return cfg;
    }

    const packagingBlock = `
    packagingOptions {
        pickFirst '**/libc++_shared.so'
        pickFirst '**/libfbjni.so'
        pickFirst '**/libhermes.so'
        pickFirst '**/libhermes-executor-debug.so'
        pickFirst '**/libhermes-executor-release.so'
        pickFirst '**/libjsc.so'
        pickFirst '**/libjscexecutor.so'
        pickFirst '**/libreact_nativemodule_core.so'
        pickFirst '**/libturbomodulejsijni.so'
        pickFirst '**/libglog.so'
        pickFirst '**/libfolly_json.so'
        pickFirst '**/libboost_regex.so'
        pickFirst '**/libevent-2.1.so'
        pickFirst '**/libevent_core-2.1.so'
        pickFirst '**/libevent_extra-2.1.so'
        pickFirst '**/libssl.so'
        pickFirst '**/libcrypto.so'
        excludes += ['/META-INF/DEPENDENCIES', '/META-INF/LICENSE', '/META-INF/NOTICE']
    }
`;

    cfg.modResults.contents = gradle.replace(
      /android\s*\{/,
      `android {\n${packagingBlock}`
    );

    return cfg;
  });
};
