package assistant

import (
	"strings"
	"testing"
)

func TestSelectDataSourcesRoutesByKeyword(t *testing.T) {
	cases := map[string]string{
		"Will it rain this afternoon?":  "weather",
		"今天空气质量怎么样？":                    "air_quality",
		"When is electricity cheapest?": "energy",
		"Any roadworks on my drive?":    "traffic",
		"Is the metro delayed?":         "transit",
	}
	for question, expected := range cases {
		selected := SelectDataSources(question)
		if !contains(selected, expected) {
			t.Fatalf("%q did not select %s, got %v", question, expected, selected)
		}
		if !contains(selected, "platform_overview") {
			t.Fatalf("%q dropped the platform overview: %v", question, selected)
		}
	}
}

// A question that matches nothing must still be answered from live data, so the
// router widens instead of returning only the overview.
func TestSelectDataSourcesWidensWhenNothingMatches(t *testing.T) {
	selected := SelectDataSources("how is today looking overall?")
	for _, expected := range []string{"weather", "air_quality", "energy", "traffic", "transit", "platform_overview"} {
		if !contains(selected, expected) {
			t.Fatalf("unmatched question dropped %s: %v", expected, selected)
		}
	}
}

func TestBuildContextProducesFactsAndCitations(t *testing.T) {
	grounded := BuildContext(map[string]any{
		"air_quality": map[string]any{
			"checked_at":    "2026-08-22T12:00:00Z",
			"status":        "ready",
			"location":      "helsinki",
			"worst_label":   "fair",
			"worst_station": "Kallio",
			"worst_score":   float64(2),
			"stations": []any{
				map[string]any{"station": "Kallio", "label": "63", "score": float64(2), "pm2_5": float64(4.1)},
			},
		},
	})
	if len(grounded.Citations) != 1 || grounded.Citations[0].Source != "air_quality" {
		t.Fatalf("unexpected citations: %#v", grounded.Citations)
	}
	if grounded.Citations[0].CheckedAt == nil || *grounded.Citations[0].CheckedAt != "2026-08-22T12:00:00Z" {
		t.Fatalf("citation lost checked_at: %#v", grounded.Citations[0])
	}
	if len(grounded.DataContext) != 1 || grounded.DataContext[0] != "air_quality" {
		t.Fatalf("unexpected data context: %v", grounded.DataContext)
	}
	joined := strings.Join(grounded.Facts, "\n")
	for _, expected := range []string{"status=ready", "air_worst: label=fair", "Kallio", "pm2_5=4.1"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("facts missing %q:\n%s", expected, joined)
		}
	}
}

func TestBuildContextSkipsMissingPayloads(t *testing.T) {
	grounded := BuildContext(map[string]any{"weather": nil, "traffic": "not an object"})
	if len(grounded.Facts) != 0 || len(grounded.Citations) != 0 || len(grounded.DataContext) != 0 {
		t.Fatalf("unusable payloads produced context: %#v", grounded)
	}
}

// The prompt is the only place the model learns what is true, so the readings
// and the instruction to stay within them must both be present.
func TestSystemPromptCarriesReadingsAndConstraint(t *testing.T) {
	grounded := GroundedContext{Facts: []string{"air_quality: status=ready"}}
	prompt := assistantSystemPrompt("en", grounded)
	if !strings.Contains(prompt, "air_quality: status=ready") {
		t.Fatalf("prompt dropped the readings: %s", prompt)
	}
	if !strings.Contains(prompt, "Answer only from the ArkiWatch readings") {
		t.Fatalf("prompt dropped the grounding constraint: %s", prompt)
	}
	empty := assistantSystemPrompt("en", GroundedContext{})
	if !strings.Contains(empty, "No live ArkiWatch readings") {
		t.Fatalf("empty prompt should say so: %s", empty)
	}
}

// Without a provider the assistant should still report the data, because the
// readings are the useful part and they are available either way.
func TestFallbackChatReportsReadings(t *testing.T) {
	grounded := GroundedContext{
		Facts:       []string{"air_quality: status=ready", "traffic: status=watch"},
		Citations:   []Citation{{Source: "air_quality", Detail: "air_quality snapshot."}},
		DataContext: []string{"air_quality"},
	}
	result := fallbackChat("en", grounded)
	if result.AnswerMode != "fallback" {
		t.Fatalf("unexpected answer mode: %s", result.AnswerMode)
	}
	if !strings.Contains(result.Answer, "air_quality: status=ready") {
		t.Fatalf("fallback dropped the readings: %s", result.Answer)
	}
	if len(result.Citations) != 1 || len(result.DataContext) != 1 {
		t.Fatalf("fallback dropped citations or context: %#v", result)
	}
}

func TestFallbackChatWithoutDataStaysHonest(t *testing.T) {
	result := fallbackChat("zh", GroundedContext{})
	if strings.Contains(result.Answer, "- ") {
		t.Fatalf("empty fallback invented readings: %s", result.Answer)
	}
	if result.Citations == nil || result.DataContext == nil {
		t.Fatalf("fallback must serialize empty lists, not null: %#v", result)
	}
}

func TestClipKeepsMultibyteTextIntact(t *testing.T) {
	clipped := clip("空气质量非常好今天适合出门", 6)
	if []rune(clipped)[0] != '空' {
		t.Fatalf("clip corrupted multibyte text: %q", clipped)
	}
	if len([]rune(clipped)) != 6 {
		t.Fatalf("unexpected clipped length: %q", clipped)
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
