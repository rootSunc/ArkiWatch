package sources

import "time"

type CollectorRun struct {
	Status          string  `json:"status"`
	StartedAt       string  `json:"started_at"`
	FinishedAt      *string `json:"finished_at"`
	RecordsIngested int     `json:"records_ingested"`
	ErrorMessage    *string `json:"error_message"`
}

// CollectorRunDay reports recorded executions, not inferred uptime.
type CollectorRunDay struct {
	Date      string `json:"date"`
	Runs      int    `json:"runs"`
	Succeeded int    `json:"succeeded"`
	Failed    int    `json:"failed"`
	Running   int    `json:"running"`
}

type Status struct {
	ID                  string            `json:"id"`
	SourceCode          string            `json:"source_code"`
	SourceName          string            `json:"source_name"`
	Endpoint            string            `json:"endpoint"`
	AuthType            string            `json:"auth_type"`
	PollIntervalSeconds int               `json:"poll_interval_seconds"`
	IsActive            bool              `json:"is_active"`
	LastRun             *CollectorRun     `json:"last_run"`
	LastSuccessfulRunAt *string           `json:"last_successful_run_at,omitempty"`
	RunHistory          []CollectorRunDay `json:"run_history,omitempty"`
}

// DeriveOperationalStatus is the single canonical operational-state calculation
// across Overview, Health/DataQuality, and Public Dashboard. An in-flight
// ("running") execution keeps a source healthy while its previous successful
// run is still fresh, or pending on first boot, instead of falsely reporting
// failing during collection.
func DeriveOperationalStatus(item Status, now time.Time) string {
	if !item.IsActive {
		return "inactive"
	}
	maxAge := time.Duration(item.PollIntervalSeconds*2) * time.Second
	if item.LastRun == nil {
		return "pending"
	}
	if item.LastRun.Status == "running" {
		if item.LastSuccessfulRunAt != nil {
			if lastOK, err := time.Parse(time.RFC3339Nano, *item.LastSuccessfulRunAt); err == nil && now.Sub(lastOK) <= maxAge {
				return "healthy"
			}
		}
		if started, err := time.Parse(time.RFC3339Nano, item.LastRun.StartedAt); err == nil && now.Sub(started) > maxAge {
			return "stale"
		}
		return "pending"
	}
	if item.LastRun.Status != "succeeded" {
		return "failing"
	}
	reference := item.LastRun.FinishedAt
	if reference == nil {
		reference = &item.LastRun.StartedAt
	}
	parsed, err := time.Parse(time.RFC3339Nano, *reference)
	if err != nil || now.Sub(parsed) > maxAge {
		return "stale"
	}
	return "healthy"
}
