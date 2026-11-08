package httpapi

import (
	"context"
	"crypto/hmac"
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/health"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observability"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
)

func (s *Server) health(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}

	databaseStatus := "up"
	statusCode := http.StatusOK
	if s.db == nil {
		databaseStatus = "down"
		statusCode = http.StatusServiceUnavailable
	} else {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if err := s.db.Ping(ctx); err != nil {
			databaseStatus = "down"
			statusCode = http.StatusServiceUnavailable
		}
	}

	writeJSON(writer, statusCode, map[string]any{
		"status":    map[bool]string{true: "ok", false: "degraded"}[statusCode == http.StatusOK],
		"app_name":  s.cfg.AppName,
		"version":   s.cfg.AppVersion,
		"build_sha": s.cfg.BuildSHA,
		"timezone":  s.cfg.Timezone,
		"database":  databaseStatus,
		// The Go backend ships no trace exporter, so this is reported as
		// unavailable rather than as a setting that silently does nothing.
		"tracing": "unavailable",
	})
}

func (s *Server) metrics(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if strings.TrimSpace(s.cfg.MetricsBearerToken) != "" {
		token, ok := bearerToken(request)
		if !ok || !hmac.Equal([]byte(token), []byte(s.cfg.MetricsBearerToken)) {
			writer.Header().Set("WWW-Authenticate", "Bearer")
			writeJSON(writer, http.StatusUnauthorized, map[string]string{"detail": "Metrics authentication is required."})
			return
		}
	}
	writer.Header().Set("Content-Type", observability.PrometheusContentType)
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(s.metricsRegistry.Render()))
}

func (s *Server) platformCoverage(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	writeJSON(writer, http.StatusOK, platform.BuildCoverage(s.cfg))
}

func (s *Server) dataQuality(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.sources == nil {
		writeJSON(writer, http.StatusServiceUnavailable, health.DataQuality{
			CheckedAt: s.now().UTC().Format(time.RFC3339Nano),
			Status:    "unavailable",
			Sources:   []health.DataQualitySource{},
		})
		return
	}
	items, err := s.sources.ListSourceStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, health.DataQuality{
			CheckedAt: s.now().UTC().Format(time.RFC3339Nano),
			Status:    "unavailable",
			Sources:   []health.DataQualitySource{},
		})
		return
	}

	checkedAt := s.now().UTC()
	qualitySources := make([]health.DataQualitySource, 0, len(items))
	healthyCount := 0
	for _, item := range items {
		status := operationalStatus(item, checkedAt)
		if status == "healthy" {
			healthyCount++
		}
		var lastCheckedAt *string
		var recordsIngested *int
		var errorMessage *string
		if item.LastRun != nil {
			lastCheckedAt = item.LastRun.FinishedAt
			if lastCheckedAt == nil {
				lastCheckedAt = &item.LastRun.StartedAt
			}
			records := item.LastRun.RecordsIngested
			recordsIngested = &records
			errorMessage = item.LastRun.ErrorMessage
		}
		qualitySources = append(qualitySources, health.DataQualitySource{
			SourceCode:      item.SourceCode,
			Status:          status,
			LastCheckedAt:   lastCheckedAt,
			RecordsIngested: recordsIngested,
			Error:           errorMessage,
		})
	}
	issueCount := len(items) - healthyCount
	qualityStatus := "degraded"
	statusCode := http.StatusServiceUnavailable
	if len(items) == 0 {
		qualityStatus = "unavailable"
	} else if issueCount == 0 {
		qualityStatus = "healthy"
		statusCode = http.StatusOK
	}
	writeJSON(writer, statusCode, health.DataQuality{
		CheckedAt:    checkedAt.Format(time.RFC3339Nano),
		Status:       qualityStatus,
		SourceCount:  len(items),
		HealthyCount: healthyCount,
		IssueCount:   issueCount,
		Sources:      qualitySources,
	})
}

func operationalStatus(source sources.Status, now time.Time) string {
	return sources.DeriveOperationalStatus(source, now)
}

func (s *Server) sourceStatus(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.sources == nil || s.users == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}

	_, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	items, err := s.sources.ListSourceStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, items)
}

func (s *Server) sourcesRefresh(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.EnqueuePlatformRefresh(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusAccepted, result)
}

func (s *Server) sourcesRefreshStatus(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.PlatformRefreshStatus(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) schedulerJobs(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	jobs, err := s.scheduler.ListScheduledJobs(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	payload := make([]map[string]any, 0, len(jobs))
	for _, job := range jobs {
		item := map[string]any{"id": job.ID, "job_key": job.JobKey, "task_type": job.TaskType, "interval_seconds": job.IntervalSeconds, "payload": job.Payload, "is_enabled": job.IsEnabled, "next_run_at": job.NextRunAt.Format(time.RFC3339Nano), "locked_by": job.LockedBy, "locked_until": formatOptionalTime(job.LockedUntil), "last_started_at": formatOptionalTime(job.LastStartedAt), "last_finished_at": formatOptionalTime(job.LastFinishedAt), "last_status": job.LastStatus}
		if job.LastError != nil && strings.TrimSpace(*job.LastError) != "" {
			item["last_error"] = "The latest scheduler run failed; provider details are not exposed."
		}
		payload = append(payload, item)
	}
	writeJSON(writer, http.StatusOK, payload)
}

func (s *Server) schedulerSync(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if _, failure := s.currentUser(request); failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.scheduler == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	result, err := s.scheduler.SyncDefaultScheduledJobs(request.Context(), s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func formatOptionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339Nano)
	return &formatted
}
