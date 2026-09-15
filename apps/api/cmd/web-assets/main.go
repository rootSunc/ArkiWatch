// Command web-assets generates offline read models using the production Go rules.
package main

import (
	"encoding/json"
	"flag"
	"os"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/briefing"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/signals"
)

func main() {
	decisions := flag.Bool("briefings", false, "read fixture inputs and emit Go decisions")
	costs := flag.Bool("energy-costs", false, "derive cost summaries from recorded fixture assumptions")
	flag.Parse()
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
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
