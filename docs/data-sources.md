# Data sources and provenance

ArkiWatch is a provider adapter and decision layer, not the authoritative source
for any public feed. The UI keeps provider name, fetch time, validity, scope, and
evidence links visible where a recommendation depends on them.

| Area | Providers configured in the repository | Notes |
| --- | --- | --- |
| Weather | Finnish Meteorological Institute (FMI), Open-Meteo | City forecasts and air-quality city readings have different coverage semantics. |
| Air quality | HSY, Open-Meteo | HSY station coverage is regional; Open-Meteo is a city-level fallback. |
| Transit | Digitransit / HSL | Primarily HSL service-alert and transit context. |
| Road and rail | Digitraffic | Provider-defined national road/rail scope. |
| Energy | Fingrid, Pörssisähkö API | Forecast and price products have separate freshness and licensing assumptions. |
| Hydrology | SYKE | Station and observation windows are bounded by configuration. |
| City services | Helsinki Service Map | Provider-led Helsinki service coverage. |
| Events | Helsinki Linked Events, Espoo events | City endpoints are configured independently. |

The machine-readable coverage contract is available from `GET /api/platform/coverage`.
Provider URLs, polling limits, and credentials are configuration, so operators
should confirm each provider's current terms, rate limits, attribution rules, and
availability before deploying or redistributing a city pack.
