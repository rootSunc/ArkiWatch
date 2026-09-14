package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectorservice"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/dispatch"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/scheduler"
)

var buildVersion string
var buildSHA string

func main() {
	once := flag.Bool("once", false, "sync and execute due jobs once")
	syncOnly := flag.Bool("sync-only", false, "sync job definitions and exit")
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
	instance := os.Getenv("HOSTNAME")
	if strings.TrimSpace(instance) == "" {
		instance = "arkiwatch-go-scheduler"
	}
	if pid := os.Getpid(); pid > 0 {
		instance += "-" + strconv.Itoa(pid)
	}

	ctx := context.Background()
	sync := func() error {
		intervals, listErr := store.ListActiveSourceIntervals(ctx)
		if listErr != nil {
			return listErr
		}
		result, syncErr := store.SyncScheduledJobs(ctx, scheduler.BuildDefaultSpecs(intervals, cfg), time.Now().UTC(), cfg.SchedulerInitialJitterSeconds, cfg.Timezone)
		if syncErr == nil {
			fmt.Printf("[scheduler:sync] jobs=%d created=%d updated=%d\n", result.Jobs, result.Created, result.Updated)
		}
		return syncErr
	}
	if err := sync(); err != nil {
		log.Fatal(err)
	}
	if *syncOnly {
		return
	}
	if *once {
		if err := runOnce(ctx, store, cfg, instance); err != nil {
			log.Fatal(err)
		}
		return
	}

	ticker := time.NewTicker(time.Duration(cfg.SchedulerPollSeconds * float64(time.Second)))
	defer ticker.Stop()
	for range ticker.C {
		if err := runOnce(ctx, store, cfg, instance); err != nil {
			log.Printf("scheduler run: %v", err)
		}
	}
}

func runOnce(ctx context.Context, store *database.Store, cfg config.Config, instance string) error {
	now := time.Now().UTC()
	jobs, err := store.ClaimScheduledJobs(ctx, instance, now, cfg.SchedulerMaxDueJobs, cfg.SchedulerLockTTLSeconds)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		result, taskErr := execute(ctx, store, cfg, job)
		status := scheduler.RunSucceeded
		var message *string
		if taskErr != nil {
			status = scheduler.RunFailed
			text := taskErr.Error()
			message = &text
			result = map[string]any{}
		}
		if err := store.CompleteScheduledJob(ctx, job, status, result, message, time.Now().UTC(), cfg.SchedulerFailureRetrySeconds, cfg.SchedulerRescheduleJitterSeconds, cfg.Timezone); err != nil {
			return err
		}
		fmt.Printf("[scheduler:job] key=%s status=%s\n", job.JobKey, status)
	}
	fmt.Printf("[scheduler:once] claimed=%d\n", len(jobs))
	return nil
}

func execute(ctx context.Context, store *database.Store, cfg config.Config, job scheduler.ClaimedJob) (map[string]any, error) {
	switch job.TaskType {
	case scheduler.TaskCollector:
		code := strings.TrimSpace(fmt.Sprint(job.Payload["source_code"]))
		if code == "" {
			return nil, fmt.Errorf("%s is missing payload.source_code", job.JobKey)
		}
		results, err := collectorservice.RunSources(ctx, store, cfg, []string{code})
		if err != nil {
			return nil, err
		}
		if len(results) == 0 {
			return nil, fmt.Errorf("collector %s returned no result", code)
		}
		item := results[0]
		if item.Status != "succeeded" {
			return nil, fmt.Errorf("%s collector failed: %s", code, item.ErrorMessage)
		}
		return map[string]any{"source_code": item.SourceCode, "dataset": item.Dataset, "records_ingested": item.RecordsIngested, "records_skipped": item.RecordsSkipped}, nil
	case scheduler.TaskPipelineNormalize:
		now := time.Now().UTC()
		result, err := store.NormalizeObservationsLimited(ctx, now.Add(-time.Duration(cfg.NormalizationLookbackHours)*time.Hour), now, "", cfg.NormalizationBatchSize)
		if err != nil {
			return nil, err
		}
		return map[string]any{"scanned": result.Scanned, "inserted": result.Inserted, "updated": result.Updated}, nil
	case scheduler.TaskRules:
		result, err := store.RunRules(ctx, time.Now().UTC())
		if err != nil {
			return nil, err
		}
		return map[string]any{"users": result.Users, "events": result.Events, "recommendations": result.Recommendations}, nil
	case scheduler.TaskPipelineSnapshots:
		now := time.Now().UTC()
		daily, err := store.RefreshDailySnapshots(ctx, now)
		if err != nil {
			return nil, err
		}
		result, err := store.SyncPublicRecommendations(ctx, now)
		if err != nil {
			return nil, err
		}
		snapshots, err := refreshSnapshots(ctx, store, cfg, now)
		if err != nil {
			return nil, err
		}
		summary := map[string]any{"daily_users": daily.Users, "public_events": result.Events, "public_recommendations": result.Recommendations, "inserted": result.Inserted, "updated": result.Updated, "deactivated": result.Deactivated}
		for key, value := range snapshots {
			summary[key] = value
		}
		return summary, nil
	case scheduler.TaskDispatch:
		sender := dispatch.NewTelegramSender(cfg)
		now := time.Now().UTC()
		result, err := store.DispatchPendingNotifications(ctx, now, sender)
		if err != nil {
			return nil, err
		}
		publicResult, err := store.DispatchPublicBroadcasts(ctx, now, sender)
		if err != nil {
			return nil, err
		}
		return map[string]any{"personal": map[string]any{"scanned": result.Scanned, "sent": result.Sent, "failed": result.Failed, "expired": result.Expired, "skipped_duplicate": result.SkippedDuplicate}, "public": map[string]any{"scanned": publicResult.Scanned, "sent": publicResult.Sent, "failed": publicResult.Failed, "skipped_duplicate": publicResult.SkippedDuplicate}}, nil
	case scheduler.TaskBackfill:
		return runBackfill(ctx, store, cfg, job.LockedBy)
	case scheduler.TaskPlatformRefresh:
		collectorResults, err := collectorservice.RunSources(ctx, store, cfg, []string{"all"})
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		normalized, err := store.NormalizeObservationsLimited(ctx, now.Add(-time.Duration(cfg.NormalizationLookbackHours)*time.Hour), now, "", cfg.NormalizationBatchSize)
		if err != nil {
			return nil, err
		}
		ruleResult, err := store.RunRules(ctx, now)
		if err != nil {
			return nil, err
		}
		daily, err := store.RefreshDailySnapshots(ctx, now)
		if err != nil {
			return nil, err
		}
		publicResult, err := store.SyncPublicRecommendations(ctx, now)
		if err != nil {
			return nil, err
		}
		snapshots, err := refreshSnapshots(ctx, store, cfg, now)
		if err != nil {
			return nil, err
		}
		return map[string]any{"snapshots": snapshots, "collectors": len(collectorResults), "normalize": map[string]any{"scanned": normalized.Scanned, "inserted": normalized.Inserted, "updated": normalized.Updated}, "rules": map[string]any{"users": ruleResult.Users, "events": ruleResult.Events, "recommendations": ruleResult.Recommendations}, "daily_users": daily.Users, "public": map[string]any{"events": publicResult.Events, "recommendations": publicResult.Recommendations}}, nil
	default:
		return nil, fmt.Errorf("unsupported Go scheduler task type %s", job.TaskType)
	}
}

// refreshSnapshots rebuilds the derived snapshot tables the read APIs serve.
// /api/platform/history and historical /api/public/dashboard reads have no
// other source, so skipping this leaves both permanently empty.
func refreshSnapshots(ctx context.Context, store *database.Store, cfg config.Config, now time.Time) (map[string]any, error) {
	history, err := store.RefreshPlatformHistorySnapshots(ctx, cfg, platform.SupportedCityRefs(cfg), now)
	if err != nil {
		return nil, err
	}
	if err := store.RefreshRegionalSnapshot(ctx, now); err != nil {
		return nil, err
	}
	// Partitions must exist before the next month's rows arrive, or everything
	// falls into the default partition and retention can no longer drop months.
	createdPartitions, err := store.EnsureRawObservationPartitions(ctx, now, cfg.RawObservationPartitionMonths)
	if err != nil {
		return nil, err
	}
	retention, err := store.ApplyDataRetention(ctx, cfg, now)
	if err != nil {
		return nil, err
	}
	operational, err := store.ApplyOperationalRetention(ctx, cfg, now)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"history":    map[string]any{"cities": history.Cities, "days": history.Days, "snapshots": history.Snapshots, "errors": history.Errors},
		"regional":   1,
		"partitions": map[string]any{"created": createdPartitions, "dropped": retention.PartitionsDropped},
		"retention":  map[string]any{"enabled": !retention.Skipped, "raw_deleted": retention.RawDeleted, "events_deleted": retention.EventsDeleted},
		"operational_retention": map[string]any{
			"scheduler_runs_deleted":           operational.SchedulerRunsDeleted,
			"telegram_webhook_updates_deleted": operational.WebhookUpdatesDeleted,
		},
	}, nil
}

func runBackfill(ctx context.Context, store *database.Store, cfg config.Config, instanceID string) (map[string]any, error) {
	now := time.Now().UTC()
	// Plan before draining: the worker can only claim windows that something
	// has queued, so a deployment with no planner never backfills anything.
	plan, err := store.PlanInitialBackfills(ctx, cfg, collectorservice.RangeCapableSources(cfg), now)
	if err != nil {
		return nil, err
	}
	claims, err := store.ClaimBackfillWindows(ctx, instanceID, now, cfg.BackfillMaxDueWindows, cfg.BackfillWindowLockTTLSeconds)
	if err != nil {
		return nil, err
	}
	result := map[string]any{"planned_jobs": plan.Created, "planned_windows": plan.Windows, "planned_sources": plan.Sources, "claimed": len(claims), "succeeded": 0, "failed": 0, "records_inserted": 0, "records_skipped": 0}
	for _, claim := range claims {
		item := collectorservice.RunRange(ctx, store, cfg, claim.SourceCode, claim.WindowStart, claim.WindowEnd, claim.AreaCode, claim.Cursor)
		succeeded := item.Status == "succeeded"
		normalized := database.NormalizeResult{}
		if succeeded && claim.NormalizeAfterWindow {
			normalized, err = store.NormalizeObservations(ctx, claim.WindowStart, claim.WindowEnd, claim.SourceCode)
			if err != nil {
				succeeded = false
				message := err.Error()
				item.ErrorMessage = message
			}
		}
		var message *string
		if item.ErrorMessage != "" {
			message = &item.ErrorMessage
		}
		if err := store.CompleteBackfillWindow(ctx, claim, succeeded, item.RecordsIngested, item.RecordsSkipped, normalized, message, time.Now().UTC()); err != nil {
			return nil, err
		}
		if succeeded {
			result["succeeded"] = result["succeeded"].(int) + 1
		} else {
			result["failed"] = result["failed"].(int) + 1
		}
		result["records_inserted"] = result["records_inserted"].(int) + item.RecordsIngested
		result["records_skipped"] = result["records_skipped"].(int) + item.RecordsSkipped
	}
	return result, nil
}
