# ArkiWatch API

Go owns collection, normalization, recommendations, historical read models,
and the HTTP API. Next.js consumes those decisions and renders them.

## Start and check

Use [Development](../../docs/development.md) from the repository root. Its
`pnpm` wrappers load `apps/api/.env`; running `go run` directly requires the
variables to be exported by the caller. The Go config loader reads the process
environment, not `.env` files.

```bash
pnpm run migrate:api
pnpm run bootstrap:api
pnpm run dev:api
pnpm run test:api
```

Live flows and database integration tests need PostgreSQL. The deterministic
web demo does not need the API.

## Contracts and responsibilities

- [OpenAPI](../../contracts/openapi.json) defines routes, request/response shapes,
  and authentication. Avoid maintaining a second endpoint list here.
- [Go business boundary](../../docs/go-business-boundary.md) describes decision
  ownership, public briefing, personal context, and generated demo assets.
- [Environment example](.env.example) lists configuration keys consumed by Go.
- [History and backfill](../../docs/history-backfill-framework.md) describes the
  implemented scheduler path and its limits.

The production image ships API, scheduler, bootstrap, and migration binaries.
The idempotent schema reconciler can adopt an existing migration history.
Collectors and normalization persist into PostgreSQL; the scheduler coordinates
collection, normalization, rules, snapshots, backfill, and dispatch.
