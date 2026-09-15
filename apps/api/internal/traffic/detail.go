package traffic

import (
	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
	"strings"
)

func EnrichDetail(c *Current) {
	reference := detailstate.Reference(c.TimeScope, c.CheckedAt)
	events := []detailstate.Event{}
	for i := range c.Incidents {
		a := &c.Incidents[i]
		a.State = detailstate.State(a.StartsAt, a.EndsAt, reference)
		a.Active = a.State == "active"
		a.Filters = []string{"all", a.State}
		if detailstate.High(a.Severity) {
			a.Filters = append(a.Filters, "high")
		}
		if a.Active || detailstate.High(a.Severity) {
			a.Filters = append(a.Filters, "priority")
		}
		if strings.HasPrefix(a.EventType, "road_") {
			a.Filters = append(a.Filters, "road")
		}
		if strings.HasPrefix(a.EventType, "rail_") {
			a.Filters = append(a.Filters, "rail")
		}
		text := a.EventType + " " + a.Title + " " + a.Description
		if a.MessageType != nil {
			text += " " + *a.MessageType
		}
		if a.SituationType != nil {
			text += " " + *a.SituationType
		}
		text = strings.ToLower(text)
		weather := strings.Contains(text, "weather") || strings.Contains(text, "slippery") || strings.Contains(text, "icy")
		if weather {
			a.Filters = append(a.Filters, "weather")
		}
		roadworkText := strings.ToLower(a.EventType + " " + a.Title)
		if a.SituationType != nil {
			roadworkText += " " + strings.ToLower(*a.SituationType)
		}
		if a.MessageType != nil {
			roadworkText += " " + strings.ToLower(*a.MessageType)
		}
		for _, word := range []string{"roadwork", "construction", "resurfac", "maintenance"} {
			if strings.Contains(roadworkText, word) {
				a.Filters = append(a.Filters, "roadwork")
				break
			}
		}
		railText := strings.ToLower(a.EventType + " " + a.Title)
		if a.SituationType != nil {
			railText += " " + strings.ToLower(*a.SituationType)
		}
		if strings.Contains(railText, "rail") {
			a.Filters = append(a.Filters, "rail_context")
		}
		events = append(events, detailstate.Event{Severity: a.Severity, State: a.State, EndsAt: a.EndsAt, Weather: weather})
	}
	c.Detail = detailstate.Summarize(events)
}
