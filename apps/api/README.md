# ArkiWatch API

Go service: collection, normalization, decisions, history, HTTP API.

- Design and ownership: [docs/architecture.md](../../docs/architecture.md)
- Setup and checks: [docs/development.md](../../docs/development.md)
- Routes and shapes: [contracts/openapi.json](../../contracts/openapi.json)
- Config keys: [.env.example](.env.example)

```bash
pnpm run migrate:api && pnpm run bootstrap:api
pnpm run dev:api
pnpm run test:api        # DB integration tests need PostgreSQL
```
