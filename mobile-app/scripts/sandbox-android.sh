#!/usr/bin/env bash
# Connect the Windows (or WSL) adb server to Metro, then start the Expo dev client.
set -euo pipefail

cd "$(dirname "$0")/.."

port="${EXPO_PORT:-8081}"

if [[ -z "${ADB_SERVER_SOCKET:-}" ]]; then
  echo "ADB_SERVER_SOCKET is unset." >&2
  echo "The dev container sets tcp:host.docker.internal:5037." >&2
  echo "On Windows, leave this running first: adb -a nodaemon server start" >&2
  exit 1
fi

echo "adb server: ${ADB_SERVER_SOCKET}"
if ! adb devices -l; then
  echo "Could not reach the host adb server at ${ADB_SERVER_SOCKET}." >&2
  echo "On Windows, leave this running: adb -a nodaemon server start" >&2
  exit 1
fi

if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'; then
  echo "No emulator is in the device state. Start the Android Studio AVD, then retry." >&2
  exit 1
fi

adb reverse "tcp:${port}" "tcp:${port}"
echo "Reversed emulator localhost:${port} to host localhost:${port}."
echo "Confirm the editor forwarded host port ${port} into this container before the app loads."

export REACT_NATIVE_PACKAGER_HOSTNAME="${REACT_NATIVE_PACKAGER_HOSTNAME:-127.0.0.1}"
export NODE_OPTIONS="--dns-result-order=ipv4first${NODE_OPTIONS:+ ${NODE_OPTIONS}}"
exec npx expo start --dev-client --host lan --port "${port}"
