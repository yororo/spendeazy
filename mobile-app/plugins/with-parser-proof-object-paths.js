// Throwaway Windows build accommodation: hash long CMake object paths.
const { withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withParserProofObjectPaths(config) {
  return withProjectBuildGradle(config, (result) => {
    const marker = '// parser-proof Windows object paths';
    if (!result.modResults.contents.includes(marker)) {
      const block = `\n${marker}\nsubprojects { subproject ->
  ["com.android.library", "com.android.application"].each { pluginId ->
    subproject.plugins.withId(pluginId) {
      def objectPathLimit = pluginId == "com.android.application" ? 250 : 240
      subproject.android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=" + objectPathLimit
      if (pluginId == "com.android.application") {
        subproject.android.externalNativeBuild.cmake.buildStagingDirectory = new File(rootProject.projectDir, "../../.tmp/cxx")
      }
    }
  }
}\n`;
      // The React Native root plugin can evaluate :app immediately. Register
      // before applying it so application and library targets both get the cap.
      result.modResults.contents = result.modResults.contents.replace('apply plugin: "expo-root-project"', `${block}\napply plugin: "expo-root-project"`);
    }
    return result;
  });
};
