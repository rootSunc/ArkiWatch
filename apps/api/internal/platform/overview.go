package platform

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

type RawStat struct {
	SourceCode string
	Dataset    string
	AreaCode   string
	Count      int
	LatestAt   *time.Time
}

type PlatformData struct {
	Events  []observations.NormalizedEvent
	RawStat []RawStat
}

type PlatformQuery struct {
	Now         time.Time
	LocationRef string
	WindowStart *time.Time
	WindowEnd   *time.Time
	Historical  bool
}

type Source struct {
	ID                  string   `json:"id"`
	SourceCode          string   `json:"source_code"`
	SourceName          string   `json:"source_name"`
	AuthType            string   `json:"auth_type"`
	PollIntervalSeconds int      `json:"poll_interval_seconds"`
	OperationalStatus   string   `json:"operational_status"`
	Stage               string   `json:"stage"`
	Categories          []string `json:"categories"`
	Datasets            []string `json:"datasets"`
	KeyDataItems        []string `json:"key_data_items"`
	LicenseLabel        *string  `json:"license_label"`
	DocumentationURL    *string  `json:"documentation_url"`
	LastRunStatus       *string  `json:"last_run_status"`
	LastRunStartedAt    *string  `json:"last_run_started_at"`
	LastRunFinishedAt   *string  `json:"last_run_finished_at"`
	RecordsIngested     *int     `json:"records_ingested"`
	ErrorMessage        *string  `json:"error_message"`
}

type Metric struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	LabelKey    string   `json:"label_key"`
	Value       string   `json:"value"`
	Tone        string   `json:"tone"`
	Unit        *string  `json:"unit"`
	Detail      *string  `json:"detail"`
	UpdatedAt   *string  `json:"updated_at"`
	SourceCodes []string `json:"source_codes"`
}

type KeyDataItem struct {
	Key      string `json:"key"`
	LabelKey string `json:"label_key"`
}

type Visualization struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Type        string         `json:"type"`
	Description string         `json:"description"`
	Status      string         `json:"status"`
	Unit        *string        `json:"unit"`
	SourceCodes []string       `json:"source_codes"`
	UpdatedAt   *string        `json:"updated_at"`
	Data        map[string]any `json:"data"`
}

type Event struct {
	ID          string         `json:"id"`
	CategoryKey string         `json:"category_key"`
	EventType   string         `json:"event_type"`
	Title       string         `json:"title"`
	Body        string         `json:"body"`
	Severity    string         `json:"severity"`
	StartsAt    string         `json:"starts_at"`
	EndsAt      string         `json:"ends_at"`
	SourceCodes []string       `json:"source_codes"`
	Evidence    []string       `json:"evidence"`
	Attributes  map[string]any `json:"attributes"`
}

type Category struct {
	Key            string          `json:"key"`
	Title          string          `json:"title"`
	Description    string          `json:"description"`
	Status         string          `json:"status"`
	Stage          string          `json:"stage"`
	Priority       string          `json:"priority"`
	SourceCodes    []string        `json:"source_codes"`
	KeyDataItems   []KeyDataItem   `json:"key_data_items"`
	SummaryMetrics []Metric        `json:"summary_metrics"`
	Visualizations []Visualization `json:"visualizations"`
	Events         []Event         `json:"events"`
	Sources        []Source        `json:"sources"`
}

type Overview struct {
	CheckedAt    string         `json:"checked_at"`
	TimeScope    map[string]any `json:"time_scope"`
	AppName      string         `json:"app_name"`
	Timezone     string         `json:"timezone"`
	CoverageArea string         `json:"coverage_area"`
	HealthStatus string         `json:"health_status"`
	Categories   []Category     `json:"categories"`
	RecentEvents []Event        `json:"recent_events"`
	Sources      []Source       `json:"sources"`
}

type categoryDefinition struct {
	Key, Title, Description, Stage, Priority string
	SourceCodes, KeyItems, EventTypes        []string
}

var categoryDefinitions = []categoryDefinition{
	{Key: "weather", Title: "Weather", Description: "FMI forecasts, warnings, rain windows, wind, and outdoor weather risk.", Stage: "connected", Priority: "P0", SourceCodes: []string{"fmi"}, KeyItems: []string{"temperature", "precipitation", "wind_speed", "wind_gust", "humidity", "visibility", "weather_warning", "radar_nowcast", "validity_window"}, EventTypes: []string{"weather_outlook", "rain_risk"}},
	{Key: "air", Title: "Air quality", Description: "HSY station air-quality indexes and Open-Meteo city pollutant concentrations for exposure and ventilation timing.", Stage: "connected", Priority: "P0", SourceCodes: []string{"hsy", "open_meteo_air"}, KeyItems: []string{"air_quality_index", "european_aqi", "pm2_5", "pm10", "no2", "station_location"}, EventTypes: []string{"air_quality_status", "air_quality_poor"}},
	{Key: "transit", Title: "Transit", Description: "Digitransit service alerts, delay windows, routes, stops, and vehicle context.", Stage: "connected", Priority: "P0", SourceCodes: []string{"digitransit"}, KeyItems: []string{"route_id", "trip_id", "stop_id", "arrival_prediction", "service_alert"}, EventTypes: []string{"transit_delay", "transit_disruption"}},
	{Key: "energy", Title: "Energy", Description: "Household spot-price and Fingrid electricity-system signals for flexible use.", Stage: "connected", Priority: "P0", SourceCodes: []string{"porssisahko", "fingrid"}, KeyItems: []string{"spot_price", "price_forecast", "consumption", "generation", "generation_forecast", "wind_power", "low_value_window"}, EventTypes: []string{"cheap_energy_window"}},
	{Key: "traffic", Title: "Road and rail", Description: "Fintraffic road, rail, marine, road-weather, and disruption signals.", Stage: "connected", Priority: "P0", SourceCodes: []string{"digitraffic"}, KeyItems: []string{"traffic_message", "road_weather", "traffic_volume", "average_speed", "train_running_status"}, EventTypes: []string{"road_disruption", "road_weather_risk", "rail_delay", "marine_disruption"}},
	{Key: "water", Title: "Water and snow", Description: "SYKE and Flood Centre hydrology, flood, drought, snow, ice, and water quality signals.", Stage: "connected", Priority: "P1", SourceCodes: []string{"syke"}, KeyItems: []string{"water_level", "discharge", "groundwater", "snow_water_equivalent", "flood_warning"}, EventTypes: []string{"flood_warning", "drought_risk", "snow_load", "blue_green_algae"}},
	{Key: "city_services", Title: "City services", Description: "Service Map and HRI service datasets for daily public-service context.", Stage: "connected", Priority: "P1", SourceCodes: []string{"servicemap", "hri"}, KeyItems: []string{"service_location", "opening_hours", "temporary_closure", "accessibility"}, EventTypes: []string{"service_closure", "facility_availability"}},
	{Key: "events", Title: "Linked Events", Description: "City Linked Events catalogs for upcoming public events, venues, keywords, ticketing, audience, and language context.", Stage: "connected", Priority: "P1", SourceCodes: []string{"linkedevents"}, KeyItems: []string{"event_id", "event_time", "event_location", "keywords", "ticketing", "event_language"}, EventTypes: []string{"public_event"}},
	{Key: "geospatial", Title: "Geospatial base", Description: "National and Helsinki geodata for addresses, buildings, districts, terrain, and planning layers.", Stage: "background", Priority: "P1", SourceCodes: []string{"nls", "hel_geodata"}, KeyItems: []string{"address", "building", "district", "parcel", "geometry"}},
	{Key: "regional_profile", Title: "Regional profile", Description: "Statistics Finland and THL indicators for municipal, postal-code, health, and welfare context.", Stage: "background", Priority: "P2", SourceCodes: []string{"statfi", "thl_sotkanet"}, KeyItems: []string{"population", "age_structure", "income", "employment", "health_indicator"}},
}

type catalogSource struct {
	Code, Name, Auth, Stage        string
	Poll                           int
	Categories, Datasets, KeyItems []string
	Endpoint, License, Docs        string
}

var catalogSources = []catalogSource{
	{Code: "fmi", Name: "Finnish Meteorological Institute", Auth: "NONE", Stage: "connected", Poll: 1800, Categories: []string{"weather"}, Datasets: []string{"forecast", "warnings", "observations"}, KeyItems: []string{"temperature", "precipitation", "wind_speed", "wind_gust", "humidity", "weather_warning", "radar_nowcast"}, Endpoint: "https://opendata.fmi.fi", License: "Open data", Docs: "https://en.ilmatieteenlaitos.fi/open-data"},
	{Code: "digitransit", Name: "Digitransit / HSL", Auth: "NONE", Stage: "connected", Poll: 600, Categories: []string{"transit"}, Datasets: []string{"routing", "gtfs", "gtfs_rt_alerts", "vehicle_positions"}, KeyItems: []string{"route_id", "trip_id", "stop_id", "service_alert"}, Endpoint: "https://api.digitransit.fi", License: "CC BY 4.0 / source-specific terms", Docs: "https://www.hsl.fi/en/hsl/open-data"},
	{Code: "fingrid", Name: "Fingrid", Auth: "API_KEY", Stage: "connected", Poll: 3600, Categories: []string{"energy"}, Datasets: []string{"consumption", "generation", "generation_forecast", "market_signals"}, KeyItems: []string{"consumption", "generation", "wind_power", "low_value_window"}, Endpoint: "https://data.fingrid.fi/api", License: "Open data", Docs: "https://www.fingrid.fi/en/electricity-market-information/fingrid-open-data/"},
	{Code: "porssisahko", Name: "Porssisahko.net", Auth: "NONE", Stage: "connected", Poll: 43200, Categories: []string{"energy"}, Datasets: []string{"energy_price_timeseries"}, KeyItems: []string{"spot_price", "price_forecast", "low_price_window"}, Endpoint: "https://api.porssisahko.net/v2/latest-prices.json", License: "Open API", Docs: "https://porssisahko.net/api"},
	{Code: "hsy", Name: "HSY Air Quality", Auth: "NONE", Stage: "connected", Poll: 1800, Categories: []string{"air"}, Datasets: []string{"air_quality_now", "air_quality_stations"}, KeyItems: []string{"air_quality_index", "pm2_5", "pm10", "no2", "station_location"}, Endpoint: "https://kartta.hsy.fi/geoserver/ilmanlaatu/wfs", License: "Open data", Docs: "https://www.hsy.fi/en/environmental-information/open-data/"},
	{Code: "open_meteo_air", Name: "Open-Meteo Air Quality", Auth: "NONE", Stage: "connected", Poll: 1800, Categories: []string{"air"}, Datasets: []string{"air_quality_current"}, KeyItems: []string{"european_aqi", "pm2_5", "pm10", "no2", "city_location"}, Endpoint: "https://air-quality-api.open-meteo.com/v1/air-quality", License: "CC BY 4.0", Docs: "https://open-meteo.com/en/docs/air-quality-api"},
	{Code: "digitraffic", Name: "Fintraffic Digitraffic", Auth: "NONE", Stage: "connected", Poll: 600, Categories: []string{"traffic"}, Datasets: []string{"road_traffic", "railway_traffic", "marine_traffic", "road_weather"}, KeyItems: []string{"traffic_message", "road_weather", "traffic_volume", "train_status"}, Endpoint: "https://tie.digitraffic.fi", License: "CC BY 4.0", Docs: "https://www.digitraffic.fi/en/"},
	{Code: "syke", Name: "Finnish Environment Institute", Auth: "NONE", Stage: "connected", Poll: 14400, Categories: []string{"water"}, Datasets: []string{"hydrology", "hydrology_stations", "water_quality", "algal_bloom", "flood_context"}, KeyItems: []string{"water_level", "discharge", "groundwater", "snow_water_equivalent"}, Endpoint: "https://www.syke.fi/en/environmental-data/open-web-services/environmental-data-apis", License: "Open data", Docs: "https://www.syke.fi/en/environmental-data/open-web-services/environmental-data-apis"},
	{Code: "servicemap", Name: "Helsinki Service Map", Auth: "NONE", Stage: "connected", Poll: 21600, Categories: []string{"city_services"}, Datasets: []string{"service_units", "accessibility", "opening_hours"}, KeyItems: []string{"service_location", "opening_hours", "accessibility"}, Endpoint: "https://www.hel.fi/palvelukarttaws/rest/v4", License: "CC BY 4.0", Docs: "https://www.hel.fi/palvelukarttaws/restpages/index_en.html"},
	{Code: "linkedevents", Name: "Linked Events city APIs", Auth: "NONE", Stage: "connected", Poll: 21600, Categories: []string{"events"}, Datasets: []string{"events", "places", "keywords"}, KeyItems: []string{"event_time", "event_location", "event_description", "event_language", "ticketing", "audience"}, Endpoint: "https://api.hel.fi/linkedevents/v1", License: "Open data", Docs: "https://github.com/City-of-Helsinki/linkedevents"},
	{Code: "hri", Name: "Helsinki Region Infoshare", Auth: "NONE", Stage: "planned", Poll: 86400, Categories: []string{"city_services"}, Datasets: []string{"dataset_catalog", "city_indicators", "procurement", "cycling_counts"}, KeyItems: []string{"dataset_metadata", "resource_url", "license", "update_frequency"}, Endpoint: "https://hri.fi/data/api/3/action", License: "Dataset-specific open licenses", Docs: "https://hri.fi/en_gb/"},
	{Code: "nls", Name: "National Land Survey of Finland", Auth: "NONE", Stage: "background", Poll: 86400, Categories: []string{"geospatial"}, Datasets: []string{"topographic_database", "addresses", "buildings", "place_names"}, KeyItems: []string{"address", "building", "place_name", "geometry"}, Endpoint: "https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1", License: "Open data attribution required", Docs: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/"},
	{Code: "hel_geodata", Name: "City of Helsinki Geodata", Auth: "NONE", Stage: "background", Poll: 86400, Categories: []string{"geospatial"}, Datasets: []string{"buildings", "planning", "districts", "nature", "3d_city_model"}, KeyItems: []string{"building", "planning_area", "district", "terrain_model"}, Endpoint: "https://kartta.hel.fi/ws/geoserver/avoindata/wfs", License: "CC BY 4.0", Docs: "https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/"},
	{Code: "statfi", Name: "Statistics Finland", Auth: "NONE", Stage: "background", Poll: 86400, Categories: []string{"regional_profile"}, Datasets: []string{"statfin", "paavo", "municipal_key_figures"}, KeyItems: []string{"population", "age_structure", "income", "employment"}, Endpoint: "https://pxdata.stat.fi/PxWeb/api/v1/en", License: "Open data", Docs: "https://stat.fi/en/services/statistical-data-services/open-data-and-interfaces"},
	{Code: "thl_sotkanet", Name: "THL Sotkanet", Auth: "NONE", Stage: "background", Poll: 86400, Categories: []string{"regional_profile"}, Datasets: []string{"indicators", "municipal_health", "welfare_regions"}, KeyItems: []string{"indicator_id", "area", "year", "value"}, Endpoint: "https://sotkanet.fi/rest/1.1", License: "CC BY 4.0", Docs: "https://sotkanet.fi/sotkanet/en/ohje/74"},
}

func BuildOverview(data PlatformData, scope timescope.Scope, cfg config.Config, statusItems []sources.Status, locationRef string) Overview {
	sourceItems := buildSources(cfg, statusItems, scope.ReferenceTime)
	bySource := map[string]Source{}
	for _, item := range sourceItems {
		bySource[item.SourceCode] = item
	}
	categories := make([]Category, 0, len(categoryDefinitions))
	allEvents := []Event{}
	for _, definition := range categoryDefinitions {
		rawEvents := []observations.NormalizedEvent{}
		for _, event := range data.Events {
			if !contains(definition.EventTypes, event.EventType) || !contains(definition.SourceCodes, event.SourceCode) {
				continue
			}
			if cityScoped(definition.Key) && event.LocationRef != "" && event.LocationRef != locationRef {
				continue
			}
			rawEvents = append(rawEvents, event)
		}
		events := make([]Event, 0, len(rawEvents))
		for _, event := range rawEvents {
			item := eventRead(event, definition.Key, bySource[event.SourceCode])
			events = append(events, item)
			allEvents = append(allEvents, item)
		}
		sourcesForCategory := []Source{}
		for _, code := range definition.SourceCodes {
			if source, ok := bySource[code]; ok {
				sourcesForCategory = append(sourcesForCategory, source)
			}
		}
		status := categoryStatus(definition, events, sourcesForCategory, rawStatCount(data.RawStat, definition.SourceCodes))
		categories = append(categories, Category{Key: definition.Key, Title: definition.Title, Description: definition.Description, Status: status, Stage: definition.Stage, Priority: definition.Priority, SourceCodes: definition.SourceCodes, KeyDataItems: keyItems(definition.KeyItems), SummaryMetrics: categoryMetrics(definition, events, sourcesForCategory, data.RawStat), Visualizations: categoryVisualizations(definition, rawEvents, events, sourcesForCategory), Events: events, Sources: sourcesForCategory})
	}
	sort.Slice(allEvents, func(i, j int) bool { return allEvents[i].StartsAt < allEvents[j].StartsAt })
	if len(allEvents) > 12 {
		allEvents = allEvents[:12]
	}
	return Overview{CheckedAt: timescope.Format(scope.ReferenceTime), TimeScope: scope.Payload(), AppName: cfg.AppName, Timezone: cfg.Timezone, CoverageArea: coverageArea(locationRef), HealthStatus: overviewHealth(categories), Categories: categories, RecentEvents: allEvents, Sources: sourceItems}
}

func buildSources(cfg config.Config, statuses []sources.Status, now time.Time) []Source {
	byCode := map[string]sources.Status{}
	for _, item := range statuses {
		byCode[item.SourceCode] = item
	}
	result := make([]Source, 0, len(catalogSources))
	for _, catalog := range catalogSources {
		item := Source{ID: "catalog-" + catalog.Code, SourceCode: catalog.Code, SourceName: catalog.Name, AuthType: catalog.Auth, PollIntervalSeconds: catalog.Poll, OperationalStatus: catalog.Stage, Stage: catalog.Stage, Categories: catalog.Categories, Datasets: catalog.Datasets, KeyDataItems: catalog.KeyItems, LicenseLabel: stringPointer(catalog.License), DocumentationURL: stringPointer(catalog.Docs)}
		if status, ok := byCode[catalog.Code]; ok {
			item.ID, item.OperationalStatus, item.PollIntervalSeconds = status.ID, sourceStatus(status, now), status.PollIntervalSeconds
			if status.LastRun != nil {
				item.LastRunStatus = stringPointer(status.LastRun.Status)
				item.LastRunStartedAt = stringPointer(status.LastRun.StartedAt)
				item.LastRunFinishedAt = status.LastRun.FinishedAt
				records := status.LastRun.RecordsIngested
				item.RecordsIngested = &records
				item.ErrorMessage = status.LastRun.ErrorMessage
			}
		}
		result = append(result, item)
	}
	return result
}

func sourceStatus(item sources.Status, now time.Time) string {
	if !item.IsActive {
		return "inactive"
	}
	if item.LastRun == nil {
		return "pending"
	}
	if item.LastRun.Status != "succeeded" {
		return "failing"
	}
	reference := item.LastRun.FinishedAt
	if reference == nil {
		reference = &item.LastRun.StartedAt
	}
	parsed, err := time.Parse(time.RFC3339Nano, *reference)
	if err != nil || now.Sub(parsed) > time.Duration(item.PollIntervalSeconds*2)*time.Second {
		return "stale"
	}
	return "healthy"
}

func categoryStatus(def categoryDefinition, events []Event, categorySources []Source, rawCount int) string {
	max := 0
	for _, event := range events {
		if severityRank(event.Severity) > max {
			max = severityRank(event.Severity)
		}
	}
	if max >= 3 {
		return "alert"
	}
	if max == 2 {
		return "watch"
	}
	if def.Stage != "connected" && len(events) == 0 {
		return def.Stage
	}
	for _, source := range categorySources {
		if source.OperationalStatus == "failing" || source.OperationalStatus == "stale" || source.OperationalStatus == "pending" {
			return source.OperationalStatus
		}
	}
	if len(events) == 0 && rawCount == 0 {
		return "empty"
	}
	return "healthy"
}

func categoryMetrics(def categoryDefinition, events []Event, categorySources []Source, stats []RawStat) []Metric {
	sourceStatusValue := "Unknown"
	if len(categorySources) > 0 {
		sourceStatusValue = strings.Title(categorySources[0].OperationalStatus)
	}
	records := 0
	for _, source := range categorySources {
		if source.RecordsIngested != nil {
			records += *source.RecordsIngested
		}
	}
	metrics := []Metric{buildMetric("catalog_stage", "Catalog stage", strings.Title(def.Stage), "neutral", def.SourceCodes, ""), buildMetric("source_status", "Source status", sourceStatusValue, toneForStatus(strings.ToLower(sourceStatusValue)), def.SourceCodes, ""), buildMetric("active_events", "Active events", fmt.Sprintf("%d", len(events)), toneForEvent(events), def.SourceCodes, ""), buildMetric("records_ingested", "Latest ingest", fmt.Sprintf("%d", records), toneForStatus(strings.ToLower(sourceStatusValue)), def.SourceCodes, "records")}
	if count := rawStatCount(stats, def.SourceCodes); count > 0 {
		metrics = append(metrics, buildMetric("raw_observations", "Raw observations", fmt.Sprintf("%d", count), "good", def.SourceCodes, "records"))
	}
	return metrics
}

func categoryVisualizations(def categoryDefinition, raw []observations.NormalizedEvent, events []Event, categorySources []Source) []Visualization {
	updated := (*string)(nil)
	if len(events) > 0 {
		updated = &events[0].StartsAt
	}
	return []Visualization{{ID: def.Key + "-event-timeline", Title: "Event timeline", Type: "timeline", Description: "Normalized event and guidance windows for this category.", Status: choose(len(events) > 0, "ready", "empty"), SourceCodes: def.SourceCodes, UpdatedAt: updated, Data: map[string]any{"items": eventsToTimeline(events)}}, {ID: def.Key + "-severity-distribution", Title: "Severity distribution", Type: "bar", Description: "Visible events grouped by severity level.", Status: choose(len(events) > 0, "ready", "empty"), Unit: stringPointer("events"), SourceCodes: def.SourceCodes, UpdatedAt: updated, Data: severityDistribution(events)}, {ID: def.Key + "-source-volume", Title: "Source collection volume", Type: "bar", Description: "Latest collector run volume for the source(s) backing this category.", Status: choose(len(categorySources) > 0, "ready", "empty"), Unit: stringPointer("records"), SourceCodes: def.SourceCodes, UpdatedAt: updated, Data: map[string]any{"points": sourcePoints(categorySources)}}}
}

func eventRead(event observations.NormalizedEvent, category string, source Source) Event {
	title := nonEmpty(event.Title, event.Summary)
	evidence := []string{"Event type: " + event.EventType}
	if source.SourceCode != "" {
		evidence = append([]string{source.SourceName + " (" + source.SourceCode + ")"}, evidence...)
	}
	return Event{ID: event.ID, CategoryKey: category, EventType: event.EventType, Title: title, Body: event.Summary, Severity: event.Severity, StartsAt: timescope.Format(event.StartsAt), EndsAt: timescope.Format(event.EndsAt), SourceCodes: []string{event.SourceCode}, Evidence: evidence, Attributes: event.Attributes}
}
func eventsToTimeline(events []Event) []map[string]any {
	result := []map[string]any{}
	for _, event := range events {
		result = append(result, map[string]any{"id": event.ID, "label": event.Title, "detail": event.Body, "severity": event.Severity, "starts_at": event.StartsAt, "ends_at": event.EndsAt})
	}
	if len(result) > 8 {
		return result[:8]
	}
	return result
}
func severityDistribution(events []Event) map[string]any {
	counts := map[string]int{"INFO": 0, "LOW": 0, "MEDIUM": 0, "HIGH": 0}
	for _, event := range events {
		counts[strings.ToUpper(event.Severity)]++
	}
	points := []map[string]any{}
	for _, severity := range []string{"INFO", "LOW", "MEDIUM", "HIGH"} {
		points = append(points, map[string]any{"label": strings.Title(severity), "value": counts[severity], "tone": toneForSeverity(severity)})
	}
	return map[string]any{"points": points}
}
func sourcePoints(sources []Source) []map[string]any {
	result := []map[string]any{}
	for _, source := range sources {
		if source.RecordsIngested != nil {
			result = append(result, map[string]any{"label": source.SourceCode, "value": *source.RecordsIngested, "tone": toneForStatus(source.OperationalStatus), "detail": source.OperationalStatus})
		}
	}
	return result
}
func keyItems(keys []string) []KeyDataItem {
	result := make([]KeyDataItem, 0, len(keys))
	for _, key := range keys {
		result = append(result, KeyDataItem{Key: key, LabelKey: metricLabelKey(key)})
	}
	return result
}
func rawStatCount(stats []RawStat, sourceCodes []string) int {
	total := 0
	for _, stat := range stats {
		if contains(sourceCodes, stat.SourceCode) {
			total += stat.Count
		}
	}
	return total
}
func cityScoped(key string) bool {
	return map[string]bool{"weather": true, "air": true, "transit": true, "water": true, "city_services": true, "events": true}[key]
}
func overviewHealth(categories []Category) string {
	statuses := map[string]bool{}
	for _, category := range categories {
		if category.Stage == "connected" && category.Status != "empty" {
			statuses[category.Status] = true
		}
	}
	if statuses["alert"] || statuses["failing"] {
		return "alert"
	}
	if statuses["watch"] || statuses["stale"] || statuses["pending"] {
		return "watch"
	}
	if len(statuses) == 0 {
		return "healthy"
	}
	return "healthy"
}
func toneForSeverity(value string) string {
	switch strings.ToUpper(value) {
	case "HIGH":
		return "bad"
	case "MEDIUM":
		return "warn"
	case "LOW":
		return "good"
	default:
		return "neutral"
	}
}
func toneForStatus(value string) string {
	switch value {
	case "healthy", "ready":
		return "good"
	case "pending", "stale", "watch":
		return "warn"
	case "failing", "inactive", "alert":
		return "bad"
	default:
		return "neutral"
	}
}
func toneForEvent(events []Event) string {
	max := 0
	severity := "INFO"
	for _, event := range events {
		if severityRank(event.Severity) > max {
			max = severityRank(event.Severity)
			severity = event.Severity
		}
	}
	return toneForSeverity(severity)
}
func severityRank(value string) int {
	return map[string]int{"HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}[strings.ToUpper(value)]
}
func buildMetric(key, label, value, tone string, sources []string, unit string) Metric {
	return Metric{Key: key, Label: label, LabelKey: metricLabelKey(key), Value: value, Tone: tone, Unit: stringPointerIf(unit), SourceCodes: sources}
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
func stringPointer(value string) *string { return &value }
func stringPointerIf(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func choose(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}
func nonEmpty(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
