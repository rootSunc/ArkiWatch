# Development

To try the app without a backend, use `pnpm demo` (see the [README](../README.md#try-the-demo)).

## Live stack

Requires Node.js 20+, Corepack/pnpm, Go 1.25+, PostgreSQL.

```bash
corepack enable && pnpm install
cp apps/api/.env.example apps/api/.env          # set DATABASE_URL
cp apps/web/.env.example apps/web/.env.local
createdb arkiwatch
pnpm run migrate:api && pnpm run bootstrap:api
pnpm dev                                        # API :8000 + web :3000
```

Fill the pipeline once (provider calls are real):

```bash
scripts/go-command.sh ./cmd/collector all
scripts/go-command.sh ./cmd/normalize -hours 24
scripts/go-command.sh ./cmd/scheduler --once    # due jobs only; drop --once for the loop
```

Call `scripts/go-command.sh` directly when passing flags: `pnpm run x -- --flag`
forwards the `--`, and Go's flag parser stops there, so the flag is ignored.

| URL | What |
| --- | --- |
| `localhost:3000` | Web app (`/about`, `/privacy`, `/plan`, `/settings`) |
| `localhost:8000/api/health` | API health |
| `localhost:8000/api/health/data-quality` | Per-source freshness |

## Commands

| Command | Runs in CI | Use when |
| --- | :---: | --- |
| `pnpm verify` | partly | Before committing: `check` + contracts, config, version, build |
| `pnpm check` | ✓ | Fast loop: Go vet/test, web lint/test/typecheck/audits |
| `pnpm run contracts:check` | ✓ | API shape, Go rules, or demo fixtures changed |
| `pnpm run build:web` | ✓ | Before shipping web changes |
| `pnpm run test:e2e` | | UI flow changes (Playwright on the demo build) |
| `pnpm run contracts:check:live` | | API response changed; needs a running API |
| `pnpm run config:check` | | Env keys added or removed |
| `pnpm run audit:api` | | Go dependency changes (govulncheck) |
| `pnpm run version:check` | | Version bump |

Focused: `pnpm run test:api`, `pnpm run test:web`. Schema changes go in the Go
reconciler (`internal/schema`) with integration tests; contract and asset
regeneration is in [Architecture](architecture.md#contracts-and-generated-assets).

Tests use fixtures and mocks and never call real providers.

## Troubleshooting

- **Web can't reach API:** check `/api/health`, then `API_PUBLIC_BASE_URL` (what
  the browser uses) and `NEXT_PUBLIC_API_BASE_URL` (fallback) in `.env.local`.
- **A source is empty or stale:** check `/api/health/data-quality` and that
  source's key/config before suspecting code. Digitransit and Fingrid need keys.
- **Running `go run` directly:** export the env yourself; only the `pnpm`
  wrappers load `apps/api/.env`.

## Public vs. private

| Goes in Git | Stays private |
| --- | --- |
| `.env.example` files with key names and safe defaults | Real `.env` values, tokens, DB passwords |
| | `deploy/`: Dockerfiles, Compose, Ansible, runbook (git-ignored) |
| Docs, contracts, fixtures with public city data | Personal addresses, commutes, dumps, logs |
| | Deploy diary, restore evidence: `docs/private/` (git- and docker-ignored) |

`NEXT_PUBLIC_*` and `API_PUBLIC_BASE_URL` are sent to the browser, so never put
secrets there. A private key does not make a data flow private: enabled integrations
still belong on the `/privacy` page
([privacy-page.tsx](../apps/web/src/app/privacy/privacy-page.tsx), EN and 中文). Before sharing, scan history:

```bash
gitleaks git --redact --no-banner --log-opts='--all'
```

If a real credential leaked, rotate it first, then clean history.
