package platform

import (
	"github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"
	"strings"
)

func EnrichDetail(o *Overview) {
	reference := detailstate.Reference(o.TimeScope, o.CheckedAt)
	update := func(events []Event) {
		for i := range events {
			e := &events[i]
			e.State = detailstate.State(e.StartsAt, e.EndsAt, reference)
			text := strings.ToLower(e.Title + " " + e.Body)
			e.DetailVisible = !strings.Contains(text, "no active outdoor conditions") && !strings.Contains(text, "data will appear")
		}
	}
	update(o.RecentEvents)
	for i := range o.Categories {
		update(o.Categories[i].Events)
	}
}
