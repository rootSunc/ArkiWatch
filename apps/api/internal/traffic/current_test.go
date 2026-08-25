package traffic

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestBuildReturnsEmptyStatusWithoutData(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	current := Build(Data{}, scope, now, "")

	if current.Status != "empty" {
		t.Fatalf("expected empty status, got %q", current.Status)
	}
	if len(current.Incidents) != 0 || len(current.Corridors) != 0 {
		t.Fatalf("expected no incidents or corridors: %#v", current)
	}
	if *current.Location != "helsinki" {
		t.Fatalf("expected the empty location to fall back to helsinki, got %v", current.Location)
	}
}

func TestBuildProducesSortedIncidentsCorridorsAndMetrics(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	targetDate := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(&targetDate, now, "UTC")
	if err != nil {
		t.Fatal(err)
	}

	active := observations.NormalizedEvent{
		ID: "a", Title: "Lane closed", EventType: "road_disruption", Severity: "HIGH", LocationRef: "road-e18",
		StartsAt: now.Add(-1 * time.Hour), EndsAt: now.Add(2 * time.Hour),
	}
	endedWeatherRisk := observations.NormalizedEvent{
		ID: "b", Title: "Icy road warning", EventType: "road_weather_risk", Severity: "LOW", LocationRef: "road-e18",
		StartsAt: now.Add(-3 * time.Hour), EndsAt: now.Add(-1 * time.Hour),
	}
	upcomingRail := observations.NormalizedEvent{
		ID: "c", Title: "Delay expected", EventType: "rail_delay", Severity: "MEDIUM", LocationRef: "rail_main",
		StartsAt: now.Add(1 * time.Hour), EndsAt: now.Add(3 * time.Hour),
	}

	feature := map[string]any{
		"properties": map[string]any{
			"situationId":   "GUID-1",
			"situationType": "TRAFFIC_ANNOUNCEMENT",
			"releaseTime":   timescope.Format(now),
			"announcements": []any{
				map[string]any{"language": "en", "title": "Lane closed", "location": map[string]any{"description": "E18 Helsinki-Turku"}},
			},
		},
	}
	raw := observations.RawObservation{
		Dataset: "traffic_announcements", ObservedAt: now,
		Payload: map[string]any{"message_type": "traffic_announcements", "request_url": "https://tie.digitraffic.fi", "content_type": "application/json", "body": map[string]any{"features": []any{feature}}},
	}

	data := Data{Raw: []observations.RawObservation{raw}, Events: []observations.NormalizedEvent{endedWeatherRisk, active, upcomingRail}}

	current := Build(data, scope, now, "")

	if current.Status != "ready" {
		t.Fatalf("expected ready status, got %q: %#v", current.Status, current)
	}

	if len(current.Incidents) != 3 {
		t.Fatalf("expected 3 incidents, got %d", len(current.Incidents))
	}
	gotOrder := []string{current.Incidents[0].ID, current.Incidents[1].ID, current.Incidents[2].ID}
	wantOrder := []string{"a", "c", "b"} // active first, then by severity (MEDIUM before LOW) among the inactive rest
	for i := range wantOrder {
		if gotOrder[i] != wantOrder[i] {
			t.Fatalf("unexpected incident order: got %v, want %v", gotOrder, wantOrder)
		}
	}
	if !current.Incidents[0].Active {
		t.Fatalf("expected the currently running event to be marked active: %+v", current.Incidents[0])
	}

	if len(current.Corridors) != 2 {
		t.Fatalf("expected 2 corridor groups, got %d: %#v", len(current.Corridors), current.Corridors)
	}
	roadCorridor := current.Corridors[0]
	if roadCorridor.Key != "road-e18" || roadCorridor.Label != "Road e18" {
		t.Fatalf("expected the busier road-e18 corridor first with a formatted label, got %+v", roadCorridor)
	}
	if roadCorridor.EventCount != 2 || roadCorridor.ActiveEventCount != 1 || roadCorridor.WeatherRiskCount != 1 {
		t.Fatalf("unexpected road corridor counts: %+v", roadCorridor)
	}
	railCorridor := current.Corridors[1]
	if railCorridor.Key != "rail_main" || railCorridor.Label != "Rail Main" {
		t.Fatalf("expected an underscore location ref to title-case into a label, got %+v", railCorridor)
	}

	quality := current.Quality
	if quality.NormalizedEventCount != 3 || quality.ActiveEventCount != 1 || quality.RoadEventCount != 2 || quality.RailEventCount != 1 || quality.WeatherRiskCount != 1 || quality.CorridorCount != 2 {
		t.Fatalf("unexpected quality summary: %+v", quality)
	}
	if quality.FieldCoveragePct != 100 || len(quality.MissingFields) != 0 {
		t.Fatalf("expected full field coverage from the complete feature, got %+v", quality)
	}

	roadWeatherMetric := findMetric(current.Metrics, "road_weather")
	if roadWeatherMetric == nil || roadWeatherMetric.Value != "1" {
		t.Fatalf("unexpected road_weather metric: %#v", roadWeatherMetric)
	}
}

func TestBuildMarksLiveScopeStaleWhenLatestRawIsOld(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	raw := observations.RawObservation{
		Dataset: "traffic_announcements", ObservedAt: now.Add(-7 * time.Hour),
		Payload: map[string]any{"message_type": "traffic_announcements", "body": map[string]any{"features": []any{map[string]any{}}}},
	}

	current := Build(Data{Raw: []observations.RawObservation{raw}}, scope, now, "")

	if current.Status != "stale" {
		t.Fatalf("expected a live scope with data older than 6 hours to be stale, got %q", current.Status)
	}
}

func TestFieldCoverageReportsMissingLabelsForIncompleteFeatures(t *testing.T) {
	incomplete := map[string]any{
		"properties": map[string]any{
			// situationId, situationType, releaseTime, and any announcement are all absent.
		},
	}

	coverage, missing := fieldCoverage([]map[string]any{incomplete})

	if coverage != 0 {
		t.Fatalf("expected zero coverage for a feature with no tracked fields, got %v", coverage)
	}
	for _, label := range []string{"situation id", "situation type", "release time", "title", "location"} {
		if !containsString(missing, label) {
			t.Fatalf("expected %q to be reported missing: %#v", label, missing)
		}
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
