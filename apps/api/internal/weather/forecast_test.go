package weather

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestBuildReturnsEmptyStatusWithoutOutlook(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	forecast := Build(observations.WeatherData{}, scope, now)

	if forecast.Status != "empty" {
		t.Fatalf("expected empty status, got %q", forecast.Status)
	}
	if len(forecast.Points) != 0 || len(forecast.Metrics) != 0 || len(forecast.RainWindows) != 0 {
		t.Fatalf("expected an empty forecast to carry no points/metrics/rain windows: %#v", forecast)
	}
	for _, layer := range forecast.SourceLayers {
		if layer.Status != "not_collected" {
			t.Fatalf("expected every source layer to be not_collected, got %+v", layer)
		}
	}
}

func TestBuildComputesMetricsAndFiltersToScopeWindow(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	targetDate := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(&targetDate, now, "UTC")
	if err != nil {
		t.Fatal(err)
	}

	inWindow1 := targetDate.Add(2 * time.Hour)
	inWindow2 := targetDate.Add(14 * time.Hour)
	outsideWindow := targetDate.Add(-2 * time.Hour) // previous day, before the window starts

	outlook := &observations.NormalizedEvent{
		SourceCode:  "fmi",
		LocationRef: "helsinki",
		Summary:     "Partly cloudy",
		StartsAt:    targetDate,
		EndsAt:      targetDate.AddDate(0, 0, 1),
		Attributes: map[string]any{
			"generated_at": timescope.Format(now),
			"forecast_points": []any{
				forecastPointPayload(inWindow1, 2.5, 9.0, 4.0),
				forecastPointPayload(inWindow2, -1.0, 3.0, 12.5),
				forecastPointPayload(outsideWindow, 99.0, 99.0, 99.0),
			},
		},
	}
	rain := &observations.NormalizedEvent{
		Attributes: map[string]any{
			"rain_windows": []any{
				rainWindowPayload(inWindow1, inWindow1.Add(time.Hour), inWindow1, 3.2, 3.2, 1),
				rainWindowPayload(outsideWindow, outsideWindow.Add(time.Hour), outsideWindow, 50, 50, 1),
			},
		},
	}
	data := observations.WeatherData{
		Outlook: outlook,
		Rain:    rain,
		Raw: map[string]observations.RawObservation{
			"weather_forecast_raw": {Dataset: "weather_forecast_raw", ObservedAt: now, Payload: map[string]any{"request_url": "https://opendata.fmi.fi/wfs", "content_type": "text/xml"}},
		},
	}

	forecast := Build(data, scope, now)

	if forecast.Status != "ready" {
		t.Fatalf("expected ready status, got %q: %#v", forecast.Status, forecast)
	}
	if len(forecast.Points) != 2 {
		t.Fatalf("expected the point outside the scope window to be excluded, got %d points", len(forecast.Points))
	}
	if len(forecast.RainWindows) != 1 {
		t.Fatalf("expected the rain window outside the scope window to be excluded, got %d", len(forecast.RainWindows))
	}

	tempMetric := findMetric(forecast.Metrics, "temperature_range")
	if tempMetric == nil || tempMetric.Value != "-1.0 to 2.5" {
		t.Fatalf("unexpected temperature range metric: %#v", tempMetric)
	}
	windMetric := findMetric(forecast.Metrics, "peak_wind")
	if windMetric == nil || windMetric.Value != "12.5" {
		t.Fatalf("unexpected peak wind metric: %#v", windMetric)
	}
	if forecast.SourceRequests[0].Status != "fetched" {
		t.Fatalf("expected the forecast source request to be fetched: %+v", forecast.SourceRequests[0])
	}
}

func TestBuildMarksLiveScopeStaleWhenNoRecentData(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	outlook := &observations.NormalizedEvent{
		SourceCode: "fmi",
		StartsAt:   now.Add(-48 * time.Hour),
		EndsAt:     now.Add(-24 * time.Hour),
		Attributes: map[string]any{"forecast_points": []any{}},
	}
	data := observations.WeatherData{
		Outlook: outlook,
		Raw: map[string]observations.RawObservation{
			"weather_forecast_raw": {Dataset: "weather_forecast_raw", ObservedAt: now.Add(-48 * time.Hour)},
		},
	}

	forecast := Build(data, scope, now)

	if forecast.Status != "stale" {
		t.Fatalf("expected a live scope with an expired outlook and no recent raw data to be stale, got %q", forecast.Status)
	}
}

func TestQualityFromPointsReportsMissingFieldsAndShortHorizon(t *testing.T) {
	base := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)
	points := []ForecastPoint{
		{Timestamp: timescope.Format(base), TemperatureC: ptrFloat(1), WindSpeedMS: ptrFloat(2)},
		{Timestamp: timescope.Format(base.Add(time.Hour)), TemperatureC: ptrFloat(2), WindSpeedMS: ptrFloat(3)},
	}

	quality := qualityFromPoints(points, nil)

	if quality.PointCount != 2 {
		t.Fatalf("expected point count 2, got %d", quality.PointCount)
	}
	if quality.ForecastHours != 2 {
		t.Fatalf("expected a 2-hour horizon spanning the two points, got %d", quality.ForecastHours)
	}
	if !containsString(quality.MissingFields, "humidity") {
		t.Fatalf("expected humidity to be reported as a fully missing field: %#v", quality.MissingFields)
	}
	if !containsSubstring(quality.Notes, "shorter than 24 hours") {
		t.Fatalf("expected a short-horizon note: %#v", quality.Notes)
	}
}

func TestParseWarningsExtractsSeverityAndSkipsRemoved(t *testing.T) {
	body := `<rss><channel>
		<item><title>Removed: Wind warning for Uusimaa</title><description>d</description><link>l</link><pubDate>p</pubDate></item>
		<item><title>Orange wind warning for Uusimaa</title><description>Strong gusts expected.</description><link>https://alerts.fmi.fi/1</link><pubDate>Sun, 12 Apr 2026 06:00:00 GMT</pubDate></item>
		<item><title>General notice</title><description></description><link></link><pubDate></pubDate></item>
	</channel></rss>`
	raw := observations.RawObservation{Dataset: "weather_warnings_cap", ObservedAt: time.Now(), Payload: map[string]any{"body": body}}

	warnings := parseWarnings(raw)

	if len(warnings) != 2 {
		t.Fatalf("expected the removed warning to be skipped, got %d warnings: %#v", len(warnings), warnings)
	}
	if warnings[0].Title != "Orange wind warning for Uusimaa" {
		t.Fatalf("unexpected first warning: %#v", warnings[0])
	}
	if warnings[0].Severity == nil || *warnings[0].Severity != "orange" {
		t.Fatalf("expected orange severity from the title, got %#v", warnings[0].Severity)
	}
	if warnings[1].Severity != nil {
		t.Fatalf("expected no severity keyword match for a plain notice, got %#v", warnings[1].Severity)
	}
	if warnings[1].Description != nil {
		t.Fatalf("expected a blank description to become nil, got %#v", warnings[1].Description)
	}
}

func TestParseWarningsCapsAtSixItems(t *testing.T) {
	var body strings.Builder
	body.WriteString("<rss><channel>")
	for i := 0; i < 10; i++ {
		fmt.Fprintf(&body, "<item><title>Yellow warning %d</title><description>d</description><link>l</link><pubDate>p</pubDate></item>", i)
	}
	body.WriteString("</channel></rss>")
	raw := observations.RawObservation{Dataset: "weather_warnings_cap", ObservedAt: time.Now(), Payload: map[string]any{"body": body.String()}}

	warnings := parseWarnings(raw)

	if len(warnings) != 6 {
		t.Fatalf("expected warnings capped at 6, got %d", len(warnings))
	}
}

func forecastPointPayload(ts time.Time, temperatureC, precipitationMM, windSpeedMS float64) map[string]any {
	return map[string]any{
		"timestamp":        timescope.Format(ts),
		"temperature_c":    temperatureC,
		"precipitation_mm": precipitationMM,
		"wind_speed_ms":    windSpeedMS,
	}
}

func rainWindowPayload(startsAt, endsAt, peakAt time.Time, peakPrecipMM, totalPrecipMM float64, hours int) map[string]any {
	return map[string]any{
		"starts_at":       timescope.Format(startsAt),
		"ends_at":         timescope.Format(endsAt),
		"peak_precip_at":  timescope.Format(peakAt),
		"peak_precip_mm":  peakPrecipMM,
		"total_precip_mm": totalPrecipMM,
		"hours":           hours,
	}
}

func findMetric(metrics []Metric, key string) *Metric {
	for i := range metrics {
		if metrics[i].Key == key {
			return &metrics[i]
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func containsSubstring(values []string, substr string) bool {
	for _, value := range values {
		if strings.Contains(value, substr) {
			return true
		}
	}
	return false
}

func ptrFloat(value float64) *float64 { return &value }
