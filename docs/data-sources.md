# Data sources and provenance

ArkiWatch is a provider adapter and decision layer, not the authoritative source
for any public feed. The UI keeps provider name, fetch time, validity, scope, and
evidence links visible where a recommendation depends on them.

## Providers configured in this repository

| Area | Provider | Endpoint configured | Licence | Access |
| --- | --- | --- | --- | --- |
| Weather | Finnish Meteorological Institute (FMI) | `opendata.fmi.fi` | CC BY 4.0 | Open, no key |
| Air quality | HSY | `kartta.hsy.fi` WFS | CC BY 4.0 | Open, no key |
| Air quality | Open-Meteo | `air-quality-api.open-meteo.com` | Data CC BY 4.0; the free API tier is for non-commercial use only | Open, no key |
| Transit | Digitransit / HSL | `api.digitransit.fi` routing GraphQL | CC BY 4.0 (OSM-derived geometry and addresses are ODbL) | Free subscription key required |
| Road and rail | Digitraffic (Fintraffic) | `tie.digitraffic.fi` | CC BY 4.0 | Open, no key |
| Energy | Fingrid open data | `data.fingrid.fi/api` | CC BY 4.0 | API key required, throttled per key |
| Energy | Pörssisähkö | `api.porssisahko.net` | No formal licence published — confirm with the provider before redistributing | Open, no key |
| Hydrology | SYKE | `rajapinnat.ymparisto.fi` Hydrologiarajapinta | CC BY 4.0 | Open, no key |
| City services | Helsinki Service Map | `hel.fi/palvelukarttaws` | CC BY 4.0 | Open, no key |
| Events | Linked Events (Helsinki, Espoo) | `api.hel.fi`, `api.espoo.fi` | CC BY 4.0; individual event images may carry their own rights | Open, no key |
| Map base layer | OpenStreetMap tiles | `tile.openstreetmap.org` | Map data ODbL; tiles subject to the OSMF tile usage policy | Loaded by the browser, no key |

Licence rows record what the providers published when this table was written.
They are configuration, not guarantees: confirm each provider's current terms,
rate limits, and attribution rules before deploying or redistributing a city
pack, and re-check them when you add a city.

## Attribution

CC BY 4.0 requires crediting the source. A deployment that publishes these
signals should carry the provider credits, for example:

- Source: Finnish Meteorological Institute, licence CC BY 4.0
- Source: Fintraffic / digitraffic.fi, licence CC 4.0 BY
- Source: Fingrid / data.fingrid.fi, licence CC 4.0 BY
- © Digitransit / HSL, licence CC BY 4.0
- Source: HSY, SYKE, City of Helsinki, City of Espoo, licence CC BY 4.0
- Weather and air-quality data by Open-Meteo, licence CC BY 4.0
- © OpenStreetMap contributors, map data ODbL

The workspaces already name the provider and fetch time next to each reading;
the credits above are what a public deployment owes the providers on top of that.

## Notes on scope

- City forecasts and air-quality city readings have different coverage semantics.
- HSY station coverage is regional; Open-Meteo is a city-level fallback.
- HSL service alerts need a free `digitransit-subscription-key`; without one the
  collector fails its run rather than reporting zero alerts.
- Digitraffic scope is national and provider-defined.
- Forecast and price products have separate freshness and licensing assumptions.
- SYKE station and observation windows are bounded by configuration.
- The coordinate map is the only feed the browser fetches directly; everything
  else is collected server-side. A public deployment with real traffic should
  move to its own tile source rather than lean on the OSMF tile servers.

The machine-readable coverage contract is available from `GET /api/platform/coverage`.
