const { withAndroidManifest } = require("expo/config-plugins");

function withNoInternetPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    const kept = permissions.filter((permission) => {
      return permission.$?.["android:name"] !== "android.permission.INTERNET";
    });
    kept.push({
      $: {
        "android:name": "android.permission.INTERNET",
        "tools:node": "remove",
      },
    });
    manifest["uses-permission"] = kept;
    return config;
  });
}

module.exports = withNoInternetPermission;
