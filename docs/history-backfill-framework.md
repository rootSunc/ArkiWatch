# Historical Backfill Framework Design

> This is a design document. The sketches below describe the backfill
> framework shape; runnable commands live in `apps/api` and the root
> `package.json` scripts.

## Context

ArkiWatch currently starts with metadata, not data. `bootstrap` runs migrations,
seeds sources and rules, creates an admin user, and reconciles durable scheduler
jobs. The scheduler then runs live collectors, normalization, snapshots, rules,
and dispatch on recurring intervals.

The current history API is read-side only. It asks existing service builders for
past dates, but those builders can only return dates already present in
`raw_observations` and `normalized_events`. A fresh database therefore has no
historical depth until the live scheduler has been running long enough.

This design adds a historical backfill framework without changing the live
collector contract or the live scheduler cadence.

## Goals

- Backfill selected sources for a bounded date range.
- Keep the existing live collector path fast and simple.
- Reuse `raw_observations`, `normalized_events`, and existing service builders.
- Make backfills idempotent and restartable.
- Track progress, failures, provider limits, and per-window results.
- Allow source-specific historical capabilities instead of pretending every
  provider supports the same range model.

## Non-Goals

- Do not replace the live durable scheduler.
- Do not introduce a separate queue or worker runtime in the first version.
- Do not backfill user notifications or dispatch historical messages.
- Do not guarantee all external providers can provide true historical data.
- Do not bulk-delete or rewrite existing live observations.

## Concepts

### Backfill Job

A persisted request to backfill one source over a time range.

Example:

```json
{
  "source_code": "fmi",
  "start_date": "2026-05-01",
  "end_date": "2026-05-07",
  "window": "day",
  "status": "RUNNING",
  "requested_by": "admin",
  "normalize_after_window": true,
  "metadata": {
    "city": "helsinki"
  }
}
```

### Backfill Window

The smallest retryable unit inside a job. Most first-version sources should use
daily windows. Some high-volume sources can use hourly windows, and low-volume
catalog sources can use weekly windows.

### Backfill-Capable Collector

A collector that implements an optional historical method:

```text
type BackfillCollector interface {
    SourceCode() string
    CollectRange(
        ctx context.Context,
        windowStart time.Time,
        windowEnd time.Time,
        areaCode *string,
        cursor *string,
    ) (BackfillCollectResult, error)
}
```

Live collectors continue to implement:

```text
Collect(ctx context.Context) ([]CollectedObservation, error)
```

## Data Model

### `backfill_jobs`

Recommended columns:

- `id`
- `source_code`
- `status`: `PENDING`, `RUNNING`, `PAUSED`, `SUCCEEDED`, `FAILED`, `CANCELLED`
- `start_date`
- `end_date`
- `window_seconds`
- `area_code`, nullable
- `requested_by`, nullable user id
- `normalize_after_window`, boolean
- `max_window_retries`
- `metadata`, JSONB
- `created_at`
- `started_at`
- `finished_at`
- `last_error`

Indexes:

- `(status, created_at)`
- `(source_code, start_date, end_date)`

### `backfill_windows`

Recommended columns:

- `id`
- `job_id`
- `source_code`
- `window_start`
- `window_end`
- `area_code`, nullable
- `status`: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `SKIPPED`
- `attempt_count`
- `cursor`, nullable
- `locked_by`, nullable
- `locked_until`, nullable
- `records_inserted`
- `records_skipped`
- `normalization_scanned`
- `normalization_inserted`
- `normalization_updated`
- `started_at`
- `finished_at`
- `last_error`

Indexes:

- `(job_id, window_start)`
- `(status, window_start)`
- `(locked_until)`

Unique constraint:

- `(job_id, window_start, window_end, area_code)`

This gives restartability without overloading `scheduled_jobs` with a large
number of date-specific tasks.

## Scheduler Integration

Add a new scheduler task type:

```text
const TaskBackfill TaskType = "BACKFILL"
```

Add one recurring scheduler job:

```text
JobSpec{
    JobKey: "backfill:windows",
    TaskType: TaskBackfill,
    IntervalSeconds: cfg.SchedulerBackfillIntervalSeconds,
    Payload: map[string]any{},
}
```

The task performs bounded work each tick:

1. Claim up to `BACKFILL_MAX_DUE_WINDOWS` pending or retryable windows.
2. Run source-specific `collect_range`.
3. Persist observations through the same `persist_observations` helper.
4. Normalize only the completed window if requested.
5. Mark the window succeeded or failed.
6. Roll up the parent job status.

The scheduler should keep live jobs responsive. Recommended defaults:

- `SCHEDULER_BACKFILL_INTERVAL_SECONDS=60`
- `BACKFILL_MAX_DUE_WINDOWS=2`
- `BACKFILL_WINDOW_LOCK_TTL_SECONDS=1800`
- `BACKFILL_MAX_WINDOW_RETRIES=3`

Initial history is intentionally a small, opt-in bootstrap step:

- `INITIAL_BACKFILL_ENABLED=false`
- `INITIAL_BACKFILL_SOURCES=fmi,open_meteo_air,porssisahko,syke,linkedevents`
- `INITIAL_BACKFILL_DAYS=7` and `INITIAL_BACKFILL_WINDOW_SECONDS=86400` remain
  fallback values for sources without a policy.

When enabled, bootstrap creates one idempotent backfill job per supported source
using the Go source-policy registry. Execution still goes through the normal
backfill scheduler, so the API pressure is limited by the source window size and
`BACKFILL_MAX_DUE_WINDOWS`.

Initial source policies:

| Source | Initial days | Window size | Initial default | Notes |
| --- | ---: | ---: | --- | --- |
| `fmi` | 7 | 1 day | Yes | Daily forecast/observation windows. |
| `open_meteo_air` | 7 | 1 day | Yes | City-scoped air quality windows. |
| `porssisahko` | 3 | 6 hours | Yes | Hourly historical endpoint, intentionally throttled. |
| `syke` | 7 | 1 day | Yes | Hydrology can update slowly; station limits still apply. |
| `linkedevents` | 7 | 1 day | Yes | Date-paged event windows with collector page caps. |
| `digitraffic` | 1 | 1 hour | No | Station-heavy road-weather history should be explicitly scoped. |
| `fingrid` | 3 | 1 day | No | Requires an API key. |

Live reads are protected separately from historical reads: selected-date requests
always use an explicit local-day window, while live latest fallbacks reject raw
observations and normalized events older than their source freshness policy.

## Normalization Changes

Current normalization scans only the last `NORMALIZATION_LOOKBACK_HOURS`. Backfill
needs an explicit window API:

```text
NormalizeObservationsForWindow(
    ctx context.Context,
    windowStart time.Time,
    windowEnd time.Time,
    sourceCode *string,
) (NormalizeResult, error)
```

`normalize_recent_observations` can become a thin wrapper around this helper.

Snapshots should not be regenerated for every historical window in version 1.
The history API already reads category services by date from raw observations and
events. Snapshot regeneration can be added later for daily/regional snapshot
archives.

## API Surface

Admin-only endpoints:

- `POST /api/backfills`
- `GET /api/backfills`
- `GET /api/backfills/{job_id}`
- `POST /api/backfills/{job_id}/pause`
- `POST /api/backfills/{job_id}/resume`
- `POST /api/backfills/{job_id}/cancel`

Create request:

```json
{
  "source_code": "fmi",
  "start_date": "2026-05-01",
  "end_date": "2026-05-07",
  "area_code": "helsinki",
  "window": "day",
  "normalize_after_window": true
}
```

Response should include counts at both job and window level:

```json
{
  "id": "...",
  "status": "RUNNING",
  "windows_total": 7,
  "windows_succeeded": 3,
  "windows_failed": 0,
  "records_inserted": 420,
  "records_skipped": 18
}
```

## CLI Surface

Add an operator-friendly command for local and deployment use:

The eventual operator command should be implemented as a Go-native command or
HTTP request that creates a persisted backfill job for the Go scheduler.

The CLI should create a persisted job by default. A later `--inline` mode can run
without the scheduler for development.

## Source Capability Matrix

Version 1 should prioritize sources that directly improve `/platform/history`.

| Source | Initial Support | Notes |
| --- | --- | --- |
| `fmi` | Yes | WFS forecast and observation stored queries accept `starttime`/`endtime`; daily city windows. |
| `open_meteo_air` | Yes | Provider supports historical air-quality-style time ranges depending on endpoint plan. Verify limits before enabling wide ranges. |
| `porssisahko` | Yes | Hourly `price.json` lookups are aggregated into a stable window payload. |
| `fingrid` | Yes | Dataset API already accepts start/end time; use configured dataset id. |
| `digitraffic` | Partial | Road-weather station history supports `from`/`to` windows up to 24h; live traffic-message feeds remain current-only except situation-specific history. |
| `digitransit` | No for v1 | Service alerts are primarily real-time. |
| `hsy` | Maybe | Current WFS layer is "now"; enable only if a historical layer/query exists. |
| `syke` | Yes | Hydrology OData tables are filtered by `Aika` per retryable window. |
| `servicemap` | No for v1 | Slow-changing catalog; scheduled live snapshots are enough. |
| `linkedevents` | Partial | Events are future-looking by date range; useful for rebuilding past event snapshots only if historical events remain available. |

## Idempotency

The existing `RawObservation.hash` includes source, dataset, area, observed time,
and payload. That is enough to avoid exact duplicate inserts, but historical
collectors should choose stable `observed_at` values:

- Measurement data: use the measurement timestamp.
- Forecast snapshots: use the provider run time or requested window start.
- Catalog pages: use the window start plus stable entity timestamp when present.

Avoid using wall-clock fetch time as `observed_at` in backfill paths. If fetch
time is useful, store it in `payload["fetched_at"]`.

## Safety Controls

- Require auth for all HTTP backfill endpoints.
- Cap maximum date range per request by source.
- Cap maximum concurrent backfill windows.
- Store provider request URLs and cursors for diagnostics.
- Respect provider API keys and rate limits.
- Never dispatch notifications from historical backfills.
- Prefer paused/cancelled states over deleting jobs.

## Rollout Plan

### Phase 1: Framework Skeleton

- Add `BackfillJob` and `BackfillWindow` models and migration.
- Add status enums and settings.
- Add window creation, claim, complete, and roll-up service helpers.
- Add scheduler `BACKFILL` task with no source implementation yet.
- Add focused tests for window generation, idempotent claiming, retry, and roll-up.

### Phase 2: Normalization Windowing

- Add `normalize_observations_for_window`.
- Refactor `normalize_recent_observations` to reuse it.
- Add tests proving old recent normalization behavior remains unchanged.

### Phase 3: First Sources

- Implement `collect_range` for `fingrid`.
- Implement `collect_range` for `porssisahko`, `open_meteo_air`, `linkedevents`, `fmi`,
  and `syke` where the provider exposes real time-window queries.
- Wire source capability checks into job creation.
- Add integration-style tests with fake HTTP clients.

### Phase 4: Admin API and CLI

- Add create/list/detail/pause/resume/cancel endpoints.
- Add a Go-native backfill request command or authenticated API flow.
- Add README/operator docs.

### Phase 5: More Sources and UI

- Add source adapters where provider APIs support history.
- Surface progress in the dashboard source-health area.
- Add guardrails for large ranges and provider-specific rate limits.

## Open Questions

- Which historical horizon matters first: 7 days, 31 days, or 12 months?
- Should backfill be city-scoped only at first, or source-wide?
- Should completed backfill windows trigger daily/regional snapshot regeneration?
- Which provider terms impose strict limits on historical pulls?
- Should failed windows block a job from being considered partially useful?

## Recommended First Implementation Slice

Start with a narrow vertical slice:

1. Add the backfill tables and service helpers.
2. Add `normalize_observations_for_window`.
3. Implement `fingrid.collect_range`.
4. Add a CLI to create and run one job inline for development.
5. Only then wire the recurring scheduler task.

This slice proves the core design with a source that already has a natural
start/end API and keeps the production scheduler risk low.
