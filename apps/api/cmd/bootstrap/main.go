package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
)

var buildVersion string
var buildSHA string

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	store, err := database.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := store.Ping(ctx); err != nil {
		log.Fatalf("database is not ready: %v", err)
	}
	migration, err := store.Migrate(ctx)
	if err != nil {
		log.Fatalf("migrate database schema: %v", err)
	}
	admin, err := store.GetOrCreateAdminUser(ctx, cfg)
	if err != nil {
		log.Fatalf("ensure admin user: %v", err)
	}
	sources, rules, err := store.SeedOperationalMetadata(ctx, cfg)
	if err != nil {
		log.Fatalf("seed operational metadata: %v", err)
	}
	jobs, err := store.SyncDefaultScheduledJobs(ctx, cfg)
	if err != nil {
		log.Fatalf("sync scheduled jobs: %v", err)
	}
	// Create the month partitions up front so the very first ingest run already
	// lands in a droppable partition instead of the catch-all default.
	partitions, err := store.EnsureRawObservationPartitions(ctx, time.Now().UTC(), cfg.RawObservationPartitionMonths)
	if err != nil {
		log.Fatalf("ensure raw observation partitions: %v", err)
	}
	fmt.Printf("ArkiWatch Go bootstrap complete: schema=%s fresh=%t admin=%s sources=%d rules=%d jobs=%d created=%d updated=%d partitions=%d\n", migration.Version, migration.Fresh, admin.ID, sources, rules, jobs.Jobs, jobs.Created, jobs.Updated, len(partitions))
}
