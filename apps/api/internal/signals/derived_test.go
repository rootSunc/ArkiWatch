package signals

import (
	"strings"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

func ptr[T any](value T) *T { return &value }

func TestWarningRankPrefersSeverityThenTitle(t *testing.T) {
	cases := []struct {
		name     string
		warning  weather.Warning
		expected int
	}{
		{"red severity", weather.Warning{Title: "Wind", Severity: ptr("Red")}, 3},
		{"orange severity", weather.Warning{Title: "Wind", Severity: ptr("ORANGE")}, 2},
		{"yellow severity", weather.Warning{Title: "Wind", Severity: ptr("yellow")}, 1},
		{"severity beats title", weather.Warning{Title: "Extreme heat", Severity: ptr("yellow")}, 1},
		{"extreme title", weather.Warning{Title: "Extreme heat"}, 3},
		{"severe title", weather.Warning{Title: "Severe thunderstorms"}, 2},
		{"advisory title", weather.Warning{Title: "Wind advisory"}, 1},
		{"no signal", weather.Warning{Title: "Forecast update"}, 0},
	}
	for _, c := range cases {
		if got := warningRank(c.warning); got != c.expected {
			t.Errorf("%s: rank %d, want %d", c.name, got, c.expected)
		}
	}
}

func TestWarningRelevantByRankScopeAndCity(t *testing.T) {
	cases := []struct {
		name     string
		warning  weather.Warning
		city     string
		expected bool
	}{
		{"orange anywhere", weather.Warning{Title: "Storm in Lapland", Severity: ptr("orange")}, "helsinki", true},
		{"nationwide low rank", weather.Warning{Title: "Frost", Description: ptr("Applies to all land areas.")}, "oulu", true},
		{"yellow without city", weather.Warning{Title: "Wind", Severity: ptr("yellow")}, "", true},
		{"no rank without city", weather.Warning{Title: "Forecast update"}, "", false},
		{"yellow elsewhere", weather.Warning{Title: "Wind in Tampere", Severity: ptr("yellow")}, "helsinki", false},
		{"yellow capital region", weather.Warning{Title: "Wind", Description: ptr("Uusimaa coast"), Severity: ptr("yellow")}, "espoo", true},
		{"uusimaa is not tampere", weather.Warning{Title: "Wind", Description: ptr("Uusimaa coast"), Severity: ptr("yellow")}, "tampere", false},
		{"yellow neighbouring city", weather.Warning{Title: "Rain in Vantaa", Severity: ptr("yellow")}, "helsinki", true},
	}
	for _, c := range cases {
		if got := warningRelevant(c.warning, c.city); got != c.expected {
			t.Errorf("%s: relevant %v, want %v", c.name, got, c.expected)
		}
	}
}

func TestWeatherEventsKeepsTopTwoRelevantWarnings(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	forecast := weather.Forecast{
		// Warnings are official notices: they survive an unavailable forecast.
		Status:    "unavailable",
		CheckedAt: "2026-08-09T05:00:00Z",
		Warnings: []weather.Warning{
			{Title: "Wind", Description: ptr("Uusimaa"), Severity: ptr("yellow")},
			{Title: "Flooding", Severity: ptr("red"), Link: ptr("https://example.test/red")},
			{Title: "Storm", Severity: ptr("orange")},
			{Title: "Wind in Oulu", Severity: ptr("yellow")},
		},
	}
	got := WeatherEvents(&forecast, "helsinki", now)
	if len(got) != 2 || got[0].Title != "Flooding" || got[1].Title != "Storm" {
		t.Fatalf("expected red then orange warning, got %+v", got)
	}
	for _, event := range got {
		if event.Severity != "HIGH" || event.EventType != "weather_warning" || event.CategoryKey != "weather" {
			t.Fatalf("unexpected warning shape: %+v", event)
		}
		if event.Body != "Official weather warning from FMI." {
			t.Fatalf("missing description must use the default body, got %q", event.Body)
		}
	}
	checked := ParseTime(forecast.CheckedAt)
	if got[0].StartsAt != timescope.Format(checked) || got[0].EndsAt != timescope.Format(checked.Add(48*time.Hour)) {
		t.Fatalf("warning window should fall back to checked_at + 48h, got %s..%s", got[0].StartsAt, got[0].EndsAt)
	}
	prefix := StableID("weather_warning", "helsinki", timescope.Format(checked)) + "-"
	if !strings.HasPrefix(got[0].ID, prefix) || len(got[0].ID) != len(prefix)+12 {
		t.Fatalf("warning ID should be the stable ID plus a 6-byte content hash, got %q", got[0].ID)
	}
	if got[0].ID == got[1].ID {
		t.Fatal("distinct warnings with the same start must not share an ID")
	}
}

func TestWeatherEventsMapsWarningRankToSeverity(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	forecast := weather.Forecast{
		Status:    "unavailable",
		TimeScope: map[string]any{"reference_time": "2026-08-09T04:00:00Z"},
		ValidTo:   ptr("2026-08-10T00:00:00Z"),
		Warnings: []weather.Warning{
			{Title: "Wind", Description: ptr("Helsinki shoreline"), Severity: ptr("yellow"), PublishedAt: ptr("2026-08-09T03:30:00Z")},
		},
	}
	got := WeatherEvents(&forecast, "helsinki", now)
	if len(got) != 1 || got[0].Severity != "MEDIUM" || got[0].Body != "Helsinki shoreline" {
		t.Fatalf("yellow warning should be MEDIUM with its description, got %+v", got)
	}
	if got[0].StartsAt != timescope.Format(ParseTime("2026-08-09T03:30:00Z")) || got[0].EndsAt != timescope.Format(ParseTime("2026-08-10T00:00:00Z")) {
		t.Fatalf("warning window should use published_at and valid_to, got %s..%s", got[0].StartsAt, got[0].EndsAt)
	}

	forecast.Warnings = []weather.Warning{{Title: "Frost", Description: ptr("Whole country")}}
	got = WeatherEvents(&forecast, "helsinki", now)
	if len(got) != 1 || got[0].Severity != "LOW" {
		t.Fatalf("unranked nationwide warning should be LOW, got %+v", got)
	}
	if WeatherEvents(nil, "helsinki", now) == nil {
		t.Fatal("nil forecast must return an empty, non-nil slice")
	}
}

func TestWeatherEventsDerivesHeavyRain(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	forecast := weather.Forecast{
		Status:    "ready",
		CheckedAt: now.Format(time.RFC3339),
		RainWindows: []weather.RainWindow{
			{StartsAt: "2026-08-09T08:00:00Z", EndsAt: "2026-08-09T11:00:00Z", PeakPrecipMM: 2, TotalPrecipMM: 16, Hours: 3},
		},
	}
	got := WeatherEvents(&forecast, "helsinki", now)
	if len(got) != 1 || got[0].EventType != "heavy_rain" || got[0].Severity != "MEDIUM" {
		t.Fatalf("15mm+ total should derive a MEDIUM heavy-rain advisory, got %+v", got)
	}
	if got[0].Attributes["total_precip_mm"] != 16. || got[0].Attributes["peak_precip_mm"] != 2. {
		t.Fatalf("rain attributes missing: %+v", got[0].Attributes)
	}

	forecast.RainWindows[0].TotalPrecipMM = 30
	if got := WeatherEvents(&forecast, "helsinki", now); len(got) != 1 || got[0].Severity != "HIGH" {
		t.Fatalf("30mm+ total should be HIGH, got %+v", got)
	}
}

func TestAirEventsThresholdsAndDefaults(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	for _, current := range []*airquality.Current{
		nil,
		{Status: "ready"},
		{Status: "ready", WorstScore: ptr(3)},
		{Status: "failed", WorstScore: ptr(5)},
	} {
		if got := AirEvents(current, "helsinki", now); len(got) != 0 {
			t.Fatalf("no advisory expected for %+v, got %+v", current, got)
		}
	}

	poor := airquality.Current{Status: "ready", WorstScore: ptr(4), ObservedAt: ptr("2026-08-09T05:00:00Z")}
	got := AirEvents(&poor, "helsinki", now)
	if len(got) != 1 {
		t.Fatalf("score 4 should produce one advisory, got %+v", got)
	}
	event := got[0]
	if event.CategoryKey != "air" || event.Severity != "MEDIUM" || event.Title != "Poor air quality detected" {
		t.Fatalf("unexpected poor-air advisory: %+v", event)
	}
	if event.SourceCodes[0] != "hsy" || !strings.HasPrefix(event.Body, "the worst reporting station is reporting poor") {
		t.Fatalf("missing source and station should use defaults: %+v", event)
	}
	observed := ParseTime("2026-08-09T05:00:00Z")
	if event.StartsAt != timescope.Format(observed) || event.EndsAt != timescope.Format(observed.Add(3*time.Hour)) {
		t.Fatalf("air window should run 3h from observed_at, got %s..%s", event.StartsAt, event.EndsAt)
	}

	veryPoor := airquality.Current{Status: "ready", WorstScore: ptr(5), WorstStation: ptr("Mannerheimintie"), SourceCode: "openmeteo", TimeScope: map[string]any{"reference_time": "2026-08-09T04:00:00Z"}}
	got = AirEvents(&veryPoor, "helsinki", now)
	if len(got) != 1 || got[0].Severity != "HIGH" || got[0].Title != "Very poor air quality detected" || got[0].SourceCodes[0] != "openmeteo" {
		t.Fatalf("unexpected very-poor advisory: %+v", got)
	}
	if got[0].StartsAt != timescope.Format(ParseTime("2026-08-09T04:00:00Z")) || !strings.HasPrefix(got[0].Body, "Mannerheimintie") {
		t.Fatalf("very-poor advisory should use reference time and station: %+v", got[0])
	}
}
