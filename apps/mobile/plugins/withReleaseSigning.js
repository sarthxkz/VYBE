// Sign release builds with Vybe's own key, read from Gradle properties outside the repo
// (~/.gradle/gradle.properties): VYBE_RELEASE_STORE_FILE, VYBE_RELEASE_STORE_PASSWORD,
// VYBE_RELEASE_KEY_ALIAS, VYBE_RELEASE_KEY_PASSWORD. Without them the release APK is left unsigned
// (uninstallable) instead of silently using the public debug key, which anyone could sign "updates" with.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (findProperty('VYBE_RELEASE_STORE_FILE')) {
                storeFile file(findProperty('VYBE_RELEASE_STORE_FILE'))
                storePassword findProperty('VYBE_RELEASE_STORE_PASSWORD')
                keyAlias findProperty('VYBE_RELEASE_KEY_ALIAS')
                keyPassword findProperty('VYBE_RELEASE_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('VYBE_RELEASE_STORE_FILE')) {
      g = g.replace(/(signingConfigs\s*\{[\s\S]*?keyPassword 'android'\s*\n\s*\})/, `$1${RELEASE_CONFIG}`);
      g = g.replace(
        /(release\s*\{\s*\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
        "$1signingConfig findProperty('VYBE_RELEASE_STORE_FILE') ? signingConfigs.release : null",
      );
      if (!g.includes("? signingConfigs.release : null")) throw new Error('withReleaseSigning: build.gradle layout changed');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
