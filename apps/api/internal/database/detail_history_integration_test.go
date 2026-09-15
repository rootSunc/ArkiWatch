package database

import (
	"context"
	"testing"
	"time"
)

func TestLegacyDetailHistoryUsesRecordedTimeWithoutRewriting(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	city := "go-detail-history-" + randomID()
	date := time.Date(2026, 8, 8, 0, 0, 0, 0, time.UTC)
	t.Cleanup(func() { _, _ = store.pool.Exec(ctx, "DELETE FROM platform_history_snapshots WHERE city=$1", city) })
	for _, category := range []string{"weather", "air_quality", "transit", "road_rail"} {
		data := map[string]any{"checked_at": "2026-08-08T08:30:00Z", "time_scope": map[string]any{"reference_time": "2026-08-08T08:30:00Z"}, "future_field": "keep"}
		switch category {
		case "weather":
			data["points"] = []any{map[string]any{"timestamp": "2026-08-08T08:00:00Z", "wind_gust_ms": 14.}}
		case "air_quality":
			data["stations"] = []any{map[string]any{"station": "x", "score": 4, "pm2_5": 25.}}
		default:
			key := "alerts"
			if category == "road_rail" {
				key = "incidents"
			}
			data[key] = []any{map[string]any{"id": "x", "severity": "HIGH", "active": false, "starts_at": "2026-08-08T08:00:00Z", "ends_at": "2026-08-08T09:00:00Z"}}
		}
		if err := store.upsertHistorySnapshot(ctx, city, category, date, map[string]any{"date": "2026-08-08", "data": data, "error": nil}); err != nil {
			t.Fatal(err)
		}
	}
	result, err := store.LoadPlatformHistory(ctx, city, &date, 1, date.AddDate(10, 0, 0))
	if err != nil {
		t.Fatal(err)
	}
	for _, category := range []string{"weather", "air_quality", "transit", "road_rail"} {
		data := result[category].([]map[string]any)[0]["data"].(map[string]any)
		if data["future_field"] != "keep" {
			t.Fatal("lost original snapshot field")
		}
		if category == "weather" {
			advisories := data["advisories"].([]any)
			if len(advisories) != 1 || advisories[0].(map[string]any)["state"] != "active" {
				t.Fatalf("%+v", advisories)
			}
		} else if data["detail"] == nil {
			t.Fatalf("missing %s detail", category)
		}
	}
	var changed int
	if err := store.pool.QueryRow(ctx, `SELECT count(*) FROM platform_history_snapshots WHERE city=$1 AND ((payload->'data') ? 'detail' OR (payload->'data') ? 'advisories')`, city).Scan(&changed); err != nil {
		t.Fatal(err)
	}
	if changed != 0 {
		t.Fatal("read path rewrote persisted evidence")
	}
}

func TestMalformedDetailSnapshotDoesNotHideOtherHistory(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	city := "go-invalid-detail-" + randomID()
	date := time.Date(2026, 8, 8, 0, 0, 0, 0, time.UTC)
	t.Cleanup(func() { _, _ = store.pool.Exec(ctx, "DELETE FROM platform_history_snapshots WHERE city=$1", city) })
	for category, data := range map[string]map[string]any{"weather": {"points": "invalid"}, "transit": {"alerts": []any{}, "checked_at": "2026-08-08T08:00:00Z"}} {
		if err := store.upsertHistorySnapshot(ctx, city, category, date, map[string]any{"date": "2026-08-08", "data": data, "error": nil}); err != nil {
			t.Fatal(err)
		}
	}
	result, err := store.LoadPlatformHistory(ctx, city, &date, 1, date)
	if err != nil {
		t.Fatal(err)
	}
	weather := result["weather"].([]map[string]any)[0]
	transit := result["transit"].([]map[string]any)[0]
	if weather["data"] != nil || weather["error"] == nil || transit["data"] == nil {
		t.Fatalf("weather=%+v transit=%+v", weather, transit)
	}
}
