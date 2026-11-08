package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
)

func (store *Store) ListSourceStatus(ctx context.Context) ([]sources.Status, error) {
	return store.ListSourceStatusAt(ctx, time.Now().UTC())
}

func (store *Store) ListSourceStatusAt(ctx context.Context, now time.Time) ([]sources.Status, error) {
	location, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		return nil, err
	}
	today := now.In(location)
	firstDay := today.AddDate(0, 0, -6).Format("2006-01-02")
	rows, err := store.pool.Query(ctx, `
		SELECT
			s.id,
			s.source_code,
			s.source_name,
			s.endpoint,
			s.auth_type::text,
			s.poll_interval_seconds,
			s.is_active,
			r.status,
			r.started_at,
			r.finished_at,
			r.records_ingested,
			r.error_message,
      success.finished_at,
      history.days
		FROM data_sources AS s
		LEFT JOIN LATERAL (
			SELECT CASE WHEN finished_at IS NULL OR finished_at > $3 THEN 'running' ELSE status END AS status,
        started_at,
        CASE WHEN finished_at <= $3 THEN finished_at END AS finished_at,
        CASE WHEN finished_at <= $3 THEN records_ingested ELSE 0 END AS records_ingested,
        CASE WHEN finished_at <= $3 THEN error_message END AS error_message
			FROM collector_runs
			WHERE source_id = s.id AND started_at <= $3
			ORDER BY started_at DESC
			LIMIT 1
		) AS r ON TRUE
    LEFT JOIN LATERAL (
      SELECT finished_at FROM collector_runs
      WHERE source_id = s.id AND status = 'succeeded' AND finished_at IS NOT NULL AND finished_at <= $3
      ORDER BY finished_at DESC LIMIT 1
    ) AS success ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.date) AS days FROM (
        SELECT day::date::text AS date,
          count(r.id)::int AS runs,
          count(r.id) FILTER (WHERE r.status = 'succeeded' AND r.finished_at <= $3)::int AS succeeded,
          count(r.id) FILTER (WHERE r.status = 'failed' AND r.finished_at <= $3)::int AS failed,
          count(r.id) FILTER (WHERE r.finished_at IS NULL OR r.finished_at > $3)::int AS running,
          count(r.id) FILTER (WHERE r.status = 'degraded' AND r.finished_at <= $3)::int AS degraded
        FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') AS day
        LEFT JOIN collector_runs AS r ON r.source_id = s.id
          AND r.started_at >= (day AT TIME ZONE 'Europe/Helsinki')
          AND r.started_at < ((day + interval '1 day') AT TIME ZONE 'Europe/Helsinki')
          AND r.started_at <= $3
        GROUP BY day
      ) AS daily
    ) AS history ON TRUE
		ORDER BY s.source_code ASC
	`, firstDay, today.Format("2006-01-02"), now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]sources.Status, 0)
	for rows.Next() {
		var source sources.Status
		var runStatus, startedAt, errorMessage sql.NullString
		var recordsIngested sql.NullInt64
		var startedAtTime, finishedAtTime, lastSuccessfulTime sql.NullTime
		var historyJSON []byte
		if err := rows.Scan(
			&source.ID,
			&source.SourceCode,
			&source.SourceName,
			&source.Endpoint,
			&source.AuthType,
			&source.PollIntervalSeconds,
			&source.IsActive,
			&runStatus,
			&startedAtTime,
			&finishedAtTime,
			&recordsIngested,
			&errorMessage,
			&lastSuccessfulTime,
			&historyJSON,
		); err != nil {
			return nil, err
		}
		if lastSuccessfulTime.Valid {
			value := formatTime(lastSuccessfulTime.Time)
			source.LastSuccessfulRunAt = &value
		}
		if err := json.Unmarshal(historyJSON, &source.RunHistory); err != nil {
			return nil, fmt.Errorf("decode source run history: %w", err)
		}
		if runStatus.Valid {
			startedAt = sql.NullString{String: formatTime(startedAtTime.Time), Valid: startedAtTime.Valid}
			var finishedAtValue *string
			if finishedAtTime.Valid {
				value := formatTime(finishedAtTime.Time)
				finishedAtValue = &value
			}
			source.LastRun = &sources.CollectorRun{
				Status:          runStatus.String,
				StartedAt:       startedAt.String,
				FinishedAt:      finishedAtValue,
				RecordsIngested: int(recordsIngested.Int64),
				ErrorMessage:    publicCollectionError(errorMessage),
			}
		}
		result = append(result, source)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func publicCollectionError(errorMessage sql.NullString) *string {
	if !errorMessage.Valid || strings.TrimSpace(errorMessage.String) == "" {
		return nil
	}
	redacted := "The latest collection attempt failed; provider details are not exposed."
	return &redacted
}
