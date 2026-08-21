#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ARKIWATCH_ROOT:-/srv/arkiwatch}"
ENV_DIR="${ARKIWATCH_ENV_DIR:-$ROOT_DIR/env}"
COMPOSE_FILE="${ARKIWATCH_COMPOSE_FILE:-$ROOT_DIR/runtime/compose/docker-compose.prod.yml}"
IMAGE_TAG="${ARKIWATCH_IMAGE_TAG:-latest}"

if [ -f "$ENV_DIR/images.env" ]; then
  set -a
  source "$ENV_DIR/images.env"
  set +a
fi

: "${ARKIWATCH_API_IMAGE:?Set ARKIWATCH_API_IMAGE in $ENV_DIR/images.env}"
: "${ARKIWATCH_WEB_IMAGE:?Set ARKIWATCH_WEB_IMAGE in $ENV_DIR/images.env}"

export ARKIWATCH_API_IMAGE
export ARKIWATCH_WEB_IMAGE
export ARKIWATCH_ENV_DIR="$ENV_DIR"
export ARKIWATCH_IMAGE_TAG="$IMAGE_TAG"

docker compose -f "$COMPOSE_FILE" logs --tail="${TAIL:-200}" -f "$@"
