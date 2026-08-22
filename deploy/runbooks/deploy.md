# Deploy Runbook

## Preflight

```bash
ansible-galaxy collection install -r deploy/ansible/requirements.yml
```

Confirm these files exist locally and contain no placeholders:

```text
deploy/env/api.env
deploy/env/web.env
deploy/env/postgres.env
deploy/env/caddy.env
deploy/env/images.env
deploy/ansible/inventory.ini
deploy/ansible/group_vars/prod.yml
```

## First VPS Bootstrap

```bash
INVENTORY=deploy/ansible/inventory.ini deploy/scripts/bootstrap-vps.sh
```

Then sync runtime files without starting a release:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/deploy.yml \
  -e arkiwatch_run_release=false
```

## Normal Deploy

Normal releases happen through GitHub Actions on `main`.

Manual release from your Mac:

```bash
ARKIWATCH_HOST=arkiwatch-prod deploy/scripts/deploy.sh <git-sha>
```

Manual release on the VPS:

```bash
/srv/arkiwatch/runtime/scripts/release.sh <git-sha>
```

## Verify

```bash
API_HEALTH_URL=https://YOUR_API_DOMAIN/api/health \
WEB_URL=https://YOUR_WEB_DOMAIN/login \
deploy/scripts/healthcheck.sh
```

On the VPS:

```bash
/srv/arkiwatch/runtime/scripts/logs.sh api scheduler web caddy
```
