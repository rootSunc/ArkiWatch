package transit

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestBuildTransitCurrentSortsActiveAlertsAndCountsScopes(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	scope := timescope.Scope{Mode: "live", Timezone: "Europe/Helsinki", ReferenceTime: now}
	events := []observations.NormalizedEvent{
		{ID: "delay", EventType: "transit_delay", Severity: "MEDIUM", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Title: "Delay", Summary: "Delayed", Attributes: map[string]any{"route_ids": []any{"7"}}},
		{ID: "info", EventType: "transit_disruption", Severity: "INFO", StartsAt: now.Add(time.Hour), EndsAt: now.Add(2 * time.Hour), Title: "Later", Summary: "Later", Attributes: map[string]any{}},
	}
	result := Build(observations.TransitData{Raw: observations.RawObservation{ObservedAt: now, Payload: map[string]any{"body": []any{map[string]any{"id": "a"}}}}, Events: events}, scope, now, "helsinki")
	if result.Status != "ready" || len(result.Alerts) != 2 || result.Alerts[0].ID != "delay" || result.Quality.ActiveAlertCount != 1 || result.Quality.RouteAlertCount != 1 {
		t.Fatalf("result = %#v", result)
	}
}

func TestBuildTransitReadsNormalizedGraphQLRouteAndStopEntitiesAndAlertEffect(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	scope := timescope.Scope{Mode: "live", Timezone: "Europe/Helsinki", ReferenceTime: now}
	events := []observations.NormalizedEvent{{
		ID: "hsl-9", EventType: "transit_disruption", Severity: "HIGH",
		StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Title: "Tram 9 diverted", Summary: "Diverted via Kallio",
		Attributes: map[string]any{
			"alert_id": "HSL:1",
			"effect":   "DETOUR",
			"routes":   []any{map[string]any{"name": "9", "gtfs_id": "HSL:1009", "mode": "TRAM"}},
			"stops":    []any{map[string]any{"name": "Kallion virastotalo", "gtfs_id": "HSL:1174"}},
		},
	}}
	raw := observations.RawObservation{
		ObservedAt: now,
		Payload: map[string]any{"body": map[string]any{"data": map[string]any{"alerts": []any{map[string]any{
			"id":                   "HSL:1",
			"alertHeaderText":      "Tram 9 diverted",
			"alertDescriptionText": "Diverted via Kallio",
			"alertEffect":          "DETOUR",
			"effectiveStartDate":   float64(now.Add(-time.Hour).Unix()),
		}}}}},
	}

	result := Build(observations.TransitData{Raw: raw, Events: events}, scope, now, "espoo")
	if result.Quality.RouteAlertCount != 1 || result.Quality.StopAlertCount != 1 {
		t.Fatalf("expected route and stop counts to read normalized GraphQL entities, got %+v", result.Quality)
	}
	if len(result.Alerts) != 1 || len(result.Alerts[0].RouteIDs) != 1 || result.Alerts[0].RouteIDs[0] != "9" || len(result.Alerts[0].StopIDs) != 1 || result.Alerts[0].StopIDs[0] != "Kallion virastotalo" {
		t.Fatalf("unexpected alert route/stop IDs: %+v", result.Alerts)
	}
	if result.Quality.FieldCoveragePct != 100 {
		t.Fatalf("expected alertEffect + epoch effectiveStartDate to yield 100%% coverage, got %v", result.Quality.FieldCoveragePct)
	}
}

func TestBuildTransitTreatsFetchedZeroAlertsAsReadyRatherThanEmpty(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	scope := timescope.Scope{Mode: "live", Timezone: "Europe/Helsinki", ReferenceTime: now}

	calm := Build(observations.TransitData{
		Raw: observations.RawObservation{
			Dataset:    "service_alerts",
			ObservedAt: now.Add(-2 * time.Minute),
			Payload:    map[string]any{"body": map[string]any{"data": map[string]any{"alerts": []any{}}}},
		},
	}, scope, now, "helsinki")
	if calm.Status != "ready" {
		t.Fatalf("expected a fresh zero-alert HSL collection to be ready, got %q", calm.Status)
	}
	if len(calm.Quality.MissingFields) != 0 || calm.Quality.FieldCoveragePct != 100 {
		t.Fatalf("expected zero missing fields on a healthy calm feed, got %+v", calm.Quality)
	}

	uncollected := Build(observations.TransitData{}, scope, now, "helsinki")
	if uncollected.Status != "empty" {
		t.Fatalf("expected an uncollected feed to remain empty, got %q", uncollected.Status)
	}
}
