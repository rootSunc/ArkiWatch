#!/usr/bin/env bash
set -euo pipefail

if [ -f apps/api/.env ]; then
  set -a
  . apps/api/.env
  set +a
fi

exec go -C apps/api run "$@"
