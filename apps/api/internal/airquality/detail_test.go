package airquality

import "testing"

func TestDetailMissingMeasurementsAndBoundaries(t *testing.T) {
	score := 3
	high := 5
	pm := 10.0
	severe := 25.0
	c := Current{Stations: []Station{{Station: "missing"}, {Station: "fair", Score: &score, PM25: &pm}, {Station: "worst", Score: &high, PM25: &severe}}}
	EnrichDetail(&c)
	d := c.Detail
	p := d.Pollutants["pm2_5"]
	if c.WorstScore == nil || *c.WorstScore != 5 || d.StationOrder[0] != "worst" || d.Coverage["pm2_5"] != 67 || p.Reporting != 2 || p.Average == nil || *p.Average != 17.5 {
		t.Fatalf("%+v", d)
	}
	if c.Stations[0].PollutantTones["pm2_5"] != "neutral" || c.Stations[1].PollutantTones["pm2_5"] != "warn" || c.Stations[2].PollutantTones["pm2_5"] != "bad" {
		t.Fatalf("%+v", c.Stations)
	}
	c = Current{}
	EnrichDetail(&c)
	if c.WorstScore != nil || c.Detail.Pollutants["pm2_5"].Average != nil || c.Detail.Tone != "neutral" {
		t.Fatal("empty data should remain unknown")
	}
}
func TestDetailPreservesAuthoritativeWorstScore(t *testing.T) {
	authoritative, station := 2, 5
	c := Current{WorstScore: &authoritative, Stations: []Station{{Score: &station}}}
	EnrichDetail(&c)
	if *c.WorstScore != 2 {
		t.Fatal("overrode authoritative score")
	}
}
