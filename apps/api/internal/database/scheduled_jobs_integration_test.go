package database

import (
	"context"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/scheduler"
)

// A wall-clock schedule crosses a jsonb-free column, a claim scan and a
// reschedule, so the round trip is only really proven against PostgreSQL.
func TestScheduledJobsPersistAndRescheduleAWallClockSchedule(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)

	specs := []scheduler.JobSpec{
		{JobKey: "test:daily-brief", TaskType: scheduler.TaskDispatch, IntervalSeconds: 900, DailyAtLocal: "06:50", Payload: map[string]any{}},
		{JobKey: "test:interval", TaskType: scheduler.TaskRules, IntervalSeconds: 300, Payload: map[string]any{}},
	}
	if _, err := store.SyncScheduledJobs(ctx, specs, now, 0, "Europe/Helsinki"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	var daily *string
	var nextRun time.Time
	if err := store.pool.QueryRow(ctx, `SELECT daily_at_local, next_run_at FROM scheduled_jobs WHERE job_key='test:daily-brief'`).Scan(&daily, &nextRun); err != nil {
		t.Fatalf("read brief: %v", err)
	}
	if daily == nil || *daily != "06:50" {
		t.Fatalf("daily_at_local = %v", daily)
	}
	// 10:00 UTC on 15 Jan is past 06:50 local, so the first run is tomorrow.
	if !nextRun.UTC().Equal(time.Date(2026, 1, 16, 4, 50, 0, 0, time.UTC)) {
		t.Fatalf("next_run_at = %s", nextRun.UTC().Format(time.RFC3339))
	}
	var intervalDaily *string
	if err := store.pool.QueryRow(ctx, `SELECT daily_at_local FROM scheduled_jobs WHERE job_key='test:interval'`).Scan(&intervalDaily); err != nil {
		t.Fatalf("read interval: %v", err)
	}
	if intervalDaily != nil {
		t.Fatalf("interval job daily_at_local = %v, want NULL", *intervalDaily)
	}

	// Changing only the wall-clock time must be detected as a change.
	specs[0].DailyAtLocal = "07:15"
	result, err := store.SyncScheduledJobs(ctx, specs, now, 0, "Europe/Helsinki")
	if err != nil {
		t.Fatalf("resync: %v", err)
	}
	if result.Updated != 1 {
		t.Fatalf("updated = %d, want 1", result.Updated)
	}

	// Claim must carry the schedule back out of the database.
	if _, err := store.pool.Exec(ctx, `UPDATE scheduled_jobs SET next_run_at = $1 WHERE job_key='test:daily-brief'`, now); err != nil {
		t.Fatalf("arm: %v", err)
	}
	jobs, err := store.ClaimScheduledJobs(ctx, "test-instance", now, 10, 600)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	var brief *scheduler.ClaimedJob
	for index := range jobs {
		if jobs[index].JobKey == "test:daily-brief" {
			brief = &jobs[index]
		}
	}
	if brief == nil || brief.DailyAtLocal != "07:15" {
		t.Fatalf("claimed = %#v", brief)
	}
	if err := store.CompleteScheduledJob(ctx, *brief, scheduler.RunSucceeded, map[string]any{}, nil, now, 300, 60, "Europe/Helsinki"); err != nil {
		t.Fatalf("complete: %v", err)
	}
	if err := store.pool.QueryRow(ctx, `SELECT next_run_at FROM scheduled_jobs WHERE job_key='test:daily-brief'`).Scan(&nextRun); err != nil {
		t.Fatalf("reread: %v", err)
	}
	if !nextRun.UTC().Equal(time.Date(2026, 1, 16, 5, 15, 0, 0, time.UTC)) {
		t.Fatalf("rescheduled to %s", nextRun.UTC().Format(time.RFC3339))
	}
	_, _ = store.pool.Exec(ctx, `DELETE FROM scheduled_jobs WHERE job_key LIKE 'test:%'`)
}
