#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s SECRET_KEY TEST_USER_ID\n' "$0" >&2
  exit 64
fi

clerk_secret_key=$1
clerk_test_user_id=$2

if [[ -z $clerk_secret_key || -z $clerk_test_user_id ]]; then
  printf 'Error: SECRET_KEY and TEST_USER_ID must not be empty.\n' >&2
  exit 64
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Error: required command not found: %s\n' "$1" >&2
    exit 127
  fi
}

require_command curl
require_command node

json_value() {
  local field=$1

  node -e '
    const fs = require("node:fs");

    try {
      const response = JSON.parse(fs.readFileSync(0, "utf8"));
      const value = response[process.argv[1]];

      if (typeof value !== "string" || value.length === 0) {
        process.exit(1);
      }

      process.stdout.write(value);
    } catch {
      process.exit(1);
    }
  ' "$field"
}

request_body=$(node -e \
  'process.stdout.write(JSON.stringify({ user_id: process.argv[1] }))' \
  "$clerk_test_user_id")

if ! session_response=$(curl \
  --fail \
  --silent \
  --show-error \
  --request POST \
  'https://api.clerk.com/v1/sessions' \
  --header "Authorization: Bearer ${clerk_secret_key}" \
  --header 'Content-Type: application/json' \
  --data "$request_body"); then
  printf 'Error: unable to create a Clerk session.\n' >&2
  exit 1
fi

if ! session_id=$(printf '%s' "$session_response" | json_value id); then
  printf 'Error: Clerk did not return a session ID.\n' >&2
  exit 1
fi

if ! token_response=$(curl \
  --fail \
  --silent \
  --show-error \
  --request POST \
  "https://api.clerk.com/v1/sessions/${session_id}/tokens" \
  --header "Authorization: Bearer ${clerk_secret_key}" \
  --header 'Content-Type: application/json' \
  --data '{}'); then
  printf 'Error: unable to create a Clerk session token.\n' >&2
  exit 1
fi

if ! session_token=$(printf '%s' "$token_response" | json_value jwt); then
  printf 'Error: Clerk did not return a session token.\n' >&2
  exit 1
fi

# Emit only the token so callers can capture it without exposing the secret key.
printf '%s\n' "$session_token"
