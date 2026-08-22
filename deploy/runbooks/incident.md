# Incident Runbook

## First Checks

```bash
ssh deploy@YOUR_VPS
/srv/arkiwatch/runtime/scripts/logs.sh api scheduler web caddy
```

Check service status:

```bash
cd /srv/arkiwatch/runtime
set -a && source /srv/arkiwatch/env/images.env && set +a
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env docker compose -f compose/docker-compose.prod.yml ps
```

## Health

```bash
curl -fsS https://YOUR_API_DOMAIN/api/health
curl -fsS https://YOUR_WEB_DOMAIN/login
```

## Common Actions

Restart one service:

```bash
cd /srv/arkiwatch/runtime
set -a && source /srv/arkiwatch/env/images.env && set +a
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env docker compose -f compose/docker-compose.prod.yml restart api
```

Run database migration and bootstrap:

```bash
cd /srv/arkiwatch/runtime
set -a && source /srv/arkiwatch/env/images.env && set +a
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env docker compose -f compose/docker-compose.prod.yml run --rm api /app/arkiwatch-migrate
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env docker compose -f compose/docker-compose.prod.yml run --rm api /app/arkiwatch-bootstrap
```

Run scheduler once:

```bash
cd /srv/arkiwatch/runtime
set -a && source /srv/arkiwatch/env/images.env && set +a
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env docker compose -f compose/docker-compose.prod.yml run --rm scheduler --once
```

Check disk:

```bash
df -h
docker system df
```
