#!/usr/bin/env bash
# Optional native toolchain. Routine JS/API validation does not require this.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
if [[ ${1:-} != --accept-licenses || $# -gt 2 || (${2:-} != '' && ${2:-} != --avd) ]]; then
  echo 'Usage: bash scripts/cloud/bootstrap-android.sh --accept-licenses [--avd]' >&2
  exit 1
fi
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || exit 1
for tool in java unzip curl sha256sum flock; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
[[ $(node -v) == v24.11.1 ]] || { echo 'Run cloud/bootstrap.sh first.' >&2; exit 1; }
mkdir -p "$ANDROID_HOME" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME"
exec 9>"$SPENDEAZY_CLOUD_STATE/operation.lock"
flock -n 9 || { echo 'Another cloud setup/validation is running in this state directory.' >&2; exit 1; }
download_dir=$(mktemp -d "$SPENDEAZY_CLOUD_STATE/android-download.XXXXXX")
trap 'rm -rf "$download_dir"' EXIT
if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl -fL --retry 2 https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -o "$download_dir/tools.zip"
  unzip -q "$download_dir/tools.zip" -d "$download_dir/tools"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$download_dir/tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
if [[ ! -x "$SPENDEAZY_CLOUD_STATE/jdk-17.0.12/bin/java" ]]; then
  curl -fL --retry 2 https://download.oracle.com/java/17/archive/jdk-17.0.12_linux-x64_bin.tar.gz -o "$download_dir/jdk.tar.gz"
  (cd "$download_dir" && printf '%s  jdk.tar.gz\n' 311f1448312ecab391fe2a1b2ac140d6e1c7aea6fbf08416b466a58874f2b40f | sha256sum -c -)
  tar -xzf "$download_dir/jdk.tar.gz" -C "$SPENDEAZY_CLOUD_STATE"
fi
sdk_proxy=()
if [[ -n ${HTTPS_PROXY:-${https_proxy:-}} ]]; then
  mapfile -t proxy_parts < <(node -e 'const u=new URL(process.env.HTTPS_PROXY || process.env.https_proxy); if(u.username || u.password || u.protocol!=="http:") process.exit(1); console.log(u.hostname); console.log(u.port || "80")')
  [[ ${#proxy_parts[@]} == 2 ]] || { echo 'Android setup needs an unauthenticated HTTP proxy URL.' >&2; exit 1; }
  sdk_proxy=(--proxy=http "--proxy_host=${proxy_parts[0]}" "--proxy_port=${proxy_parts[1]}")
fi
# Write only non-secret toolchain settings. Preserve Java TLS verification.
{
  printf 'org.gradle.java.installations.paths=%s\n' "$SPENDEAZY_CLOUD_STATE/jdk-17.0.12"
  printf 'org.gradle.java.installations.auto-download=false\n'
  if [[ -f /etc/ssl/certs/java/cacerts ]]; then
    printf 'systemProp.javax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts\n'
  fi
  if [[ ${#sdk_proxy[@]} -gt 0 ]]; then
    printf 'systemProp.https.proxyHost=%s\nsystemProp.http.proxyHost=%s\n' "${proxy_parts[0]}" "${proxy_parts[0]}"
    printf 'systemProp.https.proxyPort=%s\nsystemProp.http.proxyPort=%s\n' "${proxy_parts[1]}" "${proxy_parts[1]}"
  fi
} > "$GRADLE_USER_HOME/gradle.properties"
# yes can receive SIGPIPE when sdkmanager exits successfully; inspect sdkmanager's status.
set +o pipefail
yes | sdkmanager --sdk_root="$ANDROID_HOME" "${sdk_proxy[@]}" --licenses >/dev/null
license_status=${PIPESTATUS[1]}
set -o pipefail
[[ $license_status == 0 ]] || exit "$license_status"
packages=(platform-tools emulator 'platforms;android-37.0' 'build-tools;37.0.0' 'ndk;27.1.12297006')
if [[ ${2:-} == --avd ]]; then packages+=('system-images;android-35;google_apis_playstore;x86_64'); fi
sdkmanager --sdk_root="$ANDROID_HOME" "${sdk_proxy[@]}" "${packages[@]}"
if [[ ${2:-} == --avd ]] && [[ ! -f "$ANDROID_AVD_HOME/spendeazy.ini" ]]; then
  printf 'no\n' | avdmanager create avd --name spendeazy --package 'system-images;android-35;google_apis_playstore;x86_64' --device pixel_6a
fi
echo 'Android toolchain installed. AVD boot and Google sign-in are separate checks.'
