package publicrules

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
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
		if !ok || event.EndsAt.Before(now) || !eventAppliesToUusimaa(event) {
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

var uusimaaRefs = map[string]bool{
	"helsinki":         true,
	"espoo":            true,
	"vantaa":           true,
	"kauniainen":       true,
	"uusimaa":          true,
	"helsinki_uusimaa": true,
	"helsinki_metro":   true,
}

var uusimaaTrafficTerms = []string{
	"helsinki", "espoo", "vantaa", "kauniainen", "kirkkonummi", "kerava", "tuusula", "sipoo", "uusimaa",
	"kehä i", "keha i", "kehä iii", "keha iii", "ring i", "ring iii",
	"länsiväylä", "lansivayla", "tuusulanväylä", "tuusulanvayla",
	"lahdenväylä", "lahdenvayla", "turunväylä", "turunvayla",
	"porvoonväylä", "porvoonvayla", "hämeenlinnanväylä", "hameenlinnanvayla",
}

// eventAppliesToUusimaa prevents city-scoped events from Tampere, Turku, Oulu,
// or northern Finland road feeds from being stamped as HELSINKI_UUSIMAA public
// recommendations and broadcasts.
func eventAppliesToUusimaa(event observations.NormalizedEvent) bool {
	if event.EventType == "cheap_energy_window" {
		return true
	}
	ref := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(event.LocationRef)), "-", "_")
	if ref == "" || uusimaaRefs[ref] {
		return true
	}
	if ref == "finland" {
		return nationalRoadTouchesUusimaa(event)
	}
	return false
}

func nationalRoadTouchesUusimaa(event observations.NormalizedEvent) bool {
	if raw, err := json.Marshal(event.Attributes["geometry_bbox"]); err == nil {
		var bbox []float64
		if json.Unmarshal(raw, &bbox) == nil && len(bbox) == 4 {
			lat, lon := (bbox[1]+bbox[3])/2, (bbox[0]+bbox[2])/2
			const centerLat, centerLon = 60.22, 24.88
			rad := math.Pi / 180
			dlat, dlon := (lat-centerLat)*rad, (lon-centerLon)*rad
			h := math.Pow(math.Sin(dlat/2), 2) + math.Cos(centerLat*rad)*math.Cos(lat*rad)*math.Pow(math.Sin(dlon/2), 2)
			return 2*6371*math.Asin(math.Min(1, math.Sqrt(h))) <= 45
		}
	}
	haystack := strings.ToLower(event.Title + " " + event.Summary)
	if attrs, err := json.Marshal(event.Attributes); err == nil {
		haystack += " " + strings.ToLower(string(attrs))
	}
	for _, term := range uusimaaTrafficTerms {
		if strings.Contains(haystack, term) {
			return true
		}
	}
	return false
}
