# ArkiWatch frontend UI system

The [October 2026 redesign](frontend-redesign-2026-10.md) is the accepted direction.
Home combines the decision and readings. Domain workspaces provide inspection;
Your day (`/plan`, with `?view=today` kept as a compatible entry) contains the
optional personal timeline. There is one overview.

## Scope and navigation

The context bar owns city, date, data mode and check time. Demo and historical
states use a compact labelled pill. Notices are reserved for unavailable scopes
and failures. Refresh, notifications and Ask remain on the right. The sidebar
owns language, theme, settings and account controls. Its 56px rail preference is
persisted locally. The personal-plan entry appears when personal context exists.

Mobile uses a 48px brand row, a compact mode strip and bottom navigation. City
and date controls open in a native bottom-sheet dialog. The document remains
within the viewport at 320px in English and Chinese. Controls that act on old
content become inert during a scope change; scope and navigation remain usable.

## Visual tokens and cascade

Inter is the UI face, with a CJK fallback stack and tabular numbers. JetBrains
Mono is reserved for code and identifiers. The light palette uses a neutral
canvas, white surfaces and blue `#1D4ED8`; the dark palette retains the same
semantic roles. Status colors always carry words. Cards use 10px corners,
controls 8px, borders 1px and three elevation levels.

Literal CSS colors belong only in `apps/web/src/app/tokens.css`. Compatibility
aliases resolve to the same palette; they do not introduce a second accent.

The layer order is `reset, tokens, base, components, features, overrides`.
Declare the layer *inside* the stylesheet: the pinned Next CSS loader interprets
`@import "file.css" layer(features)` as a media query. Ordinary imports load
files whose own declarations sit in `@layer features`.

Shared primitives live in `apps/web/src/features/shared/ui/console.tsx` with a
co-located CSS module. Shell components remain in the data-platform feature and
compose those primitives. The feature sheets have bounded responsibilities:

| File | Responsibility |
| --- | --- |
| `console-shell.css` | Navigation, context controls, Home, workspace layout, command palette and responsive shell |
| `console-chart.css` | Shared trend frame, axes, area wash, tooltip and insufficient-history state |
| `console-inspection.css` | Shared styling of retained specialist inspection controls and maps |
| `console-plan.css` | Personal timeline and recommendations |
| `events-inbox.css` | Native notification inbox dialog |
| `skeleton.css` | Initial loading surface |

The previous `components.css`, `nordic.css`, responsive override sheet and nine
bespoke domain stylesheets are retired. CSS remains below 6,000 lines; the check
script rejects unlayered source styles and `!important` outside overrides.

## Components and data behavior

- Home shows one decision, six metric tiles, open events, a selected trend and
  source-health summary. Empty domains remain visible with an explicit state.
  Your day appears beside the decision only when saved personal context exists.
- Domain pages compose PageHeader, KPI row, chart, sortable/searchable DataTable,
  specialist inspection disclosure and source footer. Specialist
  maps, source pipelines and event details remain available in inspection. Energy
  provider switches control the primary KPIs, chart and table together; Mobility
  lists individual incidents in the primary table.
- Metric values and table readings expose provider, location, timestamp, method,
  licence and source link through EvidencePopover. Missing metadata is labelled
  as unrecorded. Forecasts also expose their validity time. Floating evidence is
  clamped to the viewport, escapes scrolling table clipping, and links directly
  to its provider drawer while retaining city/date.
- TrendChart draws only with at least three finite samples. A smaller series
  produces a short notice with the actual count. Station comparisons never
  become time series. A 24-hour forecast/schedule uses timestamps, independent of
  sampling frequency. The API supplies a 30-day archive; 7/30-day filters use
  actual calendar dates, skip missing days and exclude later snapshots. Weather
  history is a daily forecast mean, energy uses duration-weighted daily values,
  and air/mobility retain their daily snapshot semantics. Chart positions reflect
  elapsed time rather than array index.
- Chart hover and keyboard focus expose value, unit, time and source; a dashed
  reference line marks the snapshot instant when it is inside the series.
- Failed requests and expired briefing caches withhold affected readings and
  mark the tile Failed/Stale. A cached value does not silently regain health.
- Events share one filter bar for All/Open/Ended, incident/public type, search,
  domain, provider and severity. Open means active at the viewed reference time;
  upcoming events appear in All with an explicit state. Time expiry is called
  Ended, because there is no manual-resolution workflow in the API. Details open
  in a right drawer. CSV export respects the current filters.
- Sources & health lists domain, current status, last successful run, row count,
  latency and seven days of recorded execution counts. Day boundaries use
  Europe/Helsinki. A failed latest execution cannot overwrite the last success.
  Its drawer includes errors, licence and per-day success/failure/unfinished
  counts. Historical reads exclude later executions and later run outcomes.
  Older demo/archive payloads explicitly say when run history is unrecorded.
- Source/platform database read failures return HTTP 503 for the overview,
  briefing, category and export routes; they cannot become healthy empty data.
- Your day edits context in the shared drawer. Direct visits without saved
  context show a setup explanation rather than an empty personal timeline.
- Ask opens a resizable 420px non-modal dock at widths of at least 1280px.
  Smaller screens use a modal sheet with a focus trap. Citations preserve the
  desktop conversation and highlight the matching workspace. Changing city or
  date resets the conversation's data scope.
- The command palette supports Cmd/Ctrl+K, arrow keys, Enter and Escape.
  `g h`, `g e`, `g s` navigate Home, Events and Sources. Scope stays in the URL.

## Validation

Run `pnpm --filter @arkiwatch/web check`, a demo production build, then
`pnpm --filter @arkiwatch/web e2e --workers=2`.

Use `e2e/tools/style-snapshot.mjs` before and after CSS changes, followed by
`e2e/tools/style-diff.mjs`. Pure cascade refactors should have a zero diff. An
intentional redesign changes structure and styles: review those differences
against the design and screenshots, rather than treating a nonzero diff as a
regression by itself. The matrix includes desktop/mobile, light/dark, English/
Chinese, historical views, the plan and Sources & health.

See the [implementation report](frontend-redesign-2026-10-implementation.md) for
validation results and known API limits.
