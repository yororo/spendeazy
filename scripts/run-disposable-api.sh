#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == --help ]]; then
  echo 'Usage: bash scripts/run-disposable-api.sh'
  echo 'Runs a fresh API and PostgreSQL until Ctrl+C; removes its containers, network and image on exit.'
  echo 'Optional exported variables: CLERK_JWT_KEY, CLERK_SECRET_KEY, CLERK_AUTHORIZED_PARTIES.'
  exit 0
fi
if (( $# )); then
  echo 'Unexpected arguments. Use --help.' >&2
  exit 2
fi

command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker info >/dev/null
docker compose version >/dev/null
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

# A unique project prevents concurrent invocations from touching one another.
export SPENDEAZY_RUN_ID="spendeazy-disposable-$(date +%s)-$$-$RANDOM"
export SPENDEAZY_API_IMAGE="$SPENDEAZY_RUN_ID:local"
compose=(docker compose --project-name "$SPENDEAZY_RUN_ID" --file local-test/disposable-api.compose.yml)
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if docker container inspect "$SPENDEAZY_RUN_ID-keys" >/dev/null 2>&1; then
    docker rm --force "$SPENDEAZY_RUN_ID-keys" >/dev/null || status=1
  fi
  "${compose[@]}" down --volumes --remove-orphans --timeout 5 || status=1
  if docker image inspect "$SPENDEAZY_API_IMAGE" >/dev/null 2>&1; then
    docker image rm "$SPENDEAZY_API_IMAGE" >/dev/null || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --tag "$SPENDEAZY_API_IMAGE" ./api
read -r SPENDEAZY_DB_PASSWORD SPENDEAZY_INVITE_KEY SPENDEAZY_REFERENCE_KEY < <(
  docker run --rm --name "$SPENDEAZY_RUN_ID-keys" "$SPENDEAZY_API_IMAGE" node -e \
    'console.log(Array.from({length:3},()=>require("node:crypto").randomBytes(32).toString("hex")).join(" "))'
)
export SPENDEAZY_DB_PASSWORD SPENDEAZY_INVITE_KEY SPENDEAZY_REFERENCE_KEY

"${compose[@]}" up --detach --wait --wait-timeout 90 postgres
"${compose[@]}" run --rm --no-deps api npm run migration:run:compiled
"${compose[@]}" up --detach --wait --wait-timeout 90 api
binding=$("${compose[@]}" port api 3000)
printf '\nAPI: http://%s/api/v1\nHealth: http://%s/health\nDocs: http://%s/docs\n' "$binding" "$binding" "$binding"
echo 'Fresh disposable API ready. Press Ctrl+C to remove this stack and its data.'

# Poll state so an unexpected container exit also tears down the stack.
api_id=$("${compose[@]}" ps --quiet api)
db_id=$("${compose[@]}" ps --quiet postgres)
while sleep 2; do
  for container in "$api_id" "$db_id"; do
    if [[ $(docker inspect --format '{{.State.Status}}' "$container") != running ]]; then
      echo 'A disposable service stopped unexpectedly; cleaning up.' >&2
      exit 1
    fi
  done
done
