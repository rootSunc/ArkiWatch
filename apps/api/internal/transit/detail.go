package transit

import "github.com/rootSunc/ArkiWatch/apps/api/internal/detailstate"

func EnrichDetail(c *Current) {
	reference := detailstate.Reference(c.TimeScope, c.CheckedAt)
	events := []detailstate.Event{}
	for i := range c.Alerts {
		a := &c.Alerts[i]
		a.State = detailstate.State(a.StartsAt, a.EndsAt, reference)
		a.Active = a.State == "active"
		a.Filters = []string{"all", a.State}
		if detailstate.High(a.Severity) {
			a.Filters = append(a.Filters, "high")
		}
		if a.Active || detailstate.High(a.Severity) {
			a.Filters = append(a.Filters, "priority")
		}
		if len(a.RouteIDs)+len(a.StopIDs)+len(a.TripIDs) > 0 {
			a.Filters = append(a.Filters, "scoped")
		}
		events = append(events, detailstate.Event{Severity: a.Severity, State: a.State, EndsAt: a.EndsAt})
	}
	c.Detail = detailstate.Summarize(events)
	c.Detail.Scopes = map[string]detailstate.ScopeCount{}
	for key, get := range map[string]func(Alert) []string{"routes": func(a Alert) []string { return a.RouteIDs }, "stops": func(a Alert) []string { return a.StopIDs }, "trips": func(a Alert) []string { return a.TripIDs }} {
		ids := map[string]bool{}
		count := 0
		for _, a := range c.Alerts {
			values := get(a)
			if len(values) > 0 {
				count++
			}
			for _, id := range values {
				ids[id] = true
			}
		}
		c.Detail.Scopes[key] = detailstate.ScopeCount{Count: len(ids), Alerts: count}
	}
	network := 0
	for _, a := range c.Alerts {
		if len(a.RouteIDs)+len(a.StopIDs)+len(a.TripIDs) == 0 {
			network++
		}
	}
	c.Detail.Scopes["network"] = detailstate.ScopeCount{Count: network, Alerts: network}
}
