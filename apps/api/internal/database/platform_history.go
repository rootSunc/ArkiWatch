package database

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/readmodel"
)

type PlatformHistoryReader interface {
	LoadPlatformHistory(context.Context, string, *time.Time, int, time.Time, []string) (map[string]any, error)
	LoadPlatformHistoryAvailability(context.Context, string, *time.Time, int, time.Time) (map[string]any, error)
	LoadPlatformEvent(context.Context, string) (map[string]any, error)
}

func (store *Store) LoadPlatformHistory(ctx context.Context, city string, targetDate *time.Time, days int, now time.Time, selected []string) (map[string]any, error) {
	if days < 1 {
		days = 1
	}
	if days > 31 {
		days = 31
	}
	anchor := now.UTC().Truncate(24 * time.Hour)
	if targetDate != nil {
		anchor = targetDate.UTC().Truncate(24 * time.Hour)
	}
	startDate := anchor.AddDate(0, 0, -(days - 1))
	statement := `
		SELECT snapshot_date, category, payload
		FROM platform_history_snapshots
		WHERE city = $1 AND version = 'v1' AND snapshot_date >= $2::date AND snapshot_date <= $3::date`
	args := []any{city, startDate.Format("2006-01-02"), anchor.Format("2006-01-02")}
	if len(selected) > 0 {
		statement += ` AND category = ANY($4::text[])`
		args = append(args, selected)
	}
	statement += ` ORDER BY snapshot_date ASC, category ASC`
	rows, err := store.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	payloads := map[string]map[string]map[string]any{}
	for rows.Next() {
		var snapshotDate time.Time
		var category string
		var payloadBytes []byte
		if err := rows.Scan(&snapshotDate, &category, &payloadBytes); err != nil {
			rows.Close()
			return nil, err
		}
		var payload map[string]any
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			continue
		}
		if data, ok := payload["data"].(map[string]any); ok {
			if err := readmodel.Detail(category, data); err != nil {
				payload["data"] = nil
				payload["error"] = category + " history snapshot has invalid detail data."
			}
		}
		if category == "energy" || category == "household_energy" {
			energy.EnrichHistoricalCosts(payload)
		}
		if payloads[category] == nil {
			payloads[category] = map[string]map[string]any{}
		}
		payloads[category][snapshotDate.Format("2006-01-02")] = payload
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	categories := []string{"weather", "air_quality", "energy", "household_energy", "road_rail", "transit"}
	wanted := map[string]struct{}{}
	for _, category := range selected {
		wanted[category] = struct{}{}
	}
	result := map[string]any{}
	for _, category := range categories {
		if len(wanted) > 0 {
			if _, ok := wanted[category]; !ok {
				result[category] = []map[string]any{}
				continue
			}
		}
		items := make([]map[string]any, 0, days)
		for index := 0; index < days; index++ {
			dateValue := startDate.AddDate(0, 0, index).Format("2006-01-02")
			if payload, ok := payloads[category][dateValue]; ok {
				items = append(items, payload)
			} else {
				items = append(items, map[string]any{"date": dateValue, "data": nil, "error": category + " history snapshot is not ready yet."})
			}
		}
		result[category] = items
	}
	return result, nil
}

func (store *Store) LoadPlatformHistoryAvailability(ctx context.Context, city string, targetDate *time.Time, days int, now time.Time) (map[string]any, error) {
	if days < 1 {
		days = 1
	}
	if days > 90 {
		days = 90
	}
	anchor := now.UTC().Truncate(24 * time.Hour)
	if targetDate != nil {
		anchor = targetDate.UTC().Truncate(24 * time.Hour)
	}
	startDate := anchor.AddDate(0, 0, -(days - 1))
	rows, err := store.pool.Query(ctx, `
		SELECT DATE(r.observed_at AT TIME ZONE 'UTC'), s.source_code, r.dataset, COUNT(*)
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE r.observed_at >= $1 AND r.observed_at < $2
		  AND ($3 = '' OR lower(r.area_code) = lower($3) OR lower(r.area_code) = 'finland'
		       OR ($4 AND s.source_code IN ('hsy', 'digitransit') AND lower(r.area_code) = 'helsinki'))
		GROUP BY DATE(r.observed_at AT TIME ZONE 'UTC'), s.source_code, r.dataset
		ORDER BY DATE(r.observed_at AT TIME ZONE 'UTC') ASC
	`, startDate, anchor.AddDate(0, 0, 1), city, platform.IsCapitalRegionCity(city))
	if err != nil {
		return nil, err
	}
	type bucket struct {
		count      int
		sources    map[string]struct{}
		datasets   map[string]struct{}
		categories map[string]struct{}
	}
	buckets := map[string]*bucket{}
	for rows.Next() {
		var dateValue time.Time
		var sourceCode, dataset string
		var count int
		if err := rows.Scan(&dateValue, &sourceCode, &dataset, &count); err != nil {
			rows.Close()
			return nil, err
		}
		key := dateValue.Format("2006-01-02")
		if buckets[key] == nil {
			buckets[key] = &bucket{sources: map[string]struct{}{}, datasets: map[string]struct{}{}, categories: map[string]struct{}{}}
		}
		item := buckets[key]
		item.count += count
		item.sources[sourceCode] = struct{}{}
		item.datasets[dataset] = struct{}{}
		for _, category := range sourceCategories(sourceCode) {
			item.categories[category] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	daysResult := make([]map[string]any, 0, days)
	for index := 0; index < days; index++ {
		dateValue := startDate.AddDate(0, 0, index).Format("2006-01-02")
		item := map[string]any{"date": dateValue, "has_data": false, "record_count": 0, "source_codes": []string{}, "categories": []string{}, "datasets": []string{}}
		if bucket := buckets[dateValue]; bucket != nil {
			item["has_data"] = bucket.count > 0
			item["record_count"] = bucket.count
			item["source_codes"] = sortedSet(bucket.sources)
			item["categories"] = sortedSet(bucket.categories)
			item["datasets"] = sortedSet(bucket.datasets)
		}
		daysResult = append(daysResult, item)
	}
	return map[string]any{"checked_at": now.UTC().Format(time.RFC3339Nano), "city": city, "days": daysResult}, nil
}

func (store *Store) LoadPlatformEvent(ctx context.Context, eventID string) (map[string]any, error) {
	var id, eventType, sourceCode, severity, title, summary string
	var startsAt, endsAt time.Time
	var attributesBytes []byte
	err := store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.title, e.summary,
		       e.starts_at, e.ends_at, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE e.id = $1
	`, eventID).Scan(&id, &eventType, &sourceCode, &severity, &title, &summary, &startsAt, &endsAt, &attributesBytes)
	if err == pgx.ErrNoRows {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}
	attributes := map[string]any{}
	if len(attributesBytes) > 0 {
		_ = json.Unmarshal(attributesBytes, &attributes)
	}
	return map[string]any{"id": id, "category_key": categoryForEvent(eventType), "event_type": eventType, "title": title, "body": summary, "severity": severity, "starts_at": startsAt.UTC().Format(time.RFC3339Nano), "ends_at": endsAt.UTC().Format(time.RFC3339Nano), "source_codes": []string{sourceCode}, "evidence": []string{summary}, "attributes": attributes}, nil
}

func sourceCategories(source string) []string {
	switch source {
	case "fmi":
		return []string{"weather"}
	case "hsy", "open_meteo_air":
		return []string{"air_quality"}
	case "porssisahko", "fingrid":
		return []string{"energy"}
	case "digitraffic":
		return []string{"road_rail"}
	case "digitransit":
		return []string{"transit"}
	default:
		return []string{}
	}
}

func sortedSet(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	// The order is deliberately stable for API responses and snapshot tests.
	for i := 1; i < len(result); i++ {
		for j := i; j > 0 && result[j] < result[j-1]; j-- {
			result[j], result[j-1] = result[j-1], result[j]
		}
	}
	return result
}
