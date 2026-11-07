package database

import (
	"context"
	"testing"
	"time"
)

func TestSourceStatusSeparatesLastSuccessAndSevenDayRuns(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	id := randomID()
	code := "review-" + id[:8]
	if _, err := store.pool.Exec(ctx, `INSERT INTO data_sources (id, source_code, source_name, endpoint, auth_type, poll_interval_seconds, is_active) VALUES ($1,$2,'Review','https://example.test','NONE',300,true)`, id, code); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = store.pool.Exec(ctx, `DELETE FROM data_sources WHERE id=$1`, id) })
	location, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().In(location)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	success := today.Add(-2 * time.Minute)
	failure := today.Add(-time.Minute)
	old := today.AddDate(0, 0, -7)
	for _, run := range []struct {
		at     time.Time
		status string
	}{{success, "succeeded"}, {failure, "failed"}, {old, "succeeded"}} {
		if _, err := store.pool.Exec(ctx, `INSERT INTO collector_runs (id,source_id,dataset,status,started_at,finished_at,records_ingested) VALUES ($1,$2,'review',$3,$4,$4,5)`, randomID(), id, run.status, run.at); err != nil {
			t.Fatal(err)
		}
	}
	items, err := store.ListSourceStatus(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, source := range items {
		if source.ID != id {
			continue
		}
		found = true
		if source.LastRun == nil || source.LastRun.Status != "failed" {
			t.Fatalf("latest failure lost: %+v", source)
		}
		if source.LastSuccessfulRunAt == nil || *source.LastSuccessfulRunAt != formatTime(success) {
			t.Fatalf("last success confused with last run: %+v", source)
		}
		if len(source.RunHistory) != 7 {
			t.Fatalf("history length=%d", len(source.RunHistory))
		}
		previous := source.RunHistory[5]
		if previous.Date != today.AddDate(0, 0, -1).Format("2006-01-02") || previous.Runs != 2 || previous.Succeeded != 1 || previous.Failed != 1 {
			t.Fatalf("Helsinki midnight grouping: %+v", previous)
		}
		for index, day := range source.RunHistory {
			if index != 5 && day.Runs != 0 {
				t.Fatalf("invented run or old run included: %+v", day)
			}
		}
		if source.RunHistory[6].Running != 0 {
			t.Fatalf("empty day treated as running: %+v", source.RunHistory[6])
		}
	}
	historical, err := store.ListSourceStatusAt(ctx, success.Add(30*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range historical {
		if source.ID != id {
			continue
		}
		if source.LastRun.Status != "succeeded" || source.RunHistory[6].Failed != 0 || source.RunHistory[6].Succeeded != 1 || source.RunHistory[6].Date != success.Format("2006-01-02") {
			t.Fatalf("historical scope leaked a later failure: %+v", source)
		}
	}

	// A run that completed after the historical reference has no known outcome yet.
	if _, err := store.pool.Exec(ctx, `INSERT INTO collector_runs (id,source_id,dataset,status,started_at,finished_at,records_ingested,error_message) VALUES ($1,$2,'review','failed',$3,$4,99,'later diagnostics')`, randomID(), id, success.Add(5*time.Second), failure.Add(10*time.Second)); err != nil {
		t.Fatal(err)
	}
	inProgress, err := store.ListSourceStatusAt(ctx, success.Add(30*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range inProgress {
		if source.ID == id && (source.LastRun.Status != "running" || source.LastRun.FinishedAt != nil || source.LastRun.ErrorMessage != nil || source.LastRun.RecordsIngested != 0 || source.RunHistory[6].Failed != 0 || source.RunHistory[6].Running != 1) {
			t.Fatalf("future outcome leaked: %+v", source)
		}
	}

	if !found {
		t.Fatal("test source missing")
	}
}
