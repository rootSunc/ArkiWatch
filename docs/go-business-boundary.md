# Go business boundary

ArkiWatch uses Go as the authority for public signal decisions. Next.js owns
rendering, localization, interaction state, browser caching and same-origin
session transport.

## Read path

`GET /api/public/briefing?city=helsinki&date=2026-08-08` returns the existing public
dashboard shape plus:

- `decision`: curated events, per-category events, notification priorities,
  merged timeline, deduplicated plans, action eligibility, summary states and
  source-health counts.
- `signals`: weather, air quality, transit, road/rail and both energy read models.
  Today can render from this bundle without another six browser requests.
- `coverage_region`: the regional recommendation identity. Regional comparison
  does not parse a localized coverage label.

The handler calls existing domain builders and database readers directly, with
one request reference time. Independent source reads run concurrently. An
unavailable source returns its existing unavailable read model; unavailable
regional advice never becomes a live recommendation. No self-HTTP requests or
new microservices are involved.

`internal/signals` owns derived weather/air advisories, city relevance, ranking,
category diversity and noise filtering. `internal/briefing` owns scenario/event
merging, action validity, plan overlap removal, summary states and source health.
Existing `normalizer`, `publicrules`, `rules`, `energy` and `timescope` remain the
owners of their existing ingest, recommendation and calculation responsibilities.

The old `/api/public/dashboard` remains compatible. The web client uses the new
briefing route and keys its cache by **city and date**. Regional energy reads
continue sharing cache entries across cities.

## Time and missing data

Go supplies `evaluated_at` and `valid_until`. The browser measures elapsed time
since receiving a response and refreshes when that server-defined interval ends;
it does not use its wall clock to decide whether an individual action is valid.
Failed or expired live briefing cache entries do not expose actionable advice.
Historical and offline Demo decisions do not poll against today's clock.

Historical views are read-only. Missing historical snapshots do not acquire
live actions from other data. Action eligibility and notification selection no
longer depend on English placeholder sentences in the UI.

Behavior corrections made during migration:

- Critical events participate in severity ranking.
- Empty air-quality payloads do not emit advisory events.
- Derived advisory IDs include city and source time; distinct warnings also
  include a stable content hash.
- Malformed event intervals are excluded.
- Historical source evidence does not become a current pipeline incident.

## Energy history

Go supplies minimum, maximum and average estimated costs plus `cost_status`.
The frontend formats these values and builds chart coordinates; it does not
recalculate costs from prices.

Stored history snapshots created before these fields existed are enriched on
read by `energy.EnrichHistoricalCosts`. The calculation uses the snapshot's
recorded `usage_kwh`, never the current household configuration. Stored rows are
not rewritten. Missing usage remains explicit instead of inventing a value.

## Personal context

`GET /api/me/context` resolves the authenticated user and aggregates locations,
preferences, commute profiles and notification channels. POST accepts a resource
and payload, dispatches to the existing Go resource handlers, and retains their
validation and ownership checks. A conflicting supplied `user_id` is rejected.

The Next.js `/api/personal/context` route handles cookies, cross-site request
protection, cancellation, timeout and response forwarding. It neither calls
`/auth/me` to assemble a user identity nor aggregates four resource endpoints.
Internal server errors remain redacted; resource validation errors are preserved.

## Offline assets and contract maintenance

The public city catalog is authored in `internal/platform/coverage.go`.
`/api/platform/coverage` supplies deployment metadata to the live city selector.
The generated catalog supports SSR, public capability descriptions and offline
Demo without a second manually maintained city configuration.

Run these after changing Go decisions, coverage or raw Demo fixtures:

```sh
pnpm run domain:generate
pnpm run contracts:generate
pnpm run contracts:check
```

`cmd/web-assets` executes the production Go rules for Demo city/time variants and
energy summaries. `scripts/generate-web-assets.cjs` loads only raw TypeScript
fixtures and invokes that command. Generated JSON is committed so the Demo needs
no Go server at runtime. `domain:check` regenerates in memory and rejects drift.

The browser still owns localized labels, numeric/date formatting, icon/color
mapping, SVG/chart layout, responsive behavior, URL state, search and local read
state. Moving those to Go would couple backend decisions to a particular UI.

## Validation

- Go unit tests include 21 captured pre-migration event/timeline/plan cases.
- Additional Go cases cover severity boundaries, stable identity, missing data,
  regional scope, expiry, source health, energy history and profile ownership.
- Existing API/web checks, generated asset drift checks and contract generation
  checks run unchanged through their root package scripts.
- The live contract checker understands composed `allOf` response schemas.
- Browser regressions cover both desktop and mobile Demo flows.
