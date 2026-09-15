// Command web-assets generates offline read models using the production Go rules.
package main

import (
	"encoding/json"
	"flag"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/readmodel"
	"os"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/briefing"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/signals"
)

func main() {
	details := flag.Bool("details", false, "enrich offline detail models")
	decisions := flag.Bool("briefings", false, "read fixture inputs and emit Go decisions")
	costs := flag.Bool("energy-costs", false, "derive cost summaries from recorded fixture assumptions")
	flag.Parse()
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if *details {
		var inputs map[string]map[string]any
		if err := json.NewDecoder(os.Stdin).Decode(&inputs); err != nil {
			panic(err)
		}
		result := map[string]map[string]any{}
		for key, fixture := range inputs {
			output := map[string]any{}
			for _, category := range []string{"weather", "airQuality", "transit", "roadRail", "overview"} {
				data, _ := fixture[category].(map[string]any)
				if err := readmodel.Detail(category, data); err != nil {
					panic(err)
				}
				fields := map[string][]string{"weather": {"points", "advisories", "warnings"}, "airQuality": {"stations", "detail", "worst_score"}, "transit": {"alerts", "detail"}, "roadRail": {"incidents", "detail"}, "overview": {"categories", "recent_events"}}
				patch := map[string]any{}
				for _, field := range fields[category] {
					patch[field] = data[field]
				}
				output[category] = patch
			}
			history, _ := fixture["history"].(map[string]any)
			for category, snapshots := range history {
				for _, raw := range snapshots.([]any) {
					snapshot := raw.(map[string]any)
					data, _ := snapshot["data"].(map[string]any)
					if err := readmodel.Detail(category, data); err != nil {
						panic(err)
					}
				}
			}
			output["history"] = history
			result[key] = output
		}
		if err := encoder.Encode(result); err != nil {
			panic(err)
		}
		return
	}
	if *costs {
		var inputs map[string]map[string]any
		if err := json.NewDecoder(os.Stdin).Decode(&inputs); err != nil {
			panic(err)
		}
		result := map[string]map[string]any{}
		for key, data := range inputs {
			energy.EnrichHistoricalCosts(map[string]any{"data": data})
			quality, _ := data["quality"].(map[string]any)
			result[key] = map[string]any{}
			for _, field := range []string{"average_cost_eur", "minimum_cost_eur", "maximum_cost_eur", "cost_status"} {
				result[key][field] = quality[field]
			}
		}
		if err := encoder.Encode(result); err != nil {
			panic(err)
		}
		return
	}
	if !*decisions {
		if err := encoder.Encode(platform.BuildCoverage(config.Config{DefaultPlace: "helsinki"})); err != nil {
			panic(err)
		}
		return
	}
	var inputs map[string]briefing.Input
	if err := json.NewDecoder(os.Stdin).Decode(&inputs); err != nil {
		panic(err)
	}
	result := map[string]briefing.Decision{}
	for key, in := range inputs {
		if in.PublicDashboard.CoverageRegion == "" {
			in.PublicDashboard.CoverageRegion = "Uusimaa"
		}
		in.Scope.Mode, _ = in.Overview.TimeScope["mode"].(string)
		reference, _ := in.Overview.TimeScope["reference_time"].(string)
		in.Scope.ReferenceTime = signals.ParseTime(reference)
		if in.Scope.ReferenceTime.IsZero() {
			panic("fixture reference time is required")
		}
		result[key] = briefing.Build(in)
	}
	if err := encoder.Encode(result); err != nil {
		panic(err)
	}
}
