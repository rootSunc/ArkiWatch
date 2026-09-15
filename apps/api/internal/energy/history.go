package energy

// EnrichHistoricalCosts upgrades a stored read model in memory. Older snapshots
// predate the cost summary fields. Use their recorded consumption assumption,
// never today's configuration, so historical costs remain reproducible.
func EnrichHistoricalCosts(snapshot map[string]any) {
	data, ok := snapshot["data"].(map[string]any)
	if !ok {
		return
	}
	quality, ok := data["quality"].(map[string]any)
	if !ok {
		return
	}
	if _, exists := quality["average_cost_eur"]; exists {
		return
	}
	quality["minimum_cost_eur"], quality["maximum_cost_eur"], quality["average_cost_eur"] = nil, nil, nil
	quality["cost_status"] = "not_price_series"
	unit, _ := data["unit"].(string)
	if !isPriceUnit(unit) {
		return
	}
	window, _ := data["current_window"].(map[string]any)
	usage := numberPointer(window["usage_kwh"])
	if usage == nil {
		quality["cost_status"] = "missing_usage"
		return
	}
	quality["cost_status"] = "missing_price_data"
	for _, pair := range [][2]string{{"minimum_value", "minimum_cost_eur"}, {"maximum_value", "maximum_cost_eur"}, {"average_value", "average_cost_eur"}} {
		if value := numberPointer(quality[pair[0]]); value != nil {
			quality[pair[1]] = estimatedCost(value, *usage)
			if pair[0] == "average_value" {
				quality["cost_status"] = "ready"
			}
		}
	}
}
