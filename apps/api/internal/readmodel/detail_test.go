package readmodel

import (
	"encoding/json"
	"testing"
)

func TestHistoricalDetailPreservesUnknownFieldsAndIsIdempotent(t *testing.T) {
	for _, category := range []string{"transit", "road_rail"} {
		t.Run(category, func(t *testing.T) {
			item := map[string]any{"id": "x", "severity": "CRITICAL", "starts_at": "2026-08-08T08:00:00Z", "ends_at": "2026-08-08T09:00:00Z", "active": false, "event_type": "road_weather"}
			field := "alerts"
			if category == "road_rail" {
				field = "incidents"
			}
			data := map[string]any{"checked_at": "2030-01-01T00:00:00Z", "time_scope": map[string]any{"reference_time": "2026-08-08T08:30:00Z"}, field: []any{item}, "future_field": "preserved"}
			if err := Detail(category, data); err != nil {
				t.Fatal(err)
			}
			if data["future_field"] != "preserved" {
				t.Fatal("lost unknown field")
			}
			event := data[field].([]any)[0].(map[string]any)
			if event["state"] != "active" || event["active"] != true {
				t.Fatalf("%+v", event)
			}
			before, _ := json.Marshal(data)
			if err := Detail(category, data); err != nil {
				t.Fatal(err)
			}
			after, _ := json.Marshal(data)
			if string(before) != string(after) {
				t.Fatal("non-idempotent enrichment")
			}
		})
	}
}
func TestMalformedSnapshotReturnsError(t *testing.T) {
	if Detail("weather", map[string]any{"points": "invalid"}) == nil {
		t.Fatal("silently accepted invalid snapshot")
	}
}
