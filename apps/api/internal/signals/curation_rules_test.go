package signals

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

func TestEventTypeFallsBackToAttributesThenEvidence(t *testing.T) {
	cases := []struct {
		event    platform.Event
		expected string
	}{
		{platform.Event{EventType: "rail_delay", Attributes: map[string]any{"event_type": "ignored"}}, "rail_delay"},
		{platform.Event{Attributes: map[string]any{"event_type": "road_disruption"}}, "road_disruption"},
		{platform.Event{Evidence: []string{"fmi source observation", "Event Type: snow_load "}}, "snow_load"},
		{platform.Event{Evidence: []string{"no type here"}}, ""},
	}
	for i, c := range cases {
		if got := EventType(c.event); got != c.expected {
			t.Errorf("case %d: event type %q, want %q", i, got, c.expected)
		}
	}
}

func TestNotificationNeedsSeverityOrActionableType(t *testing.T) {
	cases := []struct {
		event    platform.Event
		expected bool
	}{
		{platform.Event{Severity: "LOW"}, true},
		{platform.Event{Severity: "INFO"}, false},
		{platform.Event{Severity: "INFO", EventType: "transit_delay"}, true},
		{platform.Event{EventType: "public_event"}, false},
		{platform.Event{Severity: "unknown", EventType: "weather_outlook"}, true},
	}
	for i, c := range cases {
		if got := notification(c.event); got != c.expected {
			t.Errorf("case %d: notification %v, want %v", i, got, c.expected)
		}
	}
}

func TestCityRelevantUsesTrafficGeometryBeforeText(t *testing.T) {
	helsinkiBox := []any{24.93, 60.16, 24.95, 60.18}
	tampereBox := []any{23.75, 61.49, 23.77, 61.51}
	cases := []struct {
		name     string
		event    platform.Event
		city     string
		expected bool
	}{
		{"non-traffic is always relevant", platform.Event{CategoryKey: "weather", Title: "Oulu"}, "helsinki", true},
		{"no city keeps traffic", platform.Event{CategoryKey: "traffic", Title: "Oulu"}, "", true},
		{"geometry inside radius", platform.Event{CategoryKey: "traffic", Attributes: map[string]any{"geometry_bbox": helsinkiBox}}, "helsinki", true},
		{"geometry wins over text", platform.Event{CategoryKey: "traffic", Title: "Road to Helsinki", Attributes: map[string]any{"geometry_bbox": tampereBox}}, "helsinki", false},
		{"text fallback matches neighbour", platform.Event{CategoryKey: "traffic", Body: "Ring I near Espoo"}, "helsinki", true},
		{"text fallback misses other city", platform.Event{CategoryKey: "traffic", Body: "Ring I near Espoo"}, "oulu", false},
		{"unknown city matches itself", platform.Event{CategoryKey: "traffic", Title: "Lahti bypass"}, "lahti", true},
	}
	for _, c := range cases {
		if got := cityRelevant(c.event, c.city); got != c.expected {
			t.Errorf("%s: relevant %v, want %v", c.name, got, c.expected)
		}
	}
}

func TestCurateFiltersAndAnnotates(t *testing.T) {
	now := ParseTime("2026-08-09T06:00:00Z")
	at := func(offset time.Duration) string { return timescope.Format(now.Add(offset)) }
	event := func(id, category string, start, end time.Duration) platform.Event {
		return platform.Event{ID: id, CategoryKey: category, Title: id, Severity: "MEDIUM", StartsAt: at(start), EndsAt: at(end)}
	}
	events := []platform.Event{
		event("dup", "weather", -time.Hour, time.Hour),
		event("noise", "air", -time.Hour, time.Hour),
		event("reversed", "energy", time.Hour, -time.Hour),
		event("stale-long-running", "water", -22*24*time.Hour, 15*24*time.Hour),
		event("long-running", "water", -22*24*time.Hour, 13*24*time.Hour),
		event("too-far", "transit", 49*time.Hour, 50*time.Hour),
		event("upcoming", "transit", 47*time.Hour, 48*time.Hour),
		event("old-event", "events", -7*time.Hour, 3*time.Hour),
		event("event-a", "events", time.Hour, 2*time.Hour),
		event("event-b", "events", 2*time.Hour, 3*time.Hour),
		event("ended", "air", -7*time.Hour, -6*time.Hour),
		// Started under 6h ago: kept so a just-cleared disruption stays visible.
		event("recently-ended", "air", -5*time.Hour, -4*time.Hour),
	}
	events[1].Title = "No active air quality alerts"
	replacement := event("dup", "weather", -time.Hour, 30*time.Minute)
	replacement.Title = "replacement"
	events = append(events, replacement)

	got := Curate(events, 10, " Helsinki ", now)
	byID := map[string]platform.Event{}
	for _, e := range got {
		byID[e.ID] = e
	}
	for _, id := range []string{"noise", "reversed", "stale-long-running", "too-far", "old-event", "ended"} {
		if _, ok := byID[id]; ok {
			t.Errorf("%s should be filtered out", id)
		}
	}
	for _, id := range []string{"dup", "long-running", "upcoming", "event-a", "recently-ended"} {
		if _, ok := byID[id]; !ok {
			t.Errorf("%s should be selected", id)
		}
	}
	if _, ok := byID["event-b"]; ok {
		t.Error("public events are capped at one per selection")
	}
	if byID["dup"].Title != "replacement" {
		t.Errorf("a repeated ID should keep the later event, got %q", byID["dup"].Title)
	}

	dup := byID["dup"]
	if !dup.DetailVisible || !dup.Notification || dup.State == "" {
		t.Errorf("selected events must be annotated: %+v", dup)
	}
	if want := int64(2)*1000000000000 + ParseTime(dup.StartsAt).Unix(); dup.NotificationPriority != want {
		t.Errorf("priority %d, want %d", dup.NotificationPriority, want)
	}

	// Active events order by end, others by start.
	order := []string{}
	for _, e := range got {
		order = append(order, e.ID)
	}
	expected := []string{"recently-ended", "dup", "event-a", "upcoming", "long-running"}
	if len(order) != len(expected) {
		t.Fatalf("selection %v, want %v", order, expected)
	}
	for i := range expected {
		if order[i] != expected[i] {
			t.Fatalf("selection %v, want %v", order, expected)
		}
	}
}
