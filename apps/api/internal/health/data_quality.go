package health

type DataQualitySource struct {
	SourceCode      string  `json:"source_code"`
	Status          string  `json:"status"`
	LastCheckedAt   *string `json:"last_checked_at"`
	RecordsIngested *int    `json:"records_ingested"`
	Error           *string `json:"error"`
}

type DataQuality struct {
	CheckedAt    string              `json:"checked_at"`
	Status       string              `json:"status"`
	SourceCount  int                 `json:"source_count"`
	HealthyCount int                 `json:"healthy_count"`
	IssueCount   int                 `json:"issue_count"`
	Sources      []DataQualitySource `json:"sources"`
}
