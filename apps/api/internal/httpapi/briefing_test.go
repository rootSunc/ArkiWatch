package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/briefing"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
)

type briefingDatabase struct{ sourceDatabase }

func (briefingDatabase) LoadPublicDashboard(_ context.Context, date *time.Time, now time.Time) (map[string]any, error) {
	return map[string]any{"checked_at": now.Format(time.RFC3339), "coverage_region": "Uusimaa", "top_actions": []any{}, "scenario_sections": []any{}, "snapshot_available": date == nil}, nil
}
func (briefingDatabase) LoadWeather(_ context.Context, q observations.WeatherQuery) (observations.WeatherData, error) {
	return observations.WeatherData{Outlook: &observations.NormalizedEvent{EndsAt: q.Now.Add(time.Hour), Attributes: map[string]any{"forecast_points": []any{map[string]any{"timestamp": q.Now.Format(time.RFC3339), "wind_gust_ms": 21.}}}}}, nil
}
func TestPublicBriefingUsesGoDecisionsAndScopedInputs(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, briefingDatabase{})
	now := time.Date(2026, 8, 9, 6, 0, 0, 0, time.UTC)
	server.now = func() time.Time { return now }
	for _, c := range []struct {
		query, mode string
		status      int
	}{{"?city=helsinki", "live", 200}, {"?city=tampere", "out_of_scope", 200}, {"?city=helsinki&date=2026-08-08", "historical", 200}, {"?date=bad", "", 422}, {"?city=unknown", "", 422}} {
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/public/briefing"+c.query, nil))
		if w.Code != c.status {
			t.Fatalf("%s: %d %s", c.query, w.Code, w.Body.String())
		}
		if c.status != 200 {
			continue
		}
		var body struct {
			Decision briefing.Decision          `json:"decision"`
			Signals  map[string]json.RawMessage `json:"signals"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Decision.RecommendationMode != c.mode {
			t.Errorf("%s: mode %s", c.query, body.Decision.RecommendationMode)
		}
		if len(body.Signals) != 6 {
			t.Fatal("all domain reads must be available in the bundle")
		}
		if c.mode == "historical" && (len(body.Decision.TopActions) > 0 || len(body.Decision.PlanItems) > 0 || body.Decision.HasScopedData) {
			t.Fatal("historical missing snapshot must not expose live actions")
		}
		if c.mode == "live" {
			found := false
			for _, event := range body.Decision.RecentEvents {
				if event.EventType == "high_wind" {
					found = true
				}
			}
			if !found {
				t.Fatal("weather advisory absent")
			}
		}
	}
}
