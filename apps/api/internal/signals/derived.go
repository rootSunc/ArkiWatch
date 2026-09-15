package signals

import (
	"crypto/sha256"
	"fmt"
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
	// The detail page and public briefing share the same advisory selection.
	copy := *w
	copy.Points = append([]weather.ForecastPoint{}, w.Points...)
	copy.Warnings = append([]weather.Warning{}, w.Warnings...)
	weather.EnrichDetail(&copy)
	for _, alert := range copy.Advisories {
		severity := "MEDIUM"
		var kind, title, body string
		attributes := map[string]any{"provider": "FMI"}
		switch alert.Kind {
		case "gust":
			if alert.Value >= 20 {
				severity = "HIGH"
			}
			kind, title = "high_wind", "High Wind Advisory"
			body = fmt.Sprintf("Forecast gusts may reach %g m/s. Outdoor movement and exposed routes may need extra margin.", alert.Value)
			attributes["peak_gust_ms"] = alert.Value
		case "visibility":
			if alert.Value < 1000 {
				severity = "HIGH"
			}
			kind, title = "reduced_visibility", "Reduced Visibility"
			body = fmt.Sprintf("Forecast visibility may drop to %g km. Leave more time for outdoor movement.", alert.Value/1000)
			attributes["visibility_m"] = alert.Value
		case "rain":
			if alert.Total >= 30 {
				severity = "HIGH"
			}
			kind, title = "heavy_rain", "Heavy Rain Advisory"
			body = fmt.Sprintf("Forecast rain may peak near %g mm/h with %g mm total.", alert.Value, alert.Total)
			attributes["peak_precip_mm"], attributes["total_precip_mm"] = alert.Value, alert.Total
		}
		result = append(result, advisory(kind, title, body, severity, city, "fmi", ParseTime(alert.StartsAt), ParseTime(alert.EndsAt), attributes))
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
