# Backup And Restore Runbook

## Manual Backup

On the VPS:

```bash
/srv/arkiwatch/runtime/scripts/backup-db.sh
```

From your Mac through Ansible:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/backup.yml
```

## Backup Locations

Local VPS backups:

```text
/srv/arkiwatch/backups/postgres
```

Optional off-server backups use `restic` when `/srv/arkiwatch/env/restic.env` exists.

## Restore To A Safe Copy

On the VPS:

```bash
/srv/arkiwatch/runtime/scripts/restore-db-copy.sh /srv/arkiwatch/backups/postgres/arkiwatch-YYYYMMDDTHHMMSSZ.sql.gz
```

This creates a separate database named `arkiwatch_restore_<timestamp>`. It does not overwrite production.

The restore script validates the gzip archive before creating the database and runs `psql` with
`ON_ERROR_STOP=1`, so a successful command is a restore smoke test rather than only an archive
existence check. Keep the restore database until the application and a few representative queries
have been inspected, then remove it manually:

```bash
set -a
source /srv/arkiwatch/env/postgres.env
set +a
RESTORE_DATABASE=arkiwatch_restore_YYYYMMDDTHHMMSSZ
docker compose -f /srv/arkiwatch/runtime/compose/docker-compose.prod.yml \
  exec -T postgres dropdb -U "$POSTGRES_USER" "$RESTORE_DATABASE"
```

Run this restore drill at least once per quarter and after changing migrations. Record the backup
filename, restore duration, schema revision, and the operator who verified the copy.

## Production Replacement

Do not replace the production database while the app is running. Stop `api`, `scheduler`, and `web`, take a fresh backup, restore into a new database, update `DATABASE_URL`, then start the stack.
