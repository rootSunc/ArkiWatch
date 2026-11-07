package airquality

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

type PollutantSummary struct {
	Average      *float64 `json:"average"`
	Peak         *float64 `json:"peak"`
	Reporting    int      `json:"reporting"`
	Caution      float64  `json:"caution"`
	Severe       float64  `json:"severe"`
	Tone         string   `json:"tone"`
	StationOrder []string `json:"station_order"`
}
type Detail struct {
	Tone         string                      `json:"tone"`
	StationOrder []string                    `json:"station_order"`
	ScoreCounts  map[int]int                 `json:"score_counts"`
	Coverage     map[string]int              `json:"coverage"`
	Pollutants   map[string]PollutantSummary `json:"pollutants"`
}

func scoreTone(s *int) string {
	if s == nil {
		return "neutral"
	}
	if *s >= 4 {
		return "bad"
	}
	if *s == 3 {
		return "warn"
	}
	return "good"
}
func pollutantTone(v *float64, caution, severe float64) string {
	if v == nil {
		return "neutral"
	}
	if *v >= severe {
		return "bad"
	}
	if *v >= caution {
		return "warn"
	}
	return "good"
}
func stationIndex(label string) *float64 {
	// Provider labels may start with a numeric index followed by descriptive text.
	value := strings.ReplaceAll(strings.TrimSpace(label), ",", ".")
	for n := len(value); n > 0; n-- {
		if v, err := strconv.ParseFloat(value[:n], 64); err == nil && !math.IsNaN(v) && !math.IsInf(v, 0) {
			return &v
		}
	}
	return nil
}
func EnrichDetail(c *Current) {
	missingWorst := c.WorstScore == nil
	d := Detail{StationOrder: []string{}, ScoreCounts: map[int]int{}, Coverage: map[string]int{}, Pollutants: map[string]PollutantSummary{}}
	for i := range c.Stations {
		s := &c.Stations[i]
		s.Index = stationIndex(s.Label)
		s.Tone = scoreTone(s.Score)
		s.PollutantTones = map[string]string{}
		if s.Score != nil {
			d.ScoreCounts[*s.Score]++
			d.Coverage["score"]++
			if missingWorst && (c.WorstScore == nil || *s.Score > *c.WorstScore) {
				v := *s.Score
				c.WorstScore = &v
			}
		}
		if s.Label != "" {
			d.Coverage["label"]++
		}
	}
	ranked := append([]Station{}, c.Stations...)
	val := func(v *int) int {
		if v == nil {
			return -1
		}
		return *v
	}
	index := func(v *float64) float64 {
		if v == nil {
			return -1
		}
		return *v
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if val(ranked[i].Score) != val(ranked[j].Score) {
			return val(ranked[i].Score) > val(ranked[j].Score)
		}
		return index(ranked[i].Index) > index(ranked[j].Index)
	})
	for _, s := range ranked {
		d.StationOrder = append(d.StationOrder, s.Station)
	}
	profiles := []struct {
		key             string
		caution, severe float64
		get             func(Station) *float64
	}{
		{"european_aqi", 40, 60, func(s Station) *float64 { return s.EuropeanAQI }},
		{"pm2_5", 10, 25, func(s Station) *float64 { return s.PM25 }},
		{"pm10", 20, 50, func(s Station) *float64 { return s.PM10 }},
		{"no2", 40, 100, func(s Station) *float64 { return s.NO2 }},
	}
	for _, p := range profiles {
		summary := PollutantSummary{Caution: p.caution, Severe: p.severe, StationOrder: []string{}}
		reporting := []Station{}
		total := 0.0
		for i := range c.Stations {
			s := &c.Stations[i]
			v := p.get(*s)
			s.PollutantTones[p.key] = pollutantTone(v, p.caution, p.severe)
			if v != nil {
				total += *v
				reporting = append(reporting, *s)
			}
		}
		sort.SliceStable(reporting, func(i, j int) bool { return *p.get(reporting[i]) > *p.get(reporting[j]) })
		summary.Reporting = len(reporting)
		d.Coverage[p.key] = len(reporting)
		if len(reporting) > 0 {
			avg := total / float64(len(reporting))
			peak := *p.get(reporting[0])
			summary.Average = &avg
			summary.Peak = &peak
		}
		for _, s := range reporting {
			summary.StationOrder = append(summary.StationOrder, s.Station)
		}
		summary.Tone = pollutantTone(summary.Average, p.caution, p.severe)
		d.Pollutants[p.key] = summary
	}
	for _, key := range []string{"score", "label", "european_aqi", "pm2_5", "pm10", "no2"} {
		count := d.Coverage[key]
		d.Coverage[key] = 0
		if len(c.Stations) > 0 {
			d.Coverage[key] = int(math.Round(float64(count) * 100 / float64(len(c.Stations))))
		}
	}
	d.Tone = scoreTone(c.WorstScore)
	c.Detail = d
}
