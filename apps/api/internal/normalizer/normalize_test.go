package normalizer

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
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
