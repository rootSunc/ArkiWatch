package scheduler

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestStableJitterIsDeterministicAndBounded(t *testing.T) {
	first := StableJitterSeconds("collector:fmi", 900, 120)
	if first != StableJitterSeconds("collector:fmi", 900, 120) || first < 0 || first > 120 {
		t.Fatalf("jitter = %d", first)
	}
	if value := StableJitterSeconds("collector:fmi", 10, 120); value > 2 {
		t.Fatalf("short interval jitter = %d", value)
	}
}

func TestBuildDefaultSpecsSortsCollectorsAndIncludesPipelineJobs(t *testing.T) {
	cfg := config.DefaultConfig()
	specs := BuildDefaultSpecs(map[string]int{"hsy": 600, "fmi": 900}, cfg)
	if len(specs) != 8 || specs[0].JobKey != "collector:fmi" || specs[1].JobKey != "collector:hsy" {
		t.Fatalf("specs = %#v", specs)
	}
	if specs[2].JobKey != "pipeline:normalize" || specs[len(specs)-1].TaskType != TaskPlatformRefresh {
		t.Fatalf("pipeline specs = %#v", specs)
	}
}

func TestParseDailyAtRejectsAnythingButAWallClockTime(t *testing.T) {
	if hour, minute, ok := ParseDailyAt(" 06:50 "); !ok || hour != 6 || minute != 50 {
		t.Fatalf("06:50 = %d %d %v", hour, minute, ok)
	}
	// A malformed value must not quietly become midnight.
	for _, value := range []string{"", "6:50", "0650", "24:00", "06:60", "ab:cd", "06:50:00"} {
		if _, _, ok := ParseDailyAt(value); ok {
			t.Fatalf("%q should not parse", value)
		}
	}
}

func TestNextDailyRunPicksTodayBeforeTheHourAndTomorrowAfter(t *testing.T) {
	// 04:00 UTC is 06:00 Helsinki in winter, so 06:50 is still ahead today.
	before := time.Date(2026, 1, 15, 4, 0, 0, 0, time.UTC)
	next, ok := NextDailyRun(before, "06:50", "Europe/Helsinki")
	if !ok || !next.Equal(time.Date(2026, 1, 15, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("next = %s ok = %v", next.Format(time.RFC3339), ok)
	}
	after := time.Date(2026, 1, 15, 5, 0, 0, 0, time.UTC)
	next, ok = NextDailyRun(after, "06:50", "Europe/Helsinki")
	if !ok || !next.Equal(time.Date(2026, 1, 16, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("next = %s ok = %v", next.Format(time.RFC3339), ok)
	}
}

// The point of a wall-clock schedule: 06:50 stays 06:50 for the reader even
// though the UTC instant moves by an hour across the daylight-saving change.
func TestNextDailyRunHoldsTheLocalHourAcrossDaylightSaving(t *testing.T) {
	springForward, ok := NextDailyRun(time.Date(2026, 3, 28, 6, 0, 0, 0, time.UTC), "06:50", "Europe/Helsinki")
	if !ok || !springForward.Equal(time.Date(2026, 3, 29, 3, 50, 0, 0, time.UTC)) {
		t.Fatalf("spring forward = %s", springForward.Format(time.RFC3339))
	}
	fallBack, ok := NextDailyRun(time.Date(2026, 10, 24, 6, 0, 0, 0, time.UTC), "06:50", "Europe/Helsinki")
	if !ok || !fallBack.Equal(time.Date(2026, 10, 25, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("fall back = %s", fallBack.Format(time.RFC3339))
	}
}

func TestNextDailyRunReportsNotDailyForAnIntervalJob(t *testing.T) {
	if _, ok := NextDailyRun(time.Now().UTC(), "", "Europe/Helsinki"); ok {
		t.Fatal("an empty schedule must not resolve to a time")
	}
}
