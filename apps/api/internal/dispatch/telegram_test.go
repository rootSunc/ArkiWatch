package dispatch

import (
	"strings"
	"testing"
	"time"
)

func TestTrimMessageCapsAtTelegramLimit(t *testing.T) {
	short := "hello"
	if got := trimMessage(short); got != short {
		t.Fatalf("expected a short message to pass through unchanged, got %q", got)
	}

	long := strings.Repeat("a", 5000)
	got := trimMessage(long)
	if len(got) != 4096 {
		t.Fatalf("expected the message to be capped at 4096 chars, got %d", len(got))
	}
	if got != long[:4096] {
		t.Fatalf("expected a plain prefix truncation")
	}
}

func TestFormatRecommendationIncludesValidityWhenPresent(t *testing.T) {
	withoutValidity := FormatRecommendation("Bring an umbrella", "Rain expected this afternoon.", nil)
	if !strings.Contains(withoutValidity, "Bring an umbrella") || !strings.Contains(withoutValidity, "Rain expected this afternoon.") {
		t.Fatalf("expected title and body in the message: %q", withoutValidity)
	}
	if strings.Contains(withoutValidity, "Valid until") {
		t.Fatalf("expected no validity line without a validTo: %q", withoutValidity)
	}

	validTo := time.Date(2026, 4, 12, 18, 30, 0, 0, time.UTC)
	withValidity := FormatRecommendation("Bring an umbrella", "Rain expected this afternoon.", &validTo)
	if !strings.Contains(withValidity, "Valid until 2026-04-12 18:30 UTC") {
		t.Fatalf("expected a formatted validity line: %q", withValidity)
	}
}

func TestFormatPublicBroadcastIncludesScopeAndArea(t *testing.T) {
	message := FormatPublicBroadcast("Outdoor", "Air quality alert", "PM2.5 levels are elevated.", "Helsinki-Uusimaa", nil)

	if !strings.Contains(message, "ArkiWatch outdoor") {
		t.Fatalf("expected the scenario to be lowercased in the header: %q", message)
	}
	if !strings.Contains(message, "Scope: helsinki-uusimaa") {
		t.Fatalf("expected a lowercased scope line: %q", message)
	}
	if !strings.Contains(message, "Air quality alert") || !strings.Contains(message, "PM2.5 levels are elevated.") {
		t.Fatalf("expected title and body in the broadcast: %q", message)
	}
}

func TestFormatPublicBroadcastTruncatesToTelegramLimit(t *testing.T) {
	message := FormatPublicBroadcast("Outdoor", "Title", strings.Repeat("x", 5000), "Helsinki", nil)
	if len(message) != 4096 {
		t.Fatalf("expected the broadcast to be capped at 4096 chars, got %d", len(message))
	}
}
