// Package detailstate provides time and severity semantics shared by detail read models.
package detailstate

import (
	"strings"
	"time"
)

func Parse(value string) time.Time { t, _ := time.Parse(time.RFC3339Nano, value); return t }
func Reference(scope map[string]any, checked string) time.Time {
	if value, ok := scope["reference_time"].(string); ok {
		if t := Parse(value); !t.IsZero() {
			return t
		}
	}
	return Parse(checked)
}
func State(start, end string, reference time.Time) string {
	a, b := Parse(start), Parse(end)
	if reference.IsZero() || a.IsZero() || b.IsZero() || b.Before(a) {
		return "ended"
	}
	if a.After(reference) {
		return "upcoming"
	}
	if !b.Before(reference) {
		return "active"
	}
	return "ended"
}
func High(severity string) bool {
	s := strings.ToUpper(severity)
	return s == "HIGH" || s == "CRITICAL"
}

type Event struct {
	Severity, State, EndsAt string
	Weather                 bool
}
type ScopeCount struct {
	Count  int `json:"count"`
	Alerts int `json:"alerts"`
}
type Summary struct {
	Scopes          map[string]ScopeCount `json:"scopes,omitempty"`
	SeverityCounts  map[string]int        `json:"severity_counts"`
	HighestSeverity string                `json:"highest_severity"`
	NextActiveEnd   *string               `json:"next_active_end"`
	ActiveCount     int                   `json:"active_count"`
	HighActive      int                   `json:"high_active"`
	HighUpcoming    int                   `json:"high_upcoming"`
	WeatherActive   int                   `json:"weather_active"`
	Tone            string                `json:"tone"`
	Risk            string                `json:"risk"`
}

func Summarize(events []Event) Summary {
	s := Summary{SeverityCounts: map[string]int{}, HighestSeverity: "NONE", Tone: "good", Risk: "clear"}
	for _, e := range events {
		severity := strings.ToUpper(e.Severity)
		s.SeverityCounts[severity]++
		if e.State == "upcoming" && High(severity) {
			s.HighUpcoming++
		}
		if e.State != "active" {
			continue
		}
		s.ActiveCount++
		if High(severity) {
			s.HighActive++
		}
		if e.Weather {
			s.WeatherActive++
		}
		if s.NextActiveEnd == nil || Parse(e.EndsAt).Before(Parse(*s.NextActiveEnd)) {
			value := e.EndsAt
			s.NextActiveEnd = &value
		}
	}
	for _, level := range []string{"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"} {
		if s.SeverityCounts[level] > 0 {
			s.HighestSeverity = level
			break
		}
	}
	switch {
	case s.HighActive > 0:
		s.Risk = "high_active"
		s.Tone = "bad"
	case s.WeatherActive > 0:
		s.Risk = "weather_active"
		s.Tone = "warn"
	case s.ActiveCount > 0:
		s.Risk = "active"
		s.Tone = "warn"
	case s.HighUpcoming > 0:
		s.Risk = "high_upcoming"
		s.Tone = "warn"
	}
	return s
}
