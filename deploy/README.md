# Deployment

This is an optional single-VPS self-hosting recipe. The demo and local development
do not require it. Templates and generic runbooks are public; actual credentials,
inventory, and operating records follow the
[public/private boundary](../docs/publication-boundary.md).

## Responsibilities

| Component | Responsibility |
| --- | --- |
| Operator workstation | Build and publish images, sync configuration, invoke release |
| GitHub Actions | API/web checks, generated contract/asset checks, web build |
| VPS | Docker Compose, Caddy, PostgreSQL, scheduler, backups |

The repository has no automated image-publishing or production-release workflow.
Pushing `main` runs CI; it does not deploy. The VPS pulls prebuilt images and
does not clone or build the repository.

The current topology uses one API replica: login and assistant rate limits are
process-local. The release script rejects multiple API containers. Add a shared
limiter before horizontal scaling.

## Prerequisites

The operator workstation needs Git, Docker with Buildx for image publishing,
SSH, and Ansible for provisioning/configuration sync. A registry account is
needed to publish images. `Brewfile` is an optional macOS convenience bundle;
its editor, terminal, and monitoring choices are not product requirements.

Install the Ansible collections:

```bash
ansible-galaxy collection install -r deploy/ansible/requirements.yml
```

Create private instance files:

```bash
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/web.env.example deploy/env/web.env
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/caddy.env.example deploy/env/caddy.env
cp deploy/env/images.env.example deploy/env/images.env
cp deploy/ansible/inventory.example.ini deploy/ansible/inventory.ini
cp deploy/ansible/group_vars/prod.yml.example deploy/ansible/group_vars/prod.yml
```

Replace credentials, domains, email, registry account, and host placeholders.
Use matching PostgreSQL credentials in `api.env` and `postgres.env`. Point the
web and API domain DNS records at the VPS; Caddy needs ports 80/443 reachable to
serve HTTPS. If off-server backups are enabled, also copy and configure
`deploy/env/restic.env.example` as `deploy/env/restic.env`.

## Runtime layout

```text
/srv/arkiwatch/
  runtime/
    compose/docker-compose.prod.yml
    caddy/Caddyfile
    scripts/                 # release, backup, restore-copy, logs
  env/                       # private runtime configuration
  backups/postgres/
  logs/
```

Bootstrap installs Docker, Compose, UFW, restic, a deploy user, and runtime
directories. The deployment playbook syncs runtime files and installs the daily
database backup cron. See the [deploy runbook](runbooks/deploy.md) for the ordered
bootstrap, publish, release, and verification steps.

## Operating an instance

| Task | Runbook |
| --- | --- |
| First deployment or a new version | [Deploy](runbooks/deploy.md) |
| Inspect a failure | [Incident](runbooks/incident.md) |
| Restore a previous image | [Rollback](runbooks/rollback.md) |
| Back up or verify a restored database copy | [Backup and restore](runbooks/backup-restore.md) |

A release backs up the database before changing images, runs migration and
bootstrap, and checks health. If an existing deployment fails its health check,
it attempts to restore the previous application image tag. That is not a database
rollback; verify schema compatibility before rolling across a schema change.

The example Caddy configuration restricts `/api/metrics`, `/api/scheduler*`, and
`/api/sources/refresh*` to private address ranges, including Tailscale's
`100.64.0.0/10`. Check that boundary against the actual proxy/network topology.
Keep actual host access instructions and restore-drill records in private notes.
