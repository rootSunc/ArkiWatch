package database

import (
	"context"
	"testing"
	"time"
)

func TestLegacyEnergyHistoryCostsAreEnrichedWithoutRewritingSnapshot(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	city := "go-cost-history-" + randomID()
	date := time.Date(2026, 8, 8, 0, 0, 0, 0, time.UTC)
	t.Cleanup(func() { _, _ = store.pool.Exec(ctx, "DELETE FROM platform_history_snapshots WHERE city = $1", city) })
	payload := map[string]any{"date": "2026-08-08", "error": nil, "data": map[string]any{"unit": "c/kWh", "current_window": map[string]any{"usage_kwh": 3.}, "quality": map[string]any{"minimum_value": -5., "maximum_value": 20., "average_value": 10.}}}
	if err := store.upsertHistorySnapshot(ctx, city, "household_energy", date, payload); err != nil {
		t.Fatal(err)
	}
	result, err := store.LoadPlatformHistory(ctx, city, &date, 1, date, nil)
	if err != nil {
		t.Fatal(err)
	}
	items := result["household_energy"].([]map[string]any)
	data := items[0]["data"].(map[string]any)
	quality := data["quality"].(map[string]any)
	if cost, ok := quality["average_cost_eur"].(*float64); !ok || *cost != .3 {
		t.Fatalf("unexpected historical cost: %+v", quality)
	}
	var changed bool
	if err := store.pool.QueryRow(ctx, `SELECT (payload->'data'->'quality') ? 'average_cost_eur' FROM platform_history_snapshots WHERE city=$1`, city).Scan(&changed); err != nil {
		t.Fatal(err)
	}
	if changed {
		t.Fatal("read compatibility must not rewrite stored evidence")
	}
}
