package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

func (s *Server) weatherForecast(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}

	cityRef := platform.NormalizeCityRef(request.URL.Query().Get("city"), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), cityRef) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]any{
			"detail": map[string]any{
				"message":          "City is not configured for city-scoped data.",
				"supported_cities": platform.SupportedCityRefs(s.cfg),
			},
		})
		return
	}

	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}

	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	if s.weather == nil {
		result := weather.Unavailable(scope, now)
		writeJSON(writer, http.StatusOK, result)
		return
	}

	data, err := s.weather.LoadWeather(request.Context(), observations.WeatherQuery{
		Now:         now,
		LocationRef: cityRef,
		WindowStart: scope.WindowStart,
		WindowEnd:   scope.WindowEnd,
	})
	if err != nil {
		result := weather.Unavailable(scope, now)
		writeJSON(writer, http.StatusOK, result)
		return
	}
	result := weather.Build(data, scope, now)
	if result.Location == nil {
		result.Location = &cityRef
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) airQualityCurrent(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}

	cityRef := platform.NormalizeCityRef(request.URL.Query().Get("city"), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), cityRef) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]any{
			"detail": map[string]any{
				"message":          "City is not configured for city-scoped data.",
				"supported_cities": platform.SupportedCityRefs(s.cfg),
			},
		})
		return
	}

	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}

	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	if s.airQuality == nil {
		writeJSON(writer, http.StatusOK, airquality.Unavailable(scope, now))
		return
	}

	data, err := s.airQuality.LoadAirQuality(request.Context(), airquality.Query{
		Now:         now,
		LocationRef: cityRef,
		WindowStart: scope.WindowStart,
		WindowEnd:   scope.WindowEnd,
	})
	if err != nil {
		writeJSON(writer, http.StatusOK, airquality.Unavailable(scope, now))
		return
	}
	writeJSON(writer, http.StatusOK, airquality.Build(data, scope, now, cityRef))
}

func (s *Server) energyCurrent(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	sourceCode := strings.TrimSpace(request.URL.Query().Get("source"))
	if sourceCode != "" && sourceCode != energy.PriceSourceCode && sourceCode != energy.GridSourceCode {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "source must be fingrid or porssisahko."})
		return
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}
	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	if s.energy == nil {
		writeJSON(writer, http.StatusOK, energy.Unavailable(scope, now))
		return
	}
	windowStart, windowEnd := scope.WindowStart, scope.WindowEnd
	if windowStart == nil || windowEnd == nil {
		start, end := now.Add(-6*time.Hour), now.Add(36*time.Hour)
		windowStart, windowEnd = &start, &end
	}
	data, err := s.energy.LoadEnergy(request.Context(), energy.Query{Now: now, WindowStart: windowStart, WindowEnd: windowEnd, SourceCode: sourceCode, Historical: scope.Mode == "historical", LookaheadHours: s.cfg.SnapshotLookaheadHours})
	if err != nil {
		writeJSON(writer, http.StatusOK, energy.Unavailable(scope, now))
		return
	}
	writeJSON(writer, http.StatusOK, energy.Build(data, scope, now, sourceCode, s.cfg))
}

func (s *Server) trafficCurrent(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}
	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	if s.traffic == nil {
		writeJSON(writer, http.StatusOK, traffic.Unavailable(scope, now))
		return
	}
	data, err := s.traffic.LoadTraffic(request.Context(), traffic.Query{Now: scope.ReferenceTime, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
	if err != nil {
		writeJSON(writer, http.StatusOK, traffic.Unavailable(scope, now))
		return
	}
	writeJSON(writer, http.StatusOK, traffic.Build(data, scope, now, s.cfg.DefaultPlace))
}

func (s *Server) transitCurrent(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	cityRef := platform.NormalizeCityRef(request.URL.Query().Get("city"), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), cityRef) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]any{"detail": map[string]any{"message": "City is not configured for city-scoped data.", "supported_cities": platform.SupportedCityRefs(s.cfg)}})
		return
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}
	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusInternalServerError, map[string]string{"detail": "Configured timezone is invalid."})
		return
	}
	if s.transit == nil {
		writeJSON(writer, http.StatusOK, transit.Unavailable(scope, now))
		return
	}
	data, err := s.transit.LoadTransit(request.Context(), observations.TransitQuery{Now: scope.ReferenceTime, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
	if err != nil {
		writeJSON(writer, http.StatusOK, transit.Unavailable(scope, now))
		return
	}
	writeJSON(writer, http.StatusOK, transit.Build(data, scope, now, cityRef))
}
