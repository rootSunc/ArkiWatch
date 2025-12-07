package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

var weakAuthTokenSecrets = map[string]struct{}{
	"dev-only-arkiwatch-auth-secret": {},
	"change-this-secret":             {},
}

var weakAdminPasswords = map[string]struct{}{
	"admin": {}, "password": {}, "changeme": {}, "change-this-password": {},
}

// Config contains the settings shared by the Go API and worker binaries.
type Config struct {
	AppName                          string
	AppVersion                       string
	BuildSHA                         string
	APIPrefix                        string
	APIHost                          string
	APIPort                          int
	DatabaseURL                      string
	Timezone                         string
	CORSOrigins                      []string
	DefaultPlace                     string
	DefaultLat                       float64
	DefaultLon                       float64
	Environment                      string
	WeatherPlaces                    []string
	AirQualityPlaces                 []string
	OpenMeteoAirQualityLocations     []string
	LinkedEventsCityAPIBaseURLs      []string
	SYKEHydrologyAPIBaseURL          string
	ServicemapAPIBaseURL             string
	InitialBackfillEnabled           bool
	InitialBackfillDays              int
	InitialBackfillSources           []string
	InitialBackfillWindowSeconds     int
	BackfillDefaultWindowSeconds     int
	BackfillMaxDueWindows            int
	BackfillMaxWindowRetries         int
	BackfillWindowLockTTLSeconds     int
	DataRetentionEnabled             bool
	RawObservationRetentionDays      int
	NormalizedEventRetentionDays     int
	SchedulerRunRetentionDays        int
	TelegramWebhookRetentionDays     int
	RawObservationPartitionMonths    int
	MetricsEnabled                   bool
	LogLevel                         string
	LogFormat                        string
	RequestLoggingEnabled            bool
	RequestIDHeader                  string
	ReadCacheTTLSeconds              int
	NormalizationBatchSize           int
	NormalizationLookbackHours       int
	SnapshotLookaheadHours           int
	HSYAPIURL                        string
	DigitransitAPIURL                string
	DigitransitRoutingURL            string
	DigitrafficUser                  string
	DigitrafficMaxFeaturesPerType    int
	DigitrafficHistoryStationLimit   int
	LinkedEventsAPIBaseURL           string
	LinkedEventsLookaheadDays        int
	LinkedEventsMaxPages             int
	LinkedEventsPageSize             int
	SYKEHydrologyStationLimit        int
	SYKEHydrologyObservationLimit    int
	SYKEHydrologyBackfillObsLimit    int
	ServicemapRadiusMeters           int
	ServicemapMaxUnits               int
	CollectorTimeoutSeconds          float64
	HouseholdElectricityProvider     string
	HouseholdUsageKWh                float64
	HouseholdPriceMarginCents        float64
	HouseholdTransferCents           float64
	FMIAPIBaseURL                    string
	HSYWFSURL                        string
	HSYAirQualityLayer               string
	OpenMeteoAirQualityURL           string
	DigitrafficRoadAPIBaseURL        string
	DigitransitHSLAlertsURL          string
	DigitransitSubscriptionKey       string
	FingridAPIBaseURL                string
	FingridAPIKey                    string
	FingridDatasetID                 int
	FingridDatasetURL                string
	FingridForecastHorizonHours      int
	FingridPageSize                  int
	ElectricityPriceAPIURL           string
	AuthTokenSecret                  string
	AuthTokenIssuer                  string
	AuthTokenAudience                string
	AuthTokenTTLMinutes              int
	AdminUserID                      string
	AdminUsername                    string
	AdminEmail                       string
	AdminPassword                    string
	AdminPasswordHash                string
	AdminName                        string
	LoginRateLimitRequests           int
	LoginRateLimitWindowSeconds      int
	SchedulerPollSeconds             float64
	SchedulerLockTTLSeconds          int
	SchedulerFailureRetrySeconds     int
	SchedulerPipelineIntervalSeconds int
	SchedulerRulesIntervalSeconds    int
	SchedulerDispatchIntervalSeconds int
	SchedulerMaxDueJobs              int
	SchedulerInitialJitterSeconds    int
	SchedulerRescheduleJitterSeconds int
	SchedulerBackfillIntervalSeconds int
	TelegramAPIBaseURL               string
	TelegramBotToken                 string
	TelegramWebhookSecret            string
	DeepseekAPIKey                   string
	DeepseekAPIBaseURL               string
	DeepseekModel                    string
	AssistantRequestTimeoutSeconds   float64
	AssistantRateLimitRequests       int
	AssistantRateLimitWindowSeconds  int
	MetricsBearerToken               string
}

// DefaultConfig preserves the environment and behavior defaults used by the
// previous service so the frontend and deployment configuration stay stable.
func DefaultConfig() Config {
	return Config{
		AppName:                          "ArkiWatch",
		AppVersion:                       "0.0.0",
		BuildSHA:                         "development",
		APIPrefix:                        "/api",
		APIHost:                          "127.0.0.1",
		APIPort:                          8000,
		DatabaseURL:                      "postgresql://postgres:postgres@localhost:5432/arkiwatch",
		Timezone:                         "Europe/Helsinki",
		CORSOrigins:                      nil,
		DefaultPlace:                     "Helsinki",
		DefaultLat:                       60.1699,
		DefaultLon:                       24.9384,
		Environment:                      "development",
		WeatherPlaces:                    []string{"helsinki=Helsinki", "espoo=Espoo", "vantaa=Vantaa", "tampere=Tampere", "turku=Turku", "oulu=Oulu"},
		AirQualityPlaces:                 []string{"helsinki=Helsinki", "espoo=Espoo", "vantaa=Vantaa"},
		OpenMeteoAirQualityLocations:     []string{"helsinki=Helsinki|60.1699|24.9384", "espoo=Espoo|60.2055|24.6559", "vantaa=Vantaa|60.2934|25.0378", "tampere=Tampere|61.4978|23.7610", "turku=Turku|60.4518|22.2666", "oulu=Oulu|65.0121|25.4651"},
		LinkedEventsCityAPIBaseURLs:      []string{"helsinki=https://api.hel.fi/linkedevents/v1", "espoo=https://api.espoo.fi/events/v1"},
		SYKEHydrologyAPIBaseURL:          "https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata",
		ServicemapAPIBaseURL:             "https://www.hel.fi/palvelukarttaws/rest/v4",
		InitialBackfillEnabled:           false,
		InitialBackfillDays:              7,
		InitialBackfillSources:           nil,
		InitialBackfillWindowSeconds:     86400,
		BackfillDefaultWindowSeconds:     86400,
		BackfillMaxDueWindows:            2,
		BackfillMaxWindowRetries:         3,
		BackfillWindowLockTTLSeconds:     1800,
		DataRetentionEnabled:             false,
		RawObservationRetentionDays:      90,
		NormalizedEventRetentionDays:     365,
		SchedulerRunRetentionDays:        90,
		TelegramWebhookRetentionDays:     30,
		RawObservationPartitionMonths:    3,
		MetricsEnabled:                   true,
		LogLevel:                         "INFO",
		LogFormat:                        "json",
		RequestLoggingEnabled:            true,
		RequestIDHeader:                  "X-Request-ID",
		ReadCacheTTLSeconds:              30,
		NormalizationBatchSize:           500,
		NormalizationLookbackHours:       24,
		SnapshotLookaheadHours:           36,
		HSYAPIURL:                        "https://kartta.hsy.fi/geoserver/wfs",
		DigitransitAPIURL:                "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1",
		DigitransitRoutingURL:            "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1",
		DigitrafficUser:                  "ArkiWatch/1.2",
		DigitrafficMaxFeaturesPerType:    200,
		DigitrafficHistoryStationLimit:   40,
		LinkedEventsAPIBaseURL:           "https://api.hel.fi/linkedevents/v1",
		LinkedEventsLookaheadDays:        7,
		LinkedEventsMaxPages:             3,
		LinkedEventsPageSize:             40,
		SYKEHydrologyStationLimit:        3,
		SYKEHydrologyObservationLimit:    24,
		SYKEHydrologyBackfillObsLimit:    240,
		ServicemapRadiusMeters:           3000,
		ServicemapMaxUnits:               120,
		CollectorTimeoutSeconds:          30,
		HouseholdElectricityProvider:     "Fortum",
		HouseholdUsageKWh:                2.0,
		HouseholdPriceMarginCents:        0,
		HouseholdTransferCents:           0,
		FMIAPIBaseURL:                    "https://opendata.fmi.fi",
		HSYWFSURL:                        "https://kartta.hsy.fi/geoserver/ilmanlaatu/wfs",
		HSYAirQualityLayer:               "Ilmanlaatu_nyt",
		OpenMeteoAirQualityURL:           "https://air-quality-api.open-meteo.com/v1/air-quality",
		DigitrafficRoadAPIBaseURL:        "https://tie.digitraffic.fi",
		DigitransitHSLAlertsURL:          "https://realtime.hsl.fi/realtime/service-alerts/v2/hsl",
		FingridAPIBaseURL:                "https://data.fingrid.fi/api",
		FingridDatasetID:                 166,
		FingridForecastHorizonHours:      36,
		FingridPageSize:                  200,
		ElectricityPriceAPIURL:           "https://api.porssisahko.net/v2/latest-prices.json",
		AuthTokenSecret:                  "dev-only-arkiwatch-auth-secret",
		AuthTokenIssuer:                  "arkiwatch-api",
		AuthTokenAudience:                "arkiwatch-web",
		AuthTokenTTLMinutes:              720,
		AdminUserID:                      "admin",
		AdminUsername:                    "admin",
		AdminEmail:                       "admin@arkiwatch.local",
		AdminPassword:                    "admin",
		AdminPasswordHash:                "",
		AdminName:                        "Admin",
		LoginRateLimitRequests:           10,
		LoginRateLimitWindowSeconds:      60,
		SchedulerPollSeconds:             10,
		SchedulerLockTTLSeconds:          900,
		SchedulerFailureRetrySeconds:     300,
		SchedulerPipelineIntervalSeconds: 300,
		SchedulerRulesIntervalSeconds:    300,
		SchedulerDispatchIntervalSeconds: 60,
		SchedulerMaxDueJobs:              4,
		SchedulerInitialJitterSeconds:    120,
		SchedulerRescheduleJitterSeconds: 60,
		SchedulerBackfillIntervalSeconds: 60,
		TelegramAPIBaseURL:               "https://api.telegram.org",
		DeepseekAPIBaseURL:               "https://api.deepseek.com",
		DeepseekModel:                    "deepseek-v4-flash",
		AssistantRequestTimeoutSeconds:   20,
		AssistantRateLimitRequests:       30,
		AssistantRateLimitWindowSeconds:  60,
	}
}

// Load reads the shared environment names used by the existing deployment.
func Load() (Config, error) {
	cfg := DefaultConfig()

	cfg.AppName = envOr("APP_NAME", cfg.AppName)
	cfg.AppVersion = envOr("APP_VERSION", cfg.AppVersion)
	cfg.BuildSHA = envOr("BUILD_SHA", cfg.BuildSHA)
	cfg.APIPrefix = envOr("API_PREFIX", cfg.APIPrefix)
	cfg.APIHost = envOr("API_HOST", cfg.APIHost)
	cfg.DatabaseURL = envOr("DATABASE_URL", cfg.DatabaseURL)
	cfg.Timezone = envOr("APP_TIMEZONE", cfg.Timezone)
	cfg.Environment = envOr("APP_ENV", cfg.Environment)
	cfg.DefaultPlace = envOr("DEFAULT_PLACE", cfg.DefaultPlace)
	cfg.FMIAPIBaseURL = envOr("FMI_API_BASE_URL", cfg.FMIAPIBaseURL)
	cfg.HSYWFSURL = envOr("HSY_WFS_URL", cfg.HSYWFSURL)
	cfg.HSYAirQualityLayer = envOr("HSY_AIR_QUALITY_LAYER", cfg.HSYAirQualityLayer)
	cfg.OpenMeteoAirQualityURL = envOr("OPEN_METEO_AIR_QUALITY_URL", cfg.OpenMeteoAirQualityURL)
	cfg.DigitrafficRoadAPIBaseURL = envOr("DIGITRAFFIC_ROAD_API_BASE_URL", cfg.DigitrafficRoadAPIBaseURL)
	cfg.DigitransitHSLAlertsURL = envOr("DIGITRANSIT_HSL_ALERTS_URL", cfg.DigitransitHSLAlertsURL)
	cfg.DigitransitSubscriptionKey = envOr("DIGITRANSIT_SUBSCRIPTION_KEY", cfg.DigitransitSubscriptionKey)
	cfg.FingridAPIBaseURL = envOr("FINGRID_API_BASE_URL", cfg.FingridAPIBaseURL)
	cfg.FingridAPIKey = envOr("FINGRID_API_KEY", cfg.FingridAPIKey)
	cfg.FingridDatasetURL = envOr("FINGRID_DATASET_URL", cfg.FingridDatasetURL)
	cfg.ElectricityPriceAPIURL = envOr("ELECTRICITY_PRICE_API_URL", cfg.ElectricityPriceAPIURL)
	cfg.SYKEHydrologyAPIBaseURL = envOr("SYKE_HYDROLOGY_API_BASE_URL", cfg.SYKEHydrologyAPIBaseURL)
	cfg.ServicemapAPIBaseURL = envOr("SERVICEMAP_API_BASE_URL", cfg.ServicemapAPIBaseURL)
	cfg.LogLevel = envOr("LOG_LEVEL", cfg.LogLevel)
	cfg.LogFormat = envOr("LOG_FORMAT", cfg.LogFormat)
	cfg.RequestIDHeader = envOr("REQUEST_ID_HEADER", cfg.RequestIDHeader)
	cfg.HSYAPIURL = envOr("HSY_API_URL", cfg.HSYAPIURL)
	cfg.DigitransitAPIURL = envOr("DIGITRANSIT_API_URL", cfg.DigitransitAPIURL)
	cfg.DigitransitRoutingURL = envOr("DIGITRANSIT_ROUTING_URL", cfg.DigitransitRoutingURL)
	cfg.DigitrafficUser = envOr("DIGITRAFFIC_USER", cfg.DigitrafficUser)
	cfg.LinkedEventsAPIBaseURL = envOr("LINKEDEVENTS_API_BASE_URL", cfg.LinkedEventsAPIBaseURL)
	cfg.InitialBackfillSources = parseCSV(envOr("INITIAL_BACKFILL_SOURCES", strings.Join(cfg.InitialBackfillSources, ",")))
	cfg.TelegramAPIBaseURL = envOr("TELEGRAM_API_BASE_URL", cfg.TelegramAPIBaseURL)
	cfg.TelegramBotToken = envOr("TELEGRAM_BOT_TOKEN", cfg.TelegramBotToken)
	cfg.TelegramWebhookSecret = envOr("TELEGRAM_WEBHOOK_SECRET", cfg.TelegramWebhookSecret)
	cfg.MetricsBearerToken = envOr("METRICS_BEARER_TOKEN", cfg.MetricsBearerToken)
	cfg.DeepseekAPIKey = envOr("DEEPSEEK_API_KEY", cfg.DeepseekAPIKey)
	cfg.DeepseekAPIBaseURL = envOr("DEEPSEEK_API_BASE_URL", cfg.DeepseekAPIBaseURL)
	cfg.DeepseekModel = envOr("DEEPSEEK_MODEL", cfg.DeepseekModel)
	cfg.AuthTokenSecret = envOr("AUTH_TOKEN_SECRET", cfg.AuthTokenSecret)
	cfg.AuthTokenIssuer = envOr("AUTH_TOKEN_ISSUER", cfg.AuthTokenIssuer)
	cfg.AuthTokenAudience = envOr("AUTH_TOKEN_AUDIENCE", cfg.AuthTokenAudience)
	cfg.AdminUserID = envOr("ADMIN_USER_ID", cfg.AdminUserID)
	cfg.AdminUsername = envOr("ADMIN_USERNAME", cfg.AdminUsername)
	cfg.AdminEmail = envOr("ADMIN_EMAIL", cfg.AdminEmail)
	cfg.AdminPassword = envOr("ADMIN_PASSWORD", cfg.AdminPassword)
	cfg.AdminPasswordHash = envOr("ADMIN_PASSWORD_HASH", cfg.AdminPasswordHash)
	cfg.AdminName = envOr("ADMIN_NAME", cfg.AdminName)
	cfg.HouseholdElectricityProvider = envOr("HOUSEHOLD_ELECTRICITY_PROVIDER", cfg.HouseholdElectricityProvider)
	cfg.CORSOrigins = parseCSV(envOr("BACKEND_CORS_ORIGINS", ""))
	cfg.WeatherPlaces = parseCSV(envOr("WEATHER_PLACES", strings.Join(cfg.WeatherPlaces, ",")))
	cfg.AirQualityPlaces = parseCSV(envOr("AIR_QUALITY_PLACES", strings.Join(cfg.AirQualityPlaces, ",")))
	cfg.OpenMeteoAirQualityLocations = parseCSV(envOr(
		"OPEN_METEO_AIR_QUALITY_LOCATIONS",
		strings.Join(cfg.OpenMeteoAirQualityLocations, ","),
	))
	cfg.LinkedEventsCityAPIBaseURLs = parseCSV(envOr(
		"LINKEDEVENTS_CITY_API_BASE_URLS",
		strings.Join(cfg.LinkedEventsCityAPIBaseURLs, ","),
	))

	var err error
	cfg.APIPort, err = envInt("API_PORT", cfg.APIPort)
	if err != nil {
		return Config{}, err
	}
	cfg.ServicemapRadiusMeters, err = envInt("SERVICEMAP_RADIUS_METERS", cfg.ServicemapRadiusMeters)
	if err != nil {
		return Config{}, err
	}
	cfg.InitialBackfillEnabled, err = envBool("INITIAL_BACKFILL_ENABLED", cfg.InitialBackfillEnabled)
	if err != nil {
		return Config{}, err
	}
	cfg.InitialBackfillDays, err = envInt("INITIAL_BACKFILL_DAYS", cfg.InitialBackfillDays)
	if err != nil {
		return Config{}, err
	}
	cfg.InitialBackfillWindowSeconds, err = envInt("INITIAL_BACKFILL_WINDOW_SECONDS", cfg.InitialBackfillWindowSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.BackfillDefaultWindowSeconds, err = envInt("BACKFILL_DEFAULT_WINDOW_SECONDS", cfg.BackfillDefaultWindowSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.BackfillMaxDueWindows, err = envInt("BACKFILL_MAX_DUE_WINDOWS", cfg.BackfillMaxDueWindows)
	if err != nil {
		return Config{}, err
	}
	cfg.BackfillMaxWindowRetries, err = envInt("BACKFILL_MAX_WINDOW_RETRIES", cfg.BackfillMaxWindowRetries)
	if err != nil {
		return Config{}, err
	}
	cfg.BackfillWindowLockTTLSeconds, err = envInt("BACKFILL_WINDOW_LOCK_TTL_SECONDS", cfg.BackfillWindowLockTTLSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.DataRetentionEnabled, err = envBool("DATA_RETENTION_ENABLED", cfg.DataRetentionEnabled)
	if err != nil {
		return Config{}, err
	}
	cfg.MetricsEnabled, err = envBool("METRICS_ENABLED", cfg.MetricsEnabled)
	if err != nil {
		return Config{}, err
	}
	cfg.RequestLoggingEnabled, err = envBool("REQUEST_LOGGING_ENABLED", cfg.RequestLoggingEnabled)
	if err != nil {
		return Config{}, err
	}
	cfg.ReadCacheTTLSeconds, err = envInt("READ_CACHE_TTL_SECONDS", cfg.ReadCacheTTLSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.NormalizationBatchSize, err = envInt("NORMALIZATION_BATCH_SIZE", cfg.NormalizationBatchSize)
	if err != nil {
		return Config{}, err
	}
	cfg.NormalizationLookbackHours, err = envInt("NORMALIZATION_LOOKBACK_HOURS", cfg.NormalizationLookbackHours)
	if err != nil {
		return Config{}, err
	}
	cfg.SnapshotLookaheadHours, err = envInt("SNAPSHOT_LOOKAHEAD_HOURS", cfg.SnapshotLookaheadHours)
	if err != nil {
		return Config{}, err
	}
	cfg.DigitrafficMaxFeaturesPerType, err = envInt("DIGITRAFFIC_MAX_FEATURES_PER_TYPE", cfg.DigitrafficMaxFeaturesPerType)
	if err != nil {
		return Config{}, err
	}
	cfg.DigitrafficHistoryStationLimit, err = envInt("DIGITRAFFIC_HISTORY_STATION_LIMIT", cfg.DigitrafficHistoryStationLimit)
	if err != nil {
		return Config{}, err
	}
	cfg.LinkedEventsLookaheadDays, err = envInt("LINKEDEVENTS_LOOKAHEAD_DAYS", cfg.LinkedEventsLookaheadDays)
	if err != nil {
		return Config{}, err
	}
	cfg.LinkedEventsMaxPages, err = envInt("LINKEDEVENTS_MAX_PAGES", cfg.LinkedEventsMaxPages)
	if err != nil {
		return Config{}, err
	}
	cfg.LinkedEventsPageSize, err = envInt("LINKEDEVENTS_PAGE_SIZE", cfg.LinkedEventsPageSize)
	if err != nil {
		return Config{}, err
	}
	cfg.SYKEHydrologyStationLimit, err = envInt("SYKE_HYDROLOGY_STATION_LIMIT", cfg.SYKEHydrologyStationLimit)
	if err != nil {
		return Config{}, err
	}
	cfg.SYKEHydrologyObservationLimit, err = envInt("SYKE_HYDROLOGY_OBSERVATION_LIMIT", cfg.SYKEHydrologyObservationLimit)
	if err != nil {
		return Config{}, err
	}
	cfg.SYKEHydrologyBackfillObsLimit, err = envInt("SYKE_HYDROLOGY_BACKFILL_OBSERVATION_LIMIT", cfg.SYKEHydrologyBackfillObsLimit)
	if err != nil {
		return Config{}, err
	}
	cfg.RawObservationRetentionDays, err = envInt("RAW_OBSERVATION_RETENTION_DAYS", cfg.RawObservationRetentionDays)
	if err != nil {
		return Config{}, err
	}
	cfg.NormalizedEventRetentionDays, err = envInt("NORMALIZED_EVENT_RETENTION_DAYS", cfg.NormalizedEventRetentionDays)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerRunRetentionDays, err = envInt("SCHEDULER_RUN_RETENTION_DAYS", cfg.SchedulerRunRetentionDays)
	if err != nil {
		return Config{}, err
	}
	cfg.TelegramWebhookRetentionDays, err = envInt("TELEGRAM_WEBHOOK_RETENTION_DAYS", cfg.TelegramWebhookRetentionDays)
	if err != nil {
		return Config{}, err
	}
	cfg.RawObservationPartitionMonths, err = envInt("RAW_OBSERVATION_PARTITION_MONTHS", cfg.RawObservationPartitionMonths)
	if err != nil {
		return Config{}, err
	}
	cfg.ServicemapMaxUnits, err = envInt("SERVICEMAP_MAX_UNITS", cfg.ServicemapMaxUnits)
	if err != nil {
		return Config{}, err
	}
	cfg.CollectorTimeoutSeconds, err = envFloat("COLLECTOR_TIMEOUT_SECONDS", cfg.CollectorTimeoutSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.AuthTokenTTLMinutes, err = envInt("AUTH_TOKEN_TTL_MINUTES", cfg.AuthTokenTTLMinutes)
	if err != nil {
		return Config{}, err
	}
	cfg.LoginRateLimitRequests, err = envInt("LOGIN_RATE_LIMIT_REQUESTS", cfg.LoginRateLimitRequests)
	if err != nil {
		return Config{}, err
	}
	cfg.LoginRateLimitWindowSeconds, err = envInt("LOGIN_RATE_LIMIT_WINDOW_SECONDS", cfg.LoginRateLimitWindowSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerPollSeconds, err = envFloat("SCHEDULER_POLL_SECONDS", cfg.SchedulerPollSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerLockTTLSeconds, err = envInt("SCHEDULER_LOCK_TTL_SECONDS", cfg.SchedulerLockTTLSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerFailureRetrySeconds, err = envInt("SCHEDULER_FAILURE_RETRY_SECONDS", cfg.SchedulerFailureRetrySeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerPipelineIntervalSeconds, err = envInt("SCHEDULER_PIPELINE_INTERVAL_SECONDS", cfg.SchedulerPipelineIntervalSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerRulesIntervalSeconds, err = envInt("SCHEDULER_RULES_INTERVAL_SECONDS", cfg.SchedulerRulesIntervalSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerDispatchIntervalSeconds, err = envInt("SCHEDULER_DISPATCH_INTERVAL_SECONDS", cfg.SchedulerDispatchIntervalSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerMaxDueJobs, err = envInt("SCHEDULER_MAX_DUE_JOBS", cfg.SchedulerMaxDueJobs)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerInitialJitterSeconds, err = envInt("SCHEDULER_INITIAL_JITTER_SECONDS", cfg.SchedulerInitialJitterSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerRescheduleJitterSeconds, err = envInt("SCHEDULER_RESCHEDULE_JITTER_SECONDS", cfg.SchedulerRescheduleJitterSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.SchedulerBackfillIntervalSeconds, err = envInt("SCHEDULER_BACKFILL_INTERVAL_SECONDS", cfg.SchedulerBackfillIntervalSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.AssistantRequestTimeoutSeconds, err = envFloat("ASSISTANT_REQUEST_TIMEOUT_SECONDS", cfg.AssistantRequestTimeoutSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.AssistantRateLimitRequests, err = envInt("ASSISTANT_RATE_LIMIT_REQUESTS", cfg.AssistantRateLimitRequests)
	if err != nil {
		return Config{}, err
	}
	cfg.AssistantRateLimitWindowSeconds, err = envInt("ASSISTANT_RATE_LIMIT_WINDOW_SECONDS", cfg.AssistantRateLimitWindowSeconds)
	if err != nil {
		return Config{}, err
	}
	cfg.HouseholdUsageKWh, err = envFloat("HOUSEHOLD_USAGE_KWH", cfg.HouseholdUsageKWh)
	if err != nil {
		return Config{}, err
	}
	cfg.HouseholdPriceMarginCents, err = envFloat("HOUSEHOLD_PRICE_MARGIN_CENTS_PER_KWH", cfg.HouseholdPriceMarginCents)
	if err != nil {
		return Config{}, err
	}
	cfg.HouseholdTransferCents, err = envFloat("HOUSEHOLD_TRANSFER_CENTS_PER_KWH", cfg.HouseholdTransferCents)
	if err != nil {
		return Config{}, err
	}
	cfg.DefaultLat, err = envFloat("DEFAULT_LAT", cfg.DefaultLat)
	if err != nil {
		return Config{}, err
	}
	cfg.DefaultLon, err = envFloat("DEFAULT_LON", cfg.DefaultLon)
	if err != nil {
		return Config{}, err
	}
	cfg.FingridDatasetID, err = envInt("FINGRID_DATASET_ID", cfg.FingridDatasetID)
	if err != nil {
		return Config{}, err
	}
	cfg.FingridForecastHorizonHours, err = envInt("FINGRID_FORECAST_HORIZON_HOURS", cfg.FingridForecastHorizonHours)
	if err != nil {
		return Config{}, err
	}
	cfg.FingridPageSize, err = envInt("FINGRID_PAGE_SIZE", cfg.FingridPageSize)
	if err != nil {
		return Config{}, err
	}
	if cfg.AppName == "" || cfg.AppVersion == "" || cfg.BuildSHA == "" || cfg.Timezone == "" {
		return Config{}, fmt.Errorf("APP_NAME, APP_VERSION, BUILD_SHA, and APP_TIMEZONE must not be empty")
	}
	if cfg.APIPort < 1 || cfg.APIPort > 65535 {
		return Config{}, fmt.Errorf("API_PORT must be between 1 and 65535")
	}
	if cfg.AuthTokenTTLMinutes <= 0 || cfg.LoginRateLimitRequests <= 0 || cfg.LoginRateLimitWindowSeconds <= 0 || cfg.HouseholdUsageKWh <= 0 || cfg.AssistantRequestTimeoutSeconds <= 0 || cfg.AssistantRateLimitRequests <= 0 || cfg.AssistantRateLimitWindowSeconds <= 0 {
		return Config{}, fmt.Errorf("authentication and rate-limit settings must be greater than 0")
	}
	if strings.EqualFold(strings.TrimSpace(cfg.Environment), "production") || strings.EqualFold(strings.TrimSpace(cfg.Environment), "prod") {
		if cfg.AdminPasswordHash == "" {
			if _, weak := weakAdminPasswords[strings.ToLower(strings.TrimSpace(cfg.AdminPassword))]; weak || len(cfg.AdminPassword) < 12 {
				return Config{}, fmt.Errorf("production ADMIN_PASSWORD must be at least 12 characters or ADMIN_PASSWORD_HASH must be configured")
			}
		}
		if _, weak := weakAuthTokenSecrets[strings.ToLower(strings.TrimSpace(cfg.AuthTokenSecret))]; weak || len(cfg.AuthTokenSecret) < 32 {
			return Config{}, fmt.Errorf("production AUTH_TOKEN_SECRET must be a strong secret")
		}
		if strings.TrimSpace(cfg.MetricsBearerToken) == "" {
			return Config{}, fmt.Errorf("production metrics require METRICS_BEARER_TOKEN")
		}
		if hasValue(cfg.CORSOrigins, "*") {
			return Config{}, fmt.Errorf("production BACKEND_CORS_ORIGINS must list explicit origins")
		}
		if strings.TrimSpace(cfg.TelegramBotToken) != "" && strings.TrimSpace(cfg.TelegramWebhookSecret) == "" {
			return Config{}, fmt.Errorf("production Telegram webhooks require TELEGRAM_WEBHOOK_SECRET")
		}
	}
	if !strings.HasPrefix(cfg.APIPrefix, "/") {
		return Config{}, fmt.Errorf("API_PREFIX must start with '/'")
	}
	cfg.APIPrefix = strings.TrimRight(cfg.APIPrefix, "/")
	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "/"
	}

	return cfg, nil
}

func (c Config) Address() string {
	return fmt.Sprintf("%s:%d", c.APIHost, c.APIPort)
}

func envOr(key, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	return strings.TrimSpace(value)
}

func envInt(key string, fallback int) (int, error) {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	return parsed, nil
}

func envBool(key string, fallback bool) (bool, error) {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(strings.TrimSpace(value))
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return parsed, nil
}

func envFloat(key string, fallback float64) (float64, error) {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number: %w", key, err)
	}
	return parsed, nil
}

func parseCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	items := strings.Split(value, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func hasValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
