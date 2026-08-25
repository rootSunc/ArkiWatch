package collectorservice

import (
	"reflect"
	"testing"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
)

func TestResolveRequestedSourcesReturnsSortedRegistryForAll(t *testing.T) {
	registry := map[string]collectors.Collector{"fmi": nil, "porssisahko": nil, "hsy": nil}

	sources, err := ResolveRequestedSources(registry, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(sources, []string{"fmi", "hsy", "porssisahko"}) {
		t.Fatalf("expected all registered sources sorted, got %v", sources)
	}

	sources, err = ResolveRequestedSources(registry, []string{"all"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(sources, []string{"fmi", "hsy", "porssisahko"}) {
		t.Fatalf("expected \"all\" to resolve to every registered source sorted, got %v", sources)
	}
}

func TestResolveRequestedSourcesPassesThroughKnownCodes(t *testing.T) {
	registry := map[string]collectors.Collector{"fmi": nil, "porssisahko": nil}

	sources, err := ResolveRequestedSources(registry, []string{"porssisahko", "fmi"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(sources, []string{"porssisahko", "fmi"}) {
		t.Fatalf("expected the explicit request order to be preserved, got %v", sources)
	}
}

func TestResolveRequestedSourcesRejectsUnknownCodes(t *testing.T) {
	registry := map[string]collectors.Collector{"fmi": nil}

	_, err := ResolveRequestedSources(registry, []string{"fmi", "not_a_real_source"})
	if err == nil {
		t.Fatal("expected an error for an unregistered source code")
	}
}
