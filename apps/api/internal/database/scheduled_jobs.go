package database

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/scheduler"
)

type ScheduledJobRead struct {
	ID, JobKey, TaskType                       string
	IntervalSeconds                            int
	Payload                                    map[string]any
	IsEnabled                                  bool
	NextRunAt                                  time.Time
	LockedBy                                   *string
	LockedUntil, LastStartedAt, LastFinishedAt *time.Time
	LastStatus, LastError                      *string
}

type SchedulerReader interface {
	ListScheduledJobs(context.Context) ([]ScheduledJobRead, error)
	SyncDefaultScheduledJobs(context.Context, config.Config) (scheduler.SyncResult, error)
	EnqueuePlatformRefresh(context.Context) (map[string]any, error)
	PlatformRefreshStatus(context.Context) (map[string]any, error)
}

func (store *Store) ListActiveSourceIntervals(ctx context.Context) (map[string]int, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT source_code, poll_interval_seconds
		FROM data_sources
		WHERE is_active = TRUE
		ORDER BY source_code ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]int{}
	for rows.Next() {
		var code string
		var interval int
		if err := rows.Scan(&code, &interval); err != nil {
			return nil, err
		}
		result[code] = interval
	}
	return result, rows.Err()
}

func (store *Store) ListScheduledJobs(ctx context.Context) ([]ScheduledJobRead, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT id, job_key, task_type::text, interval_seconds, payload, is_enabled,
		       next_run_at, locked_by, locked_until, last_started_at, last_finished_at,
		       last_status::text, last_error
		FROM scheduled_jobs
		ORDER BY next_run_at ASC, job_key ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []ScheduledJobRead{}
	for rows.Next() {
		var item ScheduledJobRead
		var payload []byte
		var lockedBy, lastStatus, lastError sql.NullString
		var lockedUntil, lastStarted, lastFinished sql.NullTime
		if err := rows.Scan(&item.ID, &item.JobKey, &item.TaskType, &item.IntervalSeconds, &payload, &item.IsEnabled, &item.NextRunAt, &lockedBy, &lockedUntil, &lastStarted, &lastFinished, &lastStatus, &lastError); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return nil, err
		}
		if lockedBy.Valid {
			item.LockedBy = &lockedBy.String
		}
		if lockedUntil.Valid {
			value := lockedUntil.Time
			item.LockedUntil = &value
		}
		if lastStarted.Valid {
			value := lastStarted.Time
			item.LastStartedAt = &value
		}
		if lastFinished.Valid {
			value := lastFinished.Time
			item.LastFinishedAt = &value
		}
		if lastStatus.Valid {
			item.LastStatus = &lastStatus.String
		}
		if lastError.Valid {
			item.LastError = &lastError.String
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) SyncDefaultScheduledJobs(ctx context.Context, cfg config.Config) (scheduler.SyncResult, error) {
	intervals, err := store.ListActiveSourceIntervals(ctx)
	if err != nil {
		return scheduler.SyncResult{}, err
	}
	return store.SyncScheduledJobs(ctx, scheduler.BuildDefaultSpecs(intervals, cfg), time.Now().UTC(), cfg.SchedulerInitialJitterSeconds, cfg.Timezone)
}

func (store *Store) EnqueuePlatformRefresh(ctx context.Context) (map[string]any, error) {
	now := time.Now().UTC()
	var id, jobKey, lastStatus string
	var lockedUntil sql.NullTime
	err := store.pool.QueryRow(ctx, `SELECT id, job_key, last_status::text, locked_until FROM scheduled_jobs WHERE job_key = 'pipeline:platform-refresh'`).Scan(&id, &jobKey, &lastStatus, &lockedUntil)
	if err == pgx.ErrNoRows {
		return map[string]any{"status": "missing", "job_key": "pipeline:platform-refresh"}, nil
	}
	if err != nil {
		return nil, err
	}
	if lockedUntil.Valid && lockedUntil.Time.After(now) {
		return map[string]any{"status": "already_running", "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus), "locked_until": lockedUntil.Time.UTC().Format(time.RFC3339Nano), "message": "Platform refresh is already running."}, nil
	}
	if _, err := store.pool.Exec(ctx, `UPDATE scheduled_jobs SET next_run_at = $1, is_enabled = TRUE, updated_at = now() WHERE id = $2`, now, id); err != nil {
		return nil, err
	}
	return map[string]any{"status": "accepted", "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus), "message": "Platform refresh queued for the scheduler worker."}, nil
}

func (store *Store) PlatformRefreshStatus(ctx context.Context) (map[string]any, error) {
	var id, jobKey string
	var nextRun time.Time
	var lockedUntil, finished sql.NullTime
	var lastStatus, lastError sql.NullString
	err := store.pool.QueryRow(ctx, `SELECT id, job_key, next_run_at, locked_until, last_finished_at, last_status::text, last_error FROM scheduled_jobs WHERE job_key = 'pipeline:platform-refresh'`).Scan(&id, &jobKey, &nextRun, &lockedUntil, &finished, &lastStatus, &lastError)
	if err == pgx.ErrNoRows {
		return map[string]any{"status": "missing", "job_key": "pipeline:platform-refresh", "message": "Platform refresh job has not been synced yet."}, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	status := "idle"
	if lockedUntil.Valid && lockedUntil.Time.After(now) {
		status = "running"
	} else if !nextRun.After(now) {
		status = "queued"
	} else if lastStatus.Valid && lastStatus.String == "SUCCEEDED" {
		status = "succeeded"
	} else if lastStatus.Valid && lastStatus.String == "FAILED" {
		status = "failed"
	}
	result := map[string]any{"status": status, "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus.String)}
	if lockedUntil.Valid {
		result["locked_until"] = lockedUntil.Time.UTC().Format(time.RFC3339Nano)
	}
	if finished.Valid {
		result["last_finished_at"] = finished.Time.UTC().Format(time.RFC3339Nano)
	}
	if lastError.Valid && strings.TrimSpace(lastError.String) != "" {
		result["last_error"] = "Platform refresh failed; provider details are not exposed."
	}
	return result, nil
}

func (store *Store) SyncScheduledJobs(ctx context.Context, specs []scheduler.JobSpec, now time.Time, initialJitterSeconds int, timezone string) (scheduler.SyncResult, error) {
	result := scheduler.SyncResult{Jobs: len(specs)}
	for _, spec := range specs {
		payload, err := json.Marshal(spec.Payload)
		if err != nil {
			return scheduler.SyncResult{}, err
		}
		var id, taskType string
		var interval int
		var nextRun time.Time
		var existingPayload []byte
		var existingDaily sql.NullString
		err = store.pool.QueryRow(ctx, `
			SELECT id, task_type::text, interval_seconds, daily_at_local, payload, next_run_at
			FROM scheduled_jobs WHERE job_key = $1
		`, spec.JobKey).Scan(&id, &taskType, &interval, &existingDaily, &existingPayload, &nextRun)
		if err == pgx.ErrNoRows {
			nextRun = now.UTC().Add(time.Duration(scheduler.StableJitterSeconds(spec.JobKey, spec.IntervalSeconds, initialJitterSeconds)) * time.Second)
			// A wall-clock job waits for its hour rather than firing at boot,
			// so a restart cannot send a morning brief in the evening.
			if at, ok := scheduler.NextDailyRun(now.UTC(), spec.DailyAtLocal, timezone); ok {
				nextRun = at
			}
			_, err = store.pool.Exec(ctx, `
				INSERT INTO scheduled_jobs
					(id, job_key, task_type, interval_seconds, daily_at_local, payload, is_enabled, next_run_at)
				VALUES ($1, $2, $3::scheduler_task_type, $4, $5, $6::jsonb, TRUE, $7)
			`, randomID(), spec.JobKey, string(spec.TaskType), spec.IntervalSeconds, nullableDaily(spec.DailyAtLocal), payload, nextRun)
			if err != nil {
				return scheduler.SyncResult{}, err
			}
			result.Created++
			continue
		}
		if err != nil {
			return scheduler.SyncResult{}, err
		}
		changed := taskType != string(spec.TaskType) || interval != spec.IntervalSeconds ||
			existingDaily.String != spec.DailyAtLocal || !bytes.Equal(existingPayload, payload)
		if changed {
			_, err = store.pool.Exec(ctx, `
				UPDATE scheduled_jobs
				SET task_type = $1::scheduler_task_type, interval_seconds = $2,
				    daily_at_local = $3, payload = $4::jsonb, updated_at = now()
				WHERE id = $5
			`, string(spec.TaskType), spec.IntervalSeconds, nullableDaily(spec.DailyAtLocal), payload, id)
			if err != nil {
				return scheduler.SyncResult{}, err
			}
			result.Updated++
		}
	}
	return result, nil
}

func (store *Store) ClaimScheduledJobs(ctx context.Context, instanceID string, now time.Time, maxJobs, lockTTLSeconds int) ([]scheduler.ClaimedJob, error) {
	if maxJobs <= 0 {
		return nil, nil
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	lockedUntil := now.UTC().Add(time.Duration(lockTTLSeconds) * time.Second)
	rows, err := tx.Query(ctx, `
		SELECT id, job_key, task_type::text, interval_seconds, daily_at_local, payload
		FROM scheduled_jobs
		WHERE is_enabled = TRUE
		  AND next_run_at <= $1
		  AND (locked_until IS NULL OR locked_until <= $1)
		  AND task_type::text IN ('COLLECTOR', 'PIPELINE_NORMALIZE', 'PIPELINE_SNAPSHOTS',
		                         'RULES', 'DISPATCH', 'BACKFILL', 'PLATFORM_REFRESH')
		ORDER BY next_run_at ASC, job_key ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`, now.UTC(), maxJobs)
	if err != nil {
		return nil, err
	}
	claimed := make([]scheduler.ClaimedJob, 0)
	for rows.Next() {
		var job scheduler.ClaimedJob
		var taskType string
		var payloadBytes []byte
		var dailyAt sql.NullString
		if err := rows.Scan(&job.ID, &job.JobKey, &taskType, &job.IntervalSeconds, &dailyAt, &payloadBytes); err != nil {
			return nil, err
		}
		job.DailyAtLocal = dailyAt.String
		job.TaskType = scheduler.TaskType(taskType)
		job.StartedAt = now.UTC()
		job.LockedBy = instanceID
		if err := json.Unmarshal(payloadBytes, &job.Payload); err != nil {
			return nil, err
		}
		job.RunID = randomID()
		claimed = append(claimed, job)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for _, job := range claimed {
		if _, err := tx.Exec(ctx, `
			UPDATE scheduled_jobs
			SET locked_by = $1, locked_until = $2, last_started_at = $3,
			    last_status = 'RUNNING'::scheduler_run_status, last_error = NULL,
			    updated_at = now()
			WHERE id = $4
		`, instanceID, lockedUntil, now.UTC(), job.ID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO scheduled_job_runs
				(id, job_id, job_key, task_type, status, started_at)
			VALUES ($1, $2, $3, $4::scheduled_job_run_task_type, 'RUNNING'::scheduled_job_run_status, $5)
		`, job.RunID, job.ID, job.JobKey, string(job.TaskType), now.UTC()); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return claimed, nil
}

func (store *Store) CompleteScheduledJob(ctx context.Context, job scheduler.ClaimedJob, status scheduler.RunStatus, result map[string]any, errorMessage *string, now time.Time, failureRetrySeconds, rescheduleJitterSeconds int, timezone string) error {
	finishedAt := now.UTC()
	duration := int(finishedAt.Sub(job.StartedAt.UTC()).Milliseconds())
	if duration < 0 {
		duration = 0
	}
	resultBytes, err := json.Marshal(result)
	if err != nil {
		return err
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE scheduled_job_runs
		SET status = $1::scheduled_job_run_status, finished_at = $2,
		    duration_ms = $3, result = $4::jsonb, error_message = $5
		WHERE id = $6
	`, string(status), finishedAt, duration, resultBytes, errorMessage, job.RunID); err != nil {
		return err
	}
	nextRun := scheduledNextRun(job, status, finishedAt, failureRetrySeconds, rescheduleJitterSeconds, timezone)
	_, err = tx.Exec(ctx, `
		UPDATE scheduled_jobs
		SET next_run_at = $1, locked_by = NULL, locked_until = NULL,
		    last_finished_at = $2, last_status = $3::scheduler_run_status,
		    last_error = $4, updated_at = now()
		WHERE id = $5 AND locked_by = $6
	`, nextRun, finishedAt, string(status), errorMessage, job.ID, job.LockedBy)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// scheduledNextRun places the job's next run. An interval job keeps the jittered
// spacing that spreads load; a wall-clock job returns to its hour, and gets no
// jitter because the whole point is that it lands at the time it advertises. A
// failed wall-clock run retries soon, but never past its own next occurrence.
func scheduledNextRun(job scheduler.ClaimedJob, status scheduler.RunStatus, finishedAt time.Time, failureRetrySeconds, rescheduleJitterSeconds int, timezone string) time.Time {
	daily, isDaily := scheduler.NextDailyRun(finishedAt, job.DailyAtLocal, timezone)
	if isDaily {
		if status == scheduler.RunSucceeded {
			return daily
		}
		if retry := finishedAt.Add(time.Duration(failureRetrySeconds) * time.Second); retry.Before(daily) {
			return retry
		}
		return daily
	}
	delay := job.IntervalSeconds
	if status != scheduler.RunSucceeded {
		delay = failureRetrySeconds
	}
	delay += scheduler.StableJitterSeconds(job.JobKey, delay, rescheduleJitterSeconds)
	return finishedAt.Add(time.Duration(delay) * time.Second)
}
