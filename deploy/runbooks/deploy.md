# Deploy runbook

Start with the prerequisites and private configuration files in the
[deployment guide](../README.md). Run workstation commands from the repository
root. Publishing images and releasing are operator actions; CI only checks code.

## First VPS setup

Bootstrap as root or a sudo-capable initial user:

```bash
INVENTORY=deploy/ansible/inventory.ini deploy/scripts/bootstrap-vps.sh
```

Then change the inventory to use the `deploy` user. Sync runtime files and
private environment files without releasing:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/deploy.yml \
  -e arkiwatch_run_release=false
```

For private registry images, configure registry login in the ignored Ansible
group variables, or log in on the VPS as `deploy`. Configure your local SSH alias
`arkiwatch-prod` to reach that user/host with a verified host key; `deploy.sh`
uses SSH, not the Ansible inventory.

## Build and publish images

Use a clean, checked commit and an immutable tag. The following example targets
an x86-64 VPS; use `linux/arm64` for an ARM VPS. Replace `YOUR_ACCOUNT` and make
sure both image names match the private `deploy/env/images.env` configuration.

```bash
docker login ghcr.io
ARKIWATCH_TAG=$(git rev-parse HEAD)
ARKIWATCH_VERSION=$(cat VERSION)
ARKIWATCH_REGISTRY=ghcr.io/YOUR_ACCOUNT

docker buildx build --platform linux/amd64 \
  -f deploy/docker/api.Dockerfile \
  --build-arg APP_VERSION="$ARKIWATCH_VERSION" \
  --build-arg BUILD_SHA="$ARKIWATCH_TAG" \
  -t "$ARKIWATCH_REGISTRY/arkiwatch-api:$ARKIWATCH_TAG" --push .
docker buildx build --platform linux/amd64 \
  -f deploy/docker/web.Dockerfile \
  -t "$ARKIWATCH_REGISTRY/arkiwatch-web:$ARKIWATCH_TAG" --push .
```

The web server reads `API_PUBLIC_BASE_URL` from runtime configuration and embeds
it in the browser. `API_INTERNAL_BASE_URL` is the server-to-server address.
Neither requires baking the production hostname into the image.

## Release

After both images are available, use the same tag:

```bash
ARKIWATCH_HOST=arkiwatch-prod deploy/scripts/deploy.sh "$ARKIWATCH_TAG"
```

When runtime files or environment values change, sync them and release together:

```bash
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbooks/deploy.yml \
  -e "arkiwatch_image_tag=$ARKIWATCH_TAG"
```

Alternatively, on the VPS:

```bash
/srv/arkiwatch/runtime/scripts/release.sh <git-sha>
```

## Verify

```bash
API_HEALTH_URL=https://YOUR_API_DOMAIN/api/health \
WEB_URL=https://YOUR_WEB_DOMAIN/login \
deploy/scripts/healthcheck.sh
```

Inspect `/api/health/data-quality` and a public workspace as well: a reachable
process does not prove providers have returned fresh data. Review logs on the VPS:

```bash
/srv/arkiwatch/runtime/scripts/logs.sh api scheduler web caddy
```

Record the released tag, verification result, and any restore evidence privately.
See [rollback](rollback.md) and [backup/restore](backup-restore.md) if recovery is
needed. An image rollback does not undo a schema change.
