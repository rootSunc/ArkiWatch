<p align="center">
  <img src="apps/web/public/brand/logo-mark.png" alt="ArkiWatch logo" width="72">
</p>

<h1 align="center">ArkiWatch</h1>

<p align="center">
  <strong>Public data. Practical decisions.</strong><br>
  A calm, open-source daily assistant for weather, air, mobility, energy, and city signals.
</p>

<p align="center">
  <a href="https://github.com/rootSunc/ArkiWatch/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rootSunc/ArkiWatch/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0-only" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg"></a>
  <img alt="Status: active development" src="https://img.shields.io/badge/status-active%20development-2ea44f">
  <img alt="Demo: zero credentials" src="https://img.shields.io/badge/demo-zero%20credentials-7c3aed">
</p>

<p align="center">
  <a href="#try-the-demo">Try the demo</a> ·
  <a href="#see-the-product">See the product</a> ·
  <a href="#run-the-live-stack">Run locally</a>
</p>

> ArkiWatch brings scattered public signals into one practical daily workspace — while keeping scope, freshness, provenance, and evidence visible.

## Contents

- [Why ArkiWatch](#why-arkiwatch)
- [Try the demo](#try-the-demo)
- [See the product](#see-the-product)
- [Data you can inspect](#data-you-can-inspect)
- [Architecture](#architecture)
- [Run the live stack](#run-the-live-stack)
- [Repository map](#repository-map)
- [Development](#development)
- [Project status](#project-status)
- [Privacy and license](#privacy-and-license)

## Why ArkiWatch

Everyday decisions are often spread across weather pages, transit alerts, air-quality maps, energy prices, and municipal websites. ArkiWatch connects those signals and makes the resulting guidance explainable.

| For | What ArkiWatch provides |
| --- | --- |
| **People** | A short daily brief, plan-aware context, commute and outdoor signals, energy timing, and an assistant-style explainer. |
| **Curious citizens** | Source health, timestamps, coverage boundaries, events, metrics, and evidence links instead of a black box. |
| **Builders** | Isolated collectors, normalized records, recommendation rules, city packs, tests, and stable API contracts. |

The project is currently focused on Finland, with Helsinki and nearby city packs as the most complete product context. It is pre-release software under active development.

## Try the demo

The deterministic demo is the fastest way to understand the product. It needs no PostgreSQL, API keys, or external services.

```bash
corepack enable
pnpm install
pnpm demo
```

Open [http://localhost:3000](http://localhost:3000), then explore:

1. **Today** — see the most useful decision first.
2. **Data** — inspect the source, scope, freshness, and evidence behind it.
3. **Assistant** — ask a practical question and follow the answer back to the relevant workspace.
4. **About** — open [/about](http://localhost:3000/about) for the product story and city coverage matrix.

The demo is a reproducible Helsinki / Uusimaa snapshot. It is clearly labelled as fixture data and never presented as a live observation. Connect the API to use live public feeds.

## See the product

ArkiWatch has two complementary workspaces: one helps people decide, and the other helps them verify.

| Workspace | Designed for | What stays visible |
| --- | --- | --- |
| **Today / life assistant** | Deciding what to do next | One lead recommendation, a compact plan, relevant context, and assistant access. |
| **Data / public observatory** | Checking whether a decision is justified | Signal summary, source health, city/date scope, events, metrics, and evidence. |

The interface starts quiet and opens detail on demand. That separation is deliberate: guidance should be useful in seconds, while public data remains inspectable in full.

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="apps/web/public/screenshots/today-workspace-en.jpg">
        <img src="apps/web/public/screenshots/today-workspace-en.jpg" alt="ArkiWatch Today workspace in English showing a daily recommendation, timeline, and signal summary" width="100%">
      </a><br>
      <strong>Today</strong><br>
      <sub>The decision-first daily workspace.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="apps/web/public/screenshots/data-platform-overview-en.jpg">
        <img src="apps/web/public/screenshots/data-platform-overview-en.jpg" alt="ArkiWatch Data workspace in English showing signal categories, events, source health, and evidence cards" width="100%">
      </a><br>
      <strong>Data observatory</strong><br>
      <sub>Source health, scope, and evidence at a glance.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="apps/web/public/screenshots/assistant-chat-en.jpg">
        <img src="apps/web/public/screenshots/assistant-chat-en.jpg" alt="ArkiWatch English assistant explaining a daily decision with citations" width="100%">
      </a><br>
      <strong>Assistant</strong><br>
      <sub>Grounded explanations linked back to the data.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="apps/web/public/screenshots/weather-workspace-en.jpg">
        <img src="apps/web/public/screenshots/weather-workspace-en.jpg" alt="ArkiWatch English weather workspace with current conditions and evidence cards" width="100%">
      </a><br>
      <strong>Signal workspaces</strong><br>
      <sub>Detailed weather and category-level context.</sub>
    </td>
  </tr>
</table>

<p align="center"><em>All screenshots are from the English deterministic Helsinki demo snapshot.</em></p>

## Data you can inspect

ArkiWatch currently connects public signals from FMI, HSY, Open-Meteo, Digitransit / HSL, Digitraffic, Fingrid, SYKE, Helsinki Service Map, Helsinki Linked Events, and electricity-price APIs. See the [data-source and provenance notes](docs/data-sources.md) for provider boundaries and operational assumptions.

The product keeps several distinctions explicit:

- **Scope:** city, regional, national, and provider-defined observations stay labelled.
- **Freshness:** healthy, stale, empty, failing, inactive, and pending sources are separate states.
- **Provenance:** recommendations retain source, fetch time, validity, and evidence where available.
- **Demo semantics:** deterministic fixtures are labelled as snapshots, never as live data.

### Current city-pack coverage

| Signal | Current scope | Boundary |
| --- | --- | --- |
| Weather | Helsinki, Espoo, Vantaa, Tampere, Turku, Oulu | FMI forecasts and weather-risk signals follow the selected city. |
| Air quality | All six city choices | Open-Meteo provides city readings; HSY station coverage is Helsinki, Espoo, and Vantaa. |
| Transit | HSL / Digitransit focus | Service-alert context, not a nationwide routing guarantee. |
| Water and hydrology | Provider-defined regional coverage | Availability follows configured SYKE station and observation windows. |
| City services | Helsinki Service Map | Provider-led Helsinki coverage. |
| Public events | Helsinki and Espoo | Linked Events endpoints are configured independently by city. |
| Energy and road / rail | National or provider-defined regions | Selecting a city does not imply city-specific observations. |

The machine-readable coverage contract is available at `GET /api/platform/coverage`. The data-quality probe is available at `GET /api/health/data-quality`.

## Architecture

The data path is intentionally explicit: provider adapters isolate external APIs, raw records preserve fetch metadata, and normalized products feed both guidance and inspectable workspaces.

<p align="center">
  <img src="docs/architecture-overview.jpg" alt="ArkiWatch system architecture: public providers, collector adapters, raw records, normalized events, rules, Go serving layer, Today and Data workspaces, optional Telegram and assistant channels" width="100%">
</p>


### Main technologies

| Layer | Technology |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, `next-intl` |
| API | Go, `pgx`, explicit PostgreSQL repositories |
| Data | PostgreSQL, Go-owned schema lifecycle, normalized events and snapshots |
| Jobs | Collectors, normalization pipeline, rules, scheduler, backfill, and dispatch runners |
| Quality | `go vet`, `go test`, Vitest, Playwright, accessibility smoke tests |
| Operations | Docker, health checks, structured logs, request IDs, metrics, and optional OpenTelemetry |

## Run the live stack

Use this path when you want real provider data and the full backend.

### Requirements

- Node.js 20+
- Corepack with pnpm
- Go 1.25+
- PostgreSQL

### Setup

```bash
corepack enable
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

createdb arkiwatch
# Go commands load apps/api/.env automatically when run from the repository root.
pnpm run migrate:api
pnpm run bootstrap:api
pnpm dev
```

Local surfaces:

| Surface | URL |
| --- | --- |
| Web app | [http://localhost:3000](http://localhost:3000) |
| Product overview | [http://localhost:3000/about](http://localhost:3000/about) |
| API root | [http://localhost:8000/api](http://localhost:8000/api) |
| Health | [http://localhost:8000/api/health](http://localhost:8000/api/health) |


Start from the two `.env.example` files. Do not commit `.env` files, tokens, provider credentials, production data, or personal information. The full local-stack notes are in [docs/development.md](docs/development.md).

## Repository map

```text
.
├── apps/api
│   ├── cmd               # Go API, bootstrap, collector, normalizer, scheduler
│   ├── internal           # HTTP handlers, repositories, collectors, pipeline, rules, dispatch
│   ├── .env.example       # Local Go API configuration template
│   └── go.mod
├── contracts
│   └── openapi.json        # Static API contract used to generate frontend types
├── apps/web
│   ├── src               # Next.js App Router, workspaces, assistant, API client
│   ├── public             # Brand assets, product screenshots, and web metadata
│   └── package.json
├── docs                  # Development, data-source, and UI system notes
├── deploy                # Docker, VPS deployment, operations scripts, and runbooks
├── .github               # CI, dependency automation, and issue templates
└── package.json          # Workspace commands
```

## Development

Common commands from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm demo` | Start the zero-credential deterministic product tour. |
| `pnpm dev` | Start the Go API and Next.js together. |
| `pnpm run dev:api` | Start the Go API only. |
| `pnpm run migrate:api` | Apply the Go-owned, idempotent PostgreSQL schema lifecycle. |
| `pnpm run bootstrap:api` | Ensure Go schema, admin, source, rule, and scheduler metadata is present. |
| `pnpm run build:web` | Build the Next.js app. |
| `pnpm run contracts:check` | Check OpenAPI and generated frontend types for drift. |
| `pnpm run contracts:check:live` | Boot the Go API and recursively verify live responses against the OpenAPI contract. |
| `pnpm run audit:api` | Run `govulncheck` against the Go module graph. |
| `pnpm check` | Run the main backend and frontend quality gates. |
| `pnpm run test:e2e` | Run browser and accessibility smoke tests against the demo. |

The one-shot live pipeline is explicit:

```bash
pnpm run dev:collector -- all
pnpm run dev:normalize -- -hours 24
pnpm run dev:scheduler -- --once
```

For focused work, use `pnpm run test:api`, `pnpm run test:web`, `pnpm run lint:api`, `pnpm run lint:web`, or `pnpm run typecheck:web`. Database and API contract changes must update the Go schema reconciler, OpenAPI contract, generated frontend types, and focused tests.

The production backend and schema lifecycle are owned by `apps/api`. The production image contains only Go API/worker/migration binaries plus the minimal runtime image. The static API contract lives in `contracts/openapi.json`.

## Project status

ArkiWatch is pre-release software under active development. The main product paths and engineering foundations are in place, but provider availability, geographic coverage, external API limits, and UI details can change.

The project is currently focused on:

- strengthening provider-backed coverage for the six existing city packs;
- improving grounded recommendations and evidence presentation;
- expanding Finnish city coverage and community-contributed collectors;
- keeping demo, historical, and live data semantics visibly separate.

The optional self-hosting recipe in [`deploy/`](deploy/README.md) is not required for the demo or normal development.

## Privacy and license

- Read [PRIVACY.md](PRIVACY.md) for the project’s data boundary and handling notes.
- ArkiWatch is licensed under the [GNU Affero General Public License v3.0](LICENSE).

If the project is useful to you, a [GitHub star](https://github.com/rootSunc/ArkiWatch) helps other builders discover it.
