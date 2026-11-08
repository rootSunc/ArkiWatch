package database

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
)

// maxPlatformEventsPerSource bounds how many events one source contributes to a
// platform read. Each category reads a handful of sources, so this is generous
// for a category list while keeping the whole response bounded.
const maxPlatformEventsPerSource = 40

func (store *Store) LoadWeather(ctx context.Context, query observations.WeatherQuery) (observations.WeatherData, error) {
	outlook, err := store.loadWeatherEvent(ctx, "weather_outlook", query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	rain, err := store.loadWeatherEvent(ctx, "rain_risk", query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	raw, err := store.loadLatestWeatherRaw(ctx, query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	return observations.WeatherData{Outlook: outlook, Rain: rain, Raw: raw}, nil
}

func (store *Store) LoadAirQuality(ctx context.Context, query airquality.Query) (airquality.Data, error) {
	event, err := store.loadAirQualityEvent(ctx, query)
	if err != nil {
		return airquality.Data{}, err
	}
	hsyRaw, err := store.loadAirQualityRaw(ctx, "hsy", query)
	if err != nil {
		return airquality.Data{}, err
	}
	openMeteoRaw, err := store.loadAirQualityRaw(ctx, "open_meteo_air", query)
	if err != nil {
		return airquality.Data{}, err
	}
	return airquality.Data{Event: event, HSYRaw: hsyRaw, OpenMeteoRaw: openMeteoRaw}, nil
}

func (store *Store) LoadEnergy(ctx context.Context, query energy.Query) (energy.Data, error) {
	price, err := store.loadEnergyRaw(ctx, "porssisahko", []string{"energy_price_timeseries"}, query)
	if err != nil {
		return energy.Data{}, err
	}
	grid, err := store.loadEnergyRaw(ctx, "fingrid", []string{"energy_timeseries", "dataset_probe"}, query)
	if err != nil {
		return energy.Data{}, err
	}
	eventSource := energy.GridSourceCode
	if query.SourceCode == energy.PriceSourceCode {
		eventSource = energy.PriceSourceCode
	}
	var event *observations.NormalizedEvent
	if query.Historical {
		event, err = store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = $3
			  AND e.event_type = 'cheap_energy_window'
			  AND e.ends_at > $1
			  AND e.starts_at < $2
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, *query.WindowStart, *query.WindowEnd, eventSource))
	} else {
		event, err = store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = $3
			  AND e.event_type = 'cheap_energy_window'
			  AND e.ends_at >= $1
			  AND e.starts_at <= $2
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, query.Now, query.Now.Add(energyLookahead(query)), eventSource))
	}
	if err != nil {
		return energy.Data{}, err
	}
	return energy.Data{Price: price, Grid: grid, Event: event}, nil
}

func energyLookahead(query energy.Query) time.Duration {
	if query.LookaheadHours > 0 {
		return time.Duration(query.LookaheadHours) * time.Hour
	}
	return 36 * time.Hour
}

func (store *Store) LoadTraffic(ctx context.Context, query traffic.Query) (traffic.Data, error) {
	raw, err := store.loadTrafficRaw(ctx, query)
	if err != nil {
		return traffic.Data{}, err
	}
	events, err := store.loadTrafficEvents(ctx, query)
	if err != nil {
		return traffic.Data{}, err
	}
	return traffic.Data{Raw: raw, Events: events}, nil
}

func transitAreaRefs(locationRef string) []string {
	if platform.IsCapitalRegionCity(locationRef) {
		if strings.EqualFold(locationRef, "helsinki") {
			return []string{"helsinki"}
		}
		return []string{strings.ToLower(strings.TrimSpace(locationRef)), "helsinki"}
	}
	if strings.TrimSpace(locationRef) == "" {
		return nil
	}
	return []string{strings.ToLower(strings.TrimSpace(locationRef))}
}

func (store *Store) LoadTransit(ctx context.Context, query observations.TransitQuery) (observations.TransitData, error) {
	args := []any{"digitransit", "service_alerts"}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1 AND r.dataset = $2`
	areaRefs := transitAreaRefs(query.LocationRef)
	if len(areaRefs) > 0 {
		statement += " AND LOWER(r.area_code) = ANY($3::text[])"
		args = append(args, areaRefs)
	}
	if query.WindowStart != nil && query.WindowEnd != nil {
		startArg, endArg := len(args)+1, len(args)+2
		statement += fmt.Sprintf(" AND r.observed_at >= $%d AND r.observed_at < $%d", startArg, endArg)
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.observed_at DESC LIMIT 1"
	raw, err := store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
	if err != nil {
		return observations.TransitData{}, err
	}
	start, end := query.Now.Add(-24*time.Hour), query.Now.Add(30*24*time.Hour)
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		start, end = *query.WindowStart, *query.WindowEnd
	}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'digitransit'
		  AND e.event_type = ANY($3::text[])
		  AND e.ends_at >= $1 AND e.starts_at <= $2
		  AND (cardinality($4::text[]) = 0 OR LOWER(e.location_ref) = ANY($4::text[]))
		ORDER BY e.starts_at DESC
	`, start, end, []string{"transit_delay", "transit_disruption"}, areaRefs)
	if err != nil {
		return observations.TransitData{}, err
	}
	defer rows.Close()
	events := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return observations.TransitData{}, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return observations.TransitData{}, err
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return observations.TransitData{}, err
	}
	return observations.TransitData{Raw: raw, Events: events}, nil
}

func (store *Store) LoadPlatform(ctx context.Context, query platform.PlatformQuery) (platform.PlatformData, error) {
	start, end := query.Now.Add(-6*time.Hour), query.Now.Add(48*time.Hour)
	capitalMetro := platform.IsCapitalRegionCity(query.LocationRef)
	args := []any{start, end, query.LocationRef, capitalMetro, maxPlatformEventsPerSource}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		args = []any{*query.WindowStart, *query.WindowEnd, query.LocationRef, capitalMetro, maxPlatformEventsPerSource}
	}
	// The cap is per source, not per result set. A single overall LIMIT lets one
	// talkative source take every slot: Linked Events publishes multi-year
	// exhibitions, some with a mistyped start (one upstream row begins in year
	// 0026), so ordering the whole set by starts_at put them first and left every
	// other category with zero events and an "empty" status.
	//
	// Within a source, severity leads so the per-source cap can never change the
	// status a category derives from its worst event. Clamping starts_at to the
	// window start then ranks what is already running ahead of what is still
	// upcoming, without letting an ancient or malformed start date outrank
	// anything.
	rows, err := store.pool.Query(ctx, `
		WITH scoped AS (
			SELECT e.id, e.event_type, s.source_code, e.severity::text AS severity, e.location_ref,
			       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at,
			       ROW_NUMBER() OVER (
			           PARTITION BY s.source_code
			           ORDER BY CASE e.severity::text
			                      WHEN 'HIGH' THEN 4
			                      WHEN 'MEDIUM' THEN 3
			                      WHEN 'LOW' THEN 2
			                      ELSE 1
			                    END DESC,
			                    GREATEST(e.starts_at, $1) ASC,
			                    e.id ASC
			       ) AS source_rank
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE e.ends_at >= $1
			  AND e.starts_at <= $2
			  AND ($3 = '' OR e.location_ref = $3 OR e.location_ref = 'finland' OR ($4 AND s.source_code = 'digitransit' AND e.location_ref = 'helsinki'))
		)
		SELECT id, event_type, source_code, severity, location_ref,
		       starts_at, ends_at, title, summary, attributes, created_at
		FROM scoped
		WHERE source_rank <= $5
		ORDER BY starts_at ASC
	`, args...)
	if err != nil {
		return platform.PlatformData{}, err
	}
	defer rows.Close()
	events := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return platform.PlatformData{}, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return platform.PlatformData{}, err
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return platform.PlatformData{}, err
	}
	stats := []platform.RawStat{}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		statRows, err := store.pool.Query(ctx, `
			SELECT s.source_code, r.dataset, r.area_code, COUNT(*), MAX(r.observed_at)
			FROM raw_observations AS r
			JOIN data_sources AS s ON s.id = r.source_id
			WHERE r.observed_at >= $1 AND r.observed_at < $2
			GROUP BY s.source_code, r.dataset, r.area_code
		`, *query.WindowStart, *query.WindowEnd)
		if err != nil {
			return platform.PlatformData{}, err
		}
		defer statRows.Close()
		for statRows.Next() {
			var item platform.RawStat
			var count int
			var latest time.Time
			if err := statRows.Scan(&item.SourceCode, &item.Dataset, &item.AreaCode, &count, &latest); err != nil {
				return platform.PlatformData{}, err
			}
			item.Count, item.LatestAt = count, &latest
			stats = append(stats, item)
		}
		if err := statRows.Err(); err != nil {
			return platform.PlatformData{}, err
		}
	}
	return platform.PlatformData{Events: events, RawStat: stats}, nil
}

func (store *Store) loadTrafficRaw(ctx context.Context, query traffic.Query) ([]observations.RawObservation, error) {
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = 'digitraffic'
		  AND r.dataset = 'traffic_messages'
	`
	args := []any{}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $1 AND r.observed_at < $2 ORDER BY r.observed_at DESC"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	} else {
		latest, err := store.pool.Query(ctx, statement+" ORDER BY r.observed_at DESC LIMIT 1", args...)
		if err != nil {
			return nil, err
		}
		var latestAt time.Time
		if latest.Next() {
			var dataset, area string
			var payload []byte
			if err := latest.Scan(&dataset, &area, &latestAt, &payload); err != nil {
				latest.Close()
				return nil, err
			}
		}
		if err := latest.Err(); err != nil {
			latest.Close()
			return nil, err
		}
		latest.Close()
		if latestAt.IsZero() {
			return []observations.RawObservation{}, nil
		}
		statement += " AND r.observed_at >= $1 ORDER BY r.observed_at DESC"
		args = append(args, latestAt.Add(-5*time.Minute))
	}
	rows, err := store.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []observations.RawObservation{}
	seen := map[string]struct{}{}
	for rows.Next() {
		item, err := scanRawObservationRow(rows)
		if err != nil {
			return nil, err
		}
		messageType := item.Payload["message_type"]
		key, ok := messageType.(string)
		if !ok || key == "" {
			key = "traffic_messages"
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) loadTrafficEvents(ctx context.Context, query traffic.Query) ([]observations.NormalizedEvent, error) {
	start, end := query.Now.Add(-24*time.Hour), query.Now.Add(30*24*time.Hour)
	args := []any{start, end}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		start, end = *query.WindowStart, *query.WindowEnd
		args = []any{start, end}
	}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'digitraffic'
		  AND e.event_type = ANY($3::text[])
		  AND e.ends_at >= $1
		  AND e.starts_at <= $2
		ORDER BY e.starts_at DESC
	`, args[0], args[1], []string{"road_disruption", "road_weather_risk", "rail_delay", "marine_disruption"})
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return nil, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return nil, err
			}
		}
		result = append(result, event)
	}
	return result, rows.Err()
}

func scanRawObservationRow(row interface{ Scan(...any) error }) (observations.RawObservation, error) {
	var item observations.RawObservation
	var payload []byte
	if err := row.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
		return observations.RawObservation{}, err
	}
	item.Payload = map[string]any{}
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return observations.RawObservation{}, err
		}
	}
	return item, nil
}

func (store *Store) loadEnergyRaw(ctx context.Context, sourceCode string, datasets []string, query energy.Query) (observations.RawObservation, error) {
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1
		  AND r.dataset = ANY($2::text[])
	`
	args := []any{sourceCode, datasets}
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $3::timestamptz - INTERVAL '1 day' AND r.observed_at < $4::timestamptz"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.observed_at DESC LIMIT 1"
	return store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
}

func (store *Store) loadAirQualityEvent(ctx context.Context, query airquality.Query) (*observations.NormalizedEvent, error) {
	eventTypes := []string{"air_quality_status", "air_quality_poor"}
	if query.WindowStart != nil && query.WindowEnd != nil {
		return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'hsy'
			  AND e.event_type = ANY($1::text[])
			  AND e.location_ref = $2
			  AND e.starts_at >= $3
			  AND e.starts_at < $4
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, eventTypes, query.LocationRef, *query.WindowStart, *query.WindowEnd))
	}

	current, err := store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'hsy'
		  AND e.event_type = ANY($1::text[])
		  AND e.location_ref = $2
		  AND e.ends_at >= $3
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventTypes, query.LocationRef, query.Now))
	if err != nil && !IsNotFound(err) {
		return nil, err
	}
	if current != nil {
		return current, nil
	}
	return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'hsy'
		  AND e.event_type = ANY($1::text[])
		  AND e.location_ref = $2
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventTypes, query.LocationRef))
}

func (store *Store) loadAirQualityRaw(ctx context.Context, sourceCode string, query airquality.Query) (observations.RawObservation, error) {
	areaRefs := []string{strings.ToLower(strings.TrimSpace(query.LocationRef))}
	if sourceCode == "hsy" && platform.IsCapitalRegionCity(query.LocationRef) && !strings.EqualFold(query.LocationRef, "helsinki") {
		areaRefs = append(areaRefs, "helsinki")
	}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1
		  AND r.dataset = 'air_quality_current'
		  AND LOWER(r.area_code) = ANY($2::text[])
	`
	args := []any{sourceCode, areaRefs, strings.ToLower(strings.TrimSpace(query.LocationRef))}
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $4 AND r.observed_at < $5"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY (LOWER(r.area_code) = $3) DESC, r.observed_at DESC LIMIT 1"
	return store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
}

func (store *Store) scanRawObservation(row rowScanner) (observations.RawObservation, error) {
	var item observations.RawObservation
	var payload []byte
	if err := row.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
		if IsNotFound(err) {
			return observations.RawObservation{}, nil
		}
		return observations.RawObservation{}, err
	}
	item.Payload = make(map[string]any)
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return observations.RawObservation{}, err
		}
	}
	return item, nil
}

func (store *Store) loadWeatherEvent(ctx context.Context, eventType string, query observations.WeatherQuery) (*observations.NormalizedEvent, error) {
	if query.WindowStart != nil && query.WindowEnd != nil {
		return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'fmi'
			  AND e.event_type = $1
			  AND e.location_ref = $2
			  AND e.starts_at < $3
			  AND e.ends_at >= $4
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, eventType, query.LocationRef, *query.WindowEnd, *query.WindowStart))
	}

	current, err := store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'fmi'
		  AND e.event_type = $1
		  AND e.location_ref = $2
		  AND e.ends_at >= $3
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventType, query.LocationRef, query.Now))
	if err != nil && !IsNotFound(err) {
		return nil, err
	}
	if current != nil {
		return current, nil
	}
	return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'fmi'
		  AND e.event_type = $1
		  AND e.location_ref = $2
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventType, query.LocationRef))
}

func (store *Store) scanWeatherEvent(row rowScanner) (*observations.NormalizedEvent, error) {
	var event observations.NormalizedEvent
	var attributes []byte
	err := row.Scan(
		&event.ID,
		&event.EventType,
		&event.SourceCode,
		&event.Severity,
		&event.LocationRef,
		&event.StartsAt,
		&event.EndsAt,
		&event.Summary,
		&attributes,
	)
	if err != nil {
		if IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	event.Attributes = make(map[string]any)
	if len(attributes) > 0 {
		if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
			return nil, err
		}
	}
	return &event, nil
}

func (store *Store) loadLatestWeatherRaw(ctx context.Context, query observations.WeatherQuery) (map[string]observations.RawObservation, error) {
	datasets := []string{
		"weather_forecast_raw",
		"weather_observations_raw",
		"weather_warnings_cap",
		"weather_radar_capabilities",
	}
	args := []any{datasets, []string{query.LocationRef, "finland"}}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = 'fmi'
		  AND r.dataset = ANY($1::text[])
		  AND r.area_code = ANY($2::text[])
	`
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $3 AND r.observed_at < $4"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.dataset ASC, r.observed_at DESC"
	rows, err := store.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	latest := make(map[string]observations.RawObservation)
	for rows.Next() {
		var item observations.RawObservation
		var payload []byte
		if err := rows.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
			return nil, err
		}
		if _, exists := latest[item.Dataset]; exists {
			continue
		}
		item.Payload = make(map[string]any)
		if len(payload) > 0 {
			if err := json.Unmarshal(payload, &item.Payload); err != nil {
				return nil, err
			}
		}
		latest[item.Dataset] = item
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return latest, nil
}
