#!/usr/bin/env bash
# Boots the Go API, verifies it against contracts/openapi.json, and shuts down.
# The OpenAPI file is static, so this check is what keeps it honest.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${ARKIWATCH_CONTRACT_PORT:-18131}"

cd "$root/apps/api"
go build -o "$root/.contract-api" ./cmd/server

API_HOST=127.0.0.1 API_PORT="$port" "$root/.contract-api" >"$root/.contract-api.log" 2>&1 &
api_pid=$!
cleanup() {
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  rm -f "$root/.contract-api"
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -fsS -m 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS -m 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
  echo "The API did not become ready:" >&2
  cat "$root/.contract-api.log" >&2
  exit 1
fi

cd "$root"
node scripts/check-live-contract.mjs "http://127.0.0.1:$port"
