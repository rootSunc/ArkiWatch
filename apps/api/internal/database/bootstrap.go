package database

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type sourceSeed struct {
	Code     string
	Name     string
	Endpoint string
	AuthType string
	Interval int
	Active   bool
}

type ruleSeed struct {
	Code     string
	Name     string
	Scenario string
	Severity string
	Cooldown int
	Events   []string
}

// SeedOperationalMetadata owns the rows required by Go runtime code. Schema
// creation and migrations remain a separate lifecycle step.
func (store *Store) SeedOperationalMetadata(ctx context.Context, cfg config.Config) (int, int, error) {
	sources := []sourceSeed{
		{Code: "fmi", Name: "Finnish Meteorological Institute", Endpoint: cfg.FMIAPIBaseURL, Interval: 1800, Active: true},
		{Code: "digitransit", Name: "Digitransit / HSL", Endpoint: cfg.DigitransitHSLAlertsURL, Interval: 600, Active: true},
		{Code: "fingrid", Name: "Fingrid", Endpoint: nonEmpty(cfg.FingridDatasetURL, fmt.Sprintf("%s/datasets/%d/data", cfg.FingridAPIBaseURL, cfg.FingridDatasetID)), AuthType: "API_KEY", Interval: 3600, Active: true},
		{Code: "porssisahko", Name: "Porssisahko.net", Endpoint: cfg.ElectricityPriceAPIURL, Interval: 43200, Active: true},
		{Code: "hsy", Name: "HSY Air Quality", Endpoint: cfg.HSYWFSURL, Interval: 1800, Active: true},
		{Code: "open_meteo_air", Name: "Open-Meteo Air Quality", Endpoint: cfg.OpenMeteoAirQualityURL, Interval: 1800, Active: true},
		{Code: "digitraffic", Name: "Fintraffic Digitraffic", Endpoint: cfg.DigitrafficRoadAPIBaseURL, Interval: 600, Active: true},
		{Code: "syke", Name: "Finnish Environment Institute", Endpoint: "https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata", Interval: 14400, Active: true},
		{Code: "servicemap", Name: "Helsinki Service Map", Endpoint: "https://www.hel.fi/palvelukarttaws/rest/v4", Interval: 21600, Active: true},
		{Code: "linkedevents", Name: "Linked Events city APIs", Endpoint: "https://api.hel.fi/linkedevents/v1", Interval: 21600, Active: true},
	}
	for index := range sources {
		if sources[index].AuthType == "" {
			sources[index].AuthType = "NONE"
		}
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO data_sources
				(id, source_code, source_name, endpoint, auth_type, poll_interval_seconds, is_active)
			VALUES ($1, $2, $3, $4, $5::source_auth_type, $6, $7)
			ON CONFLICT (source_code) DO UPDATE SET
				source_name = EXCLUDED.source_name,
				endpoint = EXCLUDED.endpoint,
				auth_type = EXCLUDED.auth_type,
				poll_interval_seconds = EXCLUDED.poll_interval_seconds,
				is_active = EXCLUDED.is_active
		`, randomID(), sources[index].Code, sources[index].Name, sources[index].Endpoint, sources[index].AuthType, sources[index].Interval, sources[index].Active); err != nil {
			return 0, 0, err
		}
	}

	rules := []ruleSeed{
		{Code: "R1_RAIN_RISK", Name: "Rain risk advice", Scenario: "weather", Severity: "HIGH", Cooldown: 720, Events: []string{"rain_risk"}},
		{Code: "R2_WEATHER_OUTLOOK", Name: "Weather outlook summary", Scenario: "weather", Severity: "LOW", Cooldown: 720, Events: []string{"weather_outlook"}},
		{Code: "R10_AIR_QUALITY_POOR", Name: "Poor air quality advice", Scenario: "air", Severity: "MEDIUM", Cooldown: 180, Events: []string{"air_quality_poor"}},
		{Code: "R11_AIR_QUALITY_STATUS", Name: "Air quality status summary", Scenario: "air", Severity: "LOW", Cooldown: 360, Events: []string{"air_quality_status"}},
		{Code: "R20_COMMUTE_DISRUPTION", Name: "Personal commute disruption advice", Scenario: "commute", Severity: "HIGH", Cooldown: 90, Events: []string{"transit_delay", "transit_disruption"}},
		{Code: "R30_ENERGY_WINDOW", Name: "Personal energy timing advice", Scenario: "energy", Severity: "LOW", Cooldown: 240, Events: []string{"cheap_energy_window"}},
		{Code: "PR_TRANSIT_DISRUPTION", Name: "Public commute disruption advice", Scenario: "commute", Severity: "HIGH", Cooldown: 90, Events: []string{"transit_delay", "transit_disruption"}},
		{Code: "PR_WEATHER_OUTDOOR", Name: "Public outdoor timing advice", Scenario: "outdoor", Severity: "MEDIUM", Cooldown: 180, Events: []string{"rain_risk", "weather_outlook"}},
		{Code: "PR_HOME_AIR", Name: "Public ventilation advice", Scenario: "home_air", Severity: "MEDIUM", Cooldown: 180, Events: []string{"air_quality_poor", "air_quality_status"}},
		{Code: "PR_ENERGY_WINDOW", Name: "Public energy timing advice", Scenario: "energy", Severity: "LOW", Cooldown: 240, Events: []string{"cheap_energy_window"}},
	}
	for _, rule := range rules {
		payload, err := json.Marshal(map[string]any{"event_types": rule.Events})
		if err != nil {
			return len(sources), 0, err
		}
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO rule_definitions
				(id, rule_code, rule_name, scenario, version, is_active, severity, cooldown_minutes, config)
			VALUES ($1, $2, $3, $4, 1, TRUE, $5::rule_severity, $6, $7::jsonb)
			ON CONFLICT (rule_code) DO UPDATE SET
				rule_name = EXCLUDED.rule_name,
				scenario = EXCLUDED.scenario,
				version = EXCLUDED.version,
				is_active = EXCLUDED.is_active,
				severity = EXCLUDED.severity,
				cooldown_minutes = EXCLUDED.cooldown_minutes,
				config = EXCLUDED.config,
				updated_at = now()
		`, randomID(), rule.Code, rule.Name, rule.Scenario, rule.Severity, rule.Cooldown, payload); err != nil {
			return len(sources), 0, err
		}
	}
	return len(sources), len(rules), nil
}

func nonEmpty(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
