// Use SDK CMake 4.1.2 for the app's native build: its ninja (1.12) is long-path aware, which Windows
// needs for react-native-gesture-handler's deep codegen paths (also requires LongPathsEnabled=1).
const { withAppBuildGradle } = require('expo/config-plugins');

const CMAKE_VERSION = '4.1.2';

module.exports = function withCmakeVersion(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes(`version "${CMAKE_VERSION}"`)) {
      g = g.replace(/android\s*\{/, (m) => `${m}\n    externalNativeBuild {\n        cmake {\n            version "${CMAKE_VERSION}"\n        }\n    }`);
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
