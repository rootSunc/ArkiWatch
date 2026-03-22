package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/assistant"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/transit"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

// groundAssistant loads the live read models a question needs and turns them
// into prompt facts and citations.
//
// A dataset that fails to load is left out rather than failing the request: a
// partially grounded answer with honest citations is more useful than no answer,
// and the model is told to work only from what it was given.
func (s *Server) groundAssistant(request *http.Request, payload assistantChatPayload) assistant.GroundedContext {
	cityRef := platform.NormalizeCityRef(cityFromPayload(payload), s.cfg.DefaultPlace)
	if !containsString(platform.SupportedCityRefs(s.cfg), cityRef) {
		cityRef = platform.NormalizeCityRef("", s.cfg.DefaultPlace)
	}
	now := s.now().UTC()
	scope, err := timescope.DefaultScope(targetDateFromPayload(payload), now, s.cfg)
	if err != nil {
		return assistant.GroundedContext{}
	}
	historical := scope.Mode == "historical"
	ctx := request.Context()
	// The assistant reports the household-facing price feed, which is the one
	// the product's energy advice is written against.
	const defaultEnergySource = "porssisahko"

	payloads := map[string]any{}
	for _, dataset := range assistant.SelectDataSources(lastUserMessage(payload)) {
		switch dataset {
		case "weather":
			if s.weather == nil {
				continue
			}
			if data, err := s.weather.LoadWeather(ctx, observations.WeatherQuery{Now: now, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd}); err == nil {
				payloads[dataset] = weather.Build(data, scope, now)
			}
		case "air_quality":
			if s.airQuality == nil {
				continue
			}
			if data, err := s.airQuality.LoadAirQuality(ctx, airquality.Query{Now: now, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd}); err == nil {
				payloads[dataset] = airquality.Build(data, scope, now, cityRef)
			}
		case "energy":
			if s.energy == nil {
				continue
			}
			if data, err := s.energy.LoadEnergy(ctx, energy.Query{Now: now, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, SourceCode: defaultEnergySource, Historical: historical, LookaheadHours: s.cfg.SnapshotLookaheadHours}); err == nil {
				payloads[dataset] = energy.Build(data, scope, now, defaultEnergySource, s.cfg)
			}
		case "traffic":
			if s.traffic == nil {
				continue
			}
			if data, err := s.traffic.LoadTraffic(ctx, traffic.Query{Now: now, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: historical}); err == nil {
				payloads[dataset] = traffic.Build(data, scope, now, cityRef)
			}
		case "transit":
			if s.transit == nil {
				continue
			}
			if data, err := s.transit.LoadTransit(ctx, observations.TransitQuery{Now: now, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: historical}); err == nil {
				payloads[dataset] = transit.Build(data, scope, now, cityRef)
			}
		case "platform_overview":
			payloads[dataset] = s.platformOverviewPayload(ctx, cityRef, scope)
		}
	}
	return assistant.BuildContext(payloads)
}

func (s *Server) platformOverviewPayload(ctx context.Context, cityRef string, scope timescope.Scope) any {
	statusItems := []sources.Status{}
	if s.sources != nil {
		statusItems, _ = s.sources.ListSourceStatus(ctx)
	}
	data := platform.PlatformData{}
	if s.platformReader != nil {
		loaded, err := s.platformReader.LoadPlatform(ctx, platform.PlatformQuery{Now: scope.ReferenceTime, LocationRef: cityRef, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, Historical: scope.Mode == "historical"})
		if err == nil {
			data = loaded
		}
	}
	return platform.BuildOverview(data, scope, s.cfg, statusItems, cityRef)
}

func lastUserMessage(payload assistantChatPayload) string {
	for index := len(payload.Messages) - 1; index >= 0; index-- {
		if payload.Messages[index].Role == "user" {
			return payload.Messages[index].Content
		}
	}
	return ""
}

func cityFromPayload(payload assistantChatPayload) string {
	if payload.City == nil {
		return ""
	}
	return strings.TrimSpace(*payload.City)
}

func targetDateFromPayload(payload assistantChatPayload) *time.Time {
	if payload.Date == nil || strings.TrimSpace(*payload.Date) == "" {
		return nil
	}
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(*payload.Date))
	if err != nil {
		return nil
	}
	return &parsed
}
