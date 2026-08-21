#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/arkiwatch-backup.sql.gz" >&2
  exit 2
fi

BACKUP_FILE="$1"
ROOT_DIR="${ARKIWATCH_ROOT:-/srv/arkiwatch}"
ENV_DIR="${ARKIWATCH_ENV_DIR:-$ROOT_DIR/env}"
COMPOSE_FILE="${ARKIWATCH_COMPOSE_FILE:-$ROOT_DIR/runtime/compose/docker-compose.prod.yml}"
IMAGE_TAG="${ARKIWATCH_IMAGE_TAG:-latest}"
RESTORE_DATABASE="${RESTORE_DATABASE:-arkiwatch_restore_$(date -u +%Y%m%dT%H%M%SZ)}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ] || ! gzip -t "$BACKUP_FILE"; then
  echo "Backup archive failed gzip integrity validation: $BACKUP_FILE" >&2
  exit 1
fi

uncompressed_bytes="$(gzip -dc "$BACKUP_FILE" | wc -c | tr -d '[:space:]')"
if [ "$uncompressed_bytes" -le 0 ]; then
  echo "Backup archive contains no SQL: $BACKUP_FILE" >&2
  exit 1
fi

set -a
source "$ENV_DIR/postgres.env"
set +a

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

echo "Creating restore database: $RESTORE_DATABASE"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  createdb -U "$POSTGRES_USER" "$RESTORE_DATABASE"

echo "Restoring $BACKUP_FILE into $RESTORE_DATABASE"
gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$RESTORE_DATABASE" -v ON_ERROR_STOP=1

echo "Restore copy is ready: $RESTORE_DATABASE"
