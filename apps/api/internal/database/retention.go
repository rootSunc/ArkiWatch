package database

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

// Raw observations are partitioned by month on observed_at. Dropping a cold
// partition retires a whole month in one catalog operation, which is what keeps
// retention from turning into a very large DELETE during steady state.
var rawObservationPartitionPattern = regexp.MustCompile(`^raw_observations_y(\d{4})m(\d{2})$`)

type RetentionResult struct {
	RawDeleted            int64
	EventsDeleted         int64
	SchedulerRunsDeleted  int64
	WebhookUpdatesDeleted int64
	PartitionsCreated     []string
	PartitionsDropped     []string
	Skipped               bool
}

func rawObservationPartitionName(month time.Time) string {
	return fmt.Sprintf("raw_observations_y%04dm%02d", month.Year(), int(month.Month()))
}

func parseRawObservationPartitionMonth(name string) (time.Time, bool) {
	match := rawObservationPartitionPattern.FindStringSubmatch(name)
	if match == nil {
		return time.Time{}, false
	}
	year, err := strconv.Atoi(match[1])
	if err != nil {
		return time.Time{}, false
	}
	month, err := strconv.Atoi(match[2])
	if err != nil || month < 1 || month > 12 {
		return time.Time{}, false
	}
	return time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC), true
}

// EnsureRawObservationPartitions creates the current month plus monthsAhead
// future partitions. Without them every row lands in the default partition,
// which makes the partitioning inert and retention expensive.
func (store *Store) EnsureRawObservationPartitions(ctx context.Context, now time.Time, monthsAhead int) ([]string, error) {
	partitioned, err := store.rawObservationsPartitioned(ctx)
	if err != nil || !partitioned {
		return nil, err
	}
	if monthsAhead < 0 {
		monthsAhead = 0
	}
	created := []string{}
	cursor := time.Date(now.UTC().Year(), now.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	for index := 0; index <= monthsAhead; index++ {
		name := rawObservationPartitionName(cursor)
		next := cursor.AddDate(0, 1, 0)
		var exists bool
		if err := store.pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, name).Scan(&exists); err != nil {
			return created, fmt.Errorf("check partition %s: %w", name, err)
		}
		if !exists {
			if err := store.createMonthPartition(ctx, name, cursor, next); err != nil {
				return created, err
			}
			created = append(created, name)
		}
		cursor = next
	}
	return created, nil
}

// createMonthPartition attaches one month partition.
//
// Two PostgreSQL constraints shape this. Partition bounds cannot be bind
// parameters, so the range is rendered into the statement — safe here because
// both values come from formatted timestamps, never from user input. And a new
// partition cannot overlap rows already sitting in the default partition, so
// any rows for that month are moved aside and reinserted afterwards.
func (store *Store) createMonthPartition(ctx context.Context, name string, from, to time.Time) error {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE raw_observations_partition_move ON COMMIT DROP AS
		SELECT * FROM raw_observations WHERE observed_at >= $1 AND observed_at < $2
	`, from, to); err != nil {
		return fmt.Errorf("stage rows for partition %s: %w", name, err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM raw_observations WHERE observed_at >= $1 AND observed_at < $2`, from, to); err != nil {
		return fmt.Errorf("clear rows for partition %s: %w", name, err)
	}
	statement := fmt.Sprintf(
		`CREATE TABLE %s PARTITION OF raw_observations FOR VALUES FROM ('%s') TO ('%s')`,
		name, from.UTC().Format(time.RFC3339), to.UTC().Format(time.RFC3339),
	)
	if _, err := tx.Exec(ctx, statement); err != nil {
		return fmt.Errorf("create partition %s: %w", name, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO raw_observations SELECT * FROM raw_observations_partition_move`); err != nil {
		return fmt.Errorf("restore rows into partition %s: %w", name, err)
	}
	return tx.Commit(ctx)
}

// DropStaleRawObservationPartitions removes month partitions that end entirely
// before the cutoff.
func (store *Store) DropStaleRawObservationPartitions(ctx context.Context, cutoff time.Time) ([]string, error) {
	names, err := store.rawObservationPartitionNames(ctx)
	if err != nil {
		return nil, err
	}
	dropped := []string{}
	for _, name := range names {
		month, ok := parseRawObservationPartitionMonth(name)
		if !ok {
			continue
		}
		if !month.AddDate(0, 1, 0).After(cutoff.UTC()) {
			if _, err := store.pool.Exec(ctx, fmt.Sprintf(`DROP TABLE %s`, name)); err != nil {
				return dropped, fmt.Errorf("drop partition %s: %w", name, err)
			}
			dropped = append(dropped, name)
		}
	}
	return dropped, nil
}

func (store *Store) rawObservationsPartitioned(ctx context.Context) (bool, error) {
	var partitioned bool
	err := store.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'raw_observations' AND relkind = 'p')
	`).Scan(&partitioned)
	return partitioned, err
}

func (store *Store) rawObservationPartitionNames(ctx context.Context) ([]string, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT child.relname
		FROM pg_inherits
		JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
		JOIN pg_class child ON pg_inherits.inhrelid = child.oid
		WHERE parent.relname = 'raw_observations'
		ORDER BY child.relname
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Strings(names)
	return names, nil
}

// ApplyDataRetention bounds the ingest tables. It is opt-in because deleting
// history is not reversible, and an operator should choose when it starts.
func (store *Store) ApplyDataRetention(ctx context.Context, cfg config.Config, now time.Time) (RetentionResult, error) {
	result := RetentionResult{PartitionsCreated: []string{}, PartitionsDropped: []string{}}
	if !cfg.DataRetentionEnabled {
		result.Skipped = true
		return result, nil
	}
	now = now.UTC()
	rawCutoff := now.AddDate(0, 0, -cfg.RawObservationRetentionDays)
	eventCutoff := now.AddDate(0, 0, -cfg.NormalizedEventRetentionDays)

	dropped, err := store.DropStaleRawObservationPartitions(ctx, rawCutoff)
	if err != nil {
		return result, err
	}
	result.PartitionsDropped = dropped

	// Whole months are removed by dropping the partition; this clears the rows
	// a partially-expired month still holds, and everything in the default
	// partition of an installation that predates partitioning.
	tag, err := store.pool.Exec(ctx, `DELETE FROM raw_observations WHERE observed_at < $1`, rawCutoff)
	if err != nil {
		return result, fmt.Errorf("delete expired raw observations: %w", err)
	}
	result.RawDeleted = tag.RowsAffected()

	tag, err = store.pool.Exec(ctx, `DELETE FROM normalized_events WHERE ends_at < $1`, eventCutoff)
	if err != nil {
		return result, fmt.Errorf("delete expired normalized events: %w", err)
	}
	result.EventsDeleted = tag.RowsAffected()
	return result, nil
}

// ApplyOperationalRetention bounds the scheduler and webhook bookkeeping
// tables. These hold no product history, so they are trimmed unconditionally.
func (store *Store) ApplyOperationalRetention(ctx context.Context, cfg config.Config, now time.Time) (RetentionResult, error) {
	result := RetentionResult{}
	now = now.UTC()
	schedulerCutoff := now.AddDate(0, 0, -cfg.SchedulerRunRetentionDays)
	webhookCutoff := now.AddDate(0, 0, -cfg.TelegramWebhookRetentionDays)

	tag, err := store.pool.Exec(ctx, `DELETE FROM scheduled_job_runs WHERE finished_at IS NOT NULL AND finished_at < $1`, schedulerCutoff)
	if err != nil {
		return result, fmt.Errorf("delete expired scheduler runs: %w", err)
	}
	result.SchedulerRunsDeleted = tag.RowsAffected()

	tag, err = store.pool.Exec(ctx, `DELETE FROM telegram_webhook_updates WHERE processed_at < $1`, webhookCutoff)
	if err != nil {
		return result, fmt.Errorf("delete expired telegram webhook updates: %w", err)
	}
	result.WebhookUpdatesDeleted = tag.RowsAffected()
	return result, nil
}
