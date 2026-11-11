#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
mkdir -p "$SPENDEAZY_CLOUD_STATE"
exec 9>"$SPENDEAZY_CLOUD_STATE/operation.lock"
flock -n 9 || { echo 'Another cloud setup/validation is running in this state directory.' >&2; exit 1; }
[[ $(node -v) == v24.11.1 ]] || { echo 'Run bash scripts/cloud/bootstrap.sh first.' >&2; exit 1; }
exec node "$SPENDEAZY_REPO_ROOT/scripts/cloud/validate.mjs" "$@"
