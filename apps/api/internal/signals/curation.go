// Package signals owns public event relevance, ranking and derived advisories.
// All decisions use an explicit reference time, including historical snapshots.
package signals

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
)

var categoryWeight = map[string]int{"air": 78, "city_services": 58, "energy": 64, "events": 38, "traffic": 86, "transit": 88, "water": 72, "weather": 82}
var sourceWeight = map[string]int{"digitraffic": 22, "digitransit": 24, "fingrid": 14, "fmi": 22, "hsy": 20, "linkedevents": 6, "porssisahko": 18, "servicemap": 14, "syke": 18}
var typeWeight = map[string]int{"air_quality_poor": 36, "air_quality_status": 18, "blue_green_algae": 24, "cheap_energy_window": 24, "drought_risk": 24, "facility_availability": 12, "flood_warning": 42, "heavy_rain": 46, "high_wind": 48, "marine_disruption": 24, "public_event": 10, "rail_delay": 34, "rain_risk": 30, "reduced_visibility": 42, "road_disruption": 38, "road_weather_risk": 34, "service_closure": 30, "snow_load": 28, "transit_delay": 32, "transit_disruption": 40, "weather_warning": 54, "weather_outlook": 18}
var cityTerms = map[string][]string{
	"espoo":    {"espoo", "kauniainen", "kirkkonummi", "helsinki", "vantaa"},
	"helsinki": {"helsinki", "espoo", "vantaa", "kauniainen", "kerava", "kirkkonummi", "sipoo", "tuusula"},
	"vantaa":   {"vantaa", "helsinki", "espoo", "kauniainen", "kerava", "tuusula"},
	"oulu":     {"oulu"}, "tampere": {"tampere"}, "turku": {"turku"},
}
var noise = regexp.MustCompile(`(?i)no active|data will appear here after|placeholder|system clearance|nominal for the current view`)

func ParseTime(value string) time.Time { t, _ := time.Parse(time.RFC3339Nano, value); return t }
func SeverityRank(value string) int {
	return map[string]int{"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 1}[strings.ToUpper(value)]
}
func EventType(event platform.Event) string {
	if event.EventType != "" {
		return event.EventType
	}
	if s, ok := event.Attributes["event_type"].(string); ok && s != "" {
		return s
	}
	for _, s := range event.Evidence {
		if strings.HasPrefix(strings.ToLower(s), "event type:") {
			return strings.TrimSpace(strings.SplitN(s, ":", 2)[1])
		}
	}
	return ""
}
func active(e platform.Event, now time.Time) bool {
	start, end := ParseTime(e.StartsAt), ParseTime(e.EndsAt)
	return !start.IsZero() && !end.IsZero() && !start.After(now) && !end.Before(now)
}
func text(value any) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	b, _ := json.Marshal(value)
	return string(b)
}
func termsMatch(value string, terms []string) bool {
	value = strings.ToLower(value)
	for _, term := range terms {
		if strings.Contains(value, term) {
			return true
		}
	}
	return false
}
func termsFor(city string) []string {
	if terms, ok := cityTerms[city]; ok {
		return terms
	}
	return []string{city}
}
func cityRelevant(e platform.Event, city string) bool {
	if e.CategoryKey != "traffic" || city == "" {
		return true
	}
	// Prefer geometry over incidental city names in descriptions.
	raw, _ := json.Marshal(e.Attributes["geometry_bbox"])
	var bbox []float64
	if json.Unmarshal(raw, &bbox) == nil && len(bbox) == 4 {
		for _, pack := range platform.BuildCoverage(config.Config{}).Cities {
			if pack.CityRef == city {
				lat, lon := (bbox[1]+bbox[3])/2, (bbox[0]+bbox[2])/2
				rad := math.Pi / 180
				dlat, dlon := (lat-pack.Latitude)*rad, (lon-pack.Longitude)*rad
				h := math.Pow(math.Sin(dlat/2), 2) + math.Cos(pack.Latitude*rad)*math.Cos(lat*rad)*math.Pow(math.Sin(dlon/2), 2)
				radius := 30.
				if city == "helsinki" || city == "espoo" || city == "vantaa" {
					radius = 32
				}
				return 2*6371*math.Asin(math.Min(1, math.Sqrt(h))) <= radius
			}
		}
	}
	return termsMatch(e.ID+" "+e.Title+" "+e.Body+" "+strings.Join(e.SourceCodes, " ")+" "+strings.Join(e.Evidence, " ")+" "+text(e.Attributes), termsFor(city))
}
func usefulness(e platform.Event, now time.Time) int {
	score, ok := categoryWeight[e.CategoryKey]
	if !ok {
		score = 24
	}
	score += typeWeight[EventType(e)] + map[string]int{"CRITICAL": 64, "HIGH": 48, "MEDIUM": 30, "LOW": 12}[strings.ToUpper(e.Severity)]
	for _, source := range e.SourceCodes {
		score += sourceWeight[source]
	}
	startHours, endHours := ParseTime(e.StartsAt).Sub(now).Hours(), ParseTime(e.EndsAt).Sub(now).Hours()
	if active(e, now) {
		switch {
		case endHours <= 6:
			score += 34
		case endHours <= 72:
			score += 28
		case endHours <= 336:
			score += 18
		default:
			score += 6
		}
	} else {
		switch {
		case startHours >= 0 && startHours <= 3:
			score += 24
		case startHours > 3 && startHours <= 12:
			score += 16
		case startHours > 12 && startHours <= 48:
			score += 8
		}
	}
	concrete := e.Attributes["is_free"] == true
	for _, key := range []string{"place_name", "location_description", "provider", "info_url", "route_ids", "stop_ids", "trip_ids", "routes", "stops"} {
		v := text(e.Attributes[key])
		if v != "" && v != "[]" && v != "null" {
			concrete = true
		}
	}
	if concrete {
		score += 10
	}
	if e.CategoryKey == "events" {
		if startHours < -3 || startHours > 36 {
			score -= 18
		} else {
			if e.Attributes["is_free"] == true {
				score += 12
			}
			if startHours <= 12 {
				score += 10
			} else {
				score += 4
			}
		}
	}
	return score
}

// Curate selects useful events with category diversity, then orders the selected
// set by its next decision moment. Input order is preserved for exact ties.
func Curate(events []platform.Event, limit int, city string, now time.Time) []platform.Event {
	city = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(city)), " ", "_")
	selected := []platform.Event{}
	if limit <= 0 {
		return selected
	}
	positions := map[string]int{}
	unique := []platform.Event{}
	for _, e := range events {
		if i, ok := positions[e.ID]; ok {
			unique[i] = e
		} else {
			positions[e.ID] = len(unique)
			unique = append(unique, e)
		}
	}
	candidates := []platform.Event{}
	for _, e := range unique {
		start, end := ParseTime(e.StartsAt), ParseTime(e.EndsAt)
		if start.IsZero() || end.IsZero() || end.Before(start) || noise.MatchString(e.ID+" "+e.Title+" "+e.Body) || !cityRelevant(e, city) {
			continue
		}
		if active(e, now) && now.Sub(start) > 21*24*time.Hour && end.Sub(now) > 14*24*time.Hour {
			continue
		}
		if e.CategoryKey == "events" && start.Before(now.Add(-6*time.Hour)) {
			continue
		}
		if !active(e, now) && (start.Before(now.Add(-6*time.Hour)) || start.After(now.Add(48*time.Hour))) {
			continue
		}
		e.State = detailstate.State(e.StartsAt, e.EndsAt, now)
		e.DetailVisible = true
		e.EventType = EventType(e)
		e.Notification = notification(e)
		e.NotificationPriority = int64(SeverityRank(e.Severity))*1000000000000 + start.Unix()
		candidates = append(candidates, e)
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := usefulness(candidates[i], now), usefulness(candidates[j], now)
		if a != b {
			return a > b
		}
		return ParseTime(candidates[i].StartsAt).Before(ParseTime(candidates[j].StartsAt))
	})
	counts := map[string]int{}
	for _, e := range candidates {
		cap := 2
		if e.CategoryKey == "events" {
			cap = 1
		}
		if counts[e.CategoryKey] >= cap {
			continue
		}
		selected = append(selected, e)
		counts[e.CategoryKey]++
		if len(selected) >= limit {
			break
		}
	}
	sort.SliceStable(selected, func(i, j int) bool {
		a, b := ParseTime(selected[i].StartsAt), ParseTime(selected[j].StartsAt)
		if active(selected[i], now) {
			a = ParseTime(selected[i].EndsAt)
		}
		if active(selected[j], now) {
			b = ParseTime(selected[j].EndsAt)
		}
		if !a.Equal(b) {
			return a.Before(b)
		}
		return ParseTime(selected[i].StartsAt).Before(ParseTime(selected[j].StartsAt))
	})
	return selected
}

func StableID(kind, city, start string) string { return fmt.Sprintf("%s-%s-%s", kind, city, start) }

func notification(e platform.Event) bool {
	if SeverityRank(e.Severity) > 0 && strings.ToUpper(e.Severity) != "INFO" {
		return true
	}
	switch EventType(e) {
	case "air_quality_poor", "air_quality_status", "blue_green_algae", "cheap_energy_window", "drought_risk", "flood_warning", "rain_risk", "rail_delay", "road_disruption", "road_weather_risk", "service_closure", "snow_load", "transit_delay", "transit_disruption", "weather_outlook":
		return true
	}
	return false
}
