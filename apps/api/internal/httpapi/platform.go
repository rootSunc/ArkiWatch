package httpapi

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func (s *Server) platformOverview(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	cityRef, _, overview, err := s.loadPlatformOverview(request)
	if err != nil {
		writeJSON(writer, platformErrorStatus(err), map[string]any{"detail": map[string]any{"message": err.Error(), "supported_cities": platform.SupportedCityRefs(s.cfg)}})
		return
	}
	_ = cityRef
	writeJSON(writer, http.StatusOK, overview)
}

func (s *Server) loadPlatformOverview(request *http.Request) (string, *time.Time, platform.Overview, error) {
	return s.loadPlatformOverviewAt(request, s.now().UTC())
}

var errPlatformReadUnavailable = errors.New("Source data could not be read. Try again.")

func platformErrorStatus(err error) int {
	if errors.Is(err, errPlatformReadUnavailable) {
		return http.StatusServiceUnavailable
	}
	return http.StatusUnprocessableEntity
}

func (s *Server) loadPlatformOverviewAt(request *http.Request, now time.Time) (string, *time.Time, platform.Overview, error) {
	cityRef := platform.NormalizeCityRef(request.URL.Query().Get("city"), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), cityRef) {
		return "", nil, platform.Overview{}, fmt.Errorf("City is not configured for city-scoped data.")
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			return "", nil, platform.Overview{}, fmt.Errorf("date must use YYYY-MM-DD format.")
		}
		targetDate = &parsed
	}
	dateKey := "live"
	if targetDate != nil {
		dateKey = targetDate.UTC().Format("2006-01-02")
	}
	cacheKey := fmt.Sprintf("platform_overview:%s:%s", cityRef, dateKey)
	if overview, ok := s.cachedOverview(cacheKey); ok {
		return cityRef, targetDate, overview, nil
	}
	// Overview and the public briefing both build this payload, and the browser
	// asks for them together. Share one read for that pair, and keep the result
	// for the short cache window.
	ctx := context.WithoutCancel(request.Context())
	value, err, _ := s.overviewFlight.Do(cacheKey, func() (any, error) {
		if overview, ok := s.cachedOverview(cacheKey); ok {
			return overview, nil
		}
		overview, err := s.readPlatformOverview(ctx, now, cityRef, targetDate)
		if err != nil {
			return nil, err
		}
		if s.readCache != nil {
			s.readCache.Set(cacheKey, overview)
		}
		return overview, nil
	})
	if err != nil {
		return "", nil, platform.Overview{}, err
	}
	overview, _ := value.(platform.Overview)
	return cityRef, targetDate, overview, nil
}

func (s *Server) cachedOverview(key string) (platform.Overview, bool) {
	if s.readCache == nil {
		return platform.Overview{}, false
	}
	cached, ok := s.readCache.Get(key)
	if !ok {
		return platform.Overview{}, false
	}
	overview, ok := cached.(platform.Overview)
	return overview, ok
}

func (s *Server) readPlatformOverview(ctx context.Context, now time.Time, cityRef string, targetDate *time.Time) (platform.Overview, error) {
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		return platform.Overview{}, fmt.Errorf("Configured timezone is invalid.")
	}
	statusItems := []sources.Status{}
	if s.sources != nil {
		if reader, ok := s.sources.(database.ScopedSourceStatusReader); ok && scope.Mode == "historical" {
			statusItems, err = reader.ListSourceStatusAt(ctx, scope.ReferenceTime)
		} else {
			statusItems, err = s.sources.ListSourceStatus(ctx)
		}
		if err != nil {
			return platform.Overview{}, errPlatformReadUnavailable
		}
	}
	data := platform.PlatformData{}
	if s.platformReader != nil {
		data, err = s.platformReader.LoadPlatform(ctx, platform.PlatformQuery{Now: scope.ReferenceTime, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
		if err != nil {
			return platform.Overview{}, errPlatformReadUnavailable
		}
	}
	return platform.BuildOverview(data, scope, s.cfg, statusItems, cityRef), nil
}

func parseHistoryCategories(request *http.Request) ([]string, error) {
	raw := strings.TrimSpace(request.URL.Query().Get("categories"))
	if raw == "" {
		return nil, nil
	}
	allowed := map[string]struct{}{
		"weather": {}, "air_quality": {}, "energy": {}, "household_energy": {}, "road_rail": {}, "transit": {},
	}
	seen := map[string]struct{}{}
	categories := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		category := strings.TrimSpace(part)
		if category == "" {
			continue
		}
		if _, ok := allowed[category]; !ok {
			return nil, fmt.Errorf("categories must list weather, air_quality, energy, household_energy, road_rail, or transit.")
		}
		if _, ok := seen[category]; ok {
			continue
		}
		seen[category] = struct{}{}
		categories = append(categories, category)
	}
	if len(categories) == 0 {
		return nil, fmt.Errorf("categories must list weather, air_quality, energy, household_energy, road_rail, or transit.")
	}
	return categories, nil
}

func (s *Server) platformOverviewExport(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	cityRef, targetDate, overview, err := s.loadPlatformOverview(request)
	if err != nil {
		writeJSON(writer, platformErrorStatus(err), map[string]string{"detail": err.Error()})
		return
	}
	exportFormat := strings.ToLower(strings.TrimSpace(request.URL.Query().Get("format")))
	if exportFormat == "" {
		exportFormat = "json"
	}
	datePart := "live"
	if targetDate != nil {
		datePart = targetDate.Format("2006-01-02")
	}
	filename := fmt.Sprintf("arkiwatch-%s-%s.%s", strings.ReplaceAll(cityRef, " ", "-"), datePart, exportFormat)
	writer.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	if exportFormat == "csv" {
		var buffer bytes.Buffer
		csvWriter := csv.NewWriter(&buffer)
		_ = csvWriter.Write([]string{"category", "event_type", "title", "severity", "starts_at", "ends_at", "source_codes"})
		for _, category := range overview.Categories {
			for _, event := range category.Events {
				_ = csvWriter.Write([]string{category.Key, event.EventType, event.Title, event.Severity, event.StartsAt, event.EndsAt, strings.Join(event.SourceCodes, ",")})
			}
		}
		csvWriter.Flush()
		writer.Header().Set("Content-Type", "text/csv; charset=utf-8")
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write(buffer.Bytes())
		return
	}
	if exportFormat != "json" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "format must be json or csv."})
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(writer).Encode(overview)
}

func (s *Server) platformHistoryHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.platformHistory == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	city, targetDate, days, ok := s.platformHistoryQuery(writer, request, 1, 31)
	if !ok {
		return
	}
	categories, err := parseHistoryCategories(request)
	if err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	categoryKey := "all"
	if len(categories) > 0 {
		categoryKey = strings.Join(categories, ",")
	}
	result, err := s.cachedRead(fmt.Sprintf("platform_history:%s:%v:%d:%s", city, targetDate, days, categoryKey), func() (map[string]any, error) {
		return s.platformHistory.LoadPlatformHistory(request.Context(), city, targetDate, days, s.now().UTC(), categories)
	})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Historical data is temporarily unavailable; provider details are not exposed."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) platformHistoryAvailability(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.platformHistory == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	city, targetDate, days, ok := s.platformHistoryQuery(writer, request, 1, 90)
	if !ok {
		return
	}
	result, err := s.platformHistory.LoadPlatformHistoryAvailability(request.Context(), city, targetDate, days, s.now().UTC())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Historical data is temporarily unavailable; provider details are not exposed."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) platformHistoryQuery(writer http.ResponseWriter, request *http.Request, minDays, maxDays int) (string, *time.Time, int, bool) {
	city := platform.NormalizeCityRef(request.URL.Query().Get("city"), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), city) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]any{"detail": map[string]any{"message": "City is not configured for city-scoped data.", "supported_cities": platform.SupportedCityRefs(s.cfg)}})
		return "", nil, 0, false
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return "", nil, 0, false
		}
		targetDate = &parsed
	}
	days := 7
	if value := request.URL.Query().Get("days"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < minDays || parsed > maxDays {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": fmt.Sprintf("days must be between %d and %d.", minDays, maxDays)})
			return "", nil, 0, false
		}
		days = parsed
	}
	return city, targetDate, days, true
}

func (s *Server) platformEvent(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.platformHistory == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	eventID := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/platform/events/"), "/")
	if eventID == "" || strings.Contains(eventID, "/") {
		writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Platform event not found."})
		return
	}
	result, err := s.platformHistory.LoadPlatformEvent(request.Context(), eventID)
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Platform event not found."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) platformCategory(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	categoryKey := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/platform/categories/"), "/")
	if categoryKey == "" || strings.Contains(categoryKey, "/") {
		writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Platform category not found."})
		return
	}
	_, _, overview, err := s.loadPlatformOverview(request)
	if err != nil {
		writeJSON(writer, platformErrorStatus(err), map[string]string{"detail": err.Error()})
		return
	}
	for _, category := range overview.Categories {
		if category.Key == categoryKey {
			writeJSON(writer, http.StatusOK, category)
			return
		}
	}
	writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Platform category not found."})
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
