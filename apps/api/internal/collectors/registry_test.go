package collectors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
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

func TestFMICollectQueriesEachConfiguredPlaceWithForecastParameters(t *testing.T) {
	var mu sync.Mutex
	seenQueries := map[string]url.Values{}

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		place := request.URL.Query().Get("place")
		mu.Lock()
		seenQueries[place] = request.URL.Query()
		mu.Unlock()
		writer.Header().Set("Content-Type", "text/xml")
		_, _ = writer.Write([]byte("<FeatureCollection>stub-" + place + "</FeatureCollection>"))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.FMIAPIBaseURL = server.URL
	cfg.WeatherPlaces = []string{"helsinki=Helsinki", "espoo=Espoo"}

	items, err := (fmiCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected one observation per configured place, got %d: %#v", len(items), items)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, place := range []string{"Helsinki", "Espoo"} {
		query, ok := seenQueries[place]
		if !ok {
			t.Fatalf("expected a request for place %q, saw %v", place, seenQueries)
		}
		if query.Get("storedquery_id") != "fmi::forecast::harmonie::surface::point::timevaluepair" || query.Get("timestep") != "60" {
			t.Fatalf("unexpected forecast query for %q: %v", place, query)
		}
	}

	byArea := map[string]Observation{}
	for _, item := range items {
		byArea[item.AreaCode] = item
	}
	for _, area := range []string{"helsinki", "espoo"} {
		item, ok := byArea[area]
		if !ok || item.Dataset != "weather_forecast_raw" || len(item.Hash) != 64 {
			t.Fatalf("unexpected observation for %s: %#v (present=%v)", area, item, ok)
		}
		body, ok := item.Payload["body"].(map[string]any)
		if !ok || body["raw"] == nil {
			t.Fatalf("expected the non-JSON FMI response to fall back to a raw string body: %#v", item.Payload["body"])
		}
	}
}

func TestFMICollectContinuesPastOneFailingPlaceButErrorsWhenAllFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("place") == "Espoo" {
			http.Error(writer, "boom", http.StatusInternalServerError)
			return
		}
		writer.Header().Set("Content-Type", "text/xml")
		_, _ = writer.Write([]byte("<FeatureCollection>ok</FeatureCollection>"))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.FMIAPIBaseURL = server.URL
	cfg.WeatherPlaces = []string{"helsinki=Helsinki", "espoo=Espoo"}

	items, err := (fmiCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("expected Collect to succeed when at least one place works, got: %v", err)
	}
	if len(items) != 1 || items[0].AreaCode != "helsinki" {
		t.Fatalf("expected only the successful helsinki observation, got %#v", items)
	}

	cfg.WeatherPlaces = []string{"espoo=Espoo"}
	if _, err := (fmiCollector{cfg: cfg}).Collect(context.Background()); err == nil {
		t.Fatal("expected an error when every configured place fails")
	}
}

func TestFMICollectRangeRejectsNonPositiveWindow(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)
	if _, err := (fmiCollector{cfg: cfg}).CollectRange(context.Background(), now, now, "", ""); err == nil {
		t.Fatal("expected an error when the window end does not come after the start")
	}
}

func TestFMICollectRangeFiltersToRequestedAreaCode(t *testing.T) {
	var mu sync.Mutex
	var seenPlaces []string

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		seenPlaces = append(seenPlaces, request.URL.Query().Get("place"))
		mu.Unlock()
		writer.Header().Set("Content-Type", "text/xml")
		_, _ = writer.Write([]byte("<FeatureCollection>history</FeatureCollection>"))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.FMIAPIBaseURL = server.URL
	cfg.WeatherPlaces = []string{"helsinki=Helsinki", "espoo=Espoo"}
	start := time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 11, 0, 0, 0, 0, time.UTC)

	items, err := (fmiCollector{cfg: cfg}).CollectRange(context.Background(), start, end, "espoo", "cursor-9")
	if err != nil {
		t.Fatalf("collect range: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(seenPlaces) != 1 || seenPlaces[0] != "Espoo" {
		t.Fatalf("expected only Espoo to be queried when filtered by areaCode, got %v", seenPlaces)
	}
	if len(items) != 1 || items[0].AreaCode != "espoo" || items[0].Payload["cursor"] != "cursor-9" {
		t.Fatalf("unexpected filtered range observation: %#v", items)
	}
}

func TestPorssisahkoCollectSetsPriceMetadataOnLatestFetch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"prices":[{"price":5.0}]}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.ElectricityPriceAPIURL = server.URL

	items, err := (porssisahkoCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if len(items) != 1 || items[0].AreaCode != strings.ToLower(cfg.DefaultPlace) {
		t.Fatalf("unexpected observation: %#v", items)
	}
	payload := items[0].Payload
	if payload["unit"] != "c/kWh" || payload["price_kind"] != "spot_energy_price" || payload["includes_vat"] != true {
		t.Fatalf("expected price metadata to be stamped on the payload: %#v", payload)
	}
	body, ok := payload["body"].(map[string]any)
	if !ok || body["prices"] == nil {
		t.Fatalf("expected the fetched prices body to be preserved: %#v", payload["body"])
	}
}

func TestPorssisahkoCollectRangeFetchesOnePerHourAndAggregates(t *testing.T) {
	var mu sync.Mutex
	var seenHours []string

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		seenHours = append(seenHours, request.URL.Query().Get("hour"))
		mu.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"price":1.0}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.ElectricityPriceAPIURL = server.URL // no "/v2/" in the path -> the date+hour query form
	cfg.Timezone = "Europe/Helsinki"
	start := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC) // exactly on an hour boundary
	end := start.Add(3 * time.Hour)

	items, err := (porssisahkoCollector{cfg: cfg}).CollectRange(context.Background(), start, end, "", "cursor-7")
	if err != nil {
		t.Fatalf("collect range: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if !reflect.DeepEqual(seenHours, []string{"2", "3", "4"}) {
		t.Fatalf("expected one request per Helsinki-local hour in the window, got %v", seenHours)
	}
	if len(items) != 1 {
		t.Fatalf("expected a single aggregated observation, got %d", len(items))
	}
	body, ok := items[0].Payload["body"].(map[string]any)
	if !ok {
		t.Fatalf("expected an aggregated body payload: %#v", items[0].Payload)
	}
	prices, ok := body["prices"].([]any)
	if !ok || len(prices) != 3 {
		t.Fatalf("expected 3 hourly price entries aggregated into one observation, got %#v", body["prices"])
	}
	if items[0].Payload["cursor"] != "cursor-7" {
		t.Fatalf("expected the cursor to be preserved: %#v", items[0].Payload)
	}
}

func TestHistoricalPriceQuerySwitchesFormatForV2Endpoint(t *testing.T) {
	at := time.Date(2026, 1, 10, 14, 0, 0, 0, time.UTC)

	v1 := historicalPriceQuery("https://api.porssisahko.net/v1/latest-prices.json", at)
	if v1["date"] != "2026-01-10" || v1["hour"] != "14" {
		t.Fatalf("expected the v1 date+hour form, got %v", v1)
	}

	v2 := historicalPriceQuery("https://api.porssisahko.net/v2/latest-prices.json", at)
	if v2["date"] != "2026-01-10T14:00:00Z" {
		t.Fatalf("expected the v2 single-timestamp form, got %v", v2)
	}
	if _, hasHour := v2["hour"]; hasHour {
		t.Fatalf("expected the v2 form to omit a separate hour field, got %v", v2)
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
