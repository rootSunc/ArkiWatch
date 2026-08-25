package recommendations

import "testing"

func baseRead() Read {
	return Read{
		ID: "r1", RecommendationType: "WEATHER", Priority: 1, Status: "PENDING",
		AdviceTitle: "Bring an umbrella", AdviceBody: "Rain expected this afternoon.",
		EventType: "WEATHER", EventSeverity: "MEDIUM",
	}
}

func TestLocalizedFallsBackToRationaleZH(t *testing.T) {
	read := baseRead()
	read.Rationale = map[string]any{
		"localized": map[string]any{
			"zh": map[string]any{"title": "带把雨伞", "body": "今天下午有雨。"},
		},
	}

	localized := read.Localized()

	if localized.AdviceTitleZH == nil || *localized.AdviceTitleZH != "带把雨伞" {
		t.Fatalf("expected the ZH title to come from Rationale, got %#v", localized.AdviceTitleZH)
	}
	if localized.AdviceBodyZH == nil || *localized.AdviceBodyZH != "今天下午有雨。" {
		t.Fatalf("expected the ZH body to come from Rationale, got %#v", localized.AdviceBodyZH)
	}
}

func TestLocalizedPrefersExplicitZHFieldsOverRationale(t *testing.T) {
	explicitTitle := "预设标题"
	read := baseRead()
	read.AdviceTitleZH = &explicitTitle
	read.Rationale = map[string]any{
		"localized": map[string]any{
			"zh": map[string]any{"title": "不应使用的标题", "body": "备用正文"},
		},
	}

	localized := read.Localized()

	if localized.AdviceTitleZH != &explicitTitle {
		t.Fatalf("expected the explicit ZH title to win over Rationale, got %#v", localized.AdviceTitleZH)
	}
	if localized.AdviceBodyZH == nil || *localized.AdviceBodyZH != "备用正文" {
		t.Fatalf("expected the body to still fall back independently of the title, got %#v", localized.AdviceBodyZH)
	}
}

func TestLocalizedHandlesMissingOrMalformedRationale(t *testing.T) {
	cases := map[string]map[string]any{
		"nil rationale":       nil,
		"missing localized":   {"other": "value"},
		"localized not a map": {"localized": "oops"},
		"missing zh":          {"localized": map[string]any{"en": map[string]any{"title": "x"}}},
		"zh not a map":        {"localized": map[string]any{"zh": "oops"}},
		"empty zh strings":    {"localized": map[string]any{"zh": map[string]any{"title": "", "body": ""}}},
	}
	for name, rationale := range cases {
		t.Run(name, func(t *testing.T) {
			read := baseRead()
			read.Rationale = rationale

			localized := read.Localized()

			if localized.AdviceTitleZH != nil || localized.AdviceBodyZH != nil {
				t.Fatalf("expected no ZH fields for %s, got title=%#v body=%#v", name, localized.AdviceTitleZH, localized.AdviceBodyZH)
			}
		})
	}
}

func TestAPIReturnsLocalizedFieldsAndOmitsInternalData(t *testing.T) {
	read := baseRead()
	read.Rationale = map[string]any{"localized": map[string]any{"zh": map[string]any{"title": "带把雨伞"}}}

	result := read.API()

	if result["advice_title_zh"].(*string) == nil || *result["advice_title_zh"].(*string) != "带把雨伞" {
		t.Fatalf("expected API() to expose the localized ZH title, got %#v", result["advice_title_zh"])
	}
	if _, exposesRationale := result["rationale"]; exposesRationale {
		t.Fatalf("expected API() to not expose the internal rationale map")
	}
	if result["id"] != "r1" || result["recommendation_type"] != "WEATHER" {
		t.Fatalf("unexpected core fields: %#v", result)
	}
}
