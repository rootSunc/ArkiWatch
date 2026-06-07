package observability

import (
	"sync"
	"time"
)

// ReadCache is a small TTL cache for read-model responses.
//
// The public dashboard and platform overview are recomputed from the same rows
// for every visitor between pipeline runs, so a short TTL removes most of that
// repeated work. A zero TTL disables the cache entirely.
type ReadCache struct {
	ttl   time.Duration
	now   func() time.Time
	mutex sync.Mutex
	items map[string]cacheEntry
}

type cacheEntry struct {
	value     any
	expiresAt time.Time
}

func NewReadCache(ttlSeconds int) *ReadCache {
	return &ReadCache{ttl: time.Duration(ttlSeconds) * time.Second, now: time.Now, items: map[string]cacheEntry{}}
}

func (cache *ReadCache) Enabled() bool { return cache != nil && cache.ttl > 0 }

func (cache *ReadCache) Get(key string) (any, bool) {
	if !cache.Enabled() {
		return nil, false
	}
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	entry, ok := cache.items[key]
	if !ok {
		return nil, false
	}
	if !cache.now().Before(entry.expiresAt) {
		delete(cache.items, key)
		return nil, false
	}
	return entry.value, true
}

func (cache *ReadCache) Set(key string, value any) {
	if !cache.Enabled() {
		return
	}
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	cache.items[key] = cacheEntry{value: value, expiresAt: cache.now().Add(cache.ttl)}
	cache.evictExpiredLocked()
}

// Invalidate clears everything. The pipeline calls this after writing new
// snapshots so a cached payload cannot outlive the data it was built from.
func (cache *ReadCache) Invalidate() {
	if cache == nil {
		return
	}
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	cache.items = map[string]cacheEntry{}
}

// evictExpiredLocked keeps the map from growing without bound; entries are only
// removed on read otherwise, and a key that is never read again would linger.
func (cache *ReadCache) evictExpiredLocked() {
	now := cache.now()
	for key, entry := range cache.items {
		if !now.Before(entry.expiresAt) {
			delete(cache.items, key)
		}
	}
}
