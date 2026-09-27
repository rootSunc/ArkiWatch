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
overview and then the category workspaces. Collector status, event history, and
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

The visual language is Nordic minimal: a warm birch-paper canvas, a light
navigation plane in the same tone, spruce ink, one fjord accent for actions and
links, generous whitespace, and hairline dividers instead of shadows. Meaning
is carried by nature-derived status colours (moss for good, cloudberry for
caution, lingonberry for error) that only ever appear as small dots and text,
never as large fills. Heather marks the Today workspace. Avoid decorative
gradients, oversized icons, pill-shaped containers, and competing headlines.

All literal CSS colors live in `apps/web/src/app/tokens.css`; component CSS
uses semantic tokens, including for translucent fills and shadows. Light mode
pairs the birch canvas with slightly lighter evidence surfaces. Dark mode is a
polar-night spruce palette with a pale fjord accent. Both modes keep these
roles stable:

| Role | Tokens | Usage |
| --- | --- | --- |
| Canvas and elevation | `--canvas`, `--surface`, `--surface-soft`, `--line` | Page, evidence panels, quiet grouping, separators |
| Text | `--ink`, `--ink-soft`, `--muted` | Headings, body, secondary labels |
| Action and focus | `--blue`, `--blue-soft`, `--btn-fill`, `--focus-ring` | Links, selections, primary actions, keyboard focus |
| Meaning | `--green`, `--amber`, `--red` | Good, caution, and error with text labels |
| Today | `--today-accent`, `--today-soft`, `--today-line` | Quiet heather workspace identity, separate from warnings |
| Effects | `--shadow-color`, `--selection` | Depth and browser selection without component color literals |
| Brand planes | `--sidenav-*`, `--brand-*` | Canvas-toned product navigation and the dark spruce About hero, each with readable foregrounds |

Run `pnpm --filter @arkiwatch/web audit:colors` after adding styles. The check
rejects literal CSS colors outside `tokens.css`. The web manifest is a static
metadata exception and repeats the light canvas and button fill values
because it cannot read CSS variables.

Typography uses Manrope for the interface (with a CJK fallback stack for
Chinese) and tabular figures everywhere, so readouts, timestamps and labels no
longer need a monospace face. `--font-data` names that role; JetBrains Mono
(`--font-mono`) is kept for code only. Labels are sentence case
(`--label-case`, `--label-tracking`, `--label-size`) rather than tracked
uppercase. The font variables are attached to the root element, because the
theme tokens that read them are declared on `:root`.

The current implementation follows a deliberately small visual grammar:

- `Today` uses a quiet heather accent, one primary recommendation with its
  actions directly beneath it, and a compact glance table. Supporting plans
  and personal context sit below the decision, never beside it as competing
  headlines.
- `Data` leads with the readings themselves. The observatory hero carries the
  scope and check time in one quiet line, the Today digest follows as the only
  tinted card, and the two-column signal grid is the primary result. Each card
  shows its title and status dot on one line and a left-aligned reading. The
  system summary (coverage, event volume, collector status, check time) is
  supporting evidence and follows the grid as a single hairline row.
  Cross-signal history is collapsed by default so the latest evidence remains
  the first read.
- Missing values stay visibly quieter than real ones (muted text, no display
  size) so an empty slot never reads like a reading.
- The shell uses a canvas-toned navigation plane, light evidence surfaces,
  12px card radii, 8px controls, and one-pixel hairlines. The legacy cascade
  lives in `styles/components.css`, whose internal order is load-bearing: its
  sections restyle the same selectors in both directions, so they cannot be
  reordered or split apart without deciding, per declaration, which one wins.
  `styles/nordic.css` is the final layer after that cascade: shell, overview,
  Today, workspace rhythm, and phone/tablet adjustments. It wins by load order
  and matching specificity rather than `!important`, and contains no literal
  colors.
- Detail workspaces share `WorkspaceEvidenceHeader` and `WorkspaceEmptyState`.
  The header keeps the status, source, and scoped timestamp together; the
  empty state explains missing data without implying that a source is healthy.
  Shared primitives live in `apps/web/src/features/data-platform/workspace-ui.tsx`
  and their visual tokens live in `app/tokens.css`.

### About the `!important` declarations

Some breakpoint and state rules use `!important` because later styles would
otherwise override them. Treat that as cascade debt, not a permanent design
requirement. The audit tool can identify winners in captured states, but cannot
establish that a declaration is unused across hover, active, loading, and error
states. Review those states when simplifying the cascade.

### Verifying a stylesheet change

Moving a rule between files changes the cascade, and the cascade here is load
order. `apps/web/e2e/tools/` records the computed styling of every element on
every route, in both themes, at two viewports:

```bash
cd apps/web
node e2e/tools/style-snapshot.mjs before.json   # against a running build
# …make the change, rebuild, restart…
node e2e/tools/style-snapshot.mjs after.json
node e2e/tools/style-diff.mjs before.json after.json
```

A pure reorganisation should produce no computed-style differences in captured
states. Investigate any differences and check interaction states separately.

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
| Signal observatory | Categories, recent events, and collector status | View check time, category cards, catalog disclosure, and collector-run detail |
| Event panel | Overall notification plus the current unread count | Read/unread events, structured attributes, evidence chips, and workspace link |
| Energy card | Household best price in `c/kWh` when available | System-only current grid load in `MW`, source and scope metadata |

`live`, `historical`, and static demo scopes are never interchangeable in copy:
historical and demo timestamps are absolute, while live timestamps may include
relative age. Empty data means the source returned no usable value for the
selected scope; it is not silently promoted to healthy or live. A recent
successful collector run does not prove that a usable reading exists for the
selected city and date. The coverage catalog marks adapter support, not live
availability.

The event surface is intentionally progressive: the timeline is opt-in from
the notification control, event details are opt-in from a timeline item, and
opening a workspace preserves the event target in navigation. During a scope
transition, actions are disabled until the new response replaces the previous
scope.

## Responsive behavior

- Desktop: persistent navigation, one context bar, and a centered content frame.
- Tablet: persistent navigation may collapse; grids reduce to two columns.
- Mobile: navigation becomes a drawer, the bottom bar contains only the most
  common destinations in desktop order (overview, Today, weather, mobility,
  and assistant) with a soft pill behind the active icon, city and date read
  as two chips under the app bar, and
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
