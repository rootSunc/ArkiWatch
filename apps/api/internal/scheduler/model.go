package scheduler

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type TaskType string

const (
	TaskCollector         TaskType = "COLLECTOR"
	TaskPipelineNormalize TaskType = "PIPELINE_NORMALIZE"
	TaskPipelineSnapshots TaskType = "PIPELINE_SNAPSHOTS"
	TaskRules             TaskType = "RULES"
	TaskDispatch          TaskType = "DISPATCH"
	TaskBackfill          TaskType = "BACKFILL"
	TaskPlatformRefresh   TaskType = "PLATFORM_REFRESH"
)

type RunStatus string

const (
	RunRunning   RunStatus = "RUNNING"
	RunSucceeded RunStatus = "SUCCEEDED"
	RunFailed    RunStatus = "FAILED"
)

type JobSpec struct {
	JobKey          string
	TaskType        TaskType
	IntervalSeconds int
	Payload         map[string]any
}

type ClaimedJob struct {
	ID              string
	RunID           string
	JobKey          string
	TaskType        TaskType
	IntervalSeconds int
	Payload         map[string]any
	StartedAt       time.Time
	LockedBy        string
}

type SyncResult struct {
	Created int
	Updated int
	Jobs    int
}

func StableJitterSeconds(jobKey string, intervalSeconds, maxJitterSeconds int) int {
	if intervalSeconds <= 0 || maxJitterSeconds <= 0 {
		return 0
	}
	ceiling := maxJitterSeconds
	if intervalSeconds/5 > 0 && intervalSeconds/5 < ceiling {
		ceiling = intervalSeconds / 5
	}
	if ceiling < 1 {
		ceiling = 1
	}
	digest := sha256.Sum256([]byte(jobKey))
	return int(binary.BigEndian.Uint32(digest[:4]) % uint32(ceiling+1))
}

func BuildDefaultSpecs(sourceIntervals map[string]int, cfg config.Config) []JobSpec {
	keys := make([]string, 0, len(sourceIntervals))
	for source := range sourceIntervals {
		keys = append(keys, source)
	}
	sort.Strings(keys)
	result := make([]JobSpec, 0, len(keys)+6)
	for _, source := range keys {
		interval := sourceIntervals[source]
		if interval <= 0 {
			continue
		}
		result = append(result, JobSpec{JobKey: "collector:" + source, TaskType: TaskCollector, IntervalSeconds: interval, Payload: map[string]any{"source_code": source}})
	}
	result = append(result,
		JobSpec{JobKey: "pipeline:normalize", TaskType: TaskPipelineNormalize, IntervalSeconds: cfg.SchedulerPipelineIntervalSeconds, Payload: map[string]any{}},
		JobSpec{JobKey: "pipeline:snapshots", TaskType: TaskPipelineSnapshots, IntervalSeconds: cfg.SchedulerPipelineIntervalSeconds, Payload: map[string]any{}},
		JobSpec{JobKey: "rules:all", TaskType: TaskRules, IntervalSeconds: cfg.SchedulerRulesIntervalSeconds, Payload: map[string]any{}},
		JobSpec{JobKey: "dispatch:all", TaskType: TaskDispatch, IntervalSeconds: cfg.SchedulerDispatchIntervalSeconds, Payload: map[string]any{}},
		JobSpec{JobKey: "backfill:windows", TaskType: TaskBackfill, IntervalSeconds: cfg.SchedulerBackfillIntervalSeconds, Payload: map[string]any{}},
		JobSpec{JobKey: "pipeline:platform-refresh", TaskType: TaskPlatformRefresh, IntervalSeconds: 365 * 24 * 3600, Payload: map[string]any{}},
	)
	return result
}
