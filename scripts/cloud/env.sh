#!/usr/bin/env bash
# Source from any directory; generated tools and logs stay out of Git.
SPENDEAZY_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export SPENDEAZY_REPO_ROOT
export SPENDEAZY_CLOUD_STATE="${SPENDEAZY_CLOUD_STATE:-$SPENDEAZY_REPO_ROOT/.local/cloud}"
if [[ $SPENDEAZY_CLOUD_STATE != /* ]]; then
  echo 'SPENDEAZY_CLOUD_STATE must be an absolute path.' >&2
  return 1
fi
export PATH="$SPENDEAZY_CLOUD_STATE/node-v24.11.1-linux-x64/bin:$PATH"
export npm_config_cache="$SPENDEAZY_CLOUD_STATE/npm"
export EXPO_NO_TELEMETRY=1
export CI=1
export BUILDX_CONFIG="$SPENDEAZY_CLOUD_STATE/buildx"
export GRADLE_USER_HOME="$SPENDEAZY_CLOUD_STATE/gradle"
export ANDROID_HOME="$SPENDEAZY_CLOUD_STATE/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$SPENDEAZY_CLOUD_STATE/android-home"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
