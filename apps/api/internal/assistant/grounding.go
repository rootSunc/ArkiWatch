package assistant

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Citation names a dataset an answer leaned on, so a reader can tell which
// live source backed a claim instead of taking the model's word for it.
type Citation struct {
	Source    string  `json:"source"`
	Detail    string  `json:"detail"`
	CheckedAt *string `json:"checked_at"`
}

// GroundedContext is everything the assistant knows about the city right now:
// flattened facts for the prompt, the citations to hand back, and the list of
// datasets that were consulted.
type GroundedContext struct {
	Facts          []string
	Citations      []Citation
	DataContext    []string
	UsableDatasets int
}

const maxFactLength = 400

// keywordGroups routes a question to the datasets worth loading. The platform
// overview is always included so even an off-topic question is answered against
// real coverage and health information.
var keywordGroups = map[string][]string{
	"weather":     {"weather", "rain", "wind", "temperature", "umbrella", "forecast", "天气", "下雨", "雨", "风", "温度", "伞", "预报", "sää", "sade", "tuuli", "lämpö", "sateenvarjo"},
	"air_quality": {"air quality", "air", "pm2", "pm10", "pollution", "ventilate", "空气", "空气质量", "污染", "通风", "ilmanlaatu", "pöly"},
	"energy":      {"energy", "electricity", "price", "grid", "power", "spot", "电", "电价", "电力", "能源", "sähkö", "hinta", "energia"},
	"traffic":     {"traffic", "road", "roadwork", "drive", "car", "congestion", "交通", "道路", "施工", "开车", "拥堵", "liikenne", "tie", "tietyö"},
	"transit":     {"transit", "tram", "metro", "bus", "train", "commute", "公交", "地铁", "电车", "通勤", "列车", "joukkoliikenne", "raitiovaunu", "metro", "bussi"},
}

// SelectDataSources picks the datasets relevant to a question. When nothing
// matches, every domain is loaded rather than none, so a broad question such as
// "how is today looking?" still gets a grounded answer.
func SelectDataSources(question string) []string {
	normalized := strings.ToLower(question)
	selected := map[string]struct{}{"platform_overview": {}}
	for group, keywords := range keywordGroups {
		for _, keyword := range keywords {
			if strings.Contains(normalized, keyword) {
				selected[group] = struct{}{}
				break
			}
		}
	}
	if len(selected) == 1 {
		for group := range keywordGroups {
			selected[group] = struct{}{}
		}
	}
	result := make([]string, 0, len(selected))
	for group := range selected {
		result = append(result, group)
	}
	sort.Strings(result)
	return result
}

// BuildContext flattens the loaded read models into prompt facts and citations.
// Payloads are inspected generically through a JSON round-trip so this layer
// does not have to track every read-model struct shape.
func BuildContext(payloads map[string]any) GroundedContext {
	context := GroundedContext{Facts: []string{}, Citations: []Citation{}, DataContext: []string{}}
	names := make([]string, 0, len(payloads))
	for name := range payloads {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		document := asDocument(payloads[name])
		if document == nil {
			continue
		}
		context.DataContext = append(context.DataContext, name)
		context.Facts = append(context.Facts, factsFor(name, document)...)
		context.Citations = append(context.Citations, citationFor(name, document))
		if name != "platform_overview" && usableDataset(document) {
			context.UsableDatasets++
		}
	}
	return context
}

func usableDataset(document map[string]any) bool {
	status := firstNonEmpty(field(document, "status"), field(document, "health_status"))
	switch strings.ToLower(status) {
	case "", "empty", "missing", "not_collected", "unavailable", "failed", "error", "stale":
		return false
	default:
		return true
	}
}

// HasUsableEvidence reports whether any question-specific dataset is current.
// The platform overview is always loaded and is not itself an answer.
func (context GroundedContext) HasUsableEvidence() bool {
	return context.UsableDatasets > 0
}

func factsFor(name string, document map[string]any) []string {
	facts := []string{headlineFact(name, document)}
	switch name {
	case "weather":
		for _, window := range listField(document, "rain_windows", 3) {
			facts = append(facts, fmt.Sprintf("weather_rain_window: %s..%s; peak=%smm at %s; total=%smm",
				field(window, "starts_at"), field(window, "ends_at"), field(window, "peak_precip_mm"), field(window, "peak_precip_at"), field(window, "total_precip_mm")))
		}
		for _, warning := range listField(document, "warnings", 3) {
			facts = append(facts, fmt.Sprintf("weather_warning: %s; severity=%s", field(warning, "title"), field(warning, "severity")))
		}
	case "air_quality":
		facts = append(facts, fmt.Sprintf("air_worst: label=%s; score=%s; station=%s",
			field(document, "worst_label"), field(document, "worst_score"), field(document, "worst_station")))
		for _, station := range listField(document, "stations", 4) {
			facts = append(facts, fmt.Sprintf("air_station: %s; label=%s; score=%s; european_aqi=%s; pm2_5=%s; pm10=%s",
				field(station, "station"), field(station, "label"), field(station, "score"), field(station, "european_aqi"), field(station, "pm2_5"), field(station, "pm10")))
		}
	case "energy":
		if window := mapField(document, "current_window"); window != nil {
			facts = append(facts, fmt.Sprintf("energy_current_window: %s..%s; value=%s%s",
				field(window, "starts_at"), field(window, "ends_at"), field(window, "value"), field(document, "unit")))
		}
		for _, point := range listField(document, "points", 4) {
			facts = append(facts, fmt.Sprintf("energy_point: %s..%s; value=%s%s; estimated_cost_eur=%s",
				field(point, "starts_at"), field(point, "ends_at"), field(point, "value"), field(point, "unit"), field(point, "estimated_cost_eur")))
		}
	case "traffic":
		for _, item := range listField(document, "incidents", 4) {
			facts = append(facts, fmt.Sprintf("traffic_incident: %s; severity=%s; type=%s; window=%s..%s; where=%s",
				field(item, "title"), field(item, "severity"), field(item, "event_type"), field(item, "starts_at"), field(item, "ends_at"), field(item, "location_description")))
		}
		for _, corridor := range listField(document, "corridors", 3) {
			facts = append(facts, fmt.Sprintf("traffic_corridor: %s; severity=%s; active_events=%s",
				field(corridor, "label"), field(corridor, "severity"), field(corridor, "active_event_count")))
		}
	case "transit":
		for _, item := range listField(document, "alerts", 5) {
			facts = append(facts, fmt.Sprintf("transit_alert: %s; severity=%s; type=%s; window=%s..%s",
				field(item, "title"), field(item, "severity"), field(item, "event_type"), field(item, "starts_at"), field(item, "ends_at")))
		}
	case "platform_overview":
		for _, category := range listField(document, "categories", 8) {
			facts = append(facts, fmt.Sprintf("category %s: title=%s; status=%s; stage=%s",
				field(category, "key"), field(category, "title"), field(category, "status"), field(category, "stage")))
		}
		for _, event := range listField(document, "recent_events", 6) {
			facts = append(facts, fmt.Sprintf("recent_event: %s; severity=%s; window=%s..%s",
				field(event, "title"), field(event, "severity"), field(event, "starts_at"), field(event, "ends_at")))
		}
		for _, source := range listField(document, "sources", 10) {
			facts = append(facts, fmt.Sprintf("source %s: status=%s; last_run=%s; records=%s",
				field(source, "source_code"), field(source, "operational_status"), field(source, "last_run_status"), field(source, "records_ingested")))
		}
	}
	trimmed := make([]string, 0, len(facts))
	for _, fact := range facts {
		trimmed = append(trimmed, clip(fact, maxFactLength))
	}
	return trimmed
}

func headlineFact(name string, document map[string]any) string {
	parts := []string{name + ":"}
	for _, key := range []string{"checked_at", "status", "health_status", "location", "coverage_area", "summary"} {
		if value := field(document, key); value != "" {
			parts = append(parts, key+"="+value)
		}
	}
	if metrics := formatMetrics(listField(document, "metrics", 6)); metrics != "" {
		parts = append(parts, "metrics="+metrics)
	}
	return clip(strings.Join(parts, " "), maxFactLength)
}

func citationFor(name string, document map[string]any) Citation {
	status := firstNonEmpty(field(document, "status"), field(document, "health_status"))
	location := firstNonEmpty(field(document, "location"), field(document, "coverage_area"))
	detail := name + " data snapshot."
	if status != "" || location != "" {
		detail = fmt.Sprintf("%s status=%s, location=%s.", name, orDefault(status, "unknown"), orDefault(location, "n/a"))
	}
	citation := Citation{Source: name, Detail: detail}
	if checkedAt := field(document, "checked_at"); checkedAt != "" {
		citation.CheckedAt = &checkedAt
	}
	return citation
}

func formatMetrics(metrics []map[string]any) string {
	pieces := []string{}
	for _, metric := range metrics {
		label := firstNonEmpty(field(metric, "label"), field(metric, "key"))
		value := field(metric, "value") + field(metric, "unit")
		if label == "" && value == "" {
			continue
		}
		pieces = append(pieces, label+"="+value)
	}
	return strings.Join(pieces, ", ")
}

// asDocument renders any read model as a generic map. A nil or non-object
// payload yields nil so the caller can skip it.
func asDocument(payload any) map[string]any {
	if payload == nil {
		return nil
	}
	if document, ok := payload.(map[string]any); ok {
		return document
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	var document map[string]any
	if err := json.Unmarshal(encoded, &document); err != nil {
		return nil
	}
	return document
}

func field(document map[string]any, key string) string {
	if document == nil {
		return ""
	}
	value, ok := document[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.4f", typed), "0"), ".")
	case bool:
		return fmt.Sprint(typed)
	case map[string]any, []any:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func mapField(document map[string]any, key string) map[string]any {
	if document == nil {
		return nil
	}
	nested, ok := document[key].(map[string]any)
	if !ok {
		return nil
	}
	return nested
}

func listField(document map[string]any, key string, limit int) []map[string]any {
	if document == nil {
		return nil
	}
	raw, ok := document[key].([]any)
	if !ok {
		return nil
	}
	result := []map[string]any{}
	for _, item := range raw {
		if len(result) >= limit {
			break
		}
		if entry, ok := item.(map[string]any); ok {
			result = append(result, entry)
		}
	}
	return result
}

func clip(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit-1]) + "…"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
