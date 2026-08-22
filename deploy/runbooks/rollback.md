# Rollback Runbook

ArkiWatch production releases are image-tag based. The deployed tag should normally be a Git SHA pushed to GHCR.

## Roll Back To A Previous Image Tag

Find the previous successful Git SHA, then run:

```bash
ARKIWATCH_HOST=arkiwatch-prod deploy/scripts/deploy.sh <previous-git-sha>
```

Or directly on the VPS:

```bash
/srv/arkiwatch/runtime/scripts/release.sh <previous-git-sha>
```

## Emergency Service Restart

On the VPS:

```bash
cd /srv/arkiwatch/runtime
ARKIWATCH_ENV_DIR=/srv/arkiwatch/env ARKIWATCH_IMAGE_TAG=latest docker compose -f compose/docker-compose.prod.yml restart api scheduler web caddy
```

## Database Caution

Rollback only changes container images. If a release changed the database schema or data shape, validate restore from backup before rolling backward across that schema change.
