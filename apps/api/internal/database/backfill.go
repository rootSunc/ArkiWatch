package database

import (
	"context"
	"time"
)

type BackfillWindowClaim struct {
	ID, JobID, SourceCode, AreaCode, Cursor string
	WindowStart, WindowEnd                  time.Time
	AttemptCount                            int
	NormalizeAfterWindow                    bool
	LockedBy                                string
}

func (store *Store) ClaimBackfillWindows(ctx context.Context, instanceID string, now time.Time, maxWindows, lockTTLSeconds int) ([]BackfillWindowClaim, error) {
	if maxWindows <= 0 {
		return nil, nil
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	lockedUntil := now.UTC().Add(time.Duration(lockTTLSeconds) * time.Second)
	rows, err := tx.Query(ctx, `
		SELECT w.id, w.job_id, w.source_code, w.window_start, w.window_end,
		       COALESCE(w.area_code, ''), COALESCE(w.cursor, ''), w.attempt_count,
		       j.normalize_after_window
		FROM backfill_windows AS w
		JOIN backfill_jobs AS j ON j.id = w.job_id
		WHERE j.status::text IN ('PENDING', 'RUNNING')
		  AND w.status::text IN ('PENDING', 'FAILED')
		  AND w.attempt_count < j.max_window_retries
		  AND (w.locked_until IS NULL OR w.locked_until <= $1)
		ORDER BY w.window_start ASC, w.id ASC
		LIMIT $2
		FOR UPDATE OF w SKIP LOCKED
	`, now.UTC(), maxWindows)
	if err != nil {
		return nil, err
	}
	claims := []BackfillWindowClaim{}
	for rows.Next() {
		var claim BackfillWindowClaim
		if err := rows.Scan(&claim.ID, &claim.JobID, &claim.SourceCode, &claim.WindowStart, &claim.WindowEnd, &claim.AreaCode, &claim.Cursor, &claim.AttemptCount, &claim.NormalizeAfterWindow); err != nil {
			rows.Close()
			return nil, err
		}
		claim.AttemptCount++
		claim.LockedBy = instanceID
		claims = append(claims, claim)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for _, claim := range claims {
		if _, err := tx.Exec(ctx, `
			UPDATE backfill_windows
			SET status = 'RUNNING'::backfill_window_status, attempt_count = $1,
			    locked_by = $2, locked_until = $3, started_at = $4,
			    finished_at = NULL, last_error = NULL
			WHERE id = $5
		`, claim.AttemptCount, instanceID, lockedUntil, now.UTC(), claim.ID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE backfill_jobs SET status = 'RUNNING'::backfill_job_status, started_at = COALESCE(started_at, $1)
			WHERE id = $2 AND status::text = 'PENDING'
		`, now.UTC(), claim.JobID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return claims, nil
}

func (store *Store) CompleteBackfillWindow(ctx context.Context, claim BackfillWindowClaim, succeeded bool, recordsInserted, recordsSkipped int, normalization NormalizeResult, errorMessage *string, now time.Time) error {
	status := "FAILED"
	if succeeded {
		status = "SUCCEEDED"
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE backfill_windows
		SET status = $1::backfill_window_status, records_inserted = $2, records_skipped = $3,
		    normalization_scanned = $4, normalization_inserted = $5, normalization_updated = $6,
		    locked_by = NULL, locked_until = NULL, finished_at = $7, last_error = $8
		WHERE id = $9 AND locked_by = $10
	`, status, recordsInserted, recordsSkipped, normalization.Scanned, normalization.Inserted, normalization.Updated, now.UTC(), errorMessage, claim.ID, claim.LockedBy); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE backfill_jobs AS j
		SET status = CASE
			WHEN EXISTS (SELECT 1 FROM backfill_windows w WHERE w.job_id = j.id AND w.status::text IN ('PENDING', 'RUNNING')) THEN 'RUNNING'::backfill_job_status
			WHEN EXISTS (SELECT 1 FROM backfill_windows w WHERE w.job_id = j.id AND w.status::text = 'FAILED') THEN 'FAILED'::backfill_job_status
			ELSE 'SUCCEEDED'::backfill_job_status END,
		    finished_at = CASE
			WHEN NOT EXISTS (SELECT 1 FROM backfill_windows w WHERE w.job_id = j.id AND w.status::text IN ('PENDING', 'RUNNING', 'FAILED')) THEN $1::timestamptz
			ELSE NULL END,
		    last_error = CASE WHEN $2::text IS NULL THEN NULL ELSE $2 END
		WHERE j.id = $3
	`, now.UTC(), errorMessage, claim.JobID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
