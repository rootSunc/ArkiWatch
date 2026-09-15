// Package readmodel upgrades persisted and offline read models without rewriting snapshots.
package readmodel

import (
	"encoding/json"
	"fmt"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

func enrich[T any](data map[string]any, fn func(*T), fields ...string) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	var value T
	if err = json.Unmarshal(raw, &value); err != nil {
		return err
	}
	fn(&value)
	raw, err = json.Marshal(value)
	if err != nil {
		return err
	}
	var updated map[string]any
	if err = json.Unmarshal(raw, &updated); err != nil {
		return err
	}
	for _, key := range fields {
		data[key] = updated[key]
	}
	return nil
}

// Detail preserves unknown fields and derives only from the recorded response.
func Detail(category string, data map[string]any) error {
	if data == nil {
		return nil
	}
	var err error
	switch category {
	case "weather":
		err = enrich(data, weather.EnrichDetail, "points", "advisories", "warnings")
	case "air_quality", "airQuality":
		err = enrich(data, airquality.EnrichDetail, "stations", "detail", "worst_score")
	case "transit":
		err = enrich(data, transit.EnrichDetail, "alerts", "detail")
	case "road_rail", "roadRail":
		err = enrich(data, traffic.EnrichDetail, "incidents", "detail")
	case "overview":
		err = enrich(data, platform.EnrichDetail, "categories", "recent_events")
	}
	if err != nil {
		return fmt.Errorf("enrich %s detail: %w", category, err)
	}
	return nil
}
