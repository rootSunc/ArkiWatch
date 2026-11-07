package collectors

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
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
	var partial *PartialError
	if !errors.As(err, &partial) || len(partial.Areas) != 1 || partial.Areas[0] != "espoo" {
		t.Fatalf("expected a partial failure naming espoo, got items=%#v err=%v", items, err)
	}
	if len(items) != 1 || items[0].AreaCode != "helsinki" {
		t.Fatalf("expected the successful helsinki observation to be kept, got %#v", items)
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

func TestCollectorIntCoercesEachSupportedInputType(t *testing.T) {
	cases := []struct {
		name  string
		value any
		want  int
		ok    bool
	}{
		{"float64 truncates", 3.9, 3, true},
		{"int passes through", 7, 7, true},
		{"int64 converts", int64(42), 42, true},
		{"numeric string parses", " 12 ", 12, true},
		{"non-numeric string fails", "abc", 0, false},
		{"unsupported type fails", []int{1}, 0, false},
		{"nil fails", nil, 0, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, ok := collectorInt(testCase.value)
			if got != testCase.want || ok != testCase.ok {
				t.Fatalf("collectorInt(%#v) = (%d, %v), want (%d, %v)", testCase.value, got, ok, testCase.want, testCase.ok)
			}
		})
	}
}

func TestSykeStationIDsFiltersByMeasureAndSkipsNonMatchesWithoutErodingLimit(t *testing.T) {
	stations := []any{
		map[string]any{"Paikka_Id": 1.0, "Suure_Id": 1.0}, // matches measure 1
		map[string]any{"Paikka_Id": 2.0, "Suure_Id": 2.0}, // different measure, should not count against the limit
		map[string]any{"Paikka_Id": 3.0, "Suure_Id": 1.0}, // matches measure 1
		map[string]any{"Paikka_Id": 4.0, "Suure_Id": 1.0}, // matches measure 1, but excluded once limit=2 is reached
		"not-a-station", // malformed entries are skipped
		map[string]any{"Paikka_Id": "not-a-number", "Suure_Id": 1.0},
	}

	limited := sykeStationIDs(stations, 1, 2)
	if !reflect.DeepEqual(limited, []int{1, 3}) {
		t.Fatalf("expected the two matching stations before the limit, non-matches not counted: %v", limited)
	}

	unlimited := sykeStationIDs(stations, 1, 0)
	if !reflect.DeepEqual(unlimited, []int{1, 3, 4}) {
		t.Fatalf("expected all three matching stations (including the one past the limit=2 case) with limit<=0 meaning unlimited: %v", unlimited)
	}

	if none := sykeStationIDs(stations, 99, 10); len(none) != 0 {
		t.Fatalf("expected no matches for an unused measure ID, got %v", none)
	}
}

func TestCapFeaturesTruncatesAndRecordsOriginalCountOnlyWhenOverLimit(t *testing.T) {
	features := []any{"a", "b", "c"}
	body := map[string]any{"type": "FeatureCollection", "features": features}

	untouched := capFeatures(body, 5)
	if !reflect.DeepEqual(untouched, body) {
		t.Fatalf("expected the body unchanged when under the limit, got %#v", untouched)
	}
	if untouched["feature_count_original"] != nil {
		t.Fatalf("expected no truncation metadata when nothing was truncated")
	}

	capped := capFeatures(body, 2)
	cappedFeatures, ok := capped["features"].([]any)
	if !ok || len(cappedFeatures) != 2 {
		t.Fatalf("expected features truncated to 2, got %#v", capped["features"])
	}
	if capped["feature_count_original"] != 3 || capped["feature_count_returned"] != 2 {
		t.Fatalf("expected truncation metadata to record the original and returned counts: %#v", capped)
	}
	if capped["type"] != "FeatureCollection" {
		t.Fatalf("expected other body fields to be preserved: %#v", capped)
	}
	if len(body["features"].([]any)) != 3 {
		t.Fatalf("expected the original body to be left untouched")
	}

	if result := capFeatures(nil, 5); result != nil {
		t.Fatalf("expected a nil body to pass through as nil, got %#v", result)
	}
	if result := capFeatures(body, 0); !reflect.DeepEqual(result, body) {
		t.Fatalf("expected limit<=0 to disable capping entirely, got %#v", result)
	}
}

func TestEndpointCollectUsesQueryClosureAndHeaders(t *testing.T) {
	var mu sync.Mutex
	var seenQuery url.Values
	var seenHeader string

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		seenQuery = request.URL.Query()
		seenHeader = request.Header.Get("x-api-key")
		mu.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":[1,2,3]}`))
	}))
	defer server.Close()

	collector := endpointCollector{
		cfg: config.DefaultConfig(), source: "fingrid", dataset: "energy_timeseries", endpoint: server.URL, area: "helsinki",
		headers: map[string]string{"x-api-key": "secret-key"},
		query:   func() map[string]string { return map[string]string{"pageSize": "200"} },
	}

	items, err := collector.Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if len(items) != 1 || items[0].Dataset != "energy_timeseries" || items[0].AreaCode != "helsinki" || len(items[0].Hash) != 64 {
		t.Fatalf("unexpected observation: %#v", items)
	}

	mu.Lock()
	defer mu.Unlock()
	if seenQuery.Get("pageSize") != "200" {
		t.Fatalf("expected the query closure's params to be sent, got %v", seenQuery)
	}
	if seenHeader != "secret-key" {
		t.Fatalf("expected the configured header to be sent, got %q", seenHeader)
	}
}

func TestEndpointCollectRangeErrorsWithoutHittingTheNetworkWhenUnsupported(t *testing.T) {
	collector := endpointCollector{cfg: config.DefaultConfig(), source: "hsy", endpoint: "http://127.0.0.1:1"} // rangeQuery is nil; a real request here would hang/refuse, not just error cleanly
	now := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)

	_, err := collector.CollectRange(context.Background(), now, now.Add(time.Hour), "", "")
	if err == nil || !strings.Contains(err.Error(), "does not support historical backfill") {
		t.Fatalf("expected a clean unsupported-backfill error without attempting the request, got: %v", err)
	}
}

func TestEndpointCollectRangeRejectsNonPositiveWindowWithoutHittingTheNetwork(t *testing.T) {
	collector := endpointCollector{
		cfg: config.DefaultConfig(), source: "fingrid", endpoint: "http://127.0.0.1:1",
		rangeQuery: func(start, end time.Time) map[string]string { return nil },
	}
	now := time.Date(2026, 4, 12, 0, 0, 0, 0, time.UTC)

	if _, err := collector.CollectRange(context.Background(), now, now, "", ""); err == nil {
		t.Fatal("expected an error when the window end does not come after the start")
	}
}

func TestEndpointCollectRangeFallsBackToConfiguredAreaAndStampsWindow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":[]}`))
	}))
	defer server.Close()

	collector := endpointCollector{
		cfg: config.DefaultConfig(), source: "fingrid", dataset: "energy_timeseries", endpoint: server.URL, area: "helsinki",
		rangeQuery: func(start, end time.Time) map[string]string {
			return map[string]string{"startTime": start.Format(time.RFC3339), "endTime": end.Format(time.RFC3339)}
		},
	}
	start := time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 11, 0, 0, 0, 0, time.UTC)

	fallback, err := collector.CollectRange(context.Background(), start, end, "", "cursor-3")
	if err != nil {
		t.Fatalf("collect range: %v", err)
	}
	if len(fallback) != 1 || fallback[0].AreaCode != "helsinki" {
		t.Fatalf("expected an empty areaCode to fall back to the configured area, got %#v", fallback)
	}
	if fallback[0].Payload["window_start"] != start.UTC().Format(time.RFC3339Nano) || fallback[0].Payload["window_end"] != end.UTC().Format(time.RFC3339Nano) || fallback[0].Payload["cursor"] != "cursor-3" {
		t.Fatalf("expected the window and cursor to be stamped on the payload: %#v", fallback[0].Payload)
	}

	explicit, err := collector.CollectRange(context.Background(), start, end, "vantaa", "cursor-4")
	if err != nil {
		t.Fatalf("collect range: %v", err)
	}
	if len(explicit) != 1 || explicit[0].AreaCode != "vantaa" {
		t.Fatalf("expected an explicit areaCode to override the configured area, got %#v", explicit)
	}
}

func TestMultiEndpointCollectFetchesEveryConfiguredMessageType(t *testing.T) {
	var mu sync.Mutex
	seenPaths := map[string]bool{}

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		seenPaths[request.URL.Path] = true
		mu.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"features":[{"id":1},{"id":2},{"id":3}]}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.DigitrafficRoadAPIBaseURL = server.URL
	cfg.DigitrafficMaxFeaturesPerType = 2
	collector := multiEndpointCollector{cfg: cfg, endpoints: map[string]string{
		"traffic_announcements": "/api/traffic-message/v2/traffic-announcements",
		"roadworks":             "/api/traffic-message/v2/roadworks",
	}}

	items, err := collector.Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected one observation per configured message type, got %d", len(items))
	}

	mu.Lock()
	defer mu.Unlock()
	for _, path := range []string{"/api/traffic-message/v2/traffic-announcements", "/api/traffic-message/v2/roadworks"} {
		if !seenPaths[path] {
			t.Fatalf("expected a request to %s, saw %v", path, seenPaths)
		}
	}
	for _, item := range items {
		if item.AreaCode != "finland" || item.Dataset != "traffic_messages" {
			t.Fatalf("unexpected observation shape: %#v", item)
		}
		body, ok := item.Payload["body"].(map[string]any)
		if !ok {
			t.Fatalf("expected a body payload: %#v", item.Payload)
		}
		features, ok := body["features"].([]any)
		if !ok || len(features) != 2 || body["feature_count_original"] != 3 {
			t.Fatalf("expected capFeatures to truncate to the configured max, got %#v", body)
		}
	}
}

func TestServicemapCollectSendsRadiusQueryAndStampsMetadata(t *testing.T) {
	var mu sync.Mutex
	var seenQuery url.Values

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mu.Lock()
		seenQuery = request.URL.Query()
		mu.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"items":[{"id":1,"name_fi":"Kirjasto"}]}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.ServicemapAPIBaseURL = server.URL
	cfg.DefaultLat, cfg.DefaultLon = 60.1699, 24.9384
	cfg.ServicemapRadiusMeters = 5000

	items, err := (servicemapCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if len(items) != 1 || items[0].AreaCode != strings.ToLower(cfg.DefaultPlace) {
		t.Fatalf("unexpected observation: %#v", items)
	}

	mu.Lock()
	defer mu.Unlock()
	if seenQuery.Get("lat") != "60.1699" || seenQuery.Get("lon") != "24.9384" || seenQuery.Get("distance") != "5000" {
		t.Fatalf("expected the configured centre and radius in the query, got %v", seenQuery)
	}

	payload := items[0].Payload
	if payload["radius_meters"] != 5000 || payload["unit_count_original"] != 1 || payload["unit_count_returned"] != 1 {
		t.Fatalf("expected radius and unit-count metadata to be stamped: %#v", payload)
	}
}

func TestLinkedEventsCollectFollowsPaginationUntilNoNextPage(t *testing.T) {
	var calls atomic.Int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if calls.Add(1) == 1 {
			_, _ = writer.Write([]byte(`{"data":[{"id":"e1"},{"id":"e2"}],"meta":{"count":5,"next":"` + server.URL + `/event/?page=2"}}`))
			return
		}
		_, _ = writer.Write([]byte(`{"data":[{"id":"e3"}],"meta":{"count":5}}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.LinkedEventsCityAPIBaseURLs = []string{"helsinki=" + server.URL}
	cfg.LinkedEventsMaxPages = 5

	items, err := (linkedEventsCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected pagination to stop once a page has no meta.next, made %d requests", calls.Load())
	}
	if len(items) != 1 || items[0].AreaCode != "helsinki" {
		t.Fatalf("unexpected observations: %#v", items)
	}
	payload := items[0].Payload
	if payload["event_count_returned"] != 3 {
		t.Fatalf("expected 2+1 events aggregated across both pages, got %#v", payload["event_count_returned"])
	}
	if payload["event_count_total"] != float64(5) {
		t.Fatalf("expected meta.count to be carried through, got %#v", payload["event_count_total"])
	}
	if urls, ok := payload["request_urls"].([]string); !ok || len(urls) != 2 {
		t.Fatalf("expected both page requests recorded, got %#v", payload["request_urls"])
	}
}

func TestLinkedEventsCollectStopsAtMaxPagesDespiteAnEndlessNextLink(t *testing.T) {
	var calls atomic.Int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":[{"id":"e"}],"meta":{"count":100,"next":"` + server.URL + `/event/"}}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.LinkedEventsCityAPIBaseURLs = []string{"helsinki=" + server.URL}
	cfg.LinkedEventsMaxPages = 2

	items, err := (linkedEventsCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected exactly LinkedEventsMaxPages=2 requests despite an endless next link, got %d", calls.Load())
	}
	if len(items) != 1 || items[0].Payload["event_count_returned"] != 2 {
		t.Fatalf("expected 2 pages worth of events aggregated before the cap stopped it, got %#v", items)
	}
}

func TestRegistryConstructsEveryExpectedSourceWithMatchingSourceCode(t *testing.T) {
	registry := Registry(config.DefaultConfig())

	want := []string{"fmi", "hsy", "open_meteo_air", "porssisahko", "fingrid", "digitraffic", "digitransit", "syke", "servicemap", "linkedevents"}
	if len(registry) != len(want) {
		t.Fatalf("expected %d registered sources, got %d: %v", len(want), len(registry), registryKeys(registry))
	}
	for _, sourceCode := range want {
		collector, ok := registry[sourceCode]
		if !ok {
			t.Fatalf("expected %q to be registered, got %v", sourceCode, registryKeys(registry))
		}
		if collector.SourceCode() != sourceCode {
			t.Fatalf("expected the map key to match the collector's own SourceCode(), key=%q SourceCode()=%q", sourceCode, collector.SourceCode())
		}
		if collector.Dataset() == "" {
			t.Fatalf("expected %q to have a non-empty Dataset()", sourceCode)
		}
	}
}

func registryKeys(registry map[string]Collector) []string {
	keys := make([]string, 0, len(registry))
	for key := range registry {
		keys = append(keys, key)
	}
	return keys
}

func TestHeaderIfPresentOmitsBlankValues(t *testing.T) {
	if headerIfPresent("x-api-key", "") != nil {
		t.Fatal("expected a blank value to produce no header")
	}
	if headerIfPresent("x-api-key", "  ") != nil {
		t.Fatal("expected a whitespace-only value to produce no header")
	}
	got := headerIfPresent("x-api-key", "secret")
	if !reflect.DeepEqual(got, map[string]string{"x-api-key": "secret"}) {
		t.Fatalf("unexpected header map: %v", got)
	}
}

func TestNonEmptyFallsBackOnlyWhenBlank(t *testing.T) {
	if nonEmpty("value", "fallback") != "value" {
		t.Fatal("expected a non-blank value to win")
	}
	if nonEmpty("", "fallback") != "fallback" {
		t.Fatal("expected a blank value to use the fallback")
	}
	if nonEmpty("   ", "fallback") != "fallback" {
		t.Fatal("expected a whitespace-only value to use the fallback")
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

func TestDigitransitCollectPostsGraphQLAndCarriesAlerts(t *testing.T) {
	var method, contentType, key string
	var document struct {
		Query string `json:"query"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		method, contentType, key = request.Method, request.Header.Get("Content-Type"), request.Header.Get("digitransit-subscription-key")
		if err := json.NewDecoder(request.Body).Decode(&document); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":{"alerts":[{"id":"HSL:1","alertHeaderText":"Tram 9 diverted"}]}}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.DigitransitRoutingURL = server.URL
	cfg.DigitransitSubscriptionKey = "test-key"
	items, err := digitransitCollector{cfg: cfg}.Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if method != http.MethodPost || contentType != "application/json" || key != "test-key" {
		t.Fatalf("method=%q contentType=%q key=%q", method, contentType, key)
	}
	if !strings.Contains(document.Query, "alerts(feeds:") {
		t.Fatalf("query = %q", document.Query)
	}
	if len(items) != 1 || items[0].AreaCode != "helsinki" {
		t.Fatalf("items = %#v", items)
	}
	alerts, ok := items[0].Payload["body"].(map[string]any)["data"].(map[string]any)["alerts"].([]any)
	if !ok || len(alerts) != 1 {
		t.Fatalf("payload = %#v", items[0].Payload)
	}
}

// GraphQL reports a rejected query as HTTP 200 with an errors array, so without
// an explicit check a broken query would be stored as a healthy empty run.
func TestDigitransitCollectFailsOnInlineGraphQLErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"errors":[{"message":"Validation error: Field 'entities' is undefined"}],"data":null}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.DigitransitRoutingURL = server.URL
	cfg.DigitransitSubscriptionKey = "test-key"
	_, err := digitransitCollector{cfg: cfg}.Collect(context.Background())
	if err == nil || !strings.Contains(err.Error(), "entities") {
		t.Fatalf("expected the GraphQL error to fail the run, got %v", err)
	}
}

func TestDigitransitCollectRefusesToRunWithoutASubscriptionKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Fatal("collector must not reach the network without a key")
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.DigitransitRoutingURL = server.URL
	cfg.DigitransitSubscriptionKey = ""
	if _, err := (digitransitCollector{cfg: cfg}).Collect(context.Background()); err == nil {
		t.Fatal("expected a missing subscription key to fail the run")
	}
}

// An env file that sets the variable to an empty string must not leave the
// collector posting at a bare host.
func TestDigitransitGraphQLURLFallsBackWhenTheEnvBlanksTheRoutingURL(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.DigitransitRoutingURL = ""
	cfg.DigitransitAPIURL = ""
	if url := cfg.DigitransitGraphQLURL(); !strings.HasPrefix(url, "https://api.digitransit.fi/routing/") {
		t.Fatalf("url = %q", url)
	}
}

func TestHSYCollectPartitionsRegionalStationsAcrossConfiguredAirQualityPlaces(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"type":"FeatureCollection",
			"features":[
				{"properties":{"Mittausasema":"Kallio 2","kaupunki":"Helsinki","Ilmanlaatuindeksi":28}},
				{"properties":{"Mittausasema":"Leppävaara","kaupunki":"Espoo","Ilmanlaatuindeksi":64}},
				{"properties":{"Mittausasema":"Tikkurila","kaupunki":"Vantaa","Ilmanlaatuindeksi":41}}
			]
		}`))
	}))
	defer server.Close()

	cfg := config.DefaultConfig()
	cfg.HSYWFSURL = server.URL
	cfg.AirQualityPlaces = []string{"helsinki=Helsinki", "espoo=Espoo", "vantaa=Vantaa"}

	items, err := (hsyCollector{cfg: cfg}).Collect(context.Background())
	if err != nil {
		t.Fatalf("collect: %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected one shared WFS request, made %d", calls.Load())
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 city-scoped observations, got %d: %#v", len(items), items)
	}
	byCity := map[string]Observation{}
	for _, item := range items {
		byCity[item.AreaCode] = item
	}
	for city, wantStation := range map[string]string{"helsinki": "Kallio 2", "espoo": "Leppävaara", "vantaa": "Tikkurila"} {
		obs, ok := byCity[city]
		if !ok {
			t.Fatalf("missing observation for %s", city)
		}
		features, _ := obs.Payload["body"].(map[string]any)["features"].([]any)
		if len(features) != 1 {
			t.Fatalf("%s expected 1 station feature, got %#v", city, features)
		}
		got := features[0].(map[string]any)["properties"].(map[string]any)["Mittausasema"]
		if got != wantStation {
			t.Fatalf("%s station = %v, want %s", city, got, wantStation)
		}
	}
}
