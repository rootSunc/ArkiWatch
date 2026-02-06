package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/httpapi"
)

var buildVersion string
var buildSHA string

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}

	var db database.HealthChecker
	var closeDB func()
	if cfg.DatabaseURL != "" {
		pool, openErr := database.Open(context.Background(), cfg.DatabaseURL)
		if openErr != nil {
			log.Printf("database initialization failed; health will be degraded: %v", openErr)
		} else {
			db = pool
			closeDB = pool.Close
		}
	}
	if closeDB != nil {
		defer closeDB()
	}

	server := &http.Server{
		Addr:              cfg.Address(),
		Handler:           httpapi.New(cfg, db).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("ArkiWatch Go backend listening on %s", cfg.Address())
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve HTTP: %v", err)
	}
}
