package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/assistant"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/auth"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/dispatch"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/health"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observability"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

type Server struct {
	cfg               config.Config
	db                database.HealthChecker
	sources           database.SourceStatusReader
	users             database.UserReader
	admin             database.AdminUserStore
	recommendations   database.RecommendationReader
	weather           database.WeatherReader
	airQuality        database.AirQualityReader
	energy            database.EnergyReader
	traffic           database.TrafficReader
	transit           database.TransitReader
	platformReader    database.PlatformReader
	scheduler         database.SchedulerReader
	profiles          database.ProfileStore
	today             database.TodayReader
	publicDashboard   database.PublicDashboardReader
	platformHistory   database.PlatformHistoryReader
	personalDashboard database.PersonalDashboardReader
	assistantLimiter  *auth.SlidingWindowRateLimiter
	telegram          database.TelegramStore
	loginLimiter      *auth.SlidingWindowRateLimiter
	metricsRegistry   *observability.Registry
	readCache         *observability.ReadCache
	logger            *slog.Logger
	now               func() time.Time
	handler           http.Handler
}

func New(cfg config.Config, db database.HealthChecker) *Server {
	server := &Server{
		cfg:              cfg,
		db:               db,
		loginLimiter:     auth.NewSlidingWindowRateLimiter(4096),
		assistantLimiter: auth.NewSlidingWindowRateLimiter(8192),
		now:              time.Now,
	}
	if sourceReader, ok := db.(database.SourceStatusReader); ok {
		server.sources = sourceReader
	}
	if userReader, ok := db.(database.UserReader); ok {
		server.users = userReader
	}
	if adminStore, ok := db.(database.AdminUserStore); ok {
		server.admin = adminStore
	}
	if recommendationReader, ok := db.(database.RecommendationReader); ok {
		server.recommendations = recommendationReader
	}
	if weatherReader, ok := db.(database.WeatherReader); ok {
		server.weather = weatherReader
	}
	if airQualityReader, ok := db.(database.AirQualityReader); ok {
		server.airQuality = airQualityReader
	}
	if energyReader, ok := db.(database.EnergyReader); ok {
		server.energy = energyReader
	}
	if trafficReader, ok := db.(database.TrafficReader); ok {
		server.traffic = trafficReader
	}
	if transitReader, ok := db.(database.TransitReader); ok {
		server.transit = transitReader
	}
	if platformReader, ok := db.(database.PlatformReader); ok {
		server.platformReader = platformReader
	}
	if schedulerReader, ok := db.(database.SchedulerReader); ok {
		server.scheduler = schedulerReader
	}
	if profileStore, ok := db.(database.ProfileStore); ok {
		server.profiles = profileStore
	}
	if todayReader, ok := db.(database.TodayReader); ok {
		server.today = todayReader
	}
	if publicReader, ok := db.(database.PublicDashboardReader); ok {
		server.publicDashboard = publicReader
	}
	if historyReader, ok := db.(database.PlatformHistoryReader); ok {
		server.platformHistory = historyReader
	}
	if personalReader, ok := db.(database.PersonalDashboardReader); ok {
		server.personalDashboard = personalReader
	}
	if telegramStore, ok := db.(database.TelegramStore); ok {
		server.telegram = telegramStore
	}
	mux := http.NewServeMux()
	routes := []string{}
	handle := func(pattern string, handler http.HandlerFunc) {
		routes = append(routes, pattern)
		mux.HandleFunc(pattern, handler)
	}
	handle("/", server.root)
	handle(cfg.APIPrefix+"/health", server.health)
	handle(cfg.APIPrefix+"/health/data-quality", server.dataQuality)
	handle(cfg.APIPrefix+"/metrics", server.metrics)
	handle(cfg.APIPrefix+"/platform/coverage", server.platformCoverage)
	handle(cfg.APIPrefix+"/sources/status", server.sourceStatus)
	handle(cfg.APIPrefix+"/sources/refresh", server.sourcesRefresh)
	handle(cfg.APIPrefix+"/sources/refresh/status", server.sourcesRefreshStatus)
	handle(cfg.APIPrefix+"/scheduler/jobs", server.schedulerJobs)
	handle(cfg.APIPrefix+"/scheduler/sync", server.schedulerSync)
	handle(cfg.APIPrefix+"/auth/login", server.login)
	handle(cfg.APIPrefix+"/auth/me", server.authMe)
	handle(cfg.APIPrefix+"/users/me", server.authMe)
	handle(cfg.APIPrefix+"/recommendations", server.listRecommendations)
	handle(cfg.APIPrefix+"/notifications", server.listNotifications)
	handle(cfg.APIPrefix+"/today", server.todaySummary)
	handle(cfg.APIPrefix+"/dashboard", server.publicDashboardHandler)
	handle(cfg.APIPrefix+"/public/dashboard", server.publicDashboardHandler)
	handle(cfg.APIPrefix+"/public/briefing", server.publicBriefing)
	handle(cfg.APIPrefix+"/personal/dashboard", server.personalDashboardHandler)
	handle(cfg.APIPrefix+"/me/context", server.personalContext)
	handle(cfg.APIPrefix+"/assistant/chat", server.assistantChat)
	handle(cfg.APIPrefix+"/assistant/chat/stream", server.assistantChatStream)
	handle(cfg.APIPrefix+"/assistant/translate", server.assistantTranslate)
	handle(cfg.APIPrefix+"/telegram/webhook", server.telegramWebhook)
	handle(cfg.APIPrefix+"/user/locations", server.locations)
	handle(cfg.APIPrefix+"/user/locations/", server.locationByID)
	handle(cfg.APIPrefix+"/user/preferences", server.preferences)
	handle(cfg.APIPrefix+"/user/commute-profiles", server.commuteProfiles)
	handle(cfg.APIPrefix+"/user/commute-profiles/", server.commuteProfileByID)
	handle(cfg.APIPrefix+"/user/channels", server.channels)
	handle(cfg.APIPrefix+"/public/subscriptions", server.publicSubscriptions)
	handle(cfg.APIPrefix+"/weather/forecast", server.weatherForecast)
	handle(cfg.APIPrefix+"/air-quality/current", server.airQualityCurrent)
	handle(cfg.APIPrefix+"/energy/current", server.energyCurrent)
	handle(cfg.APIPrefix+"/traffic/current", server.trafficCurrent)
	handle(cfg.APIPrefix+"/transit/current", server.transitCurrent)
	handle(cfg.APIPrefix+"/platform/overview", server.platformOverview)
	handle(cfg.APIPrefix+"/platform/overview/export", server.platformOverviewExport)
	handle(cfg.APIPrefix+"/platform/history", server.platformHistoryHandler)
	handle(cfg.APIPrefix+"/platform/history/availability", server.platformHistoryAvailability)
	handle(cfg.APIPrefix+"/platform/events/", server.platformEvent)
	handle(cfg.APIPrefix+"/platform/categories/", server.platformCategory)
	server.readCache = observability.NewReadCache(cfg.ReadCacheTTLSeconds)
	server.metricsRegistry = observability.NewRegistry(cfg.AppName, cfg.AppVersion, cfg.BuildSHA, cfg.MetricsEnabled)
	server.logger = observability.NewLogger(cfg.LogLevel, cfg.LogFormat)
	server.handler = observability.Middleware(
		withCORS(mux, cfg.CORSOrigins),
		server.metricsRegistry,
		server.logger,
		observability.Options{RequestIDHeader: cfg.RequestIDHeader, RequestLogging: cfg.RequestLoggingEnabled, Routes: routes},
	)
	return server
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func (s *Server) root(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{
		"service": s.cfg.AppName,
		"backend": "go",
	})
}

func (s *Server) health(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}

	databaseStatus := "up"
	statusCode := http.StatusOK
	if s.db == nil {
		databaseStatus = "down"
		statusCode = http.StatusServiceUnavailable
	} else {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if err := s.db.Ping(ctx); err != nil {
			databaseStatus = "down"
			statusCode = http.StatusServiceUnavailable
		}
	}

	writeJSON(writer, statusCode, map[string]any{
		"status":    map[bool]string{true: "ok", false: "degraded"}[statusCode == http.StatusOK],
		"app_name":  s.cfg.AppName,
		"version":   s.cfg.AppVersion,
		"build_sha": s.cfg.BuildSHA,
		"timezone":  s.cfg.Timezone,
		"database":  databaseStatus,
		// The Go backend ships no trace exporter, so this is reported as
		// unavailable rather than as a setting that silently does nothing.
		"tracing": "unavailable",
	})
}

func (s *Server) metrics(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if strings.TrimSpace(s.cfg.MetricsBearerToken) != "" {
		token, ok := bearerToken(request)
		if !ok || !hmac.Equal([]byte(token), []byte(s.cfg.MetricsBearerToken)) {
			writer.Header().Set("WWW-Authenticate", "Bearer")
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"detail": "Metrics authentication is required."})
			return
		}
	}
	writer.Header().Set("Content-Type", observability.PrometheusContentType)
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(s.metricsRegistry.Render()))
}

func (s *Server) platformCoverage(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	writeJSON(writer, http.StatusOK, platform.BuildCoverage(s.cfg))
}

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
	scope, err := timescope.DefaultScope(targetDate, now, s.cfg)
	if err != nil {
		return "", nil, platform.Overview{}, fmt.Errorf("Configured timezone is invalid.")
	}
	statusItems := []sources.Status{}
	if s.sources != nil {
		if reader, ok := s.sources.(database.ScopedSourceStatusReader); ok && scope.Mode == "historical" {
			statusItems, err = reader.ListSourceStatusAt(request.Context(), scope.ReferenceTime)
		} else {
			statusItems, err = s.sources.ListSourceStatus(request.Context())
		}
		if err != nil {
			return "", nil, platform.Overview{}, errPlatformReadUnavailable
		}
	}
	data := platform.PlatformData{}
	if s.platformReader != nil {
		data, err = s.platformReader.LoadPlatform(request.Context(), platform.PlatformQuery{Now: scope.ReferenceTime, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
		if err != nil {
			return "", nil, platform.Overview{}, errPlatformReadUnavailable
		}
	}
	return cityRef, targetDate, platform.BuildOverview(data, scope, s.cfg, statusItems, cityRef), nil
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
	result, err := s.cachedRead(fmt.Sprintf("platform_history:%s:%v:%d", city, targetDate, days), func() (map[string]any, error) {
		return s.platformHistory.LoadPlatformHistory(request.Context(), city, targetDate, days, s.now().UTC())
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

func (s *Server) dataQuality(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.sources == nil {
		writeJSON(writer, http.StatusServiceUnavailable, health.DataQuality{
			CheckedAt: s.now().UTC().Format(time.RFC3339Nano),
			Status:    "unavailable",
			Sources:   []health.DataQualitySource{},
		})
		return
	}
	items, err := s.sources.ListSourceStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, health.DataQuality{
			CheckedAt: s.now().UTC().Format(time.RFC3339Nano),
			Status:    "unavailable",
			Sources:   []health.DataQualitySource{},
		})
		return
	}

	checkedAt := s.now().UTC()
	qualitySources := make([]health.DataQualitySource, 0, len(items))
	healthyCount := 0
	for _, item := range items {
		status := operationalStatus(item, checkedAt)
		if status == "healthy" {
			healthyCount++
		}
		var lastCheckedAt *string
		var recordsIngested *int
		var errorMessage *string
		if item.LastRun != nil {
			lastCheckedAt = item.LastRun.FinishedAt
			if lastCheckedAt == nil {
				lastCheckedAt = &item.LastRun.StartedAt
			}
			records := item.LastRun.RecordsIngested
			recordsIngested = &records
			errorMessage = item.LastRun.ErrorMessage
		}
		qualitySources = append(qualitySources, health.DataQualitySource{
			SourceCode:      item.SourceCode,
			Status:          status,
			LastCheckedAt:   lastCheckedAt,
			RecordsIngested: recordsIngested,
			Error:           errorMessage,
		})
	}
	issueCount := len(items) - healthyCount
	qualityStatus := "degraded"
	statusCode := http.StatusServiceUnavailable
	if len(items) == 0 {
		qualityStatus = "unavailable"
	} else if issueCount == 0 {
		qualityStatus = "healthy"
		statusCode = http.StatusOK
	}
	writeJSON(writer, statusCode, health.DataQuality{
		CheckedAt:    checkedAt.Format(time.RFC3339Nano),
		Status:       qualityStatus,
		SourceCount:  len(items),
		HealthyCount: healthyCount,
		IssueCount:   issueCount,
		Sources:      qualitySources,
	})
}

func operationalStatus(source sources.Status, now time.Time) string {
	return sources.DeriveOperationalStatus(source, now)
}

func (s *Server) sourceStatus(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.sources == nil || s.users == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}

	_, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	items, err := s.sources.ListSourceStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, items)
}

func (s *Server) sourcesRefresh(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.EnqueuePlatformRefresh(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusAccepted, result)
}

func (s *Server) sourcesRefreshStatus(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.PlatformRefreshStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) schedulerJobs(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	jobs, err := s.scheduler.ListScheduledJobs(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	payload := make([]map[string]any, 0, len(jobs))
	for _, job := range jobs {
		item := map[string]any{"id": job.ID, "job_key": job.JobKey, "task_type": job.TaskType, "interval_seconds": job.IntervalSeconds, "payload": job.Payload, "is_enabled": job.IsEnabled, "next_run_at": job.NextRunAt.Format(time.RFC3339Nano), "locked_by": job.LockedBy, "locked_until": formatOptionalTime(job.LockedUntil), "last_started_at": formatOptionalTime(job.LastStartedAt), "last_finished_at": formatOptionalTime(job.LastFinishedAt), "last_status": job.LastStatus}
		if job.LastError != nil && strings.TrimSpace(*job.LastError) != "" {
			item["last_error"] = "The latest scheduler run failed; provider details are not exposed."
		}
		payload = append(payload, item)
	}
	writeJSON(writer, http.StatusOK, payload)
}

func (s *Server) schedulerSync(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.SyncDefaultScheduledJobs(request.Context(), s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func formatOptionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339Nano)
	return &formatted
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authTokenResponse struct {
	AccessToken string     `json:"access_token"`
	TokenType   string     `json:"token_type"`
	ExpiresAt   time.Time  `json:"expires_at"`
	User        users.User `json:"user"`
}

type authFailure struct {
	status int
	detail string
	bearer bool
}

func (s *Server) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if s.admin == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	var payload loginRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || strings.TrimSpace(payload.Username) == "" || payload.Password == "" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Invalid login payload."})
		return
	}

	if !auth.VerifyAdminCredentials(payload.Username, payload.Password, s.cfg) {
		decision := s.loginLimiter.Check(
			loginRateLimitKey(request),
			s.cfg.LoginRateLimitRequests,
			time.Duration(s.cfg.LoginRateLimitWindowSeconds)*time.Second,
			s.now(),
		)
		if !decision.Allowed {
			writer.Header().Set("Retry-After", strconv.Itoa(decision.RetryAfterSeconds))
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"detail": "Too many failed login attempts. Please try again shortly."})
			return
		}
		writer.Header().Set("WWW-Authenticate", "Bearer")
		writeJSON(writer, http.StatusUnauthorized, map[string]string{"detail": "Invalid username or password."})
		return
	}

	user, err := s.admin.GetOrCreateAdminUser(request.Context(), s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	accessToken, expiresAt := auth.CreateAccessToken(user, s.cfg, s.now())
	writeJSON(writer, http.StatusOK, authTokenResponse{
		AccessToken: accessToken,
		TokenType:   "bearer",
		ExpiresAt:   expiresAt,
		User:        user,
	})
}

func (s *Server) authMe(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	writeJSON(writer, http.StatusOK, user)
}

func (s *Server) listRecommendations(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	userID := strings.TrimSpace(request.URL.Query().Get("user_id"))
	if userID == "" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "user_id is required."})
		return
	}
	if user.ID != userID {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Authenticated user cannot modify another user's resources."})
		return
	}
	if s.recommendations == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	limit := 20
	if rawLimit := request.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 1 || parsed > 100 {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "limit must be between 1 and 100."})
			return
		}
		limit = parsed
	}
	items, err := s.recommendations.ListRecommendations(request.Context(), userID, limit)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	payload := make([]map[string]any, 0, len(items))
	for _, item := range items {
		payload = append(payload, item.API())
	}
	writeJSON(writer, http.StatusOK, payload)
}

func (s *Server) listNotifications(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	limit := 50
	if value := request.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 200 {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "limit must be between 1 and 200."})
			return
		}
		limit = parsed
	}
	if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	items, err := s.profiles.ListNotifications(request.Context(), user.ID, limit)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, items)
}

func (s *Server) todaySummary(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.today == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	result, err := s.today.LoadToday(request.Context(), user.ID, s.now().UTC())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "User not found."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

// cachedRead serves a read model from the short-lived cache when possible.
// Only anonymous, non-user-scoped payloads are cached, so no request can ever
// observe another user's data.
func (s *Server) cachedRead(key string, build func() (map[string]any, error)) (map[string]any, error) {
	if cached, ok := s.readCache.Get(key); ok {
		if payload, ok := cached.(map[string]any); ok {
			return payload, nil
		}
	}
	payload, err := build()
	if err != nil {
		return nil, err
	}
	s.readCache.Set(key, payload)
	return payload, nil
}

func (s *Server) publicDashboardHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.publicDashboard == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
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
	cacheKey := "public_dashboard:live"
	if targetDate != nil {
		cacheKey = "public_dashboard:" + targetDate.UTC().Format("2006-01-02")
	}
	result, err := s.cachedRead(cacheKey, func() (map[string]any, error) {
		return s.publicDashboard.LoadPublicDashboard(request.Context(), targetDate, s.now().UTC())
	})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) personalDashboardHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.personalDashboard == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	requested := strings.TrimSpace(request.URL.Query().Get("user_id"))
	if requested != "" && requested != user.ID {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Authenticated user cannot modify another user's resources."})
		return
	}
	result, err := s.personalDashboard.LoadPersonalDashboard(request.Context(), user.ID, s.now().UTC())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Requested user was not found."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

type assistantMessagePayload struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type assistantChatPayload struct {
	Messages []assistantMessagePayload `json:"messages"`
	Language string                    `json:"language"`
	City     *string                   `json:"city"`
	Date     *string                   `json:"date"`
	UserID   *string                   `json:"user_id"`
}

func (s *Server) assistantChat(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.optionalCurrentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if !s.allowAssistant(request, user, "chat", writer) {
		return
	}
	var payload assistantChatPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if !validateAssistantChat(payload) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Assistant chat values are invalid."})
		return
	}
	messages := make([]assistant.Message, 0, len(payload.Messages))
	for _, message := range payload.Messages {
		messages = append(messages, assistant.Message{Role: message.Role, Content: message.Content})
	}
	result := assistant.Chat(request.Context(), s.cfg, messages, payload.Language, s.groundAssistant(request, payload))
	writeJSON(writer, http.StatusOK, map[string]any{"answer": result.Answer, "citations": result.Citations, "model": result.Model, "answer_mode": result.AnswerMode, "data_context": result.DataContext, "error_message": result.Error})
}

func (s *Server) assistantChatStream(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.optionalCurrentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if !s.allowAssistant(request, user, "chat", writer) {
		return
	}
	var payload assistantChatPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if !validateAssistantChat(payload) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Assistant chat values are invalid."})
		return
	}
	messages := make([]assistant.Message, 0, len(payload.Messages))
	for _, message := range payload.Messages {
		messages = append(messages, assistant.Message{Role: message.Role, Content: message.Content})
	}
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.WriteHeader(http.StatusOK)
	flusher, _ := writer.(http.Flusher)
	encoder := json.NewEncoder(writer)

	// Each frame is emitted and flushed as it arrives, so the client renders the
	// answer progressively instead of waiting for the whole completion.
	emit := func(frame map[string]any) {
		_, _ = writer.Write([]byte("data: "))
		_ = encoder.Encode(frame)
		_, _ = writer.Write([]byte("\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}
	grounded := s.groundAssistant(request, payload)
	result := assistant.Stream(request.Context(), s.cfg, messages, payload.Language, grounded, func(delta string) {
		emit(map[string]any{"delta": delta})
	})
	emit(map[string]any{"answer": result.Answer, "citations": result.Citations, "model": result.Model, "answer_mode": result.AnswerMode, "data_context": result.DataContext, "error_message": result.Error})
	_, _ = writer.Write([]byte("data: [DONE]\n\n"))
	if flusher != nil {
		flusher.Flush()
	}
}

type assistantTranslatePayload struct {
	Text           string  `json:"text"`
	TargetLanguage string  `json:"target_language"`
	SourceLanguage string  `json:"source_language"`
	Context        *string `json:"context"`
}

func (s *Server) assistantTranslate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if !s.allowAssistant(request, nil, "translate", writer) {
		return
	}
	var payload assistantTranslatePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if strings.TrimSpace(payload.Text) == "" || len(payload.Text) > 3000 || (payload.TargetLanguage != "en" && payload.TargetLanguage != "zh") {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Translation values are invalid."})
		return
	}
	if payload.SourceLanguage == "" {
		payload.SourceLanguage = "auto"
	}
	contextHint := ""
	if payload.Context != nil {
		contextHint = *payload.Context
	}
	result := assistant.Translate(request.Context(), s.cfg, payload.Text, payload.SourceLanguage, payload.TargetLanguage, contextHint)
	writeJSON(writer, http.StatusOK, map[string]any{"translated_text": result.TranslatedText, "source_language": result.SourceLanguage, "target_language": result.TargetLanguage, "model": result.Model, "answer_mode": result.AnswerMode, "error_message": result.Error})
}

func validateAssistantChat(payload assistantChatPayload) bool {
	if len(payload.Messages) < 1 || len(payload.Messages) > 20 {
		return false
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if payload.Language != "en" && payload.Language != "zh" && payload.Language != "fi" {
		return false
	}
	for _, message := range payload.Messages {
		if (message.Role != "user" && message.Role != "assistant") || strings.TrimSpace(message.Content) == "" || len(message.Content) > 4000 {
			return false
		}
	}
	return true
}

func (s *Server) allowAssistant(request *http.Request, user *users.User, operation string, writer http.ResponseWriter) bool {
	key := operation + ":" + loginRateLimitKey(request)
	if user != nil {
		key = operation + ":user:" + user.ID
	}
	decision := s.assistantLimiter.Check(key, s.cfg.AssistantRateLimitRequests, time.Duration(s.cfg.AssistantRateLimitWindowSeconds)*time.Second, s.now())
	if decision.Allowed {
		return true
	}
	writer.Header().Set("Retry-After", strconv.Itoa(decision.RetryAfterSeconds))
	writeJSON(writer, http.StatusTooManyRequests, map[string]string{"detail": "Assistant request limit reached. Please try again shortly."})
	return false
}

func (s *Server) optionalCurrentUser(request *http.Request) (*users.User, *authFailure) {
	if _, ok := bearerToken(request); !ok {
		return nil, nil
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		return nil, failure
	}
	return &user, nil
}

type telegramUpdatePayload struct {
	UpdateID *int64 `json:"update_id"`
	Message  *struct {
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

func (s *Server) telegramWebhook(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if strings.TrimSpace(s.cfg.TelegramWebhookSecret) == "" {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram webhook is not configured."})
		return
	}
	expected := []byte(s.cfg.TelegramWebhookSecret)
	provided := []byte(request.Header.Get("X-Telegram-Bot-Api-Secret-Token"))
	expectedDigest := sha256.Sum256(expected)
	providedDigest := sha256.Sum256(provided)
	if !hmac.Equal(expectedDigest[:], providedDigest[:]) || string(provided) != s.cfg.TelegramWebhookSecret {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Invalid Telegram webhook secret."})
		return
	}
	var payload telegramUpdatePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if s.telegram == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if payload.Message != nil {
		chatID := strconv.FormatInt(payload.Message.Chat.ID, 10)
		reply, err := s.telegram.ProcessTelegramUpdate(request.Context(), payload.UpdateID, chatID, payload.Message.Text, s.now().UTC())
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram update could not be processed."})
			return
		}
		if reply != nil && strings.TrimSpace(s.cfg.TelegramBotToken) != "" {
			_ = dispatch.NewTelegramSender(s.cfg).SendMessage(request.Context(), reply.ChatID, reply.Text)
		}
	} else if payload.UpdateID != nil {
		if _, err := s.telegram.ProcessTelegramUpdate(request.Context(), payload.UpdateID, "", "", s.now().UTC()); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram update could not be processed."})
			return
		}
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) locations(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListLocations(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload locationPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateLocationPayload(payload, true) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Location values are invalid."})
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	item, err := s.profiles.CreateLocation(request.Context(), user.ID, payload.input())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

func (s *Server) locationByID(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	locationID := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/user/locations/"), "/")
	if locationID == "" || strings.Contains(locationID, "/") {
		writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Location not found for the authenticated user."})
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer)
		return
	}
	var payload locationPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateLocationPayload(payload, false) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Location values are invalid."})
		return
	}
	item, err := s.profiles.UpdateLocation(request.Context(), user.ID, locationID, payload.input())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Location not found for the authenticated user."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, item)
}

type locationPayload struct {
	UserID      string  `json:"user_id"`
	Label       string  `json:"label"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	District    *string `json:"district"`
	Latitude    float64 `json:"lat"`
	Longitude   float64 `json:"lon"`
	IsDefault   bool    `json:"is_default"`
}

func (payload locationPayload) input() profile.LocationInput {
	return profile.LocationInput{Label: strings.TrimSpace(payload.Label), CountryCode: strings.TrimSpace(payload.CountryCode), City: strings.TrimSpace(payload.City), District: payload.District, Latitude: payload.Latitude, Longitude: payload.Longitude, IsDefault: payload.IsDefault}
}

func validateLocationPayload(payload locationPayload, requireUserID bool) bool {
	if (requireUserID && strings.TrimSpace(payload.UserID) == "") || strings.TrimSpace(payload.Label) == "" || len(strings.TrimSpace(payload.Label)) > 40 || len(strings.TrimSpace(payload.CountryCode)) != 2 || strings.TrimSpace(payload.City) == "" || len(strings.TrimSpace(payload.City)) > 80 || payload.Latitude < -90 || payload.Latitude > 90 || payload.Longitude < -180 || payload.Longitude > 180 {
		return false
	}
	return true
}

func (s *Server) preferences(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		item, err := s.profiles.GetPreferences(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, item)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload preferencePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if payload.MaxNotificationsPerDay == 0 {
		payload.MaxNotificationsPerDay = 6
	}
	if payload.MaxNotificationsPerDay < 1 || payload.MaxNotificationsPerDay > 20 || !validClock(payload.QuietHoursStart) || !validClock(payload.QuietHoursEnd) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Preference values are invalid."})
		return
	}
	item, err := s.profiles.UpsertPreferences(request.Context(), user.ID, profile.PreferenceInput{CaresEnergy: boolOr(payload.CaresEnergy, false), CaresAirQuality: boolOr(payload.CaresAirQuality, true), CaresWeather: boolOr(payload.CaresWeather, true), CaresCommute: boolOr(payload.CaresCommute, true), AllergySensitive: boolOr(payload.AllergySensitive, false), QuietHoursStart: payload.QuietHoursStart, QuietHoursEnd: payload.QuietHoursEnd, MaxNotificationsPerDay: payload.MaxNotificationsPerDay})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type preferencePayload struct {
	UserID                 string  `json:"user_id"`
	CaresEnergy            *bool   `json:"cares_energy"`
	CaresAirQuality        *bool   `json:"cares_air_quality"`
	CaresWeather           *bool   `json:"cares_weather"`
	CaresCommute           *bool   `json:"cares_commute"`
	AllergySensitive       *bool   `json:"allergy_sensitive"`
	QuietHoursStart        *string `json:"quiet_hours_start"`
	QuietHoursEnd          *string `json:"quiet_hours_end"`
	MaxNotificationsPerDay int     `json:"max_notifications_per_day"`
}

func (s *Server) commuteProfiles(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListCommuteProfiles(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload commutePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateCommutePayload(payload, true) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Commute profile values are invalid."})
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	item, err := s.profiles.CreateCommuteProfile(request.Context(), user.ID, payload.input())
	if err != nil {
		if errors.Is(err, database.ErrInvalidCommuteLocations) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

func (s *Server) commuteProfileByID(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	profileID := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/user/commute-profiles/"), "/")
	if profileID == "" || strings.Contains(profileID, "/") || request.Method != http.MethodPut {
		methodNotAllowed(writer)
		return
	}
	var payload commutePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateCommutePayload(payload, false) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Commute profile values are invalid."})
		return
	}
	item, err := s.profiles.UpdateCommuteProfile(request.Context(), user.ID, profileID, payload.input())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Commute profile not found for the authenticated user."})
			return
		}
		if errors.Is(err, database.ErrInvalidCommuteLocations) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, item)
}

type commutePayload struct {
	UserID                string   `json:"user_id"`
	Name                  string   `json:"name"`
	OriginLocationID      string   `json:"origin_location_id"`
	DestinationLocationID string   `json:"destination_location_id"`
	PreferredMode         string   `json:"preferred_mode"`
	DepartureTimeLocal    string   `json:"departure_time_local"`
	Weekdays              []int    `json:"weekdays"`
	RouteNames            []string `json:"route_names"`
	StopNames             []string `json:"stop_names"`
	IsActive              *bool    `json:"is_active"`
}

func (payload commutePayload) input() profile.CommuteProfileInput {
	mode := payload.PreferredMode
	if mode == "" {
		mode = "TRANSIT"
	}
	routes, _ := cleanNameList(payload.RouteNames)
	stops, _ := cleanNameList(payload.StopNames)
	return profile.CommuteProfileInput{Name: strings.TrimSpace(payload.Name), OriginLocationID: payload.OriginLocationID, DestinationLocationID: payload.DestinationLocationID, PreferredMode: mode, DepartureTimeLocal: payload.DepartureTimeLocal, Weekdays: payload.Weekdays, RouteNames: routes, StopNames: stops, IsActive: boolOr(payload.IsActive, true)}
}

func cleanNameList(values []string) ([]string, bool) {
	if len(values) > 12 {
		return nil, false
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" || len(text) > 80 {
			return nil, false
		}
		key := strings.ToLower(text)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, text)
	}
	return result, true
}

func validateCommutePayload(payload commutePayload, requireUserID bool) bool {
	if (requireUserID && strings.TrimSpace(payload.UserID) == "") || strings.TrimSpace(payload.Name) == "" || len(strings.TrimSpace(payload.Name)) > 80 || payload.OriginLocationID == "" || payload.DestinationLocationID == "" || payload.OriginLocationID == payload.DestinationLocationID || !validClock(&payload.DepartureTimeLocal) || len(payload.Weekdays) == 0 {
		return false
	}
	if payload.PreferredMode == "" {
		payload.PreferredMode = "TRANSIT"
	}
	if payload.PreferredMode != "TRANSIT" && payload.PreferredMode != "WALK" && payload.PreferredMode != "BIKE" && payload.PreferredMode != "DRIVE" {
		return false
	}
	if _, ok := cleanNameList(payload.RouteNames); !ok {
		return false
	}
	if _, ok := cleanNameList(payload.StopNames); !ok {
		return false
	}
	seen := map[int]struct{}{}
	for _, day := range payload.Weekdays {
		if day < 1 || day > 7 {
			return false
		}
		seen[day] = struct{}{}
	}
	return len(seen) > 0
}

func (s *Server) channels(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListChannels(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload channelPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if payload.ChannelType == "" {
		payload.ChannelType = "TELEGRAM"
	}
	if payload.ChannelType != "TELEGRAM" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Unsupported channel type."})
		return
	}
	item, err := s.profiles.UpsertChannel(request.Context(), user.ID, profile.ChannelInput{ChannelType: payload.ChannelType, ExternalID: payload.ExternalID, IsActive: boolOr(payload.IsActive, true)})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type channelPayload struct {
	UserID      string  `json:"user_id"`
	ChannelType string  `json:"channel_type"`
	ExternalID  *string `json:"external_id"`
	IsActive    *bool   `json:"is_active"`
}

func (s *Server) publicSubscriptions(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListSubscriptions(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload subscriptionPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if !validScenario(payload.ScenarioKey) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Unsupported scenario key."})
		return
	}
	item, err := s.profiles.UpsertSubscription(request.Context(), user.ID, payload.ScenarioKey)
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": "Register a Telegram channel before subscribing to public scenario feeds."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type subscriptionPayload struct {
	UserID      string `json:"user_id"`
	ScenarioKey string `json:"scenario_key"`
}

func requireOwnUser(currentID, requestedID string) error {
	requestedID = strings.TrimSpace(requestedID)
	if requestedID == "" {
		return errors.New("user_id is required.")
	}
	if requestedID != currentID {
		return errors.New("Authenticated user cannot modify another user's resources.")
	}
	return nil
}

func validScenario(value string) bool {
	return value == "commute" || value == "outdoor" || value == "home_air" || value == "energy" || value == "COMMUTE" || value == "OUTDOOR" || value == "HOME_AIR" || value == "ENERGY"
}

func validClock(value *string) bool {
	if value == nil || *value == "" {
		return true
	}
	if len(*value) != 5 || (*value)[2] != ':' {
		return false
	}
	hour, hourErr := strconv.Atoi((*value)[:2])
	minute, minuteErr := strconv.Atoi((*value)[3:])
	return hourErr == nil && minuteErr == nil && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

func boolOr(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func decodeRequest(writer http.ResponseWriter, request *http.Request, destination any) bool {
	if err := json.NewDecoder(request.Body).Decode(destination); err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Invalid JSON payload."})
		return false
	}
	return true
}

func (s *Server) currentUser(request *http.Request) (users.User, *authFailure) {
	if s.users == nil {
		return users.User{}, &authFailure{status: http.StatusServiceUnavailable, detail: "Database is unavailable."}
	}
	token, ok := bearerToken(request)
	if !ok {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authentication is required.", bearer: true}
	}
	claims, err := auth.DecodeAccessToken(token, s.cfg, s.now().UTC())
	if err != nil {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: err.Error(), bearer: true}
	}
	user, err := s.users.GetUser(request.Context(), claims.Subject)
	if err != nil {
		if database.IsNotFound(err) {
			return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authenticated user is not available.", bearer: true}
		}
		return users.User{}, &authFailure{status: http.StatusServiceUnavailable, detail: "Database is unavailable."}
	}
	if user.Status != "ACTIVE" {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authenticated user is not available.", bearer: true}
	}
	return user, nil
}

func writeAuthFailure(writer http.ResponseWriter, failure *authFailure) {
	if failure.bearer {
		writer.Header().Set("WWW-Authenticate", "Bearer")
	}
	writeJSON(writer, failure.status, map[string]string{"detail": failure.detail})
}

func loginRateLimitKey(request *http.Request) string {
	host := requestClientIP(request)
	if host == "" {
		host = "unknown"
	}
	return "login:" + host
}

func requestClientIP(request *http.Request) string {
	host := remoteHost(request.RemoteAddr)
	if isLoopback(host) {
		if forwarded := forwardedClientIP(request); forwarded != "" {
			return forwarded
		}
	}
	return host
}

func remoteHost(value string) string {
	host, _, err := net.SplitHostPort(value)
	if err != nil || host == "" {
		return value
	}
	return host
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func forwardedClientIP(request *http.Request) string {
	header := strings.TrimSpace(request.Header.Get("X-Forwarded-For"))
	if header == "" {
		header = strings.TrimSpace(request.Header.Get("X-Real-IP"))
	}
	first := strings.TrimSpace(strings.Split(header, ",")[0])
	if ip := net.ParseIP(first); ip != nil {
		return ip.String()
	}
	return ""
}

func bearerToken(request *http.Request) (string, bool) {
	parts := strings.Fields(request.Header.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}

func writeJSON(writer http.ResponseWriter, statusCode int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(value)
}

func methodNotAllowed(writer http.ResponseWriter) {
	writer.Header().Set("Allow", http.MethodGet)
	writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"detail": "Method not allowed."})
}

func withCORS(next http.Handler, origins []string) http.Handler {
	if len(origins) == 0 {
		return next
	}
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowed[strings.TrimSpace(origin)] = struct{}{}
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if _, ok := allowed[origin]; ok {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Access-Control-Allow-Credentials", "true")
			writer.Header().Add("Vary", "Origin")
		}
		if request.Method == http.MethodOptions {
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
			writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}
