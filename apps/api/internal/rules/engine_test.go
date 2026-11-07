package rules

import (
	"strings"
	"testing"
	"time"
)

func TestBuildWeatherRecommendationRespectsPreference(t *testing.T) {
	event := Event{EventType: "rain_risk", Severity: "MEDIUM", StartsAt: time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC), EndsAt: time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC), Attributes: map[string]any{"peak_precip_mm": 1.2}}
	user := User{Timezone: "Europe/Helsinki", CaresWeather: true}
	draft, ok := Build(event, user, 720)
	if !ok || draft.RuleCode != "R1_RAIN_RISK" || draft.RecommendationType != "WEATHER" || draft.TitleZH == "" {
		t.Fatalf("draft=%#v ok=%v", draft, ok)
	}
	user.CaresWeather = false
	if _, ok := Build(event, user, 720); ok {
		t.Fatal("disabled weather preference generated advice")
	}
}

func TestBuildCommuteRequiresProfile(t *testing.T) {
	event := Event{EventType: "transit_delay", Severity: "HIGH", StartsAt: time.Now(), EndsAt: time.Now().Add(time.Hour), Attributes: map[string]any{}}
	user := User{Timezone: "Europe/Helsinki", CaresCommute: true}
	if _, ok := Build(event, user, 90); ok {
		t.Fatal("missing commute profile generated advice")
	}
	user.HasCommuteProfile = true
	if draft, ok := Build(event, user, 90); !ok || draft.Priority != 98 {
		t.Fatalf("draft=%#v ok=%v", draft, ok)
	}
}

func TestBuildNeverRendersMissingAttributes(t *testing.T) {
	user := User{Timezone: "Europe/Helsinki", CaresWeather: true, CaresAir: true, CaresEnergy: true, CaresCommute: true, HasCommuteProfile: true}
	for _, eventType := range []string{"rain_risk", "weather_outlook", "air_quality_poor", "air_quality_status", "transit_delay", "cheap_energy_window"} {
		event := Event{EventType: eventType, Severity: "MEDIUM", StartsAt: time.Now(), EndsAt: time.Now().Add(time.Hour), Attributes: map[string]any{}}
		draft, ok := Build(event, user, 720)
		if !ok {
			t.Fatalf("%s produced no draft", eventType)
		}
		for _, body := range []string{draft.Body, draft.BodyZH, draft.Title, draft.TitleZH} {
			for _, marker := range []string{"<nil>", "%!", "None", "map["} {
				if strings.Contains(body, marker) {
					t.Fatalf("%s copy leaked %q: %s", eventType, marker, body)
				}
			}
			if strings.TrimSpace(body) == "" {
				t.Fatalf("%s produced empty copy", eventType)
			}
		}
	}
}

func TestBuildUsesAirQualityFallbacks(t *testing.T) {
	user := User{Timezone: "Europe/Helsinki", CaresAir: true}
	event := Event{EventType: "air_quality_status", Severity: "INFO", StartsAt: time.Now(), EndsAt: time.Now().Add(time.Hour), Attributes: map[string]any{}}
	draft, _ := Build(event, user, 720)
	if !strings.Contains(draft.Body, "fair") || !strings.Contains(draft.Body, "network") {
		t.Fatalf("missing status fallbacks: %s", draft.Body)
	}
	event.EventType = "air_quality_poor"
	draft, _ = Build(event, user, 720)
	if !strings.Contains(draft.Body, "poor") || !strings.Contains(draft.Body, "your nearest station") {
		t.Fatalf("missing poor fallbacks: %s", draft.Body)
	}
}

func TestBuildCommuteUsesModeWeekdayAndDeparture(t *testing.T) {
	mondayMorning := time.Date(2026, 8, 24, 5, 15, 0, 0, time.UTC) // 08:15 in Helsinki
	transit := Event{EventType: "transit_delay", Severity: "HIGH", Title: "Tram 9 delayed", StartsAt: mondayMorning, EndsAt: mondayMorning.Add(time.Hour)}
	driver := User{Timezone: "Europe/Helsinki", CaresCommute: true, HasCommuteProfile: true, Commutes: []Commute{ParseCommute("DRIVE", "08:00", []int{1, 2, 3, 4, 5})}}
	if _, ok := Build(transit, driver, 90); ok {
		t.Fatal("a driving commute produced a transit alert")
	}
	rider := driver
	rider.Commutes = []Commute{ParseCommute("TRANSIT", "08:00", []int{1, 2, 3, 4, 5})}
	if _, ok := Build(transit, rider, 90); !ok {
		t.Fatal("weekday transit commute missed an overlapping service alert")
	}
	sunday := transit
	sunday.StartsAt = time.Date(2026, 8, 23, 5, 15, 0, 0, time.UTC)
	sunday.EndsAt = sunday.StartsAt.Add(time.Hour)
	if _, ok := Build(sunday, rider, 90); ok {
		t.Fatal("a weekday commute matched a Sunday alert")
	}
	evening := transit
	evening.StartsAt = time.Date(2026, 8, 24, 15, 0, 0, 0, time.UTC)
	evening.EndsAt = evening.StartsAt.Add(time.Hour)
	if _, ok := Build(evening, rider, 90); ok {
		t.Fatal("an 08:00 commute matched an evening alert")
	}
	road := Event{EventType: "road_disruption", Severity: "MEDIUM", LocationRef: "finland", Title: "Kehä I congestion in Espoo", StartsAt: mondayMorning, EndsAt: mondayMorning.Add(time.Hour)}
	driver.City = "espoo"
	if draft, ok := Build(road, driver, 90); !ok || draft.RuleCode != "R21_ROAD_COMMUTE" {
		t.Fatalf("driving commute missed a local road disruption: %#v %v", draft, ok)
	}
	if _, ok := Build(road, rider, 90); ok {
		t.Fatal("a transit commute produced a road alert")
	}
}

func TestBuildCommuteMatchesNamedRouteAndStop(t *testing.T) {
	mondayMorning := time.Date(2026, 8, 24, 5, 15, 0, 0, time.UTC)
	rider := User{Timezone: "Europe/Helsinki", CaresCommute: true, HasCommuteProfile: true, Commutes: []Commute{ParseCommute("TRANSIT", "08:00", []int{1, 2, 3, 4, 5}).WithTargets([]string{"9"}, []string{"Kallio"})}}
	matched := Event{EventType: "transit_delay", Severity: "HIGH", Title: "Tram 9 delayed", StartsAt: mondayMorning, EndsAt: mondayMorning.Add(time.Hour), Attributes: map[string]any{
		"routes": []any{map[string]any{"name": "9", "gtfs_id": "HSL:1009"}},
		"stops":  []any{map[string]any{"name": "Kallion virastotalo"}},
	}}
	if _, ok := Build(matched, rider, 90); !ok {
		t.Fatal("expected route 9 at Kallio to match the saved commute")
	}
	otherRoute := matched
	otherRoute.Attributes = map[string]any{"routes": []any{map[string]any{"name": "19"}}}
	if _, ok := Build(otherRoute, rider, 90); ok {
		t.Fatal("route 19 matched a commute limited to route 9")
	}
	otherStop := matched
	otherStop.Attributes = map[string]any{
		"routes": []any{map[string]any{"name": "9"}},
		"stops":  []any{map[string]any{"name": "Kamppi"}},
	}
	if _, ok := Build(otherStop, rider, 90); ok {
		t.Fatal("a Kamppi stop matched a Kallio commute")
	}
	network := matched
	network.Attributes = map[string]any{}
	if _, ok := Build(network, rider, 90); !ok {
		t.Fatal("a network-wide alert should still reach a route-specific commute")
	}
}

func TestBuildFormatsFloatsWithoutExponent(t *testing.T) {
	user := User{Timezone: "Europe/Helsinki", CaresWeather: true}
	event := Event{EventType: "rain_risk", Severity: "LOW", StartsAt: time.Now(), EndsAt: time.Now().Add(time.Hour), Attributes: map[string]any{"peak_precip_mm": 0.0000125}}
	draft, _ := Build(event, user, 720)
	if strings.Contains(draft.Body, "e-") || !strings.Contains(draft.Body, "0.0000125") {
		t.Fatalf("unexpected float rendering: %s", draft.Body)
	}
}
