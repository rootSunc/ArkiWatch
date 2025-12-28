package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectorservice"
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
	results, err := collectorservice.RunSources(context.Background(), store, cfg, os.Args[1:])
	if err != nil {
		log.Fatal(err)
	}
	for _, result := range results {
		fmt.Printf("[%s] %s inserted=%d skipped=%d\n", result.SourceCode, result.Status, result.RecordsIngested, result.RecordsSkipped)
	}
}
