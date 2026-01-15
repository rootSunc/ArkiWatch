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
