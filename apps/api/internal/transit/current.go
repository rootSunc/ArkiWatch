package transit

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

type Alert struct {
	State       string   `json:"state"`
	Filters     []string `json:"filters"`
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Severity    string   `json:"severity"`
	EventType   string   `json:"event_type"`
	StartsAt    string   `json:"starts_at"`
	EndsAt      string   `json:"ends_at"`
	Active      bool     `json:"active"`
	Cause       *string  `json:"cause"`
	Effect      *string  `json:"effect"`
	RouteIDs    []string `json:"route_ids"`
	StopIDs     []string `json:"stop_ids"`
	TripIDs     []string `json:"trip_ids"`
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
	RawAlertCount        int      `json:"raw_alert_count"`
	NormalizedEventCount int      `json:"normalized_event_count"`
	ActiveAlertCount     int      `json:"active_alert_count"`
	RouteAlertCount      int      `json:"route_alert_count"`
	StopAlertCount       int      `json:"stop_alert_count"`
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
	Alerts         []Alert             `json:"alerts"`
	SourceRequests []SourceRequest     `json:"source_requests"`
	DataPipeline   []DataStage         `json:"data_pipeline"`
	Quality        Quality             `json:"quality"`
}

func Build(data observations.TransitData, scope timescope.Scope, now time.Time, location string) (result Current) {
	defer func() { EnrichDetail(&result) }()
	rawAlerts := rawAlerts(data.Raw.Payload["body"])
	active, routes, stops := 0, 0, 0
	alerts := make([]Alert, 0, len(data.Events))
	for _, event := range data.Events {
		if !event.StartsAt.After(scope.ReferenceTime) && !event.EndsAt.Before(scope.ReferenceTime) {
			active++
		}
		if len(stringList(event.Attributes["route_ids"])) > 0 {
			routes++
		}
		if len(stringList(event.Attributes["stop_ids"])) > 0 {
			stops++
		}
		alerts = append(alerts, alertFromEvent(event, scope.ReferenceTime))
	}
	sort.SliceStable(alerts, func(i, j int) bool {
		if alerts[i].Active != alerts[j].Active {
			return alerts[i].Active
		}
		if severityRank(alerts[i].Severity) != severityRank(alerts[j].Severity) {
			return severityRank(alerts[i].Severity) > severityRank(alerts[j].Severity)
		}
		return alerts[i].StartsAt < alerts[j].StartsAt
	})
	missing := []string{}
	if len(rawAlerts) == 0 {
		missing = []string{"alert id", "header", "description", "effect", "time window"}
	}
	coverage := 0.0
	if len(rawAlerts) > 0 {
		present := 0
		for _, key := range []string{"id", "alertHeaderText", "alertDescriptionText", "effect", "effectiveStartDate"} {
			for _, item := range rawAlerts {
				if item[key] != nil && firstText(item[key]) != "" {
					present++
					break
				}
			}
		}
		coverage = float64(present) / 5 * 100
	}
	status := "empty"
	if len(rawAlerts) > 0 || len(alerts) > 0 {
		status = "ready"
	}
	if !data.Raw.ObservedAt.IsZero() && scope.Mode == "live" && data.Raw.ObservedAt.Before(scope.ReferenceTime.Add(-20*time.Minute)) && status == "ready" {
		status = "stale"
	}
	if location == "" {
		location = "helsinki"
	}
	locationPtr := &location
	quality := Quality{RawAlertCount: len(rawAlerts), NormalizedEventCount: len(alerts), ActiveAlertCount: active, RouteAlertCount: routes, StopAlertCount: stops, FieldCoveragePct: coverage, MissingFields: missing, Notes: []string{"HSL service alerts are read from the configured Digitransit feed."}}
	summary := fmt.Sprintf("%d HSL service alerts decoded. %d alerts are active now; %d include route scope and %d include stop scope.", len(rawAlerts), active, routes, stops)
	return Current{CheckedAt: timescope.Format(now), TimeScope: scope.Payload(), Status: status, Location: locationPtr, SourceCode: "digitransit", ObservedAt: optionalTime(data.Raw.ObservedAt), Summary: &summary, Metrics: []Metric{metric("raw_alerts", "Raw alerts", len(rawAlerts)), metric("active_alerts", "Active alerts", active), metric("disruptions", "Disruptions", countEvents(data.Events, "transit_disruption")), metric("delays", "Delays", countEvents(data.Events, "transit_delay")), metric("high_severity", "High severity", countSeverity(data.Events, "HIGH")), metric("route_scoped", "Route scoped", routes), metric("stop_scoped", "Stop scoped", stops)}, Alerts: alerts, SourceRequests: []SourceRequest{{Key: "service_alerts", Label: "HSL service alerts", Status: map[bool]string{true: "fetched", false: "missing"}[!data.Raw.ObservedAt.IsZero()], Endpoint: textPointer(data.Raw.Payload["request_url"]), ContentType: textPointer(data.Raw.Payload["content_type"]), FetchedAt: optionalTime(data.Raw.ObservedAt)}}, DataPipeline: pipeline(len(rawAlerts), len(alerts)), Quality: quality}
}

func Unavailable(scope timescope.Scope, now time.Time) (result Current) {
	defer func() { EnrichDetail(&result) }()
	summary := "Transit data is temporarily unavailable."
	return Current{CheckedAt: timescope.Format(now), TimeScope: scope.Payload(), Status: "unavailable", SourceCode: "digitransit", Summary: &summary, Metrics: []Metric{}, Alerts: []Alert{}, SourceRequests: []SourceRequest{}, DataPipeline: []DataStage{}}
}
func rawAlerts(value any) []map[string]any {
	if list, ok := value.([]any); ok {
		result := []map[string]any{}
		for _, item := range list {
			if m, ok := item.(map[string]any); ok {
				result = append(result, m)
			}
		}
		return result
	}
	if root, ok := value.(map[string]any); ok {
		if data, ok := root["data"].(map[string]any); ok {
			return rawAlerts(data["alerts"])
		}
		return rawAlerts(root["alerts"])
	}
	return nil
}
func alertFromEvent(event observations.NormalizedEvent, now time.Time) Alert {
	id := text(event.Attributes["alert_id"])
	if id == "" {
		id = event.ID
	}
	return Alert{ID: id, Title: event.Title, Description: event.Summary, Severity: event.Severity, EventType: event.EventType, StartsAt: timescope.Format(event.StartsAt), EndsAt: timescope.Format(event.EndsAt), Active: !event.StartsAt.After(now) && !event.EndsAt.Before(now), Cause: textPointer(event.Attributes["cause"]), Effect: textPointer(event.Attributes["effect"]), RouteIDs: stringList(event.Attributes["route_ids"]), StopIDs: stringList(event.Attributes["stop_ids"]), TripIDs: stringList(event.Attributes["trip_ids"])}
}
func metric(key, label string, value int) Metric {
	return Metric{Key: key, Label: label, LabelKey: key, Value: fmt.Sprint(value)}
}
func pipeline(raw, events int) []DataStage {
	rawCount, eventCount, total := raw, events, raw+events
	return []DataStage{{Key: "source_acquisition", Label: "Source acquisition", Status: map[bool]string{true: "ready", false: "missing"}[raw > 0], Detail: "Configured HSL service alert feed", RecordCount: &rawCount}, {Key: "cleaning_normalization", Label: "Cleaning & normalization", Status: map[bool]string{true: "ready", false: "empty"}[events > 0], Detail: fmt.Sprintf("%d normalized transit alert events available.", events), RecordCount: &eventCount}, {Key: "visualization_ready", Label: "Visualization-ready data", Status: map[bool]string{true: "ready", false: "empty"}[total > 0], Detail: fmt.Sprintf("%d raw alerts and %d timeline events prepared.", raw, events), RecordCount: &total}}
}
func countEvents(events []observations.NormalizedEvent, kind string) int {
	n := 0
	for _, event := range events {
		if event.EventType == kind {
			n++
		}
	}
	return n
}
func countSeverity(events []observations.NormalizedEvent, severity string) int {
	n := 0
	for _, event := range events {
		if event.Severity == severity {
			n++
		}
	}
	return n
}
func severityRank(value string) int {
	return map[string]int{"HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}[strings.ToUpper(value)]
}
func stringList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		if listString, ok := value.([]string); ok {
			return listString
		}
		return nil
	}
	result := []string{}
	for _, item := range list {
		if text := firstText(item); text != "" {
			result = append(result, text)
		}
	}
	return result
}
func firstText(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}
func text(value any) string { return firstText(value) }
func textPointer(value any) *string {
	text := firstText(value)
	if text == "" {
		return nil
	}
	return &text
}
func optionalTime(value time.Time) *string {
	if value.IsZero() {
		return nil
	}
	text := timescope.Format(value)
	return &text
}
func metricLabel(_ string) string { return "" }
