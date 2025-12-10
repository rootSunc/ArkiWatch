package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
)

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

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := store.Ping(ctx); err != nil {
		log.Fatalf("database is not ready: %v", err)
	}
	report, err := store.Migrate(ctx)
	if err != nil {
		log.Fatalf("migrate database schema: %v", err)
	}
	fmt.Printf("ArkiWatch Go schema migration complete: version=%s fresh=%t\n", report.Version, report.Fresh)
}
