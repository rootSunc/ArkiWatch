package schema

import (
	"context"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Migrate is documented as safe to run repeatedly and must report whether a
// database was fresh, since the API relies on that flag to decide whether to
// seed bootstrap data. Both properties are load-bearing for every deploy
// (release.sh always re-runs the migrate binary) but were untested.
//
// This runs against a scratch database created and dropped for the test, not
// the developer's working database, since CREATE/DROP DATABASE and the
// migration DDL are too invasive to run against real data.
func TestMigrateIsFreshOnceThenIdempotent(t *testing.T) {
	baseDSN := os.Getenv("DATABASE_URL")
	if baseDSN == "" {
		t.Skip("DATABASE_URL is not set; skipping schema migration test")
	}
	parsed, err := url.Parse(baseDSN)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	ctx := context.Background()
	maintenanceURL := *parsed
	maintenanceURL.Path = "/postgres"
	admin, err := pgx.Connect(ctx, maintenanceURL.String())
	if err != nil {
		t.Skipf("database is unreachable: %v", err)
	}

	const scratchDatabase = "arkiwatch_schema_migration_test"
	if _, err := admin.Exec(ctx, `DROP DATABASE IF EXISTS `+scratchDatabase); err != nil {
		t.Fatalf("drop stale scratch database: %v", err)
	}
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+scratchDatabase); err != nil {
		t.Fatalf("create scratch database: %v", err)
	}
	// Registered before the pool's own `defer`, so this cleanup (which needs
	// the scratch pool already closed to drop its database) runs after that
	// defer fires: defers unwind at function return, before t.Cleanup runs.
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DROP DATABASE IF EXISTS `+scratchDatabase)
		admin.Close(context.Background())
	})

	scratchURL := *parsed
	scratchURL.Path = "/" + scratchDatabase
	pool, err := pgxpool.New(ctx, scratchURL.String())
	if err != nil {
		t.Fatalf("open scratch pool: %v", err)
	}
	defer pool.Close()

	first, err := Migrate(ctx, pool)
	if err != nil {
		t.Fatalf("first migrate failed: %v", err)
	}
	if !first.Fresh {
		t.Fatalf("expected a brand-new database to report Fresh=true, got %#v", first)
	}
	if first.Version != CurrentVersion {
		t.Fatalf("expected version %q, got %q", CurrentVersion, first.Version)
	}

	second, err := Migrate(ctx, pool)
	if err != nil {
		t.Fatalf("re-running migrate against an already-migrated database failed (not idempotent): %v", err)
	}
	if second.Fresh {
		t.Fatalf("expected a re-run against an already-migrated database to report Fresh=false")
	}
	if second.Version != CurrentVersion {
		t.Fatalf("expected version %q on the second run, got %q", CurrentVersion, second.Version)
	}
}
