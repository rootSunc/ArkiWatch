#!/usr/bin/env bash
set -euo pipefail

scripts/go-command.sh ./cmd/migrate

scripts/go-command.sh ./cmd/server &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm run dev:web
