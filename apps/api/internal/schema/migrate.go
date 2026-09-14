package schema

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CurrentVersion is the version owned by the Go backend. Legacy revision
// records are treated as history markers: the reconciler below describes the
// current database contract and upgrades both fresh and existing installations.
const CurrentVersion = "go-0001-current-schema"

type Report struct {
	Version string
	Fresh   bool
}

var enumDefinitions = map[string][]string{
	"source_auth_type":               {"NONE", "API_KEY"},
	"snapshot_area_scope":            {"HELSINKI_UUSIMAA", "HELSINKI_METRO"},
	"rule_severity":                  {"INFO", "LOW", "MEDIUM", "HIGH"},
	"scheduler_task_type":            {"COLLECTOR", "PIPELINE_NORMALIZE", "PIPELINE_SNAPSHOTS", "RULES", "DISPATCH", "BACKFILL", "PLATFORM_REFRESH"},
	"scheduler_run_status":           {"RUNNING", "SUCCEEDED", "FAILED"},
	"user_status":                    {"ACTIVE", "DISABLED"},
	"severity":                       {"INFO", "LOW", "MEDIUM", "HIGH"},
	"location_type":                  {"CITY", "DISTRICT", "COORDINATE", "ROUTE", "STOP"},
	"channel_type":                   {"TELEGRAM"},
	"scheduled_job_run_task_type":    {"COLLECTOR", "PIPELINE_NORMALIZE", "PIPELINE_SNAPSHOTS", "RULES", "DISPATCH", "BACKFILL", "PLATFORM_REFRESH"},
	"scheduled_job_run_status":       {"RUNNING", "SUCCEEDED", "FAILED"},
	"commute_mode":                   {"TRANSIT", "WALK", "BIKE", "DRIVE"},
	"subscription_scenario_key":      {"COMMUTE", "OUTDOOR", "HOME_AIR", "ENERGY"},
	"scenario_key":                   {"COMMUTE", "OUTDOOR", "HOME_AIR", "ENERGY"},
	"public_recommendation_kind":     {"TOP_ACTION", "SCENARIO_CARD", "BROADCAST"},
	"area_scope":                     {"HELSINKI_UUSIMAA", "HELSINKI_METRO"},
	"public_recommendation_severity": {"INFO", "LOW", "MEDIUM", "HIGH"},
	"freshness_state":                {"FRESH", "STALE", "DEGRADED"},
	"recommendation_type":            {"COMMUTE", "ENERGY", "AIR", "WEATHER", "SUMMARY"},
	"recommendation_status":          {"PENDING", "SENT", "SKIPPED", "EXPIRED"},
	"delivery_status":                {"QUEUED", "SENT", "FAILED", "CLICKED", "MUTED"},
	"public_delivery_status":         {"QUEUED", "SENT", "FAILED", "CLICKED", "MUTED"},
	"backfill_job_status":            {"PENDING", "RUNNING", "PAUSED", "SUCCEEDED", "FAILED", "CANCELLED"},
	"backfill_window_status":         {"PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"},
}

// Migrate applies the schema contract used by every Go binary. It is safe to
// run repeatedly and keeps the migration decision in the application image,
// so production only needs the Go migration binary.
func Migrate(ctx context.Context, pool *pgxpool.Pool) (Report, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Report{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS arkiwatch_schema_migrations (
			version VARCHAR(64) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return Report{}, fmt.Errorf("create schema migration table: %w", err)
	}

	fresh, err := isFresh(ctx, tx)
	if err != nil {
		return Report{}, err
	}
	if err := adoptLegacyMarker(ctx, tx); err != nil {
		return Report{}, err
	}
	if err := ensureEnums(ctx, tx); err != nil {
		return Report{}, err
	}
	if err := ensureTables(ctx, tx); err != nil {
		return Report{}, err
	}
	if err := ensureColumnsAndData(ctx, tx); err != nil {
		return Report{}, err
	}
	if err := ensureIndexes(ctx, tx); err != nil {
		return Report{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO arkiwatch_schema_migrations (version)
		VALUES ($1)
		ON CONFLICT (version) DO UPDATE SET applied_at = arkiwatch_schema_migrations.applied_at
	`, CurrentVersion); err != nil {
		return Report{}, fmt.Errorf("record Go schema version: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Report{}, fmt.Errorf("commit Go schema migration: %w", err)
	}
	return Report{Version: CurrentVersion, Fresh: fresh}, nil
}

func isFresh(ctx context.Context, tx pgx.Tx) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT to_regclass('public.data_sources') IS NULL`).Scan(&exists); err != nil {
		return false, fmt.Errorf("inspect existing schema: %w", err)
	}
	return exists, nil
}

func adoptLegacyMarker(ctx context.Context, tx pgx.Tx) error {
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM arkiwatch_schema_migrations`).Scan(&count); err != nil {
		return fmt.Errorf("inspect Go schema markers: %w", err)
	}
	if count > 0 {
		return nil
	}

	var hasLegacyRevisionTable bool
	if err := tx.QueryRow(ctx, `SELECT to_regclass('public.alembic_version') IS NOT NULL`).Scan(&hasLegacyRevisionTable); err != nil {
		return fmt.Errorf("inspect legacy migration marker: %w", err)
	}
	if hasLegacyRevisionTable {
		var revision string
		err := tx.QueryRow(ctx, `SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1`).Scan(&revision)
		if err != nil && err != pgx.ErrNoRows {
			return fmt.Errorf("read legacy migration marker: %w", err)
		}
		if revision != "" {
			if _, err := tx.Exec(ctx, `INSERT INTO arkiwatch_schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, "alembic:"+revision); err != nil {
				return fmt.Errorf("adopt legacy migration marker: %w", err)
			}
		}
	}
	return nil
}

func ensureEnums(ctx context.Context, tx pgx.Tx) error {
	for name, values := range enumDefinitions {
		literals := make([]string, 0, len(values))
		for _, value := range values {
			literals = append(literals, "'"+strings.ReplaceAll(value, "'", "''")+"'")
		}
		create := fmt.Sprintf(
			"DO $$ BEGIN CREATE TYPE %s AS ENUM (%s); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
			name, strings.Join(literals, ", "),
		)
		if _, err := tx.Exec(ctx, create); err != nil {
			return fmt.Errorf("ensure enum %s: %w", name, err)
		}
		for _, value := range values {
			if _, err := tx.Exec(ctx, fmt.Sprintf("ALTER TYPE %s ADD VALUE IF NOT EXISTS '%s'", name, strings.ReplaceAll(value, "'", "''"))); err != nil {
				return fmt.Errorf("ensure enum value %s.%s: %w", name, value, err)
			}
		}
	}
	return nil
}

func ensureTables(ctx context.Context, tx pgx.Tx) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS data_sources (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			source_code VARCHAR(32) NOT NULL UNIQUE,
			source_name VARCHAR(120) NOT NULL,
			endpoint VARCHAR(255) NOT NULL,
			auth_type source_auth_type NOT NULL,
			poll_interval_seconds INTEGER NOT NULL,
			is_active BOOLEAN NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS regional_snapshots (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			area_scope snapshot_area_scope NOT NULL,
			snapshot_date DATE NOT NULL,
			summary JSONB NOT NULL,
			generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS rule_definitions (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			rule_code VARCHAR(64) NOT NULL UNIQUE,
			rule_name VARCHAR(120) NOT NULL,
			scenario VARCHAR(40) NOT NULL,
			version INTEGER NOT NULL,
			is_active BOOLEAN NOT NULL,
			severity rule_severity NOT NULL,
			cooldown_minutes INTEGER NOT NULL,
			config JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_jobs (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			job_key VARCHAR(120) NOT NULL UNIQUE,
			task_type scheduler_task_type NOT NULL,
			interval_seconds INTEGER NOT NULL,
			daily_at_local VARCHAR(5),
			payload JSONB NOT NULL,
			is_enabled BOOLEAN NOT NULL,
			next_run_at TIMESTAMPTZ NOT NULL,
			locked_by VARCHAR(120),
			locked_until TIMESTAMPTZ,
			last_started_at TIMESTAMPTZ,
			last_finished_at TIMESTAMPTZ,
			last_status scheduler_run_status,
			last_error TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			email VARCHAR(255) UNIQUE,
			name VARCHAR(120),
			timezone VARCHAR(64) NOT NULL,
			locale VARCHAR(16) NOT NULL,
			status user_status NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS collector_runs (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			source_id VARCHAR(36) NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
			dataset VARCHAR(64) NOT NULL,
			status VARCHAR(24) NOT NULL,
			started_at TIMESTAMPTZ NOT NULL,
			finished_at TIMESTAMPTZ,
			records_ingested INTEGER NOT NULL,
			error_message TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS daily_snapshots (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			snapshot_date DATE NOT NULL,
			summary JSONB NOT NULL,
			generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS normalized_events (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			event_type VARCHAR(64) NOT NULL,
			source_id VARCHAR(36) NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
			severity severity NOT NULL,
			location_type location_type NOT NULL,
			location_ref VARCHAR(128) NOT NULL,
			starts_at TIMESTAMPTZ NOT NULL,
			ends_at TIMESTAMPTZ NOT NULL,
			confidence NUMERIC(4,3),
			title VARCHAR(200) NOT NULL,
			summary TEXT NOT NULL,
			attributes JSONB NOT NULL,
			dedupe_key VARCHAR(255) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS notification_channels (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			channel_type channel_type NOT NULL,
			external_id VARCHAR(255),
			is_verified BOOLEAN NOT NULL,
			is_active BOOLEAN NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS scheduled_job_runs (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			job_id VARCHAR(36) NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
			job_key VARCHAR(120) NOT NULL,
			task_type scheduled_job_run_task_type NOT NULL,
			status scheduled_job_run_status NOT NULL,
			started_at TIMESTAMPTZ NOT NULL,
			finished_at TIMESTAMPTZ,
			duration_ms INTEGER,
			result JSONB,
			error_message TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS user_locations (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			label VARCHAR(40) NOT NULL,
			country_code VARCHAR(2) NOT NULL,
			city VARCHAR(80) NOT NULL,
			district VARCHAR(80),
			lat NUMERIC(9,6) NOT NULL,
			lon NUMERIC(9,6) NOT NULL,
			is_default BOOLEAN NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS user_preferences (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			cares_energy BOOLEAN NOT NULL,
			cares_air_quality BOOLEAN NOT NULL,
			cares_weather BOOLEAN NOT NULL,
			cares_commute BOOLEAN NOT NULL,
			allergy_sensitive BOOLEAN NOT NULL,
			quiet_hours_start VARCHAR(5),
			quiet_hours_end VARCHAR(5),
			max_notifications_per_day INTEGER NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS public_recommendations (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			event_id VARCHAR(36) REFERENCES normalized_events(id) ON DELETE SET NULL,
			dedupe_key VARCHAR(320) NOT NULL,
			scenario_key scenario_key NOT NULL,
			recommendation_kind public_recommendation_kind NOT NULL,
			area_scope area_scope NOT NULL,
			severity public_recommendation_severity NOT NULL,
			freshness_state freshness_state NOT NULL,
			priority INTEGER NOT NULL,
			title VARCHAR(200) NOT NULL,
			body TEXT NOT NULL,
			evidence JSONB NOT NULL,
			confidence NUMERIC(4,3),
			valid_from TIMESTAMPTZ NOT NULL,
			valid_to TIMESTAMPTZ NOT NULL,
			is_active BOOLEAN NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS recommendations (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			event_id VARCHAR(36) NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
			recommendation_type recommendation_type NOT NULL,
			priority INTEGER NOT NULL,
			status recommendation_status NOT NULL,
			advice_title VARCHAR(200) NOT NULL,
			advice_body TEXT NOT NULL,
			advice_title_zh VARCHAR(200),
			advice_body_zh TEXT,
			rationale JSONB NOT NULL,
			valid_from TIMESTAMPTZ NOT NULL,
			valid_to TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS scenario_subscriptions (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			channel_id VARCHAR(36) NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
			scenario_key subscription_scenario_key NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS user_commute_profiles (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name VARCHAR(80) NOT NULL,
			origin_location_id VARCHAR(36) NOT NULL REFERENCES user_locations(id) ON DELETE RESTRICT,
			destination_location_id VARCHAR(36) NOT NULL REFERENCES user_locations(id) ON DELETE RESTRICT,
			preferred_mode commute_mode NOT NULL,
			departure_time_local VARCHAR(5) NOT NULL,
			weekdays INTEGER[] NOT NULL,
			is_active BOOLEAN NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS notifications (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			recommendation_id VARCHAR(36) NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
			channel_id VARCHAR(36) NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
			delivery_status delivery_status NOT NULL,
			message_text TEXT NOT NULL,
			sent_at TIMESTAMPTZ,
			clicked_at TIMESTAMPTZ,
			error_message TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS public_deliveries (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			public_recommendation_id VARCHAR(36) NOT NULL REFERENCES public_recommendations(id) ON DELETE CASCADE,
			channel_id VARCHAR(36) NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
			delivery_status public_delivery_status NOT NULL,
			message_text TEXT NOT NULL,
			sent_at TIMESTAMPTZ,
			error_message TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS rule_hits (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			rule_id VARCHAR(36) NOT NULL REFERENCES rule_definitions(id) ON DELETE CASCADE,
			user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			event_id VARCHAR(36) NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
			recommendation_id VARCHAR(36) NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
			hit_context JSONB NOT NULL,
			hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS backfill_jobs (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			source_code VARCHAR(32) NOT NULL,
			status backfill_job_status NOT NULL,
			start_date DATE NOT NULL,
			end_date DATE NOT NULL,
			window_seconds INTEGER NOT NULL,
			area_code VARCHAR(64),
			requested_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
			normalize_after_window BOOLEAN NOT NULL,
			max_window_retries INTEGER NOT NULL,
			metadata JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			started_at TIMESTAMPTZ,
			finished_at TIMESTAMPTZ,
			last_error TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS backfill_windows (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			job_id VARCHAR(36) NOT NULL REFERENCES backfill_jobs(id) ON DELETE CASCADE,
			source_code VARCHAR(32) NOT NULL,
			window_start TIMESTAMPTZ NOT NULL,
			window_end TIMESTAMPTZ NOT NULL,
			area_code VARCHAR(64),
			status backfill_window_status NOT NULL,
			attempt_count INTEGER NOT NULL,
			cursor TEXT,
			locked_by VARCHAR(120),
			locked_until TIMESTAMPTZ,
			records_inserted INTEGER NOT NULL,
			records_skipped INTEGER NOT NULL,
			normalization_scanned INTEGER NOT NULL,
			normalization_inserted INTEGER NOT NULL,
			normalization_updated INTEGER NOT NULL,
			started_at TIMESTAMPTZ,
			finished_at TIMESTAMPTZ,
			last_error TEXT,
			CONSTRAINT ux_backfill_windows_job_window_area UNIQUE (job_id, window_start, window_end, area_code)
		)`,
		`CREATE TABLE IF NOT EXISTS platform_history_snapshots (
			id VARCHAR(36) NOT NULL PRIMARY KEY,
			city VARCHAR(80) NOT NULL,
			snapshot_date DATE NOT NULL,
			category VARCHAR(32) NOT NULL,
			version VARCHAR(32) NOT NULL,
			payload JSONB NOT NULL,
			generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS telegram_webhook_updates (
			update_id INTEGER NOT NULL PRIMARY KEY,
			processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("ensure table: %w", err)
		}
	}
	return ensureRawObservations(ctx, tx)
}

func ensureRawObservations(ctx context.Context, tx pgx.Tx) error {
	var exists, partitioned bool
	if err := tx.QueryRow(ctx, `SELECT to_regclass('public.raw_observations') IS NOT NULL`).Scan(&exists); err != nil {
		return fmt.Errorf("inspect raw observations: %w", err)
	}
	if exists {
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM pg_partitioned_table
				WHERE partrelid = 'public.raw_observations'::regclass
			)`).Scan(&partitioned); err != nil {
			return fmt.Errorf("inspect raw observation partitioning: %w", err)
		}
	}
	if !exists {
		if _, err := tx.Exec(ctx, `
			CREATE TABLE raw_observations (
				id VARCHAR(36) NOT NULL,
				source_id VARCHAR(36) NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
				dataset VARCHAR(64) NOT NULL,
				area_code VARCHAR(64) NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				payload JSONB NOT NULL,
				hash VARCHAR(255) NOT NULL,
				ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				PRIMARY KEY (id, observed_at),
				UNIQUE (hash, observed_at)
			) PARTITION BY RANGE (observed_at)
		`); err != nil {
			return fmt.Errorf("create partitioned raw observations: %w", err)
		}
	} else if !partitioned {
		if _, err := tx.Exec(ctx, `
			ALTER TABLE raw_observations
				DROP CONSTRAINT IF EXISTS raw_observations_pkey,
				DROP CONSTRAINT IF EXISTS raw_observations_hash_key
		`); err != nil {
			return fmt.Errorf("prepare raw observation conversion: %w", err)
		}
		for _, index := range []string{"ix_raw_observations_source_observed_at", "ix_raw_observations_observed_at"} {
			if _, err := tx.Exec(ctx, "DROP INDEX IF EXISTS "+index); err != nil {
				return fmt.Errorf("drop legacy raw observation index %s: %w", index, err)
			}
		}
		if _, err := tx.Exec(ctx, `ALTER TABLE raw_observations RENAME TO raw_observations_unpartitioned_go`); err != nil {
			return fmt.Errorf("rename legacy raw observations: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TABLE raw_observations (
				id VARCHAR(36) NOT NULL,
				source_id VARCHAR(36) NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
				dataset VARCHAR(64) NOT NULL,
				area_code VARCHAR(64) NOT NULL,
				observed_at TIMESTAMPTZ NOT NULL,
				payload JSONB NOT NULL,
				hash VARCHAR(255) NOT NULL,
				ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				PRIMARY KEY (id, observed_at),
				UNIQUE (hash, observed_at)
			) PARTITION BY RANGE (observed_at)
		`); err != nil {
			return fmt.Errorf("create replacement raw observations: %w", err)
		}
		if _, err := tx.Exec(ctx, `CREATE TABLE raw_observations_default PARTITION OF raw_observations DEFAULT`); err != nil {
			return fmt.Errorf("create replacement raw observation default partition: %w", err)
		}
		if _, err := tx.Exec(ctx, `ALTER TABLE raw_observations_unpartitioned_go SET SCHEMA public`); err != nil {
			return fmt.Errorf("retain legacy raw observation schema: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO raw_observations (id, source_id, dataset, area_code, observed_at, payload, hash, ingested_at)
			SELECT id, source_id, dataset, area_code, observed_at, payload, hash, ingested_at
			FROM raw_observations_unpartitioned_go
			ON CONFLICT DO NOTHING
		`); err != nil {
			return fmt.Errorf("copy legacy raw observations: %w", err)
		}
		if _, err := tx.Exec(ctx, `DROP TABLE raw_observations_unpartitioned_go`); err != nil {
			return fmt.Errorf("drop legacy raw observations: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS raw_observations_default PARTITION OF raw_observations DEFAULT`); err != nil {
		return fmt.Errorf("ensure raw observation default partition: %w", err)
	}
	return nil
}

func ensureColumnsAndData(ctx context.Context, tx pgx.Tx) error {
	statements := []string{
		`ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS daily_at_local VARCHAR(5)`,
		`ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS advice_title_zh VARCHAR(200)`,
		`ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS advice_body_zh TEXT`,
		`UPDATE recommendations SET advice_title_zh = rationale #>> '{localized,zh,title}', advice_body_zh = rationale #>> '{localized,zh,body}' WHERE advice_title_zh IS NULL AND rationale IS NOT NULL AND rationale #>> '{localized,zh,title}' IS NOT NULL`,
		`ALTER TABLE public_recommendations ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(320)`,
		`WITH ranked AS (
			SELECT id,
				COALESCE(event_id, 'legacy:' || id) || ':' || lower(scenario_key::text) || ':' || lower(recommendation_kind::text) AS base_key,
				row_number() OVER (PARTITION BY COALESCE(event_id, 'legacy:' || id), scenario_key, recommendation_kind ORDER BY created_at ASC, id ASC) AS duplicate_rank
			FROM public_recommendations
		)
		UPDATE public_recommendations AS recommendation
		SET dedupe_key = CASE WHEN ranked.duplicate_rank = 1 THEN ranked.base_key ELSE ranked.base_key || ':legacy:' || ranked.id END,
			is_active = CASE WHEN ranked.duplicate_rank = 1 THEN recommendation.is_active ELSE FALSE END
		FROM ranked WHERE recommendation.id = ranked.id AND (recommendation.dedupe_key IS NULL OR recommendation.dedupe_key = '')`,
		`ALTER TABLE public_recommendations ALTER COLUMN dedupe_key SET NOT NULL`,
		`WITH ranked_events AS (
			SELECT id, row_number() OVER (PARTITION BY source_id, dedupe_key ORDER BY created_at DESC, id DESC) AS row_number
			FROM normalized_events
		)
		DELETE FROM normalized_events
		WHERE id IN (SELECT id FROM ranked_events WHERE row_number > 1)`,
		`WITH ranked AS (
			SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper
			FROM notification_channels
		), duplicate_subscriptions AS (
			SELECT subscription.id, row_number() OVER (PARTITION BY ranked.keeper, subscription.scenario_key ORDER BY subscription.id ASC) AS duplicate_rank
			FROM scenario_subscriptions AS subscription JOIN ranked ON ranked.id = subscription.channel_id
		)
		DELETE FROM scenario_subscriptions AS subscription USING duplicate_subscriptions AS duplicate
		WHERE subscription.id = duplicate.id AND duplicate.duplicate_rank > 1`,
		`WITH ranked AS (SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper FROM notification_channels)
		UPDATE scenario_subscriptions AS subscription SET channel_id = ranked.keeper FROM ranked WHERE subscription.channel_id = ranked.id AND ranked.id <> ranked.keeper`,
		`WITH ranked AS (
			SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper
			FROM notification_channels
		), duplicate_deliveries AS (
			SELECT delivery.id, row_number() OVER (PARTITION BY delivery.public_recommendation_id, ranked.keeper ORDER BY delivery.id ASC) AS duplicate_rank
			FROM public_deliveries AS delivery JOIN ranked ON ranked.id = delivery.channel_id
		)
		DELETE FROM public_deliveries AS delivery USING duplicate_deliveries AS duplicate
		WHERE delivery.id = duplicate.id AND duplicate.duplicate_rank > 1`,
		`WITH ranked AS (SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper FROM notification_channels)
		UPDATE public_deliveries AS delivery SET channel_id = ranked.keeper FROM ranked WHERE delivery.channel_id = ranked.id AND ranked.id <> ranked.keeper`,
		`WITH ranked AS (SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper FROM notification_channels)
		UPDATE notifications AS notification SET channel_id = ranked.keeper FROM ranked WHERE notification.channel_id = ranked.id AND ranked.id <> ranked.keeper`,
		`WITH ranked AS (SELECT id, first_value(id) OVER (PARTITION BY user_id, channel_type ORDER BY created_at ASC, id ASC) AS keeper FROM notification_channels)
		DELETE FROM notification_channels AS channel USING ranked WHERE channel.id = ranked.id AND ranked.id <> ranked.keeper`,
		`WITH duplicate_notifications AS (
			SELECT id, row_number() OVER (PARTITION BY recommendation_id, channel_id ORDER BY CASE WHEN delivery_status IN ('SENT', 'CLICKED') THEN 0 ELSE 1 END, created_at ASC, id ASC) AS duplicate_rank
			FROM notifications
		)
		DELETE FROM notifications AS notification USING duplicate_notifications AS duplicate
		WHERE notification.id = duplicate.id AND duplicate.duplicate_rank > 1`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("reconcile schema data: %w", err)
		}
	}
	return nil
}

func ensureIndexes(ctx context.Context, tx pgx.Tx) error {
	statements := []string{
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_regional_snapshots_scope_date ON regional_snapshots (area_scope, snapshot_date)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduled_jobs_enabled_next_run ON scheduled_jobs (is_enabled, next_run_at)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduled_jobs_lock ON scheduled_jobs (locked_until)`,
		`CREATE INDEX IF NOT EXISTS ix_collector_runs_source_started_at ON collector_runs (source_id, started_at)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_snapshots_user_date ON daily_snapshots (user_id, snapshot_date)`,
		`CREATE INDEX IF NOT EXISTS ix_normalized_events_location_starts_at ON normalized_events (location_ref, starts_at)`,
		`CREATE INDEX IF NOT EXISTS ix_normalized_events_type_starts_at ON normalized_events (event_type, starts_at)`,
		`CREATE INDEX IF NOT EXISTS ix_normalized_events_ends_at ON normalized_events (ends_at)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_normalized_events_source_dedupe ON normalized_events (source_id, dedupe_key)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_channels_user_type ON notification_channels (user_id, channel_type)`,
		`CREATE INDEX IF NOT EXISTS ix_raw_observations_source_observed_at ON raw_observations (source_id, observed_at)`,
		`CREATE INDEX IF NOT EXISTS ix_raw_observations_observed_at ON raw_observations (observed_at)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduled_job_runs_job_started ON scheduled_job_runs (job_id, started_at)`,
		`CREATE INDEX IF NOT EXISTS ix_scheduled_job_runs_finished_at ON scheduled_job_runs (finished_at)`,
		`CREATE INDEX IF NOT EXISTS ix_user_locations_user_created_at ON user_locations (user_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS ix_public_recommendations_kind_valid_from ON public_recommendations (recommendation_kind, valid_from)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_public_recommendations_dedupe_key ON public_recommendations (dedupe_key)`,
		`CREATE INDEX IF NOT EXISTS ix_recommendations_user_status_valid_from ON recommendations (user_id, status, valid_from)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_scenario_subscriptions_channel_key ON scenario_subscriptions (channel_id, scenario_key)`,
		`CREATE INDEX IF NOT EXISTS ix_user_commute_profiles_user_active_created ON user_commute_profiles (user_id, is_active, created_at)`,
		`CREATE INDEX IF NOT EXISTS ix_notifications_user_sent_at ON notifications (user_id, sent_at)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_recommendation_channel ON notifications (recommendation_id, channel_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_public_deliveries_recommendation_channel ON public_deliveries (public_recommendation_id, channel_id)`,
		`CREATE INDEX IF NOT EXISTS ix_rule_hits_user_hit_at ON rule_hits (user_id, hit_at)`,
		`CREATE INDEX IF NOT EXISTS ix_backfill_jobs_status_created ON backfill_jobs (status, created_at)`,
		`CREATE INDEX IF NOT EXISTS ix_backfill_jobs_source_range ON backfill_jobs (source_code, start_date, end_date)`,
		`CREATE INDEX IF NOT EXISTS ix_backfill_windows_job_start ON backfill_windows (job_id, window_start)`,
		`CREATE INDEX IF NOT EXISTS ix_backfill_windows_status_start ON backfill_windows (status, window_start)`,
		`CREATE INDEX IF NOT EXISTS ix_backfill_windows_lock ON backfill_windows (locked_until)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_history_snapshots_city_date_category_version ON platform_history_snapshots (city, snapshot_date, category, version)`,
		`CREATE INDEX IF NOT EXISTS ix_platform_history_snapshots_date_category ON platform_history_snapshots (snapshot_date, category)`,
		`CREATE INDEX IF NOT EXISTS ix_telegram_webhook_updates_processed_at ON telegram_webhook_updates (processed_at)`,
	}
	if _, err := tx.Exec(ctx, `DROP INDEX IF EXISTS ix_notification_channels_user_type`); err != nil {
		return fmt.Errorf("remove non-unique channel index: %w", err)
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return fmt.Errorf("ensure schema index: %w", err)
		}
	}
	return nil
}
