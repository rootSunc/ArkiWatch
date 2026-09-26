package briefing

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/signals"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestMigratedTimelineAndPlan(t *testing.T) {
	for _, name := range []string{"timeline", "plan"} {
		t.Run(name, func(t *testing.T) {
			var cases []struct {
				Args   []json.RawMessage `json:"args"`
				Now    int64             `json:"now"`
				Result []TimelineItem    `json:"result"`
			}
			b, err := os.ReadFile("testdata/" + name + ".json")
			if err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(b, &cases); err != nil {
				t.Fatal(err)
			}
			for i, c := range cases {
				now := time.UnixMilli(c.Now)
				var got []TimelineItem
				if name == "plan" {
					var items []TimelineItem
					json.Unmarshal(c.Args[0], &items)
					if len(c.Args) > 1 {
						var millis int64
						json.Unmarshal(c.Args[1], &millis)
						now = time.UnixMilli(millis)
					}
					var opts struct{ ExcludeScenarioKey string }
					if len(c.Args) > 2 {
						json.Unmarshal(c.Args[2], &opts)
					}
					got = plan(items, opts.ExcludeScenarioKey, now)
				} else {
					var events []platform.Event
					json.Unmarshal(c.Args[0], &events)
					var d Dashboard
					if len(c.Args) > 1 {
						json.Unmarshal(c.Args[1], &d)
					}
					if len(c.Args) > 3 {
						var reference string
						json.Unmarshal(c.Args[3], &reference)
						if parsed := signals.ParseTime(reference); !parsed.IsZero() {
							now = parsed
						}
					}
					got = timeline(events, d, now)
					if len(c.Args) > 2 {
						var limit int
						json.Unmarshal(c.Args[2], &limit)
						if limit < len(got) {
							got = got[:limit]
						}
					}
				}
				project := func(items []TimelineItem) []string {
					out := []string{}
					for _, v := range items {
						out = append(out, v.ID+":"+v.State)
					}
					return out
				}
				if !reflect.DeepEqual(project(got), project(c.Result)) {
					t.Errorf("case %d got %v want %v", i, project(got), project(c.Result))
				}
			}
		})
	}
}
func TestModesExpiryAndExplicitRegion(t *testing.T) {
	now := signals.ParseTime("2026-08-09T06:00:00Z")
	scope, _ := timescope.Build(nil, now, "Europe/Helsinki")
	input := Input{City: "helsinki", Region: "Uusimaa", Scope: scope, PublicDashboard: Dashboard{CheckedAt: now.Format(time.RFC3339), CoverageRegion: "Uusimaa", TopActions: []Action{{ID: "action", ScenarioKey: "commute", Severity: "HIGH", ValidFrom: now.Add(-time.Hour).Format(time.RFC3339), ValidTo: now.Format(time.RFC3339)}}}}
	got := Build(input)
	if got.RecommendationMode != "live" || len(got.TopActions) != 1 || got.HeadlineActionID != "action" {
		t.Fatalf("live boundary: %+v", got)
	}
	input.Scope.ReferenceTime = now.Add(time.Second)
	if len(Build(input).TopActions) != 0 {
		t.Fatal("expired action returned")
	}
	input.PublicDashboard.CheckedAt = now.Add(-7 * time.Hour).Format(time.RFC3339)
	if Build(input).RecommendationMode != "stale" {
		t.Fatal("stale snapshot")
	}
	input.Region = "Pirkanmaa"
	if Build(input).RecommendationMode != "out_of_scope" {
		t.Fatal("region mismatch")
	}
	input.Scope.Mode = "historical"
	missing := false
	input.PublicDashboard.SnapshotAvailable = &missing
	got = Build(input)
	if got.RecommendationMode != "historical" || got.HasScopedData || len(got.TopActions) > 0 || len(got.PlanItems) > 0 {
		t.Fatal("historical missing snapshot must be read-only")
	}
}
func TestEmptyConfiguredScenariosDoNotBecomeScopedEvidence(t *testing.T) {
	now := signals.ParseTime("2026-08-09T06:00:00Z")
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	input := Input{City: "helsinki", Region: "Uusimaa", Scope: scope, PublicDashboard: Dashboard{CheckedAt: now.Format(time.RFC3339), CoverageRegion: "Uusimaa"}}
	input.PublicDashboard.ScenarioSections = append(input.PublicDashboard.ScenarioSections, struct {
		Recommendation Action  `json:"recommendation"`
		Key            string  `json:"key"`
		Description    string  `json:"description"`
		DescriptionZH  *string `json:"description_zh"`
	}{Recommendation: Action{ID: "placeholder-outdoor", FreshnessState: "placeholder", ValidTo: now.Add(time.Hour).Format(time.RFC3339)}, Key: "outdoor"})
	got := Build(input)
	if got.HasScopedData || len(got.TopActions) != 0 || len(got.PlanItems) != 0 || len(got.Timeline) != 0 || got.ActionEligibility["placeholder-outdoor"] {
		t.Fatalf("a configured section with no observation must not become advice: %+v", got)
	}
}

func TestHealthDistinguishesHistoricalEvidence(t *testing.T) {
	sources := []platform.Source{{ID: "catalog-fmi", OperationalStatus: "pending"}, {ID: "live", OperationalStatus: "error"}, {ID: "ok", OperationalStatus: "healthy"}}
	live := Health(sources, false)
	if live.Tracked != 2 || live.Healthy != 1 || live.Catalog != 1 || live.Issues != 1 {
		t.Fatalf("%+v", live)
	}
	historical := Health(sources, true)
	if historical.Issues != 0 || historical.Tracked != 2 {
		t.Fatalf("%+v", historical)
	}
}
