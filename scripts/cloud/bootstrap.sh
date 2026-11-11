#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
if [[ $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
  echo 'Cloud bootstrap currently supports Linux x86_64 only.' >&2
  exit 1
fi
for tool in curl tar sha256sum flock; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
mkdir -p "$SPENDEAZY_CLOUD_STATE"
exec 9>"$SPENDEAZY_CLOUD_STATE/operation.lock"
flock -n 9 || { echo 'Another cloud setup/validation is running in this state directory.' >&2; exit 1; }
archive=node-v24.11.1-linux-x64.tar.xz
if [[ ! -x "$SPENDEAZY_CLOUD_STATE/node-v24.11.1-linux-x64/bin/node" || ! -x "$SPENDEAZY_CLOUD_STATE/node-v24.11.1-linux-x64/bin/npm" ]]; then
  download_dir=$(mktemp -d "$SPENDEAZY_CLOUD_STATE/download.XXXXXX")
  trap 'rm -rf "$download_dir"' EXIT
  curl -fL --retry 2 "https://nodejs.org/dist/v24.11.1/$archive" -o "$download_dir/$archive"
  curl -fL --retry 2 https://nodejs.org/dist/v24.11.1/SHASUMS256.txt -o "$download_dir/SHASUMS256.txt"
  (cd "$download_dir" && checksum_entry=$(awk -v name="$archive" '$2 == name {print}' SHASUMS256.txt) &&
    test -n "$checksum_entry" && printf '%s\n' "$checksum_entry" | sha256sum -c -)
  tar -xJf "$download_dir/$archive" -C "$download_dir"
  rm -rf "$SPENDEAZY_CLOUD_STATE/node-v24.11.1-linux-x64"
  mv "$download_dir/node-v24.11.1-linux-x64" "$SPENDEAZY_CLOUD_STATE/"
fi
[[ $(node -v) == v24.11.1 ]] || { echo 'Pinned Node was not selected.' >&2; exit 1; }
# No Clerk/Google secrets or running Docker daemon are needed for setup.
npm ci --include=dev --prefix "$SPENDEAZY_REPO_ROOT/api"
npm ci --include=dev --prefix "$SPENDEAZY_REPO_ROOT/mobile-app"
npm --prefix "$SPENDEAZY_REPO_ROOT/mobile-app" run statement-import:prepare
echo 'Cloud setup complete. Run: bash scripts/cloud/validate.sh'
