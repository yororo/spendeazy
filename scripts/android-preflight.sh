#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

failed=0

check_access() {
  local label=$1 hint=$2 output
  shift 2

  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'FAIL %s: %s is missing from PATH.\n' "$label" "$1" >&2
  elif output=$("$@" 2>&1); then
    printf 'OK   %s is reachable.\n' "$label"
    return
  else
    case ${output,,} in
      *permission*denied*|*access*denied*|*operation*not*permitted*)
        printf 'FAIL %s: access denied. Check host or sandbox permissions.\n' "$label" >&2 ;;
      *)
        printf 'FAIL %s: %s\n' "$label" "$hint" >&2 ;;
    esac
  fi
  failed=1
}

check_access 'Docker Compose' 'Start Docker and check `docker compose ps`.' docker compose ps
check_access 'ADB' 'Check the Android SDK and run `adb devices -l`.' adb devices -l

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(typeof require("node:util").parseEnv === "function" ? 0 : 1)' >/dev/null 2>&1; then
  printf 'FAIL Node: use the runbook Node version (24.11.1).\n' >&2
  exit 1
fi

# Use Node to parse dotenv files without sourcing them and to probe the same
# kind of TCP listener as the API on Windows and Linux.
if ! node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { parseEnv } from 'node:util';

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function readEnv(file) {
  try {
    return parseEnv(readFileSync(file, 'utf8'));
  } catch {
    fail(`Cannot read ${file}. Follow first-time setup in docs/local-testing.md.`);
    return {};
  }
}

function value(env, key) {
  return (process.env[key] ?? env[key])?.trim();
}

function requireValues(file, env, keys) {
  for (const key of keys) {
    if (!value(env, key)) fail(`${key} is missing from ${file} and the shell environment.`);
  }
}

function bindError(port) {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', (error) => resolve(error.code));
    server.listen(port, () => server.close(() => resolve(null)));
  });
}

const api = readEnv('api/.env.local');
const mobile = readEnv('mobile-app/.env.local');
requireValues('api/.env.local', api, [
  'INVITATION_CODE_ENCRYPTION_KEY', 'GCASH_REFERENCE_HASH_KEY', 'CLERK_SECRET_KEY', 'CLERK_JWT_KEY',
]);
requireValues('mobile-app/.env.local', mobile, [
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', 'EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID',
]);

const dbPort = process.env.SPENDEAZY_MANUAL_DB_PORT || '55433';
let database;
try {
  database = new URL(value(api, 'DATABASE_URL'));
} catch {
  // Report the expected target below without printing credentials.
}
if (!database || !['postgres:', 'postgresql:'].includes(database.protocol)
    || !['127.0.0.1', 'localhost'].includes(database.hostname) || database.port !== dbPort
    || database.pathname !== '/spendeazy_disposable_manual') {
  fail('DATABASE_URL must point to the local Compose database spendeazy_disposable_manual on the configured PostgreSQL port.');
}

const apiPort = Number(value(api, 'PORT') || '3000');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  fail('PORT must be an integer between 1 and 65535.');
} else {
  const expectedUrl = `http://10.0.2.2:${apiPort}`;
  if (value(mobile, 'EXPO_PUBLIC_API_BASE_URL')?.replace(/\/$/u, '') !== expectedUrl) {
    fail(`Set EXPO_PUBLIC_API_BASE_URL=${expectedUrl} in mobile-app/.env.local and check for a shell override.`);
  }

  const error = apiPort === Number(dbPort) ? 'configured for PostgreSQL' : await bindError(apiPort);
  if (error) {
    fail(`API port ${apiPort} is unavailable (${error}).`);
    for (const fallback of [4101, 4500, 5000, 8000, 9000]) {
      if (fallback === apiPort || fallback === Number(dbPort) || await bindError(fallback)) continue;
      console.error(`Available at check time: set PORT=${fallback} in api/.env.local and EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:${fallback} in mobile-app/.env.local. Check shell overrides too.`);
      break;
    }
  } else {
    console.log(`OK   API port ${apiPort} can bind.`);
  }
}
NODE
then
  failed=1
fi

if (( failed )); then exit 1; fi
printf 'Android preflight passed. Continue with docs/local-testing.md.\n'
