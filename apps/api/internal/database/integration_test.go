package database

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
)

// openTestStore connects to the database CI provisions for the API job. The
// tests skip rather than fail when it is absent so `go test ./...` still works
// on a machine without PostgreSQL.
func openTestStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set; skipping database integration test")
	}
	store, err := Open(context.Background(), dsn)
	if err != nil {
		t.Skipf("database is unreachable: %v", err)
	}
	t.Cleanup(store.Close)
	return store
}

func testConfig() config.Config {
	return config.Config{Timezone: "Europe/Helsinki", DefaultPlace: "Helsinki", HouseholdElectricityProvider: "Fortum", HouseholdUsageKWh: 2.0}
}

// A historical energy read used to fail at plan time because the untyped bind
// parameter in the window filter was inferred as an interval. The HTTP handler
// swallows that error into an "unavailable" 200, so only a direct call catches
// a regression.
func TestLoadEnergyHistoricalWindowQueryIsValid(t *testing.T) {
	store := openTestStore(t)
	now := time.Now().UTC()
	day := now.AddDate(0, 0, -2)
	scope, err := timescope.Build(&day, now, "Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{"fingrid", "porssisahko"} {
		if _, err := store.LoadEnergy(context.Background(), energy.Query{Now: now, WindowStart: scope.WindowStart, WindowEnd: scope.WindowEnd, SourceCode: source, Historical: true}); err != nil {
			t.Fatalf("historical energy load for %s failed: %v", source, err)
		}
	}
}

// The platform history endpoint reads only from platform_history_snapshots, so
// a refresh that writes nothing leaves the whole history view permanently empty.
func TestRefreshPlatformHistorySnapshotsWritesEveryCategory(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	cities := []string{"helsinki"}

	result, err := store.RefreshPlatformHistorySnapshots(ctx, testConfig(), cities, now)
	if err != nil {
		t.Fatalf("refresh failed: %v", err)
	}
	expected := len(cities) * PlatformHistorySnapshotDayCount * len(platformHistoryCategories)
	if result.Snapshots != expected {
		t.Fatalf("expected %d snapshots, wrote %d", expected, result.Snapshots)
	}

	history, err := store.LoadPlatformHistory(ctx, "helsinki", nil, 3, now)
	if err != nil {
		t.Fatalf("read back failed: %v", err)
	}
	for _, category := range platformHistoryCategories {
		items, ok := history[category].([]map[string]any)
		if !ok || len(items) != 3 {
			t.Fatalf("category %s did not read back as 3 days: %#v", category, history[category])
		}
		for _, item := range items {
			if item["data"] == nil {
				t.Fatalf("category %s day %v has no data: %v", category, item["date"], item["error"])
			}
		}
	}
}

// Refreshing twice must update rows in place rather than accumulate duplicates
// or violate the uniqueness constraint.
func TestRefreshPlatformHistorySnapshotsIsIdempotent(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	cfg := testConfig()

	if _, err := store.RefreshPlatformHistorySnapshots(ctx, cfg, []string{"helsinki"}, now); err != nil {
		t.Fatalf("first refresh failed: %v", err)
	}
	var firstCount int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM platform_history_snapshots WHERE city = 'helsinki'`).Scan(&firstCount); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RefreshPlatformHistorySnapshots(ctx, cfg, []string{"helsinki"}, now); err != nil {
		t.Fatalf("second refresh failed: %v", err)
	}
	var secondCount int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM platform_history_snapshots WHERE city = 'helsinki'`).Scan(&secondCount); err != nil {
		t.Fatal(err)
	}
	if firstCount != secondCount {
		t.Fatalf("refresh duplicated rows: %d then %d", firstCount, secondCount)
	}
}

// A live public dashboard read must never serve an older snapshot, or expired
// regional advice is presented as current.
func TestPublicDashboardIgnoresStaleRegionalSnapshot(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	if err := store.RefreshRegionalSnapshot(ctx, now); err != nil {
		t.Fatalf("refresh failed: %v", err)
	}
	live, err := store.LoadPublicDashboard(ctx, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	if live["snapshot_available"] != true {
		t.Fatalf("today's snapshot was not served: %#v", live["snapshot_date"])
	}

	// Move the stored snapshot into the past; the live read must fall through
	// to a freshly composed payload instead of reusing it.
	if _, err := store.pool.Exec(ctx, `UPDATE regional_snapshots SET snapshot_date = $1::date WHERE snapshot_date = $2::date`, now.AddDate(0, 0, -3).Format("2006-01-02"), now.Format("2006-01-02")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = store.pool.Exec(context.Background(), `DELETE FROM regional_snapshots WHERE snapshot_date = $1::date`, now.AddDate(0, 0, -3).Format("2006-01-02"))
	})

	fresh, err := store.LoadPublicDashboard(ctx, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	if fresh["snapshot_date"] != nil {
		t.Fatalf("live read reused a stale snapshot dated %v", fresh["snapshot_date"])
	}
}
