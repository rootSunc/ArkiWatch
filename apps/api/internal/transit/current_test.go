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
