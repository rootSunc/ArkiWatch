package platform

import (
	"sort"
	"strings"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type CityPack struct {
	CityRef             string            `json:"city_ref"`
	Label               string            `json:"label"`
	Region              string            `json:"region"`
	CoverageArea        string            `json:"coverage_area"`
	Latitude            float64           `json:"latitude"`
	Longitude           float64           `json:"longitude"`
	Signals             map[string]string `json:"signals"`
	RecommendationScope string            `json:"recommendation_scope"`
	Configured          bool              `json:"configured"` // At least one city-specific feed is configured; not every signal.
}

type Coverage struct {
	DefaultCity string     `json:"default_city"`
	Cities      []CityPack `json:"cities"`
}

type cityPackDefinition struct {
	cityRef             string
	label               string
	region              string
	latitude            float64
	longitude           float64
	signals             map[string]string
	recommendationScope string
}

var cityPackDefinitions = []cityPackDefinition{
	{
		cityRef: "helsinki", label: "Helsinki", region: "Uusimaa", latitude: 60.1699, longitude: 24.9384,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "supported", "water": "supported", "city_services": "supported", "events": "supported"}, recommendationScope: "regional",
	},
	{
		cityRef: "espoo", label: "Espoo", region: "Uusimaa", latitude: 60.2055, longitude: 24.6559,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "supported", "water": "supported", "city_services": "planned", "events": "supported"}, recommendationScope: "regional",
	},
	{
		cityRef: "vantaa", label: "Vantaa", region: "Uusimaa", latitude: 60.2934, longitude: 25.0378,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "supported", "water": "supported", "city_services": "planned", "events": "planned"}, recommendationScope: "regional",
	},
	{
		cityRef: "tampere", label: "Tampere", region: "Pirkanmaa", latitude: 61.4978, longitude: 23.761,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "planned", "water": "supported", "city_services": "planned", "events": "planned"}, recommendationScope: "regional-only",
	},
	{
		cityRef: "turku", label: "Turku", region: "Southwest Finland", latitude: 60.4518, longitude: 22.2666,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "planned", "water": "supported", "city_services": "planned", "events": "planned"}, recommendationScope: "regional-only",
	},
	{
		cityRef: "oulu", label: "Oulu", region: "North Ostrobothnia", latitude: 65.0121, longitude: 25.4651,
		signals: map[string]string{"weather": "supported", "air": "supported", "transit": "planned", "water": "supported", "city_services": "planned", "events": "planned"}, recommendationScope: "regional-only",
	},
}

var coverageAreas = map[string]string{
	"helsinki": "Helsinki/Uusimaa",
	"espoo":    "Espoo/Uusimaa",
	"vantaa":   "Vantaa/Uusimaa",
	"tampere":  "Tampere/Pirkanmaa",
	"turku":    "Turku/Southwest Finland",
	"oulu":     "Oulu/North Ostrobothnia",
}

func BuildCoverage(cfg config.Config) Coverage {
	configured := configuredCityRefs(cfg)
	cities := make([]CityPack, 0, len(cityPackDefinitions))
	for _, pack := range cityPackDefinitions {
		cities = append(cities, CityPack{
			CityRef:             pack.cityRef,
			Label:               pack.label,
			Region:              pack.region,
			CoverageArea:        coverageArea(pack.cityRef),
			Latitude:            pack.latitude,
			Longitude:           pack.longitude,
			Signals:             cloneSignals(pack.signals),
			RecommendationScope: pack.recommendationScope,
			Configured:          configured[pack.cityRef],
		})
	}
	return Coverage{DefaultCity: normalizeCityRef(cfg.DefaultPlace, cfg.DefaultPlace), Cities: cities}
}

func NormalizeCityRef(value, fallback string) string {
	return normalizeCityRef(value, fallback)
}

// CapitalRegionCityRefs returns the Helsinki metropolitan municipalities shared
// by regional HSY air-quality and HSL Digitransit feeds.
func CapitalRegionCityRefs() []string {
	return []string{"helsinki", "espoo", "vantaa"}
}

func IsCapitalRegionCity(cityRef string) bool {
	switch normalizeCityRef(cityRef, "") {
	case "helsinki", "espoo", "vantaa":
		return true
	default:
		return false
	}
}

func SupportedCityRefs(cfg config.Config) []string {
	items := []string{cfg.DefaultPlace}
	items = append(items, cfg.WeatherPlaces...)
	items = append(items, cfg.AirQualityPlaces...)
	items = append(items, cfg.OpenMeteoAirQualityLocations...)
	items = append(items, cfg.LinkedEventsCityAPIBaseURLs...)
	set := make(map[string]struct{}, len(items))
	for _, item := range items {
		if ref := normalizeCityRef(entryKey(item), cfg.DefaultPlace); ref != "" {
			set[ref] = struct{}{}
		}
	}
	refs := make([]string, 0, len(set))
	for ref := range set {
		refs = append(refs, ref)
	}
	sort.Strings(refs)
	return refs
}

func configuredCityRefs(cfg config.Config) map[string]bool {
	configured := make(map[string]bool)
	items := []string{cfg.DefaultPlace}
	items = append(items, cfg.WeatherPlaces...)
	items = append(items, cfg.AirQualityPlaces...)
	items = append(items, cfg.OpenMeteoAirQualityLocations...)
	items = append(items, cfg.LinkedEventsCityAPIBaseURLs...)
	for _, item := range items {
		if ref := normalizeCityRef(entryKey(item), cfg.DefaultPlace); ref != "" {
			configured[ref] = true
		}
	}
	return configured
}

func entryKey(value string) string {
	if key, _, ok := strings.Cut(value, "="); ok {
		return key
	}
	return value
}

func normalizeCityRef(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		value = strings.TrimSpace(fallback)
	}
	return strings.ReplaceAll(strings.ToLower(value), " ", "_")
}

func coverageArea(cityRef string) string {
	if area, ok := coverageAreas[cityRef]; ok {
		return area
	}
	words := strings.Split(strings.ReplaceAll(cityRef, "_", " "), " ")
	for i, word := range words {
		if word != "" {
			words[i] = strings.ToUpper(word[:1]) + word[1:]
		}
	}
	return strings.Join(words, " ")
}

func cloneSignals(signals map[string]string) map[string]string {
	copyOfSignals := make(map[string]string, len(signals))
	for key, value := range signals {
		copyOfSignals[key] = value
	}
	return copyOfSignals
}
