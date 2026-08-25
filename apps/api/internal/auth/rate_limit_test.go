package auth

import (
	"testing"
	"time"
)

func TestCheckAllowsUpToLimitThenBlocksWithRetryAfter(t *testing.T) {
	limiter := NewSlidingWindowRateLimiter(0)
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	window := 10 * time.Second

	if decision := limiter.Check("ip1", 2, window, now); !decision.Allowed {
		t.Fatalf("expected the first request to be allowed: %+v", decision)
	}
	if decision := limiter.Check("ip1", 2, window, now.Add(1*time.Second)); !decision.Allowed {
		t.Fatalf("expected the second request to be allowed: %+v", decision)
	}

	decision := limiter.Check("ip1", 2, window, now.Add(2*time.Second))
	if decision.Allowed {
		t.Fatalf("expected the third request within the window to be blocked")
	}
	if decision.RetryAfterSeconds != 8 {
		t.Fatalf("expected 8s until the oldest request ages out of a 10s window, got %d", decision.RetryAfterSeconds)
	}
}

func TestCheckAllowsAgainOnceTheWindowFullySlidesPast(t *testing.T) {
	limiter := NewSlidingWindowRateLimiter(0)
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	window := 10 * time.Second

	limiter.Check("ip1", 2, window, now)
	limiter.Check("ip1", 2, window, now.Add(1*time.Second))
	if decision := limiter.Check("ip1", 2, window, now.Add(2*time.Second)); decision.Allowed {
		t.Fatalf("expected the limiter to be exhausted before the window slides")
	}

	// Well past both prior requests' 10s window, not just barely past it.
	decision := limiter.Check("ip1", 2, window, now.Add(15*time.Second))
	if !decision.Allowed {
		t.Fatalf("expected a request after the window fully expired to be allowed: %+v", decision)
	}
}

func TestCheckTracksKeysIndependently(t *testing.T) {
	limiter := NewSlidingWindowRateLimiter(0)
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	window := 10 * time.Second

	limiter.Check("ip1", 1, window, now)
	if decision := limiter.Check("ip1", 1, window, now.Add(time.Second)); decision.Allowed {
		t.Fatalf("expected ip1 to be exhausted at its limit of 1")
	}

	if decision := limiter.Check("ip2", 1, window, now.Add(time.Second)); !decision.Allowed {
		t.Fatalf("expected an unrelated key to have its own independent budget: %+v", decision)
	}
}

func TestCheckFailsClosedForNonPositiveLimitOrWindow(t *testing.T) {
	limiter := NewSlidingWindowRateLimiter(0)
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)

	if decision := limiter.Check("x", 0, 10*time.Second, now); decision.Allowed || decision.RetryAfterSeconds != 1 {
		t.Fatalf("expected a non-positive limit to fail closed, got %+v", decision)
	}
	if decision := limiter.Check("x", 5, 0, now); decision.Allowed || decision.RetryAfterSeconds != 1 {
		t.Fatalf("expected a non-positive window to fail closed, got %+v", decision)
	}
}

func TestEvictBoundsTrackedKeysToMaxKeysByLeastRecentActivity(t *testing.T) {
	limiter := NewSlidingWindowRateLimiter(2)
	now := time.Date(2026, 4, 12, 6, 0, 0, 0, time.UTC)
	window := time.Hour

	limiter.Check("a", 100, window, now)
	limiter.Check("b", 100, window, now.Add(1*time.Second))
	limiter.Check("c", 100, window, now.Add(2*time.Second))

	if len(limiter.requests) != 2 {
		t.Fatalf("expected eviction to cap tracked keys at maxKeys=2, got %d keys: %v", len(limiter.requests), limiter.requests)
	}
	if _, stillTracked := limiter.requests["a"]; stillTracked {
		t.Fatalf("expected the least-recently-active key to be evicted first")
	}
	if _, ok := limiter.requests["b"]; !ok {
		t.Fatalf("expected the more recently active key b to survive eviction")
	}
	if _, ok := limiter.requests["c"]; !ok {
		t.Fatalf("expected the just-added key c to survive eviction")
	}
}
