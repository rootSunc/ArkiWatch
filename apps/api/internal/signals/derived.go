package signals

import (
	"crypto/sha256"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

func Available(status string) bool {
	switch strings.ToLower(status) {
	case "", "empty", "missing", "not_collected", "unavailable", "failed", "error":
		return false
	}
	return true
}
func optional(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func fallbackTime(value string, fallback time.Time) time.Time {
	if t := ParseTime(value); !t.IsZero() {
		return t
	}
	return fallback
}
func warningRank(w weather.Warning) int {
	severity := strings.ToLower(optional(w.Severity))
	title := strings.ToLower(w.Title)
	for i, word := range []string{"red", "orange", "yellow"} {
		if strings.Contains(severity, word) {
			return 3 - i
		}
	}
	if termsMatch(title, []string{"red", "extreme"}) {
		return 3
	}
	if termsMatch(title, []string{"orange", "high", "severe"}) {
		return 2
	}
	if termsMatch(title, []string{"yellow", "warn", "advisory"}) {
		return 1
	}
	return 0
}
func warningRelevant(w weather.Warning, city string) bool {
	rank := warningRank(w)
	if rank >= 2 {
		return true
	}
	value := w.Title + " " + optional(w.Description)
	if termsMatch(value, []string{"whole country", "entire country", "all land areas"}) {
		return true
	}
	if city == "" {
		return rank > 0
	}
	terms := append([]string{}, termsFor(city)...)
	if city == "helsinki" || city == "espoo" || city == "vantaa" {
		terms = append(terms, "uusimaa", "capital region", "metropolitan area", "southern part of the country")
	}
	return termsMatch(value, terms)
}
func advisory(kind, title, body, severity, city, source string, start, end time.Time, attrs map[string]any) platform.Event {
	attrs["event_type"] = kind
	attrs["city_ref"] = city
	return platform.Event{ID: StableID(kind, city, timescope.Format(start)), CategoryKey: "weather", EventType: kind, Title: title, Body: body, Severity: severity, StartsAt: timescope.Format(start), EndsAt: timescope.Format(end), SourceCodes: []string{source}, Evidence: []string{source + " source observation", "Event type: " + kind}, Attributes: attrs}
}
func WeatherEvents(w *weather.Forecast, city string, now time.Time) []platform.Event {
	result := []platform.Event{}
	if w == nil {
		return result
	}
	checked := fallbackTime(text(w.TimeScope["reference_time"]), fallbackTime(w.CheckedAt, now))
	end := fallbackTime(optional(w.ValidTo), checked.Add(48*time.Hour))
	warnings := []weather.Warning{}
	for _, warning := range w.Warnings {
		if warningRelevant(warning, city) {
			warnings = append(warnings, warning)
		}
	}
	sort.SliceStable(warnings, func(i, j int) bool { return warningRank(warnings[i]) > warningRank(warnings[j]) })
	for i, warning := range warnings {
		if i >= 2 {
			break
		}
		severity := "LOW"
		if warningRank(warning) >= 2 {
			severity = "HIGH"
		} else if warningRank(warning) == 1 {
			severity = "MEDIUM"
		}
		body := optional(warning.Description)
		if body == "" {
			body = "Official weather warning from FMI."
		}
		item := advisory("weather_warning", warning.Title, body, severity, city, "fmi", fallbackTime(optional(warning.PublishedAt), checked), end, map[string]any{"info_url": warning.Link, "provider": "FMI", "warning_severity": warning.Severity})
		hash := sha256.Sum256([]byte(warning.Title + optional(warning.Link)))
		item.ID += fmt.Sprintf("-%x", hash[:6])
		result = append(result, item)
	}
	if !Available(w.Status) {
		return result
	}
	var gustPoint, visibilityPoint *weather.ForecastPoint
	gust, visibility := -1., math.Inf(1)
	for i := range w.Points {
		p := &w.Points[i]
		value := p.WindGustMS
		if value == nil {
			value = p.WindSpeedMS
		}
		if value != nil && *value > gust {
			gust = *value
			gustPoint = p
		}
		if p.VisibilityM != nil && *p.VisibilityM < visibility {
			visibility = *p.VisibilityM
			visibilityPoint = p
		}
	}
	if gustPoint != nil && gust >= 14 {
		severity := "MEDIUM"
		if gust >= 20 {
			severity = "HIGH"
		}
		start := fallbackTime(gustPoint.Timestamp, checked)
		result = append(result, advisory("high_wind", "High Wind Advisory", fmt.Sprintf("Forecast gusts may reach %g m/s. Outdoor movement and exposed routes may need extra margin.", gust), severity, city, "fmi", start, start.Add(3*time.Hour), map[string]any{"peak_gust_ms": gust, "provider": "FMI"}))
	}
	if visibilityPoint != nil && visibility < 5000 {
		severity := "MEDIUM"
		if visibility < 1000 {
			severity = "HIGH"
		}
		start := fallbackTime(visibilityPoint.Timestamp, checked)
		result = append(result, advisory("reduced_visibility", "Reduced Visibility", fmt.Sprintf("Forecast visibility may drop to %g km. Leave more time for outdoor movement.", visibility/1000), severity, city, "fmi", start, start.Add(3*time.Hour), map[string]any{"visibility_m": visibility, "provider": "FMI"}))
	}
	var rain *weather.RainWindow
	weight := -1.
	for i := range w.RainWindows {
		r := &w.RainWindows[i]
		v := math.Max(r.PeakPrecipMM, r.TotalPrecipMM/math.Max(float64(r.Hours), 1))
		if v > weight {
			rain = r
			weight = v
		}
	}
	if rain != nil && (rain.PeakPrecipMM >= 5 || rain.TotalPrecipMM >= 15) {
		severity := "MEDIUM"
		if rain.TotalPrecipMM >= 30 {
			severity = "HIGH"
		}
		result = append(result, advisory("heavy_rain", "Heavy Rain Advisory", fmt.Sprintf("Forecast rain may peak near %g mm/h with %g mm total.", rain.PeakPrecipMM, rain.TotalPrecipMM), severity, city, "fmi", fallbackTime(rain.StartsAt, checked), fallbackTime(rain.EndsAt, end), map[string]any{"peak_precip_mm": rain.PeakPrecipMM, "total_precip_mm": rain.TotalPrecipMM, "provider": "FMI"}))
	}
	return result
}
func AirEvents(a *airquality.Current, city string, now time.Time) []platform.Event {
	result := []platform.Event{}
	if a == nil || !Available(a.Status) || a.WorstScore == nil || *a.WorstScore < 4 {
		return result
	}
	score := *a.WorstScore
	label := "Poor"
	severity := "MEDIUM"
	if score >= 5 {
		label = "Very poor"
		severity = "HIGH"
	}
	station := optional(a.WorstStation)
	if station == "" {
		station = "the worst reporting station"
	}
	source := a.SourceCode
	if source == "" {
		source = "hsy"
	}
	start := fallbackTime(optional(a.ObservedAt), fallbackTime(text(a.TimeScope["reference_time"]), fallbackTime(a.CheckedAt, now)))
	item := advisory("air_quality_poor", label+" air quality detected", fmt.Sprintf("%s is reporting %s air quality (%d/5). Sensitive groups may want to reduce exposure near busy roads.", station, strings.ToLower(label), score), severity, city, source, start, fallbackTime(optional(a.ValidTo), start.Add(3*time.Hour)), map[string]any{"provider": source, "worst_label": label, "worst_score": score, "worst_station": station})
	item.CategoryKey = "air"
	return append(result, item)
}
