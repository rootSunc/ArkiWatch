// Package sourcepolicy holds the per-source backfill and freshness rules.
//
// Each upstream differs in how far back it can be replayed, how large a request
// window it tolerates, and how stale a live reading may be before it stops
// being useful. Keeping that in one table means the planner, the collectors,
// and the health checks all agree on a source's characteristics.
package sourcepolicy

import "time"

type Policy struct {
	SourceCode           string
	InitialEnabled       bool
	InitialDays          int
	WindowSeconds        int
	NormalizeAfterWindow bool
	LiveMaxAgeHours      int
	Notes                string
}

var policies = map[string]Policy{
	"fmi":            {SourceCode: "fmi", InitialEnabled: true, InitialDays: 7, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 36, Notes: "Forecast/observation history is useful by day and has moderate request volume."},
	"open_meteo_air": {SourceCode: "open_meteo_air", InitialEnabled: true, InitialDays: 7, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 36, Notes: "Air quality archive is day-windowed and city-scoped."},
	"porssisahko":    {SourceCode: "porssisahko", InitialEnabled: true, InitialDays: 3, WindowSeconds: 21600, NormalizeAfterWindow: true, LiveMaxAgeHours: 48, Notes: "Historical price API is hourly, so bootstrap uses short ranges and 6h windows."},
	"syke":           {SourceCode: "syke", InitialEnabled: true, InitialDays: 7, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 168, Notes: "Hydrology observations can update slowly; live views tolerate older readings."},
	"linkedevents":   {SourceCode: "linkedevents", InitialEnabled: true, InitialDays: 7, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 24, Notes: "Event history is paged by date and capped by collector page limits."},
	"digitraffic":    {SourceCode: "digitraffic", InitialEnabled: false, InitialDays: 1, WindowSeconds: 3600, NormalizeAfterWindow: true, LiveMaxAgeHours: 6, Notes: "Road-weather history is station-heavy; keep it explicit until scoped controls exist."},
	"fingrid":        {SourceCode: "fingrid", InitialEnabled: false, InitialDays: 3, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 48, Notes: "Requires an API key, so bootstrap should be explicitly enabled."},
	"hsy":            {SourceCode: "hsy", InitialEnabled: false, InitialDays: 1, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 12, Notes: "Current-only HSY collector; policy is used for live freshness protection."},
	"digitransit":    {SourceCode: "digitransit", InitialEnabled: false, InitialDays: 1, WindowSeconds: 86400, NormalizeAfterWindow: true, LiveMaxAgeHours: 6, Notes: "Current service-alert feed only; policy is used for live freshness protection."},
}

const defaultLiveMaxAgeHours = 24

// For returns the policy for a source, and whether one is defined.
func For(sourceCode string) (Policy, bool) {
	policy, ok := policies[sourceCode]
	return policy, ok
}

// DefaultInitialSources lists the sources bootstrapped without explicit opt-in.
// The order is fixed so a run plans the same jobs every time.
func DefaultInitialSources() []string {
	ordered := []string{"fmi", "open_meteo_air", "porssisahko", "syke", "linkedevents", "digitraffic", "fingrid", "hsy", "digitransit"}
	enabled := []string{}
	for _, code := range ordered {
		if policy, ok := policies[code]; ok && policy.InitialEnabled {
			enabled = append(enabled, code)
		}
	}
	return enabled
}

// LiveCutoff is the oldest observation timestamp still considered current.
func LiveCutoff(sourceCode string, now time.Time) time.Time {
	maxAge := defaultLiveMaxAgeHours
	if policy, ok := policies[sourceCode]; ok {
		maxAge = policy.LiveMaxAgeHours
	}
	return now.UTC().Add(-time.Duration(maxAge) * time.Hour)
}

// IsCurrent reports whether a source's latest observation is fresh enough.
func IsCurrent(sourceCode string, observedAt *time.Time, now time.Time) bool {
	if observedAt == nil {
		return false
	}
	return !observedAt.UTC().Before(LiveCutoff(sourceCode, now))
}
