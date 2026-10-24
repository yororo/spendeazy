// Throwaway Windows build accommodation: hash long CMake object paths.
const { withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withParserProofObjectPaths(config) {
  return withProjectBuildGradle(config, (result) => {
    const marker = '// parser-proof Windows object paths';
    // Optional short subst path for release targets with longer codegen names.
    const staging = process.env.PARSER_PROOF_CXX_DIR
      ? `new File(${JSON.stringify(process.env.PARSER_PROOF_CXX_DIR.replaceAll('\\', '/'))})`
      : 'new File(rootProject.projectDir, "../../.tmp/cxx")';
    if (result.modResults.contents.includes(marker)) {
      result.modResults.contents = result.modResults.contents.replace(
        /subproject\.android\.externalNativeBuild\.cmake\.buildStagingDirectory = [^\r\n]+/u,
        `subproject.android.externalNativeBuild.cmake.buildStagingDirectory = ${staging}`,
      );
    }
    if (!result.modResults.contents.includes(marker)) {
      const block = `\n${marker}\nsubprojects { subproject ->
  ["com.android.library", "com.android.application"].each { pluginId ->
    subproject.plugins.withId(pluginId) {
      def objectPathLimit = pluginId == "com.android.application" ? 250 : 240
      subproject.android.defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=" + objectPathLimit
      if (pluginId == "com.android.application") {
        subproject.android.externalNativeBuild.cmake.buildStagingDirectory = ${staging}
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
