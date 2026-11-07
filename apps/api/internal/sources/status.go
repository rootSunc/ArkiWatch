package sources

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
