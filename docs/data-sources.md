# Data sources

ArkiWatch adapts public feeds; it is not the authority for any of them.
Everything is fetched server-side except map tiles.

## Providers

| Area | Provider | Endpoint | Licence | Key needed |
| --- | --- | --- | --- | --- |
| Weather | FMI | `opendata.fmi.fi` | CC BY 4.0 | no |
| Air quality | HSY | `kartta.hsy.fi` WFS | CC BY 4.0 | no |
| Air quality | Open-Meteo | `air-quality-api.open-meteo.com` | CC BY 4.0; free tier **non-commercial** | no |
| Transit | Digitransit / HSL | `api.digitransit.fi` | CC BY 4.0 (OSM parts ODbL) | yes |
| Road & rail | Fintraffic Digitraffic | `tie.digitraffic.fi` | CC BY 4.0 | no |
| Energy | Fingrid | `data.fingrid.fi/api` | CC BY 4.0 | yes, rate limited |
| Energy price | Pörssisähkö | `api.porssisahko.net` | **no published licence** | no |
| Water & snow | SYKE | `rajapinnat.ymparisto.fi` | CC BY 4.0 | no |
| City services | Helsinki Service Map | `hel.fi/palvelukarttaws` | CC BY 4.0 | no |
| Events | Linked Events (Helsinki, Espoo) | `api.hel.fi`, `api.espoo.fi` | CC BY 4.0 (images may differ) | no |
| Map tiles | OpenStreetMap | `tile.openstreetmap.org` (browser) | ODbL; OSMF tile policy | no |

Terms change. Re-check each provider before deploying or adding a city.
Endpoints are set in [`apps/api/.env.example`](../apps/api/.env.example); the
adapter list is [`collectors/registry.go`](../apps/api/internal/collectors/registry.go).

## Coverage

Each city has a static capability per signal in
[`coverage.go`](../apps/api/internal/platform/coverage.go), served at
`GET /api/platform/coverage`. `supported` means an adapter exists, not that a
deployment has keys or fresh data; check `/api/health/data-quality` for that.

- HSY air stations are regional; Open-Meteo is the city-level fallback.
- Energy and road/rail are national: choosing a city doesn't make them local.
- Tampere, Turku, and Oulu get regional-only recommendations.
- Without a Digitransit key, the transit collector fails loudly instead of
  reporting zero alerts.

## Attribution

CC BY 4.0 requires credit. The UI shows provider and fetch time next to each
reading; a public deployment should also carry:

- Source: Finnish Meteorological Institute, CC BY 4.0
- Source: Fintraffic / digitraffic.fi, CC BY 4.0
- Source: Fingrid / data.fingrid.fi, CC BY 4.0
- © Digitransit / HSL, CC BY 4.0
- Source: HSY, SYKE, City of Helsinki, City of Espoo, CC BY 4.0
- Weather and air-quality data by Open-Meteo, CC BY 4.0
- © OpenStreetMap contributors, ODbL

## Commercial use

The default configuration is not ready for commercial use. The AGPL code licence
doesn't change provider terms.

| Provider | Fix before commercial use |
| --- | --- |
| Open-Meteo | Paid plan or another endpoint via `OPEN_METEO_AIR_QUALITY_URL` |
| Pörssisähkö | Written permission or another source via `ELECTRICITY_PRICE_API_URL` |
| OSM tiles | Own/commercial tile server (URL is hard-coded in `coordinate-map.tsx`) |
| Digitransit, Fingrid | Confirm key terms cover your volume |

There is no per-collector on/off flag: repoint the endpoint, drop the id from
`INITIAL_BACKFILL_SOURCES`, or edit `registry.go`.
