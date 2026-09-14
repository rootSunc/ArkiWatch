package database

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/scheduler"
)

func TestScheduledNextRunKeepsIntervalJobsJittered(t *testing.T) {
	job := scheduler.ClaimedJob{JobKey: "collector:fmi", IntervalSeconds: 900}
	finished := time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC)

	next := scheduledNextRun(job, scheduler.RunSucceeded, finished, 300, 60, "Europe/Helsinki")
	gap := next.Sub(finished)
	if gap < 900*time.Second || gap > 960*time.Second {
		t.Fatalf("gap = %s", gap)
	}
	failed := scheduledNextRun(job, scheduler.RunFailed, finished, 300, 60, "Europe/Helsinki")
	if gap := failed.Sub(finished); gap < 300*time.Second || gap > 360*time.Second {
		t.Fatalf("failure gap = %s", gap)
	}
}

// A wall-clock job returns to its own hour exactly. Jitter would defeat the
// point of advertising a time, so a daily job must not receive any.
func TestScheduledNextRunReturnsADailyJobToItsHourWithoutJitter(t *testing.T) {
	job := scheduler.ClaimedJob{JobKey: "brief:morning", IntervalSeconds: 900, DailyAtLocal: "06:50"}
	finished := time.Date(2026, 1, 15, 4, 50, 30, 0, time.UTC)

	next := scheduledNextRun(job, scheduler.RunSucceeded, finished, 300, 60, "Europe/Helsinki")
	if !next.Equal(time.Date(2026, 1, 16, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("next = %s", next.Format(time.RFC3339))
	}
}

func TestScheduledNextRunRetriesAFailedDailyJobWithoutOvershootingItsNextHour(t *testing.T) {
	job := scheduler.ClaimedJob{JobKey: "brief:morning", DailyAtLocal: "06:50"}

	// A failure early in the day retries soon.
	soon := scheduledNextRun(job, scheduler.RunFailed, time.Date(2026, 1, 15, 4, 50, 0, 0, time.UTC), 300, 60, "Europe/Helsinki")
	if !soon.Equal(time.Date(2026, 1, 15, 4, 55, 0, 0, time.UTC)) {
		t.Fatalf("retry = %s", soon.Format(time.RFC3339))
	}
	// A retry window that would reach past tomorrow's slot is clamped to it,
	// so a long retry interval cannot skip a day's brief entirely.
	clamped := scheduledNextRun(job, scheduler.RunFailed, time.Date(2026, 1, 15, 4, 50, 0, 0, time.UTC), 4*24*3600, 60, "Europe/Helsinki")
	if !clamped.Equal(time.Date(2026, 1, 16, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("clamped retry = %s", clamped.Format(time.RFC3339))
	}
}

// An unparseable value must fall back to interval scheduling rather than
// resolving to midnight or pinning the job in the past.
func TestScheduledNextRunFallsBackToIntervalWhenTheDailyTimeIsMalformed(t *testing.T) {
	job := scheduler.ClaimedJob{JobKey: "brief:morning", IntervalSeconds: 900, DailyAtLocal: "6:50"}
	finished := time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC)
	if gap := scheduledNextRun(job, scheduler.RunSucceeded, finished, 300, 60, "Europe/Helsinki").Sub(finished); gap < 900*time.Second {
		t.Fatalf("gap = %s", gap)
	}
}
