package database

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/normalizer"
)

type NormalizeResult struct {
	Scanned  int
	Inserted int
	Updated  int
}

type SnapshotResult struct{ Users int }

func (store *Store) RefreshDailySnapshots(ctx context.Context, now time.Time) (SnapshotResult, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT u.id, u.timezone, COALESCE(l.city, ''), COALESCE(l.label, ''), COALESCE(l.district, '')
		FROM users AS u
		LEFT JOIN LATERAL (
			SELECT city, label, district FROM user_locations
			WHERE user_id = u.id AND is_default = TRUE ORDER BY created_at DESC LIMIT 1
		) AS l ON TRUE
		WHERE u.status = 'ACTIVE'
	`)
	if err != nil {
		return SnapshotResult{}, err
	}
	type snapshotUser struct{ id, timezone, city, label, district string }
	users := []snapshotUser{}
	for rows.Next() {
		var user snapshotUser
		if err := rows.Scan(&user.id, &user.timezone, &user.city, &user.label, &user.district); err != nil {
			rows.Close()
			return SnapshotResult{}, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return SnapshotResult{}, err
	}
	rows.Close()
	result := SnapshotResult{}
	for _, user := range users {
		location, err := time.LoadLocation(user.timezone)
		if err != nil {
			location = time.UTC
		}
		localDate := now.UTC().In(location).Format("2006-01-02")
		refs := []string{strings.ToLower(user.city), strings.ToLower(user.label)}
		if user.district != "" {
			refs = append(refs, strings.ToLower(user.district))
		}
		eventRows, err := store.pool.Query(ctx, `
			SELECT event_type, title, summary, severity::text, ends_at
			FROM normalized_events
			WHERE ends_at >= $1 AND starts_at <= $2
			  AND location_type IN ('CITY'::location_type, 'DISTRICT'::location_type)
			  AND LOWER(location_ref) = ANY($3::text[])
			  AND event_type = ANY($4::text[])
			ORDER BY starts_at ASC
		`, now.UTC(), now.UTC().Add(18*time.Hour), refs, []string{"rain_risk", "weather_outlook", "air_quality_poor", "air_quality_status", "transit_delay", "transit_disruption", "cheap_energy_window"})
		if err != nil {
			return result, err
		}
		type card struct {
			Type, Title, Summary, Severity string
			ValidTo                        time.Time
		}
		cardsByType := map[string][]card{}
		for eventRows.Next() {
			var item card
			if err := eventRows.Scan(&item.Type, &item.Title, &item.Summary, &item.Severity, &item.ValidTo); err != nil {
				eventRows.Close()
				return result, err
			}
			cardsByType[item.Type] = append(cardsByType[item.Type], item)
		}
		if err := eventRows.Err(); err != nil {
			eventRows.Close()
			return result, err
		}
		eventRows.Close()
		cardSpecs := []struct {
			key, title, titleZH, empty, emptyZH string
			types                               []string
		}{{"weather", "Weather", "天气", "No normalized weather signal is available yet.", "暂时没有可用的标准化天气信号。", []string{"rain_risk", "weather_outlook"}}, {"commute", "Commute", "通勤", "Commute events will appear after transit alerts are normalized.", "标准化公共交通告警后，这里会显示通勤事件。", []string{"transit_delay", "transit_disruption"}}, {"energy", "Energy", "能源", "Energy windows will appear after electricity data is normalized.", "标准化电力数据后，这里会显示适合安排用电的时段。", []string{"cheap_energy_window"}}, {"air", "Air Quality", "空气质量", "No normalized air-quality signal is available yet.", "暂时没有可用的标准化空气质量信号。", []string{"air_quality_poor", "air_quality_status"}}}
		cards := []map[string]any{}
		for _, spec := range cardSpecs {
			selected := []card{}
			for _, kind := range spec.types {
				selected = append(selected, cardsByType[kind]...)
			}
			sort.SliceStable(selected, func(i, j int) bool {
				rank := map[string]int{"HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}
				if rank[selected[i].Severity] != rank[selected[j].Severity] {
					return rank[selected[i].Severity] > rank[selected[j].Severity]
				}
				return selected[i].ValidTo.Before(selected[j].ValidTo)
			})
			summary := spec.empty
			summaryZH := spec.emptyZH
			severity := "info"
			var validTo any
			if len(selected) > 0 {
				if len(selected) > 2 {
					selected = selected[:2]
				}
				parts := []string{}
				for _, item := range selected {
					parts = append(parts, item.Summary)
				}
				summary = strings.Join(parts, " ")
				// Event summaries are normalized in English only, so drop the
				// Chinese empty-state sentence once real signals are present:
				// the client falls back to the English summary when this is
				// blank, which beats telling a reader there is no signal.
				summaryZH = ""
				severity = strings.ToLower(selected[0].Severity)
				validTo = selected[0].ValidTo.UTC().Format(time.RFC3339Nano)
			}
			item := map[string]any{"type": spec.key, "title": spec.title, "title_zh": spec.titleZH, "summary": summary, "summary_zh": summaryZH, "severity": severity}
			if validTo != nil {
				item["valid_to"] = validTo
			}
			cards = append(cards, item)
		}
		payload, err := json.Marshal(map[string]any{"date": localDate, "location": user.city, "cards": cards, "notifications": []any{}})
		if err != nil {
			return result, err
		}
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO daily_snapshots (id, user_id, snapshot_date, summary, generated_at)
			VALUES ($1, $2, $3::date, $4::jsonb, $5)
			ON CONFLICT (user_id, snapshot_date) DO UPDATE SET summary = EXCLUDED.summary, generated_at = EXCLUDED.generated_at
		`, randomID(), user.id, localDate, payload, now.UTC()); err != nil {
			return result, err
		}
		result.Users++
	}
	return result, nil
}

type PersistResult struct {
	Inserted int
	Skipped  int
}

func (store *Store) PersistObservations(ctx context.Context, sourceCode string, items []collectors.Observation) (PersistResult, error) {
	if len(items) == 0 {
		return PersistResult{}, nil
	}
	var sourceID string
	if err := store.pool.QueryRow(ctx, `SELECT id FROM data_sources WHERE source_code = $1`, sourceCode).Scan(&sourceID); err != nil {
		return PersistResult{}, err
	}
	seen := map[string]struct{}{}
	result := PersistResult{}
	for _, item := range items {
		key := item.Hash + "|" + item.ObservedAt.UTC().Format(time.RFC3339Nano)
		if _, exists := seen[key]; exists {
			result.Skipped++
			continue
		}
		seen[key] = struct{}{}
		payload, err := json.Marshal(item.Payload)
		if err != nil {
			return PersistResult{}, err
		}
		command, err := store.pool.Exec(ctx, `
			INSERT INTO raw_observations (id, source_id, dataset, area_code, observed_at, payload, hash)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
			ON CONFLICT (hash, observed_at) DO NOTHING
		`, randomID(), sourceID, item.Dataset, item.AreaCode, item.ObservedAt.UTC(), payload, item.Hash)
		if err != nil {
			return PersistResult{}, err
		}
		if command.RowsAffected() == 0 {
			result.Skipped++
		} else {
			result.Inserted++
		}
	}
	return result, nil
}

func (store *Store) AppendCollectorRun(ctx context.Context, sourceCode, dataset, status string, startedAt, finishedAt time.Time, records int, errorMessage *string) error {
	var sourceID string
	if err := store.pool.QueryRow(ctx, `SELECT id FROM data_sources WHERE source_code = $1`, sourceCode).Scan(&sourceID); err != nil {
		return err
	}
	_, err := store.pool.Exec(ctx, `
		INSERT INTO collector_runs (id, source_id, dataset, status, started_at, finished_at, records_ingested, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, randomID(), sourceID, dataset, status, startedAt.UTC(), finishedAt.UTC(), records, errorMessage)
	return err
}

// NormalizeObservations materializes recent raw observations into the
// normalized_events rows the HTTP API and scheduler read. It is
// intentionally source-code scoped so collectors can be rolled out one
// provider at a time.
func (store *Store) NormalizeObservations(ctx context.Context, windowStart, windowEnd time.Time, sourceCode string) (NormalizeResult, error) {
	return store.NormalizeObservationsLimited(ctx, windowStart, windowEnd, sourceCode, 0)
}

// NormalizeObservationsLimited caps how many raw rows one pass reads. A run
// after a large backfill can otherwise pull an entire window into memory at
// once; batchSize <= 0 keeps the unbounded behaviour.
func (store *Store) NormalizeObservationsLimited(ctx context.Context, windowStart, windowEnd time.Time, sourceCode string, batchSize int) (NormalizeResult, error) {
	if !windowEnd.After(windowStart) {
		return NormalizeResult{}, fmt.Errorf("normalization window must end after it starts")
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return NormalizeResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	query := `
		SELECT s.source_code, r.dataset, r.area_code, r.observed_at, r.payload, r.hash
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE r.observed_at >= $1 AND r.observed_at < $2`
	args := []any{windowStart.UTC(), windowEnd.UTC()}
	if strings.TrimSpace(sourceCode) != "" {
		query += ` AND s.source_code = $3`
		args = append(args, sourceCode)
	}
	query += ` ORDER BY r.observed_at DESC`
	if batchSize > 0 {
		query += ` LIMIT ` + strconv.Itoa(batchSize)
	}
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return NormalizeResult{}, err
	}
	type rawItem struct {
		source string
		item   collectors.Observation
	}
	items := []rawItem{}
	for rows.Next() {
		var item collectors.Observation
		var resolvedSource string
		var payloadBytes []byte
		if err := rows.Scan(&resolvedSource, &item.Dataset, &item.AreaCode, &item.ObservedAt, &payloadBytes, &item.Hash); err != nil {
			return NormalizeResult{}, err
		}
		if err := json.Unmarshal(payloadBytes, &item.Payload); err != nil {
			return NormalizeResult{}, err
		}
		items = append(items, rawItem{source: resolvedSource, item: item})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return NormalizeResult{}, err
	}
	rows.Close()

	result := NormalizeResult{Scanned: len(items)}
	for _, raw := range items {
		for _, draft := range normalizer.Normalize(raw.item, raw.source) {
			attributes, marshalErr := json.Marshal(draft.Attributes)
			if marshalErr != nil {
				return NormalizeResult{}, marshalErr
			}
			var inserted bool
			err = tx.QueryRow(ctx, `
				INSERT INTO normalized_events
					(id, event_type, source_id, severity, location_type, location_ref,
					 starts_at, ends_at, confidence, title, summary, attributes, dedupe_key)
				SELECT $1, $2, s.id, $3::severity, $4::location_type, $5,
				       $6, $7, $8, $9, $10, $11::jsonb, $12
				FROM data_sources AS s
				WHERE s.source_code = $13
				ON CONFLICT (source_id, dedupe_key) DO UPDATE SET
					event_type = EXCLUDED.event_type,
					severity = EXCLUDED.severity,
					location_type = EXCLUDED.location_type,
					location_ref = EXCLUDED.location_ref,
					starts_at = EXCLUDED.starts_at,
					ends_at = EXCLUDED.ends_at,
					confidence = EXCLUDED.confidence,
					title = EXCLUDED.title,
					summary = EXCLUDED.summary,
					attributes = EXCLUDED.attributes
				RETURNING (xmax = 0)
			`, randomID(), draft.EventType, draft.Severity, draft.LocationType, draft.LocationRef,
				draft.StartsAt.UTC(), draft.EndsAt.UTC(), draft.Confidence, draft.Title, draft.Summary,
				attributes, draft.DedupeKey, raw.source).Scan(&inserted)
			if err != nil {
				return NormalizeResult{}, err
			}
			if inserted {
				result.Inserted++
			} else {
				result.Updated++
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return NormalizeResult{}, err
	}
	return result, nil
}

func (store *Store) sourceCodeForObservation(ctx context.Context, tx pgx.Tx, item collectors.Observation) (string, error) {
	var sourceCode string
	err := tx.QueryRow(ctx, `
		SELECT s.source_code
		FROM data_sources AS s
		JOIN raw_observations AS r ON r.source_id = s.id
		WHERE r.dataset = $1 AND r.area_code = $2 AND r.observed_at = $3 AND r.hash = $4
		LIMIT 1
	`, item.Dataset, item.AreaCode, item.ObservedAt.UTC(), item.Hash).Scan(&sourceCode)
	return sourceCode, err
}
