package airquality

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
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

func TestScoreFromPropertiesMatchesLocalizedQualityWord(t *testing.T) {
	body := map[string]any{
		"features": []any{
			map[string]any{"properties": map[string]any{"Mittausasema": "Keskusta", "Ilmanlaatu": "Hyvä"}},
		},
	}
	stations := stationsFromRaw(observations.RawObservation{Dataset: "air_quality_current", Payload: map[string]any{"body": body}})

	if len(stations) != 1 || stations[0].Score == nil || *stations[0].Score != 1 {
		t.Fatalf("expected the Finnish word 'Hyvä' to score as 1 (good), got %#v", stations)
	}
	if stations[0].Label != "Hyvä" {
		t.Fatalf("expected the original localized text as the label, got %q", stations[0].Label)
	}
}

func TestBuildReturnsEmptyStatusWithoutAnyData(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	current := Build(Data{}, scope, now, "helsinki")

	if current.Status != "empty" {
		t.Fatalf("expected empty status without any event or raw data, got %q", current.Status)
	}
	if len(current.Stations) != 0 || current.ObservedAt != nil {
		t.Fatalf("expected no stations and no observed time: %#v", current)
	}
	if *current.Location != "helsinki" {
		t.Fatalf("expected the location to fall back to the requested locationRef, got %v", current.Location)
	}
}

func TestBuildMergesOpenMeteoWithHSYAndSortsByScoreDescending(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	scope, err := timescope.Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	hsyBody := map[string]any{
		"features": []any{
			map[string]any{
				"geometry":   map[string]any{"coordinates": []any{24.9, 60.2}},
				"properties": map[string]any{"Mittausasema": "StationA", "Ilmanlaatuindeksi": 20.0}, // score 1
			},
			map[string]any{
				"geometry":   map[string]any{"coordinates": []any{25.0, 60.3}},
				"properties": map[string]any{"Mittausasema": "StationB", "Ilmanlaatuindeksi": 90.0}, // score 3
			},
		},
	}
	hsyRaw := observations.RawObservation{Dataset: "air_quality_current", ObservedAt: now, Payload: map[string]any{"body": hsyBody}}
	openMeteoRaw := observations.RawObservation{
		Dataset: "open_meteo_air_quality", ObservedAt: now, AreaCode: "vantaa",
		Payload: map[string]any{"body": map[string]any{"current": map[string]any{"pm2_5": 5.0, "european_aqi": 70.0}}}, // EEA 60-80 => score 4 (poor)
	}
	event := &observations.NormalizedEvent{
		LocationRef: "helsinki-uusimaa", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour),
		Attributes: map[string]any{"worst_score": 3.0, "worst_label": "moderate", "worst_station": "StationB"},
	}

	result := Build(Data{Event: event, HSYRaw: hsyRaw, OpenMeteoRaw: openMeteoRaw}, scope, now, "helsinki")

	if result.Status != "ready" {
		t.Fatalf("expected ready status, got %q: %#v", result.Status, result)
	}
	if *result.Location != "helsinki-uusimaa" {
		t.Fatalf("expected the event's location to take priority over the requested locationRef, got %v", result.Location)
	}
	if len(result.Stations) != 3 {
		t.Fatalf("expected HSY's 2 stations plus the merged Open-Meteo station, got %d", len(result.Stations))
	}
	gotOrder := []string{result.Stations[0].Station, result.Stations[1].Station, result.Stations[2].Station}
	wantOrder := []string{"Vantaa city model", "StationB", "StationA"} // scores 4, 3, 1
	for i := range wantOrder {
		if gotOrder[i] != wantOrder[i] {
			t.Fatalf("expected stations sorted by score descending: got %v, want %v", gotOrder, wantOrder)
		}
	}
	if result.WorstScore == nil || *result.WorstScore != 3 || result.WorstLabel == nil || *result.WorstLabel != "moderate" || result.WorstStation == nil || *result.WorstStation != "StationB" {
		t.Fatalf("expected the worst-station fields to come from the event attributes: score=%v label=%v station=%v", result.WorstScore, result.WorstLabel, result.WorstStation)
	}
}

func TestOpenMeteoStationDerivesPlaceFromAreaCodeAndReturnsNilWithoutSignal(t *testing.T) {
	withSignal := openMeteoStation(observations.RawObservation{
		Dataset: "open_meteo_air_quality", AreaCode: "vantaa",
		Payload: map[string]any{"body": map[string]any{"current": map[string]any{"pm2_5": 5.0}}},
	})
	if withSignal == nil || withSignal.Station != "Vantaa city model" || withSignal.Label != "Open-Meteo" {
		t.Fatalf("expected a place derived from AreaCode and an Open-Meteo label when no AQI index is present: %#v", withSignal)
	}

	withoutSignal := openMeteoStation(observations.RawObservation{
		Dataset: "open_meteo_air_quality", AreaCode: "turku",
		Payload: map[string]any{"body": map[string]any{"current": map[string]any{}}},
	})
	if withoutSignal != nil {
		t.Fatalf("expected nil when none of pm2_5/pm10/no2/european_aqi are present, got %#v", withoutSignal)
	}

	if station := openMeteoStation(observations.RawObservation{Dataset: "open_meteo_air_quality", Payload: map[string]any{}}); station != nil {
		t.Fatalf("expected nil when the payload has no body, got %#v", station)
	}
}

func TestScoreSeparatesEuropeanAQIFromFinnishIlmanlaatuindeksi(t *testing.T) {
	omModerate := openMeteoStation(observations.RawObservation{
		Dataset: "open_meteo_air_quality", AreaCode: "tampere",
		Payload: map[string]any{"body": map[string]any{"current": map[string]any{"european_aqi": 48.0}}},
	})
	if omModerate == nil || omModerate.Score == nil || *omModerate.Score != 3 {
		t.Fatalf("expected EEA AQI 48 to score as 3 (moderate), got %#v", omModerate)
	}

	hsyGood := stationsFromRaw(observations.RawObservation{
		Dataset: "air_quality_current",
		Payload: map[string]any{"body": map[string]any{"features": []any{
			map[string]any{"properties": map[string]any{"Mittausasema": "Kallio", "Ilmanlaatuindeksi": 48.0}},
		}}},
	})
	if len(hsyGood) != 1 || hsyGood[0].Score == nil || *hsyGood[0].Score != 1 {
		t.Fatalf("expected Finnish Ilmanlaatuindeksi 48 to score as 1 (good), got %#v", hsyGood)
	}
}

func TestIsCurrentUsesPerSourceMaxAgeThresholds(t *testing.T) {
	now := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)

	if !isCurrent("hsy", observations.RawObservation{Dataset: "x", ObservedAt: now.Add(-11 * time.Hour)}, now) {
		t.Fatal("expected an HSY observation 11h old to be current (max age 12h)")
	}
	if isCurrent("hsy", observations.RawObservation{Dataset: "x", ObservedAt: now.Add(-13 * time.Hour)}, now) {
		t.Fatal("expected an HSY observation 13h old to be stale (max age 12h)")
	}
	if !isCurrent("open_meteo_air", observations.RawObservation{Dataset: "x", ObservedAt: now.Add(-35 * time.Hour)}, now) {
		t.Fatal("expected an Open-Meteo observation 35h old to be current (max age 36h)")
	}
	if isCurrent("open_meteo_air", observations.RawObservation{Dataset: "x", ObservedAt: now.Add(-37 * time.Hour)}, now) {
		t.Fatal("expected an Open-Meteo observation 37h old to be stale (max age 36h)")
	}
	if isCurrent("hsy", observations.RawObservation{Dataset: "", ObservedAt: now}, now) {
		t.Fatal("expected an uncollected source (empty Dataset) to never be current")
	}
}

func TestQualityFromStationsReportsCoverageAndMissingFields(t *testing.T) {
	empty := qualityFromStations(nil)
	if empty.StationCount != 0 || len(empty.MissingFields) != 4 || len(empty.Notes) != 1 {
		t.Fatalf("expected the no-stations branch's fixed shape, got %+v", empty)
	}

	score := 1
	full := Station{Score: &score, PM25: floatPointer(1), PM10: floatPointer(2), NO2: floatPointer(3)}
	scoreOnly := Station{Score: &score}
	quality := qualityFromStations([]Station{full, scoreOnly})

	if quality.ReportingStationCount != 2 {
		t.Fatalf("expected both stations (each with a score) to count as reporting, got %d", quality.ReportingStationCount)
	}
	if len(quality.MissingFields) != 0 {
		t.Fatalf("expected no field to be fully missing across both stations, got %v", quality.MissingFields)
	}
	if quality.FieldCoveragePct != 62.5 {
		t.Fatalf("expected 5 of 8 tracked field slots present (62.5%%), got %v", quality.FieldCoveragePct)
	}
}

func floatPointer(value float64) *float64 { return &value }
