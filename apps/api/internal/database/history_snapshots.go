package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

// PlatformHistorySnapshotVersion is the payload contract stored alongside every
// snapshot row. LoadPlatformHistory only reads rows at this version, so bumping
// it retires the previous generation without a migration.
const PlatformHistorySnapshotVersion = "v1"

// PlatformHistorySnapshotDayCount is how far back a refresh rebuilds. Snapshots
// are cheap to recompute and late-arriving observations keep changing recent
// days, so the whole window is rewritten on every run.
const PlatformHistorySnapshotDayCount = 7

var platformHistoryCategories = []string{"weather", "air_quality", "energy", "household_energy", "road_rail", "transit"}

type HistorySnapshotResult struct {
	Cities, Days, Snapshots, Errors int
}

// RefreshPlatformHistorySnapshots materializes the per-day read models that
// /api/platform/history serves. The endpoint reads only from this table, so
// without a refresh pass the history view stays empty forever.
func (store *Store) RefreshPlatformHistorySnapshots(ctx context.Context, cfg config.Config, cities []string, now time.Time) (HistorySnapshotResult, error) {
	result := HistorySnapshotResult{Cities: len(cities)}
	anchor := now.UTC().Truncate(24 * time.Hour)
	for _, city := range cities {
		for offset := PlatformHistorySnapshotDayCount - 1; offset >= 0; offset-- {
			day := anchor.AddDate(0, 0, -offset)
			result.Days++
			for _, category := range platformHistoryCategories {
				payload := store.historySnapshotPayload(ctx, cfg, city, category, day, now)
				if payload["error"] != nil {
					result.Errors++
				}
				if err := store.upsertHistorySnapshot(ctx, city, category, day, payload); err != nil {
					return result, err
				}
				result.Snapshots++
			}
		}
	}
	return result, nil
}

// historySnapshotPayload mirrors the shape LoadPlatformHistory hands back: the
// day, the read model for it, and a readiness message when it could not build.
func (store *Store) historySnapshotPayload(ctx context.Context, cfg config.Config, city, category string, day, now time.Time) map[string]any {
	data, err := store.historyReadModel(ctx, cfg, city, category, day, now)
	payload := map[string]any{"date": day.Format("2006-01-02"), "data": nil, "error": nil}
	if err != nil {
		payload["error"] = category + " history snapshot is not ready yet."
		return payload
	}
	// The read models are the same structs the live endpoints serialize, so a
	// JSON round-trip keeps the stored payload byte-identical to the API shape.
	encoded, err := json.Marshal(data)
	if err != nil {
		payload["error"] = category + " history snapshot is not ready yet."
		return payload
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		payload["error"] = category + " history snapshot is not ready yet."
		return payload
	}
	payload["data"] = decoded
	return payload
}

func (store *Store) upsertHistorySnapshot(ctx context.Context, city, category string, day time.Time, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode %s history snapshot: %w", category, err)
	}
	_, err = store.pool.Exec(ctx, `
		INSERT INTO platform_history_snapshots (id, city, snapshot_date, category, version, payload, generated_at)
		VALUES ($1, $2, $3::date, $4, $5, $6, $7)
		ON CONFLICT (city, snapshot_date, category, version)
		DO UPDATE SET payload = EXCLUDED.payload, generated_at = EXCLUDED.generated_at
	`, randomID(), city, day.Format("2006-01-02"), category, PlatformHistorySnapshotVersion, encoded, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("upsert %s history snapshot: %w", category, err)
	}
	return nil
}

// historyReadModel rebuilds one category's read model for a past day using the
// same builders the live endpoints use, so a stored snapshot and a live response
// for the same date agree field for field.
func (store *Store) historyReadModel(ctx context.Context, cfg config.Config, city, category string, day, now time.Time) (any, error) {
	scope, err := timescope.Build(&day, now, cfg.Timezone)
	if err != nil {
		return nil, err
	}
	historical := scope.Mode == "historical"
	switch category {
	case "weather":
		data, err := store.LoadWeather(ctx, observations.WeatherQuery{Now: now, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd})
		if err != nil {
			return nil, err
		}
		result := weather.Build(data, scope, now)
		if result.Location == nil {
			result.Location = &city
		}
		return result, nil
	case "air_quality":
		data, err := store.LoadAirQuality(ctx, airquality.Query{Now: now, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd})
		if err != nil {
			return nil, err
		}
		return airquality.Build(data, scope, now, city), nil
	case "energy":
		return store.energyReadModel(ctx, cfg, scope, now, "fingrid", historical)
	case "household_energy":
		return store.energyReadModel(ctx, cfg, scope, now, "porssisahko", historical)
	case "road_rail":
		data, err := store.LoadTraffic(ctx, traffic.Query{Now: now, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: historical})
		if err != nil {
			return nil, err
		}
		return traffic.Build(data, scope, now, city), nil
	case "transit":
		data, err := store.LoadTransit(ctx, observations.TransitQuery{Now: now, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: historical})
		if err != nil {
			return nil, err
		}
		return transit.Build(data, scope, now, city), nil
	}
	return nil, fmt.Errorf("unknown platform history category %q", category)
}

func (store *Store) energyReadModel(ctx context.Context, cfg config.Config, scope timescope.Scope, now time.Time, sourceCode string, historical bool) (any, error) {
	data, err := store.LoadEnergy(ctx, energy.Query{Now: now, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, SourceCode: sourceCode, Historical: historical, LookaheadHours: cfg.SnapshotLookaheadHours})
	if err != nil {
		return nil, err
	}
	return energy.Build(data, scope, now, sourceCode, cfg), nil
}
