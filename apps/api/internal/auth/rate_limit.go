package auth

import (
	"math"
	"sync"
	"time"
)

type RateLimitDecision struct {
	Allowed           bool
	RetryAfterSeconds int
}

type SlidingWindowRateLimiter struct {
	mu       sync.Mutex
	maxKeys  int
	requests map[string][]time.Time
}

func NewSlidingWindowRateLimiter(maxKeys int) *SlidingWindowRateLimiter {
	if maxKeys <= 0 {
		maxKeys = 4096
	}
	return &SlidingWindowRateLimiter{maxKeys: maxKeys, requests: make(map[string][]time.Time)}
}

func (limiter *SlidingWindowRateLimiter) Check(key string, limit int, window time.Duration, now time.Time) RateLimitDecision {
	if limit <= 0 || window <= 0 {
		return RateLimitDecision{Allowed: false, RetryAfterSeconds: 1}
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	cutoff := now.Add(-window)
	bucket := limiter.requests[key]
	firstValid := 0
	for firstValid < len(bucket) && !bucket[firstValid].After(cutoff) {
		firstValid++
	}
	bucket = bucket[firstValid:]
	if len(bucket) >= limit {
		retryAfter := int(math.Ceil(bucket[0].Add(window).Sub(now).Seconds()))
		if retryAfter < 1 {
			retryAfter = 1
		}
		limiter.requests[key] = bucket
		return RateLimitDecision{Allowed: false, RetryAfterSeconds: retryAfter}
	}
	bucket = append(bucket, now)
	limiter.requests[key] = bucket
	limiter.evict(key)
	return RateLimitDecision{Allowed: true}
}

func (limiter *SlidingWindowRateLimiter) evict(exclude string) {
	for len(limiter.requests) > limiter.maxKeys {
		oldestKey := ""
		var oldest time.Time
		for key, bucket := range limiter.requests {
			if key == exclude || len(bucket) == 0 {
				continue
			}
			if oldestKey == "" || bucket[len(bucket)-1].Before(oldest) {
				oldestKey = key
				oldest = bucket[len(bucket)-1]
			}
		}
		if oldestKey == "" {
			return
		}
		delete(limiter.requests, oldestKey)
	}
}
