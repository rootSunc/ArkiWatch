// Package briefing assembles reusable public decisions from domain read models.
// It has no HTTP, database, locale, or browser dependencies.
package briefing

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/signals"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

type Action struct {
	ID             string   `json:"id"`
	ScenarioKey    string   `json:"scenario_key"`
	Title          string   `json:"title"`
	TitleZH        *string  `json:"title_zh,omitempty"`
	Body           string   `json:"body"`
	BodyZH         *string  `json:"body_zh,omitempty"`
	Severity       string   `json:"severity"`
	AreaScope      string   `json:"area_scope"`
	FreshnessState string   `json:"freshness_state"`
	ValidFrom      string   `json:"valid_from"`
	ValidTo        string   `json:"valid_to"`
	Evidence       []string `json:"evidence"`
}
type Dashboard struct {
	CheckedAt         string   `json:"checked_at"`
	SnapshotDate      *string  `json:"snapshot_date"`
	SnapshotAvailable *bool    `json:"snapshot_available"`
	CoverageRegion    string   `json:"coverage_region"`
	TopActions        []Action `json:"top_actions"`
	Timeline          []struct {
		ScenarioKey string  `json:"scenario_key"`
		Label       string  `json:"label"`
		LabelZH     *string `json:"label_zh"`
		Severity    string  `json:"severity"`
		StartsAt    string  `json:"starts_at"`
		EndsAt      string  `json:"ends_at"`
	} `json:"timeline"`
	ScenarioSections []struct {
		Recommendation Action  `json:"recommendation"`
		Key            string  `json:"key"`
		Description    string  `json:"description"`
		DescriptionZH  *string `json:"description_zh"`
	} `json:"scenario_sections"`
}
type Input struct {
	City            string              `json:"city"`
	Region          string              `json:"region"`
	Scope           timescope.Scope     `json:"scope"`
	Overview        platform.Overview   `json:"overview"`
	PublicDashboard Dashboard           `json:"publicDashboard"`
	Weather         *weather.Forecast   `json:"weather"`
	AirQuality      *airquality.Current `json:"airQuality"`
	Transit         *transit.Current    `json:"transit"`
	RoadRail        *traffic.Current    `json:"roadRail"`
	HouseholdEnergy *energy.Current     `json:"householdEnergy"`
	Energy          *energy.Current     `json:"energy"`
}
type TimelineItem struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	Title       string          `json:"title"`
	TitleZH     *string         `json:"title_zh,omitempty"`
	Detail      string          `json:"detail"`
	DetailZH    *string         `json:"detail_zh,omitempty"`
	Severity    string          `json:"severity"`
	StartsAt    string          `json:"startsAt"`
	EndsAt      string          `json:"endsAt"`
	CategoryKey string          `json:"categoryKey"`
	State       string          `json:"state"`
	ScenarioKey string          `json:"scenarioKey,omitempty"`
	Event       *platform.Event `json:"event,omitempty"`
}
type SourceHealth struct {
	CatalogSourceIDs []string `json:"catalog_source_ids"`
	Tracked          int      `json:"tracked"`
	Healthy          int      `json:"healthy"`
	Issues           int      `json:"issues"`
	Catalog          int      `json:"catalog"`
	Historical       bool     `json:"historical"`
}
type Summary struct {
	Tones              map[string]string `json:"tones"`
	TransitAlerts      int               `json:"transit_alerts"`
	RoadEvents         int               `json:"road_events"`
	CommuteTotal       int               `json:"commute_total"`
	CommuteAvailable   bool              `json:"commute_available"`
	HeadlineSummaryKey string            `json:"headline_summary_key"`
}
type Decision struct {
	ActionEligibility           map[string]bool             `json:"action_eligibility"`
	HeadlineActionID            string                      `json:"headline_action_id"`
	EvaluatedAt                 string                      `json:"evaluated_at"`
	ValidUntil                  string                      `json:"valid_until"`
	RecommendationMode          string                      `json:"recommendation_mode"`
	HistoricalSnapshotAvailable bool                        `json:"historical_snapshot_available"`
	HasScopedData               bool                        `json:"has_scoped_data"`
	TopActions                  []Action                    `json:"top_actions"`
	PlanItems                   []TimelineItem              `json:"plan_items"`
	Timeline                    []TimelineItem              `json:"timeline"`
	RecentEvents                []platform.Event            `json:"recent_events"`
	CategoryEvents              map[string][]platform.Event `json:"category_events"`
	SourceHealth                SourceHealth                `json:"source_health"`
	Summary                     Summary                     `json:"summary"`
}

func DecodeDashboard(value map[string]any) (Dashboard, error) {
	b, err := json.Marshal(value)
	if err != nil {
		return Dashboard{}, err
	}
	var d Dashboard
	err = json.Unmarshal(b, &d)
	return d, err
}
func state(start, end string, now time.Time) string {
	s, e := signals.ParseTime(start), signals.ParseTime(end)
	if s.After(now) {
		return "upcoming"
	}
	if !s.IsZero() && !e.IsZero() && !e.Before(now) {
		return "active"
	}
	return "ended"
}
func timeline(events []platform.Event, d Dashboard, now time.Time) []TimelineItem {
	items := []TimelineItem{}
	mapping := map[string]string{"outdoor": "weather", "home_air": "air", "commute": "mobility", "energy": "energy"}
	for i := range events {
		e := events[i]
		items = append(items, TimelineItem{ID: "event-" + e.ID, Kind: "event", Title: e.Title, TitleZH: e.TitleZH, Detail: e.Body, DetailZH: e.BodyZH, Severity: e.Severity, StartsAt: e.StartsAt, EndsAt: e.EndsAt, CategoryKey: e.CategoryKey, State: state(e.StartsAt, e.EndsAt, now), Event: &e})
	}
	for _, s := range d.Timeline {
		if signals.ParseTime(s.StartsAt).IsZero() || signals.ParseTime(s.EndsAt).IsZero() {
			continue
		}
		category := mapping[s.ScenarioKey]
		if category == "" {
			category = s.ScenarioKey
		}
		item := TimelineItem{ID: "scenario-" + s.ScenarioKey + "-" + s.StartsAt, Kind: "scenario", Title: s.Label, TitleZH: s.LabelZH, Detail: s.ScenarioKey, Severity: s.Severity, StartsAt: s.StartsAt, EndsAt: s.EndsAt, CategoryKey: category, ScenarioKey: s.ScenarioKey, State: state(s.StartsAt, s.EndsAt, now)}
		for _, section := range d.ScenarioSections {
			if section.Key == s.ScenarioKey {
				item.Detail = section.Description
				item.DetailZH = section.DescriptionZH
				break
			}
		}
		items = append(items, item)
	}
	seen := map[string]bool{}
	unique := []TimelineItem{}
	for _, item := range items {
		key := item.Kind + ":" + item.Title + ":" + item.StartsAt
		if !seen[key] {
			unique = append(unique, item)
			seen[key] = true
		}
	}
	rank := map[string]int{"active": 0, "upcoming": 1, "ended": 2}
	sort.SliceStable(unique, func(i, j int) bool {
		a, b := unique[i], unique[j]
		if rank[a.State] != rank[b.State] {
			return rank[a.State] < rank[b.State]
		}
		if a.State == "ended" {
			return signals.ParseTime(a.EndsAt).After(signals.ParseTime(b.EndsAt))
		}
		return signals.ParseTime(a.StartsAt).Before(signals.ParseTime(b.StartsAt))
	})
	if len(unique) > 10 {
		unique = unique[:10]
	}
	return unique
}
func scenario(item TimelineItem) string {
	if item.ScenarioKey != "" {
		return item.ScenarioKey
	}
	return map[string]string{"air": "home_air", "energy": "energy", "traffic": "commute", "transit": "commute", "weather": "outdoor"}[item.CategoryKey]
}
func plan(items []TimelineItem, exclude string, now time.Time) []TimelineItem {
	eligible := []TimelineItem{}
	for _, item := range items {
		end := signals.ParseTime(item.EndsAt)
		if end.IsZero() || end.Before(now) || strings.HasPrefix(strings.ToLower(item.Title), "no active ") || (exclude != "" && scenario(item) == exclude) {
			continue
		}
		if item.Kind == "scenario" || signals.SeverityRank(item.Severity) >= 2 {
			eligible = append(eligible, item)
		}
	}
	result := []TimelineItem{}
	for _, item := range eligible {
		duplicate := false
		if item.Kind == "event" {
			for _, other := range eligible {
				if other.Kind == "scenario" && scenario(item) == scenario(other) && signals.ParseTime(item.StartsAt).Before(signals.ParseTime(other.EndsAt)) && signals.ParseTime(other.StartsAt).Before(signals.ParseTime(item.EndsAt)) {
					duplicate = true
					break
				}
			}
		}
		if !duplicate {
			result = append(result, item)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := signals.SeverityRank(result[i].Severity), signals.SeverityRank(result[j].Severity)
		if a != b {
			return a > b
		}
		return signals.ParseTime(result[i].StartsAt).Before(signals.ParseTime(result[j].StartsAt))
	})
	if len(result) > 3 {
		result = result[:3]
	}
	return result
}
func Health(sources []platform.Source, historical bool) SourceHealth {
	result := SourceHealth{Historical: historical, CatalogSourceIDs: []string{}}
	for _, s := range sources {
		if strings.HasPrefix(s.ID, "catalog-") && s.RecordsIngested == nil {
			result.Catalog++
			result.CatalogSourceIDs = append(result.CatalogSourceIDs, s.ID)
			continue
		}
		result.Tracked++
		switch strings.ToLower(s.OperationalStatus) {
		case "healthy", "ready", "connected", "fetched":
			result.Healthy++
		}
	}
	if !historical {
		result.Issues = result.Tracked - result.Healthy
	}
	return result
}
func summarize(in Input) Summary {
	s := Summary{Tones: map[string]string{"outdoor": "neutral", "air": "neutral", "commute": "neutral", "energy": "neutral"}}
	if in.Weather != nil && signals.Available(in.Weather.Status) {
		s.Tones["outdoor"] = "good"
		if len(in.Weather.Warnings) > 0 {
			s.Tones["outdoor"] = "warn"
		}
	}
	if in.AirQuality != nil && signals.Available(in.AirQuality.Status) {
		s.Tones["air"] = "good"
		if in.AirQuality.WorstScore != nil {
			if *in.AirQuality.WorstScore >= 4 {
				s.Tones["air"] = "bad"
			} else if *in.AirQuality.WorstScore >= 3 {
				s.Tones["air"] = "warn"
			}
		}
	}
	if in.Transit != nil && signals.Available(in.Transit.Status) {
		s.CommuteAvailable = true
		s.TransitAlerts = in.Transit.Quality.ActiveAlertCount
	}
	if in.RoadRail != nil && signals.Available(in.RoadRail.Status) {
		s.CommuteAvailable = true
		s.RoadEvents = in.RoadRail.Quality.ActiveEventCount
	}
	s.CommuteTotal = s.TransitAlerts + s.RoadEvents
	if s.CommuteAvailable {
		s.Tones["commute"] = "good"
	}
	if s.CommuteTotal > 0 {
		s.Tones["commute"] = "warn"
	}
	for _, e := range []*energy.Current{in.HouseholdEnergy, in.Energy} {
		if e != nil && signals.Available(e.Status) && e.CurrentWindow != nil {
			s.Tones["energy"] = "good"
		}
	}
	for _, key := range []string{"outdoor", "air", "commute", "energy"} {
		if s.Tones[key] == "warn" || s.Tones[key] == "bad" {
			s.HeadlineSummaryKey = key
			break
		}
	}
	return s
}
func Build(in Input) Decision {
	now := in.Scope.ReferenceTime
	historical := in.Scope.Mode == "historical"
	d := in.PublicDashboard
	result := Decision{ActionEligibility: map[string]bool{}, EvaluatedAt: timescope.Format(now), ValidUntil: timescope.Format(now.Add(5 * time.Minute)), RecommendationMode: "live", HistoricalSnapshotAvailable: !historical || d.SnapshotAvailable == nil || *d.SnapshotAvailable, TopActions: []Action{}, PlanItems: []TimelineItem{}, CategoryEvents: map[string][]platform.Event{}, SourceHealth: Health(in.Overview.Sources, historical), Summary: summarize(in)}
	candidates := append([]platform.Event{}, in.Overview.RecentEvents...)
	for _, category := range in.Overview.Categories {
		candidates = append(candidates, category.Events...)
	}
	candidates = append(candidates, signals.WeatherEvents(in.Weather, in.City, now)...)
	candidates = append(candidates, signals.AirEvents(in.AirQuality, in.City, now)...)
	result.RecentEvents = signals.Curate(candidates, 6, in.City, now)
	result.Timeline = timeline(signals.Curate(candidates, 10, in.City, now), d, now)
	for _, category := range in.Overview.Categories {
		events := []platform.Event{}
		for _, e := range candidates {
			if e.CategoryKey == category.Key || (category.Key == "mobility" && (e.CategoryKey == "transit" || e.CategoryKey == "traffic")) {
				events = append(events, e)
			}
		}
		result.CategoryEvents[category.Key] = signals.Curate(events, 6, in.City, now)
	}
	mobility := []platform.Event{}
	for _, e := range candidates {
		if e.CategoryKey == "traffic" || e.CategoryKey == "transit" {
			mobility = append(mobility, e)
		}
	}
	result.CategoryEvents["mobility"] = signals.Curate(mobility, 6, in.City, now)
	checked := signals.ParseTime(d.CheckedAt)
	switch {
	case historical:
		result.RecommendationMode = "historical"
	case in.Region == "" || d.CoverageRegion == "" || !strings.EqualFold(in.Region, d.CoverageRegion):
		result.RecommendationMode = "out_of_scope"
	case (d.SnapshotAvailable != nil && !*d.SnapshotAvailable) || checked.IsZero() || now.Sub(checked) > 6*time.Hour || checked.Sub(now) > 5*time.Minute:
		result.RecommendationMode = "stale"
	}
	result.HasScopedData = result.HistoricalSnapshotAvailable && (len(d.TopActions) > 0 || len(d.ScenarioSections) > 0 || len(result.Timeline) > 0)
	for _, tone := range result.Summary.Tones {
		if result.HistoricalSnapshotAvailable && tone != "neutral" {
			result.HasScopedData = true
		}
	}
	for _, section := range d.ScenarioSections {
		result.ActionEligibility[section.Recommendation.ID] = result.RecommendationMode == "live" && eligible(section.Recommendation, now)
	}
	if result.RecommendationMode == "live" {
		for _, a := range d.TopActions {
			end := signals.ParseTime(a.ValidTo)
			if !eligible(a, now) {
				continue
			}
			result.TopActions = append(result.TopActions, a)
			if result.HeadlineActionID == "" && signals.SeverityRank(a.Severity) >= 2 {
				result.HeadlineActionID = a.ID
			}
			expiry := end.Add(time.Second)
			if expiry.Before(signals.ParseTime(result.ValidUntil)) {
				result.ValidUntil = timescope.Format(expiry)
			}
		}
		expiry := checked.Add(6*time.Hour + time.Second)
		if expiry.After(now) && expiry.Before(signals.ParseTime(result.ValidUntil)) {
			result.ValidUntil = timescope.Format(expiry)
		}
		exclude := ""
		if len(result.TopActions) > 0 {
			exclude = result.TopActions[0].ScenarioKey
		}
		result.PlanItems = plan(result.Timeline, exclude, now)
	}
	// Refresh before any visible decision boundary, including scenario-only
	// advice and timeline state transitions. Historical snapshots do not poll.
	if !historical {
		bound := func(value string) {
			t := signals.ParseTime(value).Add(time.Second)
			if t.After(now) && t.Before(signals.ParseTime(result.ValidUntil)) {
				result.ValidUntil = timescope.Format(t)
			}
		}
		for _, section := range d.ScenarioSections {
			bound(section.Recommendation.ValidTo)
		}
		for _, item := range result.Timeline {
			bound(item.StartsAt)
			bound(item.EndsAt)
		}
	}
	return result
}

func eligible(a Action, now time.Time) bool {
	start, end := signals.ParseTime(a.ValidFrom), signals.ParseTime(a.ValidTo)
	return a.ID != "" && a.FreshnessState != "placeholder" && !strings.HasPrefix(a.ID, "placeholder-") && !start.IsZero() && !end.IsZero() && !end.Before(now) && !end.Before(start)
}
