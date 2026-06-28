# Development

This page covers the full local stack. If you only want to evaluate ArkiWatch, use the zero-credential [`pnpm demo`](../README.md#try-it-in-60-seconds) first.

## Requirements

- Node.js 20+
- Corepack with pnpm
- Go 1.25+
- PostgreSQL for live API flows

## Live local setup

From the repository root:

```bash
corepack enable
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

createdb arkiwatch
pnpm run migrate:api
pnpm run bootstrap:api
pnpm dev
```

The local surfaces are:

| Surface | URL |
| --- | --- |
| Web app | [http://localhost:3000](http://localhost:3000) |
| Product overview | [http://localhost:3000/about](http://localhost:3000/about) |
| API root | [http://127.0.0.1:8000](http://127.0.0.1:8000) |
| OpenAPI contract | [`contracts/openapi.json`](../contracts/openapi.json) (static contract source) |
| Health | [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) |

The example configuration uses `postgresql://postgres:postgres@localhost:5432/arkiwatch`. Change it in `apps/api/.env` if your local PostgreSQL setup differs.

## Useful commands

```bash
pnpm demo                      # deterministic product tour
pnpm dev                       # API and web together
pnpm check                     # backend and frontend quality gates
pnpm run build:web             # production web build
pnpm run contracts:check       # OpenAPI and frontend contract drift
pnpm run contracts:check:live  # live API vs. OpenAPI contract, recursively
pnpm run audit:api             # govulncheck against the Go module graph
pnpm run config:check          # environment example coverage, both directions
pnpm run version:check         # package metadata consistency
pnpm run test:e2e              # browser smoke tests using the deterministic demo
```

For focused work, use `pnpm run test:api` and `pnpm run test:web`. Database or model changes require an update to the Go schema reconciler and its integration checks; contract changes must update the static OpenAPI artifact at `contracts/openapi.json` and the generated frontend types together, then pass `pnpm run contracts:check:live` against a real response, not just the generated types.

## Data pipeline

The one-shot pipeline is intentionally explicit:

```bash
pnpm run dev:collector -- all
pnpm run dev:normalize -- -hours 24
pnpm run dev:scheduler -- --once
```

The durable scheduler persists job state in PostgreSQL. External providers are not part of the test contract: use fixtures and mocks so tests remain deterministic and do not depend on network availability.

## Configuration and troubleshooting

Start from `apps/api/.env.example` and `apps/web/.env.example`; do not commit `.env` files, tokens, provider credentials, or personal data. The live API needs PostgreSQL, while the demo does not.

If the web app cannot reach the API, check the API health URL first and then compare `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local` with the API address. If a provider is empty or stale, inspect `/api/health/data-quality` and the configured source scope before treating it as an application error.

The [`deploy/`](../deploy/README.md) directory contains an optional single-VPS recipe. It is not needed for local development or for publishing the project source.
