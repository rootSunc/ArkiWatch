package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/recommendations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

const legacyCompatibleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"

type fakeDatabase struct{ err error }

func (database fakeDatabase) Ping(context.Context) error { return database.err }

type sourceDatabase struct {
	active bool
}

func (database sourceDatabase) Ping(context.Context) error { return nil }

func (database sourceDatabase) IsActiveUser(context.Context, string) (bool, error) {
	return database.active, nil
}

func (database sourceDatabase) GetUser(context.Context, string) (users.User, error) {
	status := "DISABLED"
	if database.active {
		status = "ACTIVE"
	}
	return users.User{
		ID:       "user-1",
		Status:   status,
		Locale:   "zh-CN",
		Timezone: "Europe/Helsinki",
	}, nil
}

func (sourceDatabase) ListSourceStatus(context.Context) ([]sources.Status, error) {
	finishedAt := "2026-08-21T14:00:00Z"
	return []sources.Status{{
		ID:                  "source-fmi",
		SourceCode:          "fmi",
		SourceName:          "Finnish Meteorological Institute",
		Endpoint:            "https://opendata.fmi.fi",
		AuthType:            "NONE",
		PollIntervalSeconds: 1800,
		IsActive:            true,
		LastRun: &sources.CollectorRun{
			Status:          "succeeded",
			StartedAt:       "2026-08-21T13:59:00Z",
			FinishedAt:      &finishedAt,
			RecordsIngested: 10,
		},
	}}, nil
}

type adminDatabase struct {
	sourceDatabase
}

func (database adminDatabase) GetOrCreateAdminUser(context.Context, config.Config) (users.User, error) {
	email := "admin@arkiwatch.local"
	name := "Admin"
	return users.User{
		ID:        "admin",
		Email:     &email,
		Name:      &name,
		Locale:    "zh-CN",
		Timezone:  "Europe/Helsinki",
		Status:    "ACTIVE",
		CreatedAt: time.Unix(2000000000, 0).UTC(),
		UpdatedAt: time.Unix(2000000000, 0).UTC(),
	}, nil
}

type recommendationDatabase struct {
	adminDatabase
}

func (recommendationDatabase) ListRecommendations(context.Context, string, int) ([]recommendations.Read, error) {
	return []recommendations.Read{
		{
			ID:                 "recommendation-1",
			RecommendationType: "WEATHER",
			Priority:           10,
			Status:             "PENDING",
			AdviceTitle:        "Take a jacket",
			AdviceBody:         "Wind increases this afternoon.",
			ValidFrom:          time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC),
			ValidTo:            time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC),
			EventType:          "weather_outlook",
			EventSeverity:      "MEDIUM",
			Rationale: map[string]any{
				"localized": map[string]any{
					"zh": map[string]any{"title": "带上外套", "body": "今天下午风力会增强。"},
				},
			},
		},
	}, nil
}

type weatherDatabase struct {
	sourceDatabase
	data      observations.WeatherData
	err       error
	lastQuery *observations.WeatherQuery
}

func (database *weatherDatabase) LoadWeather(_ context.Context, query observations.WeatherQuery) (observations.WeatherData, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type airQualityDatabase struct {
	sourceDatabase
	data      airquality.Data
	err       error
	lastQuery *airquality.Query
}

func (database *airQualityDatabase) LoadAirQuality(_ context.Context, query airquality.Query) (airquality.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type energyDatabase struct {
	sourceDatabase
	data      energy.Data
	err       error
	lastQuery *energy.Query
}

func (database *energyDatabase) LoadEnergy(_ context.Context, query energy.Query) (energy.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type trafficDatabase struct {
	sourceDatabase
	data      traffic.Data
	err       error
	lastQuery *traffic.Query
}

func (database *trafficDatabase) LoadTraffic(_ context.Context, query traffic.Query) (traffic.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type platformDatabase struct {
	sourceDatabase
	data      platform.PlatformData
	err       error
	lastQuery *platform.PlatformQuery
}

func (database *platformDatabase) LoadPlatform(_ context.Context, query platform.PlatformQuery) (platform.PlatformData, error) {
	database.lastQuery = &query
	return database.data, database.err
}

func TestRootMatchesPublicMetadataContract(t *testing.T) {
	cfg := config.DefaultConfig()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["service"] != "ArkiWatch" || payload["backend"] != "go" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestHealthReportsDatabaseFailureAsDegraded(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	New(cfg, fakeDatabase{err: context.DeadlineExceeded}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["status"] != "degraded" || payload["database"] != "down" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestDataQualityUsesSourceFreshnessContract(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, sourceDatabase{active: true})
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 30, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health/data-quality", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Status       string `json:"status"`
		SourceCount  int    `json:"source_count"`
		HealthyCount int    `json:"healthy_count"`
		IssueCount   int    `json:"issue_count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "healthy" || payload.SourceCount != 1 || payload.HealthyCount != 1 || payload.IssueCount != 0 {
		t.Fatalf("unexpected data-quality payload: %#v", payload)
	}
}

func TestOperationalStatusMatchesExistingStateRules(t *testing.T) {
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	if got := operationalStatus(sources.Status{IsActive: false}, now); got != "inactive" {
		t.Fatalf("inactive status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true}, now); got != "pending" {
		t.Fatalf("pending status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true, PollIntervalSeconds: 60, LastRun: &sources.CollectorRun{Status: "failed", StartedAt: "2026-08-21T13:59:00Z"}}, now); got != "failing" {
		t.Fatalf("failing status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true, PollIntervalSeconds: 60, LastRun: &sources.CollectorRun{Status: "succeeded", FinishedAt: stringPointer("2026-08-21T13:57:00Z"), StartedAt: "2026-08-21T13:56:00Z"}}, now); got != "stale" {
		t.Fatalf("stale status = %q", got)
	}
}

func stringPointer(value string) *string { return &value }

func TestCoverageUsesAPIContractPath(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/coverage", nil)
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var payload struct {
		DefaultCity string `json:"default_city"`
		Cities      []any  `json:"cities"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.DefaultCity != "helsinki" || len(payload.Cities) != 6 {
		t.Fatalf("unexpected coverage payload: %#v", payload)
	}
}

func TestSourceStatusRequiresExistingBearerIdentity(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/sources/status", nil)
	New(cfg, sourceDatabase{active: true}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
	if recorder.Header().Get("WWW-Authenticate") != "Bearer" {
		t.Fatalf("WWW-Authenticate = %q, want Bearer", recorder.Header().Get("WWW-Authenticate"))
	}
}

func TestSourceStatusUsesExistingAuthContract(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/sources/status", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	server := New(cfg, sourceDatabase{active: true})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload []sources.Status
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 1 || payload[0].SourceCode != "fmi" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestLoginAndAuthMeUseExistingAuthContract(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AdminPassword = "secret"
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	cfg.AuthTokenTTLMinutes = 60
	server := New(cfg, adminDatabase{sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000000, 0).UTC() }

	loginRecorder := httptest.NewRecorder()
	loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"secret"}`))
	server.Handler().ServeHTTP(loginRecorder, loginRequest)
	if loginRecorder.Code != http.StatusOK {
		t.Fatalf("login status = %d; body = %s", loginRecorder.Code, loginRecorder.Body.String())
	}
	var loginPayload authTokenResponse
	if err := json.Unmarshal(loginRecorder.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.TokenType != "bearer" || loginPayload.User.ID != "admin" || loginPayload.AccessToken == "" {
		t.Fatalf("unexpected login payload: %#v", loginPayload)
	}

	meRecorder := httptest.NewRecorder()
	meRequest := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meRequest.Header.Set("Authorization", "Bearer "+loginPayload.AccessToken)
	server.Handler().ServeHTTP(meRecorder, meRequest)
	if meRecorder.Code != http.StatusOK {
		t.Fatalf("auth/me status = %d; body = %s", meRecorder.Code, meRecorder.Body.String())
	}
}

func TestLoginRateLimitsFailedAttempts(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AdminPassword = "secret"
	cfg.LoginRateLimitRequests = 1
	cfg.LoginRateLimitWindowSeconds = 60
	server := New(cfg, adminDatabase{sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000000, 0).UTC() }

	request := func() *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong"}`))
		server.Handler().ServeHTTP(recorder, loginRequest)
		return recorder
	}
	if first := request(); first.Code != http.StatusUnauthorized {
		t.Fatalf("first failed login status = %d", first.Code)
	}
	if second := request(); second.Code != http.StatusTooManyRequests {
		t.Fatalf("second failed login status = %d", second.Code)
	}
}

func TestRecommendationsUsesAuthenticatedUserAndLocalizedFallback(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, recommendationDatabase{adminDatabase{sourceDatabase{active: true}}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/recommendations?user_id=user-1&limit=1", nil)
	request.Header.Set("Authorization", "Bearer "+legacyCompatibleToken)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 1 || payload[0]["advice_title_zh"] != "带上外套" {
		t.Fatalf("unexpected recommendation payload: %#v", payload)
	}
}

func TestWeatherForecastBuildsLiveReadModel(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	forecastStart := now.Add(-time.Hour)
	forecastEnd := now.Add(12 * time.Hour)
	data := observations.WeatherData{
		Outlook: &observations.NormalizedEvent{
			ID: "weather-1", EventType: "weather_outlook", SourceCode: "fmi", LocationRef: "helsinki",
			StartsAt: forecastStart, EndsAt: forecastEnd, Summary: "Partly cloudy with stronger wind.",
			Attributes: map[string]any{
				"generated_at": "2026-08-21T13:30:00+00:00",
				"forecast_points": []any{
					map[string]any{"timestamp": "2026-08-21T14:00:00+00:00", "temperature_c": 18.5, "precipitation_mm": 0.2, "wind_speed_ms": 5.0, "wind_gust_ms": 8.0, "cloud_cover_pct": 70.0, "humidity_pct": 65.0, "visibility_m": 12000.0},
					map[string]any{"timestamp": "2026-08-21T15:00:00+00:00", "temperature_c": 18.0, "precipitation_mm": 0.4, "wind_speed_ms": 5.5, "wind_gust_ms": 9.0, "cloud_cover_pct": 75.0, "humidity_pct": 68.0, "visibility_m": 11000.0},
				},
			},
		},
		Rain: &observations.NormalizedEvent{Attributes: map[string]any{
			"peak_precip_mm": 0.4, "total_precip_mm": 0.6,
		}},
		Raw: map[string]observations.RawObservation{
			"weather_forecast_raw":     {Dataset: "weather_forecast_raw", ObservedAt: now.Add(-30 * time.Minute), Payload: map[string]any{"request_url": "https://opendata.fmi.fi/forecast", "content_type": "application/xml"}},
			"weather_observations_raw": {Dataset: "weather_observations_raw", ObservedAt: now.Add(-20 * time.Minute), Payload: map[string]any{}},
		},
	}
	database := &weatherDatabase{sourceDatabase: sourceDatabase{active: true}, data: data}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?city=helsinki", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.Location == nil || *payload.Location != "helsinki" || len(payload.Points) != 2 {
		t.Fatalf("unexpected weather payload: %#v", payload)
	}
	if payload.TimeScope["mode"] != "live" || len(payload.SourceRequests) != 4 {
		t.Fatalf("unexpected weather scope or source requests: %#v", payload)
	}
}

func TestWeatherForecastAppliesHistoricalWindow(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &weatherDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: observations.WeatherData{Outlook: &observations.NormalizedEvent{
			SourceCode: "fmi", LocationRef: "helsinki", StartsAt: now.Add(-24 * time.Hour), EndsAt: now.Add(24 * time.Hour),
			Attributes: map[string]any{"forecast_points": []any{
				map[string]any{"timestamp": "2026-08-20T10:00:00+00:00", "temperature_c": 15.0},
				map[string]any{"timestamp": "2026-08-21T10:00:00+00:00", "temperature_c": 20.0},
			}},
		}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.TimeScope["mode"] != "historical" || payload.TimeScope["date"] != "2026-08-20" || len(payload.Points) != 1 {
		t.Fatalf("unexpected historical payload: %#v", payload)
	}
	if database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil {
		t.Fatalf("weather reader did not receive a historical window: %#v", database.lastQuery)
	}
}

func TestWeatherForecastRejectsUnsupportedCity(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?city=stockholm", nil)
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "City is not configured for city-scoped data.") {
		t.Fatalf("unexpected error body: %s", recorder.Body.String())
	}
}

func TestWeatherForecastDegradesToUnavailableOnDatabaseError(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &weatherDatabase{sourceDatabase: sourceDatabase{active: true}, err: context.DeadlineExceeded}
	server := New(cfg, database)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "unavailable" || payload.Summary == nil {
		t.Fatalf("unexpected unavailable payload: %#v", payload)
	}
}

func TestAirQualityCurrentBuildsStationsAndMetrics(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &airQualityDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: airquality.Data{
			Event: &observations.NormalizedEvent{
				SourceCode: "hsy", LocationRef: "helsinki", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(2 * time.Hour),
				Summary:    "Two stations reported; air quality is poor at Mannerheimintie.",
				Attributes: map[string]any{"worst_score": 4.0, "worst_label": "poor", "worst_station": "Mannerheimintie"},
			},
			HSYRaw: observations.RawObservation{
				Dataset: "air_quality_current", AreaCode: "helsinki", ObservedAt: now.Add(-20 * time.Minute),
				Payload: map[string]any{
					"request_url": "https://kartta.hsy.fi/geoserver/ilmanlaatu/wfs", "content_type": "application/json",
					"body": map[string]any{"features": []any{
						map[string]any{"geometry": map[string]any{"coordinates": []any{24.94, 60.17}}, "properties": map[string]any{"station": "Mannerheimintie", "air_quality": "poor", "pm2_5": 12.4, "pm10": 29.8, "no2": 42.0}},
						map[string]any{"geometry": map[string]any{"coordinates": []any{24.81, 60.22}}, "properties": map[string]any{"station": "Leppavaara", "air_quality": "fair", "pm2_5": 5.2, "pm10": 14.0, "no2": 18.0}},
					}},
				},
			},
		},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/air-quality/current?city=helsinki", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload airquality.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.WorstScore == nil || *payload.WorstScore != 4 || len(payload.Stations) != 2 {
		t.Fatalf("unexpected air-quality payload: %#v", payload)
	}
	if payload.Stations[0].Station != "Mannerheimintie" || payload.Stations[0].Score == nil || *payload.Stations[0].Score != 4 {
		t.Fatalf("unexpected station ordering: %#v", payload.Stations)
	}
	if payload.Quality.ReportingStationCount != 2 || payload.Quality.FieldCoveragePct != 100 {
		t.Fatalf("unexpected quality: %#v", payload.Quality)
	}
}

func TestAirQualityCurrentAppliesHistoricalWindow(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &airQualityDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/air-quality/current?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
	var payload airquality.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "empty" || payload.TimeScope["mode"] != "historical" {
		t.Fatalf("unexpected historical payload: %#v", payload)
	}
}

func TestEnergyCurrentBuildsPriceWindowAndHouseholdCost(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	prices := []any{}
	for hour, value := range []float64{8.2, 3.1, 3.4, 12.0} {
		prices = append(prices, map[string]any{
			"startDate": now.Add(time.Duration(hour) * time.Hour).Format(time.RFC3339),
			"endDate":   now.Add(time.Duration(hour+1) * time.Hour).Format(time.RFC3339),
			"price":     value,
		})
	}
	database := &energyDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: energy.Data{Price: observations.RawObservation{Dataset: energy.PriceDataset, AreaCode: "helsinki", ObservedAt: now, Payload: map[string]any{
			"request_url": "https://api.porssisahko.net/v2/latest-prices.json", "content_type": "application/json",
			"body": map[string]any{"unit": energy.PriceUnit, "prices": prices},
		}}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/energy/current?source=porssisahko", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload energy.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.SourceCode != energy.PriceSourceCode || payload.CurrentWindow == nil || payload.CurrentWindow.EstimatedCostEUR == nil {
		t.Fatalf("unexpected energy payload: %#v", payload)
	}
	if payload.CurrentWindow.AverageValue != 3.25 || *payload.CurrentWindow.EstimatedCostEUR != 0.065 || len(payload.Points) != 4 {
		t.Fatalf("unexpected energy values: %#v", payload)
	}
	if database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil || database.lastQuery.SourceCode != energy.PriceSourceCode {
		t.Fatalf("unexpected energy query: %#v", database.lastQuery)
	}
}

func TestEnergyCurrentRejectsUnknownSource(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/energy/current?source=unknown", nil)
	New(config.DefaultConfig(), fakeDatabase{}).Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), "source must be fingrid or porssisahko") {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestTrafficCurrentBuildsIncidentsAndCorridors(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &trafficDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: traffic.Data{
			Raw: []observations.RawObservation{{
				Dataset: "traffic_messages", AreaCode: "finland", ObservedAt: now.Add(-20 * time.Minute),
				Payload: map[string]any{
					"message_type": "roadworks", "request_url": "https://tie.digitraffic.fi/api/v3/traffic-message/v3/messages", "content_type": "application/json",
					"body": map[string]any{"features": []any{map[string]any{
						"geometry":   map[string]any{"bbox": []any{24.8, 60.1, 24.9, 60.2}},
						"properties": map[string]any{"situationId": "sit-1", "situationType": "ROADWORKS", "releaseTime": "2026-08-21T13:30:00Z", "announcements": []any{map[string]any{"language": "en", "title": "Roadworks on Ring I", "location": map[string]any{"description": "Ring I"}}}},
					}}, "feature_count_returned": 1},
				},
			}},
			Events: []observations.NormalizedEvent{{
				ID: "event-1", EventType: "road_disruption", SourceCode: "digitraffic", Severity: "HIGH", LocationRef: "road-ring-i", StartsAt: now.Add(-30 * time.Minute), EndsAt: now.Add(2 * time.Hour), Title: "Roadworks on Ring I", Summary: "One lane is closed.",
				Attributes: map[string]any{"situation_id": "sit-1", "situation_type": "ROADWORKS", "message_type": "roadworks", "location_description": "Ring I", "geometry_bbox": []any{24.8, 60.1, 24.9, 60.2}, "feature_names": []any{"Road 100"}},
			}, {
				ID: "event-2", EventType: "road_weather_risk", SourceCode: "digitraffic", Severity: "MEDIUM", LocationRef: "road-ring-i", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Title: "Slippery road", Summary: "Road surface may be slippery.",
				Attributes: map[string]any{},
			}},
		},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/traffic/current", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload traffic.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || len(payload.Incidents) != 2 || len(payload.Corridors) != 1 || payload.Quality.ActiveEventCount != 2 {
		t.Fatalf("unexpected traffic payload: %#v", payload)
	}
	if payload.Corridors[0].Key != "road-ring-i" || payload.Corridors[0].WeatherRiskCount != 1 || payload.Incidents[0].Severity != "HIGH" {
		t.Fatalf("unexpected traffic details: %#v", payload)
	}
}

func TestTrafficCurrentAppliesHistoricalScope(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &trafficDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/traffic/current?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || database.lastQuery == nil || database.lastQuery.WindowStart == nil || !database.lastQuery.Historical {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
}

func TestPlatformOverviewBuildsCategoriesAndCityCoverage(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &platformDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: platform.PlatformData{Events: []observations.NormalizedEvent{{
			ID: "weather-event", EventType: "weather_outlook", SourceCode: "fmi", Severity: "MEDIUM", LocationRef: "espoo", StartsAt: now, EndsAt: now.Add(6 * time.Hour), Title: "Cloudy", Summary: "Cloudy with moderate wind.", Attributes: map[string]any{"min_temp_c": 10.0, "max_temp_c": 14.0},
		}}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/overview?city=espoo", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload platform.Overview
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.CoverageArea != "Espoo/Uusimaa" || len(payload.Categories) != 10 || len(payload.RecentEvents) != 1 {
		t.Fatalf("unexpected platform overview: coverage=%q categories=%d recent=%d", payload.CoverageArea, len(payload.Categories), len(payload.RecentEvents))
	}
	if payload.Categories[0].Key != "weather" || payload.Categories[0].Events[0].Title != "Cloudy" {
		t.Fatalf("unexpected weather category: %#v", payload.Categories[0])
	}
}

func TestPlatformOverviewAppliesHistoricalScope(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &platformDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/overview?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || database.lastQuery == nil || !database.lastQuery.Historical || database.lastQuery.WindowStart == nil {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
}
