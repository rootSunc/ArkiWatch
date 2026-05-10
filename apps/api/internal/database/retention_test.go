package database

import (
	"context"
	"testing"
	"time"
)

func TestRawObservationPartitionNameRoundTrip(t *testing.T) {
	month := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	name := rawObservationPartitionName(month)
	if name != "raw_observations_y2026m03" {
		t.Fatalf("unexpected partition name: %s", name)
	}
	parsed, ok := parseRawObservationPartitionMonth(name)
	if !ok || !parsed.Equal(month) {
		t.Fatalf("round trip failed: %v ok=%v", parsed, ok)
	}
}

func TestParseRawObservationPartitionMonthRejectsOtherTables(t *testing.T) {
	for _, name := range []string{"raw_observations_default", "raw_observations", "raw_observations_y2026m13", "normalized_events", "raw_observations_yXXXXm01"} {
		if _, ok := parseRawObservationPartitionMonth(name); ok {
			t.Fatalf("%s was parsed as a month partition", name)
		}
	}
}

// Retention deletes history irreversibly, so it must stay inert until an
// operator opts in.
func TestApplyDataRetentionIsOptIn(t *testing.T) {
	store := openTestStore(t)
	cfg := testConfig()
	cfg.DataRetentionEnabled = false

	before := countRows(t, store, "raw_observations")
	result, err := store.ApplyDataRetention(context.Background(), cfg, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Skipped || result.RawDeleted != 0 {
		t.Fatalf("retention ran while disabled: %#v", result)
	}
	if after := countRows(t, store, "raw_observations"); after != before {
		t.Fatalf("row count changed from %d to %d", before, after)
	}
}

func TestEnsureRawObservationPartitionsIsIdempotent(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	if _, err := store.EnsureRawObservationPartitions(ctx, now, 2); err != nil {
		t.Fatal(err)
	}
	second, err := store.EnsureRawObservationPartitions(ctx, now, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 0 {
		t.Fatalf("second pass recreated partitions: %v", second)
	}
	names, err := store.rawObservationPartitionNames(ctx)
	if err != nil {
		t.Fatal(err)
	}
	expected := rawObservationPartitionName(now)
	found := false
	for _, name := range names {
		if name == expected {
			found = true
		}
	}
	if !found {
		t.Fatalf("current month partition %s is missing from %v", expected, names)
	}
}

// Creating a partition must not lose rows that were already sitting in the
// default partition for that month.
func TestEnsureRawObservationPartitionsPreservesExistingRows(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	before := countRows(t, store, "raw_observations")
	if _, err := store.EnsureRawObservationPartitions(ctx, now, 1); err != nil {
		t.Fatal(err)
	}
	if after := countRows(t, store, "raw_observations"); after != before {
		t.Fatalf("partition creation changed the row count from %d to %d", before, after)
	}
	var inDefault int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM raw_observations_default WHERE observed_at >= date_trunc('month', $1::timestamptz)`, now).Scan(&inDefault); err != nil {
		t.Fatal(err)
	}
	if inDefault != 0 {
		t.Fatalf("%d current-month rows were left in the default partition", inDefault)
	}
}

func TestApplyOperationalRetentionRemovesOnlyExpiredRuns(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	cfg := testConfig()
	cfg.SchedulerRunRetentionDays = 90
	cfg.TelegramWebhookRetentionDays = 30

	jobID := randomID()
	if _, err := store.pool.Exec(ctx, `
		INSERT INTO scheduled_jobs (id, job_key, task_type, interval_seconds, payload, is_enabled, next_run_at, created_at, updated_at)
		VALUES ($1, $2, 'PIPELINE_SNAPSHOTS'::scheduler_task_type, 3600, '{}', TRUE, $3, $3, $3)
	`, jobID, "test:retention:"+jobID, now); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = store.pool.Exec(context.Background(), `DELETE FROM scheduled_jobs WHERE id = $1`, jobID)
	})

	expiredID, freshID := randomID(), randomID()
	for id, finished := range map[string]time.Time{expiredID: now.AddDate(0, 0, -120), freshID: now.AddDate(0, 0, -1)} {
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO scheduled_job_runs (id, job_id, job_key, task_type, status, started_at, finished_at, duration_ms, result)
			VALUES ($1, $2, $3, 'PIPELINE_SNAPSHOTS'::scheduled_job_run_task_type, 'SUCCEEDED'::scheduled_job_run_status, $4, $4, 1, '{}')
		`, id, jobID, "test:retention:"+jobID, finished); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := store.ApplyOperationalRetention(ctx, cfg, now); err != nil {
		t.Fatal(err)
	}
	if rowExists(t, store, `SELECT EXISTS (SELECT 1 FROM scheduled_job_runs WHERE id = $1)`, expiredID) {
		t.Fatal("expired scheduler run survived retention")
	}
	if !rowExists(t, store, `SELECT EXISTS (SELECT 1 FROM scheduled_job_runs WHERE id = $1)`, freshID) {
		t.Fatal("recent scheduler run was deleted")
	}
}

func countRows(t *testing.T, store *Store, table string) int {
	t.Helper()
	var count int
	if err := store.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM `+table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func rowExists(t *testing.T, store *Store, query string, args ...any) bool {
	t.Helper()
	var exists bool
	if err := store.pool.QueryRow(context.Background(), query, args...).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	return exists
}
