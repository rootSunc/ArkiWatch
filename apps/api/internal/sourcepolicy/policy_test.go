package sourcepolicy

import (
	"testing"
	"time"
)

func TestDefaultInitialSourcesOnlyIncludesEnabledOnes(t *testing.T) {
	enabled := DefaultInitialSources()
	if len(enabled) == 0 {
		t.Fatal("no sources are enabled for initial backfill")
	}
	for _, code := range enabled {
		policy, ok := For(code)
		if !ok || !policy.InitialEnabled {
			t.Fatalf("%s is listed but not enabled", code)
		}
	}
	for _, code := range []string{"fingrid", "hsy", "digitransit", "digitraffic"} {
		for _, listed := range enabled {
			if listed == code {
				t.Fatalf("%s requires explicit opt-in but is bootstrapped", code)
			}
		}
	}
}

func TestDefaultInitialSourcesIsStable(t *testing.T) {
	first, second := DefaultInitialSources(), DefaultInitialSources()
	if len(first) != len(second) {
		t.Fatal("source list length changed between calls")
	}
	for index := range first {
		if first[index] != second[index] {
			t.Fatalf("source order changed at %d: %s vs %s", index, first[index], second[index])
		}
	}
}

func TestIsCurrentHonoursPerSourceFreshness(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	// syke tolerates a week; digitransit only six hours.
	stale := now.Add(-48 * time.Hour)
	if !IsCurrent("syke", &stale, now) {
		t.Fatal("syke should tolerate a two-day-old reading")
	}
	if IsCurrent("digitransit", &stale, now) {
		t.Fatal("digitransit should reject a two-day-old reading")
	}
	if IsCurrent("syke", nil, now) {
		t.Fatal("a missing observation is never current")
	}
}

func TestLiveCutoffFallsBackForUnknownSources(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	if got := LiveCutoff("not_a_source", now); !got.Equal(now.Add(-24 * time.Hour)) {
		t.Fatalf("unexpected fallback cutoff: %v", got)
	}
}
