package energy

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestPricePointsAndWindowSupportHouseholdCost(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	prices := []any{}
	for hour, value := range []float64{8.2, 3.1, 3.4, 12.0} {
		prices = append(prices, map[string]any{
			"startDate": now.Add(time.Duration(hour) * time.Hour).Format(time.RFC3339),
			"endDate":   now.Add(time.Duration(hour+1) * time.Hour).Format(time.RFC3339),
			"price":     value,
		})
	}
	raw := observations.RawObservation{Dataset: PriceDataset, ObservedAt: now, Payload: map[string]any{"body": map[string]any{"unit": PriceUnit, "prices": prices}}}
	points := pointsFromRaw(raw, now, now.Add(6*time.Hour))
	cfg := config.DefaultConfig()
	window := windowFromPoints(points, PriceUnit, nil, cfg)

	if len(points) != 4 || window == nil {
		t.Fatalf("points=%d window=%#v", len(points), window)
	}
	if window.AverageValue != 3.25 || window.EstimatedCostEUR == nil || *window.EstimatedCostEUR != 0.065 {
		t.Fatalf("unexpected price window: %#v", window)
	}
}

func TestWindowSelectionPrefersSustainedRelativeLowPeriod(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	data := []any{}
	for hour, value := range []float64{20, 18, 4, 17, 12, 11, 12, 19} {
		data = append(data, map[string]any{
			"startTime": now.Add(time.Duration(hour) * time.Hour).Format(time.RFC3339),
			"endTime":   now.Add(time.Duration(hour+1) * time.Hour).Format(time.RFC3339),
			"value":     value,
		})
	}
	raw := observations.RawObservation{Dataset: "energy_timeseries", ObservedAt: now, Payload: map[string]any{"body": map[string]any{"unit": "EUR/MWh", "data": data}}}
	points := pointsFromRaw(raw, now, now.Add(10*time.Hour))
	window := windowFromPoints(points, "EUR/MWh", nil, config.DefaultConfig())

	if window == nil || window.StartsAt != timescope.Format(now.Add(4*time.Hour)) || window.EndsAt != timescope.Format(now.Add(7*time.Hour)) || window.PointCount != 3 {
		t.Fatalf("unexpected sustained window: %#v", window)
	}
	if window.AverageValue != 11.667 || window.SavingsVsAveragePct == nil || *window.SavingsVsAveragePct != 17.4 {
		t.Fatalf("unexpected sustained metrics: %#v", window)
	}
}
