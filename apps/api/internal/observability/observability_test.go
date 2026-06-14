package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegistryRendersRequestSeries(t *testing.T) {
	registry := NewRegistry("ArkiWatch", "1.2.3", "abc123", true)
	registry.StartRequest()
	registry.ObserveRequest("get", "/api/health", 200, 12*time.Millisecond)
	registry.StartRequest()
	registry.ObserveRequest("GET", "/api/health", 200, 8*time.Millisecond)
	registry.StartRequest()
	registry.ObserveRequest("POST", "/api/auth/login", 401, 3*time.Millisecond)

	output := registry.Render()
	for _, expected := range []string{
		`arkiwatch_api_info{backend="go",app="ArkiWatch",version="1.2.3",build_sha="abc123"} 1`,
		`arkiwatch_api_requests_total{method="GET",route="/api/health",status="200"} 2`,
		`arkiwatch_api_requests_total{method="POST",route="/api/auth/login",status="401"} 1`,
		"arkiwatch_api_request_duration_seconds_sum",
		"arkiwatch_api_requests_in_flight 0",
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("metrics output missing %q:\n%s", expected, output)
		}
	}
}

// Disabling metrics must still expose build info, so a scrape target stays
// valid, but must not accumulate per-request series.
func TestRegistryHonoursDisabledFlag(t *testing.T) {
	registry := NewRegistry("ArkiWatch", "1.2.3", "abc123", false)
	registry.StartRequest()
	registry.ObserveRequest("GET", "/api/health", 200, time.Millisecond)
	output := registry.Render()
	if !strings.Contains(output, "arkiwatch_api_info") {
		t.Fatalf("build info should always be exposed:\n%s", output)
	}
	if strings.Contains(output, "arkiwatch_api_requests_total") {
		t.Fatalf("disabled registry recorded request series:\n%s", output)
	}
}

// Labelling by raw path would create a series per identifier, so unmatched and
// prefix routes must collapse.
func TestRouteMatcherBoundsCardinality(t *testing.T) {
	matcher := newRouteMatcher([]string{"/", "/api/health", "/api/platform/events/", "/api/platform/categories/"})
	cases := map[string]string{
		"/api/health":                      "/api/health",
		"/api/platform/events/8f14e45f":    "/api/platform/events/{id}",
		"/api/platform/events/0000-1111":   "/api/platform/events/{id}",
		"/api/platform/categories/air":     "/api/platform/categories/{id}",
		"/api/something/nobody/registered": "other",
		"/":                                "/",
	}
	for path, expected := range cases {
		if got := matcher.match(path); got != expected {
			t.Fatalf("%s matched %s, expected %s", path, got, expected)
		}
	}
}

func TestMiddlewareRecordsAndEchoesRequestID(t *testing.T) {
	registry := NewRegistry("ArkiWatch", "0.0.0", "dev", true)
	handler := Middleware(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusTeapot)
		_, _ = writer.Write([]byte("hi"))
	}), registry, NewLogger("error", "json"), Options{RequestIDHeader: "X-Request-ID", Routes: []string{"/api/health"}})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	if recorder.Code != http.StatusTeapot {
		t.Fatalf("middleware changed the status: %d", recorder.Code)
	}
	if recorder.Header().Get("X-Request-ID") == "" {
		t.Fatal("middleware did not set a request id")
	}
	if !strings.Contains(registry.Render(), `route="/api/health",status="418"`) {
		t.Fatalf("request was not recorded:\n%s", registry.Render())
	}
}

func TestMiddlewarePreservesClientRequestID(t *testing.T) {
	handler := Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}),
		NewRegistry("ArkiWatch", "0.0.0", "dev", true), NewLogger("error", "json"),
		Options{RequestIDHeader: "X-Request-ID"})

	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.Header.Set("X-Request-ID", "client-supplied-id")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Header().Get("X-Request-ID") != "client-supplied-id" {
		t.Fatalf("client request id was replaced: %s", recorder.Header().Get("X-Request-ID"))
	}
}

// Server-sent-event handlers flush as they write, so the recorder must forward
// Flush or the assistant stream would buffer behind the middleware.
func TestMiddlewareForwardsFlush(t *testing.T) {
	flushed := false
	handler := Middleware(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		flusher, ok := writer.(http.Flusher)
		if !ok {
			t.Fatal("middleware hid the Flusher interface")
		}
		_, _ = writer.Write([]byte("data: x\n"))
		flusher.Flush()
		flushed = true
	}), NewRegistry("ArkiWatch", "0.0.0", "dev", true), NewLogger("error", "json"), Options{})

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/assistant/chat/stream", nil))
	if !flushed {
		t.Fatal("handler could not flush through the middleware")
	}
}

func TestReadCacheExpiresEntries(t *testing.T) {
	cache := NewReadCache(30)
	current := time.Now()
	cache.now = func() time.Time { return current }

	cache.Set("public_dashboard:live", map[string]any{"status": "ok"})
	if _, ok := cache.Get("public_dashboard:live"); !ok {
		t.Fatal("value was not cached")
	}
	current = current.Add(31 * time.Second)
	if _, ok := cache.Get("public_dashboard:live"); ok {
		t.Fatal("expired value was served")
	}
}

func TestReadCacheDisabledAtZeroTTL(t *testing.T) {
	cache := NewReadCache(0)
	cache.Set("key", "value")
	if _, ok := cache.Get("key"); ok {
		t.Fatal("a zero TTL must disable the cache")
	}
}

// A pipeline run replaces the data a cached payload was built from, so the
// cache has to be clearable.
func TestReadCacheInvalidate(t *testing.T) {
	cache := NewReadCache(60)
	cache.Set("key", "value")
	cache.Invalidate()
	if _, ok := cache.Get("key"); ok {
		t.Fatal("invalidate did not clear the cache")
	}
}
