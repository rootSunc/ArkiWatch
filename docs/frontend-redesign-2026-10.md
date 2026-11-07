# ArkiWatch frontend redesign — commercial product direction

Status: implemented on 2026-10-24; see [implementation and validation](frontend-redesign-2026-10-implementation.md). Supersedes the "Nordic minimal" direction.
[Frontend UI system](frontend-ui-system.md) now describes the implemented console.

This document is the complete design: principles, information architecture,
visual system, component contracts, screen-by-screen layouts, user flows, and a
staged implementation plan. It is written against the running demo build
(`web-demo`, 2026-10-24) and the current `apps/web` source.

---

## 1. Why change

The current interface is a *minimal editorial* treatment applied to an
*operational data product*. The two fight each other. Concretely, from the
running build:

| Observed on the current build | Consequence |
| --- | --- |
| Signals page spends the first ~45% of the viewport on a demo notice, an "Updated …" line, an H1, a search box, a recommendation card, and four plain-text tiles — before one reading appears | The product's own data is below the fold on a 900px screen |
| The same check time appears three times (demo bar, "Updated 09 Aug 2026, 07:00", "Snapshot checked 07:00" tile) | Repetition reads as noise, not as rigour |
| `--r-card: 0px`, `--border-width: 0.5px`, no shadows, one near-white surface on a near-white canvas | No elevation, no grouping; everything has the same weight, so nothing is primary |
| Signal cards carry a title, a status dot, one number and two meta strings in a 340×110 box | Very low information density and no trend, which is the one thing a monitoring card must show |
| Top bar holds 8 controls: city, date, EN, 中文, theme, help, share, notifications, Assistant — three of them icon-only and unlabelled | No grouping between *scope* (changes the data) and *actions* (change the app) |
| Sidebar mixes a workspace mode (`Today`) with data domains (`Weather`, `Air quality`) and a "Data catalog" group | The mental model is not learnable; `Today` and `Signals` are two overviews that duplicate each other |
| Workspace titles differ per domain ("Helsinki Meteorological Region", "Helsinki metropolitan air", "Public events near you") | No template; every page looks like a different product |
| Linked events page: empty-state card, then a floating search field, then a chip row, then a tab row — four controls in three visual languages | Composition failure, worst surface in the app |
| A chart panel with one observation renders full height and empty | Looks broken rather than explicitly "not enough history" |
| Mobile: avatar overlaps the brand mark in the header; first reading is ~1100px down | Phone is the likely real context (leaving the house) and it is the weakest surface |
| 28.9k lines of CSS, `components.css` alone 7.5k lines, with a documented load-order-dependent cascade and `!important` debt | Any visual change is expensive and risky; this is the root cause of the drift above |

The direction below is deliberately *mature commercial console*: the visual
family of Linear, Stripe Dashboard, Vercel, Grafana Cloud — confident neutral
greys, one decisive accent, real elevation, dense tabular data, charts that
carry meaning, and a single repeated page template.

---

## 2. Design principles

1. **Readings first.** The topmost 400px of any page carries data, not
   explanation. Notices, provenance, and help move beside or below the value.
2. **One template, many domains.** Weather, air, energy, mobility, water, events
   and catalog pages are the same page with different content.
3. **Say a thing once.** Scope, freshness and data mode are stated in exactly one
   place — the context bar — and never repeated in page bodies.
4. **Density with air.** Compact rows and real tables, with generous space
   *between* groups rather than inside every card.
5. **Evidence on demand, not in the way.** Source, station, timestamp and method
   are one click or one hover from every value; they do not compete with it.
6. **Honest states.** Demo, historical, live, stale, empty and failed are six
   distinct, visually distinct states. Never promote one to another.
7. **Mobile is a first-class layout**, not a narrowed desktop.

---

## 3. Information architecture

### 3.1 The Today / Data split is merged

Today and Signals are currently two landing surfaces answering overlapping
questions, plus a `TodayDigestStrip` that smuggles one into the other. That is
the single biggest flow problem.

**New model — one home, two depths:**

```
Home (default)         "What matters right now, and is anything wrong?"
  └─ lead decision + live signal grid + today's timeline + open events
Domain workspace       "Show me this domain in detail"
  └─ KPIs, chart, breakdown table, sources
```

`Today`'s unique content (day plan, personal recommendations, personal context)
becomes the **"Your day"** column of Home when the viewer has saved context, and
a dedicated `/plan` page when they want the full timeline. No second overview.

### 3.2 Navigation

```
┌─ ArkiWatch ─────────────┐
│  ⌘K  Search             │   command palette, replaces the in-page search field
│                         │
│  ▸ Home                 │   lead decision + signals          (default route)
│  ▸ Your day         3   │   plan + personal recommendations  (only when relevant)
│  ▸ Events           2   │   linked events + incidents
│                         │
│  DOMAINS                │
│  ▸ Weather              │
│  ▸ Air quality          │
│  ▸ Energy               │
│  ▸ Mobility             │
│  ▸ Water & snow         │
│                         │
│  REFERENCE              │
│  ▸ City services        │
│  ▸ Geospatial base      │
│  ▸ Regional profile     │
│  ▸ Sources & health     │   promoted out of the overview footer
│                         │
├─────────────────────────┤
│  ◐ Theme   EN|中文      │   moved out of the top bar
│  ⚙ Settings             │
│  ◯ Sign in / account    │
└─────────────────────────┘
```

Changes: `Signals` disappears as a nav item (it *is* Home); `Data catalog`
becomes `Reference`; collector status is promoted to a real page
(`Sources & health`) instead of a collapsed accordion; language and theme leave
the top bar; counts are badges, not separate controls.

Sidebar is collapsible to a 56px icon rail (persisted), which the current layout
already supports via `SideNavRestoreButton`.

### 3.3 Top context bar

The bar states **what data you are looking at**, and nothing else:

```
Weather  ·  Helsinki ▾  ·  Today ▾  ·  ◆ Demo snapshot          ⟳  🔔2  ✦ Ask
└ breadcrumb ┘ └──── scope: changes the data ────┘      └ actions ┘
```

- Left: breadcrumb → city → date → **data-mode pill** (`Live` / `Demo snapshot` /
  `Historical · 08 Aug`). The pill replaces the full-width demo banner entirely.
- Right: refresh, notifications, **Ask** (assistant). Three controls, all labelled
  or badged. Share/export move into the page header's `⋯` menu; language and
  theme move to the sidebar footer.
- The bar is sticky, 56px, with a 1px bottom border and a blur backdrop.
- While a scope change is in flight the bar shows a 2px indeterminate progress
  line and the content area dims to 60% — not disabled controls scattered per card.

---

## 4. Visual system

### 4.1 Palette

Replaces the slate/violet aliases in `tokens.css`. Literal colors stay confined
to that file; `audit:colors` keeps working unchanged.

**Light**

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#F6F7F9` |
| Surface (cards, tables) | `--surface` | `#FFFFFF` |
| Raised / hover row | `--surface-soft` | `#F2F4F7` |
| Sunken (chart wells, code) | `--surface-sunken` | `#EDEFF3` |
| Border | `--line` | `#E4E7EC` |
| Border strong | `--line-strong` | `#D0D5DD` |
| Ink | `--ink` | `#0F172A` |
| Body | `--body` | `#344054` |
| Muted | `--muted` | `#667085` |
| Accent | `--accent` | `#1D4ED8` |
| Accent hover | `--accent-hover` | `#1E40AF` |
| Accent soft fill | `--accent-soft` | `#EEF4FF` |
| Brand plane (sidebar, hero) | `--brand-900` | `#0B1220` |
| Success | `--green` | `#067647` |
| Warning | `--amber` | `#B54708` |
| Error | `--red` | `#B42318` |
| Info / live | `--info` | `#175CD3` |

**Dark** — not an inversion; a true dark console.

| Role | Value |
| --- | --- |
| Canvas | `#0B0E14` |
| Surface | `#12161F` |
| Raised | `#1A1F2B` |
| Border | `#232A36` |
| Ink | `#E6EAF2` |
| Body | `#AEB7C6` |
| Muted | `#7A8598` |
| Accent | `#5B8DEF` |
| Success / Warning / Error | `#3DD68C` / `#F0A33D` / `#F97066` |

Status colors appear as: a 6px dot, a 1px-bordered soft badge, a chart series, or
a 2px left rule on a row. Never as a card fill. Every status color is paired with
its word (`Healthy`, `Stale`, `Failed`) — the current build already does this and
it is kept.

### 4.2 Typography

Switch the UI face from Manrope to **Inter** (variable). Manrope's geometric
single-storey forms read "startup landing page"; Inter is the neutral workhorse
of this product category and has better tabular figures and CJK pairing.

| Token | Size / line / weight | Use |
| --- | --- | --- |
| `--text-display` | 30 / 36 / 600, −0.02em | Primary metric values, Home lead |
| `--text-metric` | 24 / 30 / 600, tnum | KPI tile values |
| `--text-h1` | 20 / 28 / 600 | Page title |
| `--text-h2` | 16 / 24 / 600 | Card / section title |
| `--text-body` | 14 / 20 / 400 | Default |
| `--text-sm` | 13 / 18 / 400 | Table cells, dense rows |
| `--text-meta` | 12 / 16 / 500 | Labels, timestamps, units |
| `--text-mono` | 12 / 16 / 450 | IDs, coordinates, raw payloads only |

Rules: `font-variant-numeric: tabular-nums` globally; units rendered at
`--text-meta` in `--muted` immediately after the value (`9.60` `c/kWh`); labels
stay sentence case (keep `--label-case: none`); no all-caps tracked labels except
the two sidebar section headers, at 11px / 0.06em / `--muted`.

### 4.3 Shape, elevation, spacing

| Token | Value | Note |
| --- | --- | --- |
| `--r-card` | `10px` | was `0px` |
| `--r-control` | `8px` | |
| `--r-chip` | `6px` | |
| `--r-pill` | `999px` | data-mode pill, badges only |
| `--border-width` | `1px` | was `0.5px` (renders inconsistently) |
| `--shadow-sm` | `0 1px 2px rgba(16,24,40,.06)` | cards at rest |
| `--shadow-md` | `0 4px 12px rgba(16,24,40,.08)` | hover, popovers |
| `--shadow-lg` | `0 16px 40px rgba(16,24,40,.14)` | drawers, dialogs |

Spacing keeps the 4px scale. New layout constants: content max `1440px`
(was 1280), gutter `24px` desktop / `16px` phone, sidebar `248px` / rail `56px`,
context bar `56px`, card padding `20px`, grid gap `16px`, section gap `32px`.

### 4.4 Charts

Charts are the missing half of this product. One shared chart frame:

- Series: accent `#1D4ED8`, then `#0E9F6E`, `#B54708`, `#7A5AF8`, `#0E7490`.
- Area fill is a single 12%-alpha wash of the series color; no gradients to white.
- Y axis: 3–4 ticks, right-aligned, `--text-meta`, `--muted`; horizontal
  gridlines only, `--line`, 1px.
- X axis: scope-aware labels; "now" marked with a 1px dashed accent rule.
- Hover: crosshair + a single-point tooltip carrying value, unit, time, source.
- **Under three observations a chart does not render.** It is replaced by a
  40px-tall inline notice inside the card header area: "Not enough history —
  1 of 3 observations for this scope." This fixes the empty-panel bug directly.

---

## 5. Component contracts

New or reworked primitives, to live in `features/shared/ui/`:

| Component | Contract |
| --- | --- |
| `AppShell` | sidebar + context bar + content + optional right dock |
| `SideNav` | sections, badges, collapse to rail, footer utilities |
| `ContextBar` | breadcrumb, city, date, mode pill, actions, pending progress line |
| `PageHeader` | title, subtitle, status badge, right-aligned action cluster + `⋯` |
| `Card` | optional header (title + meta + action), body, optional footer (source line) |
| `MetricTile` | label, value, unit, delta vs previous scope, 40px sparkline, status dot, source chip |
| `StatusBadge` | dot + word + tone; sizes sm/md |
| `ModePill` | `Live` / `Demo snapshot` / `Historical` |
| `DataTable` | sticky header, 40px rows, zebra off, hover `--surface-soft`, right-aligned numerics, sortable, empty + loading states |
| `ChartFrame` | title, legend, time-range segmented control, min-observations guard |
| `EvidencePopover` | provider, station, observation time, method, link — one component for every value |
| `EmptyState` | icon, one-line cause, one-line remedy, optional action; never implies health |
| `Drawer` | right dock, 420px, resizable, non-modal on ≥1280px |
| `CommandPalette` | ⌘K: cities, domains, events, settings, assistant questions |
| `Toast` | refresh results, export done, copy link |

Deleted: the floating in-page search field, the full-width demo banner, the
standalone help `?` button (its content moves into `EvidencePopover` and
`Sources & health`), the collapsed "Data coverage & freshness" accordion.

---

## 6. Screens

### 6.1 Home

```
┌ Home · Helsinki ▾ · Today ▾ · ◆ Demo snapshot ────────── ⟳  🔔2  ✦ Ask ┐
├────────────────────────────────────────────────────────────────────────┤
│ ┌─ LEAD DECISION ─────────────────────────┐ ┌─ YOUR DAY ─────────────┐ │
│ │ ✦ Recommendation · mobility             │ │ 10:00  Brief rain      │ │
│ │ Leave a few minutes earlier             │ │ 12:00  Cheap power     │ │
│ │ Westbound tram has a service alert      │ │ 17:30  Commute alert   │ │
│ │ during the morning peak.                │ │                        │ │
│ │ [View mobility →]  [Ask about this]     │ │ Based on saved context │ │
│ │ FMI · HSL · checked 07:00               │ │ [Edit context]         │ │
│ └─────────────────────────────────────────┘ └────────────────────────┘ │
│                                                                        │
│ Signals                                     Last check 07:00  [All →]  │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐    │
│ │ Weather  │ Air      │ Energy   │ Mobility │ Water    │ Events   │    │
│ │ 16°      │ 1/5      │ 9.60     │ 2        │ 0.4 m    │ 5        │    │
│ │ ∿∿∿ +1°  │ ∿∿∿ good │ ∿∿∿ −8%  │ ● Watch  │ ∿∿∿ ±0   │ 1 high   │    │
│ │ FMI      │ HSY      │ FINGRID  │ DIGITR.  │ SYKE     │ LE       │    │
│ └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘    │
│                                                                        │
│ ┌─ OPEN EVENTS (2) ───────────────────┐ ┌─ 24H TREND ────────────────┐ │
│ │ ● high  Tram 9 service alert  07:12 │ │  [Temp ▾] [Air] [Price]    │ │
│ │ ● low   Station Kallio offline 06:40│ │   ╱╲      ╱╲               │ │
│ │ [All events →]                      │ │  ╱  ╲____╱  ╲___           │ │
│ └─────────────────────────────────────┘ └────────────────────────────┘ │
│                                                                        │
│ 9/9 collectors healthy · 3 sources · checked 07:00    [Sources →]      │
└────────────────────────────────────────────────────────────────────────┘
```

Key decisions: the lead decision occupies a 2/3 hero and is the only tinted
surface; six metric tiles replace four sparse cards and each one carries a trend;
the four plain-text stat tiles are reduced to one footer line; "Your day"
appears only when saved context exists, otherwise that column holds the trend
chart and the hero goes full width.

### 6.2 Domain workspace (one template for all nine)

```
┌ Weather · Helsinki ▾ · Today ▾ · ◆ Demo snapshot ────── ⟳  🔔  ✦ Ask ┐
├──────────────────────────────────────────────────────────────────────┤
│ Weather                                      ● Healthy   [⋯ Share]   │
│ Helsinki · FMI observation · 09 Aug 2026, 07:00                       │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ Temperature ─┬ Feels like ─┬ Wind ──────┬ Humidity ─┬ Pressure ──┐  │
│ │ 16 °C        │ 16 °C       │ 3.4 m/s    │ 72 %      │ 1011 hPa   │  │
│ │ ∿∿∿∿ +1°/24h │ —           │ SSW · 6.2  │ ∿∿∿ −4pt  │ ∿∿∿ ±0     │  │
│ └──────────────┴─────────────┴────────────┴───────────┴────────────┘  │
│                                                                      │
│ ┌ 24 hours ────────────────────── [24h][7d][30d]  Temperature ▾ ──┐  │
│ │            ╱╲                                          ⋮ now     │  │
│ │   ____╱╲__╱  ╲____                                     ⋮         │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│ Breakdown                                   Search…   [Export CSV]   │
│ ┌ Station ──────── Value ── Status ── Updated ── Source ──────────┐  │
│ │ Kaisaniemi        16 °C    ● ok      07:00     FMI              │  │
│ │ Malmi airport     15 °C    ● ok      06:50     FMI              │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│ Sources: FMI open data · licence CC BY 4.0 · 2 of 2 stations reporting│
└──────────────────────────────────────────────────────────────────────┘
```

This replaces nine bespoke layouts (`weather-detail-view`, `air-quality-workspace`,
`energy-workspace`, `mobility-workspace`, `water-snow-workspace`,
`road-rail-workspace`, `city-services-workspace`, `geospatial-workspace`,
`regional-profile-workspace`) with one composition: **PageHeader → KPI row →
primary chart → breakdown table/map → source footer**. Domain-specific content
(air station map, energy price curve, event timeline) slots into the chart and
table regions; nothing else varies. Page title is always the domain name, with
the scope in the subtitle — ending "Helsinki Meteorological Region" vs
"Helsinki metropolitan air".

### 6.3 Events

```
│ Events                                   2 open · 5 today  [⋯]       │
│ Helsinki · Linked Events + incident feeds · 09 Aug 2026, 07:00       │
├──────────────────────────────────────────────────────────────────────┤
│ [All 5] [Open 2] [Resolved 3]        Search…    Severity ▾  Source ▾ │
├──────────────────────────────────────────────────────────────────────┤
│ ▌● high   Tram 9 service alert            mobility   07:12   HSL   › │
│ ▌● low    Kallio station offline          air        06:40   HSY   › │
│   ○ info  Snow depth updated              water      06:00   SYKE  › │
└──────────────────────────────────────────────────────────────────────┘
      click a row → right drawer with attributes, evidence, workspace link
```

One filter bar (segmented control + search + two selects) replaces the current
chips/tabs/floating-search pile. The empty state sits *inside* the list region,
with the filters still visible and usable.

### 6.4 Sources & health (new page, promoted from the accordion)

Table of collectors: source, domain, last successful run, rows returned, latency,
status, 7-day run strip. A header summary (`9/9 healthy · last run 07:00`) and a
per-row drawer with the last error. This is where "is the data real?" is answered,
so `EvidencePopover` links here.

### 6.5 Your day / plan

Full-width vertical timeline, hour rail on the left, recommendation cards on the
right, personal-context editor in a drawer rather than a separate settings trip.
Only reachable when personal context exists or during the setup flow.

### 6.6 Settings, Login, About

- Settings: two-column (section nav + panel) — Profile, City & scope, Personal
  context, Notifications, Data & privacy. Current single-column module stays
  functionally identical.
- Login: centred 400px card on the brand plane, one primary action, demo-mode
  note below.
- About/Privacy: marketing surfaces, unchanged in structure; restyled to the new
  palette with the brand plane hero.

### 6.7 Mobile (≤768px)

```
┌ ArkiWatch        Helsinki ▾  🔔2 ┐   48px header, single row (fixes overlap)
│ ◆ Demo snapshot · 07:00          │   28px mode strip
├──────────────────────────────────┤
│ Leave a few minutes earlier      │   lead decision, no card chrome
│ Tram 9 alert during morning peak │
│ [View →]  [Ask]                  │
├──────────────────────────────────┤
│ ┌─ Weather 16° ┐ ┌─ Air 1/5 ──┐  │   2-up metric tiles, scrollable
│ └──────────────┘ └────────────┘  │
├──────────────────────────────────┤
│  Home   Day   Events   Ask   ⋯   │   bottom tab bar, 56px + safe area
└──────────────────────────────────┘
```

Rules: first reading above 600px; scope controls in a bottom sheet, not a
cramped top row; assistant is a full-screen sheet; tables become stacked rows
with label/value pairs; 44px minimum hit area.

---

## 7. User flows

**F1 · First visit (anonymous).** Land on Home → city defaults to Helsinki with a
one-line "Not your city? Change" affordance in the context bar → lead decision and
six signal tiles render from the public snapshot → any tile click opens its
workspace. No sign-in prompt, no onboarding modal. *Success: a relevant reading in
one view, zero clicks.*

**F2 · Change scope.** City or date select → context bar shows the progress line,
content dims, nav and scope stay interactive → new data swaps in, mode pill updates
(`Live` → `Historical · 08 Aug`) → URL carries `?city=&date=`, so the view is
shareable. Nothing re-renders into a skeleton that was already correct.

**F3 · Drill down.** Tile → workspace (KPI row preserves the value you clicked, so
there is visual continuity) → chart range → table row → `EvidencePopover` →
`Sources & health`. Four levels, each one click, breadcrumb back at every step.

**F4 · Check the evidence.** Any value: hover (desktop) or tap the ⓘ (touch) →
popover with provider, station, observation time, method, licence, and a link to
the source page. Replaces the global `?` help button and the per-page help icons.

**F5 · Ask the assistant.** `Ask` in the context bar, or **"Ask about this"** on
any card/row (which pre-fills the question with that card's scope) → right drawer,
non-modal on ≥1280px so the data stays visible while reading the answer — the
current overlay hides the thing being asked about. Citations in the answer are
chips that scroll-and-highlight the corresponding card.

**F6 · Something is wrong.** A failed collector surfaces as: amber mode pill →
affected tile shows `Stale · 3h` instead of a value → tile links to
`Sources & health` row with the last error. No silent fallback to an old number.

**F7 · Personalise (optional).** Saved context is offered contextually — a quiet
"Add your commute to tailor this" line under the lead decision, not a wall — →
drawer with 3 fields → Home gains the "Your day" column. Sign-in is required only
here and for notifications.

**F8 · Share / export.** `⋯` on any page header: copy view link (scope encoded),
export CSV (table), export snapshot (JSON). Confirmed by toast.

---

## 8. Motion and accessibility

- Durations: 120ms (hover/press), 180ms (popover, tooltip), 240ms (drawer,
  sheet), easing `cubic-bezier(.2,0,0,1)`. No entrance animation on data; values
  cross-fade at 120ms so a changed number is noticed without a layout jump.
- Skeletons only for first load; scope changes dim instead of skeletonising.
- `prefers-reduced-motion`: all transforms become opacity-only.
- Contrast: body text ≥ 4.5:1, `--muted` on `--surface` ≥ 4.5:1 in both themes
  (the current `--muted` on `--canvas` fails in light mode at 12px).
- Focus: 2px `--accent` ring with 2px offset on every interactive element; the
  ring is never clipped by `overflow: hidden` cards.
- Keyboard: ⌘K palette, `g h` / `g e` / `g s` jumps, `Esc` closes drawers,
  tables arrow-navigable, visible skip-to-content.
- Every status color paired with a word; charts additionally distinguish series
  by dash pattern.

---

## 9. CSS re-architecture (required, not optional)

The visual work cannot land safely on a 28.9k-line load-order-dependent cascade.

1. Introduce `@layer reset, tokens, base, components, features, overrides;` and
   assign every existing file to a layer. This removes load-order fragility and
   most `!important` in one step.
2. `tokens.css` keeps all literal colors (so `audit:colors` is unchanged) and gains
   the new palette, type and elevation scales.
3. Build `features/shared/ui/*` with co-located CSS modules for the 15 primitives
   in §5. New screens use only those.
4. Retire by replacement, in this order: `nordic.css` (override layer, 1.6k) →
   `components.css` (7.5k) → per-domain stylesheets, each deleted when its
   workspace moves to the §6.2 template.
5. Guard each step with the existing `e2e/tools/style-snapshot.mjs` diff, plus
   `pnpm --filter @arkiwatch/web check`.

Target: under 6k lines of CSS total, no `!important` outside `overrides`.

---

## 10. Staged plan

| Stage | Scope | Risk | Visible outcome |
| --- | --- | --- | --- |
| 0 | CSS layers + new tokens (palette, type, radius, shadow), Inter swap | low | Whole app reskinned; layout unchanged |
| 1 | `AppShell`, `SideNav` (new IA), `ContextBar`, `ModePill`; delete demo banner, duplicate timestamps, top-bar language/theme | medium | New navigation and scope model everywhere |
| 2 | `Card`, `MetricTile`, `StatusBadge`, `DataTable`, `ChartFrame`, `EmptyState`, `EvidencePopover` | low | Primitive library in place |
| 3 | Home (merged Today/Signals) + `Your day` page | high | Flow F1/F3 fixed |
| 4 | Domain workspace template applied to Weather → Air → Energy → Mobility → Water, deleting each bespoke stylesheet | medium | Nine pages become one page |
| 5 | Events rebuild, `Sources & health` page | medium | Worst surface fixed |
| 6 | Mobile layouts, bottom sheet scope, header overlap fix | medium | Phone becomes usable |
| 7 | Assistant dock (non-modal), "Ask about this", citation highlight, ⌘K palette | low | Flow F5 |
| 8 | Settings, Login, About/Privacy restyle; delete remaining legacy CSS | low | Consistency closed |

Each stage ends green on `pnpm --filter @arkiwatch/web check` and the Playwright
suite, with a style-snapshot diff reviewed. Existing tests that assert removed
copy (demo banner text, "Snapshot checked", nav labels) are updated with the
stage that removes them.

---

## 11. Open questions

1. **Default landing** — Home-merged is proposed; `docs/product-scope.md` argues
   Data-first. The merge keeps data first *and* surfaces the decision, but it
   contradicts the "do not duplicate full summaries" boundary in a way worth a
   deliberate decision.
2. **Inter vs keeping Manrope** — Inter is the recommendation; keeping Manrope
   saves a font swap and some brand continuity on `/about`.
3. **Accent blue vs retaining violet** — blue reads as infrastructure, violet as
   consumer AI. The assistant could keep violet as its own accent.
4. **Mascot** — the Zoro brand mark is noted as unresolved for open-sourcing; the
   new brand plane works with a wordmark alone if the mark is dropped.
