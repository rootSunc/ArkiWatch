package normalizer

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

func observation(source, dataset string, payload map[string]any) collectors.Observation {
	return collectors.Observation{Dataset: dataset, AreaCode: "helsinki", ObservedAt: time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC), Payload: payload, Hash: "abc123"}
}

func TestNormalizeHSYChoosesWorstStationAndSeverity(t *testing.T) {
	items := Normalize(observation("hsy", "air_quality_current", map[string]any{
		"body": map[string]any{"features": []any{
			map[string]any{"properties": map[string]any{"name": "Central", "quality": "good"}},
			map[string]any{"properties": map[string]any{"name": "Roadside", "quality": "poor"}},
		}},
	}), "hsy")
	if len(items) != 1 || items[0].EventType != "air_quality_poor" || items[0].Severity != "MEDIUM" {
		t.Fatalf("items = %#v", items)
	}
	if items[0].Attributes["worst_station"] != "Roadside" {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

// HSY publishes Ilmanlaatuindeksi as an open-ended point scale, so its cleanest
// readings are single digits. Those must band as good air, not be mistaken for
// the 1-5 band vocabulary and reported as a health warning.
func TestNormalizeHSYBandsLowNumericIndexAsGoodAir(t *testing.T) {
	items := Normalize(observation("hsy", "air_quality_current", map[string]any{
		"body": map[string]any{"features": []any{
			map[string]any{"properties": map[string]any{"Mittausasema": "Kallio", "Ilmanlaatuindeksi": 4.0}},
			map[string]any{"properties": map[string]any{"Mittausasema": "Roadside", "Ilmanlaatuindeksi": 31.0}},
		}},
	}), "hsy")
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].EventType != "air_quality_status" || items[0].Severity != "INFO" {
		t.Fatalf("event = %s severity = %s", items[0].EventType, items[0].Severity)
	}
	if items[0].Attributes["worst_label"] != "good" {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

func TestNormalizeHSYBandsHighNumericIndexAsPoorAir(t *testing.T) {
	items := Normalize(observation("hsy", "air_quality_current", map[string]any{
		"body": map[string]any{"features": []any{
			map[string]any{"properties": map[string]any{"Mittausasema": "Roadside", "Ilmanlaatuindeksi": 120.0}},
		}},
	}), "hsy")
	if len(items) != 1 || items[0].EventType != "air_quality_poor" {
		t.Fatalf("items = %#v", items)
	}
	if items[0].Attributes["worst_label"] != "poor" {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

func TestNormalizeOpenMeteoUsesEuropeanAQIBands(t *testing.T) {
	cases := []struct {
		aqi       float64
		wantScore int
		wantLabel string
		wantType  string
		wantSev   string
	}{
		{aqi: 15, wantScore: 1, wantLabel: "good", wantType: "air_quality_status", wantSev: "INFO"},
		{aqi: 32, wantScore: 2, wantLabel: "fair", wantType: "air_quality_status", wantSev: "INFO"},
		{aqi: 48, wantScore: 3, wantLabel: "moderate", wantType: "air_quality_status", wantSev: "LOW"},
		{aqi: 68, wantScore: 4, wantLabel: "poor", wantType: "air_quality_poor", wantSev: "MEDIUM"},
		{aqi: 88, wantScore: 5, wantLabel: "very poor", wantType: "air_quality_poor", wantSev: "HIGH"},
	}
	for _, tc := range cases {
		items := Normalize(observation("open_meteo_air", "air_quality_current", map[string]any{
			"place": "Tampere",
			"body":  map[string]any{"current": map[string]any{"european_aqi": tc.aqi, "pm2_5": 18.0}},
		}), "open_meteo_air")
		if len(items) != 1 {
			t.Fatalf("aqi=%v items = %#v", tc.aqi, items)
		}
		got := items[0]
		if got.EventType != tc.wantType || got.Severity != tc.wantSev || got.Attributes["worst_score"] != tc.wantScore || got.Attributes["worst_label"] != tc.wantLabel {
			t.Fatalf("aqi=%v got type=%s sev=%s attrs=%#v", tc.aqi, got.EventType, got.Severity, got.Attributes)
		}
	}
}

func TestNormalizeFMIReadsXMLForecastAndRainRisk(t *testing.T) {
	xml := `<root xmlns:xlink="http://www.w3.org/1999/xlink">
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=temperature"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>18</value></MeasurementTVP><MeasurementTVP><time>2026-08-21T13:00:00Z</time><value>19</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=precipitation1h"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>1.2</value></MeasurementTVP></result></PointTimeSeriesObservation>
</root>`
	items := Normalize(observation("fmi", "weather_forecast_raw", map[string]any{"body": map[string]any{"raw": xml}, "place": "Helsinki"}), "fmi")
	if len(items) != 2 || items[0].EventType != "weather_outlook" || items[1].EventType != "rain_risk" {
		t.Fatalf("items = %#v", items)
	}
	if items[1].Severity != "MEDIUM" {
		t.Fatalf("rain severity = %s", items[1].Severity)
	}
}

// The weather workspace charts an hourly series, so the normalizer has to emit
// forecast_points; without it the read model degrades to a one-line summary.
func TestNormalizeFMIEmitsMergedHourlyForecastPoints(t *testing.T) {
	xml := `<root xmlns:xlink="http://www.w3.org/1999/xlink">
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=temperature"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>18</value></MeasurementTVP><MeasurementTVP><time>2026-08-21T13:00:00Z</time><value>19</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=dewpoint"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>11</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=winddirection"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>230</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=smartsymbol"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>62</value></MeasurementTVP></result></PointTimeSeriesObservation>
</root>`
	items := Normalize(observation("fmi", "weather_forecast_raw", map[string]any{"body": map[string]any{"raw": xml}, "place": "Helsinki"}), "fmi")
	if len(items) != 1 || items[0].EventType != "weather_outlook" {
		t.Fatalf("items = %#v", items)
	}
	points, ok := items[0].Attributes["forecast_points"].([]any)
	if !ok || len(points) != 2 {
		t.Fatalf("forecast_points = %#v", items[0].Attributes["forecast_points"])
	}
	first, ok := points[0].(map[string]any)
	if !ok {
		t.Fatalf("point = %#v", points[0])
	}
	if first["timestamp"] != "2026-08-21T12:00:00Z" {
		t.Fatalf("timestamp = %#v", first["timestamp"])
	}
	// The four parameters arrive as four separate MeasurementTVPs and must land
	// on one merged point, or the chart shows a column per parameter.
	for key, want := range map[string]float64{"temperature_c": 18, "dew_point_c": 11, "wind_direction_deg": 230} {
		if first[key] != want {
			t.Fatalf("%s = %#v, want %v", key, first[key], want)
		}
	}
	if first["smart_symbol"] != 62 {
		t.Fatalf("smart_symbol = %#v", first["smart_symbol"])
	}
	// An absent parameter is omitted rather than sent as a zero reading.
	if _, present := first["pressure_hpa"]; present {
		t.Fatalf("pressure should be absent: %#v", first)
	}
}

// Two showers separated by a dry afternoon are two windows, not one hull that
// hides the gap.
func TestNormalizeFMISplitsRainIntoContiguousWindows(t *testing.T) {
	xml := `<root xmlns:xlink="http://www.w3.org/1999/xlink">
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=temperature"/><result><MeasurementTVP><time>2026-08-21T07:00:00Z</time><value>15</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=precipitation1h"/><result>` +
		`<MeasurementTVP><time>2026-08-21T07:00:00Z</time><value>1.2</value></MeasurementTVP>` +
		`<MeasurementTVP><time>2026-08-21T08:00:00Z</time><value>0.4</value></MeasurementTVP>` +
		`<MeasurementTVP><time>2026-08-21T20:00:00Z</time><value>0.3</value></MeasurementTVP>` +
		`</result></PointTimeSeriesObservation>
</root>`
	items := Normalize(observation("fmi", "weather_forecast_raw", map[string]any{"body": map[string]any{"raw": xml}, "place": "Helsinki"}), "fmi")
	var rain *Draft
	for index := range items {
		if items[index].EventType == "rain_risk" {
			rain = &items[index]
		}
	}
	if rain == nil {
		t.Fatalf("items = %#v", items)
	}
	windows, ok := rain.Attributes["rain_windows"].([]any)
	if !ok || len(windows) != 2 {
		t.Fatalf("rain_windows = %#v", rain.Attributes["rain_windows"])
	}
	morning := windows[0].(map[string]any)
	if morning["starts_at"] != "2026-08-21T07:00:00Z" || morning["ends_at"] != "2026-08-21T09:00:00Z" {
		t.Fatalf("morning window = %#v", morning)
	}
	if morning["hours"] != 2 || morning["peak_precip_mm"] != 1.2 {
		t.Fatalf("morning window = %#v", morning)
	}
	evening := windows[1].(map[string]any)
	if evening["starts_at"] != "2026-08-21T20:00:00Z" || evening["hours"] != 1 {
		t.Fatalf("evening window = %#v", evening)
	}
}

func TestNormalizeEnergyCreatesCheapWindow(t *testing.T) {
	start := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	prices := []any{}
	for index, price := range []float64{10, 2, 2, 2, 12} {
		at := start.Add(time.Duration(index) * time.Hour)
		prices = append(prices, map[string]any{"startTime": at.Format(time.RFC3339), "value": price})
	}
	items := Normalize(observation("fingrid", "energy_timeseries", map[string]any{"body": map[string]any{"data": prices}}), "fingrid")
	if len(items) != 1 || items[0].EventType != "cheap_energy_window" {
		t.Fatalf("items = %#v", items)
	}
	if items[0].Attributes["window_point_count"] != 3.0 && items[0].Attributes["window_point_count"] != 3 {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

func TestNormalizeEnergyKeepsUnitAndSourceForAdviceCopy(t *testing.T) {
	start := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	prices := []any{}
	for index, price := range []float64{10, 2, 2, 2, 12} {
		at := start.Add(time.Duration(index) * time.Hour)
		prices = append(prices, map[string]any{"startTime": at.Format(time.RFC3339), "price": price})
	}
	item := observation("porssisahko", "energy_price_timeseries", map[string]any{"unit": "c/kWh", "body": map[string]any{"prices": prices}})
	items := Normalize(item, "porssisahko")
	if len(items) != 1 || items[0].Attributes["unit"] != "c/kWh" || items[0].Attributes["source"] != "porssisahko" {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

func TestNormalizeDigitransitUsesStableAlertID(t *testing.T) {
	items := Normalize(observation("digitransit", "service_alerts", map[string]any{"body": map[string]any{"alerts": []any{map[string]any{"id": "alert-1", "title": "Delay on route 7", "description": "Delayed service"}}}}), "digitransit")
	if len(items) != 1 || items[0].DedupeKey != "digitransit:alert-1" || items[0].EventType != "transit_delay" {
		t.Fatalf("items = %#v", items)
	}
}

func TestNormalizeSYKECreatesHydrologyStatus(t *testing.T) {
	item := observation("syke", "hydrology", map[string]any{
		"body": map[string]any{"value": []any{
			map[string]any{"Aika": "2026-08-20T12:00:00Z", "Arvo": 42.0},
			map[string]any{"Aika": "2026-08-20T13:00:00Z", "Arvo": 45.0},
		}},
		"parameter": "water_level",
		"unit":      "cm",
	})
	items := Normalize(item, "syke")
	if len(items) != 1 || items[0].EventType != "hydrology_status" || items[0].LocationRef != "helsinki" {
		t.Fatalf("items = %#v", items)
	}
	if items[0].Attributes["maximum_value"] != 45.0 {
		t.Fatalf("attributes = %#v", items[0].Attributes)
	}
}

// End-to-end guard for the joint that was broken: the FMI normalizer has to emit
// forecast_points in exactly the shape the weather read model parses back out of
// jsonb, or the workspace silently degrades to summary_only in every deployment.
func TestNormalizeFMIForecastPointsSurviveJSONIntoWeatherReadModel(t *testing.T) {
	at := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	xml := `<root xmlns:xlink="http://www.w3.org/1999/xlink">
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=temperature"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>18</value></MeasurementTVP><MeasurementTVP><time>2026-08-21T13:00:00Z</time><value>19</value></MeasurementTVP></result></PointTimeSeriesObservation>
<PointTimeSeriesObservation><observedProperty xlink:href="https://example.test?param=smartsymbol"/><result><MeasurementTVP><time>2026-08-21T12:00:00Z</time><value>62</value></MeasurementTVP></result></PointTimeSeriesObservation>
</root>`
	items := Normalize(observation("fmi", "weather_forecast_raw", map[string]any{"body": map[string]any{"raw": xml}, "place": "Helsinki"}), "fmi")
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}

	encoded, err := json.Marshal(items[0].Attributes)
	if err != nil {
		t.Fatal(err)
	}
	var attributes map[string]any
	if err := json.Unmarshal(encoded, &attributes); err != nil {
		t.Fatal(err)
	}

	now := at.Add(time.Hour)
	scope, err := timescope.Build(nil, now, "UTC")
	if err != nil {
		t.Fatal(err)
	}
	forecast := weather.Build(observations.WeatherData{Outlook: &observations.NormalizedEvent{
		SourceCode: "fmi", LocationRef: "helsinki", StartsAt: at, EndsAt: at.Add(time.Hour),
		Attributes: attributes,
	}}, scope, now)

	if forecast.Status == "summary_only" {
		t.Fatalf("forecast degraded to summary_only: %#v", forecast)
	}
	if len(forecast.Points) != 2 {
		t.Fatalf("points = %#v", forecast.Points)
	}
	if forecast.Points[0].TemperatureC == nil || *forecast.Points[0].TemperatureC != 18 {
		t.Fatalf("temperature = %#v", forecast.Points[0].TemperatureC)
	}
	if forecast.Points[0].SmartSymbol == nil || *forecast.Points[0].SmartSymbol != 62 {
		t.Fatalf("smart symbol = %#v", forecast.Points[0].SmartSymbol)
	}
}

// The Digitransit GraphQL response is the shape the collector now stores:
// epoch-second validity, an operator-declared severity, and the routes the
// alert is attached to.
func TestNormalizeDigitransitReadsGraphQLAlertShape(t *testing.T) {
	start := time.Date(2026, 8, 21, 6, 0, 0, 0, time.UTC)
	end := start.Add(4 * time.Hour)
	items := Normalize(observation("digitransit", "service_alerts", map[string]any{
		"body": map[string]any{"data": map[string]any{"alerts": []any{
			map[string]any{
				"id": "HSL:1", "alertHeaderText": "Raitiolinja 9 poikkeusreitillä",
				"alertDescriptionText": "Tram 9 runs a diverted route.",
				"alertSeverityLevel":   "SEVERE", "alertEffect": "DETOUR", "alertCause": "CONSTRUCTION",
				"effectiveStartDate": float64(start.Unix()), "effectiveEndDate": float64(end.Unix()),
				"entities": []any{
					map[string]any{"__typename": "Route", "gtfsId": "HSL:1009", "shortName": "9", "mode": "TRAM"},
					map[string]any{"__typename": "Stop", "gtfsId": "HSL:1174", "name": "Kallion virastotalo"},
				},
			},
		}}},
	}), "digitransit")
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	draft := items[0]
	// The operator graded this SEVERE; keyword matching on Finnish text would
	// have found nothing and fallen through to LOW.
	if draft.Severity != "HIGH" {
		t.Fatalf("severity = %s", draft.Severity)
	}
	if !draft.StartsAt.Equal(start) || !draft.EndsAt.Equal(end) {
		t.Fatalf("window = %s..%s", draft.StartsAt, draft.EndsAt)
	}
	routes, ok := draft.Attributes["routes"].([]any)
	if !ok || len(routes) != 1 {
		t.Fatalf("routes = %#v", draft.Attributes["routes"])
	}
	route := routes[0].(map[string]any)
	if route["name"] != "9" || route["gtfs_id"] != "HSL:1009" || route["mode"] != "TRAM" {
		t.Fatalf("route = %#v", route)
	}
	stops, ok := draft.Attributes["stops"].([]any)
	if !ok || len(stops) != 1 || stops[0].(map[string]any)["name"] != "Kallion virastotalo" {
		t.Fatalf("stops = %#v", draft.Attributes["stops"])
	}
	if draft.Attributes["effect"] != "DETOUR" || draft.Attributes["cause"] != "CONSTRUCTION" {
		t.Fatalf("attributes = %#v", draft.Attributes)
	}
}

func TestNormalizeDigitransitClassifiesSignificantDelaysAsDelay(t *testing.T) {
	items := Normalize(observation("digitransit", "service_alerts", map[string]any{
		"body": map[string]any{"data": map[string]any{"alerts": []any{
			map[string]any{"id": "HSL:2", "alertHeaderText": "Metro myöhässä", "alertDescriptionText": "Ruuhkaa.", "alertEffect": "SIGNIFICANT_DELAYS"},
		}}},
	}), "digitransit")
	if len(items) != 1 || items[0].EventType != "transit_delay" || items[0].Severity != "MEDIUM" {
		t.Fatalf("items = %#v", items)
	}
}
