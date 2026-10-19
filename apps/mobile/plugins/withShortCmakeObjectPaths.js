// Windows builds hit MAX_PATH (260) on codegen object files nested under node_modules.
// CMAKE_OBJECT_PATH_MAX makes CMake hash long object paths instead; harmless on other OSes.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withShortCmakeObjectPaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('CMAKE_OBJECT_PATH_MAX')) {
      g = g.replace(
        /defaultConfig\s*\{/,
        (m) => `${m}\n        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=128"\n            }\n        }`,
      );
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
