/**
 * Expo config plugin — wires the native BeautyFilter module into Android and iOS builds.
 *
 * Android: copies Java sources + registers BeautyFilterPackage in MainApplication
 * iOS:     copies podspec + sources, adds local pod to Podfile
 */
const {
  withPlugins,
  withDangerousMod,
  withMainApplication,
  withPodfileProperties,
} = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

// ── Android — copy sources ────────────────────────────────────────────────────
function withBeautyFilterAndroidSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, 'android');

      const srcDir = path.join(
        projectRoot,
        'modules/beauty-filter/android/src/main/java/com/migme/beautyfilter'
      );
      const dstDir = path.join(
        androidRoot,
        'app/src/main/java/com/migme/beautyfilter'
      );

      fs.mkdirSync(dstDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
      }

      return cfg;
    },
  ]);
}

// ── Android — register package in MainApplication.kt ─────────────────────────
function withBeautyFilterMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes('BeautyFilterPackage')) return cfg;

    // Add import after package declaration
    contents = contents.replace(
      /^(package .+)/m,
      '$1\nimport com.migme.beautyfilter.BeautyFilterPackage'
    );

    // Inject into PackageList — handles Expo-generated Kotlin template
    if (contents.includes('PackageList(this).packages')) {
      contents = contents.replace(
        'PackageList(this).packages',
        'PackageList(this).packages.also { it.add(BeautyFilterPackage()) }'
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

// ── iOS — copy sources + podspec, add pod to Podfile ─────────────────────────
function withBeautyFilterIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosRoot     = path.join(projectRoot, 'ios');

      // Copy ObjC sources + podspec into ios/BeautyFilter/
      const srcDir = path.join(projectRoot, 'modules/beauty-filter/ios');
      const dstDir = path.join(iosRoot, 'BeautyFilter');
      fs.mkdirSync(dstDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
      }

      // Add local pod to Podfile
      const podfilePath = path.join(iosRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, 'utf8');
        if (!podfile.includes("pod 'BeautyFilter'")) {
          // Insert after the last "use_expo_modules!" or after "use_react_native!"
          const insertAfter = "use_expo_modules!";
          if (podfile.includes(insertAfter)) {
            podfile = podfile.replace(
              insertAfter,
              `${insertAfter}\n  pod 'BeautyFilter', :path => './BeautyFilter'`
            );
          } else {
            // Fallback: insert before end of target block
            podfile = podfile.replace(
              /^(\s*target .+ do)/m,
              `$1\n  pod 'BeautyFilter', :path => './BeautyFilter'`
            );
          }
          fs.writeFileSync(podfilePath, podfile);
        }
      }

      return cfg;
    },
  ]);
}

module.exports = (config) =>
  withPlugins(config, [
    withBeautyFilterAndroidSources,
    withBeautyFilterMainApplication,
    withBeautyFilterIOS,
  ]);
