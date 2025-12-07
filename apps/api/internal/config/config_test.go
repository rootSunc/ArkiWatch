package config

import "testing"

func TestLoadReadsSharedEnvironmentNames(t *testing.T) {
	t.Setenv("APP_NAME", "Test ArkiWatch")
	t.Setenv("API_PORT", "8123")
	t.Setenv("BACKEND_CORS_ORIGINS", "http://localhost:3000, https://example.test")
	t.Setenv("WEATHER_PLACES", "helsinki=Helsinki, tampere=Tampere")
	t.Setenv("OTEL_ENABLED", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.AppName != "Test ArkiWatch" || cfg.APIPort != 8123 {
		t.Fatalf("unexpected basic config: %+v", cfg)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[1] != "https://example.test" {
		t.Fatalf("unexpected CORS origins: %#v", cfg.CORSOrigins)
	}
	if len(cfg.WeatherPlaces) != 2 || cfg.WeatherPlaces[1] != "tampere=Tampere" {
		t.Fatalf("unexpected weather places: %#v", cfg.WeatherPlaces)
	}
	if !cfg.MetricsEnabled || !cfg.RequestLoggingEnabled {
		t.Fatal("metrics and request logging should default to enabled")
	}
}

// Every documented key must reach a field, and every field must have a sane
// default, so an installation that sets nothing still starts correctly.
func TestLoadAppliesRetentionAndBackfillDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DataRetentionEnabled {
		t.Fatal("data retention must be opt-in")
	}
	if cfg.InitialBackfillEnabled {
		t.Fatal("initial backfill must be opt-in")
	}
	if cfg.RawObservationRetentionDays <= 0 || cfg.NormalizedEventRetentionDays <= 0 {
		t.Fatalf("retention windows must be positive: %+v", cfg)
	}
	if cfg.RawObservationPartitionMonths < 1 {
		t.Fatalf("at least the current month must be provisioned: %d", cfg.RawObservationPartitionMonths)
	}
	if cfg.NormalizationLookbackHours <= 0 || cfg.NormalizationBatchSize <= 0 {
		t.Fatalf("normalization tuning must be positive: %+v", cfg)
	}
	if cfg.CollectorTimeoutSeconds <= 0 {
		t.Fatalf("collector timeout must be positive: %v", cfg.CollectorTimeoutSeconds)
	}
}

func TestLoadReadsRetentionOverrides(t *testing.T) {
	t.Setenv("DATA_RETENTION_ENABLED", "true")
	t.Setenv("RAW_OBSERVATION_RETENTION_DAYS", "7")
	t.Setenv("SERVICEMAP_MAX_UNITS", "5")
	t.Setenv("LINKEDEVENTS_PAGE_SIZE", "11")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.DataRetentionEnabled || cfg.RawObservationRetentionDays != 7 {
		t.Fatalf("retention overrides were ignored: %+v", cfg)
	}
	if cfg.ServicemapMaxUnits != 5 || cfg.LinkedEventsPageSize != 11 {
		t.Fatalf("collector overrides were ignored: %+v", cfg)
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	t.Setenv("API_PORT", "not-a-port")
	if _, err := Load(); err == nil {
		t.Fatal("Load() unexpectedly accepted an invalid port")
	}
}

func TestLoadRejectsWeakProductionSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("ADMIN_PASSWORD", "admin")
	t.Setenv("AUTH_TOKEN_SECRET", "dev-only-arkiwatch-auth-secret")
	t.Setenv("METRICS_BEARER_TOKEN", "metrics")
	if _, err := Load(); err == nil {
		t.Fatal("Load() unexpectedly accepted weak production secrets")
	}
}

func TestLoadAcceptsConfiguredProductionSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("ADMIN_PASSWORD", "a-long-production-password")
	t.Setenv("AUTH_TOKEN_SECRET", "a-production-secret-that-is-at-least-32-chars")
	t.Setenv("METRICS_BEARER_TOKEN", "metrics")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Environment != "production" {
		t.Fatalf("unexpected environment: %q", cfg.Environment)
	}
}
