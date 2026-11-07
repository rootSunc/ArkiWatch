package database

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sourcepolicy"
)

// InitialBackfillMetadataKind tags jobs the planner creates automatically, so
// they can be told apart from ones an operator requested by hand.
const InitialBackfillMetadataKind = "initial_backfill"

type BackfillPlanResult struct {
	Considered, Created, Skipped, Windows int
	Sources                               []string
}

// BackfillWindows slices a date range into collection windows aligned to local
// midnight, matching how the collectors interpret a historical range.
func BackfillWindows(startDate, endDate time.Time, windowSeconds int, location *time.Location) ([][2]time.Time, error) {
	if endDate.Before(startDate) {
		return nil, fmt.Errorf("end date %s is before start date %s", endDate.Format("2006-01-02"), startDate.Format("2006-01-02"))
	}
	if windowSeconds <= 0 {
		return nil, fmt.Errorf("window seconds must be greater than 0")
	}
	cursor := localMidnight(startDate, location)
	exclusiveEnd := localMidnight(endDate.AddDate(0, 0, 1), location)
	step := time.Duration(windowSeconds) * time.Second
	windows := [][2]time.Time{}
	for cursor.Before(exclusiveEnd) {
		next := cursor.Add(step)
		if next.After(exclusiveEnd) {
			next = exclusiveEnd
		}
		windows = append(windows, [2]time.Time{cursor, next})
		cursor = next
	}
	return windows, nil
}

func localMidnight(day time.Time, location *time.Location) time.Time {
	return time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, location).UTC()
}

// PlanInitialBackfills creates the jobs and windows the backfill worker drains.
// Without this pass the worker has nothing to claim, so a fresh installation
// would never acquire any history at all.
//
// A source is skipped when it already has an observation for every day in the
// range, or when an equivalent job is already on the books, which keeps the
// planner safe to run on every scheduler tick.
func (store *Store) PlanInitialBackfills(ctx context.Context, cfg config.Config, rangeCapableSources map[string]bool, now time.Time) (BackfillPlanResult, error) {
	result := BackfillPlanResult{Sources: []string{}}
	if !cfg.InitialBackfillEnabled {
		return result, nil
	}
	location, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return result, fmt.Errorf("load timezone %q: %w", cfg.Timezone, err)
	}
	localToday := now.In(location)
	endDate := time.Date(localToday.Year(), localToday.Month(), localToday.Day(), 0, 0, 0, 0, time.UTC)

	for _, sourceCode := range initialBackfillSources(cfg) {
		if !rangeCapableSources[sourceCode] {
			continue
		}
		result.Considered++
		days, windowSeconds, normalizeAfter := backfillPlanFor(sourceCode, cfg)
		startDate := endDate.AddDate(0, 0, -(days - 1))

		covered, err := store.sourceCoversEveryDay(ctx, sourceCode, startDate, endDate, location, collectors.ConfiguredAreaCodes(cfg, sourceCode))
		if err != nil {
			return result, err
		}
		if covered {
			result.Skipped++
			continue
		}
		exists, err := store.matchingBackfillJobExists(ctx, sourceCode, startDate, endDate)
		if err != nil {
			return result, err
		}
		if exists {
			result.Skipped++
			continue
		}
		windows, err := store.createBackfillJob(ctx, sourceCode, startDate, endDate, windowSeconds, normalizeAfter, cfg.BackfillMaxWindowRetries, location, map[string]any{"kind": InitialBackfillMetadataKind, "days": days})
		if err != nil {
			return result, err
		}
		result.Created++
		result.Windows += windows
		result.Sources = append(result.Sources, sourceCode)
	}
	return result, nil
}

func initialBackfillSources(cfg config.Config) []string {
	if len(cfg.InitialBackfillSources) > 0 {
		return cfg.InitialBackfillSources
	}
	return sourcepolicy.DefaultInitialSources()
}

// backfillPlanFor prefers the per-source policy and falls back to the
// installation-wide defaults for a source the catalog does not describe.
func backfillPlanFor(sourceCode string, cfg config.Config) (int, int, bool) {
	if policy, ok := sourcepolicy.For(sourceCode); ok {
		return policy.InitialDays, policy.WindowSeconds, policy.NormalizeAfterWindow
	}
	return cfg.InitialBackfillDays, cfg.InitialBackfillWindowSeconds, true
}

// sourceCoversEveryDay reports whether the source already holds at least one
// observation on each local day of the range, which is the signal that no
// backfill is needed.
func (store *Store) sourceCoversEveryDay(ctx context.Context, sourceCode string, startDate, endDate time.Time, location *time.Location, areas []string) (bool, error) {
	startsAt := localMidnight(startDate, location)
	endsAt := localMidnight(endDate.AddDate(0, 0, 1), location)
	rows, err := store.pool.Query(ctx, `
		SELECT DISTINCT DATE(r.observed_at AT TIME ZONE $4), lower(r.area_code)
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1 AND r.observed_at >= $2 AND r.observed_at < $3
	`, sourceCode, startsAt, endsAt, location.String())
	if err != nil {
		return false, err
	}
	defer rows.Close()
	covered := map[string]map[string]struct{}{}
	for rows.Next() {
		var day time.Time
		var area string
		if err := rows.Scan(&day, &area); err != nil {
			return false, err
		}
		key := day.Format("2006-01-02")
		if covered[key] == nil {
			covered[key] = map[string]struct{}{}
		}
		covered[key][area] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	return coverageComplete(covered, startDate, endDate, areas), nil
}

func coverageComplete(covered map[string]map[string]struct{}, startDate, endDate time.Time, areas []string) bool {
	for day := startDate; !day.After(endDate); day = day.AddDate(0, 0, 1) {
		present := covered[day.Format("2006-01-02")]
		if len(areas) == 0 {
			if len(present) == 0 {
				return false
			}
			continue
		}
		for _, area := range areas {
			if _, ok := present[strings.ToLower(area)]; !ok {
				return false
			}
		}
	}
	return true
}

func (store *Store) matchingBackfillJobExists(ctx context.Context, sourceCode string, startDate, endDate time.Time) (bool, error) {
	var exists bool
	err := store.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM backfill_jobs
			WHERE source_code = $1 AND start_date = $2::date AND end_date = $3::date
			  AND area_code IS NULL AND status::text IN ('PENDING', 'RUNNING')
		)
	`, sourceCode, startDate.Format("2006-01-02"), endDate.Format("2006-01-02")).Scan(&exists)
	return exists, err
}

func (store *Store) createBackfillJob(ctx context.Context, sourceCode string, startDate, endDate time.Time, windowSeconds int, normalizeAfterWindow bool, maxWindowRetries int, location *time.Location, metadata map[string]any) (int, error) {
	windows, err := BackfillWindows(startDate, endDate, windowSeconds, location)
	if err != nil {
		return 0, err
	}
	if maxWindowRetries <= 0 {
		maxWindowRetries = 3
	}
	encodedMetadata, err := json.Marshal(metadata)
	if err != nil {
		return 0, err
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	jobID := randomID()
	if _, err := tx.Exec(ctx, `
		INSERT INTO backfill_jobs (id, source_code, status, start_date, end_date, window_seconds,
		                           area_code, requested_by, normalize_after_window, max_window_retries,
		                           metadata, created_at)
		VALUES ($1, $2, 'PENDING'::backfill_job_status, $3::date, $4::date, $5, NULL, NULL, $6, $7, $8, $9)
	`, jobID, sourceCode, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"), windowSeconds, normalizeAfterWindow, maxWindowRetries, encodedMetadata, time.Now().UTC()); err != nil {
		return 0, fmt.Errorf("insert backfill job for %s: %w", sourceCode, err)
	}
	for _, window := range windows {
		if _, err := tx.Exec(ctx, `
			INSERT INTO backfill_windows (id, job_id, source_code, window_start, window_end, area_code,
			                              status, attempt_count, records_inserted, records_skipped,
			                              normalization_scanned, normalization_inserted, normalization_updated)
			VALUES ($1, $2, $3, $4, $5, NULL, 'PENDING'::backfill_window_status, 0, 0, 0, 0, 0, 0)
			ON CONFLICT (job_id, window_start, window_end, area_code) DO NOTHING
		`, randomID(), jobID, sourceCode, window[0], window[1]); err != nil {
			return 0, fmt.Errorf("insert backfill window for %s: %w", sourceCode, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(windows), nil
}
