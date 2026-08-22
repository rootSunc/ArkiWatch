# ArkiWatch Deployment

This directory contains an optional single-VPS self-hosting recipe. It is not
required for the deterministic demo, local development, or publishing the source
repository. A personal deployment can ignore this directory until a real server
is needed.

The production model is intentionally split by responsibility:

```text
MacBook:          development and operator commands
GitHub Actions:  tests, Docker image builds, GHCR publishing
VPS:             Docker Compose runtime, Caddy, PostgreSQL, backups
```

The VPS does not clone the repository and does not build application images. It only stores runtime files, environment files, persistent data, logs, and backups.

## Runtime Layout On The VPS

```text
/srv/arkiwatch/
  runtime/
    compose/docker-compose.prod.yml
    caddy/Caddyfile
    scripts/release.sh
    scripts/backup-db.sh
    scripts/restore-db-copy.sh
    scripts/logs.sh
  env/
    api.env
    web.env
    postgres.env
    caddy.env
    images.env
    restic.env
  backups/postgres/
  logs/
```

## Mac Setup

Install the core local tools:

```bash
brew install git gh jq ripgrep btop ansible rsync restic direnv tmux
brew install --cask orbstack tailscale visual-studio-code
```

Install Ansible collections used by the bootstrap playbook:

```bash
ansible-galaxy collection install -r deploy/ansible/requirements.yml
```

## Create Local Deployment Files

The real deployment files are intentionally ignored by Git.

```bash
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/web.env.example deploy/env/web.env
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/caddy.env.example deploy/env/caddy.env
cp deploy/env/images.env.example deploy/env/images.env
cp deploy/ansible/inventory.example.ini deploy/ansible/inventory.ini
cp deploy/ansible/group_vars/prod.yml.example deploy/ansible/group_vars/prod.yml
```

Edit every `CHANGE_ME`, domain, email, and image placeholder.

For GHCR, `deploy/env/images.env` should look like this:

```env
ARKIWATCH_API_IMAGE=ghcr.io/YOUR_ACCOUNT/arkiwatch-api
ARKIWATCH_WEB_IMAGE=ghcr.io/YOUR_ACCOUNT/arkiwatch-web
ARKIWATCH_IMAGE_TAG=latest
```

If you want encrypted off-server backups:

```bash
cp deploy/env/restic.env.example deploy/env/restic.env
```

## DNS

Point both domains to the VPS:

```text
arkiwatch.example.com      A/AAAA  <VPS IP>
api.arkiwatch.example.com  A/AAAA  <VPS IP>
```

Caddy will request HTTPS certificates when the stack starts. Ports `80` and `443` must be reachable.

## Bootstrap A Fresh VPS

Use this once, usually as `root` or a sudo-capable initial user:

```bash
INVENTORY=deploy/ansible/inventory.ini deploy/scripts/bootstrap-vps.sh
```

The bootstrap playbook installs Docker, Docker Compose, UFW, restic, creates the `deploy` user, and creates `/srv/arkiwatch` runtime directories.

After bootstrap, make sure `deploy/ansible/inventory.ini` uses the deploy user:

```ini
[arkiwatch]
arkiwatch-prod ansible_host=YOUR_VPS_IP_OR_TAILSCALE_NAME ansible_user=deploy ansible_port=22
```

## Sync Runtime Files

Use Ansible when runtime files or environment files change:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/deploy.yml \
  -e arkiwatch_run_release=false
```

To sync files and release a specific image tag in one command:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/deploy.yml \
  -e arkiwatch_image_tag=<git-sha>
```

If GHCR images are private, configure registry credentials in `deploy/ansible/group_vars/prod.yml` before the first release, or log in manually on the VPS as `deploy`.

## Daily Deployment

Normal deployment is handled by GitHub Actions:

```text
push main
  -> run checks
  -> build api/web images
  -> push ghcr.io/YOUR_ACCOUNT/arkiwatch-api:<git-sha>
  -> push ghcr.io/YOUR_ACCOUNT/arkiwatch-web:<git-sha>
  -> ssh to VPS
  -> /srv/arkiwatch/runtime/scripts/release.sh <git-sha>
```

Required GitHub Actions secrets:

```text
PROD_SSH_HOST
PROD_SSH_USER
PROD_SSH_KEY
PROD_SSH_KNOWN_HOSTS
PROD_SSH_PORT optional, defaults to 22
```

`PROD_SSH_KNOWN_HOSTS` must contain the pinned `known_hosts` line(s) for the VPS.
Do not replace this with `StrictHostKeyChecking=accept-new` in production. Rotate
the deploy key and host entries together when a server is rebuilt.

The repository owner should also configure these Actions variables before enabling
publishing or deployment. They default to false so forks can run the build without
publishing images or attempting to SSH into a production host:

```text
ARKIWATCH_PUBLISH_IMAGES=true
ARKIWATCH_DEPLOY_ENABLED=true
```

Each release waits for PostgreSQL and application health checks, creates a
database backup before changing images, and attempts to restore the previously
running API/Web image tag if an existing deployment fails its health check.
Image tags are Git SHAs in normal deployments. The root `VERSION` file is only a
package-metadata placeholder until the first release is decided; CI checks it for
consistency with package and OpenAPI metadata.
The release script runs `/app/arkiwatch-migrate` and `/app/arkiwatch-bootstrap`
before starting the Go API and scheduler. Do not roll back an image across a
schema migration until the restore procedure has been validated.
The current Compose topology intentionally runs one API replica because the
assistant and login sliding-window limiters are process-local; add a shared
Redis/edge limiter before scaling the API horizontally.
The release script also fails closed if more than one API container is running,
so an accidental `docker compose --scale api=2` cannot be treated as a healthy release.

For production protection, configure a GitHub Actions environment named `production`
with required reviewers and restrict deployment branches to `main`. The deploy job is
attached to that environment and will wait for its approval rules before opening the
SSH session.

Manual release from your Mac:

```bash
ARKIWATCH_HOST=arkiwatch-prod deploy/scripts/deploy.sh <git-sha>
```

When you are ready to publish a GitHub release, set `VERSION`, align package
metadata, run the version and contract checks, then push a matching `v<version>`
tag. The release workflow validates the tag against `VERSION` and generates notes.

## Manual VPS Commands

```bash
/srv/arkiwatch/runtime/scripts/release.sh <git-sha>
/srv/arkiwatch/runtime/scripts/logs.sh api scheduler web caddy
/srv/arkiwatch/runtime/scripts/backup-db.sh
```

## Post-Deploy Checks

From your Mac:

```bash
API_HEALTH_URL=https://YOUR_API_DOMAIN/api/health \
WEB_URL=https://YOUR_WEB_DOMAIN/login \
deploy/scripts/healthcheck.sh
```

## Protected API Paths

The Caddyfile blocks these paths from public networks:

```text
/api/metrics
/api/scheduler*
/api/sources/refresh*
```

They remain reachable from private address ranges and Tailscale `100.64.0.0/10`.

## Backup And Restore

Backups are stored under:

```text
/srv/arkiwatch/backups/postgres
```

Run one manually:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/backup.yml
```

Restore safely into a new database copy:

```bash
ssh deploy@YOUR_VPS
/srv/arkiwatch/runtime/scripts/restore-db-copy.sh /srv/arkiwatch/backups/postgres/arkiwatch-YYYYMMDDTHHMMSSZ.sql.gz
```

This script does not overwrite production. It creates a separate restore database so you can inspect it before any manual cutover.
