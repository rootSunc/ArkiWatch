package weather

import (
	"encoding/xml"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

type ForecastPoint struct {
	Assessment       PointAssessment `json:"assessment"`
	Timestamp        string          `json:"timestamp"`
	TemperatureC     *float64        `json:"temperature_c"`
	PrecipitationMM  *float64        `json:"precipitation_mm"`
	WindSpeedMS      *float64        `json:"wind_speed_ms"`
	WindGustMS       *float64        `json:"wind_gust_ms"`
	WindDirectionDeg *float64        `json:"wind_direction_deg"`
	CloudCoverPct    *float64        `json:"cloud_cover_pct"`
	HumidityPct      *float64        `json:"humidity_pct"`
	DewPointC        *float64        `json:"dew_point_c"`
	PressureHPA      *float64        `json:"pressure_hpa"`
	VisibilityM      *float64        `json:"visibility_m"`
	WeatherSymbol    *int            `json:"weather_symbol"`
	SmartSymbol      *int            `json:"smart_symbol"`
}

type RainWindow struct {
	StartsAt      string  `json:"starts_at"`
	EndsAt        string  `json:"ends_at"`
	PeakPrecipMM  float64 `json:"peak_precip_mm"`
	PeakPrecipAt  string  `json:"peak_precip_at"`
	TotalPrecipMM float64 `json:"total_precip_mm"`
	Hours         int     `json:"hours"`
}

type Metric struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	LabelKey string  `json:"label_key"`
	Value    string  `json:"value"`
	Unit     *string `json:"unit"`
}

type SourceLayer struct {
	Key       string  `json:"key"`
	Label     string  `json:"label"`
	Status    string  `json:"status"`
	Detail    string  `json:"detail"`
	UpdatedAt *string `json:"updated_at"`
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
	PointCount       int      `json:"point_count"`
	ForecastHours    int      `json:"forecast_hours"`
	FieldCoveragePct float64  `json:"field_coverage_pct"`
	RainWindowCount  int      `json:"rain_window_count"`
	MissingFields    []string `json:"missing_fields"`
	Notes            []string `json:"notes"`
}

type Warning struct {
	Tone        string  `json:"tone"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Link        *string `json:"link"`
	PublishedAt *string `json:"published_at"`
	Severity    *string `json:"severity"`
}

type Forecast struct {
	Advisories     []Advisory      `json:"advisories"`
	CheckedAt      string          `json:"checked_at"`
	TimeScope      map[string]any  `json:"time_scope"`
	Status         string          `json:"status"`
	Location       *string         `json:"location"`
	SourceCode     string          `json:"source_code"`
	GeneratedAt    *string         `json:"generated_at"`
	ValidFrom      *string         `json:"valid_from"`
	ValidTo        *string         `json:"valid_to"`
	Summary        *string         `json:"summary"`
	Metrics        []Metric        `json:"metrics"`
	Points         []ForecastPoint `json:"points"`
	RainWindows    []RainWindow    `json:"rain_windows"`
	SourceLayers   []SourceLayer   `json:"source_layers"`
	SourceRequests []SourceRequest `json:"source_requests"`
	DataPipeline   []DataStage     `json:"data_pipeline"`
	Quality        Quality         `json:"quality"`
	Warnings       []Warning       `json:"warnings"`
}

func Build(data observations.WeatherData, scope timescope.Scope, now time.Time) (result Forecast) {
	defer func() { EnrichDetail(&result) }()
	now = now.UTC()
	location := dataLocation(data.Outlook, scope)
	warnings := parseWarnings(data.Raw["weather_warnings_cap"])
	layers := buildSourceLayers(data, warnings)
	requests := buildSourceRequests(data)
	if data.Outlook == nil {
		return Forecast{
			CheckedAt:      timescope.Format(now),
			TimeScope:      scope.Payload(),
			Status:         "empty",
			Location:       location,
			SourceCode:     "fmi",
			Summary:        stringPointer("No normalized weather forecast is available yet."),
			Metrics:        []Metric{},
			Points:         []ForecastPoint{},
			RainWindows:    []RainWindow{},
			SourceLayers:   layers,
			SourceRequests: requests,
			DataPipeline:   dataPipeline(requests, nil, nil, warnings, nil),
			Quality:        qualityFromPoints(nil, nil),
			Warnings:       warnings,
		}
	}

	targetWindow := windowFromScope(scope)
	points := pointsFromPayload(data.Outlook.Attributes["forecast_points"], targetWindow)
	rainWindows := rainWindowsFromEvent(data.Rain, targetWindow)
	attrs := data.Outlook.Attributes
	minTemp := minPoint(points, func(point ForecastPoint) *float64 { return point.TemperatureC }, asFloat(attrs["min_temp_c"]))
	maxTemp := maxPoint(points, func(point ForecastPoint) *float64 { return point.TemperatureC }, asFloat(attrs["max_temp_c"]))
	maxWind := maxPoint(points, func(point ForecastPoint) *float64 { return point.WindSpeedMS }, asFloat(attrs["max_wind_ms"]))
	maxGust := maxPoint(points, func(point ForecastPoint) *float64 { return point.WindGustMS }, asFloat(attrs["max_wind_gust_ms"]))
	maxHumidity := maxPoint(points, func(point ForecastPoint) *float64 { return point.HumidityPct }, asFloat(attrs["max_humidity_pct"]))
	minVisibility := minPoint(points, func(point ForecastPoint) *float64 { return point.VisibilityM }, asFloat(attrs["min_visibility_m"]))

	var peakPrecip, totalPrecip *float64
	if targetWindow != nil {
		if len(rainWindows) > 0 {
			value := rainWindows[0].PeakPrecipMM
			total := 0.0
			for _, window := range rainWindows {
				if window.PeakPrecipMM > value {
					value = window.PeakPrecipMM
				}
				total += window.TotalPrecipMM
			}
			peakPrecip = &value
			total = math.Round(total*10) / 10
			totalPrecip = &total
		}
	} else if data.Rain != nil {
		peakPrecip = asFloat(data.Rain.Attributes["peak_precip_mm"])
		totalPrecip = asFloat(data.Rain.Attributes["total_precip_mm"])
	}

	metrics := []Metric{
		metric("temperature_range", "Temperature", fmt.Sprintf("%s to %s", formatNumber(minTemp), formatNumber(maxTemp)), "C"),
		metric("peak_wind", "Peak wind", formatNumber(maxWind), "m/s"),
		metric("peak_gust", "Peak gust", formatNumber(maxGust), "m/s"),
		metric("humidity", "Humidity", formatNumber(maxHumidity), "%"),
		metric("minimum_visibility", "Minimum visibility", formatNumber(minVisibility), "m"),
		metric("forecast_points", "Hourly points", fmt.Sprintf("%d", len(points)), ""),
	}
	if peakPrecip != nil {
		metrics = append(metrics, metric("peak_precipitation", "Peak rain", formatNumber(peakPrecip), "mm"))
	}
	if totalPrecip != nil {
		metrics = append(metrics, metric("total_precipitation", "Rain total", formatNumber(totalPrecip), "mm"))
	}

	generatedAt := asText(attrs["generated_at"])
	quality := qualityFromPoints(points, rainWindows)
	status := "ready"
	if len(points) == 0 {
		status = "summary_only"
	}
	if scope.Mode == "live" && isStale(data, now) {
		status = "stale"
	}
	return Forecast{
		CheckedAt:      timescope.Format(now),
		TimeScope:      scope.Payload(),
		Status:         status,
		Location:       stringPointer(data.Outlook.LocationRef),
		SourceCode:     nonEmpty(data.Outlook.SourceCode, "fmi"),
		GeneratedAt:    generatedAt,
		ValidFrom:      stringPointer(timescope.Format(data.Outlook.StartsAt)),
		ValidTo:        stringPointer(timescope.Format(data.Outlook.EndsAt)),
		Summary:        stringPointer(data.Outlook.Summary),
		Metrics:        metrics,
		Points:         points,
		RainWindows:    rainWindows,
		SourceLayers:   layers,
		SourceRequests: requests,
		DataPipeline:   dataPipeline(requests, points, rainWindows, warnings, generatedAt),
		Quality:        quality,
		Warnings:       warnings,
	}
}

func Unavailable(scope timescope.Scope, now time.Time) (result Forecast) {
	defer func() { EnrichDetail(&result) }()
	return Forecast{
		CheckedAt:  timescope.Format(now.UTC()),
		TimeScope:  scope.Payload(),
		Status:     "unavailable",
		SourceCode: "fmi",
		Summary:    stringPointer("Weather data is temporarily unavailable."),
		Metrics:    []Metric{}, Points: []ForecastPoint{}, RainWindows: []RainWindow{},
		SourceLayers: []SourceLayer{}, SourceRequests: []SourceRequest{}, DataPipeline: []DataStage{},
		Quality: qualityFromPoints(nil, nil), Warnings: []Warning{},
	}
}

func buildSourceLayers(data observations.WeatherData, warnings []Warning) []SourceLayer {
	return []SourceLayer{
		{Key: "forecast", Label: "Forecast", Status: statusForEvent(data.Outlook), Detail: detailForEvent(data.Outlook, "Hourly FMI Harmonie forecast points.", "Forecast has not been collected yet."), UpdatedAt: eventGeneratedAt(data.Outlook)},
		sourceLayer("observations", "Observations", data.Raw["weather_observations_raw"], "Latest FMI point observations collected for forecast context.", "Observation feed has not been collected yet."),
		sourceLayer("warnings", "Official warnings", data.Raw["weather_warnings_cap"], fmt.Sprintf("%d active warning item%s in the CAP feed.", len(warnings), plural(len(warnings))), "FMI CAP warning feed has not been collected yet."),
		sourceLayer("radar_nowcast", "Radar / nowcast", data.Raw["weather_radar_capabilities"], "FMI precipitation radar-nowcast capability metadata collected.", "Radar-nowcast capability metadata has not been collected yet."),
	}
}

func buildSourceRequests(data observations.WeatherData) []SourceRequest {
	return []SourceRequest{
		sourceRequest("forecast", "FMI Harmonie forecast", data.Raw["weather_forecast_raw"]),
		sourceRequest("observations", "FMI observations", data.Raw["weather_observations_raw"]),
		sourceRequest("warnings", "FMI CAP warnings", data.Raw["weather_warnings_cap"]),
		sourceRequest("radar_nowcast", "FMI radar metadata", data.Raw["weather_radar_capabilities"]),
	}
}

func sourceLayer(key, label string, raw observations.RawObservation, readyDetail, emptyDetail string) SourceLayer {
	if raw.Dataset == "" {
		return SourceLayer{Key: key, Label: label, Status: "not_collected", Detail: emptyDetail}
	}
	updated := timescope.Format(raw.ObservedAt)
	return SourceLayer{Key: key, Label: label, Status: "ready", Detail: readyDetail, UpdatedAt: &updated}
}

func sourceRequest(key, label string, raw observations.RawObservation) SourceRequest {
	if raw.Dataset == "" {
		return SourceRequest{Key: key, Label: label, Status: "missing"}
	}
	endpoint := asText(raw.Payload["request_url"])
	contentType := asText(raw.Payload["content_type"])
	fetchedAt := asText(raw.Payload["fetched_at"])
	if fetchedAt == nil {
		value := timescope.Format(raw.ObservedAt)
		fetchedAt = &value
	}
	return SourceRequest{Key: key, Label: label, Status: "fetched", Endpoint: endpoint, ContentType: contentType, FetchedAt: fetchedAt}
}

func dataPipeline(requests []SourceRequest, points []ForecastPoint, rainWindows []RainWindow, warnings []Warning, generatedAt *string) []DataStage {
	fetchedCount := 0
	for _, request := range requests {
		if request.Status == "fetched" {
			fetchedCount++
		}
	}
	sourceStatus := "empty"
	if fetchedCount > 0 {
		sourceStatus = "ready"
	}
	cleanStatus := "empty"
	if len(points) > 0 {
		cleanStatus = "ready"
	}
	visualStatus := "empty"
	if len(points) > 0 || len(rainWindows) > 0 || len(warnings) > 0 {
		visualStatus = "ready"
	}
	pointCount := len(points)
	visualCount := len(points) + len(rainWindows) + len(warnings)
	return []DataStage{
		{Key: "source_acquisition", Label: "Source acquisition", Status: sourceStatus, Detail: fmt.Sprintf("%d/%d FMI layers fetched", fetchedCount, len(requests)), RecordCount: intPointerValue(fetchedCount), UpdatedAt: generatedAt},
		{Key: "cleaning_normalization", Label: "Cleaning & normalization", Status: cleanStatus, Detail: choose(points != nil && len(points) > 0, "Aligned FMI time-value pairs into hourly forecast rows.", "No hourly rows were created from the latest payload."), RecordCount: intPointerValue(pointCount), UpdatedAt: generatedAt},
		{Key: "visualization_ready", Label: "Visualization-ready data", Status: visualStatus, Detail: fmt.Sprintf("%d chart points, %d rain windows, %d warning items.", len(points), len(rainWindows), len(warnings)), RecordCount: intPointerValue(visualCount), UpdatedAt: generatedAt},
	}
}

func qualityFromPoints(points []ForecastPoint, rainWindows []RainWindow) Quality {
	tracked := []struct{ field, label string }{
		{"temperature_c", "temperature"}, {"precipitation_mm", "rain"}, {"wind_speed_ms", "wind"},
		{"wind_gust_ms", "gust"}, {"cloud_cover_pct", "cloud"}, {"humidity_pct", "humidity"}, {"visibility_m", "visibility"},
	}
	if len(points) == 0 {
		missing := make([]string, 0, len(tracked))
		for _, field := range tracked {
			missing = append(missing, field.label)
		}
		return Quality{MissingFields: missing, Notes: []string{"No hourly forecast points were normalized from the latest FMI payload."}}
	}
	presentValues, totalValues := 0, len(points)*len(tracked)
	missing := []string{}
	for _, field := range tracked {
		present := 0
		for _, point := range points {
			if pointFieldPresent(point, field.field) {
				present++
			}
		}
		presentValues += present
		if present == 0 {
			missing = append(missing, field.label)
		}
	}
	timestamps := make([]time.Time, 0, len(points))
	for _, point := range points {
		if parsed, ok := parseTime(point.Timestamp); ok {
			timestamps = append(timestamps, parsed)
		}
	}
	forecastHours := 0
	if len(timestamps) > 0 {
		sort.Slice(timestamps, func(i, j int) bool { return timestamps[i].Before(timestamps[j]) })
		forecastHours = maxInt(0, int(timestamps[len(timestamps)-1].Sub(timestamps[0]).Hours())+1)
	}
	notes := []string{}
	if len(missing) > 0 {
		notes = append(notes, fmt.Sprintf("Missing full series: %s.", strings.Join(missing, ", ")))
	}
	if forecastHours < 24 {
		notes = append(notes, "Forecast horizon is shorter than 24 hours.")
	}
	if len(notes) == 0 {
		notes = append(notes, "Core weather fields are present across the normalized hourly series.")
	}
	coverage := 0.0
	if totalValues > 0 {
		coverage = math.Round(float64(presentValues)/float64(totalValues)*1000) / 10
	}
	return Quality{PointCount: len(points), ForecastHours: forecastHours, FieldCoveragePct: coverage, RainWindowCount: len(rainWindows), MissingFields: missing, Notes: notes}
}

func pointsFromPayload(value any, targetWindow *[2]time.Time) []ForecastPoint {
	items, ok := value.([]any)
	if !ok {
		return []ForecastPoint{}
	}
	points := make([]ForecastPoint, 0, len(items))
	for _, item := range items {
		point, ok := pointFromPayload(item)
		if !ok || !pointInWindow(point, targetWindow) {
			continue
		}
		points = append(points, point)
	}
	return points
}

func pointFromPayload(value any) (ForecastPoint, bool) {
	item, ok := value.(map[string]any)
	if !ok {
		return ForecastPoint{}, false
	}
	timestamp := asText(item["timestamp"])
	if timestamp == nil {
		return ForecastPoint{}, false
	}
	return ForecastPoint{
		Timestamp:    *timestamp,
		TemperatureC: floatPointer(asFloat(item["temperature_c"])), PrecipitationMM: floatPointer(asFloat(item["precipitation_mm"])),
		WindSpeedMS: floatPointer(asFloat(item["wind_speed_ms"])), WindGustMS: floatPointer(asFloat(item["wind_gust_ms"])), WindDirectionDeg: floatPointer(asFloat(item["wind_direction_deg"])),
		CloudCoverPct: floatPointer(asFloat(item["cloud_cover_pct"])), HumidityPct: floatPointer(asFloat(item["humidity_pct"])), DewPointC: floatPointer(asFloat(item["dew_point_c"])),
		PressureHPA: floatPointer(asFloat(item["pressure_hpa"])), VisibilityM: floatPointer(asFloat(item["visibility_m"])), WeatherSymbol: intPointer(asInt(item["weather_symbol"])), SmartSymbol: intPointer(asInt(item["smart_symbol"])),
	}, true
}

func rainWindowsFromEvent(event *observations.NormalizedEvent, targetWindow *[2]time.Time) []RainWindow {
	if event == nil {
		return []RainWindow{}
	}
	items, ok := event.Attributes["rain_windows"].([]any)
	if !ok {
		return []RainWindow{}
	}
	result := make([]RainWindow, 0, len(items))
	for _, item := range items {
		window, ok := rainWindowFromPayload(item)
		if ok && windowOverlaps(window, targetWindow) {
			result = append(result, window)
		}
	}
	return result
}

func rainWindowFromPayload(value any) (RainWindow, bool) {
	item, ok := value.(map[string]any)
	if !ok {
		return RainWindow{}, false
	}
	starts, ends, peakAt := asText(item["starts_at"]), asText(item["ends_at"]), asText(item["peak_precip_at"])
	peak, total, hours := asFloat(item["peak_precip_mm"]), asFloat(item["total_precip_mm"]), asInt(item["hours"])
	if starts == nil || ends == nil || peakAt == nil || peak == nil || total == nil || hours == nil {
		return RainWindow{}, false
	}
	return RainWindow{StartsAt: *starts, EndsAt: *ends, PeakPrecipMM: *peak, PeakPrecipAt: *peakAt, TotalPrecipMM: *total, Hours: *hours}, true
}

func parseWarnings(raw observations.RawObservation) []Warning {
	if raw.Dataset == "" {
		return []Warning{}
	}
	body, ok := raw.Payload["body"].(string)
	if !ok || strings.TrimSpace(body) == "" {
		return []Warning{}
	}
	type item struct {
		Title       string `xml:"title"`
		Description string `xml:"description"`
		Link        string `xml:"link"`
		PublishedAt string `xml:"pubDate"`
	}
	decoder := xml.NewDecoder(strings.NewReader(body))
	warnings := []Warning{}
	for {
		token, err := decoder.Token()
		if err != nil {
			break
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "item" {
			continue
		}
		var parsed item
		if err := decoder.DecodeElement(&parsed, &start); err != nil {
			continue
		}
		title := strings.TrimSpace(parsed.Title)
		if title == "" || strings.HasPrefix(strings.ToLower(title), "removed:") {
			continue
		}
		warning := Warning{Title: title, Description: optionalText(parsed.Description), Link: optionalText(parsed.Link), PublishedAt: optionalText(parsed.PublishedAt)}
		lowered := strings.ToLower(title)
		for _, severity := range []string{"red", "orange", "yellow"} {
			if strings.Contains(lowered, severity) {
				warning.Severity = &severity
				break
			}
		}
		warnings = append(warnings, warning)
		if len(warnings) == 6 {
			break
		}
	}
	return warnings
}

func statusForEvent(event *observations.NormalizedEvent) string {
	if event == nil {
		return "not_collected"
	}
	return "ready"
}
func detailForEvent(event *observations.NormalizedEvent, ready, empty string) string {
	if event == nil {
		return empty
	}
	return ready
}
func eventGeneratedAt(event *observations.NormalizedEvent) *string {
	if event == nil {
		return nil
	}
	return asText(event.Attributes["generated_at"])
}
func dataLocation(event *observations.NormalizedEvent, scope timescope.Scope) *string {
	if event != nil && event.LocationRef != "" {
		return &event.LocationRef
	}
	if scope.Date != nil {
		return nil
	}
	return nil
}
func isStale(data observations.WeatherData, now time.Time) bool {
	hasCurrentEvent := data.Outlook != nil && !data.Outlook.EndsAt.Before(now)
	hasCurrentRaw := false
	for _, raw := range data.Raw {
		if !raw.ObservedAt.Before(now.Add(-36 * time.Hour)) {
			hasCurrentRaw = true
			break
		}
	}
	return (data.Outlook != nil || len(data.Raw) > 0) && !hasCurrentEvent && !hasCurrentRaw
}
func windowFromScope(scope timescope.Scope) *[2]time.Time {
	if scope.WindowStart == nil || scope.WindowEnd == nil {
		return nil
	}
	return &[2]time.Time{*scope.WindowStart, *scope.WindowEnd}
}
func pointInWindow(point ForecastPoint, window *[2]time.Time) bool {
	if window == nil {
		return true
	}
	parsed, ok := parseTime(point.Timestamp)
	return ok && !parsed.Before(window[0]) && parsed.Before(window[1])
}
func windowOverlaps(window RainWindow, target *[2]time.Time) bool {
	if target == nil {
		return true
	}
	start, okStart := parseTime(window.StartsAt)
	end, okEnd := parseTime(window.EndsAt)
	return okStart && okEnd && !end.Before(target[0]) && start.Before(target[1])
}
func parseTime(value string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339Nano, strings.Replace(value, "Z", "+00:00", 1))
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}
func pointFieldPresent(point ForecastPoint, field string) bool {
	switch field {
	case "temperature_c":
		return point.TemperatureC != nil
	case "precipitation_mm":
		return point.PrecipitationMM != nil
	case "wind_speed_ms":
		return point.WindSpeedMS != nil
	case "wind_gust_ms":
		return point.WindGustMS != nil
	case "cloud_cover_pct":
		return point.CloudCoverPct != nil
	case "humidity_pct":
		return point.HumidityPct != nil
	case "visibility_m":
		return point.VisibilityM != nil
	}
	return false
}
func minPoint(points []ForecastPoint, selector func(ForecastPoint) *float64, fallback *float64) *float64 {
	var result *float64
	for _, point := range points {
		value := selector(point)
		if value != nil && (result == nil || *value < *result) {
			copy := *value
			result = &copy
		}
	}
	if result != nil {
		return result
	}
	return fallback
}
func maxPoint(points []ForecastPoint, selector func(ForecastPoint) *float64, fallback *float64) *float64 {
	var result *float64
	for _, point := range points {
		value := selector(point)
		if value != nil && (result == nil || *value > *result) {
			copy := *value
			result = &copy
		}
	}
	if result != nil {
		return result
	}
	return fallback
}
func asText(value any) *string {
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) != "" {
			value := strings.TrimSpace(typed)
			return &value
		}
	case nil:
		return nil
	default:
		value := fmt.Sprint(typed)
		return &value
	}
	return nil
}
func asFloat(value any) *float64 {
	switch typed := value.(type) {
	case float64:
		return &typed
	case float32:
		converted := float64(typed)
		return &converted
	case int:
		converted := float64(typed)
		return &converted
	case int64:
		converted := float64(typed)
		return &converted
	}
	return nil
}
func asInt(value any) *int {
	number := asFloat(value)
	if number == nil {
		return nil
	}
	converted := int(*number)
	return &converted
}
func floatPointer(value *float64) *float64 { return value }
func intPointer(value *int) *int           { return value }
func stringPointer(value string) *string   { return &value }
func optionalText(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
	return &trimmed
}
func metric(key, label, value, unit string) Metric {
	var unitPointer *string
	if unit != "" {
		unitPointer = &unit
	}
	return Metric{Key: key, Label: label, LabelKey: metricLabelKey(key), Value: value, Unit: unitPointer}
}
func metricLabelKey(key string) string {
	parts := strings.Split(key, "_")
	if len(parts) == 0 {
		return key
	}
	result := parts[0]
	for _, part := range parts[1:] {
		if part != "" {
			result += strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return result
}
func formatNumber(value *float64) string {
	if value == nil {
		return "n/a"
	}
	return fmt.Sprintf("%.1f", *value)
}
func nonEmpty(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
func intPointerValue(value int) *int { return &value }
func choose(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}
func plural(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
