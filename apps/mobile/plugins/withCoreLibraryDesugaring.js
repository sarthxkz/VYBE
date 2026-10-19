// libsignal-android's AAR metadata requires core library desugaring to be enabled in :app.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withCoreLibraryDesugaring(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('coreLibraryDesugaringEnabled')) {
      g = g.replace(/android\s*\{/, (m) => `${m}\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }`);
    }
    if (!g.includes('desugar_jdk_libs')) {
      g = g.replace(/dependencies\s*\{/, (m) => `${m}\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")`);
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
