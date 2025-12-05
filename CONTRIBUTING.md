# Contributing to ArkiWatch

ArkiWatch is a personal project that turns Finnish public data into useful daily
decisions. Contributions are welcome across data connectors, backend services,
frontend product surfaces, and documentation. The fastest way to help is to make
one behavior clearer, more reproducible, or easier to trust.

## Before you start

Install Node.js 20+, pnpm, Go 1.25+, and PostgreSQL for live flows. From the
repository root:

```bash
pnpm install
pnpm run migrate:api
```

Run `pnpm demo` first if you only need to inspect the product. A PostgreSQL
database is required for live API flows; connector tests should use fixtures or
mocks and must not depend on an external public API being available. See
[`docs/development.md`](docs/development.md) for the full setup.

## Quality gates

Before opening a pull request, run:

```bash
pnpm install --frozen-lockfile
pnpm run version:check
pnpm run architecture:check
pnpm run config:check
pnpm run contracts:check
pnpm check
pnpm run build:web
pnpm run audit:api
pnpm audit --prod --audit-level=high
```

If a change touches the Go API, also run `pnpm run contracts:check:live`. It
boots the API against a scratch PostgreSQL database and recursively verifies
every response against `contracts/openapi.json`, which is the static contract
source of truth.

Also run `git diff --check`. If a change affects deployment scripts, run
`for script in deploy/scripts/*.sh; do bash -n "$script"; done`.

Database or model changes must update the Go schema reconciler and include a
fresh-database upgrade check. Contract changes must regenerate the static
OpenAPI contract and the
frontend contract types together.

For frontend display changes, also exercise the deterministic demo at
`http://localhost:3000` in both a desktop and narrow viewport. Check the Today
recommendation hierarchy, Data summary, mobile bottom bar, event disclosure,
and demo/historical/live scope labels. See
[`docs/frontend-ui-system.md`](docs/frontend-ui-system.md) for the display
contracts and component boundaries.

## Design expectations

- Preserve provenance. New data products must retain source, fetch time, validity,
  and enough evidence to explain a recommendation.
- Keep provider-specific details inside collectors and adapters. Expose stable
  domain contracts to services and the web app.
- Treat the Today workspace as the primary product surface: show the next useful
  decision first and move detail behind an explicit interaction.
- Keep the Data overview prioritized: category coverage, event volume, and
  source health come before the full event stream and catalog details.
- Use the shared event panel and workspace route boundaries rather than adding
  event markup or detail booleans back into the page container.
- Add English and Simplified Chinese strings for user-visible UI. Avoid embedding
  copy directly in reusable components.
- Prefer deterministic fixtures for tests. Do not add network calls to the test
  suite or commit secrets, production data, or personal information.
- Update OpenAPI contracts and focused tests when an API response changes.

## Changes and pull requests

Use a short branch based on the change type, such as `feat/today-weather-card`,
`fix/healthcheck-defaults`, or `docs/contributing`.

Use a Conventional Commit subject, for example:

```text
feat(web): add commute decision card
fix(api): report degraded database health
```

Pull requests should explain the user problem, summarize the design, list the
validation commands that passed, and include screenshots for visual changes. Keep
unrelated refactors out of feature pull requests.

When behavior, layout, or interaction contracts change, update the relevant
README and frontend UI documentation in the same round. Documentation should
describe observable product behavior and stable component boundaries, not
internal implementation guesses.

## Adding a public data source

Include the provider’s license and terms, rate limits, stable identifiers, update
cadence, geographic coverage, and a fallback plan. A connector change should add
source policy notes, normalization coverage, fixture tests, observability labels,
and user-facing provenance where the data is shown.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow the private reporting steps
in [SECURITY.md](SECURITY.md).
