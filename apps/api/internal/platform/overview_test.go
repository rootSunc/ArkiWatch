package platform

import (
	"fmt"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestSourceStatusDerivesHealthFromLastRun(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	recent := now.Add(-5 * time.Minute).Format(time.RFC3339Nano)
	old := now.Add(-30 * time.Minute).Format(time.RFC3339Nano)

	cases := map[string]struct {
		item sources.Status
		want string
	}{
		"inactive source reports inactive regardless of runs": {
			item: sources.Status{IsActive: false},
			want: "inactive",
		},
		"active source with no run yet is pending": {
			item: sources.Status{IsActive: true, PollIntervalSeconds: 600},
			want: "pending",
		},
		"a non-succeeded last run is failing": {
			item: sources.Status{IsActive: true, PollIntervalSeconds: 600, LastRun: &sources.CollectorRun{Status: "failed", StartedAt: recent}},
			want: "failing",
		},
		"a succeeded run finished within 2x the poll interval is healthy": {
			item: sources.Status{IsActive: true, PollIntervalSeconds: 600, LastRun: &sources.CollectorRun{Status: "succeeded", FinishedAt: &recent}},
			want: "healthy",
		},
		"a succeeded run finished beyond 2x the poll interval is stale": {
			item: sources.Status{IsActive: true, PollIntervalSeconds: 600, LastRun: &sources.CollectorRun{Status: "succeeded", FinishedAt: &old}},
			want: "stale",
		},
		"a still-running succeeded run falls back to StartedAt": {
			item: sources.Status{IsActive: true, PollIntervalSeconds: 600, LastRun: &sources.CollectorRun{Status: "succeeded", StartedAt: recent, FinishedAt: nil}},
			want: "healthy",
		},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			if got := sourceStatus(testCase.item, now); got != testCase.want {
				t.Fatalf("sourceStatus() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestCategoryStatusPrioritizesSeverityThenStageThenSourceHealth(t *testing.T) {
	connected := categoryDefinition{Key: "weather", Stage: "connected"}
	background := categoryDefinition{Key: "geospatial", Stage: "background"}

	if got := categoryStatus(connected, []Event{{Severity: "HIGH"}}, []Source{{OperationalStatus: "healthy"}}, 0); got != "alert" {
		t.Fatalf("expected a HIGH severity event to win over a healthy source, got %q", got)
	}
	if got := categoryStatus(connected, []Event{{Severity: "LOW"}}, nil, 0); got != "watch" {
		t.Fatalf("expected a LOW severity event to report watch, got %q", got)
	}
	if got := categoryStatus(background, nil, nil, 0); got != "background" {
		t.Fatalf("expected a non-connected stage with no events to report its own stage, got %q", got)
	}
	if got := categoryStatus(connected, nil, []Source{{OperationalStatus: "failing"}}, 0); got != "failing" {
		t.Fatalf("expected a failing source to be reported even with zero events, got %q", got)
	}
	if got := categoryStatus(connected, nil, []Source{{OperationalStatus: "healthy"}}, 0); got != "empty" {
		t.Fatalf("expected no events, no raw data, and a healthy source to report empty, got %q", got)
	}
	if got := categoryStatus(connected, nil, []Source{{OperationalStatus: "healthy"}}, 5); got != "healthy" {
		t.Fatalf("expected raw observations without events to still report healthy, got %q", got)
	}
}

func weatherEvent(id, locationRef string, at time.Time) observations.NormalizedEvent {
	return observations.NormalizedEvent{
		ID: id, EventType: "weather_outlook", SourceCode: "fmi", Severity: "INFO",
		LocationRef: locationRef, StartsAt: at, EndsAt: at.Add(time.Hour), Title: "Forecast",
	}
}

func TestBuildOverviewFiltersEventsByCategoryAndCityScope(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()

	helsinkiWeather := weatherEvent("w1", "helsinki", now)
	espooWeather := weatherEvent("w2", "espoo", now)
	energyEvent := observations.NormalizedEvent{
		ID: "e1", EventType: "cheap_energy_window", SourceCode: "porssisahko", Severity: "INFO",
		LocationRef: "espoo", StartsAt: now, EndsAt: now.Add(time.Hour), Title: "Cheap window",
	}
	unmatchedEvent := observations.NormalizedEvent{ID: "u1", EventType: "not_a_real_type", SourceCode: "fmi", StartsAt: now, EndsAt: now}

	data := PlatformData{Events: []observations.NormalizedEvent{helsinkiWeather, espooWeather, energyEvent, unmatchedEvent}}

	overview := BuildOverview(data, scope, cfg, nil, "helsinki")

	if overview.AppName != cfg.AppName || overview.Timezone != cfg.Timezone {
		t.Fatalf("expected the overview to echo app config, got %+v", overview)
	}

	var weatherCategory, energyCategory *Category
	for i := range overview.Categories {
		switch overview.Categories[i].Key {
		case "weather":
			weatherCategory = &overview.Categories[i]
		case "energy":
			energyCategory = &overview.Categories[i]
		}
	}
	if weatherCategory == nil || energyCategory == nil {
		t.Fatalf("expected weather and energy categories to be present")
	}

	if len(weatherCategory.Events) != 1 || weatherCategory.Events[0].ID != "w1" {
		t.Fatalf("expected weather (city-scoped) to keep only the Helsinki event, got %+v", weatherCategory.Events)
	}
	if len(energyCategory.Events) != 1 || energyCategory.Events[0].ID != "e1" {
		t.Fatalf("expected energy (not city-scoped) to keep its event despite the espoo location, got %+v", energyCategory.Events)
	}
}

func TestBuildOverviewTruncatesRecentEventsToTwelveSortedByStart(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	events := make([]observations.NormalizedEvent, 0, 15)
	for i := 0; i < 15; i++ {
		// Descending start times, so a correct ascending sort must reverse them.
		events = append(events, weatherEvent(fmt.Sprintf("w%d", i), "helsinki", now.Add(time.Duration(15-i)*time.Hour)))
	}
	data := PlatformData{Events: events}

	overview := BuildOverview(data, scope, config.DefaultConfig(), nil, "helsinki")

	if len(overview.RecentEvents) != 12 {
		t.Fatalf("expected recent events capped at 12, got %d", len(overview.RecentEvents))
	}
	for i := 1; i < len(overview.RecentEvents); i++ {
		if overview.RecentEvents[i-1].StartsAt > overview.RecentEvents[i].StartsAt {
			t.Fatalf("expected recent events sorted ascending by start time: %v then %v", overview.RecentEvents[i-1].StartsAt, overview.RecentEvents[i].StartsAt)
		}
	}
}
