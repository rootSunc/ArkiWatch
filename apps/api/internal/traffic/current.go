package traffic

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

var trafficEventTypes = map[string]struct{}{"road_disruption": {}, "road_weather_risk": {}, "rail_delay": {}, "marine_disruption": {}}
var roadEventTypes = map[string]struct{}{"road_disruption": {}, "road_weather_risk": {}}
var railEventTypes = map[string]struct{}{"rail_delay": {}}
var messageLabels = []struct{ key, label string }{{"traffic_announcements", "Traffic announcements"}, {"roadworks", "Roadworks"}, {"weight_restrictions", "Weight restrictions"}, {"exempted_transports", "Exempted transports"}}

type Incident struct {
	State               string    `json:"state"`
	Filters             []string  `json:"filters"`
	ID                  string    `json:"id"`
	Title               string    `json:"title"`
	Description         string    `json:"description"`
	Severity            string    `json:"severity"`
	EventType           string    `json:"event_type"`
	StartsAt            string    `json:"starts_at"`
	EndsAt              string    `json:"ends_at"`
	Active              bool      `json:"active"`
	LocationRef         string    `json:"location_ref"`
	MessageType         *string   `json:"message_type"`
	SituationType       *string   `json:"situation_type"`
	LocationDescription *string   `json:"location_description"`
	FeatureNames        []string  `json:"feature_names"`
	GeometryBbox        []float64 `json:"geometry_bbox"`
}

type Corridor struct {
	Key              string    `json:"key"`
	Label            string    `json:"label"`
	EventCount       int       `json:"event_count"`
	ActiveEventCount int       `json:"active_event_count"`
	WeatherRiskCount int       `json:"weather_risk_count"`
	Severity         string    `json:"severity"`
	LatestTitle      string    `json:"latest_title"`
	LatestValidTo    string    `json:"latest_valid_to"`
	GeometryBbox     []float64 `json:"geometry_bbox"`
}

type Metric struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	LabelKey string  `json:"label_key"`
	Value    string  `json:"value"`
	Unit     *string `json:"unit"`
}

type SourceRequest struct {
	Key          string  `json:"key"`
	Label        string  `json:"label"`
	Status       string  `json:"status"`
	Endpoint     *string `json:"endpoint"`
	ContentType  *string `json:"content_type"`
	FetchedAt    *string `json:"fetched_at"`
	MessageCount int     `json:"message_count"`
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
	RawMessageCount      int      `json:"raw_message_count"`
	NormalizedEventCount int      `json:"normalized_event_count"`
	ActiveEventCount     int      `json:"active_event_count"`
	RoadEventCount       int      `json:"road_event_count"`
	RailEventCount       int      `json:"rail_event_count"`
	WeatherRiskCount     int      `json:"weather_risk_count"`
	CorridorCount        int      `json:"corridor_count"`
	FieldCoveragePct     float64  `json:"field_coverage_pct"`
	MissingFields        []string `json:"missing_fields"`
	Notes                []string `json:"notes"`
}

type Current struct {
	Detail         detailstate.Summary `json:"detail"`
	CheckedAt      string              `json:"checked_at"`
	TimeScope      map[string]any      `json:"time_scope"`
	Status         string              `json:"status"`
	Location       *string             `json:"location"`
	SourceCode     string              `json:"source_code"`
	ObservedAt     *string             `json:"observed_at"`
	Summary        *string             `json:"summary"`
	Metrics        []Metric            `json:"metrics"`
	Incidents      []Incident          `json:"incidents"`
	Corridors      []Corridor          `json:"corridors"`
	SourceRequests []SourceRequest     `json:"source_requests"`
	DataPipeline   []DataStage         `json:"data_pipeline"`
	Quality        Quality             `json:"quality"`
}

type Data struct {
	Raw    []observations.RawObservation
	Events []observations.NormalizedEvent
}

type Query struct {
	Now         time.Time
	WindowStart *time.Time
	WindowEnd   *time.Time
	Historical  bool
}

func Build(data Data, scope timescope.Scope, now time.Time, location string) (result Current) {
	defer func() { EnrichDetail(&result) }()
	now = now.UTC()
	features := rawFeatures(data.Raw)
	requests := sourceRequests(data.Raw)
	quality := qualityFrom(features, data.Events, scope.ReferenceTime)
	incidents := make([]Incident, 0, len(data.Events))
	for _, event := range data.Events {
		incidents = append(incidents, incidentFromEvent(event, scope.ReferenceTime))
	}
	sort.SliceStable(incidents, func(i, j int) bool {
		if incidents[i].Active != incidents[j].Active {
			return incidents[i].Active
		}
		if severityRank(incidents[i].Severity) != severityRank(incidents[j].Severity) {
			return severityRank(incidents[i].Severity) > severityRank(incidents[j].Severity)
		}
		return incidents[i].StartsAt < incidents[j].StartsAt
	})
	corridors := corridorsFromEvents(data.Events, scope.ReferenceTime)
	latest := latestObserved(data.Raw)
	hasData := len(features) > 0 || len(data.Events) > 0
	status := "empty"
	if hasData {
		status = "ready"
	}
	if scope.Mode == "live" && hasData && latest != nil && latest.Before(scope.ReferenceTime.Add(-6*time.Hour)) {
		status = "stale"
	}
	if location == "" {
		location = "helsinki"
	}
	return Current{
		CheckedAt: timescope.Format(now), TimeScope: scope.Payload(), Status: status, Location: stringPointer(location), SourceCode: "digitraffic", ObservedAt: latestString(latest), Summary: summary(quality, scope.Mode == "historical"),
		Metrics:   []Metric{metric("raw_messages", "Raw messages", fmt.Sprintf("%d", quality.RawMessageCount)), metric("active_events", "Active events", fmt.Sprintf("%d", quality.ActiveEventCount)), metric("road_disruptions", "Road disruptions", fmt.Sprintf("%d", quality.RoadEventCount)), metric("road_weather", "Road weather", fmt.Sprintf("%d", quality.WeatherRiskCount)), metric("corridors", "Corridors", fmt.Sprintf("%d", quality.CorridorCount)), metric("rail_events", "Rail events", fmt.Sprintf("%d", quality.RailEventCount))},
		Incidents: incidents, Corridors: corridors, SourceRequests: requests, DataPipeline: dataPipeline(requests, features, data.Events, corridors), Quality: quality,
	}
}

func Unavailable(scope timescope.Scope, now time.Time) (result Current) {
	defer func() { EnrichDetail(&result) }()
	return Current{CheckedAt: timescope.Format(now.UTC()), TimeScope: scope.Payload(), Status: "unavailable", SourceCode: "digitraffic", Summary: stringPointer("Road and rail data is temporarily unavailable."), Metrics: []Metric{}, Incidents: []Incident{}, Corridors: []Corridor{}, SourceRequests: []SourceRequest{}, DataPipeline: []DataStage{}}
}

func rawFeatures(raw []observations.RawObservation) []map[string]any {
	features := []map[string]any{}
	for _, item := range raw {
		messageType := text(item.Payload["message_type"])
		if messageType == "" {
			messageType = "traffic_messages"
		}
		for _, feature := range featuresFromBody(item.Payload["body"]) {
			copy := map[string]any{}
			for key, value := range feature {
				copy[key] = value
			}
			copy["_message_type"] = messageType
			features = append(features, copy)
		}
	}
	return features
}

func featuresFromBody(body any) []map[string]any {
	if list, ok := body.([]any); ok {
		result := []map[string]any{}
		for _, item := range list {
			if feature, ok := item.(map[string]any); ok {
				result = append(result, feature)
			}
		}
		return result
	}
	object, ok := body.(map[string]any)
	if !ok {
		return []map[string]any{}
	}
	list, ok := object["features"].([]any)
	if !ok {
		return []map[string]any{}
	}
	result := []map[string]any{}
	for _, item := range list {
		if feature, ok := item.(map[string]any); ok {
			result = append(result, feature)
		}
	}
	return result
}

func sourceRequests(raw []observations.RawObservation) []SourceRequest {
	byType := map[string]observations.RawObservation{}
	for _, item := range raw {
		key := text(item.Payload["message_type"])
		if key == "" {
			key = "traffic_messages"
		}
		if _, exists := byType[key]; !exists {
			byType[key] = item
		}
	}
	result := make([]SourceRequest, 0, len(messageLabels))
	for _, label := range messageLabels {
		item, ok := byType[label.key]
		if !ok {
			result = append(result, SourceRequest{Key: label.key, Label: label.label, Status: "missing"})
			continue
		}
		result = append(result, SourceRequest{Key: label.key, Label: label.label, Status: "fetched", Endpoint: textPointer(item.Payload["request_url"]), ContentType: textPointer(item.Payload["content_type"]), FetchedAt: rawTime(item), MessageCount: featureCount(item)})
	}
	return result
}

func featureCount(raw observations.RawObservation) int {
	body, ok := raw.Payload["body"].(map[string]any)
	if ok {
		if value, ok := number(body["feature_count_returned"]); ok {
			return int(value)
		}
	}
	return len(featuresFromBody(raw.Payload["body"]))
}

func incidentFromEvent(event observations.NormalizedEvent, now time.Time) Incident {
	attrs := event.Attributes
	id := text(attrs["situation_id"])
	if id == "" {
		id = event.ID
	}
	title := event.Title
	if title == "" {
		title = event.Summary
	}
	return Incident{ID: id, Title: title, Description: event.Summary, Severity: event.Severity, EventType: event.EventType, StartsAt: timescope.Format(event.StartsAt), EndsAt: timescope.Format(event.EndsAt), Active: !event.StartsAt.After(now) && !event.EndsAt.Before(now), LocationRef: event.LocationRef, MessageType: textPointer(attrs["message_type"]), SituationType: textPointer(attrs["situation_type"]), LocationDescription: textPointer(attrs["location_description"]), FeatureNames: textList(attrs["feature_names"]), GeometryBbox: bbox(attrs["geometry_bbox"])}
}

func corridorsFromEvents(events []observations.NormalizedEvent, now time.Time) []Corridor {
	grouped := map[string][]observations.NormalizedEvent{}
	for _, event := range events {
		grouped[event.LocationRef] = append(grouped[event.LocationRef], event)
	}
	result := []Corridor{}
	for key, items := range grouped {
		sort.SliceStable(items, func(i, j int) bool {
			activeI := !items[i].StartsAt.After(now) && !items[i].EndsAt.Before(now)
			activeJ := !items[j].StartsAt.After(now) && !items[j].EndsAt.Before(now)
			if activeI != activeJ {
				return activeI
			}
			if severityRank(items[i].Severity) != severityRank(items[j].Severity) {
				return severityRank(items[i].Severity) > severityRank(items[j].Severity)
			}
			return items[i].StartsAt.After(items[j].StartsAt)
		})
		latest := items[0]
		active, weather := 0, 0
		for _, item := range items {
			if !item.StartsAt.After(now) && !item.EndsAt.Before(now) {
				active++
			}
			if item.EventType == "road_weather_risk" {
				weather++
			}
		}
		result = append(result, Corridor{Key: key, Label: corridorLabel(key), EventCount: len(items), ActiveEventCount: active, WeatherRiskCount: weather, Severity: latest.Severity, LatestTitle: nonEmpty(latest.Title, latest.Summary), LatestValidTo: timescope.Format(latest.EndsAt), GeometryBbox: bbox(latest.Attributes["geometry_bbox"])})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ActiveEventCount != result[j].ActiveEventCount {
			return result[i].ActiveEventCount > result[j].ActiveEventCount
		}
		if severityRank(result[i].Severity) != severityRank(result[j].Severity) {
			return severityRank(result[i].Severity) > severityRank(result[j].Severity)
		}
		return result[i].Label < result[j].Label
	})
	return result
}

func qualityFrom(features []map[string]any, events []observations.NormalizedEvent, now time.Time) Quality {
	coverage, missing := fieldCoverage(features)
	active, road, rail, weather := 0, 0, 0, 0
	locations := map[string]struct{}{}
	for _, event := range events {
		if !event.StartsAt.After(now) && !event.EndsAt.Before(now) {
			active++
		}
		if _, ok := roadEventTypes[event.EventType]; ok {
			road++
		}
		if _, ok := railEventTypes[event.EventType]; ok {
			rail++
		}
		if event.EventType == "road_weather_risk" {
			weather++
		}
		locations[event.LocationRef] = struct{}{}
	}
	notes := []string{"Rail datasets are cataloged under Digitraffic, but the current collector ingests road traffic messages."}
	if len(missing) > 0 {
		notes = append(notes, "Missing full raw message fields: "+strings.Join(missing, ", ")+".")
	}
	return Quality{RawMessageCount: len(features), NormalizedEventCount: len(events), ActiveEventCount: active, RoadEventCount: road, RailEventCount: rail, WeatherRiskCount: weather, CorridorCount: len(locations), FieldCoveragePct: round(coverage, 1), MissingFields: missing, Notes: notes}
}

func fieldCoverage(features []map[string]any) (float64, []string) {
	if len(features) == 0 {
		return 0, []string{"situation id", "situation type", "release time", "title", "location"}
	}
	missing := []string{}
	checks := []struct {
		label string
		value func(map[string]any, map[string]any, map[string]any) any
	}{{"situation id", func(_, props, _ map[string]any) any { return props["situationId"] }}, {"situation type", func(_, props, _ map[string]any) any { return props["situationType"] }}, {"release time", func(_, props, _ map[string]any) any {
		return nonEmpty(text(props["releaseTime"]), text(props["versionTime"]))
	}}, {"title", func(_, _, announcement map[string]any) any { return announcement["title"] }}, {"location", func(feature, _, announcement map[string]any) any { return featureLocation(feature, announcement) }}}
	present := 0
	for _, check := range checks {
		found := false
		for _, feature := range features {
			props, _ := feature["properties"].(map[string]any)
			announcement := announcementFor(feature)
			if value := check.value(feature, props, announcement); value != nil && value != "" && fmt.Sprint(value) != "[]" {
				found = true
				break
			}
		}
		if found {
			present++
		} else {
			missing = append(missing, check.label)
		}
	}
	return float64(present) / float64(len(checks)) * 100, missing
}

func dataPipeline(requests []SourceRequest, features []map[string]any, events []observations.NormalizedEvent, corridors []Corridor) []DataStage {
	fetched := 0
	var latest *string
	for _, request := range requests {
		if request.Status == "fetched" {
			fetched++
			if latest == nil {
				latest = request.FetchedAt
			}
		}
	}
	rail := 0
	for _, event := range events {
		if _, ok := railEventTypes[event.EventType]; ok {
			rail++
		}
	}
	updated := latest
	if len(events) > 0 {
		value := timescope.Format(events[0].StartsAt)
		updated = &value
	}
	return []DataStage{{Key: "source_acquisition", Label: "Source acquisition", Status: choose(fetched > 0, "ready", "missing"), Detail: fmt.Sprintf("%d of %d Digitraffic road message feeds fetched.", fetched, len(requests)), RecordCount: intPointer(fetched), UpdatedAt: latest}, {Key: "cleaning_normalization", Label: "Cleaning & normalization", Status: choose(len(events) > 0, "ready", "empty"), Detail: fmt.Sprintf("%d normalized road and rail events available.", len(events)), RecordCount: intPointer(len(events)), UpdatedAt: updated}, {Key: "rail_readiness", Label: "Rail readiness", Status: choose(rail > 0, "ready", "planned"), Detail: choose(rail > 0, fmt.Sprintf("%d normalized rail events available.", rail), "Rail source family is cataloged; ingestion is not enabled in the current collector."), RecordCount: intPointer(rail), UpdatedAt: latest}, {Key: "visualization_ready", Label: "Visualization-ready data", Status: choose(len(features) > 0 || len(corridors) > 0, "ready", "empty"), Detail: fmt.Sprintf("%d raw messages, %d event rows, and %d corridor groups prepared.", len(features), len(events), len(corridors)), RecordCount: intPointer(len(features) + len(events) + len(corridors)), UpdatedAt: updated}}
}

func summary(quality Quality, historical bool) *string {
	if quality.RawMessageCount == 0 && quality.NormalizedEventCount == 0 {
		return stringPointer("No Digitraffic road or rail messages are available yet.")
	}
	when := "are active now"
	if historical {
		when = "were active at the selected snapshot time"
	}
	return stringPointer(fmt.Sprintf("%d road messages decoded. %d events %s across %d corridor groups; %d are road-weather risks.", quality.RawMessageCount, quality.ActiveEventCount, when, quality.CorridorCount, quality.WeatherRiskCount))
}

func incidentSort(event observations.NormalizedEvent, now time.Time) (bool, int, string) {
	return !event.StartsAt.After(now) && !event.EndsAt.Before(now), severityRank(event.Severity), timescope.Format(event.StartsAt)
}
func severityRank(value string) int {
	return map[string]int{"HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}[strings.ToUpper(value)]
}
func corridorLabel(value string) string {
	if strings.HasPrefix(value, "road-") {
		return "Road " + strings.TrimPrefix(value, "road-")
	}
	return strings.Title(strings.ReplaceAll(value, "_", " "))
}
func announcementFor(feature map[string]any) map[string]any {
	props, _ := feature["properties"].(map[string]any)
	list, _ := props["announcements"].([]any)
	for _, language := range []string{"en", "fi", "sv"} {
		for _, item := range list {
			if candidate, ok := item.(map[string]any); ok && strings.ToLower(text(candidate["language"])) == language {
				return candidate
			}
		}
	}
	for _, item := range list {
		if candidate, ok := item.(map[string]any); ok {
			return candidate
		}
	}
	return map[string]any{}
}
func featureLocation(feature, announcement map[string]any) any {
	if location, ok := announcement["location"].(map[string]any); ok && location["description"] != nil {
		return location["description"]
	}
	if announcement["locationDescription"] != nil {
		return announcement["locationDescription"]
	}
	if geometry, ok := feature["geometry"].(map[string]any); ok {
		return geometry["bbox"]
	}
	return nil
}
func bbox(value any) []float64 {
	list, ok := value.([]any)
	if !ok || len(list) != 4 {
		return nil
	}
	result := make([]float64, 0, 4)
	for _, item := range list {
		value, ok := number(item)
		if !ok {
			return nil
		}
		result = append(result, value)
	}
	return result
}
func textList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return []string{}
	}
	result := []string{}
	for _, item := range list {
		if value := text(item); value != "" {
			result = append(result, value)
		}
	}
	return result
}
func text(value any) string {
	if value, ok := value.(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}
func textPointer(value any) *string {
	trimmed := text(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
func rawTime(raw observations.RawObservation) *string {
	if raw.Dataset == "" {
		return nil
	}
	value := timescope.Format(raw.ObservedAt)
	return &value
}
func latestObserved(raw []observations.RawObservation) *time.Time {
	var latest *time.Time
	for _, item := range raw {
		if item.Dataset == "" {
			continue
		}
		if latest == nil || item.ObservedAt.After(*latest) {
			value := item.ObservedAt
			latest = &value
		}
	}
	return latest
}
func latestString(value *time.Time) *string {
	if value == nil {
		return nil
	}
	text := timescope.Format(*value)
	return &text
}
func stringPointer(value string) *string { return &value }
func intPointer(value int) *int          { return &value }
func metric(key, label, value string) Metric {
	return Metric{Key: key, Label: label, LabelKey: metricLabelKey(key), Value: value}
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
func number(value any) (float64, bool) {
	switch value := value.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	}
	return 0, false
}
func round(value float64, places int) float64 {
	multiplier := 1.0
	for i := 0; i < places; i++ {
		multiplier *= 10
	}
	return float64(int(value*multiplier+0.5)) / multiplier
}
func nonEmpty(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
func choose(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}
