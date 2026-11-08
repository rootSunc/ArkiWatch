// Package httpapi serves the public, personal, assistant, and operator HTTP API.
// server.go wires routes and middleware; each resource has its own file.
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/auth"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observability"

	"golang.org/x/sync/singleflight"
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
	overviewFlight    singleflight.Group
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
