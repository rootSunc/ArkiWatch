# ArkiWatch API

Go service for collection, normalization, recommendations, and the HTTP API
the web app uses. Paths, authentication, environment variable names, and the
PostgreSQL schema are the contract the rest of the repository depends on.

Commands:

- `GET /`
- `GET /api/health`
- `GET /api/health/data-quality`
- `GET /api/platform/coverage`
- `GET /api/sources/status`
- `POST /api/auth/login`
- `GET /api/auth/me` and `GET /api/users/me`
- `GET /api/recommendations`
- `GET /api/weather/forecast`
- `GET /api/air-quality/current`
- `GET /api/energy/current`
- `GET /api/traffic/current`
- `GET /api/transit/current`
- `GET /api/platform/overview`
- `GET /api/platform/overview/export`
- `GET /api/platform/history`, `/api/platform/history/availability`
- `GET /api/platform/events/{event_id}`
- `GET /api/platform/categories/{category_key}`
- `GET /api/today`, `/api/dashboard`, `/api/public/dashboard`, `/api/personal/dashboard`
- `GET/POST/PUT /api/user/locations`, `/api/user/preferences`, `/api/user/commute-profiles`
- `GET/POST /api/user/channels`, `/api/public/subscriptions`
- `GET /api/notifications`
- `POST /api/assistant/chat`, `/api/assistant/chat/stream`, `/api/assistant/translate`
- `POST /api/telegram/webhook`
- `GET /api/metrics`

The production image ships the API, scheduler, bootstrap, and schema-migration
binaries. The schema reconciler is idempotent and can adopt an existing
`arkiwatch_schema_migrations` history when upgrading an installation.

## Run

```bash
go run ./cmd/migrate
go run ./cmd/bootstrap
go run ./cmd/server
go run ./cmd/collector all
go run ./cmd/normalize -hours 24
go run ./cmd/scheduler --once
```

Configuration is loaded from `.env` when present. See `.env.example` for
`API_HOST`, `API_PORT`, `DATABASE_URL`, `APP_VERSION`, and `APP_TIMEZONE`.

## Test

```bash
go test ./...
```

Collectors and the normalizer write the same PostgreSQL raw/normalized tables
the web product reads. The scheduler owns the collection, normalization, rules,
snapshot, backfill, and dispatch loop.
