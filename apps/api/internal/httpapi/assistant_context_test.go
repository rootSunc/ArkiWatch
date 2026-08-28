package httpapi

import "testing"

func TestLastUserMessageFindsTheMostRecentUserTurn(t *testing.T) {
	payload := assistantChatPayload{Messages: []assistantMessagePayload{
		{Role: "user", Content: "first question"},
		{Role: "assistant", Content: "an answer"},
		{Role: "user", Content: "follow-up question"},
	}}
	if got := lastUserMessage(payload); got != "follow-up question" {
		t.Fatalf("expected the most recent user message, got %q", got)
	}
	if got := lastUserMessage(assistantChatPayload{}); got != "" {
		t.Fatalf("expected an empty string with no messages, got %q", got)
	}
	if got := lastUserMessage(assistantChatPayload{Messages: []assistantMessagePayload{{Role: "assistant", Content: "no user turn yet"}}}); got != "" {
		t.Fatalf("expected an empty string when only assistant turns exist, got %q", got)
	}
}

func TestCityFromPayloadTrimsAndHandlesNil(t *testing.T) {
	city := "  Espoo  "
	if got := cityFromPayload(assistantChatPayload{City: &city}); got != "Espoo" {
		t.Fatalf("expected the city trimmed, got %q", got)
	}
	if got := cityFromPayload(assistantChatPayload{}); got != "" {
		t.Fatalf("expected an empty string when City is nil, got %q", got)
	}
}

func TestTargetDateFromPayloadParsesOrReturnsNil(t *testing.T) {
	if got := targetDateFromPayload(assistantChatPayload{}); got != nil {
		t.Fatalf("expected nil when Date is nil, got %v", got)
	}
	blank := "   "
	if got := targetDateFromPayload(assistantChatPayload{Date: &blank}); got != nil {
		t.Fatalf("expected nil when Date is blank, got %v", got)
	}
	malformed := "12/31/2026"
	if got := targetDateFromPayload(assistantChatPayload{Date: &malformed}); got != nil {
		t.Fatalf("expected nil for a malformed date, got %v", got)
	}
	valid := "2026-04-12"
	got := targetDateFromPayload(assistantChatPayload{Date: &valid})
	if got == nil || got.Format("2006-01-02") != "2026-04-12" {
		t.Fatalf("expected the parsed date, got %v", got)
	}
}
