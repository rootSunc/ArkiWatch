package sources

import (
	"testing"
	"time"
)

func TestDeriveOperationalStatusHandlesInFlightRunsWithoutFalseFailures(t *testing.T) {
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	recent := now.Add(-5 * time.Minute).Format(time.RFC3339Nano)
	started := now.Add(-10 * time.Second).Format(time.RFC3339Nano)
	stuck := now.Add(-30 * time.Minute).Format(time.RFC3339Nano)

	runningWithRecentSuccess := Status{
		IsActive:            true,
		PollIntervalSeconds: 600,
		LastSuccessfulRunAt: &recent,
		LastRun:             &CollectorRun{Status: "running", StartedAt: started},
	}
	if got := DeriveOperationalStatus(runningWithRecentSuccess, now); got != "healthy" {
		t.Fatalf("expected in-flight run with fresh prior success to remain healthy, got %q", got)
	}

	runningFirstBoot := Status{
		IsActive:            true,
		PollIntervalSeconds: 600,
		LastRun:             &CollectorRun{Status: "running", StartedAt: started},
	}
	if got := DeriveOperationalStatus(runningFirstBoot, now); got != "pending" {
		t.Fatalf("expected first-boot in-flight run to report pending, got %q", got)
	}

	runningStuck := Status{
		IsActive:            true,
		PollIntervalSeconds: 600,
		LastRun:             &CollectorRun{Status: "running", StartedAt: stuck},
	}
	if got := DeriveOperationalStatus(runningStuck, now); got != "stale" {
		t.Fatalf("expected stuck in-flight run beyond 2x poll interval to report stale, got %q", got)
	}

	finished := now.Add(-time.Minute).Format(time.RFC3339Nano)
	degraded := Status{
		IsActive:            true,
		PollIntervalSeconds: 600,
		LastRun:             &CollectorRun{Status: "degraded", StartedAt: started, FinishedAt: &finished},
	}
	if got := DeriveOperationalStatus(degraded, now); got != "degraded" {
		t.Fatalf("expected a recent partial collection to stay degraded, got %q", got)
	}
}
