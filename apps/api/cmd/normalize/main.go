package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
)

func main() {
	hours := flag.Int("hours", 0, "how many hours of raw observations to normalize (0 uses NORMALIZATION_LOOKBACK_HOURS)")
	source := flag.String("source", "", "optional source code, for example hsy or fmi")
	flag.Parse()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}
	store, err := database.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()
	now := time.Now().UTC()
	lookbackHours := *hours
	if lookbackHours <= 0 {
		lookbackHours = cfg.NormalizationLookbackHours
	}
	if lookbackHours <= 0 {
		log.Fatal("hours must be greater than zero; set -hours or NORMALIZATION_LOOKBACK_HOURS")
	}
	result, err := store.NormalizeObservationsLimited(context.Background(), now.Add(-time.Duration(lookbackHours)*time.Hour), now, strings.TrimSpace(*source), cfg.NormalizationBatchSize)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("normalized scanned=%d inserted=%d updated=%d\n", result.Scanned, result.Inserted, result.Updated)
}
