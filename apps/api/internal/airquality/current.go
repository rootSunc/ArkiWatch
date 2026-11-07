package airquality

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

type Station struct {
	Index          *float64          `json:"index"`
	Tone           string            `json:"tone"`
	PollutantTones map[string]string `json:"pollutant_tones"`
	Station        string            `json:"station"`
	Label          string            `json:"label"`
	Score          *int              `json:"score"`
	EuropeanAQI    *float64          `json:"european_aqi"`
	PM25           *float64          `json:"pm2_5"`
	PM10           *float64          `json:"pm10"`
	NO2            *float64          `json:"no2"`
	Lat            *float64          `json:"lat"`
	Lon            *float64          `json:"lon"`
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
	StationCount          int      `json:"station_count"`
	ReportingStationCount int      `json:"reporting_station_count"`
	FieldCoveragePct      float64  `json:"field_coverage_pct"`
	MissingFields         []string `json:"missing_fields"`
	Notes                 []string `json:"notes"`
}

type Current struct {
	Detail         Detail          `json:"detail"`
	CheckedAt      string          `json:"checked_at"`
	TimeScope      map[string]any  `json:"time_scope"`
	Status         string          `json:"status"`
	Location       *string         `json:"location"`
	SourceCode     string          `json:"source_code"`
	ObservedAt     *string         `json:"observed_at"`
	ValidTo        *string         `json:"valid_to"`
	Summary        *string         `json:"summary"`
	WorstStation   *string         `json:"worst_station"`
	WorstLabel     *string         `json:"worst_label"`
	WorstScore     *int            `json:"worst_score"`
	Metrics        []Metric        `json:"metrics"`
	Stations       []Station       `json:"stations"`
	SourceRequests []SourceRequest `json:"source_requests"`
	DataPipeline   []DataStage     `json:"data_pipeline"`
	Quality        Quality         `json:"quality"`
}

type Data struct {
	Event        *observations.NormalizedEvent
	HSYRaw       observations.RawObservation
	OpenMeteoRaw observations.RawObservation
}

type Query struct {
	Now         time.Time
	LocationRef string
	WindowStart *time.Time
	WindowEnd   *time.Time
}

var qualityWords = []struct {
	word  string
	score int
}{
	{word: "good", score: 1}, {word: "hyva", score: 1}, {word: "hyvä", score: 1},
	{word: "satisfactory", score: 2}, {word: "fair", score: 2}, {word: "tyydyttava", score: 2}, {word: "tyydyttävä", score: 2},
	{word: "moderate", score: 3}, {word: "valttava", score: 3}, {word: "välttävä", score: 3},
	{word: "poor", score: 4}, {word: "huono", score: 4}, {word: "very poor", score: 5}, {word: "erittain huono", score: 5}, {word: "erittäin huono", score: 5},
}

func Build(data Data, scope timescope.Scope, now time.Time, locationRef string) (result Current) {
	defer func() { EnrichDetail(&result) }()
	now = now.UTC()
	stations := stationsFromRawForCity(data.HSYRaw, locationRef)
	if station := openMeteoStation(data.OpenMeteoRaw); station != nil {
		stations = append(stations, *station)
	}
	requests := []SourceRequest{
		sourceRequest(data.HSYRaw, "air_quality_current", "HSY air-quality WFS"),
		sourceRequest(data.OpenMeteoRaw, "open_meteo_air_quality", "Open-Meteo air quality"),
	}
	quality := qualityFromStations(stations)
	attrs := map[string]any{}
	if data.Event != nil {
		attrs = data.Event.Attributes
	}
	worstScore := asInt(attrs["worst_score"])
	worstLabel := asText(attrs["worst_label"])
	if worstLabel == nil {
		value := scoreToLabel(worstScore)
		worstLabel = &value
	}
	worstStation := asText(attrs["worst_station"])
	worstStationValue := textValue("n/a")
	if worstStation != nil {
		worstStationValue = *worstStation
	}

	sort.SliceStable(stations, func(i, j int) bool {
		if stations[i].Score == nil {
			return false
		}
		if stations[j].Score == nil {
			return true
		}
		return *stations[i].Score > *stations[j].Score
	})
	hasData := data.Event != nil || quality.ReportingStationCount > 0
	current := (data.Event != nil && !data.Event.EndsAt.Before(now)) ||
		isCurrent("hsy", data.HSYRaw, now) || isCurrent("open_meteo_air", data.OpenMeteoRaw, now)
	status := "ready"
	if !hasData {
		status = "empty"
	} else if scope.Mode == "live" && !current {
		status = "stale"
	}

	location := locationRef
	if data.Event != nil && data.Event.LocationRef != "" {
		location = data.Event.LocationRef
	} else if data.HSYRaw.AreaCode != "" {
		location = data.HSYRaw.AreaCode
	} else if data.OpenMeteoRaw.AreaCode != "" {
		location = data.OpenMeteoRaw.AreaCode
	}
	observedAt, validTo := eventTimes(data.Event)
	if observedAt == nil {
		observedAt = rawObservedAt(data.HSYRaw, data.OpenMeteoRaw)
	}
	summary := "No normalized air-quality status is available yet."
	if data.Event != nil && data.Event.Summary != "" {
		summary = data.Event.Summary
	}
	return Current{
		CheckedAt:    timescope.Format(now),
		TimeScope:    scope.Payload(),
		Status:       status,
		Location:     stringPointer(location),
		SourceCode:   "hsy",
		ObservedAt:   observedAt,
		ValidTo:      validTo,
		Summary:      stringPointer(summary),
		WorstStation: worstStation,
		WorstLabel:   worstLabel,
		WorstScore:   worstScore,
		Metrics: []Metric{
			metric("worst_score", "Worst score", intValue(worstScore), "/5"),
			metric("worst_station", "Worst station", worstStationValue, ""),
			metric("reporting_stations", "Reporting stations", fmt.Sprintf("%d", quality.ReportingStationCount), ""),
			metric("field_coverage", "Field coverage", fmt.Sprintf("%.0f", quality.FieldCoveragePct), "%"),
		},
		Stations:       stations,
		SourceRequests: requests,
		DataPipeline:   dataPipeline(requests, stations, data.Event),
		Quality:        quality,
	}
}

func Unavailable(scope timescope.Scope, now time.Time) (result Current) {
	defer func() { EnrichDetail(&result) }()
	return Current{
		CheckedAt: timescope.Format(now.UTC()), TimeScope: scope.Payload(), Status: "unavailable", SourceCode: "hsy",
		Summary: stringPointer("Air-quality data is temporarily unavailable."), Metrics: []Metric{}, Stations: []Station{}, SourceRequests: []SourceRequest{}, DataPipeline: []DataStage{},
	}
}

func stationsFromRawForCity(raw observations.RawObservation, locationRef string) []Station {
	all := stationsFromRaw(raw)
	if len(all) == 0 || raw.AreaCode == "" || locationRef == "" || strings.EqualFold(raw.AreaCode, locationRef) {
		return all
	}
	wanted := strings.ToLower(strings.TrimSpace(locationRef))
	filtered := make([]Station, 0, len(all))
	for _, s := range all {
		if detected := stationCity(s); detected == wanted {
			filtered = append(filtered, s)
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	return all
}

func stationCity(s Station) string {
	lower := strings.ToLower(s.Station)
	for _, token := range []string{"espoo", "leppävaara", "leppavaara", "luukki", "tapiola", "matinkylä", "matinkyla", "lintuvaara", "olari", "kauniainen"} {
		if strings.Contains(lower, token) {
			return "espoo"
		}
	}
	for _, token := range []string{"vantaa", "tikkurila", "myyrmäki", "myyrmaki", "rekola", "lentoasema", "hämeenlinnanväylä", "hameenlinnanvayla", "ruskeasanta", "kivistö", "kivisto"} {
		if strings.Contains(lower, token) {
			return "vantaa"
		}
	}
	for _, token := range []string{"helsinki", "kallio", "mannerheimintie", "mäkelänkatu", "makelankatu", "töölö", "toolo", "vallila", "vartiokylä", "vartiokyla", "vuosaari", "pirkkola", "länsisatama", "lansisatama", "katajanokka", "itäkeskus", "itakeskus"} {
		if strings.Contains(lower, token) {
			return "helsinki"
		}
	}
	if s.Lat != nil && s.Lon != nil {
		centers := []struct {
			city     string
			lat, lon float64
		}{
			{city: "helsinki", lat: 60.1699, lon: 24.9384},
			{city: "espoo", lat: 60.2055, lon: 24.6559},
			{city: "vantaa", lat: 60.2934, lon: 25.0378},
		}
		best := centers[0].city
		bestDist := math.Hypot(*s.Lat-centers[0].lat, (*s.Lon-centers[0].lon)*math.Cos(*s.Lat*math.Pi/180))
		for _, c := range centers[1:] {
			if d := math.Hypot(*s.Lat-c.lat, (*s.Lon-c.lon)*math.Cos(*s.Lat*math.Pi/180)); d < bestDist {
				best, bestDist = c.city, d
			}
		}
		return best
	}
	return ""
}

func stationsFromRaw(raw observations.RawObservation) []Station {
	body, ok := raw.Payload["body"].(map[string]any)
	if !ok {
		return []Station{}
	}
	features, ok := body["features"].([]any)
	if !ok {
		return []Station{}
	}
	stations := make([]Station, 0, len(features))
	for _, featureValue := range features {
		feature, ok := featureValue.(map[string]any)
		if !ok {
			continue
		}
		properties, ok := feature["properties"].(map[string]any)
		if !ok {
			continue
		}
		score, sourceLabel := scoreFromProperties(properties)
		station := asText(firstProperty(properties, "station", "station_name", "name", "nimi", "aseman_nimi", "mittausasema", "id"))
		lat, lon := coordinates(feature)
		stations = append(stations, Station{
			Station: stationOr(station, "regional station"), Label: textValue(sourceLabel, scoreToLabel(score)), Score: score,
			EuropeanAQI: number(firstProperty(properties, "european_aqi", "European_AQI")),
			PM25:        number(firstProperty(properties, "pm2_5", "pm25", "PM2_5", "PM25")),
			PM10:        number(firstProperty(properties, "pm10", "PM10")), NO2: number(firstProperty(properties, "no2", "NO2")), Lat: lat, Lon: lon,
		})
	}
	return stations
}

func openMeteoStation(raw observations.RawObservation) *Station {
	body, ok := raw.Payload["body"].(map[string]any)
	if !ok {
		return nil
	}
	current, ok := body["current"].(map[string]any)
	if !ok {
		return nil
	}
	pm25, pm10, no2 := number(current["pm2_5"]), number(current["pm10"]), number(current["nitrogen_dioxide"])
	europeanAQI := number(current["european_aqi"])
	if pm25 == nil && pm10 == nil && no2 == nil && europeanAQI == nil {
		return nil
	}
	place := asText(raw.Payload["place"])
	if place == nil {
		value := strings.ReplaceAll(raw.AreaCode, "_", " ")
		value = strings.Title(value)
		place = &value
	}
	var score *int
	var label string
	if europeanAQI != nil {
		scoreValue := scoreFromEuropeanAQI(*europeanAQI)
		score = &scoreValue
		label = fmt.Sprintf("%d", int(math.Round(*europeanAQI)))
	} else {
		label = "Open-Meteo"
	}
	lat := number(raw.Payload["latitude"])
	if lat == nil {
		lat = number(body["latitude"])
	}
	lon := number(raw.Payload["longitude"])
	if lon == nil {
		lon = number(body["longitude"])
	}
	return &Station{Station: *place + " city model", Label: label, Score: score, EuropeanAQI: europeanAQI, PM25: pm25, PM10: pm10, NO2: no2, Lat: lat, Lon: lon}
}

func scoreFromProperties(properties map[string]any) (*int, string) {
	for _, candidate := range []string{"air_quality", "airQuality", "quality", "quality_en", "quality_fi", "laatu", "ilmanlaatu", "index_text", "description"} {
		value := asText(propertyValue(properties, candidate))
		if value == nil {
			continue
		}
		lowered := strings.ToLower(*value)
		for _, word := range qualityWords {
			if strings.Contains(lowered, word.word) {
				return intPointerValue(word.score), *value
			}
		}
	}
	if value := number(propertyValue(properties, "european_aqi")); value != nil {
		return intPointerValue(scoreFromEuropeanAQI(*value)), fmt.Sprintf("%d", int(math.Round(*value)))
	}
	for _, candidate := range []string{"index", "aqi", "aq_index", "overall_index", "ilmanlaatuindeksi"} {
		value := asInt(propertyValue(properties, candidate))
		if value != nil {
			return intPointerValue(scoreFromFinnishIndex(*value)), fmt.Sprint(*value)
		}
	}
	return nil, ""
}

// scoreFromFinnishIndex maps HSY's Ilmanlaatuindeksi 2.0 point scale into the
// shared 1-5 band. Clean readings are single digits, so a small value must not
// be passed through as a band: an index of 4 is excellent air, band 4 is "poor".
func scoreFromFinnishIndex(value int) int {
	switch {
	case value <= 50:
		return 1
	case value <= 75:
		return 2
	case value <= 100:
		return 3
	case value <= 150:
		return 4
	default:
		return 5
	}
}

// scoreFromEuropeanAQI maps Open-Meteo's EEA European AQI (0-20 good, 20-40
// fair, 40-60 moderate, 60-80 poor, >80 very poor) into the shared 1-5 band.
func scoreFromEuropeanAQI(aqi float64) int {
	switch {
	case aqi <= 20:
		return 1
	case aqi <= 40:
		return 2
	case aqi <= 60:
		return 3
	case aqi <= 80:
		return 4
	default:
		return 5
	}
}

func qualityFromStations(stations []Station) Quality {
	if len(stations) == 0 {
		return Quality{MissingFields: []string{"air quality index", "PM2.5", "PM10", "NO2"}, Notes: []string{"No station features were available in the latest HSY payload."}}
	}
	tracked := []struct {
		label   string
		present func(Station) bool
	}{{"air quality index", func(s Station) bool { return s.Score != nil }}, {"PM2.5", func(s Station) bool { return s.PM25 != nil }}, {"PM10", func(s Station) bool { return s.PM10 != nil }}, {"NO2", func(s Station) bool { return s.NO2 != nil }}}
	presentValues := 0
	missing := []string{}
	for _, field := range tracked {
		count := 0
		for _, station := range stations {
			if field.present(station) {
				count++
			}
		}
		presentValues += count
		if count == 0 {
			missing = append(missing, field.label)
		}
	}
	reporting := 0
	for _, station := range stations {
		if station.Score != nil {
			reporting++
		}
	}
	notes := []string{}
	if len(missing) > 0 {
		notes = append(notes, fmt.Sprintf("Missing full station field: %s.", strings.Join(missing, ", ")))
	}
	if reporting < len(stations) {
		notes = append(notes, "Some HSY station features did not include an interpretable quality score.")
	}
	if len(notes) == 0 {
		notes = append(notes, "Station score and pollutant fields are ready for visualization.")
	}
	return Quality{StationCount: len(stations), ReportingStationCount: reporting, FieldCoveragePct: math.Round(float64(presentValues)/float64(len(stations)*len(tracked))*1000) / 10, MissingFields: missing, Notes: notes}
}

func dataPipeline(requests []SourceRequest, stations []Station, event *observations.NormalizedEvent) []DataStage {
	fetched, scoreCount := 0, 0
	latestFetch := (*string)(nil)
	for _, request := range requests {
		if request.Status == "fetched" {
			fetched++
			if latestFetch == nil {
				latestFetch = request.FetchedAt
			}
		}
	}
	for _, station := range stations {
		if station.Score != nil {
			scoreCount++
		}
	}
	updatedAt := latestFetch
	if event != nil {
		value := timescope.Format(event.StartsAt)
		updatedAt = &value
	}
	status := "empty"
	if fetched > 0 {
		status = "ready"
	}
	cleanStatus := "empty"
	if scoreCount > 0 {
		cleanStatus = "ready"
	}
	visualStatus := "empty"
	if event != nil || scoreCount > 0 {
		visualStatus = "ready"
	}
	return []DataStage{
		{Key: "source_acquisition", Label: "Source acquisition", Status: status, Detail: choose(fetched > 0, fmt.Sprintf("%d/%d air-quality source layers fetched.", fetched, len(requests)), "Air-quality source layers have not been collected yet."), RecordCount: intPointerValue(fetched), UpdatedAt: latestFetch},
		{Key: "cleaning_normalization", Label: "Cleaning & normalization", Status: cleanStatus, Detail: fmt.Sprintf("%d/%d station features have usable quality scores.", scoreCount, len(stations)), RecordCount: intPointerValue(scoreCount), UpdatedAt: updatedAt},
		{Key: "visualization_ready", Label: "Visualization-ready data", Status: visualStatus, Detail: "Worst station, quality gauge, pollutant coverage, and station ranking prepared.", RecordCount: intPointerValue(len(stations)), UpdatedAt: updatedAt},
	}
}

func sourceRequest(raw observations.RawObservation, key, label string) SourceRequest {
	if raw.Dataset == "" {
		return SourceRequest{Key: key, Label: label, Status: "missing"}
	}
	fetchedAt := asText(raw.Payload["fetched_at"])
	if fetchedAt == nil {
		value := timescope.Format(raw.ObservedAt)
		fetchedAt = &value
	}
	return SourceRequest{Key: key, Label: label, Status: "fetched", Endpoint: asText(raw.Payload["request_url"]), ContentType: asText(raw.Payload["content_type"]), FetchedAt: fetchedAt}
}

func isCurrent(source string, raw observations.RawObservation, now time.Time) bool {
	if raw.Dataset == "" {
		return false
	}
	maxAge := 24 * time.Hour
	if source == "hsy" {
		maxAge = 12 * time.Hour
	} else if source == "open_meteo_air" {
		maxAge = 36 * time.Hour
	}
	return !raw.ObservedAt.Before(now.Add(-maxAge))
}

func eventTimes(event *observations.NormalizedEvent) (*string, *string) {
	if event == nil {
		return nil, nil
	}
	observed, validTo := timescope.Format(event.StartsAt), timescope.Format(event.EndsAt)
	return &observed, &validTo
}

func rawObservedAt(items ...observations.RawObservation) *string {
	var latest *time.Time
	for _, item := range items {
		if item.Dataset == "" {
			continue
		}
		value := item.ObservedAt
		if latest == nil || value.After(*latest) {
			copy := value
			latest = &copy
		}
	}
	if latest == nil {
		return nil
	}
	value := timescope.Format(*latest)
	return &value
}

func coordinates(feature map[string]any) (*float64, *float64) {
	geometry, ok := feature["geometry"].(map[string]any)
	if !ok {
		return nil, nil
	}
	items, ok := geometry["coordinates"].([]any)
	if !ok || len(items) < 2 {
		return nil, nil
	}
	x, okX := asNumber(items[0])
	y, okY := asNumber(items[1])
	if !okX || !okY {
		return nil, nil
	}
	if math.Max(math.Abs(*x), math.Abs(*y)) > 180 {
		lat, lon := inverseTM35FIN(*x, *y)
		return &lat, &lon
	}
	return y, x
}

func inverseTM35FIN(x, y float64) (float64, float64) {
	const a = 6378137.0
	const inverseFlattening = 298.257222101
	const scale = 0.9996
	const falseEasting = 500000.0
	centralMeridianDegrees := 27.0
	easting := x
	if x >= 1000000 {
		zone := math.Floor(x / 1000000)
		centralMeridianDegrees = zone
		easting = x - zone*1000000
	}
	centralMeridian := centralMeridianDegrees * math.Pi / 180
	e := 1 / inverseFlattening
	e2 := e * (2 - e)
	ep2 := e2 / (1 - e2)
	meridional := y / scale
	mu := meridional / (a * (1 - e2/4 - 3*math.Pow(e2, 2)/64 - 5*math.Pow(e2, 3)/256))
	e1 := (1 - math.Sqrt(1-e2)) / (1 + math.Sqrt(1-e2))
	phi1 := mu + (3*e1/2-27*math.Pow(e1, 3)/32)*math.Sin(2*mu) + (21*math.Pow(e1, 2)/16-55*math.Pow(e1, 4)/32)*math.Sin(4*mu) + (151*math.Pow(e1, 3)/96)*math.Sin(6*mu) + (1097*math.Pow(e1, 4)/512)*math.Sin(8*mu)
	sinPhi, cosPhi := math.Sin(phi1), math.Cos(phi1)
	n1 := a / math.Sqrt(1-e2*sinPhi*sinPhi)
	t1 := math.Tan(phi1) * math.Tan(phi1)
	c1 := ep2 * cosPhi * cosPhi
	r1 := a * (1 - e2) / math.Pow(1-e2*sinPhi*sinPhi, 1.5)
	d := (easting - falseEasting) / (n1 * scale)
	lat := phi1 - (n1*math.Tan(phi1)/r1)*(d*d/2-(5+3*t1+10*c1-4*c1*c1-9*ep2)*math.Pow(d, 4)/24+(61+90*t1+298*c1+45*t1*t1-252*ep2-3*c1*c1)*math.Pow(d, 6)/720)
	lon := centralMeridian + (d-(1+2*t1+c1)*math.Pow(d, 3)/6+(5-2*c1+28*t1-3*c1*c1+8*ep2+24*t1*t1)*math.Pow(d, 5)/120)/cosPhi
	return lat * 180 / math.Pi, lon * 180 / math.Pi
}

func firstProperty(properties map[string]any, keys ...string) any {
	for _, key := range keys {
		if value := propertyValue(properties, key); value != nil {
			return value
		}
	}
	return nil
}

func propertyValue(properties map[string]any, key string) any {
	if value, ok := properties[key]; ok {
		return value
	}
	for candidate, value := range properties {
		if strings.EqualFold(candidate, key) {
			return value
		}
	}
	return nil
}

func asNumber(value any) (*float64, bool) {
	switch typed := value.(type) {
	case float64:
		return &typed, true
	case float32:
		converted := float64(typed)
		return &converted, true
	case int:
		converted := float64(typed)
		return &converted, true
	case int64:
		converted := float64(typed)
		return &converted, true
	case json.Number:
		converted, err := typed.Float64()
		return &converted, err == nil
	default:
		return nil, false
	}
}

func number(value any) *float64 {
	converted, ok := asNumber(value)
	if !ok {
		return nil
	}
	return converted
}

func asInt(value any) *int {
	converted := number(value)
	if converted == nil {
		return nil
	}
	result := int(math.Round(*converted))
	return &result
}

func asText(value any) *string {
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(text)
	return &trimmed
}

func scoreToLabel(score *int) string {
	if score == nil {
		return "unknown"
	}
	label, ok := map[int]string{1: "good", 2: "fair", 3: "moderate", 4: "poor", 5: "very poor"}[*score]
	if !ok {
		return "unknown"
	}
	return label
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
	result := parts[0]
	for _, part := range parts[1:] {
		if part != "" {
			result += strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return result
}

func intValue(value *int) string {
	if value == nil {
		return "n/a"
	}
	return fmt.Sprintf("%d", *value)
}

func textValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return "n/a"
}

func stationOr(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

func stringPointer(value string) *string { return &value }
func intPointerValue(value int) *int     { return &value }

func choose(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}
