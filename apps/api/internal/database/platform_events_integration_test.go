package database

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
)

// A single overall LIMIT on the platform event read let one source take every
// slot. Linked Events publishes multi-year exhibitions, and one upstream row
// starts in year 0026, so ordering the whole set by starts_at put that source
// first and every other category came back with no events and an "empty"
// status against live data. Fixtures never showed it because they are curated.
func TestLoadPlatformGivesEverySourceEvents(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	city := "limit-" + randomID()[:8]

	flood := seedPlatformSource(t, store, ctx)
	quiet := seedPlatformSource(t, store, ctx)

	// The flooding source alone has to outnumber any plausible whole-result cap,
	// not just the per-source one, or a global LIMIT would still leave room for
	// the quiet source and the starvation would not reproduce. Every one of its
	// events starts long before the window, so start order alone puts them first.
	for i := 0; i < maxPlatformEventsPerSource*4; i++ {
		seedPlatformEvent(t, store, ctx, flood, city, "INFO",
			time.Date(26, 9, 23, 11, 20, 11, 0, time.UTC), now.Add(72*time.Hour))
	}
	// The quiet source carries what a user actually needs to see now.
	for i := 0; i < 3; i++ {
		seedPlatformEvent(t, store, ctx, quiet, city, "HIGH",
			now.Add(time.Duration(i)*time.Hour), now.Add(time.Duration(i+2)*time.Hour))
	}

	data, err := store.LoadPlatform(ctx, platform.PlatformQuery{Now: now, LocationRef: city})
	if err != nil {
		t.Fatal(err)
	}

	counts := map[string]int{}
	for _, event := range data.Events {
		counts[event.SourceCode]++
	}
	if counts[quiet] != 3 {
		t.Fatalf("the quiet source was starved: got %d of 3 events (flood source returned %d)", counts[quiet], counts[flood])
	}
	if counts[flood] > maxPlatformEventsPerSource {
		t.Fatalf("the flooding source exceeded its cap: %d > %d", counts[flood], maxPlatformEventsPerSource)
	}
}

// The cap must never hide the worst event, because a category derives its
// status from the highest severity it can see.
func TestLoadPlatformKeepsWorstEventWithinSourceCap(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	city := "severity-" + randomID()[:8]
	source := seedPlatformSource(t, store, ctx)

	// Enough low-severity noise to fill the cap on its own, all starting before
	// the single alert so that start order alone would drop the alert.
	for i := 0; i < maxPlatformEventsPerSource+10; i++ {
		seedPlatformEvent(t, store, ctx, source, city, "INFO", now.Add(-5*time.Hour), now.Add(24*time.Hour))
	}
	seedPlatformEvent(t, store, ctx, source, city, "HIGH", now.Add(2*time.Hour), now.Add(6*time.Hour))

	data, err := store.LoadPlatform(ctx, platform.PlatformQuery{Now: now, LocationRef: city})
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range data.Events {
		if event.Severity == "HIGH" {
			return
		}
	}
	t.Fatalf("the HIGH event was cut by the per-source cap; %d events returned", len(data.Events))
}

func seedPlatformSource(t *testing.T, store *Store, ctx context.Context) string {
	t.Helper()
	id := randomID()
	code := "platform-" + id[:8]
	if _, err := store.pool.Exec(ctx, `INSERT INTO data_sources (id, source_code, source_name, endpoint, auth_type, poll_interval_seconds, is_active)
		VALUES ($1,$2,'Platform limit test','https://example.test','NONE',300,true)`, id, code); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = store.pool.Exec(ctx, `DELETE FROM normalized_events WHERE source_id=$1`, id)
		_, _ = store.pool.Exec(ctx, `DELETE FROM data_sources WHERE id=$1`, id)
	})
	return code
}

func seedPlatformEvent(t *testing.T, store *Store, ctx context.Context, sourceCode, city, severity string, startsAt, endsAt time.Time) {
	t.Helper()
	id := randomID()
	if _, err := store.pool.Exec(ctx, `INSERT INTO normalized_events
		(id, event_type, source_id, severity, location_type, location_ref, starts_at, ends_at, title, summary, attributes, dedupe_key, created_at)
		SELECT $1, 'platform_limit_test', s.id, $2::severity, 'CITY', $3, $4, $5, 'Platform limit test', '', '{}'::jsonb, $6, now()
		FROM data_sources AS s WHERE s.source_code = $7`,
		id, severity, city, startsAt, endsAt, fmt.Sprintf("%s:platform_limit_test", id), sourceCode); err != nil {
		t.Fatal(err)
	}
}
