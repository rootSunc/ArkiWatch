package collectors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestBuildObservationHashIsStableForEquivalentPayloads(t *testing.T) {
	moment := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	left, err := BuildObservationHash("fmi", "forecast", "helsinki", moment, map[string]any{"b": 2, "a": 1})
	if err != nil {
		t.Fatalf("left hash: %v", err)
	}
	right, err := BuildObservationHash("fmi", "forecast", "helsinki", moment, map[string]any{"a": 1, "b": 2})
	if err != nil {
		t.Fatalf("right hash: %v", err)
	}
	if left != right || len(left) != 64 {
		t.Fatalf("hashes = %q and %q", left, right)
	}
}

func TestCollectJSONRetriesTransientHTTPFailure(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if calls.Add(1) == 1 {
			http.Error(writer, "temporary", http.StatusBadGateway)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	body, headers, _, err := CollectJSON(context.Background(), server.Client(), http.MethodGet, server.URL, nil, map[string]string{"city": "Helsinki"})
	if err != nil {
		t.Fatalf("collect json: %v", err)
	}
	if calls.Load() != 2 || headers.Get("Content-Type") != "application/json" || body["ok"] != true {
		t.Fatalf("calls=%d headers=%v body=%#v", calls.Load(), headers, body)
	}
}

func TestCollectJSONRemovesPostgresUnsupportedNullCharacters(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"message":"before\u0000after","nested":["ok\u0000"]}`))
	}))
	defer server.Close()

	body, _, _, err := CollectJSON(context.Background(), server.Client(), http.MethodGet, server.URL, nil, nil)
	if err != nil {
		t.Fatalf("collect json: %v", err)
	}
	if body["message"] != "beforeafter" {
		t.Fatalf("message = %#v", body["message"])
	}
	nested, ok := body["nested"].([]any)
	if !ok || len(nested) != 1 || nested[0] != "ok" {
		t.Fatalf("nested = %#v", body["nested"])
	}
}

func TestDecodeJSONBodyKeepsTopLevelArrays(t *testing.T) {
	payload := decodeJSONBody([]byte(`[{"id":1,"name_fi":"Kirjasto"},{"id":2}]`))
	items, ok := payload["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("top-level array was not parsed: %#v", payload)
	}
	if _, leaked := payload["raw"]; leaked {
		t.Fatal("top-level array was stringified into raw")
	}
	if payload["item_count"] != 2 {
		t.Fatalf("unexpected item_count: %#v", payload["item_count"])
	}
}

func TestDecodeJSONBodyFallsBackToRaw(t *testing.T) {
	payload := decodeJSONBody([]byte("not json at all"))
	if payload["raw"] != "not json at all" {
		t.Fatalf("unexpected fallback: %#v", payload)
	}
	if decoded := decodeJSONBody([]byte("  ")); len(decoded) != 0 {
		t.Fatalf("blank body should decode empty: %#v", decoded)
	}
}

func TestServicemapCollectorCompactsAndRanksUnits(t *testing.T) {
	cfg := config.Config{DefaultLat: 60.1699, DefaultLon: 24.9384, ServicemapMaxUnits: 2}
	collector := servicemapCollector{cfg: cfg}
	units, total := collector.compactUnits([]any{
		map[string]any{"id": 1.0, "name_fi": "Kaukainen", "latitude": 61.5, "longitude": 23.76},
		map[string]any{"id": 2.0, "name_en": "Nearby", "name_fi": "Lahella", "latitude": 60.17, "longitude": 24.94},
		map[string]any{"id": 3.0, "name_fi": "Keskiverto", "latitude": 60.3, "longitude": 25.0},
		"not a unit",
	})
	if total != 3 {
		t.Fatalf("expected 3 compacted units, got %d", total)
	}
	if len(units) != 2 {
		t.Fatalf("max units was not applied: %d", len(units))
	}
	first := units[0].(map[string]any)
	if first["name"] != "Nearby" {
		t.Fatalf("nearest unit was not ranked first: %#v", first)
	}
	if _, ok := first["distance_m"].(float64); !ok {
		t.Fatalf("distance was not computed: %#v", first)
	}
	if _, ok := first["ontologyword_ids"].([]any); !ok {
		t.Fatalf("ontology ids should default to an empty list: %#v", first)
	}
}

func TestLocalizedFieldPrefersEnglish(t *testing.T) {
	unit := map[string]any{"name_fi": "Kirjasto", "name_sv": "Bibliotek", "name_en": "Library"}
	if got := localizedField(unit, "name"); got != "Library" {
		t.Fatalf("unexpected localized value: %q", got)
	}
	if got := localizedField(map[string]any{"name_fi": "Kirjasto"}, "name"); got != "Kirjasto" {
		t.Fatalf("unexpected fallback value: %q", got)
	}
	if got := localizedField(map[string]any{}, "name"); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}
