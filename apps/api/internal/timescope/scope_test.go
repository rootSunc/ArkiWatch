package timescope

import (
	"testing"
	"time"
)

func TestBuildLiveScopeHasNoWindow(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)

	scope, err := Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	if scope.Mode != "live" || scope.Date != nil || scope.WindowStart != nil || scope.WindowEnd != nil {
		t.Fatalf("expected a windowless live scope, got %#v", scope)
	}
	if !scope.ReferenceTime.Equal(now) {
		t.Fatalf("expected the live reference time to be now, got %v", scope.ReferenceTime)
	}
}

func TestBuildHistoricalScopeComputesUTCDayWindowInTargetTimezone(t *testing.T) {
	// Helsinki is UTC+2 in January (no DST), so local midnight on the 15th
	// falls on the 14th at 22:00 UTC.
	targetDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)

	scope, err := Build(&targetDate, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}

	if scope.Mode != "historical" {
		t.Fatalf("expected historical mode, got %q", scope.Mode)
	}
	if scope.Date == nil || *scope.Date != "2026-01-15" {
		t.Fatalf("unexpected scope date: %v", scope.Date)
	}
	wantStart := time.Date(2026, 1, 14, 22, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, 1, 15, 22, 0, 0, 0, time.UTC)
	if scope.WindowStart == nil || !scope.WindowStart.Equal(wantStart) {
		t.Fatalf("expected window start %v, got %v", wantStart, scope.WindowStart)
	}
	if scope.WindowEnd == nil || !scope.WindowEnd.Equal(wantEnd) {
		t.Fatalf("expected window end %v, got %v", wantEnd, scope.WindowEnd)
	}
	if !scope.ReferenceTime.Equal(now) {
		t.Fatalf("expected reference time to stay at now when inside the window, got %v", scope.ReferenceTime)
	}
}

func TestBuildClampsReferenceTimeToWindowBounds(t *testing.T) {
	targetDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	wantStart := time.Date(2026, 1, 14, 22, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, 1, 15, 22, 0, 0, 0, time.UTC)

	before, err := Build(&targetDate, time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC), "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	if !before.ReferenceTime.Equal(wantStart) {
		t.Fatalf("expected a now before the window to clamp to window start, got %v", before.ReferenceTime)
	}

	after, err := Build(&targetDate, time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	wantAfter := wantEnd.Add(-time.Second)
	if !after.ReferenceTime.Equal(wantAfter) {
		t.Fatalf("expected a now after the window to clamp to just before window end, got %v", after.ReferenceTime)
	}
}

func TestBuildRejectsUnknownTimezone(t *testing.T) {
	if _, err := Build(nil, time.Now(), "Not/A_Real_Zone"); err == nil {
		t.Fatal("expected an error for an unknown timezone")
	}
}

func TestFormatRendersExplicitUTCOffsetWithoutTrailingZeros(t *testing.T) {
	got := Format(time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC))
	if got != "2026-04-12T06:00:00+00:00" {
		t.Fatalf("unexpected format: %q", got)
	}

	// A non-UTC input must still be normalized to a UTC offset.
	helsinki, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	local := time.Date(2026, 1, 15, 8, 0, 0, 0, helsinki) // EET, UTC+2
	if got := Format(local); got != "2026-01-15T06:00:00+00:00" {
		t.Fatalf("expected the local time to be converted to UTC, got %q", got)
	}
}

func TestScopePayloadFormatsWindowAndReferenceFields(t *testing.T) {
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	live, err := Build(nil, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	payload := live.Payload()
	if payload["mode"] != "live" {
		t.Fatalf("expected live mode in the payload: %#v", payload)
	}
	if ws, ok := payload["window_start"].(*string); !ok || ws != nil {
		t.Fatalf("expected a nil *string window_start for a live scope: %#v", payload["window_start"])
	}
	if we, ok := payload["window_end"].(*string); !ok || we != nil {
		t.Fatalf("expected a nil *string window_end for a live scope: %#v", payload["window_end"])
	}
	if payload["reference_time"] != Format(now) {
		t.Fatalf("expected reference_time to be formatted, got %#v", payload["reference_time"])
	}

	targetDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	historical, err := Build(&targetDate, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	payload = historical.Payload()
	gotStart, ok := payload["window_start"].(*string)
	if !ok || gotStart == nil || *gotStart != Format(*historical.WindowStart) {
		t.Fatalf("expected a formatted window_start in the payload: %#v", payload["window_start"])
	}
	gotEnd, ok := payload["window_end"].(*string)
	if !ok || gotEnd == nil || *gotEnd != Format(*historical.WindowEnd) {
		t.Fatalf("expected a formatted window_end in the payload: %#v", payload["window_end"])
	}
}
