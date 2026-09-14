package scheduler

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
	"strconv"
	"strings"
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
	// DailyAtLocal pins a job to a wall-clock time ("06:50") instead of an
	// interval. A morning brief has to land before the reader leaves the house,
	// which an interval cannot express: it drifts with every run duration and
	// shifts by an hour at each daylight-saving change.
	DailyAtLocal string
	Payload      map[string]any
}

// IsDaily reports whether the job is anchored to the wall clock.
func (spec JobSpec) IsDaily() bool { return spec.DailyAtLocal != "" }

type ClaimedJob struct {
	ID              string
	RunID           string
	JobKey          string
	TaskType        TaskType
	IntervalSeconds int
	DailyAtLocal    string
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

// ParseDailyAt reads an "HH:MM" wall-clock time. It is strict on purpose: a
// malformed value must not silently become midnight.
func ParseDailyAt(value string) (int, int, bool) {
	text := strings.TrimSpace(value)
	hourText, minuteText, found := strings.Cut(text, ":")
	if !found || len(hourText) != 2 || len(minuteText) != 2 {
		return 0, 0, false
	}
	hour, err := strconv.Atoi(hourText)
	if err != nil || hour < 0 || hour > 23 {
		return 0, 0, false
	}
	minute, err := strconv.Atoi(minuteText)
	if err != nil || minute < 0 || minute > 59 {
		return 0, 0, false
	}
	return hour, minute, true
}

// NextDailyRun returns the first occurrence of a wall-clock time in the given
// zone strictly after `after`. Building the instant with time.Date in the zone
// is what keeps 06:50 at 06:50 across a daylight-saving change, and it also
// normalizes the hour that does not exist on the spring-forward night.
func NextDailyRun(after time.Time, dailyAtLocal, timezone string) (time.Time, bool) {
	hour, minute, ok := ParseDailyAt(dailyAtLocal)
	if !ok {
		return time.Time{}, false
	}
	zone, err := time.LoadLocation(timezone)
	if err != nil {
		zone = time.UTC
	}
	local := after.In(zone)
	candidate := time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, zone)
	if !candidate.After(local) {
		candidate = time.Date(local.Year(), local.Month(), local.Day()+1, hour, minute, 0, 0, zone)
	}
	return candidate.UTC(), true
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
