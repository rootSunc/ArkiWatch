package httpapi

import (
	"net/http"
	"sync"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/briefing"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

// publicBriefing reuses domain builders directly. Each source may be unavailable
// independently; a missing regional dashboard is never represented as live advice.
func (s *Server) publicBriefing(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	now := s.now().UTC()
	city, date, overview, err := s.loadPlatformOverviewAt(request, now)
	if err != nil {
		writeJSON(writer, platformErrorStatus(err), map[string]string{"detail": err.Error()})
		return
	}
	dashboard := map[string]any{"checked_at": now.Format(time.RFC3339), "snapshot_available": false, "snapshot_date": nil, "app_name": s.cfg.AppName, "timezone": s.cfg.Timezone, "coverage_area": "Helsinki/Uusimaa", "top_actions": []any{}, "scenario_sections": []any{}, "scenario_channels": []any{}, "timeline": []any{}, "broadcasts": []any{}, "sources": []any{}}
	if s.publicDashboard != nil {
		if loaded, loadErr := s.publicDashboard.LoadPublicDashboard(request.Context(), date, now); loadErr == nil && loaded != nil {
			dashboard = loaded
		}
	}
	// Public recommendations are produced by the existing Uusimaa rule pipeline.
	// Region identity is explicit and does not depend on a translated display label.
	typed, err := briefing.DecodeDashboard(dashboard)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Public dashboard is invalid."})
		return
	}
	if typed.CoverageRegion == "" {
		typed.CoverageRegion = "Uusimaa"
	}
	scope, err := timescope.DefaultScope(date, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	in := briefing.Input{City: city, Scope: scope, Overview: overview, PublicDashboard: typed}
	for _, pack := range platform.BuildCoverage(s.cfg).Cities {
		if pack.CityRef == city {
			in.Region = pack.Region
			break
		}
	}
	var wg sync.WaitGroup
	run := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }
	run(func() {
		value := weather.Unavailable(scope, now)
		if s.weather != nil {
			data, err := s.weather.LoadWeather(request.Context(), observations.WeatherQuery{Now: now, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd})
			if err == nil {
				value = weather.Build(data, scope, now)
			}
		}
		in.Weather = &value
	})
	run(func() {
		value := airquality.Unavailable(scope, now)
		if s.airQuality != nil {
			data, err := s.airQuality.LoadAirQuality(request.Context(), airquality.Query{Now: now, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd})
			if err == nil {
				value = airquality.Build(data, scope, now, city)
			}
		}
		in.AirQuality = &value
	})
	run(func() {
		value := traffic.Unavailable(scope, now)
		if s.traffic != nil {
			data, err := s.traffic.LoadTraffic(request.Context(), traffic.Query{Now: scope.ReferenceTime, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
			if err == nil {
				value = traffic.Build(data, scope, now, s.cfg.DefaultPlace)
			}
		}
		in.RoadRail = &value
	})
	run(func() {
		value := transit.Unavailable(scope, now)
		if s.transit != nil {
			data, err := s.transit.LoadTransit(request.Context(), observations.TransitQuery{Now: scope.ReferenceTime, LocationRef: city, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
			if err == nil {
				value = transit.Build(data, scope, now, city)
			}
		}
		in.Transit = &value
	})
	loadEnergy := func(source string) *energy.Current {
		value := energy.Unavailable(scope, now)
		if s.energy != nil {
			start, end := scope.WindowStart, scope.WindowEnd
			if start == nil || end == nil {
				a, b := now.Add(-6*time.Hour), now.Add(36*time.Hour)
				start, end = &a, &b
			}
			data, err := s.energy.LoadEnergy(request.Context(), energy.Query{Now: now, WindowStart: start, WindowEnd: end, SourceCode: source, Historical: scope.Mode == "historical", LookaheadHours: s.cfg.SnapshotLookaheadHours})
			if err == nil {
				value = energy.Build(data, scope, now, source, s.cfg)
			}
		}
		return &value
	}
	run(func() { in.Energy = loadEnergy(energy.GridSourceCode) })
	run(func() { in.HouseholdEnergy = loadEnergy(energy.PriceSourceCode) })
	wg.Wait()
	result := make(map[string]any, len(dashboard)+1)
	for key, value := range dashboard {
		result[key] = value
	}
	result["coverage_region"] = typed.CoverageRegion
	result["decision"] = briefing.Build(in)
	result["signals"] = map[string]any{"weather": in.Weather, "airQuality": in.AirQuality, "transit": in.Transit, "roadRail": in.RoadRail, "energy": in.Energy, "householdEnergy": in.HouseholdEnergy}
	writer.Header().Set("Cache-Control", "no-store")
	writeJSON(writer, http.StatusOK, result)
}
