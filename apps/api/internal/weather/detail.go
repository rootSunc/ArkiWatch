package weather

import (
	"math"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
)

const outdoorMaxGust = 14.0
const outdoorMinVisibility = 5000.0

type PointAssessment struct {
	ApparentTemperature *float64 `json:"apparent_temperature_c"`
	Condition           string   `json:"condition"`
	GustRisk            bool     `json:"gust_risk"`
	LowVisibility       bool     `json:"low_visibility"`
}
type Advisory struct {
	Kind     string  `json:"kind"`
	StartsAt string  `json:"starts_at"`
	EndsAt   string  `json:"ends_at"`
	State    string  `json:"state"`
	Value    float64 `json:"value"`
	Total    float64 `json:"total"`
}

func gust(p ForecastPoint) *float64 {
	if p.WindGustMS != nil {
		return p.WindGustMS
	}
	return p.WindSpeedMS
}
func assess(p ForecastPoint) PointAssessment {
	a := PointAssessment{Condition: "partly_cloudy", ApparentTemperature: p.TemperatureC}
	if p.TemperatureC != nil && p.WindSpeedMS != nil {
		temp, wind := *p.TemperatureC, *p.WindSpeedMS*3.6
		if temp <= 10 && wind > 4.8 {
			v := 13.12 + .6215*temp - 11.37*math.Pow(wind, .16) + .3965*temp*math.Pow(wind, .16)
			a.ApparentTemperature = &v
		}
	}
	g := gust(p)
	a.GustRisk = g != nil && *g >= outdoorMaxGust
	a.LowVisibility = p.VisibilityM != nil && *p.VisibilityM < outdoorMinVisibility
	switch {
	case p.PrecipitationMM != nil && *p.PrecipitationMM >= .3:
		a.Condition = "rain"
		if p.TemperatureC != nil && *p.TemperatureC <= 1 {
			a.Condition = "snow"
		}
	case a.GustRisk:
		a.Condition = "wind"
	case p.CloudCoverPct != nil && *p.CloudCoverPct >= 75:
		a.Condition = "overcast"
	case p.CloudCoverPct != nil && *p.CloudCoverPct <= 30:
		a.Condition = "clear"
	case p.PrecipitationMM == nil && g == nil && p.CloudCoverPct == nil:
		a.Condition = "unavailable"
	}
	return a
}

// EnrichDetail is also applied to stored snapshots and offline fixtures. It never uses the wall clock.
func EnrichDetail(f *Forecast) {
	f.Advisories = []Advisory{}
	for i := range f.Warnings {
		w := &f.Warnings[i]
		severity := ""
		if w.Severity != nil {
			severity = strings.ToLower(*w.Severity)
		}
		w.Tone = "neutral"
		switch {
		case strings.Contains(severity, "high") || strings.Contains(severity, "severe") || strings.Contains(severity, "red"):
			w.Tone = "bad"
		case strings.Contains(severity, "medium") || strings.Contains(severity, "yellow") || strings.Contains(severity, "warn"):
			w.Tone = "warn"
		}
	}
	reference := detailstate.Reference(f.TimeScope, f.CheckedAt)
	var peak, visibility *ForecastPoint
	for i := range f.Points {
		p := &f.Points[i]
		p.Assessment = assess(*p)
		if detailstate.Parse(p.Timestamp).IsZero() {
			continue
		}
		if g := gust(*p); g != nil && (peak == nil || *g > *gust(*peak)) {
			peak = p
		}
		if p.VisibilityM != nil && (visibility == nil || *p.VisibilityM < *visibility.VisibilityM) {
			visibility = p
		}
	}
	add := func(kind, start, end string, value, total float64) {
		f.Advisories = append(f.Advisories, Advisory{kind, start, end, detailstate.State(start, end, reference), value, total})
	}
	end := func(p *ForecastPoint) string {
		return detailstate.Parse(p.Timestamp).Add(3 * time.Hour).Format(time.RFC3339Nano)
	}
	if peak != nil && *gust(*peak) >= outdoorMaxGust {
		add("gust", peak.Timestamp, end(peak), *gust(*peak), 0)
	}
	if visibility != nil && *visibility.VisibilityM < outdoorMinVisibility {
		add("visibility", visibility.Timestamp, end(visibility), *visibility.VisibilityM, 0)
	}
	var rain *RainWindow
	strength := func(w RainWindow) float64 {
		return math.Max(w.PeakPrecipMM, w.TotalPrecipMM/math.Max(float64(w.Hours), 1))
	}
	for i := range f.RainWindows {
		w := &f.RainWindows[i]
		if detailstate.Parse(w.StartsAt).IsZero() || detailstate.Parse(w.EndsAt).Before(detailstate.Parse(w.StartsAt)) {
			continue
		}
		if rain == nil || strength(*w) > strength(*rain) {
			rain = w
		}
	}
	if rain != nil && (rain.PeakPrecipMM >= 5 || rain.TotalPrecipMM >= 15) {
		add("rain", rain.StartsAt, rain.EndsAt, rain.PeakPrecipMM, rain.TotalPrecipMM)
	}
}
