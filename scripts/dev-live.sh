#!/usr/bin/env bash
set -euo pipefail

if [ -f apps/api/.env ]; then
  set -a
  . apps/api/.env
  set +a
fi

mkdir -p apps/api/bin
go -C apps/api build -o bin/migrate ./cmd/migrate
go -C apps/api build -o bin/server ./cmd/server

apps/api/bin/migrate

apps/api/bin/server &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm run dev:web
