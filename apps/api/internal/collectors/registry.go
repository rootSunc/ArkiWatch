package collectors

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type endpointCollector struct {
	cfg        config.Config
	source     string
	dataset    string
	endpoint   string
	area       string
	headers    map[string]string
	query      func() map[string]string
	rangeQuery func(time.Time, time.Time) map[string]string
}

type fmiCollector struct{ cfg config.Config }

func (collector fmiCollector) SourceCode() string { return "fmi" }
func (collector fmiCollector) Dataset() string    { return "weather_forecast_raw" }
func (collector fmiCollector) Collect(ctx context.Context) ([]Observation, error) {
	endpoint := strings.TrimRight(collector.cfg.FMIAPIBaseURL, "/") + "/wfs"
	places := parseWeatherPlaces(collector.cfg.WeatherPlaces, collector.cfg)
	result := make([]Observation, 0, len(places))
	var firstErr error
	for _, place := range places {
		now := observedNow()
		query := map[string]string{
			"service": "WFS", "version": "2.0.0", "request": "getFeature",
			"storedquery_id": "fmi::forecast::harmonie::surface::point::timevaluepair",
			"place":          place.Place,
			"parameters":     "temperature,precipitation1h,totalcloudcover,windspeedms,windgust,winddirection,humidity,dewpoint,pressure,visibility,weathersymbol3,smartsymbol",
			"timestep":       "60",
		}
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", endpoint, nil, query)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		payload := payloadForRequest(body, endpoint+"?"+encodeQuery(query), headers.Get("Content-Type"))
		payload["place"], payload["area_code"], payload["fetched_at"], payload["request_params"] = place.Place, place.AreaCode, now.Format(time.RFC3339Nano), query
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), place.AreaCode, now, payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: place.AreaCode, ObservedAt: now, Payload: payload, Hash: hash})
	}
	if len(result) == 0 && firstErr != nil {
		return nil, firstErr
	}
	return result, nil
}

func (collector fmiCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	endpoint := strings.TrimRight(collector.cfg.FMIAPIBaseURL, "/") + "/wfs"
	places := parseWeatherPlaces(collector.cfg.WeatherPlaces, collector.cfg)
	if strings.TrimSpace(areaCode) != "" {
		filtered := []configuredLocation{}
		for _, place := range places {
			if place.AreaCode == strings.ToLower(strings.TrimSpace(areaCode)) {
				filtered = append(filtered, place)
			}
		}
		places = filtered
	}
	result := make([]Observation, 0, len(places))
	for _, place := range places {
		query := map[string]string{
			"service": "WFS", "version": "2.0.0", "request": "getFeature",
			"storedquery_id": "fmi::forecast::harmonie::surface::point::timevaluepair",
			"place":          place.Place, "starttime": start.UTC().Format(time.RFC3339), "endtime": end.UTC().Format(time.RFC3339),
			"parameters": "temperature,precipitation1h,totalcloudcover,windspeedms,windgust,winddirection,humidity,dewpoint,pressure,visibility,weathersymbol3,smartsymbol",
			"timestep":   "60",
		}
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", endpoint, nil, query)
		if err != nil {
			return nil, err
		}
		payload := payloadForRequest(body, endpoint+"?"+encodeQuery(query), headers.Get("Content-Type"))
		payload["place"], payload["area_code"], payload["window_start"], payload["window_end"], payload["cursor"] = place.Place, place.AreaCode, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano), cursor
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), place.AreaCode, start.UTC(), payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: place.AreaCode, ObservedAt: start.UTC(), Payload: payload, Hash: hash})
	}
	return result, nil
}

func (collector endpointCollector) SourceCode() string { return collector.source }
func (collector endpointCollector) Dataset() string    { return collector.dataset }
func (collector endpointCollector) Collect(ctx context.Context) ([]Observation, error) {
	now := observedNow()
	query := map[string]string{}
	if collector.query != nil {
		query = collector.query()
	}
	body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", collector.endpoint, collector.headers, query)
	if err != nil {
		return nil, err
	}
	payload := payloadForRequest(body, collector.endpoint, headers.Get("Content-Type"))
	hash, err := BuildObservationHash(collector.source, collector.dataset, collector.area, now, payload)
	if err != nil {
		return nil, err
	}
	return []Observation{{Dataset: collector.dataset, AreaCode: collector.area, ObservedAt: now, Payload: payload, Hash: hash}}, nil
}

func (collector endpointCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if collector.rangeQuery == nil {
		return nil, fmt.Errorf("%s does not support historical backfill yet", collector.source)
	}
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	query := collector.rangeQuery(start.UTC(), end.UTC())
	body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", collector.endpoint, collector.headers, query)
	if err != nil {
		return nil, err
	}
	resolvedArea := areaCode
	if strings.TrimSpace(resolvedArea) == "" {
		resolvedArea = collector.area
	}
	payload := payloadForRequest(body, collector.endpoint+"?"+encodeQuery(query), headers.Get("Content-Type"))
	payload["window_start"], payload["window_end"], payload["cursor"] = start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano), cursor
	hash, err := BuildObservationHash(collector.source, collector.dataset, resolvedArea, start.UTC(), payload)
	if err != nil {
		return nil, err
	}
	return []Observation{{Dataset: collector.dataset, AreaCode: resolvedArea, ObservedAt: start.UTC(), Payload: payload, Hash: hash}}, nil
}

type openMeteoCollector struct{ cfg config.Config }

func (collector openMeteoCollector) SourceCode() string { return "open_meteo_air" }
func (collector openMeteoCollector) Dataset() string    { return "air_quality_current" }
func (collector openMeteoCollector) Collect(ctx context.Context) ([]Observation, error) {
	locations := parseLocations(collector.cfg.OpenMeteoAirQualityLocations, collector.cfg)
	result := make([]Observation, 0, len(locations))
	for _, location := range locations {
		now := observedNow()
		query := map[string]string{"latitude": fmt.Sprintf("%.4f", location.Latitude), "longitude": fmt.Sprintf("%.4f", location.Longitude), "current": "european_aqi,pm10,pm2_5,nitrogen_dioxide", "timezone": collector.cfg.Timezone}
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", collector.cfg.OpenMeteoAirQualityURL, nil, query)
		if err != nil {
			return nil, err
		}
		payload := payloadForRequest(body, collector.cfg.OpenMeteoAirQualityURL+"?"+encodeQuery(query), headers.Get("Content-Type"))
		payload["fetched_at"], payload["area_code"], payload["place"] = now.Format(time.RFC3339Nano), location.AreaCode, location.Place
		payload["latitude"], payload["longitude"] = location.Latitude, location.Longitude
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), location.AreaCode, now, payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: location.AreaCode, ObservedAt: now, Payload: payload, Hash: hash})
	}
	return result, nil
}

func (collector openMeteoCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	locations := parseLocations(collector.cfg.OpenMeteoAirQualityLocations, collector.cfg)
	if strings.TrimSpace(areaCode) != "" {
		wanted := strings.ToLower(strings.TrimSpace(areaCode))
		filtered := locations[:0]
		for _, location := range locations {
			if location.AreaCode == wanted {
				filtered = append(filtered, location)
			}
		}
		locations = filtered
	}
	zone, err := time.LoadLocation(collector.cfg.Timezone)
	if err != nil {
		return nil, fmt.Errorf("load air-quality timezone: %w", err)
	}
	startDate := start.UTC().In(zone).Format("2006-01-02")
	endDate := end.Add(-time.Nanosecond).UTC().In(zone).Format("2006-01-02")
	result := make([]Observation, 0, len(locations))
	for _, location := range locations {
		query := map[string]string{
			"latitude":   fmt.Sprintf("%.4f", location.Latitude),
			"longitude":  fmt.Sprintf("%.4f", location.Longitude),
			"hourly":     "european_aqi,pm10,pm2_5,nitrogen_dioxide",
			"start_date": startDate,
			"end_date":   endDate,
			"timezone":   collector.cfg.Timezone,
		}
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", collector.cfg.OpenMeteoAirQualityURL, nil, query)
		if err != nil {
			return nil, err
		}
		body["current"] = currentFromHourly(body)
		payload := payloadForRequest(body, collector.cfg.OpenMeteoAirQualityURL+"?"+encodeQuery(query), headers.Get("Content-Type"))
		payload["fetched_at"], payload["window_start"], payload["window_end"], payload["cursor"] = observedNow().Format(time.RFC3339Nano), start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano), cursor
		payload["area_code"], payload["place"] = location.AreaCode, location.Place
		payload["latitude"], payload["longitude"] = location.Latitude, location.Longitude
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), location.AreaCode, start.UTC(), payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: location.AreaCode, ObservedAt: start.UTC(), Payload: payload, Hash: hash})
	}
	return result, nil
}

func currentFromHourly(body map[string]any) map[string]any {
	hourly, ok := body["hourly"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	times, ok := hourly["time"].([]any)
	if !ok || len(times) == 0 {
		return map[string]any{}
	}
	index := len(times) - 1
	current := map[string]any{"time": times[index]}
	for _, field := range []string{"european_aqi", "pm10", "pm2_5", "nitrogen_dioxide"} {
		if values, ok := hourly[field].([]any); ok && index < len(values) {
			current[field] = values[index]
		}
	}
	return current
}

type porssisahkoCollector struct{ cfg config.Config }

func (collector porssisahkoCollector) SourceCode() string { return "porssisahko" }
func (collector porssisahkoCollector) Dataset() string    { return "energy_price_timeseries" }
func (collector porssisahkoCollector) Collect(ctx context.Context) ([]Observation, error) {
	now := observedNow()
	body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", collector.cfg.ElectricityPriceAPIURL, nil, nil)
	if err != nil {
		return nil, err
	}
	payload := payloadForRequest(body, collector.cfg.ElectricityPriceAPIURL, headers.Get("Content-Type"))
	if body != nil {
		payload["body"] = body
		payload["unit"], payload["price_kind"], payload["includes_vat"] = "c/kWh", "spot_energy_price", true
	}
	area := strings.ToLower(collector.cfg.DefaultPlace)
	hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), area, now, payload)
	if err != nil {
		return nil, err
	}
	return []Observation{{Dataset: collector.Dataset(), AreaCode: area, ObservedAt: now, Payload: payload, Hash: hash}}, nil
}

func (collector porssisahkoCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	priceURL, err := historicalPriceURL(collector.cfg.ElectricityPriceAPIURL)
	if err != nil {
		return nil, err
	}
	zone, err := time.LoadLocation(collector.cfg.Timezone)
	if err != nil {
		return nil, fmt.Errorf("load electricity timezone: %w", err)
	}
	cursorAt := start.UTC().In(zone).Truncate(time.Hour)
	if cursorAt.Before(start.UTC().In(zone)) {
		cursorAt = cursorAt.Add(time.Hour)
	}
	endLocal := end.UTC().In(zone)
	prices := []any{}
	requestURLs := []string{}
	contentType := ""
	for cursorAt.Before(endLocal) {
		query := historicalPriceQuery(priceURL, cursorAt)
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", priceURL, nil, query)
		if err != nil {
			return nil, err
		}
		endAt := cursorAt.Add(time.Hour)
		body["startDate"], body["endDate"] = cursorAt.UTC().Format(time.RFC3339), endAt.UTC().Format(time.RFC3339)
		body["unit"], body["price_kind"], body["includes_vat"] = "c/kWh", "spot_energy_price", true
		prices = append(prices, body)
		requestURLs = append(requestURLs, priceURL+"?"+encodeQuery(query))
		contentType = headers.Get("Content-Type")
		cursorAt = endAt
	}
	resolvedArea := strings.TrimSpace(areaCode)
	if resolvedArea == "" {
		resolvedArea = strings.ToLower(collector.cfg.DefaultPlace)
	}
	payload := map[string]any{"request_urls": requestURLs, "content_type": contentType, "window_start": start.UTC().Format(time.RFC3339Nano), "window_end": end.UTC().Format(time.RFC3339Nano), "cursor": cursor, "body": map[string]any{"prices": prices, "unit": "c/kWh", "price_kind": "spot_energy_price", "includes_vat": true}}
	hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), resolvedArea, start.UTC(), payload)
	if err != nil {
		return nil, err
	}
	return []Observation{{Dataset: collector.Dataset(), AreaCode: resolvedArea, ObservedAt: start.UTC(), Payload: payload, Hash: hash}}, nil
}

// historicalPriceQuery builds the single-hour price request. The v1 endpoint
// takes a local date plus an hour number, while v2 rejects that form and wants
// one absolute timestamp with an explicit UTC offset.
func historicalPriceQuery(priceURL string, at time.Time) map[string]string {
	if strings.Contains(priceURL, "/v2/") {
		return map[string]string{"date": at.UTC().Format("2006-01-02T15:04:05Z")}
	}
	return map[string]string{"date": at.Format("2006-01-02"), "hour": strconv.Itoa(at.Hour())}
}

func historicalPriceURL(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	switch {
	case strings.HasSuffix(parsed.Path, "/latest-prices.json"):
		parsed.Path = strings.TrimSuffix(parsed.Path, "/latest-prices.json") + "/price.json"
	case strings.HasSuffix(parsed.Path, "/"):
		parsed.Path += "price.json"
	default:
		index := strings.LastIndex(parsed.Path, "/")
		parsed.Path = parsed.Path[:index+1] + "price.json"
	}
	parsed.RawQuery, parsed.Fragment = "", ""
	return parsed.String(), nil
}

type linkedEventsCollector struct{ cfg config.Config }

func (collector linkedEventsCollector) SourceCode() string { return "linkedevents" }
func (collector linkedEventsCollector) Dataset() string    { return "events" }
func (collector linkedEventsCollector) Collect(ctx context.Context) ([]Observation, error) {
	now := observedNow()
	return collector.collectWindow(ctx, now, now, now.AddDate(0, 0, collector.cfg.LinkedEventsLookaheadDays), "")
}

func (collector linkedEventsCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	return collector.collectWindow(ctx, start.UTC(), start.UTC(), end.UTC(), areaCode)
}

func (collector linkedEventsCollector) collectWindow(ctx context.Context, observedAt, start, end time.Time, areaCode string) ([]Observation, error) {
	configured := linkedEventLocations(collector.cfg)
	if strings.TrimSpace(areaCode) != "" {
		wanted := strings.ToLower(strings.TrimSpace(areaCode))
		filtered := configured[:0]
		for _, location := range configured {
			if location.AreaCode == wanted {
				filtered = append(filtered, location)
			}
		}
		configured = filtered
	}
	result := make([]Observation, 0, len(configured))
	for _, location := range configured {
		nextURL := strings.TrimRight(location.BaseURL, "/") + "/event/"
		params := map[string]string{"start": start.Format("2006-01-02"), "end": end.Add(-time.Nanosecond).Format("2006-01-02"), "include": "location,keywords", "sort": "start_time", "page_size": strconv.Itoa(collector.cfg.LinkedEventsPageSize)}
		events := []any{}
		requestURLs := []string{}
		var total any
		for page := 0; page < collector.cfg.LinkedEventsMaxPages; page++ {
			body, _, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", nextURL, map[string]string{"Accept": "application/json"}, params)
			if err != nil {
				return nil, err
			}
			requestURLs = append(requestURLs, nextURL+"?"+encodeQuery(params))
			if values, ok := body["data"].([]any); ok {
				events = append(events, values...)
			}
			if meta, ok := body["meta"].(map[string]any); ok {
				if count, exists := meta["count"]; exists {
					total = count
				}
				if next, ok := meta["next"].(string); ok && strings.TrimSpace(next) != "" {
					nextURL, params = next, nil
					continue
				}
			}
			break
		}
		payload := map[string]any{
			"request_urls": requestURLs, "content_type": "application/json", "fetched_at": observedAt.Format(time.RFC3339Nano),
			"window_start": start.Format(time.RFC3339Nano), "window_end": end.Format(time.RFC3339Nano), "city": location.AreaCode,
			"api_base_url": location.BaseURL, "event_count_total": total, "event_count_returned": len(events),
			"body": map[string]any{"meta": map[string]any{"count": total, "pages_fetched": len(requestURLs), "start": start.Format("2006-01-02"), "end": end.Add(-time.Nanosecond).Format("2006-01-02")}, "data": events},
		}
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), location.AreaCode, observedAt, payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: location.AreaCode, ObservedAt: observedAt, Payload: payload, Hash: hash})
	}
	return result, nil
}

type linkedEventLocation struct{ AreaCode, BaseURL string }

func linkedEventLocations(cfg config.Config) []linkedEventLocation {
	locations := map[string]string{}
	for _, raw := range cfg.LinkedEventsCityAPIBaseURLs {
		city, base, ok := strings.Cut(raw, "=")
		if ok && strings.TrimSpace(city) != "" && strings.TrimSpace(base) != "" {
			locations[strings.ToLower(strings.TrimSpace(city))] = strings.TrimRight(strings.TrimSpace(base), "/")
		}
	}
	if len(locations) == 0 {
		locations[strings.ToLower(cfg.DefaultPlace)] = strings.TrimRight(cfg.LinkedEventsAPIBaseURL, "/")
	}
	result := make([]linkedEventLocation, 0, len(locations))
	for area, base := range locations {
		result = append(result, linkedEventLocation{AreaCode: area, BaseURL: base})
	}
	return result
}

type sykeSeries struct {
	Parameter string
	Table     string
	MeasureID int
	Unit      string
	Select    string
}

var sykeSeriesDefinitions = []sykeSeries{
	{Parameter: "water_level", Table: "Vedenkorkeus", MeasureID: 1, Unit: "cm", Select: "Paikka_Id,Aika,Arvo,ArvoMin,ArvoMax,Lippu_id"},
	{Parameter: "discharge", Table: "Virtaama", MeasureID: 2, Unit: "m3/s", Select: "Paikka_Id,Aika,Arvo,ArvoMin,ArvoMax,Lippu_id"},
	{Parameter: "snow_water_equivalent", Table: "LumiAlue", MeasureID: 7, Unit: "mm", Select: "Paikka_Id,Aika,Arvo"},
}

type sykeCollector struct{ cfg config.Config }

func (collector sykeCollector) SourceCode() string { return "syke" }
func (collector sykeCollector) Dataset() string    { return "hydrology" }
func (collector sykeCollector) Collect(ctx context.Context) ([]Observation, error) {
	now := observedNow()
	return collector.collectWindow(ctx, now, now.Add(-24*time.Hour), now, "", "", false)
}

func (collector sykeCollector) CollectRange(ctx context.Context, start, end time.Time, areaCode, cursor string) ([]Observation, error) {
	if !end.After(start) {
		return nil, fmt.Errorf("historical window end must be after start")
	}
	return collector.collectWindow(ctx, start.UTC(), start.UTC(), end.UTC(), areaCode, cursor, true)
}

func (collector sykeCollector) collectWindow(ctx context.Context, observedAt, start, end time.Time, areaCode, cursor string, historical bool) ([]Observation, error) {
	municipality := collector.cfg.DefaultPlace
	if strings.TrimSpace(areaCode) != "" {
		municipality = strings.ReplaceAll(strings.SplitN(strings.TrimSpace(areaCode), ":", 2)[0], "_", " ")
		if municipality == "" {
			municipality = collector.cfg.DefaultPlace
		}
		municipality = strings.Title(municipality)
	}
	selected := sykeSeriesDefinitions
	if parts := strings.SplitN(strings.TrimSpace(areaCode), ":", 2); len(parts) == 2 {
		selected = nil
		for _, series := range sykeSeriesDefinitions {
			if series.Parameter == parts[1] {
				selected = append(selected, series)
			}
		}
	}
	if len(selected) == 0 {
		return nil, nil
	}
	stationBody, _, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", strings.TrimRight(collector.cfg.SYKEHydrologyAPIBaseURL, "/")+"/Paikka", map[string]string{"Accept": "application/json"}, map[string]string{
		"$top": strconv.Itoa(collector.cfg.SYKEHydrologyStationLimit * 10), "$filter": "KuntaNimi eq '" + strings.ReplaceAll(municipality, "'", "''") + "'", "$select": "Paikka_Id,Suure_Id,KuntaNimi,Nimi,VesalNimi,PaaVesalNimi,KoordLat,KoordLong", "$orderby": "Suure_Id asc,Paikka_Id asc",
	})
	if err != nil {
		return nil, err
	}
	stations, _ := stationBody["value"].([]any)
	result := make([]Observation, 0, len(selected))
	for _, series := range selected {
		stationIDs := sykeStationIDs(stations, series.MeasureID, collector.cfg.SYKEHydrologyStationLimit)
		filter := ""
		if len(stationIDs) > 0 {
			parts := make([]string, len(stationIDs))
			for index, id := range stationIDs {
				parts[index] = "(Paikka_Id eq " + strconv.Itoa(id) + ")"
			}
			filter = strings.Join(parts, " or ")
		}
		location, locationErr := time.LoadLocation(collector.cfg.Timezone)
		if locationErr != nil {
			location = time.UTC
		}
		startLocal := start.UTC().In(location).Format("2006-01-02T15:04:05")
		endLocal := end.UTC().In(location).Format("2006-01-02T15:04:05")
		timeFilter := "Aika ge datetime'" + startLocal + "' and Aika lt datetime'" + endLocal + "'"
		if filter != "" {
			filter = "(" + filter + ") and (" + timeFilter + ")"
		} else {
			filter = timeFilter
		}
		query := map[string]string{"$select": series.Select, "$filter": filter, "$orderby": "Aika " + map[bool]string{true: "asc", false: "desc"}[historical], "$top": strconv.Itoa(map[bool]int{true: collector.cfg.SYKEHydrologyBackfillObsLimit, false: collector.cfg.SYKEHydrologyObservationLimit}[historical])}
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", strings.TrimRight(collector.cfg.SYKEHydrologyAPIBaseURL, "/")+"/"+series.Table, map[string]string{"Accept": "application/json"}, query)
		if err != nil {
			return nil, err
		}
		resolvedArea := strings.ToLower(strings.ReplaceAll(municipality, " ", "_")) + ":" + series.Parameter
		recordCount := 0
		if values, ok := body["value"].([]any); ok {
			recordCount = len(values)
		}
		payload := map[string]any{"request_url": strings.TrimRight(collector.cfg.SYKEHydrologyAPIBaseURL, "/") + "/" + series.Table + "?" + encodeQuery(query), "content_type": headers.Get("Content-Type"), "fetched_at": observedAt.Format(time.RFC3339Nano), "body": body, "source_table": series.Table, "parameter": series.Parameter, "unit": series.Unit, "station_ids": stationIDs, "scope": map[bool]string{true: "municipality_history", false: "municipality"}[historical], "municipality": municipality, "station_count": len(stations), "record_count": recordCount, "window_start": start.UTC().Format(time.RFC3339Nano), "window_end": end.UTC().Format(time.RFC3339Nano), "cursor": cursor}
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), resolvedArea, observedAt, payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: resolvedArea, ObservedAt: observedAt, Payload: payload, Hash: hash})
	}
	return result, nil
}

// sykeStationIDs picks the stations reporting one measure, capped by limit so a
// municipality with many gauges cannot build an unbounded OData filter.
// capFeatures bounds a GeoJSON-style response so one busy message type cannot
// store an unbounded payload. The original count is kept so downstream readers
// can tell that the list was truncated.
func capFeatures(body map[string]any, limit int) map[string]any {
	if limit <= 0 || body == nil {
		return body
	}
	features, ok := body["features"].([]any)
	if !ok || len(features) <= limit {
		return body
	}
	capped := make(map[string]any, len(body)+2)
	for key, value := range body {
		capped[key] = value
	}
	capped["features"] = features[:limit]
	capped["feature_count_original"] = len(features)
	capped["feature_count_returned"] = limit
	return capped
}

func sykeStationIDs(stations []any, measureID, limit int) []int {
	result := []int{}
	for _, raw := range stations {
		if limit > 0 && len(result) >= limit {
			break
		}
		station, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		measure, measureOK := collectorInt(station["Suure_Id"])
		id, idOK := collectorInt(station["Paikka_Id"])
		if measureOK && idOK && int(measure) == measureID {
			result = append(result, id)
		}
	}
	return result
}

func collectorInt(value any) (int, bool) {
	switch current := value.(type) {
	case float64:
		return int(current), true
	case int:
		return current, true
	case int64:
		return int(current), true
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(current))
		return parsed, err == nil
	default:
		return 0, false
	}
}

type configuredLocation struct {
	AreaCode, Place     string
	Latitude, Longitude float64
}

func parseLocations(values []string, cfg config.Config) []configuredLocation {
	result := []configuredLocation{}
	for _, raw := range values {
		key, payload, ok := strings.Cut(raw, "=")
		if !ok {
			continue
		}
		parts := strings.Split(payload, "|")
		if len(parts) != 3 {
			continue
		}
		lat, errLat := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		lon, errLon := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
		if errLat != nil || errLon != nil {
			continue
		}
		result = append(result, configuredLocation{AreaCode: strings.ToLower(strings.TrimSpace(key)), Place: strings.TrimSpace(parts[0]), Latitude: lat, Longitude: lon})
	}
	if len(result) == 0 {
		result = append(result, configuredLocation{AreaCode: strings.ToLower(cfg.DefaultPlace), Place: cfg.DefaultPlace, Latitude: cfg.DefaultLat, Longitude: cfg.DefaultLon})
	}
	return result
}

func encodeQuery(values map[string]string) string {
	query := url.Values{}
	for key, value := range values {
		query.Set(key, value)
	}
	return query.Encode()
}

type multiEndpointCollector struct {
	cfg       config.Config
	endpoints map[string]string
}

func (collector multiEndpointCollector) SourceCode() string { return "digitraffic" }
func (collector multiEndpointCollector) Dataset() string    { return "traffic_messages" }
func (collector multiEndpointCollector) Collect(ctx context.Context) ([]Observation, error) {
	result := []Observation{}
	for messageType, path := range collector.endpoints {
		now := observedNow()
		endpoint := strings.TrimRight(collector.cfg.DigitrafficRoadAPIBaseURL, "/") + path
		body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", endpoint, map[string]string{"User-Agent": collector.cfg.DigitrafficUser}, nil)
		if err != nil {
			return nil, err
		}
		payload := payloadForRequest(capFeatures(body, collector.cfg.DigitrafficMaxFeaturesPerType), endpoint, headers.Get("Content-Type"))
		payload["message_type"] = messageType
		hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), "finland", now, payload)
		if err != nil {
			return nil, err
		}
		result = append(result, Observation{Dataset: collector.Dataset(), AreaCode: "finland", ObservedAt: now, Payload: payload, Hash: hash})
	}
	return result, nil
}

type servicemapCollector struct{ cfg config.Config }

func (collector servicemapCollector) SourceCode() string { return "servicemap" }
func (collector servicemapCollector) Dataset() string    { return "service_units" }

// Collect fetches the Helsinki Service Map units around the configured centre.
// The endpoint answers with a top-level JSON array of very wide records, so the
// units are compacted to the fields the product uses and capped by distance,
// keeping the stored observation a manageable size.
func (collector servicemapCollector) Collect(ctx context.Context) ([]Observation, error) {
	now := observedNow()
	area := strings.ToLower(collector.cfg.DefaultPlace)
	endpoint := strings.TrimRight(collector.cfg.ServicemapAPIBaseURL, "/") + "/unit/"
	query := map[string]string{
		"lat":         fmt.Sprintf("%.4f", collector.cfg.DefaultLat),
		"lon":         fmt.Sprintf("%.4f", collector.cfg.DefaultLon),
		"distance":    strconv.Itoa(collector.cfg.ServicemapRadiusMeters),
		"newfeatures": "yes",
	}
	body, headers, _, err := CollectJSON(ctx, client(collector.cfg.CollectorTimeoutSeconds), "GET", endpoint, map[string]string{"Accept": "application/json"}, query)
	if err != nil {
		return nil, err
	}
	units, total := collector.compactUnits(body["items"])
	payload := payloadForRequest(map[string]any{"units": units}, endpoint, headers.Get("Content-Type"))
	payload["fetched_at"] = now.Format(time.RFC3339Nano)
	payload["area_code"], payload["place"] = area, collector.cfg.DefaultPlace
	payload["default_lat"], payload["default_lon"] = collector.cfg.DefaultLat, collector.cfg.DefaultLon
	payload["radius_meters"] = collector.cfg.ServicemapRadiusMeters
	payload["unit_count_original"], payload["unit_count_returned"] = total, len(units)
	hash, err := BuildObservationHash(collector.SourceCode(), collector.Dataset(), area, now, payload)
	if err != nil {
		return nil, err
	}
	return []Observation{{Dataset: collector.Dataset(), AreaCode: area, ObservedAt: now, Payload: payload, Hash: hash}}, nil
}

func (collector servicemapCollector) compactUnits(raw any) ([]any, int) {
	entries, ok := raw.([]any)
	if !ok {
		return []any{}, 0
	}
	type scored struct {
		unit     map[string]any
		distance float64
		hasDist  bool
		name     string
	}
	compacted := make([]scored, 0, len(entries))
	for _, entry := range entries {
		unit, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		latitude, hasLat := numberField(unit["latitude"])
		longitude, hasLon := numberField(unit["longitude"])
		name := localizedField(unit, "name")
		compact := map[string]any{
			"id":                unit["id"],
			"name":              name,
			"description":       localizedField(unit, "short_desc"),
			"street_address":    localizedField(unit, "street_address"),
			"address_city":      localizedField(unit, "address_city"),
			"address_zip":       unit["address_zip"],
			"phone":             unit["phone"],
			"email":             unit["email"],
			"www":               localizedField(unit, "www"),
			"ontologyword_ids":  listOrEmpty(unit["ontologyword_ids"]),
			"ontologytree_ids":  listOrEmpty(unit["ontologytree_ids"]),
			"provider_type":     unit["provider_type"],
			"data_source_url":   unit["data_source_url"],
			"accessibility_www": unit["accessibility_www"],
		}
		item := scored{unit: compact, name: name}
		if hasLat && hasLon {
			item.distance = haversineMeters(collector.cfg.DefaultLat, collector.cfg.DefaultLon, latitude, longitude)
			item.hasDist = true
			// The v4 unit index ignores the lat/lon/distance query parameters
			// and returns the whole city, so the radius is applied here.
			if collector.cfg.ServicemapRadiusMeters > 0 && item.distance > float64(collector.cfg.ServicemapRadiusMeters) {
				continue
			}
			compact["latitude"], compact["longitude"] = latitude, longitude
			compact["distance_m"] = math.Round(item.distance)
		}
		compacted = append(compacted, item)
	}
	sort.SliceStable(compacted, func(i, j int) bool {
		if compacted[i].hasDist != compacted[j].hasDist {
			return compacted[i].hasDist
		}
		if compacted[i].hasDist && compacted[i].distance != compacted[j].distance {
			return compacted[i].distance < compacted[j].distance
		}
		return compacted[i].name < compacted[j].name
	})
	limit := collector.cfg.ServicemapMaxUnits
	if limit <= 0 || limit > len(compacted) {
		limit = len(compacted)
	}
	units := make([]any, 0, limit)
	for _, item := range compacted[:limit] {
		units = append(units, item.unit)
	}
	return units, len(compacted)
}

// localizedField picks the first populated language variant of a Service Map
// field, preferring English and falling back through Finnish and Swedish.
func localizedField(unit map[string]any, prefix string) string {
	for _, suffix := range []string{"en", "fi", "sv"} {
		if text, ok := unit[prefix+"_"+suffix].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func numberField(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed, err == nil
	}
	return 0, false
}

func listOrEmpty(value any) []any {
	if list, ok := value.([]any); ok {
		return list
	}
	return []any{}
}

func haversineMeters(fromLat, fromLon, toLat, toLon float64) float64 {
	const earthRadiusM = 6371000
	deltaLat, deltaLon := (toLat-fromLat)*math.Pi/180, (toLon-fromLon)*math.Pi/180
	a := math.Pow(math.Sin(deltaLat/2), 2) + math.Cos(fromLat*math.Pi/180)*math.Cos(toLat*math.Pi/180)*math.Pow(math.Sin(deltaLon/2), 2)
	return 2 * earthRadiusM * math.Asin(math.Sqrt(a))
}

func Registry(cfg config.Config) map[string]Collector {
	return map[string]Collector{
		"fmi": fmiCollector{cfg: cfg},
		"hsy": endpointCollector{cfg: cfg, source: "hsy", dataset: "air_quality_current", endpoint: nonEmpty(cfg.HSYWFSURL, cfg.HSYAPIURL), area: strings.ToLower(cfg.DefaultPlace), query: func() map[string]string {
			return map[string]string{"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": cfg.HSYAirQualityLayer, "outputFormat": "application/json", "srsName": "EPSG:4326"}
		}},
		"open_meteo_air": openMeteoCollector{cfg: cfg},
		"porssisahko":    porssisahkoCollector{cfg: cfg},
		"fingrid": endpointCollector{cfg: cfg, source: "fingrid", dataset: "energy_timeseries", endpoint: nonEmpty(cfg.FingridDatasetURL, strings.TrimRight(cfg.FingridAPIBaseURL, "/")+"/datasets/"+strconv.Itoa(cfg.FingridDatasetID)+"/data"), area: strings.ToLower(cfg.DefaultPlace), headers: map[string]string{"x-api-key": cfg.FingridAPIKey}, query: func() map[string]string {
			now := observedNow()
			return map[string]string{"startTime": now.Format(time.RFC3339), "endTime": now.Add(time.Duration(cfg.FingridForecastHorizonHours) * time.Hour).Format(time.RFC3339), "format": "json", "pageSize": strconv.Itoa(cfg.FingridPageSize)}
		}, rangeQuery: func(start, end time.Time) map[string]string {
			return map[string]string{"startTime": start.Format(time.RFC3339), "endTime": end.Format(time.RFC3339), "format": "json", "pageSize": strconv.Itoa(cfg.FingridPageSize)}
		}},
		"digitraffic":  multiEndpointCollector{cfg: cfg, endpoints: map[string]string{"traffic_announcements": "/api/traffic-message/v2/traffic-announcements", "roadworks": "/api/traffic-message/v2/roadworks", "weight_restrictions": "/api/traffic-message/v2/weight-restrictions", "exempted_transports": "/api/traffic-message/v2/exempted-transports"}},
		"digitransit":  endpointCollector{cfg: cfg, source: "digitransit", dataset: "service_alerts", endpoint: nonEmpty(cfg.DigitransitHSLAlertsURL, cfg.DigitransitAPIURL), area: "helsinki", headers: headerIfPresent("digitransit-subscription-key", cfg.DigitransitSubscriptionKey)},
		"syke":         sykeCollector{cfg: cfg},
		"servicemap":   servicemapCollector{cfg: cfg},
		"linkedevents": linkedEventsCollector{cfg: cfg},
	}
}

func parseWeatherPlaces(values []string, cfg config.Config) []configuredLocation {
	result := []configuredLocation{}
	for _, raw := range values {
		key, place, ok := strings.Cut(raw, "=")
		if !ok {
			key, place = raw, raw
		}
		key, place = strings.ToLower(strings.TrimSpace(key)), strings.TrimSpace(place)
		if key != "" && place != "" {
			result = append(result, configuredLocation{AreaCode: key, Place: place})
		}
	}
	if len(result) == 0 {
		result = append(result, configuredLocation{AreaCode: strings.ToLower(cfg.DefaultPlace), Place: cfg.DefaultPlace})
	}
	return result
}

func headerIfPresent(key, value string) map[string]string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return map[string]string{key: value}
}
func nonEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
