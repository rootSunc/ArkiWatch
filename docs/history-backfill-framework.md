# History and backfill

This page describes the implemented Go path. Earlier API and CLI sketches are
not supported interfaces; the current HTTP router has no `/api/backfills`
management endpoints and there is no dedicated backfill CLI.

## Current behavior

Bootstrap initializes schema, metadata, and scheduler jobs. Live collection then
builds up stored observations. Historical reads use available stored data;
selecting a past date does not itself request an upstream archive.

Optional initial backfill is planned by the scheduler before it claims
backfill windows. With `INITIAL_BACKFILL_ENABLED=false` (the default),
initial planning creates no jobs. Enabling it queues bounded source windows for
the existing scheduler, without adding another worker service.

1. The planner selects range-capable sources and applies source-specific policy.
2. Jobs and windows are persisted in PostgreSQL.
3. The scheduler claims a limited number of windows with lock expiry and retries.
4. The collector persists observations; successful windows can be normalized.
5. Window results roll up into the parent job.

The backfill task does not invoke notification dispatch. It does write into the
same observation/event tables consumed by other jobs; historical time validity
must therefore remain enforced by the decision and dispatch paths.

## Configuration and operation

Use the [API environment example](../apps/api/.env.example) for key names and
[the source-policy registry](../apps/api/internal/sourcepolicy/policy.go) for
per-source history horizons, window sizes, and freshness limits. Known source
policies take precedence over `INITIAL_BACKFILL_DAYS` and
`INITIAL_BACKFILL_WINDOW_SECONDS`, which are fallback settings.

After deliberately enabling initial backfill in your local environment:

```bash
pnpm run bootstrap:api
pnpm run dev:scheduler -- --once
```

A single scheduler pass handles only due jobs and bounded work; it does not
promise to finish a backlog. Run `pnpm run dev:scheduler` for the recurring loop
and inspect scheduler results and `backfill_jobs` / `backfill_windows` in the
database. `BACKFILL_MAX_DUE_WINDOWS` bounds work per tick; retry and lock settings
are in the same example files. Disabling initial planning does not cancel jobs
that are already queued.

## Limits that matter

- Range support in an adapter does not guarantee the provider retains the
  requested dates or returns every record. Source limits, keys, station bounds,
  and page caps still apply.
- The planner's coverage shortcut requires only one observation per source per
  local day. It does not establish completeness across cities or datasets.
- The planner runs repeatedly and skips equivalent existing jobs or covered
  ranges; enabling it is not a guarantee of a single, one-time request.
- A retrieved historical forecast or event is not necessarily an exact replay
  of what a user could have seen at that time.
- Missing history must remain explicit. Historical views must not acquire
  current recommendations or actions as a fallback.

An operator API, pause/resume controls, broader archives, and stronger
completeness tracking remain possible future work. Add them when a concrete
history workflow requires them, rather than treating the former design sketch
as a release checklist.

## Implementation reference

| Responsibility | Source |
| --- | --- |
| Planning and date windows | [backfill_planner.go](../apps/api/internal/database/backfill_planner.go) |
| Claims, retries and result persistence | [backfill.go](../apps/api/internal/database/backfill.go) |
| Scheduler execution | [scheduler/main.go](../apps/api/cmd/scheduler/main.go) |
| Range-capable sources | [collector runner](../apps/api/internal/collectorservice/runner.go) |
| Source policy | [policy.go](../apps/api/internal/sourcepolicy/policy.go) |

Planner tests cover window construction, opt-in behavior, policy selection, and
skipping existing jobs. Database-backed tests need PostgreSQL; see
[Development](development.md). These tests do not validate upstream archives.
