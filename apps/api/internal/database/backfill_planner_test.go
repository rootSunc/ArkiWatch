package database

import (
	"context"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestBackfillWindowsCoverRangeWithoutGaps(t *testing.T) {
	location, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC)

	windows, err := BackfillWindows(start, end, 86400, location)
	if err != nil {
		t.Fatal(err)
	}
	if len(windows) != 3 {
		t.Fatalf("expected one window per day, got %d", len(windows))
	}
	for index := 1; index < len(windows); index++ {
		if !windows[index][0].Equal(windows[index-1][1]) {
			t.Fatalf("gap between window %d and %d", index-1, index)
		}
	}
	if !windows[len(windows)-1][1].Equal(localMidnight(end.AddDate(0, 0, 1), location)) {
		t.Fatalf("last window does not reach the exclusive end: %v", windows[len(windows)-1][1])
	}
}

func TestBackfillWindowsSplitsSubDayRanges(t *testing.T) {
	location := time.UTC
	day := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	windows, err := BackfillWindows(day, day, 21600, location)
	if err != nil {
		t.Fatal(err)
	}
	if len(windows) != 4 {
		t.Fatalf("expected 4 six-hour windows in one day, got %d", len(windows))
	}
}

func TestBackfillWindowsRejectsInvalidInput(t *testing.T) {
	day := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	if _, err := BackfillWindows(day, day.AddDate(0, 0, -1), 3600, time.UTC); err == nil {
		t.Fatal("reversed range was accepted")
	}
	if _, err := BackfillWindows(day, day, 0, time.UTC); err == nil {
		t.Fatal("zero window size was accepted")
	}
}

func TestPlanInitialBackfillsIsDisabledByDefault(t *testing.T) {
	store := openTestStore(t)
	cfg := testConfig()
	result, err := store.PlanInitialBackfills(context.Background(), cfg, map[string]bool{"fmi": true}, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != 0 || result.Considered != 0 {
		t.Fatalf("planner ran while disabled: %#v", result)
	}
}

// The planner runs on every backfill tick, so a second pass must not queue the
// same work again.
func TestPlanInitialBackfillsSkipsExistingJobs(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	cfg := testConfig()
	cfg.InitialBackfillEnabled = true
	cfg.InitialBackfillSources = []string{"fmi"}
	cfg.BackfillMaxWindowRetries = 3
	now := time.Now().UTC()
	capable := map[string]bool{"fmi": true}

	first, err := store.PlanInitialBackfills(ctx, cfg, capable, now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.PlanInitialBackfills(ctx, cfg, capable, now)
	if err != nil {
		t.Fatal(err)
	}
	if second.Created != 0 {
		t.Fatalf("planner re-queued an existing job: first=%#v second=%#v", first, second)
	}
	if second.Considered != 1 {
		t.Fatalf("expected the source to still be considered, got %#v", second)
	}
}

// A source whose collector cannot replay a range must never be queued, or the
// worker would fail every window it claims.
func TestPlanInitialBackfillsSkipsSourcesWithoutRangeSupport(t *testing.T) {
	store := openTestStore(t)
	cfg := testConfig()
	cfg.InitialBackfillEnabled = true
	cfg.InitialBackfillSources = []string{"hsy"}
	result, err := store.PlanInitialBackfills(context.Background(), cfg, map[string]bool{}, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if result.Considered != 0 || result.Created != 0 {
		t.Fatalf("planner queued a source without range support: %#v", result)
	}
}

func TestBackfillPlanUsesSourcePolicy(t *testing.T) {
	cfg := config.Config{InitialBackfillDays: 30, InitialBackfillWindowSeconds: 111}
	days, windowSeconds, normalize := backfillPlanFor("porssisahko", cfg)
	if days != 3 || windowSeconds != 21600 || !normalize {
		t.Fatalf("policy was not applied: days=%d window=%d normalize=%v", days, windowSeconds, normalize)
	}
	days, windowSeconds, _ = backfillPlanFor("unknown_source", cfg)
	if days != 30 || windowSeconds != 111 {
		t.Fatalf("fallback was not applied: days=%d window=%d", days, windowSeconds)
	}
}
