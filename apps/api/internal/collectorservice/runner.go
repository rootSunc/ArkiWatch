package collectorservice

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
)

type Result struct {
	SourceCode      string
	Dataset         string
	Status          string
	RecordsIngested int
	RecordsSkipped  int
	ErrorMessage    string
}

func ResolveRequestedSources(registry map[string]collectors.Collector, requested []string) ([]string, error) {
	if len(requested) == 0 || (len(requested) == 1 && requested[0] == "all") {
		keys := make([]string, 0, len(registry))
		for key := range registry {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return keys, nil
	}
	invalid := []string{}
	for _, source := range requested {
		if _, ok := registry[source]; !ok {
			invalid = append(invalid, source)
		}
	}
	if len(invalid) > 0 {
		return nil, fmt.Errorf("unknown source codes: %s", strings.Join(invalid, ", "))
	}
	return requested, nil
}

func RunCollector(ctx context.Context, store *database.Store, collector collectors.Collector) Result {
	started := time.Now().UTC()
	result := Result{SourceCode: collector.SourceCode(), Dataset: collector.Dataset()}
	items, err := collector.Collect(ctx)
	status, message, items, fatal := classifyCollection(items, err)
	if fatal != nil {
		text := fatal.Error()
		result.Status, result.ErrorMessage = "failed", text
		_ = store.AppendCollectorRun(ctx, collector.SourceCode(), collector.Dataset(), "failed", started, time.Now().UTC(), 0, &text)
		return result
	}
	persisted, err := store.PersistObservations(ctx, collector.SourceCode(), items)
	if err != nil {
		message := err.Error()
		result.Status, result.ErrorMessage = "failed", message
		_ = store.AppendCollectorRun(ctx, collector.SourceCode(), collector.Dataset(), "failed", started, time.Now().UTC(), 0, &message)
		return result
	}
	if err := store.AppendCollectorRun(ctx, collector.SourceCode(), collector.Dataset(), status, started, time.Now().UTC(), persisted.Inserted, message); err != nil {
		result.Status, result.ErrorMessage = "failed", err.Error()
		return result
	}
	result.Status, result.RecordsIngested, result.RecordsSkipped = status, persisted.Inserted, persisted.Skipped
	if message != nil {
		result.ErrorMessage = *message
	}
	return result
}

func classifyCollection(items []collectors.Observation, err error) (string, *string, []collectors.Observation, error) {
	var partial *collectors.PartialError
	if errors.As(err, &partial) {
		text := partial.Error()
		return "degraded", &text, items, nil
	}
	if err != nil {
		return "failed", nil, nil, err
	}
	return "succeeded", nil, items, nil
}

func RunSources(ctx context.Context, store *database.Store, cfg config.Config, requested []string) ([]Result, error) {
	registry := collectors.Registry(cfg)
	sources, err := ResolveRequestedSources(registry, requested)
	if err != nil {
		return nil, err
	}
	results := make([]Result, 0, len(sources))
	for _, source := range sources {
		results = append(results, RunCollector(ctx, store, registry[source]))
	}
	return results, nil
}

func RunRange(ctx context.Context, store *database.Store, cfg config.Config, sourceCode string, start, end time.Time, areaCode, cursor string) Result {
	registry := collectors.Registry(cfg)
	collector, ok := registry[sourceCode]
	result := Result{SourceCode: sourceCode}
	if !ok {
		result.Status, result.ErrorMessage = "failed", "unknown source code"
		return result
	}
	result.Dataset = collector.Dataset()
	rangeCollector, ok := collector.(collectors.RangeCollector)
	if !ok {
		result.Status, result.ErrorMessage = "failed", fmt.Sprintf("%s does not support historical backfill yet", sourceCode)
		return result
	}
	items, err := rangeCollector.CollectRange(ctx, start, end, areaCode, cursor)
	status, message, items, fatal := classifyCollection(items, err)
	if fatal != nil {
		result.Status, result.ErrorMessage = "failed", fatal.Error()
		return result
	}
	persisted, err := store.PersistObservations(ctx, sourceCode, items)
	if err != nil {
		result.Status, result.ErrorMessage = "failed", err.Error()
		return result
	}
	result.Status, result.RecordsIngested, result.RecordsSkipped = status, persisted.Inserted, persisted.Skipped
	if message != nil {
		result.ErrorMessage = *message
	}
	return result
}

// RangeCapableSources reports which registered collectors can replay a
// historical window. The backfill planner uses it so it never queues work a
// collector cannot perform.
func RangeCapableSources(cfg config.Config) map[string]bool {
	capable := map[string]bool{}
	for sourceCode, collector := range collectors.Registry(cfg) {
		if _, ok := collector.(collectors.RangeCollector); ok {
			capable[sourceCode] = true
		}
	}
	return capable
}
