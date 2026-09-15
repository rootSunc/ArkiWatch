package weather

import (
	"math"
	"testing"
)

func float(v float64) *float64 { return &v }
func TestAssessmentBoundaries(t *testing.T) {
	cases := []struct {
		name      string
		point     ForecastPoint
		condition string
		apparent  *float64
	}{
		{"missing", ForecastPoint{}, "unavailable", nil},
		{"rain without temperature", ForecastPoint{PrecipitationMM: float(.3)}, "rain", nil},
		{"snow boundary", ForecastPoint{PrecipitationMM: float(.3), TemperatureC: float(1)}, "snow", float(1)},
		{"gust boundary", ForecastPoint{WindGustMS: float(14)}, "wind", nil},
		{"cloud boundary", ForecastPoint{CloudCoverPct: float(75)}, "overcast", nil},
		{"clear boundary", ForecastPoint{CloudCoverPct: float(30)}, "clear", nil},
		{"warm no chill", ForecastPoint{TemperatureC: float(11), WindSpeedMS: float(10)}, "partly_cloudy", float(11)},
		{"wind chill", ForecastPoint{TemperatureC: float(0), WindSpeedMS: float(10)}, "partly_cloudy", float(-7.0529245786)},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			a := assess(tt.point)
			if a.Condition != tt.condition {
				t.Fatalf("condition %s", a.Condition)
			}
			if tt.apparent == nil {
				if a.ApparentTemperature != nil {
					t.Fatal("invented temperature")
				}
			} else if a.ApparentTemperature == nil || math.Abs(*a.ApparentTemperature-*tt.apparent) > .00001 {
				t.Fatalf("temperature %v", a.ApparentTemperature)
			}
		})
	}
}
func TestAdvisoriesUseSnapshotAndRejectMalformedTime(t *testing.T) {
	f := Forecast{CheckedAt: "2030-01-01T00:00:00Z", TimeScope: map[string]any{"reference_time": "2026-08-08T09:00:00Z"}, Points: []ForecastPoint{
		{Timestamp: "bad", WindGustMS: float(100)},
		{Timestamp: "2026-08-08T08:00:00Z", WindGustMS: float(14), VisibilityM: float(4999)},
	}, RainWindows: []RainWindow{{StartsAt: "2026-08-08T12:00:00Z", EndsAt: "2026-08-08T13:00:00Z", PeakPrecipMM: 5}}}
	EnrichDetail(&f)
	if len(f.Advisories) != 3 {
		t.Fatalf("%+v", f.Advisories)
	}
	if f.Advisories[0].Value != 14 || f.Advisories[0].State != "active" || f.Advisories[2].State != "upcoming" {
		t.Fatalf("%+v", f.Advisories)
	}
}
