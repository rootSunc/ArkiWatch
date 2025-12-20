package collectors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestOpenMeteoRangeUsesHourlyWindowAndBuildsCurrentValue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("hourly") == "" || request.URL.Query().Get("start_date") == "" || request.URL.Query().Get("end_date") == "" {
			t.Fatalf("missing historical query: %s", request.URL.RawQuery)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"hourly":{"time":["2026-08-20T12:00","2026-08-20T13:00"],"european_aqi":[22,31],"pm10":[4,5],"pm2_5":[2,3],"nitrogen_dioxide":[8,9]}}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.OpenMeteoAirQualityURL = server.URL
	cfg.OpenMeteoAirQualityLocations = []string{"helsinki=Helsinki|60.1699|24.9384"}
	collector := openMeteoCollector{cfg: cfg}
	items, err := collector.CollectRange(context.Background(), time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC), time.Date(2026, 8, 21, 0, 0, 0, 0, time.UTC), "helsinki", "cursor-1")
	if err != nil {
		t.Fatalf("collect range: %v", err)
	}
	if len(items) != 1 || items[0].AreaCode != "helsinki" || items[0].ObservedAt.Hour() != 0 {
		t.Fatalf("unexpected observations: %#v", items)
	}
	current, ok := items[0].Payload["body"].(map[string]any)["current"].(map[string]any)
	if !ok || current["european_aqi"] != float64(31) || items[0].Payload["cursor"] != "cursor-1" {
		t.Fatalf("unexpected current payload: %#v", items[0].Payload)
	}
}

func TestHistoricalPriceURLReplacesLatestEndpoint(t *testing.T) {
	value, err := historicalPriceURL("https://api.porssisahko.net/v2/latest-prices.json")
	if err != nil {
		t.Fatalf("historical price URL: %v", err)
	}
	if value != "https://api.porssisahko.net/v2/price.json" {
		t.Fatalf("URL = %q", value)
	}
}
