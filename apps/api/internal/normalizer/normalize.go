package normalizer

import (
	"encoding/xml"
	"fmt"
	"html"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
)

// Draft is the database-neutral representation emitted by a source normalizer.
// Keeping it separate from SQL makes provider parsing and event persistence
// independently testable.
type Draft struct {
	EventType    string
	Severity     string
	LocationType string
	LocationRef  string
	StartsAt     time.Time
	EndsAt       time.Time
	Confidence   *float64
	Title        string
	Summary      string
	Attributes   map[string]any
	DedupeKey    string
}

func Normalize(item collectors.Observation, sourceCode string) []Draft {
	switch sourceCode + "\x00" + item.Dataset {
	case "fmi\x00weather_forecast_raw":
		return fmi(item)
	case "hsy\x00air_quality_current":
		return hsy(item)
	case "open_meteo_air\x00air_quality_current":
		return openMeteoAir(item)
	case "fingrid\x00energy_timeseries", "fingrid\x00dataset_probe", "porssisahko\x00energy_price_timeseries":
		return energy(item)
	case "digitraffic\x00traffic_messages":
		return digitraffic(item)
	case "digitransit\x00service_alerts":
		return digitransit(item)
	case "servicemap\x00service_units":
		return servicemap(item)
	case "linkedevents\x00events":
		return linkedEvents(item)
	case "syke\x00hydrology":
		return syke(item)
	default:
		return nil
	}
}

func confidence(value float64) *float64 { return &value }

func body(item collectors.Observation) any {
	if value, ok := item.Payload["body"]; ok {
		return value
	}
	return item.Payload
}

func asMap(value any) map[string]any {
	if result, ok := value.(map[string]any); ok {
		return result
	}
	if raw, ok := value.(string); ok {
		return map[string]any{"raw": raw}
	}
	return nil
}

func asList(value any) []any {
	if result, ok := value.([]any); ok {
		return result
	}
	return nil
}

func firstText(value any) string {
	switch current := value.(type) {
	case string:
		return strings.TrimSpace(current)
	case jsonNumber:
		return string(current)
	case float64:
		return strconv.FormatFloat(current, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(current)
	case map[string]any:
		for _, key := range []string{"en", "fi", "sv", "text", "value", "translation", "name", "label", "description"} {
			if text := firstText(current[key]); text != "" {
				return text
			}
		}
	case []any:
		for _, item := range current {
			if text := firstText(item); text != "" {
				return text
			}
		}
	}
	return ""
}

// jsonNumber is only used to keep firstText small; JSON decoded through
// encoding/json normally arrives as float64, while test fixtures may use it.
type jsonNumber string

func value(m map[string]any, keys ...string) any {
	for _, key := range keys {
		if result, ok := m[key]; ok {
			return result
		}
		for candidate, result := range m {
			if strings.EqualFold(candidate, key) {
				return result
			}
		}
	}
	return nil
}

func floatValue(value any) (float64, bool) {
	switch current := value.(type) {
	case float64:
		return current, usableNumber(current)
	case float32:
		return float64(current), usableNumber(float64(current))
	case int:
		return float64(current), true
	case int64:
		return float64(current), true
	case jsonNumber:
		parsed, err := strconv.ParseFloat(string(current), 64)
		return parsed, err == nil && usableNumber(parsed)
	case string:
		parsed, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(current), ",", "."), 64)
		return parsed, err == nil && usableNumber(parsed)
	default:
		return 0, false
	}
}

// usableNumber rejects the values JSON cannot represent. FMI writes a literal
// "NaN" for a missing measurement, and strconv.ParseFloat accepts that spelling
// without an error, so an unguarded parse carries NaN into event attributes and
// fails the marshal for the entire observation.
func usableNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func parseTime(value any) (time.Time, bool) {
	switch current := value.(type) {
	case time.Time:
		return current.UTC(), true
	case float64:
		if current > 10_000_000_000 {
			current /= 1000
		}
		return time.Unix(int64(current), int64((current-math.Trunc(current))*1e9)).UTC(), true
	case int64:
		return time.Unix(current, 0).UTC(), true
	case string:
		text := strings.TrimSpace(current)
		if text == "" {
			return time.Time{}, false
		}
		if number, err := strconv.ParseFloat(text, 64); err == nil {
			return parseTime(number)
		}
		text = strings.Replace(text, "Z", "+00:00", 1)
		for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05Z07:00", "2006-01-02 15:04:05"} {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed.UTC(), true
			}
		}
	}
	return time.Time{}, false
}

func labelFor(item collectors.Observation) string {
	if place := firstText(item.Payload["place"]); place != "" {
		return place
	}
	if item.AreaCode != "" {
		return strings.Title(strings.ReplaceAll(item.AreaCode, "_", " "))
	}
	return "Helsinki"
}

func airScore(properties map[string]any) (int, string) {
	for _, key := range []string{"air_quality", "airQuality", "quality", "quality_en", "quality_fi", "laatu", "ilmanlaatu", "index_text", "description"} {
		text := strings.ToLower(firstText(value(properties, key)))
		for label, score := range map[string]int{"very poor": 5, "erittäin huono": 5, "erittain huono": 5, "poor": 4, "huono": 4, "moderate": 3, "välttävä": 3, "valttava": 3, "fair": 2, "satisfactory": 2, "tyydyttävä": 2, "tyydyttava": 2, "good": 1, "hyvä": 1, "hyva": 1} {
			if strings.Contains(text, label) {
				return score, firstText(value(properties, key))
			}
		}
	}
	for _, key := range []string{"index", "aqi", "aq_index", "overall_index", "ilmanlaatuindeksi"} {
		if number, ok := floatValue(value(properties, key)); ok {
			return airIndexBand(number), strconv.FormatFloat(number, 'f', -1, 64)
		}
	}
	return 0, ""
}

// airQualityLabels is the shared 1-5 band vocabulary for every air-quality
// source, so station-based and index-based readings describe themselves alike.
var airQualityLabels = map[int]string{1: "good", 2: "fair", 3: "moderate", 4: "poor", 5: "very poor"}

// airIndexBand folds a numeric air-quality index into the shared 1-5 band. Every
// numeric index we read — HSY's Ilmanlaatuindeksi and the European AQI alike — is
// an open-ended point scale whose cleanest readings are single digits, so a small
// number must never be passed through as if it were already a band: an index of 4
// is excellent air, while band 4 is "poor" and raises a health warning.
func airIndexBand(aqi float64) int {
	switch {
	case aqi <= 50:
		return 1
	case aqi <= 75:
		return 2
	case aqi <= 100:
		return 3
	case aqi <= 150:
		return 4
	default:
		return 5
	}
}

func airQualityEvent(score int) (string, string) {
	switch {
	case score >= 5:
		return "air_quality_poor", "HIGH"
	case score >= 4:
		return "air_quality_poor", "MEDIUM"
	case score == 3:
		return "air_quality_status", "LOW"
	default:
		return "air_quality_status", "INFO"
	}
}

func hsy(item collectors.Observation) []Draft {
	root := asMap(body(item))
	features := asList(root["features"])
	worst, station, count := 0, "regional network", 0
	for _, raw := range features {
		feature := asMap(raw)
		properties := asMap(feature["properties"])
		score, _ := airScore(properties)
		if score == 0 {
			continue
		}
		count++
		name := firstText(value(properties, "station", "station_name", "name", "nimi", "aseman_nimi", "mittausasema"))
		if name == "" {
			name = "regional network"
		}
		if score > worst {
			worst, station = score, name
		}
	}
	if worst == 0 {
		return nil
	}
	label := airQualityLabels[worst]
	eventType, severity := airQualityEvent(worst)
	return []Draft{{EventType: eventType, Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: item.ObservedAt, EndsAt: item.ObservedAt.Add(3 * time.Hour), Confidence: confidence(.640), Title: "Air quality update for " + labelFor(item), Summary: fmt.Sprintf("%d stations reported. Worst observed air quality is %s at %s.", count, label, station), Attributes: map[string]any{"station_count": count, "worst_station": station, "worst_score": worst, "worst_label": label}, DedupeKey: item.Hash + ":air_quality_status"}}
}

func openMeteoAir(item collectors.Observation) []Draft {
	root := asMap(body(item))
	current := asMap(root["current"])
	if len(current) == 0 {
		return nil
	}
	aqi, ok := floatValue(value(current, "european_aqi", "aqi"))
	if !ok {
		return nil
	}
	// Open-Meteo reports a city-wide index rather than named stations, so the
	// place itself stands in for the station the advice copy refers to.
	score := airIndexBand(aqi)
	label, station := airQualityLabels[score], labelFor(item)
	eventType, severity := airQualityEvent(score)
	return []Draft{{EventType: eventType, Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: item.ObservedAt, EndsAt: item.ObservedAt.Add(3 * time.Hour), Confidence: confidence(.580), Title: "Air quality update for " + station, Summary: fmt.Sprintf("European air quality index is %.0f (%s).", aqi, label), Attributes: map[string]any{"european_aqi": aqi, "pm10": current["pm10"], "pm2_5": current["pm2_5"], "nitrogen_dioxide": current["nitrogen_dioxide"], "worst_label": label, "worst_station": station, "worst_score": score}, DedupeKey: item.Hash + ":air_quality_status"}}
}

type weatherPoint struct {
	At                                                                         time.Time
	Precip, Temp, Wind, Gust, Cloud, Humidity, Visibility                      float64
	HasPrecip, HasTemp, HasWind, HasGust, HasCloud, HasHumidity, HasVisibility bool
	Dew, Pressure, WindDir, Symbol, SmartSymbol                                float64
	HasDew, HasPressure, HasWindDir, HasSymbol, HasSmartSymbol                 bool
}

func fmi(item collectors.Observation) []Draft {
	raw := firstText(asMap(body(item))["raw"])
	if raw == "" {
		raw = firstText(body(item))
	}
	points := parseFMI(raw)
	if len(points) == 0 {
		return nil
	}
	sort.Slice(points, func(i, j int) bool { return points[i].At.Before(points[j].At) })
	points = mergeWeatherPoints(points)
	temp := make([]weatherPoint, 0)
	for _, point := range points {
		if point.HasTemp {
			temp = append(temp, point)
		}
	}
	result := make([]Draft, 0, 2)
	if len(temp) > 0 {
		minTemp, maxTemp, maxWind, maxGust, maxCloud, maxHumidity, minVisibility := temp[0].Temp, temp[0].Temp, 0.0, 0.0, 0.0, 0.0, 0.0
		for _, point := range points {
			if point.HasTemp {
				minTemp, maxTemp = math.Min(minTemp, point.Temp), math.Max(maxTemp, point.Temp)
			}
			if point.HasWind {
				maxWind = math.Max(maxWind, point.Wind)
			}
			if point.HasGust {
				maxGust = math.Max(maxGust, point.Gust)
			}
			if point.HasCloud {
				maxCloud = math.Max(maxCloud, point.Cloud)
			}
			if point.HasHumidity {
				maxHumidity = math.Max(maxHumidity, point.Humidity)
			}
			if point.HasVisibility && (minVisibility == 0 || point.Visibility < minVisibility) {
				minVisibility = point.Visibility
			}
		}
		attrs := map[string]any{"min_temp_c": minTemp, "max_temp_c": maxTemp, "max_wind_ms": maxWind, "max_wind_gust_ms": maxGust, "max_cloud_cover_pct": maxCloud, "max_humidity_pct": maxHumidity, "min_visibility_m": minVisibility, "point_count": len(points), "forecast_points": forecastPointPayload(points), "generated_at": item.ObservedAt.Format(time.RFC3339Nano)}
		severity := "INFO"
		if math.Max(maxWind, maxGust) >= 10 {
			severity = "LOW"
		}
		result = append(result, Draft{EventType: "weather_outlook", Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: temp[0].At, EndsAt: temp[len(temp)-1].At, Confidence: confidence(.700), Title: "Forecast for " + labelFor(item), Summary: fmt.Sprintf("Temperature ranges from %.1fC to %.1fC in the next hours. Peak wind reaches %.1f m/s with gusts up to %.1f m/s and cloud cover peaks at %.0f%%.", minTemp, maxTemp, maxWind, maxGust, maxCloud), Attributes: attrs, DedupeKey: item.Hash + ":weather_outlook"})
	}
	var rain []weatherPoint
	for _, point := range points {
		if point.HasPrecip && point.Precip >= .1 {
			rain = append(rain, point)
		}
	}
	if len(rain) > 0 {
		start, end, peak, total := rain[0].At, rain[len(rain)-1].At.Add(time.Hour), 0.0, 0.0
		for _, point := range rain {
			peak = math.Max(peak, point.Precip)
			total += point.Precip
		}
		severity := "LOW"
		if peak >= 2 {
			severity = "HIGH"
		} else if peak >= 1 {
			severity = "MEDIUM"
		}
		result = append(result, Draft{EventType: "rain_risk", Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: start, EndsAt: end, Confidence: confidence(.760), Title: "Rain expected in " + labelFor(item), Summary: fmt.Sprintf("Rain is forecast from %s to %s UTC. Peak intensity reaches %.1f mm.", start.Format("15:04"), end.Format("15:04"), peak), Attributes: map[string]any{"peak_precip_mm": peak, "total_precip_mm": total, "rain_hours": len(rain), "rain_windows": rainWindowPayload(rain), "generated_at": item.ObservedAt.Format(time.RFC3339Nano)}, DedupeKey: item.Hash + ":rain_risk"})
	}
	return result
}

// mergeWeatherPoints folds FMI's per-parameter measurements into one point per
// timestamp. Every MeasurementTVP carries a single parameter, so the hourly
// series the weather workspace charts only exists once timestamps are joined.
func mergeWeatherPoints(points []weatherPoint) []weatherPoint {
	order := []time.Time{}
	byTime := map[time.Time]*weatherPoint{}
	for _, point := range points {
		merged, seen := byTime[point.At]
		if !seen {
			entry := point
			byTime[point.At] = &entry
			order = append(order, point.At)
			continue
		}
		if point.HasTemp {
			merged.Temp, merged.HasTemp = point.Temp, true
		}
		if point.HasPrecip {
			merged.Precip, merged.HasPrecip = point.Precip, true
		}
		if point.HasWind {
			merged.Wind, merged.HasWind = point.Wind, true
		}
		if point.HasGust {
			merged.Gust, merged.HasGust = point.Gust, true
		}
		if point.HasCloud {
			merged.Cloud, merged.HasCloud = point.Cloud, true
		}
		if point.HasHumidity {
			merged.Humidity, merged.HasHumidity = point.Humidity, true
		}
		if point.HasVisibility {
			merged.Visibility, merged.HasVisibility = point.Visibility, true
		}
		if point.HasWindDir {
			merged.WindDir, merged.HasWindDir = point.WindDir, true
		}
		if point.HasDew {
			merged.Dew, merged.HasDew = point.Dew, true
		}
		if point.HasPressure {
			merged.Pressure, merged.HasPressure = point.Pressure, true
		}
		if point.HasSymbol {
			merged.Symbol, merged.HasSymbol = point.Symbol, true
		}
		if point.HasSmartSymbol {
			merged.SmartSymbol, merged.HasSmartSymbol = point.SmartSymbol, true
		}
	}
	result := make([]weatherPoint, 0, len(order))
	for _, at := range order {
		result = append(result, *byTime[at])
	}
	return result
}

// forecastPointPayload renders the merged series in the shape the weather read
// model parses. Absent parameters are omitted rather than sent as zero, so a
// missing dew point never reads as 0 C.
func forecastPointPayload(points []weatherPoint) []any {
	items := make([]any, 0, len(points))
	for _, point := range points {
		item := map[string]any{"timestamp": point.At.UTC().Format(time.RFC3339Nano)}
		for _, field := range []struct {
			key     string
			value   float64
			present bool
		}{
			{"temperature_c", point.Temp, point.HasTemp},
			{"precipitation_mm", point.Precip, point.HasPrecip},
			{"wind_speed_ms", point.Wind, point.HasWind},
			{"wind_gust_ms", point.Gust, point.HasGust},
			{"wind_direction_deg", point.WindDir, point.HasWindDir},
			{"cloud_cover_pct", point.Cloud, point.HasCloud},
			{"humidity_pct", point.Humidity, point.HasHumidity},
			{"dew_point_c", point.Dew, point.HasDew},
			{"pressure_hpa", point.Pressure, point.HasPressure},
			{"visibility_m", point.Visibility, point.HasVisibility},
		} {
			if field.present {
				item[field.key] = field.value
			}
		}
		if point.HasSymbol {
			item["weather_symbol"] = int(point.Symbol)
		}
		if point.HasSmartSymbol {
			item["smart_symbol"] = int(point.SmartSymbol)
		}
		items = append(items, item)
	}
	return items
}

// rainWindowPayload splits the wet hours into contiguous windows. Reporting a
// single hull across the horizon would fold a morning shower and an evening one
// into one window and hide the dry afternoon between them.
func rainWindowPayload(points []weatherPoint) []any {
	windows := []any{}
	group := []weatherPoint{}
	flush := func() {
		if len(group) == 0 {
			return
		}
		peak, total, peakAt := group[0].Precip, 0.0, group[0].At
		for _, point := range group {
			if point.Precip > peak {
				peak, peakAt = point.Precip, point.At
			}
			total += point.Precip
		}
		windows = append(windows, map[string]any{
			"starts_at":       group[0].At.UTC().Format(time.RFC3339Nano),
			"ends_at":         group[len(group)-1].At.Add(time.Hour).UTC().Format(time.RFC3339Nano),
			"peak_precip_mm":  peak,
			"peak_precip_at":  peakAt.UTC().Format(time.RFC3339Nano),
			"total_precip_mm": math.Round(total*10) / 10,
			"hours":           len(group),
		})
		group = nil
	}
	for _, point := range points {
		if len(group) > 0 && point.At.Sub(group[len(group)-1].At) > time.Hour {
			flush()
		}
		group = append(group, point)
	}
	flush()
	return windows
}

func parseFMI(raw string) []weatherPoint {
	decoder := xml.NewDecoder(strings.NewReader(raw))
	var result []weatherPoint
	var current weatherPoint
	var property string
	var inObservation, inMeasurement bool
	var text strings.Builder
	for {
		token, err := decoder.Token()
		if err != nil {
			break
		}
		switch value := token.(type) {
		case xml.StartElement:
			name := value.Name.Local
			if name == "PointTimeSeriesObservation" {
				inObservation = true
				current = weatherPoint{}
				property = ""
			}
			if inObservation && name == "observedProperty" {
				for _, attr := range value.Attr {
					if attr.Name.Local == "href" {
						property = strings.ToLower(attr.Value)
						if index := strings.LastIndex(property, "param="); index >= 0 {
							property = property[index+6:]
						}
					}
				}
			}
			if inObservation && name == "MeasurementTVP" {
				inMeasurement = true
				current = weatherPoint{}
			}
			if inMeasurement && (name == "time" || name == "value") {
				text.Reset()
			}
		case xml.CharData:
			if inMeasurement {
				text.Write([]byte(value))
			}
		case xml.EndElement:
			name := value.Name.Local
			if inMeasurement && (name == "time" || name == "value") {
				parsed := strings.TrimSpace(text.String())
				if name == "time" {
					current.At, _ = parseTime(parsed)
				} else if number, ok := floatValue(parsed); ok {
					switch {
					case strings.Contains(property, "temperature"):
						current.Temp, current.HasTemp = number, true
					case strings.Contains(property, "precipitation"):
						current.Precip, current.HasPrecip = number, true
					case strings.Contains(property, "windspeedms"):
						current.Wind, current.HasWind = number, true
					case strings.Contains(property, "windgust"):
						current.Gust, current.HasGust = number, true
					case strings.Contains(property, "totalcloudcover"):
						current.Cloud, current.HasCloud = number, true
					case strings.Contains(property, "humidity"):
						current.Humidity, current.HasHumidity = number, true
					case strings.Contains(property, "visibility"):
						current.Visibility, current.HasVisibility = number, true
					case strings.Contains(property, "winddirection"):
						current.WindDir, current.HasWindDir = number, true
					case strings.Contains(property, "dewpoint"):
						current.Dew, current.HasDew = number, true
					case strings.Contains(property, "pressure"):
						current.Pressure, current.HasPressure = number, true
					case strings.Contains(property, "smartsymbol"):
						current.SmartSymbol, current.HasSmartSymbol = number, true
					case strings.Contains(property, "weathersymbol"):
						current.Symbol, current.HasSymbol = number, true
					}
				}
			}
			if inMeasurement && name == "MeasurementTVP" {
				if !current.At.IsZero() {
					result = append(result, current)
				}
				inMeasurement = false
			}
			if inObservation && name == "PointTimeSeriesObservation" {
				inObservation = false
			}
		}
	}
	return result
}

type energyPoint struct {
	At, End time.Time
	Value   float64
}

func energy(item collectors.Observation) []Draft {
	points := energyPoints(body(item))
	if len(points) < 2 {
		return nil
	}
	sort.Slice(points, func(i, j int) bool { return points[i].At.Before(points[j].At) })
	for i := range points {
		if points[i].End.IsZero() {
			if i+1 < len(points) {
				points[i].End = points[i+1].At
			} else {
				points[i].End = points[i].At.Add(time.Hour)
			}
		}
		if points[i].End.Before(points[i].At) || points[i].End.Equal(points[i].At) {
			points[i].End = points[i].At.Add(time.Hour)
		}
	}
	average := 0.0
	minValue, maxValue := points[0].Value, points[0].Value
	for _, point := range points {
		average += point.Value
		minValue = math.Min(minValue, point.Value)
		maxValue = math.Max(maxValue, point.Value)
	}
	average /= float64(len(points))
	threshold := average
	values := make([]float64, len(points))
	for i, point := range points {
		values[i] = point.Value
	}
	sort.Float64s(values)
	index := len(values) / 3
	if index < 1 {
		index = 1
	}
	if values[index] < threshold {
		threshold = values[index]
	}
	best := []energyPoint{}
	current := []energyPoint{}
	for _, point := range points {
		if point.Value <= threshold {
			if len(current) > 0 && point.At.Sub(current[len(current)-1].End) > time.Second {
				current = nil
			}
			current = append(current, point)
		} else if len(current) > 0 {
			if len(best) == 0 || groupAverage(current) < groupAverage(best) {
				best = append([]energyPoint(nil), current...)
			}
			current = nil
		}
	}
	if len(current) > 0 && (len(best) == 0 || groupAverage(current) < groupAverage(best)) {
		best = current
	}
	if len(best) == 0 {
		best = []energyPoint{points[0]}
		for _, point := range points[1:] {
			if point.Value < best[0].Value {
				best[0] = point
			}
		}
	}
	start, end := best[0].At, best[len(best)-1].End
	windowAverage := groupAverage(best)
	severity := "INFO"
	if maxValue-minValue > 0 {
		severity = "LOW"
	}
	return []Draft{{EventType: "cheap_energy_window", Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: start, EndsAt: end, Confidence: confidence(.680), Title: "Lower energy window detected", Summary: fmt.Sprintf("Flexible electricity use can start from %s-%s UTC. The sustained relative-low window average is %.2f.", start.Format("15:04"), end.Format("15:04"), windowAverage), Attributes: map[string]any{"average_value": windowAverage, "minimum_value": minValue, "maximum_value": maxValue, "point_count": len(points), "window_point_count": len(best), "threshold_value": threshold, "horizon_average_value": average, "selection_strategy": "sustained_relative_low"}, DedupeKey: item.Hash + ":cheap_energy_window"}}
}

func groupAverage(points []energyPoint) float64 {
	total := 0.0
	for _, point := range points {
		total += point.Value
	}
	return total / float64(len(points))
}

func energyPoints(value any) []energyPoint {
	if _, ok := value.(string); ok {
		return nil
	}
	if list := asList(value); list != nil {
		result := []energyPoint{}
		for _, item := range list {
			result = append(result, energyPoints(item)...)
		}
		return result
	}
	m := asMap(value)
	if m == nil {
		return nil
	}
	start, ok := parseTime(valueOf(m, "startTime", "start_time", "start", "timestamp", "time", "dateTime", "datetime", "startDate", "periodStart", "validFrom"))
	if !ok {
		start, ok = parseTime(valueOf(m, "date"))
	}
	number, numberOK := floatValue(valueOf(m, "value", "price", "amount", "measurement", "y", "Value", "Price"))
	result := []energyPoint{}
	if ok && numberOK {
		end, _ := parseTime(valueOf(m, "endTime", "end_time", "end", "endDate", "periodEnd", "validTo"))
		result = append(result, energyPoint{At: start, End: end, Value: number})
	}
	for _, key := range []string{"data", "prices", "values", "items", "results", "measurements", "timeSeries", "series"} {
		result = append(result, energyPoints(m[key])...)
	}
	return result
}

func valueOf(m map[string]any, keys ...string) any { return value(m, keys...) }

func trafficFeatures(value any) []map[string]any {
	if list := asList(value); list != nil {
		result := []map[string]any{}
		for _, item := range list {
			if m := asMap(item); m != nil {
				result = append(result, m)
			}
		}
		return result
	}
	m := asMap(value)
	if m == nil {
		return nil
	}
	if list := asList(m["features"]); list != nil {
		return trafficFeatures(list)
	}
	return nil
}

func digitraffic(item collectors.Observation) []Draft {
	features := trafficFeatures(body(item))
	result := []Draft{}
	for index, feature := range features {
		properties := asMap(feature["properties"])
		announcement := map[string]any{}
		if announcements := asList(properties["announcements"]); len(announcements) > 0 {
			announcement = asMap(announcements[0])
		}
		title := firstText(value(announcement, "title", "name"))
		comment := firstText(value(announcement, "comment", "description"))
		if title == "" && comment == "" {
			continue
		}
		situation := firstText(value(properties, "situationType", "messageType"))
		searchable := strings.ToLower(title + " " + comment + " " + situation)
		eventType, severity := "road_disruption", "INFO"
		if strings.Contains(searchable, "weather") || strings.Contains(searchable, "snow") || strings.Contains(searchable, "ice") || strings.Contains(searchable, "slippery") {
			eventType = "road_weather_risk"
		}
		if strings.Contains(searchable, "closed") || strings.Contains(searchable, "accident") || strings.Contains(searchable, "suljettu") {
			severity = "HIGH"
		} else if strings.Contains(searchable, "work") || strings.Contains(searchable, "congestion") || strings.Contains(searchable, "delay") || strings.Contains(searchable, "restriction") {
			severity = "MEDIUM"
		} else if situation != "" {
			severity = "LOW"
		}
		start, end := item.ObservedAt, item.ObservedAt.Add(6*time.Hour)
		if parsed, ok := parseTime(value(announcement, "startTime", "validFrom")); ok {
			start = parsed
		}
		if parsed, ok := parseTime(value(announcement, "endTime", "validTo")); ok && parsed.After(start) {
			end = parsed
		}
		id := firstText(value(properties, "situationId"))
		if id == "" {
			id = fmt.Sprintf("feature-%d", index)
		}
		result = append(result, Draft{EventType: eventType, Severity: severity, LocationType: "ROUTE", LocationRef: item.AreaCode, StartsAt: start, EndsAt: end, Confidence: confidence(.690), Title: title, Summary: comment, Attributes: map[string]any{"situation_id": id, "situation_type": situation, "message_type": firstText(item.Payload["message_type"]), "source": "digitraffic"}, DedupeKey: "digitraffic:" + id})
	}
	return result
}

func digitransit(item collectors.Observation) []Draft {
	root := asMap(body(item))
	raw := root["alerts"]
	if data := asMap(root["data"]); data != nil && raw == nil {
		raw = data["alerts"]
	}
	result := []Draft{}
	for index, alert := range asList(raw) {
		m := asMap(alert)
		if m == nil {
			continue
		}
		title := firstText(value(m, "alertHeaderText", "headerText", "title", "summary"))
		summary := firstText(value(m, "alertDescriptionText", "descriptionText", "description", "details"))
		if title == "" && summary == "" {
			continue
		}
		start, end := item.ObservedAt, item.ObservedAt.Add(3*time.Hour)
		if parsed, ok := parseTime(value(m, "effectiveStartDate", "startTime", "startsAt", "start", "validFrom")); ok {
			start = parsed
		}
		if parsed, ok := parseTime(value(m, "effectiveEndDate", "endTime", "endsAt", "end", "validTo")); ok && parsed.After(start) {
			end = parsed
		}
		search := strings.ToLower(title + " " + summary)
		effect := firstText(value(m, "alertEffect", "effect"))
		cause := firstText(value(m, "alertCause", "cause"))
		severity := alertSeverity(firstText(value(m, "alertSeverityLevel", "severity")), effect, search)
		// Kind and grading are independent: a severe alert can still be a delay.
		eventType := "transit_disruption"
		if strings.EqualFold(effect, "SIGNIFICANT_DELAYS") || strings.Contains(search, "delay") {
			eventType = "transit_delay"
		}
		id := firstText(value(m, "id", "alertId", "gtfsId"))
		if id == "" {
			id = fmt.Sprintf("%d:%s", index, title)
		}
		attributes := map[string]any{"alert_id": id, "effect": effect, "cause": cause, "source": "digitransit"}
		// Route and stop identifiers are what a commute rule needs to decide
		// whether an alert touches this user's line rather than the whole city.
		if routes, stops := alertEntities(m); len(routes) > 0 || len(stops) > 0 {
			if len(routes) > 0 {
				attributes["routes"] = routes
			}
			if len(stops) > 0 {
				attributes["stops"] = stops
			}
		}
		result = append(result, Draft{EventType: eventType, Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: start, EndsAt: end, Confidence: confidence(.730), Title: title, Summary: summary, Attributes: attributes, DedupeKey: "digitransit:" + id})
	}
	return result
}

// alertSeverity prefers the feed's own grading. GTFS severity and effect are
// declared by the operator, so they beat guessing from English keywords in a
// feed whose text is often Finnish first.
func alertSeverity(level, effect, search string) string {
	switch strings.ToUpper(strings.TrimSpace(level)) {
	case "SEVERE":
		return "HIGH"
	case "WARNING":
		return "MEDIUM"
	case "INFO":
		return "LOW"
	}
	switch strings.ToUpper(strings.TrimSpace(effect)) {
	case "NO_SERVICE":
		return "HIGH"
	case "REDUCED_SERVICE", "SIGNIFICANT_DELAYS", "DETOUR":
		return "MEDIUM"
	}
	if strings.Contains(search, "cancel") || strings.Contains(search, "suspend") || strings.Contains(search, "closed") {
		return "HIGH"
	}
	if strings.Contains(search, "delay") || strings.Contains(search, "divert") {
		return "MEDIUM"
	}
	return "LOW"
}

// alertEntities pulls the routes and stops an alert is attached to. OTP2 returns
// them as a typed union under entities; older shapes carry a single route or
// stop object, and both are read so the attribute survives a schema change.
func alertEntities(alert map[string]any) ([]any, []any) {
	routes, stops := []any{}, []any{}
	appendRoute := func(entity map[string]any) {
		name := firstText(value(entity, "shortName", "name", "longName"))
		if name == "" {
			return
		}
		route := map[string]any{"name": name}
		if id := firstText(value(entity, "gtfsId", "id")); id != "" {
			route["gtfs_id"] = id
		}
		if mode := firstText(entity["mode"]); mode != "" {
			route["mode"] = mode
		}
		routes = append(routes, route)
	}
	appendStop := func(entity map[string]any) {
		name := firstText(value(entity, "name", "shortName"))
		if name == "" {
			return
		}
		stop := map[string]any{"name": name}
		if id := firstText(value(entity, "gtfsId", "id")); id != "" {
			stop["gtfs_id"] = id
		}
		stops = append(stops, stop)
	}
	for _, raw := range asList(alert["entities"]) {
		entity := asMap(raw)
		if entity == nil {
			continue
		}
		switch strings.ToLower(firstText(entity["__typename"])) {
		case "route":
			appendRoute(entity)
		case "stop":
			appendStop(entity)
		}
	}
	if entity := asMap(alert["route"]); entity != nil {
		appendRoute(entity)
	}
	if entity := asMap(alert["stop"]); entity != nil {
		appendStop(entity)
	}
	return routes, stops
}

func servicemap(item collectors.Observation) []Draft {
	root := asMap(body(item))
	raw := root["units"]
	for _, key := range []string{"data", "results", "items"} {
		if raw != nil {
			break
		}
		raw = root[key]
	}
	if raw == nil {
		raw = body(item)
	}
	result := []Draft{}
	for index, unit := range asList(raw) {
		m := asMap(unit)
		if m == nil {
			continue
		}
		id := firstText(value(m, "id", "unit_id"))
		if id == "" {
			id = fmt.Sprintf("unit-%d", index)
		}
		name := firstText(value(m, "name", "name_en", "name_fi"))
		if name == "" {
			name = "Service unit " + id
		}
		closed := false
		status := strings.ToLower(firstText(value(m, "status", "state", "availability")))
		for _, key := range []string{"temporarily_closed", "temporary_closed", "closed", "is_closed", "unavailable", "is_unavailable"} {
			if flag, ok := m[key].(bool); ok && flag {
				closed = true
			}
		}
		closed = closed || status == "closed" || status == "unavailable"
		eventType, severity := "facility_availability", "INFO"
		if closed {
			eventType, severity = "service_closure", "MEDIUM"
		}
		result = append(result, Draft{EventType: eventType, Severity: severity, LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: item.ObservedAt, EndsAt: item.ObservedAt.Add(7 * 24 * time.Hour), Confidence: confidence(.560), Title: name, Summary: name + " is indexed by Helsinki Service Map.", Attributes: map[string]any{"unit_id": id, "name": name, "status": status, "source": "servicemap"}, DedupeKey: "servicemap:" + id + ":" + eventType})
	}
	return result
}

func linkedEvents(item collectors.Observation) []Draft {
	root := asMap(body(item))
	raw := root["data"]
	if raw == nil {
		raw = root["events"]
	}
	if raw == nil {
		raw = root["results"]
	}
	if raw == nil {
		raw = body(item)
	}
	result := []Draft{}
	for index, event := range asList(raw) {
		m := asMap(event)
		if m == nil {
			continue
		}
		start, ok := parseTime(m["start_time"])
		if !ok {
			continue
		}
		end, endOK := parseTime(m["end_time"])
		if !endOK || !end.After(start) {
			end = start.Add(3 * time.Hour)
		}
		id := firstText(value(m, "id", "@id"))
		if id == "" {
			id = fmt.Sprintf("event-%d", index)
		}
		title := firstText(m["name"])
		if title == "" {
			title = "Public event " + id
		}
		summary := firstText(value(m, "short_description", "description"))
		if summary == "" {
			summary = title
		}
		summary = stripHTML(summary)
		result = append(result, Draft{EventType: "public_event", Severity: "INFO", LocationType: "CITY", LocationRef: item.AreaCode, StartsAt: start, EndsAt: end, Confidence: confidence(.620), Title: truncate(title, 160), Summary: truncate(summary, 360), Attributes: map[string]any{"event_id": id, "name": title, "source": "linkedevents", "is_free": isFree(m)}, DedupeKey: "linkedevents:" + item.AreaCode + ":" + id})
	}
	return result
}

func syke(item collectors.Observation) []Draft {
	root := asMap(body(item))
	values := asList(root["value"])
	if len(values) == 0 {
		return nil
	}
	parameter := firstText(item.Payload["parameter"])
	if parameter == "" {
		parameter = "hydrology"
	}
	unit := firstText(item.Payload["unit"])
	minimum, maximum := math.Inf(1), math.Inf(-1)
	count := 0
	start, end := item.ObservedAt, item.ObservedAt.Add(24*time.Hour)
	for _, raw := range values {
		entry := asMap(raw)
		if entry == nil {
			continue
		}
		if value, ok := floatValue(value(entry, "Arvo", "value")); ok {
			minimum, maximum = math.Min(minimum, value), math.Max(maximum, value)
			count++
		}
		if parsed, ok := parseTime(value(entry, "Aika", "time", "timestamp")); ok {
			if parsed.Before(start) || start.Equal(item.ObservedAt) {
				start = parsed
			}
			if parsed.After(end) {
				end = parsed
			}
		}
	}
	if count == 0 {
		return nil
	}
	locationRef := strings.SplitN(item.AreaCode, ":", 2)[0]
	if locationRef == "" {
		locationRef = item.AreaCode
	}
	return []Draft{{EventType: "hydrology_status", Severity: "INFO", LocationType: "CITY", LocationRef: locationRef, StartsAt: start, EndsAt: end, Confidence: confidence(.560), Title: "Hydrology update for " + labelFor(item), Summary: fmt.Sprintf("%d %s readings are available%s.", count, parameter, unitSuffix(unit)), Attributes: map[string]any{"parameter": parameter, "unit": unit, "reading_count": count, "minimum_value": minimum, "maximum_value": maximum}, DedupeKey: item.Hash + ":hydrology_status"}}
}

func unitSuffix(unit string) string {
	if strings.TrimSpace(unit) == "" {
		return ""
	}
	return " in " + unit
}

func isFree(event map[string]any) bool {
	for _, raw := range asList(event["offers"]) {
		if offer := asMap(raw); offer != nil {
			if value, ok := offer["is_free"].(bool); ok && value {
				return true
			}
		}
	}
	return false
}

var tagPattern = regexp.MustCompile(`<[^>]+>`)

func stripHTML(value string) string {
	return strings.TrimSpace(strings.Join(strings.Fields(html.UnescapeString(tagPattern.ReplaceAllString(value, " "))), " "))
}
func truncate(value string, max int) string {
	value = strings.TrimSpace(strings.Join(strings.Fields(value), " "))
	if len(value) <= max {
		return value
	}
	return value[:max-3] + "..."
}
