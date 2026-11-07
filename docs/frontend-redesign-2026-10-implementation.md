# October console redesign — implementation and review

Implemented against the working tree present on 2026-10-24. Existing ingestion and specialist domain calculations, generated demo assets
and unrelated local edits were retained. Source-health metadata and failure
responses extend the Go API and its generated frontend contract.

## Delivered

| Stage | Result |
| --- | --- |
| 0 | Layered CSS, Inter, neutral light/dark palettes, blue accent, 10px cards, 1px borders and elevation tokens |
| 1 | Single context bar, grouped navigation, persistent 56px rail, sidebar preferences, no normal demo banner or repeated check-time blocks |
| 2 | Shared Card, MetricTile, Sparkline, StatusBadge, ModePill, PageHeader, DataTable, EvidencePopover, ChartFrame, EmptyState, Drawer and Toast primitives |
| 3 | Home merges decision and six domain readings; optional personal column; `/plan` holds the timeline and accepts the legacy Today entry |
| 4 | Shared workspace template across Weather, Air, Energy, Mobility, Water and reference domains; specialist maps/tabs/pipelines retained under Detailed inspection |
| 5 | Event lifecycle/provider filters, detail drawer and filtered export; Sources & health with real seven-day executions and last-success metadata |
| 6 | Single-row mobile header, native scope sheet, two-column metrics, stacked table records and bottom navigation |
| 7 | Resizable non-modal assistant dock at ≥1280px, modal sheet below, scoped per-reading/row Ask, citation highlight and Cmd/Ctrl+K command search |
| 8 | Shared palette/layers across settings, login, About and Privacy; compact personal-context editor; retired legacy cascade and domain stylesheets |

The domain adapters retain existing specialist components rather than deleting
working maps, price-provider tabs, source pipelines and translated event details.
They share one inspection stylesheet and lower heading levels within the
workspace. There remains exactly one page-level heading when inspection opens.

Source, scope, time, method and licence appear on demand. Missing metadata is
labelled as unrecorded. Failed requests and expired briefing caches cannot
silently reuse a healthy-looking cached reading. City/date transitions retain
content with reduced opacity while scope and navigation stay available.

## Validation

Source CSS fell from 29,956 lines in 30 files to 4,334 lines in 16 files.
The layer/budget audit runs inside the normal web check.

Final validation: 86 unit-test files / 381 tests; 91 production Playwright tests
passed and 7 device-specific cases skipped. The demo production build, Go API suite, Go vet, contract/domain generation
checks and `git diff --check` passed. An isolated PostgreSQL 17 integration
test verified last success versus last failure, Helsinki midnight grouping,
zero-run days, historical references and unfinished runs with later outcomes.

- `pnpm --filter @arkiwatch/web check`: lint, unit tests, TypeScript, bilingual
  catalog audit, color-token audit, cascade-layer and CSS-budget audit.
- `NEXT_PUBLIC_DEMO_MODE=true pnpm --filter @arkiwatch/web build`: production build.
- Playwright on the production server: desktop and mobile flows, all workspace
  templates, scope/history, sorting/filtering/export, notifications, context,
  command search, assistant/citations, narrow English/Chinese layouts, public
  pages and authentication. Device-specific cases deliberately skip the other
  project. Automated WCAG A/AA checks cover Home, Weather, Air, Events and Sources
  in both themes, plus the retained public-page/authentication checks.
- Computed-style snapshots before and after the migration, reviewed alongside
  screenshots. Their differences are expected: fonts, tokens, structure, card
  dimensions, navigation and mobile flow intentionally change. New plan/source
  routes were added to the snapshot matrix. The [review manifest](redesign-review/style-review.json) records scope and expected changes. The continuation
  compares 114 console snapshots with 6,285 expected rendering changes and no
  token differences; event filters, tables, chart geometry, setup and mobile
  timestamps account for those changes. A redesign diff is not a zero-diff
  cascade-only refactor.
- Layout review: [machine-readable measurements](redesign-review/layout-audit.json).
  The reviewed 32 combinations of route/mode have no document overflow. Home's
  first metric begins at 354px on desktop and 318px on mobile in the production review; E2E enforces the <400px
  desktop / <600px mobile thresholds.

Review images: [desktop Home](redesign-review/desktop-overview.png),
[mobile Home](redesign-review/mobile-overview.png),
[dark Home](redesign-review/dark-overview.png),
[Chinese mobile Home](redesign-review/zh-mobile-overview.png),
[Weather](redesign-review/desktop-weather.png),
[Events](redesign-review/desktop-events.png),
[event drawer](redesign-review/desktop-event-drawer.png),
[evidence](redesign-review/desktop-evidence.png), and
[mobile provider drawer](redesign-review/mobile-source-drawer.png).

## Data limits retained explicitly

The Go overview/source-status contracts now include `last_successful_run_at`
and a bounded seven-day `run_history`. They are read from recorded collector
executions; the existing schema migrator adds a partial index for successful
runs. Historical overview reads use the snapshot reference, including unfinished
runs whose final outcome was recorded later. Older archived/demo payloads lack
this metadata and retain the explicit unavailable-history notice. No synthetic
execution strip is added to the frozen demo.

The domain history request now covers the advertised 30 days. Calendar-range
filters exclude future and out-of-range snapshots. Daily weather forecast means
and interval-weighted energy averages replace arbitrary first-point samples;
air and mobility use daily snapshots. Twenty-four-hour series use timestamps,
not fixed sample counts, and chart spacing reflects elapsed time. Missing
licence/method fields remain unrecorded and fewer than three finite points
produce an inline notice.

Events use All/Open/Ended with explicit Upcoming states, composable provider,
severity, domain and type filters, a detail drawer and filtered CSV. The API has
no manual-resolution action, so time expiry is labelled Ended. Home only counts
currently active events. Live Home now fetches domain details as well as the
briefing/history; this fixes a gap that the fully populated demo concealed.

Provider switches update Energy's main KPIs/chart/table; Mobility's primary
breakdown lists real incidents. Your day's editor stays in the current page;
no-context visits explain setup. Evidence links retain city/date, select the
provider in Sources, and the floating panel stays within the viewport even for
the first metric or a reading inside a scrolling table.

Overview, category, briefing and export database failures return HTTP 503 with
a public error message instead of silently producing a healthy empty overview.

The specialist inspection controls remain intentionally accessible during the
migration. Their domain logic has not been rewritten. Live-provider availability
and authenticated personal-context writes require a configured live deployment;
the deterministic demo does not validate those external services.
