package publicrules

import (
	"sort"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
)

type Draft struct {
	DedupeKey, EventID, ScenarioKey, RecommendationKind, AreaScope, Severity, FreshnessState string
	Priority                                                                                 int
	Title, Body                                                                              string
	Evidence                                                                                 []string
	Confidence                                                                               *float64
	ValidFrom, ValidTo                                                                       time.Time
}

var scenarios = map[string]string{
	"transit_delay": "COMMUTE", "transit_disruption": "COMMUTE", "road_disruption": "COMMUTE", "road_weather_risk": "COMMUTE",
	"rain_risk": "OUTDOOR", "weather_outlook": "OUTDOOR", "air_quality_poor": "HOME_AIR", "air_quality_status": "HOME_AIR", "cheap_energy_window": "ENERGY",
}

func Build(events []observations.NormalizedEvent, sourceStatuses map[string]string, now time.Time) []Draft {
	base := []Draft{}
	for _, event := range events {
		scenario, ok := scenarios[event.EventType]
		if !ok || event.EndsAt.Before(now) {
			continue
		}
		priority := map[string]int{"HIGH": 95, "MEDIUM": 70, "LOW": 45, "INFO": 25}[event.Severity]
		freshness := "FRESH"
		if sourceStatuses[event.SourceCode] != "healthy" && sourceStatuses[event.SourceCode] != "" {
			freshness = "DEGRADED"
		}
		evidence := []string{event.Summary}
		if freshness == "DEGRADED" {
			evidence = append([]string{"Source data is delayed or unavailable: recommendation uses the latest available source."}, evidence...)
		}
		title := event.Title
		if headline, ok := event.Attributes["headline"].(string); ok && headline != "" {
			title = headline
		}
		base = append(base, Draft{DedupeKey: event.ID + ":" + stringscenario(scenario) + ":SCENARIO_CARD", EventID: event.ID, ScenarioKey: scenario, RecommendationKind: "SCENARIO_CARD", AreaScope: areaScope(scenario), Severity: event.Severity, FreshnessState: freshness, Priority: priority, Title: title, Body: event.Summary, Evidence: evidence, Confidence: eventConfidence(event), ValidFrom: event.StartsAt, ValidTo: event.EndsAt})
	}
	sort.SliceStable(base, func(i, j int) bool {
		if base[i].Priority != base[j].Priority {
			return base[i].Priority > base[j].Priority
		}
		return base[i].ValidFrom.Before(base[j].ValidFrom)
	})
	result := append([]Draft{}, base...)
	for _, draft := range base {
		if len(result)-len(base) >= 3 {
			break
		}
		top := draft
		top.RecommendationKind = "TOP_ACTION"
		top.DedupeKey = top.EventID + ":" + stringscenario(top.ScenarioKey) + ":TOP_ACTION"
		result = append(result, top)
	}
	for _, draft := range base {
		if draft.Priority < 70 {
			continue
		}
		broadcast := draft
		broadcast.RecommendationKind = "BROADCAST"
		broadcast.DedupeKey = broadcast.EventID + ":" + stringscenario(broadcast.ScenarioKey) + ":BROADCAST"
		result = append(result, broadcast)
	}
	return result
}

func stringscenario(value string) string { return value }
func areaScope(scenario string) string {
	if scenario == "COMMUTE" || scenario == "HOME_AIR" {
		return "HELSINKI_METRO"
	}
	return "HELSINKI_UUSIMAA"
}
func eventConfidence(event observations.NormalizedEvent) *float64 { return nil }
