// Package database is the PostgreSQL-backed Store: collection, normalization,
// scheduling, rules, dispatch, and the read models the HTTP API serves.
package database

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/recommendations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/schema"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

// HealthChecker is deliberately small so HTTP handlers can be tested without
// starting PostgreSQL. The same interface will be extended with repositories
// as database-backed endpoints are migrated.
type HealthChecker interface {
	Ping(context.Context) error
}

type SourceStatusReader interface {
	ListSourceStatus(context.Context) ([]sources.Status, error)
}

type ScopedSourceStatusReader interface {
	ListSourceStatusAt(context.Context, time.Time) ([]sources.Status, error)
}

type ActiveUserReader interface {
	IsActiveUser(context.Context, string) (bool, error)
}

type UserReader interface {
	GetUser(context.Context, string) (users.User, error)
}

type AdminUserStore interface {
	GetOrCreateAdminUser(context.Context, config.Config) (users.User, error)
}

type RecommendationReader interface {
	ListRecommendations(context.Context, string, int) ([]recommendations.Read, error)
}

type WeatherReader interface {
	LoadWeather(context.Context, observations.WeatherQuery) (observations.WeatherData, error)
}

type AirQualityReader interface {
	LoadAirQuality(context.Context, airquality.Query) (airquality.Data, error)
}

type EnergyReader interface {
	LoadEnergy(context.Context, energy.Query) (energy.Data, error)
}

type TrafficReader interface {
	LoadTraffic(context.Context, traffic.Query) (traffic.Data, error)
}

type TransitReader interface {
	LoadTransit(context.Context, observations.TransitQuery) (observations.TransitData, error)
}

type PlatformReader interface {
	LoadPlatform(context.Context, platform.PlatformQuery) (platform.PlatformData, error)
}

var _ ProfileStore = (*Store)(nil)

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

// Store is the database boundary for migrated Go handlers. Keeping queries
// here prevents HTTP handlers from becoming coupled to PostgreSQL details.
type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (store *Store) Ping(ctx context.Context) error {
	return store.pool.Ping(ctx)
}

func (store *Store) Migrate(ctx context.Context) (schema.Report, error) {
	return schema.Migrate(ctx, store.pool)
}

func (store *Store) Close() {
	store.pool.Close()
}

// nullableDaily keeps an interval job's daily_at_local NULL rather than "", so
// the column reads as "not a wall-clock job" instead of an unparseable time.
func nullableDaily(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func randomID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("go-%d", time.Now().UnixNano())
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}

type rowScanner interface {
	Scan(...any) error
}

// formatTime emits UTC. pgx decodes timestamptz with time.Unix, which lands in
// the process zone: Europe/Helsinki on a developer machine and UTC in CI. The
// offset would otherwise change the same instant's API string.
func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
