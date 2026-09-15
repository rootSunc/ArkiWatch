package energy

import (
	"testing"
)

func TestHistoricalCostsUseSnapshotUsage(t *testing.T) {
	quality := map[string]any{"minimum_value": -5., "maximum_value": 20., "average_value": 10.}
	snapshot := map[string]any{"data": map[string]any{"unit": "c/kWh", "current_window": map[string]any{"usage_kwh": 3.}, "quality": quality}}
	EnrichHistoricalCosts(snapshot)
	if *quality["minimum_cost_eur"].(*float64) != -.15 || *quality["average_cost_eur"].(*float64) != .3 || quality["cost_status"] != "ready" {
		t.Fatalf("%+v", quality)
	}
	EnrichHistoricalCosts(snapshot)
	if *quality["average_cost_eur"].(*float64) != .3 {
		t.Fatal("upgrade must be idempotent")
	}
}
func TestHistoricalCostsDoNotInventUsage(t *testing.T) {
	quality := map[string]any{"average_value": 10.}
	snapshot := map[string]any{"data": map[string]any{"unit": "c/kWh", "quality": quality}}
	EnrichHistoricalCosts(snapshot)
	if quality["average_cost_eur"] != nil || quality["cost_status"] != "missing_usage" {
		t.Fatalf("%+v", quality)
	}
}
