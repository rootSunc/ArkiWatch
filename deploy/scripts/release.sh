#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${1:?Usage: release.sh IMAGE_TAG}"
if [[ ! "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf '%s\n' "IMAGE_TAG contains unsupported shell characters." >&2
  exit 2
fi

ROOT_DIR="${ARKIWATCH_ROOT:-/srv/arkiwatch}"
RUNTIME_DIR="${ARKIWATCH_RUNTIME_DIR:-$ROOT_DIR/runtime}"
ENV_DIR="${ARKIWATCH_ENV_DIR:-$ROOT_DIR/env}"
COMPOSE_FILE="${ARKIWATCH_COMPOSE_FILE:-$RUNTIME_DIR/compose/docker-compose.prod.yml}"

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

cd "$RUNTIME_DIR"

previous_api_image_ref=""
previous_web_image_ref=""
previous_api_container="$(docker compose -f "$COMPOSE_FILE" ps -q api 2>/dev/null || true)"
previous_web_container="$(docker compose -f "$COMPOSE_FILE" ps -q web 2>/dev/null || true)"
if [ -n "$previous_api_container" ]; then
  previous_api_image_ref="$(docker inspect --format '{{.Config.Image}}' "$previous_api_container" 2>/dev/null || true)"
fi
if [ -n "$previous_web_container" ]; then
  previous_web_image_ref="$(docker inspect --format '{{.Config.Image}}' "$previous_web_container" 2>/dev/null || true)"
fi

rollback_release() {
  local exit_code="$?"
  if [ "$exit_code" -eq 0 ]; then
    return
  fi

  local previous_api_tag=""
  local previous_web_tag=""
  if [[ "$previous_api_image_ref" == *:* && "$previous_api_image_ref" != *@* ]]; then
    previous_api_tag="${previous_api_image_ref##*:}"
  fi
  if [[ "$previous_web_image_ref" == *:* && "$previous_web_image_ref" != *@* ]]; then
    previous_web_tag="${previous_web_image_ref##*:}"
  fi

  if [ -z "$previous_api_tag" ] || [ "$previous_api_tag" != "$previous_web_tag" ]; then
    printf '%s\n' "Release failed; no compatible previous image tag was found for automatic rollback." >&2
    return
  fi

  printf '%s\n' "Release failed; rolling back to image tag $previous_api_tag." >&2
  if ! ARKIWATCH_API_IMAGE="${previous_api_image_ref%:*}" \
    ARKIWATCH_WEB_IMAGE="${previous_web_image_ref%:*}" \
    ARKIWATCH_IMAGE_TAG="$previous_api_tag" \
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --wait; then
    printf '%s\n' "Automatic rollback failed; inspect the deployment before retrying." >&2
  fi
}
trap rollback_release EXIT

docker compose -f "$COMPOSE_FILE" up -d --wait postgres
"$RUNTIME_DIR/scripts/backup-db.sh"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" run --rm api /app/arkiwatch-migrate
docker compose -f "$COMPOSE_FILE" run --rm api /app/arkiwatch-bootstrap
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --wait

api_container_count="$(docker compose -f "$COMPOSE_FILE" ps -q api | sed '/^$/d' | wc -l | tr -d '[:space:]')"
if [ "$api_container_count" -ne 1 ]; then
  printf '%s\n' "Release requires exactly one API replica because rate limiting is process-local (found $api_container_count)." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" ps
