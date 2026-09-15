package signals

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

// These inputs and expected selections were captured from the pre-migration
// TypeScript tests, before deleting the browser implementation.
func TestCurationMigrationFixtures(t *testing.T) {
	var cases []struct {
		Args   []json.RawMessage `json:"args"`
		Now    int64             `json:"now"`
		Result []platform.Event  `json:"result"`
	}
	b, err := os.ReadFile("testdata/curation.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		var events []platform.Event
		if err := json.Unmarshal(c.Args[0], &events); err != nil {
			t.Fatal(err)
		}
		limit := 6
		if len(c.Args) > 1 {
			json.Unmarshal(c.Args[1], &limit)
		}
		var options struct{ City, ReferenceAt string }
		if len(c.Args) > 2 {
			json.Unmarshal(c.Args[2], &options)
		}
		now := time.UnixMilli(c.Now)
		if parsed := ParseTime(options.ReferenceAt); !parsed.IsZero() {
			now = parsed
		}
		got := Curate(events, limit, options.City, now)
		ids := func(items []platform.Event) []string {
			out := []string{}
			for _, e := range items {
				out = append(out, e.ID)
			}
			return out
		}
		if !reflect.DeepEqual(ids(got), ids(c.Result)) {
			t.Errorf("case %d: got %v want %v", i, ids(got), ids(c.Result))
		}
	}
}
func TestCriticalPriorityAndCategoryDiversity(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	events := []platform.Event{}
	for _, level := range []string{"LOW", "MEDIUM", "HIGH", "CRITICAL"} {
		events = append(events, platform.Event{ID: level, CategoryKey: "weather", EventType: "weather_warning", Title: level, Severity: level, StartsAt: "2026-08-09T05:00:00Z", EndsAt: "2026-08-09T07:00:00Z"})
	}
	got := Curate(events, 6, "helsinki", now)
	if len(got) != 2 || got[0].ID != "CRITICAL" || got[1].ID != "HIGH" {
		t.Fatalf("selection: %+v", got)
	}
	if len(Curate(events, 0, "helsinki", now)) != 0 {
		t.Fatal("zero limit must be empty")
	}
}
func TestDerivedThresholdsAndStableIdentity(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	gust := 14.
	visibility := 999.
	w := weather.Forecast{Status: "ready", CheckedAt: now.Format(time.RFC3339), Points: []weather.ForecastPoint{{Timestamp: now.Format(time.RFC3339), WindGustMS: &gust, VisibilityM: &visibility}}}
	got := WeatherEvents(&w, "helsinki", now)
	if len(got) != 2 || got[0].Severity != "MEDIUM" || got[1].Severity != "HIGH" {
		t.Fatalf("thresholds: %+v", got)
	}
	other := WeatherEvents(&w, "tampere", now)
	if got[0].ID == other[0].ID {
		t.Fatal("city must be part of identity")
	}
	gust = 13.9
	visibility = 5000
	if len(WeatherEvents(&w, "helsinki", now)) != 0 {
		t.Fatal("below thresholds")
	}
	score := 5
	a := airquality.Current{Status: "empty", WorstScore: &score}
	if len(AirEvents(&a, "helsinki", now)) != 0 {
		t.Fatal("empty response must not generate advisory")
	}
}
