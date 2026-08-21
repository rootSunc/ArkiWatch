#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ARKIWATCH_ROOT:-/srv/arkiwatch}"
ENV_DIR="${ARKIWATCH_ENV_DIR:-$ROOT_DIR/env}"
COMPOSE_FILE="${ARKIWATCH_COMPOSE_FILE:-$ROOT_DIR/runtime/compose/docker-compose.prod.yml}"
BACKUP_DIR="${ARKIWATCH_BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
IMAGE_TAG="${ARKIWATCH_IMAGE_TAG:-latest}"

mkdir -p "$BACKUP_DIR"

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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/arkiwatch-$timestamp.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -9 > "$backup_file"

if [ ! -s "$backup_file" ] || ! gzip -t "$backup_file"; then
  echo "Backup archive failed gzip integrity validation: $backup_file" >&2
  rm -f "$backup_file"
  exit 1
fi

uncompressed_bytes="$(gzip -dc "$backup_file" | wc -c | tr -d '[:space:]')"
if [ "$uncompressed_bytes" -le 0 ]; then
  echo "Backup archive contains no SQL: $backup_file" >&2
  rm -f "$backup_file"
  exit 1
fi

find "$BACKUP_DIR" -type f -name "arkiwatch-*.sql.gz" -mtime +14 -delete

if command -v restic >/dev/null 2>&1 && [ -f "$ENV_DIR/restic.env" ]; then
  set -a
  source "$ENV_DIR/restic.env"
  set +a
  restic backup "$backup_file"
  restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune
fi

echo "$backup_file"
