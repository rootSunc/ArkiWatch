package publicrules

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
)

func TestBuildPublicRecommendationsExpandsStableKinds(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	events := []observations.NormalizedEvent{{ID: "event-1", EventType: "air_quality_poor", SourceCode: "hsy", Severity: "HIGH", StartsAt: now, EndsAt: now.Add(time.Hour), Title: "Poor air", Summary: "Avoid hard exercise", Attributes: map[string]any{}}}
	drafts := Build(events, map[string]string{"hsy": "healthy"}, now)
	if len(drafts) != 3 || drafts[0].RecommendationKind != "SCENARIO_CARD" || drafts[1].RecommendationKind != "TOP_ACTION" || drafts[2].RecommendationKind != "BROADCAST" {
		t.Fatalf("drafts = %#v", drafts)
	}
	if drafts[0].DedupeKey == drafts[1].DedupeKey || drafts[1].DedupeKey == drafts[2].DedupeKey {
		t.Fatal("recommendation kinds are not deduplicated")
	}
}

func TestBuildExcludesNonUusimaaCityAndRemoteNationalRoadEvents(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	events := []observations.NormalizedEvent{
		{
			ID: "oulu-storm", EventType: "rain_risk", SourceCode: "fmi", Severity: "HIGH",
			LocationRef: "oulu", StartsAt: now, EndsAt: now.Add(2 * time.Hour),
			Title: "Rain expected in Oulu", Summary: "Heavy rain in Oulu.",
		},
		{
			ID: "lapland-road", EventType: "road_disruption", SourceCode: "digitraffic", Severity: "HIGH",
			LocationRef: "finland", StartsAt: now, EndsAt: now.Add(2 * time.Hour),
			Title: "Vt 4 Rovaniemi closed", Summary: "Road closed near Rovaniemi.",
			Attributes: map[string]any{"geometry_bbox": []float64{25.7, 66.5, 25.8, 66.6}},
		},
		{
			ID: "espoo-ring1", EventType: "road_disruption", SourceCode: "digitraffic", Severity: "MEDIUM",
			LocationRef: "finland", StartsAt: now, EndsAt: now.Add(2 * time.Hour),
			Title: "Kehä I Leppävaara congestion", Summary: "Lane closed in Espoo.",
			Attributes: map[string]any{"geometry_bbox": []float64{24.80, 60.21, 24.82, 60.22}},
		},
		{
			ID: "espoo-air", EventType: "air_quality_poor", SourceCode: "hsy", Severity: "MEDIUM",
			LocationRef: "espoo", StartsAt: now, EndsAt: now.Add(2 * time.Hour),
			Title: "Air quality update for Espoo", Summary: "Poor air at Leppävaara.",
		},
		{
			ID: "fi-energy", EventType: "cheap_energy_window", SourceCode: "porssisahko", Severity: "LOW",
			LocationRef: "tampere", StartsAt: now, EndsAt: now.Add(2 * time.Hour),
			Title: "Lower energy window", Summary: "National spot price low.",
		},
	}

	drafts := Build(events, map[string]string{"fmi": "healthy", "digitraffic": "healthy", "hsy": "healthy", "porssisahko": "healthy"}, now)
	for _, draft := range drafts {
		if draft.EventID == "oulu-storm" || draft.EventID == "lapland-road" {
			t.Fatalf("non-Uusimaa event leaked into public recommendations: %+v", draft)
		}
	}
	seen := map[string]bool{}
	for _, draft := range drafts {
		seen[draft.EventID] = true
	}
	for _, wantID := range []string{"espoo-ring1", "espoo-air", "fi-energy"} {
		if !seen[wantID] {
			t.Fatalf("expected Uusimaa/national-energy event %s to be included, saw %v", wantID, seen)
		}
	}
}
