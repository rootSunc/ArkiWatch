#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${1:?Usage: deploy.sh IMAGE_TAG}"
if [[ ! "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf '%s\n' "IMAGE_TAG contains unsupported shell characters." >&2
  exit 2
fi
HOST="${ARKIWATCH_HOST:-arkiwatch-prod}"
REMOTE_RELEASE="${ARKIWATCH_REMOTE_RELEASE:-/srv/arkiwatch/runtime/scripts/release.sh}"

ssh "$HOST" "$REMOTE_RELEASE '$IMAGE_TAG'"
