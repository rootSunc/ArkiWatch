package detailstate

import "testing"

func TestIntervalBoundaries(t *testing.T) {
	for _, tt := range []struct{ start, end, reference, want string }{
		{"2026-08-08T08:00:00Z", "2026-08-08T09:00:00Z", "2026-08-08T08:00:00Z", "active"},
		{"2026-08-08T08:00:00Z", "2026-08-08T09:00:00Z", "2026-08-08T09:00:00Z", "active"},
		{"2026-08-08T08:00:00Z", "2026-08-08T09:00:00Z", "2026-08-08T09:00:01Z", "ended"},
		{"2026-08-08T08:00:00Z", "2026-08-08T09:00:00Z", "2026-08-08T07:00:00Z", "upcoming"},
		{"2026-08-08T10:00:00Z", "2026-08-08T09:00:00Z", "2026-08-08T07:00:00Z", "ended"},
		{"invalid", "2026-08-08T09:00:00Z", "2026-08-08T07:00:00Z", "ended"},
	} {
		if got := State(tt.start, tt.end, Parse(tt.reference)); got != tt.want {
			t.Fatalf("%+v got %s", tt, got)
		}
	}
}
func TestSummaryCriticalAndUpcoming(t *testing.T) {
	s := Summarize([]Event{{Severity: "critical", State: "active", EndsAt: "2026-08-08T10:00:00Z"}, {Severity: "HIGH", State: "upcoming"}, {Severity: "LOW", State: "active", EndsAt: "2026-08-08T09:00:00Z", Weather: true}})
	if s.Risk != "high_active" || s.HighestSeverity != "CRITICAL" || s.HighUpcoming != 1 || s.WeatherActive != 1 || s.NextActiveEnd == nil || *s.NextActiveEnd != "2026-08-08T09:00:00Z" {
		t.Fatalf("%+v", s)
	}
}
