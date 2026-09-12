# ArkiWatch frontend UI system

ArkiWatch has two product jobs that should feel related, but should not compete
for the same attention. The Data platform is the product's main body; Today /
life assistant is a secondary, on-demand surface layered on top of it:

| Workspace | User question | Primary action |
| --- | --- | --- |
| Data / public data platform | “What is happening in the data?” | Inspect a signal, its scope, freshness, and evidence. |
| Today / life assistant | “What should I know or do today?” | Review one recommendation and act on it. |

## Information architecture

The shell always exposes a small workspace switcher, with Data listed first.
Data is the default, evidence-oriented landing surface: it opens the signal
overview and then the category workspaces. Source health, event history, and
catalog views remain available from Data, but are intentionally secondary to
the signal overview.

Today / life assistant is reachable from the switcher or a direct `?view=today`
link, but is no longer the default landing state. Its headline recommendation
is still surfaced without leaving Data: a single-line `TodayDigestStrip`
(`apps/web/src/features/data-platform/today/today-digest-strip.tsx`) sits above
the signal observatory and links straight into the full Today page. This keeps
the decision-first value reachable in one glance without making it compete
with the data-first narrative for the default view.

Every page follows the same hierarchy:

1. Global context: workspace, city, time scope, language, and account.
2. One page-level purpose statement.
3. One primary result or action.
4. Supporting evidence, history, and source attribution.

## Visual direction

The visual language is “calm public infrastructure”: a quiet neutral canvas,
one blue action color, semantic green/amber/red status colors, restrained
border contrast, and generous whitespace. Cards are containers for related
evidence, not independent dashboards. Avoid decorative gradients, oversized
icons, and more than one competing headline in a viewport.

The current implementation follows a deliberately small visual grammar:

- `Today` uses a warm amber accent, one primary recommendation, and a compact
  glance panel. Supporting plans and personal context sit below the decision,
  never beside it as competing headlines.
- `Data` uses a cool blue accent, a single signal observatory summary, and a
  three-column signal grid on wide screens. The summary prioritizes category
  coverage, event volume, and source health; the last checked timestamp stays
  in the observatory header. Cross-signal history is collapsed by default so
  the latest evidence remains the first read.
- The shell uses a white/neutral surface, 16px content cards, 10–12px controls,
  and one-pixel borders instead of gradients or heavy shadows. Most of that
  cascade lives in `styles/design-refresh.css`, with `styles/text-layout.css`
  and `styles/taste-pass.css` layered after it; those two are being folded back
  into the files they override.
- Detail workspaces share `WorkspaceEvidenceHeader` and `WorkspaceEmptyState`.
  The header keeps the status, source, and scoped timestamp together; the
  empty state explains missing data without implying that a source is healthy.
  Shared primitives live in `apps/web/src/features/data-platform/workspace-ui.tsx`
  and their visual tokens live in `app/tokens.css`.

### Verifying a stylesheet change

Moving a rule between files changes the cascade, and the cascade here is load
order. `apps/web/e2e/tools/` records the computed styling of every element on
every route, in both themes, at two viewports:

```bash
node e2e/tools/style-snapshot.mjs before.json   # against a running build
# …make the change, rebuild, restart…
node e2e/tools/style-snapshot.mjs after.json
node e2e/tools/style-diff.mjs before.json after.json
```

A pure reorganisation must diff to zero. Anything else is a rendering change
you did not intend.

The spacing scale is based on 4px units (`4, 8, 12, 16, 24, 32`). Content is
limited to a readable 1280px frame. Interactive controls use a minimum 36px
hit area on desktop and 44px on touch surfaces. Every status color is paired
with text, and every live value keeps its source and timestamp nearby.

## Display contracts

The interface uses a small number of explicit state contracts so visual polish
does not change the meaning of a data value:

| Surface | Primary readout | Supporting evidence |
| --- | --- | --- |
| Today | One lead recommendation and a compact plan | Scenario context, source issues, and linked events below the decision |
| Signal observatory | Categories, recent events, and tracked-source health | Checked timestamp, category cards, catalog disclosure, and source-health detail |
| Event panel | Overall notification plus the current unread count | Read/unread events, structured attributes, evidence chips, and workspace link |
| Energy card | Household best price in `c/kWh` when available | System-only current grid load in `MW`, source and scope metadata |

`live`, `historical`, and static demo scopes are never interchangeable in copy:
historical and demo timestamps are absolute, while live timestamps may include
relative age. Empty data means the source returned no usable value for the
selected scope; it is not silently promoted to healthy or live.

The event surface is intentionally progressive: the timeline is opt-in from
the notification control, event details are opt-in from a timeline item, and
opening a workspace preserves the event target in navigation. During a scope
transition, actions are disabled until the new response replaces the previous
scope.

## Responsive behavior

- Desktop: persistent navigation, one context bar, and a centered content frame.
- Tablet: persistent navigation may collapse; grids reduce to two columns.
- Mobile: navigation becomes a drawer, the bottom bar contains only the most
  common destinations (Today, overview, weather, mobility, and assistant), and
  secondary tools stay behind the menu. The assistant action is disabled while
  the city/date scope is updating.

## Component boundaries

Keep the page controller focused on state and orchestration. The current Data
surface uses these boundaries:

- `data-platform-home.tsx` owns city/date scope, navigation, API responses,
  focus restoration, and callbacks.
- `data-platform-nav-utils.ts` contains pure availability and mobile-priority
  navigation decisions.
- `signal-observatory-overview.tsx` renders the summary header, freshness
  marker, and system tiles.
- `recent-events-panel.tsx` renders the notification summary, event timeline,
  event detail, and evidence hierarchy; routing and read-state mutations stay
  in the controller.
- `data-platform-workspace-router.tsx` consumes one explicit `WorkspaceRoute`
  instead of a set of independent detail booleans.
- `workspace-ui.tsx` provides shared evidence headers, empty states, and
  disclosure treatment for domain workspaces.

When adding a new display surface, first define its view-model inputs and
interaction callbacks, then keep markup and styling in the smallest semantic
component that owns that hierarchy level. Avoid moving API fetching or router
mutation into presentational components.

## Implementation rules

- Keep domain data and presentation models separate from shell components.
- Prefer one semantic component per hierarchy level over one-off markup.
- Keep the Today assistant contextual to the selected city and date.
- Historical views must request the matching date-scoped public snapshot and
  never fall back to live recommendations.
- Keep Data workspaces explicit about coverage, freshness, and evidence.
- Keep household and system energy semantics distinct; never label a grid-load
  value as a household price or vice versa.
- Keep demo fixtures visibly static and use historical wording for date-scoped
  evidence; do not call either state “live”.
- Use existing CSS tokens and semantic message catalogs; do not introduce
  page-specific hard-coded colors or untranslated labels.
- Keep API copy canonical and expose optional localized content fields (for
  example `title_zh` and `body_zh`) through the shared content-localization
  helper; this lets live sources adopt translations incrementally without
  breaking older payloads.
- Preserve keyboard focus, reduced-motion behavior, and visible loading/error
  states during visual refinements.
- Never present data from a previous city or date as current: keep the cached
  cards visible during a scope transition, but announce the transition and
  pause actions until the new scope has arrived.

## Verification checklist

For a frontend display change, run the focused tests first and then the full
web gates:

```bash
pnpm --filter @arkiwatch/web test
pnpm --filter @arkiwatch/web run typecheck
pnpm --filter @arkiwatch/web run lint
pnpm demo
```

Use the demo to check both a desktop overview and a narrow viewport. Confirm
that the summary remains prioritized, the mobile bar exposes only its compact
destinations, event details preserve keyboard focus, and demo/historical/live
labels remain truthful. End each completed implementation round with a
focused Conventional Commit.
