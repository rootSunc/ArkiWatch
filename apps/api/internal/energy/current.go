package energy

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

const (
	PriceSourceCode = "porssisahko"
	GridSourceCode  = "fingrid"
	PriceDataset    = "energy_price_timeseries"
	PriceUnit       = "c/kWh"
)

var GridDatasets = []string{"energy_timeseries", "dataset_probe"}

type Point struct {
	StartsAt time.Time
	EndsAt   time.Time
	Value    float64
}

type Window struct {
	StartsAt            string   `json:"starts_at"`
	EndsAt              string   `json:"ends_at"`
	AverageValue        float64  `json:"average_value"`
	MinimumValue        float64  `json:"minimum_value"`
	MaximumValue        float64  `json:"maximum_value"`
	Unit                *string  `json:"unit"`
	PointCount          int      `json:"point_count"`
	Severity            string   `json:"severity"`
	Source              string   `json:"source"`
	EstimatedCostEUR    *float64 `json:"estimated_cost_eur"`
	UsageKWh            *float64 `json:"usage_kwh"`
	ThresholdValue      *float64 `json:"threshold_value"`
	HorizonAverageValue *float64 `json:"horizon_average_value"`
	SavingsVsAveragePct *float64 `json:"savings_vs_average_pct"`
	SelectionStrategy   *string  `json:"selection_strategy"`
}

type EnergyPoint struct {
	StartsAt         string   `json:"starts_at"`
	EndsAt           string   `json:"ends_at"`
	Value            float64  `json:"value"`
	Unit             *string  `json:"unit"`
	EstimatedCostEUR *float64 `json:"estimated_cost_eur"`
}

type Metric struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	LabelKey string  `json:"label_key"`
	Value    string  `json:"value"`
	Unit     *string `json:"unit"`
}

type SourceRequest struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Status      string  `json:"status"`
	Endpoint    *string `json:"endpoint"`
	ContentType *string `json:"content_type"`
	FetchedAt   *string `json:"fetched_at"`
}

type DataStage struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Status      string  `json:"status"`
	Detail      string  `json:"detail"`
	RecordCount *int    `json:"record_count"`
	UpdatedAt   *string `json:"updated_at"`
}

type Quality struct {
	CostStatus       string   `json:"cost_status"`
	MinimumCostEUR   *float64 `json:"minimum_cost_eur"`
	MaximumCostEUR   *float64 `json:"maximum_cost_eur"`
	AverageCostEUR   *float64 `json:"average_cost_eur"`
	PointCount       int      `json:"point_count"`
	WindowPointCount int      `json:"window_point_count"`
	FieldCoveragePct float64  `json:"field_coverage_pct"`
	MinimumValue     *float64 `json:"minimum_value"`
	MaximumValue     *float64 `json:"maximum_value"`
	AverageValue     *float64 `json:"average_value"`
	MissingFields    []string `json:"missing_fields"`
	Notes            []string `json:"notes"`
}

type Current struct {
	CheckedAt      string          `json:"checked_at"`
	TimeScope      map[string]any  `json:"time_scope"`
	Status         string          `json:"status"`
	Location       *string         `json:"location"`
	SourceCode     string          `json:"source_code"`
	ProviderName   *string         `json:"provider_name"`
	ObservedAt     *string         `json:"observed_at"`
	ValidFrom      *string         `json:"valid_from"`
	ValidTo        *string         `json:"valid_to"`
	Summary        *string         `json:"summary"`
	Unit           *string         `json:"unit"`
	CurrentWindow  *Window         `json:"current_window"`
	Metrics        []Metric        `json:"metrics"`
	Points         []EnergyPoint   `json:"points"`
	SourceRequests []SourceRequest `json:"source_requests"`
	DataPipeline   []DataStage     `json:"data_pipeline"`
	Quality        Quality         `json:"quality"`
}

type Data struct {
	Price observations.RawObservation
	Grid  observations.RawObservation
	Event *observations.NormalizedEvent
}

type Query struct {
	Now         time.Time
	WindowStart *time.Time
	WindowEnd   *time.Time
	SourceCode  string
	Historical  bool
	// LookaheadHours bounds how far ahead a live read looks for the next
	// cheap-energy window. Zero falls back to the previous fixed horizon.
	LookaheadHours int
}

type selection struct {
	Points              []Point
	ThresholdValue      float64
	HorizonAverageValue float64
	SavingsVsAveragePct *float64
	Strategy            string
}

func Build(data Data, scope timescope.Scope, now time.Time, sourceCode string, cfg config.Config) Current {
	now = now.UTC()
	targetStart, targetEnd := displayWindow(scope, now)
	priceUnit := energyUnit(data.Price.Payload["body"])
	if priceUnit == "" {
		priceUnit = PriceUnit
	}
	gridUnit := energyUnit(data.Grid.Payload["body"])
	pricePoints := pointsFromRaw(data.Price, targetStart, targetEnd)
	if isPriceUnit(priceUnit) {
		pricePoints = addHouseholdComponents(pricePoints, cfg)
	}
	gridPoints := pointsFromRaw(data.Grid, targetStart, targetEnd)
	guidanceTime := (*time.Time)(nil)
	if scope.Mode == "live" {
		guidanceTime = &scope.ReferenceTime
	}
	priceWindow := windowFromPoints(pricePoints, priceUnit, guidanceTime, cfg)
	gridWindow := windowFromPoints(gridPoints, gridUnit, guidanceTime, cfg)
	if data.Event != nil {
		gridWindow = windowFromEvent(data.Event, gridPoints, gridUnit, cfg)
	}

	priceRequest := sourceRequest(data.Price, PriceDataset, cfg.HouseholdElectricityProvider+" household price forecast")
	gridRequest := sourceRequest(data.Grid, "energy_timeseries", "Fingrid energy timeseries")
	usingPrice := len(pricePoints) > 0
	responseSource, raw, unit, points, sourceLabel, window, sourceRequests, selectedRequest := GridSourceCode, data.Grid, gridUnit, gridPoints, "Fingrid", gridWindow, []SourceRequest{priceRequest, gridRequest}, gridRequest
	if usingPrice {
		responseSource, raw, unit, points, sourceLabel, window, selectedRequest = PriceSourceCode, data.Price, priceUnit, pricePoints, cfg.HouseholdElectricityProvider+" household price", priceWindow, priceRequest
	}
	if sourceCode == PriceSourceCode {
		responseSource, raw, unit, points, sourceLabel, window, sourceRequests, selectedRequest = PriceSourceCode, data.Price, priceUnit, pricePoints, cfg.HouseholdElectricityProvider+" household price", priceWindow, []SourceRequest{priceRequest}, priceRequest
	} else if sourceCode == GridSourceCode {
		responseSource, raw, unit, points, sourceLabel, window, sourceRequests, selectedRequest = GridSourceCode, data.Grid, nonEmpty(gridUnit, PriceUnit), gridPoints, "Fingrid", gridWindow, []SourceRequest{gridRequest}, gridRequest
	}
	quality := qualityFrom(raw, points, window, unit, sourceLabel)
	quality.CostStatus = "not_price_series"
	if isPriceUnit(unit) {
		quality.MinimumCostEUR = estimatedCost(quality.MinimumValue, cfg.HouseholdUsageKWh)
		quality.MaximumCostEUR = estimatedCost(quality.MaximumValue, cfg.HouseholdUsageKWh)
		quality.AverageCostEUR = estimatedCost(quality.AverageValue, cfg.HouseholdUsageKWh)
		quality.CostStatus = "missing_price_data"
		if quality.AverageCostEUR != nil {
			quality.CostStatus = "ready"
		}
	}
	provider := (*string)(nil)
	if responseSource == PriceSourceCode {
		provider = stringPointer(cfg.HouseholdElectricityProvider)
	}
	location := raw.AreaCode
	if location == "" {
		location = strings.ToLower(cfg.DefaultPlace)
	}
	observed := rawTime(raw)
	validFrom, validTo := windowTimes(window)
	status := "empty"
	if window != nil {
		status = "ready"
	} else if len(points) > 0 {
		status = "partial"
	}
	return Current{
		CheckedAt: timescope.Format(now), TimeScope: scope.Payload(), Status: status, Location: stringPointer(location), SourceCode: responseSource, ProviderName: provider, ObservedAt: observed,
		ValidFrom: validFrom, ValidTo: validTo, Summary: summary(window), Unit: stringPointerIf(unit), CurrentWindow: window,
		Metrics: metrics(window, quality, unit, cfg), Points: pointReads(points, unit, cfg), SourceRequests: sourceRequests,
		DataPipeline: dataPipeline(selectedRequest, points, window, sourceLabel), Quality: quality,
	}
}

func Unavailable(scope timescope.Scope, now time.Time) Current {
	return Current{CheckedAt: timescope.Format(now.UTC()), TimeScope: scope.Payload(), Status: "unavailable", SourceCode: GridSourceCode, Summary: stringPointer("Energy data is temporarily unavailable."), Metrics: []Metric{}, Points: []EnergyPoint{}, SourceRequests: []SourceRequest{}, DataPipeline: []DataStage{}}
}

func displayWindow(scope timescope.Scope, now time.Time) (time.Time, time.Time) {
	if scope.WindowStart != nil && scope.WindowEnd != nil {
		return *scope.WindowStart, *scope.WindowEnd
	}
	return now.Add(-6 * time.Hour), now.Add(36 * time.Hour)
}

func pointsFromRaw(raw observations.RawObservation, start, end time.Time) []Point {
	if raw.Dataset == "" {
		return []Point{}
	}
	points := finalizePoints(extractPoints(raw.Payload["body"]))
	result := make([]Point, 0, len(points))
	for _, point := range points {
		if point.EndsAt.After(start) && point.StartsAt.Before(end) {
			result = append(result, point)
		}
	}
	return result
}

func extractPoints(value any) []Point {
	if text, ok := value.(string); ok {
		var decoded any
		if json.Unmarshal([]byte(text), &decoded) == nil {
			value = decoded
		}
	}
	switch typed := value.(type) {
	case []any:
		result := []Point{}
		for _, item := range typed {
			result = append(result, extractPoints(item)...)
		}
		return result
	case map[string]any:
		result := []Point{}
		if point, ok := pointFromMap(typed); ok {
			result = append(result, point)
		}
		for _, key := range []string{"data", "prices", "values", "items", "results", "measurements", "timeSeries", "series"} {
			if nested, exists := typed[key]; exists {
				result = append(result, extractPoints(nested)...)
			}
		}
		return result
	default:
		return []Point{}
	}
}

func pointFromMap(item map[string]any) (Point, bool) {
	start := firstTime(item, "startTime", "start_time", "start_time_utc", "start", "timestamp", "time", "dateTime", "datetime", "startDate", "start_date", "periodStart", "validFrom")
	if start == nil {
		return Point{}, false
	}
	end := firstTime(item, "endTime", "end_time", "end_time_utc", "end", "endDate", "end_date", "periodEnd", "validTo")
	value := firstNumber(item, "value", "price", "amount", "measurement", "y", "Value", "Price")
	if value == nil {
		return Point{}, false
	}
	return Point{StartsAt: *start, EndsAt: valueTime(end), Value: *value}, true
}

func finalizePoints(points []Point) []Point {
	unique := map[string]Point{}
	for _, point := range points {
		unique[point.StartsAt.Format(time.RFC3339Nano)+fmt.Sprintf("|%.12f", point.Value)] = point
	}
	sorted := make([]Point, 0, len(unique))
	for _, point := range unique {
		sorted = append(sorted, point)
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].StartsAt.Before(sorted[j].StartsAt) })
	for index := range sorted {
		end := sorted[index].EndsAt
		if end.IsZero() && index+1 < len(sorted) {
			end = sorted[index+1].StartsAt
		}
		if end.IsZero() {
			end = sorted[index].StartsAt.Add(time.Hour)
		}
		if end.Before(sorted[index].StartsAt) || end.Equal(sorted[index].StartsAt) {
			end = sorted[index].StartsAt.Add(time.Hour)
		}
		sorted[index].EndsAt = end
	}
	return sorted
}

func windowFromEvent(event *observations.NormalizedEvent, points []Point, unit string, cfg config.Config) *Window {
	if event == nil {
		return nil
	}
	attrs := event.Attributes
	selected := []Point{}
	for _, point := range points {
		if point.EndsAt.After(event.StartsAt) && point.StartsAt.Before(event.EndsAt) {
			selected = append(selected, point)
		}
	}
	values := pointValues(selected)
	average := numberValue(attrs["average_value"])
	minimum := numberPointer(attrs["minimum_value"])
	maximum := numberPointer(attrs["maximum_value"])
	if len(values) > 0 {
		average = averageOf(values)
		minimum, maximum = minMax(values)
	}
	pointCount := intValue(attrs["window_point_count"])
	if pointCount == 0 {
		pointCount = len(selected)
		if pointCount == 0 {
			pointCount = 1
		}
	}
	windowUnit := nonEmpty(textValue(attrs["unit"]), unit)
	return makeWindow(event.StartsAt, event.EndsAt, average, minimum, maximum, pointCount, windowUnit, event.Severity, "event", cfg, numberPointer(attrs["threshold_value"]), numberPointer(attrs["horizon_average_value"]), numberPointer(attrs["savings_vs_average_pct"]), stringPointerIf(textValue(attrs["selection_strategy"])))
}

func windowFromPoints(points []Point, unit string, reference *time.Time, cfg config.Config) *Window {
	selectionPoints := points
	if reference != nil {
		selectionPoints = []Point{}
		for _, point := range points {
			if point.EndsAt.After(*reference) {
				selectionPoints = append(selectionPoints, point)
			}
		}
	}
	if len(selectionPoints) < 2 {
		return nil
	}
	chosen := selectLowWindow(selectionPoints)
	values := pointValues(chosen.Points)
	start := chosen.Points[0].StartsAt
	end := chosen.Points[0].EndsAt
	for _, point := range chosen.Points[1:] {
		if point.EndsAt.After(end) {
			end = point.EndsAt
		}
	}
	return makeWindow(start, end, averageOf(values), minMaxValues(values), maxMaxValues(values), len(chosen.Points), unit, "INFO", "raw_preview", cfg, floatPointer(chosen.ThresholdValue), floatPointer(chosen.HorizonAverageValue), chosen.SavingsVsAveragePct, stringPointer(chosen.Strategy))
}

func selectLowWindow(points []Point) selection {
	values := pointValues(points)
	horizon := averageOf(values)
	sortedValues := append([]float64(nil), values...)
	sort.Float64s(sortedValues)
	candidateCount := len(sortedValues)/3 + 1
	if candidateCount < 2 {
		candidateCount = 2
	}
	index := candidateCount - 1
	if index >= len(sortedValues) {
		index = len(sortedValues) - 1
	}
	threshold := math.Min(horizon, sortedValues[index])
	if groups := sustainedGroups(contiguousGroups(points, threshold)); len(groups) > 0 {
		group := bestGroup(groups)
		return makeSelection(group, threshold, horizon, "sustained_relative_low")
	}
	if groups := sustainedGroups(contiguousGroups(points, horizon)); len(groups) > 0 {
		group := bestGroup(groups)
		return makeSelection(group, horizon, horizon, "sustained_below_average")
	}
	group := []Point{points[0]}
	for _, point := range points[1:] {
		if point.Value < group[0].Value || (point.Value == group[0].Value && point.StartsAt.Before(group[0].StartsAt)) {
			group = []Point{point}
		}
	}
	return makeSelection(group, threshold, horizon, "lowest_point_fallback")
}

func contiguousGroups(points []Point, threshold float64) [][]Point {
	groups := [][]Point{}
	current := []Point{}
	var previousEnd time.Time
	for _, point := range points {
		if point.Value > threshold {
			if len(current) > 0 {
				groups = append(groups, current)
				current = nil
			}
			previousEnd = time.Time{}
			continue
		}
		if len(current) > 0 && !previousEnd.IsZero() && point.StartsAt.Sub(previousEnd) > time.Second {
			groups = append(groups, current)
			current = nil
		}
		current = append(current, point)
		previousEnd = point.EndsAt
	}
	if len(current) > 0 {
		groups = append(groups, current)
	}
	return groups
}

func sustainedGroups(groups [][]Point) [][]Point {
	result := [][]Point{}
	for _, group := range groups {
		if len(group) > 0 && group[len(group)-1].EndsAt.Sub(group[0].StartsAt) >= 2*time.Hour {
			result = append(result, group)
		}
	}
	return result
}

func bestGroup(groups [][]Point) []Point {
	best := groups[0]
	for _, group := range groups[1:] {
		bestAvg := averageOf(pointValues(best))
		groupAvg := averageOf(pointValues(group))
		bestDuration := best[len(best)-1].EndsAt.Sub(best[0].StartsAt)
		groupDuration := group[len(group)-1].EndsAt.Sub(group[0].StartsAt)
		if groupAvg < bestAvg || (groupAvg == bestAvg && groupDuration > bestDuration) || (groupAvg == bestAvg && groupDuration == bestDuration && group[0].StartsAt.Before(best[0].StartsAt)) {
			best = group
		}
	}
	return best
}

func makeSelection(points []Point, threshold, horizon float64, strategy string) selection {
	var savings *float64
	if horizon != 0 {
		value := (horizon - averageOf(pointValues(points))) / math.Abs(horizon) * 100
		savings = &value
	}
	return selection{Points: points, ThresholdValue: threshold, HorizonAverageValue: horizon, SavingsVsAveragePct: savings, Strategy: strategy}
}

func makeWindow(start, end time.Time, average float64, minimum, maximum *float64, count int, unit, severity, source string, cfg config.Config, threshold, horizon, savings *float64, strategy *string) *Window {
	average = round(average, 3)
	if minimum == nil {
		minimum = floatPointer(average)
	}
	if maximum == nil {
		maximum = floatPointer(average)
	}
	window := &Window{StartsAt: timescope.Format(start), EndsAt: timescope.Format(end), AverageValue: average, MinimumValue: round(*minimum, 3), MaximumValue: round(*maximum, 3), Unit: stringPointerIf(unit), PointCount: count, Severity: nonEmpty(severity, "INFO"), Source: source, ThresholdValue: roundPointer(threshold, 3), HorizonAverageValue: roundPointer(horizon, 3), SavingsVsAveragePct: roundPointer(savings, 1), SelectionStrategy: strategy}
	if isPriceUnit(unit) {
		window.UsageKWh = floatPointer(cfg.HouseholdUsageKWh)
		cost := round(average*cfg.HouseholdUsageKWh/100, 3)
		window.EstimatedCostEUR = &cost
	}
	return window
}

func pointReads(points []Point, unit string, cfg config.Config) []EnergyPoint {
	result := make([]EnergyPoint, 0, len(points))
	for _, point := range points {
		item := EnergyPoint{StartsAt: timescope.Format(point.StartsAt), EndsAt: timescope.Format(point.EndsAt), Value: point.Value, Unit: stringPointerIf(unit)}
		if isPriceUnit(unit) {
			cost := round(point.Value*cfg.HouseholdUsageKWh/100, 3)
			item.EstimatedCostEUR = &cost
		}
		result = append(result, item)
	}
	return result
}

func metrics(window *Window, quality Quality, unit string, cfg config.Config) []Metric {
	average, minimum, maximum := "n/a", "n/a", "n/a"
	if window != nil {
		average, minimum, maximum = formatNumber(window.AverageValue), formatNumber(window.MinimumValue), formatNumber(window.MaximumValue)
	}
	items := []Metric{metric("window_average", choose(isPriceUnit(unit), "Window average price", "Window average"), average, unit), metric("minimum_value", choose(isPriceUnit(unit), "Cheapest price", "Minimum value"), minimum, unit), metric("maximum_value", choose(isPriceUnit(unit), "Peak price", "Maximum value"), maximum, unit), metric("point_count", "Point count", fmt.Sprintf("%d", quality.PointCount), "")}
	if isPriceUnit(unit) {
		value := "n/a"
		if window != nil && window.EstimatedCostEUR != nil {
			value = formatNumber(*window.EstimatedCostEUR)
		}
		items = append([]Metric{items[0], metric("estimated_cost", fmt.Sprintf("Cost for %.1f kWh", cfg.HouseholdUsageKWh), value, "EUR")}, items[1:]...)
	}
	if window != nil && window.SavingsVsAveragePct != nil && *window.SavingsVsAveragePct > 0 {
		index := 1
		if isPriceUnit(unit) {
			index = 2
		}
		item := metric("relative_savings", "Below forecast average", formatNumber(*window.SavingsVsAveragePct), "%")
		items = append(items[:index], append([]Metric{item}, items[index:]...)...)
	}
	return items
}

func qualityFrom(raw observations.RawObservation, points []Point, window *Window, unit, sourceLabel string) Quality {
	if raw.Dataset == "" {
		return Quality{MissingFields: []string{"time series", "value", "unit"}, Notes: []string{"No " + sourceLabel + " timeseries payload has been collected yet."}}
	}
	missing := []string{}
	if len(points) == 0 {
		missing = append(missing, "time series", "value")
	}
	if unit == "" {
		missing = append(missing, "unit")
	}
	notes := []string{}
	if len(missing) > 0 {
		notes = append(notes, "Missing full energy fields: "+strings.Join(missing, ", ")+".")
	}
	if window == nil && len(points) > 0 {
		notes = append(notes, "Raw energy points are available, but no low-value window is ready.")
	}
	if window != nil && window.Source == "raw_preview" {
		notes = append(notes, "Window preview is derived from sustained relative-low points in the latest raw "+sourceLabel+" payload.")
	}
	if isPriceUnit(unit) {
		notes = append(notes, "Price values are spot energy prices including VAT; configured household add-ons are added when present.")
	}
	if len(notes) == 0 {
		notes = append(notes, "Energy points and low-value window are ready for visualization.")
	}
	values := pointValues(points)
	minimum, maximum := minMax(values)
	average := averageOf(values)
	if len(values) == 0 {
		minimum, maximum = nil, nil
	}
	var averagePointer *float64
	if len(values) > 0 {
		averagePointer = &average
	}
	return Quality{PointCount: len(points), WindowPointCount: windowCount(window), FieldCoveragePct: round(float64(3-len(missing))/3*100, 1), MinimumValue: minimum, MaximumValue: maximum, AverageValue: averagePointer, MissingFields: missing, Notes: notes}
}

func dataPipeline(request SourceRequest, points []Point, window *Window, sourceLabel string) []DataStage {
	updated := windowTimeStart(window)
	if updated == nil {
		updated = request.FetchedAt
	}
	return []DataStage{{Key: "source_acquisition", Label: "Source acquisition", Status: choose(request.Status == "fetched", "ready", "missing"), Detail: choose(request.Status == "fetched", sourceLabel+" timeseries payload fetched with request metadata.", "No "+sourceLabel+" energy payload has been fetched yet."), RecordCount: intPointerValue(boolInt(request.Status == "fetched")), UpdatedAt: request.FetchedAt}, {Key: "cleaning_normalization", Label: "Cleaning & normalization", Status: choose(len(points) > 0, "ready", "empty"), Detail: fmt.Sprintf("%d energy points are available in the selected window.", len(points)), RecordCount: intPointerValue(len(points)), UpdatedAt: request.FetchedAt}, {Key: "window_detection", Label: "Window detection", Status: choose(window != nil, "ready", "empty"), Detail: windowDetail(window), RecordCount: intPointerValue(windowCount(window)), UpdatedAt: updated}, {Key: "visualization_ready", Label: "Visualization-ready data", Status: choose(len(points) > 0 || window != nil, "ready", "empty"), Detail: "Price line chart, window card, source status, and quality metrics prepared.", RecordCount: intPointerValue(len(points) + boolInt(window != nil)), UpdatedAt: updated}}
}

func windowDetail(window *Window) string {
	if window == nil {
		return "No low-value flexible-use window is available yet."
	}
	return fmt.Sprintf("%d sustained relative-low point(s) define the current flexible-use start window.", window.PointCount)
}

func summary(window *Window) *string {
	if window == nil {
		return stringPointer("No low-value energy window is available yet.")
	}
	unitSuffix := ""
	if window.Unit != nil {
		unitSuffix = " " + *window.Unit
	}
	if isPriceUnit(stringValue(window.Unit)) {
		costSuffix, savingsSuffix := "", ""
		if window.EstimatedCostEUR != nil && window.UsageKWh != nil {
			costSuffix = fmt.Sprintf(" Estimated cost is EUR %.2f for %.1f kWh.", *window.EstimatedCostEUR, *window.UsageKWh)
		}
		if window.SavingsVsAveragePct != nil && *window.SavingsVsAveragePct > 0 {
			savingsSuffix = fmt.Sprintf(" It is %.0f%% below the forecast average.", *window.SavingsVsAveragePct)
		}
		return stringPointer(fmt.Sprintf("Flexible appliances can start from %s UTC; prices stay relatively low until %s UTC. The average household spot price is %.2f%s.%s%s", window.StartsAt[11:16], window.EndsAt[11:16], window.AverageValue, unitSuffix, savingsSuffix, costSuffix))
	}
	return stringPointer(fmt.Sprintf("Flexible electricity use can start from %s UTC; the signal stays relatively low until %s UTC. The window average is %.2f%s.", window.StartsAt[11:16], window.EndsAt[11:16], window.AverageValue, unitSuffix))
}

func sourceRequest(raw observations.RawObservation, key, label string) SourceRequest {
	if raw.Dataset == "" {
		return SourceRequest{Key: key, Label: label, Status: "missing"}
	}
	return SourceRequest{Key: key, Label: label, Status: "fetched", Endpoint: textPointer(raw.Payload["request_url"]), ContentType: textPointer(raw.Payload["content_type"]), FetchedAt: rawTime(raw)}
}

func rawTime(raw observations.RawObservation) *string {
	if raw.Dataset == "" {
		return nil
	}
	value := timescope.Format(raw.ObservedAt)
	return &value
}

func energyUnit(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range []string{"unit", "Unit", "unitName", "quantity", "measureUnit"} {
			if text := textValue(typed[key]); text != "" {
				return text
			}
		}
		for _, nested := range typed {
			if unit := energyUnit(nested); unit != "" {
				return unit
			}
		}
	case []any:
		for _, nested := range typed {
			if unit := energyUnit(nested); unit != "" {
				return unit
			}
		}
	}
	return ""
}

func firstTime(item map[string]any, keys ...string) *time.Time {
	for _, key := range keys {
		if value, ok := parseTime(item[key]); ok {
			return &value
		}
	}
	return nil
}

func parseTime(value any) (time.Time, bool) {
	switch typed := value.(type) {
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return time.Time{}, false
		}
		if parsed, err := time.Parse(time.RFC3339Nano, strings.Replace(text, "Z", "+00:00", 1)); err == nil {
			return parsed.UTC(), true
		}
		if parsed, err := time.Parse("2006-01-02T15:04", text); err == nil {
			return parsed.UTC(), true
		}
	case float64:
		if typed > 10000000000 {
			typed /= 1000
		}
		return time.Unix(int64(typed), 0).UTC(), true
	case int64:
		return time.Unix(typed, 0).UTC(), true
	}
	return time.Time{}, false
}

func firstNumber(item map[string]any, keys ...string) *float64 {
	for _, key := range keys {
		if value, ok := number(item[key]); ok {
			return &value
		}
	}
	return nil
}

func number(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconvParseFloat(strings.Replace(strings.TrimSpace(typed), ",", ".", 1))
		return parsed, err == nil
	}
	return 0, false
}

func strconvParseFloat(value string) (float64, error) {
	var parsed float64
	_, err := fmt.Sscan(value, &parsed)
	return parsed, err
}

func valueTime(value *time.Time) time.Time {
	if value == nil {
		return time.Time{}
	}
	return *value
}

func pointValues(points []Point) []float64 {
	values := make([]float64, len(points))
	for index, point := range points {
		values[index] = point.Value
	}
	return values
}

func averageOf(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func minMax(values []float64) (*float64, *float64) {
	if len(values) == 0 {
		return nil, nil
	}
	min, max := values[0], values[0]
	for _, value := range values[1:] {
		if value < min {
			min = value
		}
		if value > max {
			max = value
		}
	}
	return &min, &max
}

func minMaxValues(values []float64) *float64 {
	min, _ := minMax(values)
	return min
}

func maxMaxValues(values []float64) *float64 {
	_, max := minMax(values)
	return max
}

func numberValue(value any) float64 {
	parsed, _ := number(value)
	return parsed
}

func numberPointer(value any) *float64 {
	parsed, ok := number(value)
	if !ok {
		return nil
	}
	return &parsed
}

func floatPointer(value float64) *float64 { return &value }
func stringPointer(value string) *string  { return &value }
func stringPointerIf(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
func textPointer(value any) *string { return stringPointerIf(textValue(value)) }
func textValue(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func nonEmpty(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
func isPriceUnit(unit string) bool { return strings.Contains(strings.ToLower(unit), "kwh") }
func round(value float64, places int) float64 {
	multiplier := math.Pow10(places)
	return math.Round(value*multiplier) / multiplier
}
func roundPointer(value *float64, places int) *float64 {
	if value == nil {
		return nil
	}
	result := round(*value, places)
	return &result
}
func formatNumber(value float64) string { return fmt.Sprintf("%.2f", value) }
func windowCount(window *Window) int {
	if window == nil {
		return 0
	}
	return window.PointCount
}
func windowTimes(window *Window) (*string, *string) {
	if window == nil {
		return nil, nil
	}
	return &window.StartsAt, &window.EndsAt
}
func windowTimeStart(window *Window) *string {
	if window == nil {
		return nil
	}
	return &window.StartsAt
}
func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func intPointerValue(value int) *int { return &value }

func addHouseholdComponents(points []Point, cfg config.Config) []Point {
	extra := cfg.HouseholdPriceMarginCents + cfg.HouseholdTransferCents
	if extra == 0 {
		return points
	}
	result := make([]Point, 0, len(points))
	for _, point := range points {
		point.Value = round(point.Value+extra, 3)
		result = append(result, point)
	}
	return result
}

func intValue(value any) int {
	parsed, ok := number(value)
	if !ok {
		return 0
	}
	return int(math.Round(parsed))
}

func metric(key, label, value, unit string) Metric {
	return Metric{Key: key, Label: label, LabelKey: metricLabelKey(key), Value: value, Unit: stringPointerIf(unit)}
}

func metricLabelKey(key string) string {
	parts := strings.Split(key, "_")
	result := parts[0]
	for _, part := range parts[1:] {
		if part != "" {
			result += strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return result
}

func choose(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}

func estimatedCost(value *float64, usage float64) *float64 {
	if value == nil {
		return nil
	}
	cost := round(*value*usage/100, 3)
	return &cost
}
