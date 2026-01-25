package airquality

import (
	"testing"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
)

func TestStationsDecodeFinnishHSYFieldsAndProjectedCoordinates(t *testing.T) {
	body := map[string]any{
		"features": []any{
			map[string]any{
				"geometry":   map[string]any{"coordinates": []any{25489533.5, 6678627.6}},
				"properties": map[string]any{"Mittausasema": "Leppavaara, vilkasliikenteinen alue", "Ilmanlaatuindeksi": 55.0},
			},
		},
	}
	stations := stationsFromRaw(observations.RawObservation{Dataset: "air_quality_current", Payload: map[string]any{"body": body}})

	if len(stations) != 1 || stations[0].Station != "Leppavaara, vilkasliikenteinen alue" || stations[0].Score == nil || *stations[0].Score != 2 {
		t.Fatalf("unexpected station: %#v", stations)
	}
	if stations[0].Lat == nil || stations[0].Lon == nil || *stations[0].Lat < 60.1 || *stations[0].Lat > 60.3 || *stations[0].Lon < 24.7 || *stations[0].Lon > 24.9 {
		t.Fatalf("unexpected projected coordinate conversion: lat=%.6f lon=%.6f station=%#v", *stations[0].Lat, *stations[0].Lon, stations[0])
	}
}
