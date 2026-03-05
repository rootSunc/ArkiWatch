package platform

import (
	"testing"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestBuildCoverageMirrorsConfiguredCitySemantics(t *testing.T) {
	cfg := config.DefaultConfig()
	coverage := BuildCoverage(cfg)
	if coverage.DefaultCity != "helsinki" {
		t.Fatalf("DefaultCity = %q, want helsinki", coverage.DefaultCity)
	}
	if len(coverage.Cities) != 6 {
		t.Fatalf("city count = %d, want 6", len(coverage.Cities))
	}

	byRef := make(map[string]CityPack, len(coverage.Cities))
	for _, city := range coverage.Cities {
		byRef[city.CityRef] = city
	}
	if byRef["helsinki"].CoverageArea != "Helsinki/Uusimaa" {
		t.Fatalf("Helsinki coverage area = %q", byRef["helsinki"].CoverageArea)
	}
	if byRef["tampere"].Signals["transit"] != "planned" {
		t.Fatalf("Tampere transit signal = %q", byRef["tampere"].Signals["transit"])
	}
	if byRef["tampere"].RecommendationScope != "regional-only" {
		t.Fatalf("Tampere recommendation scope = %q", byRef["tampere"].RecommendationScope)
	}
}

func TestBuildCoverageSeparatesConfiguredSourcesFromCatalog(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.DefaultPlace = "Vaasa"
	cfg.WeatherPlaces = []string{"vaasa=Vaasa"}
	cfg.OpenMeteoAirQualityLocations = nil
	cfg.LinkedEventsCityAPIBaseURLs = nil
	coverage := BuildCoverage(cfg)
	for _, city := range coverage.Cities {
		if city.Configured {
			t.Fatalf("unexpected configured catalog city: %s", city.CityRef)
		}
	}
}
