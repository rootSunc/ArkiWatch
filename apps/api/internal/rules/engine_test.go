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

func TestBuildFormatsFloatsWithoutExponent(t *testing.T) {
	user := User{Timezone: "Europe/Helsinki", CaresWeather: true}
	event := Event{EventType: "rain_risk", Severity: "LOW", StartsAt: time.Now(), EndsAt: time.Now().Add(time.Hour), Attributes: map[string]any{"peak_precip_mm": 0.0000125}}
	draft, _ := Build(event, user, 720)
	if strings.Contains(draft.Body, "e-") || !strings.Contains(draft.Body, "0.0000125") {
		t.Fatalf("unexpected float rendering: %s", draft.Body)
	}
}
