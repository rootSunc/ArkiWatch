package database

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/collectors"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/dispatch"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/normalizer"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/publicrules"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/recommendations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/rules"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/scheduler"
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

type ScheduledJobRead struct {
	ID, JobKey, TaskType                       string
	IntervalSeconds                            int
	Payload                                    map[string]any
	IsEnabled                                  bool
	NextRunAt                                  time.Time
	LockedBy                                   *string
	LockedUntil, LastStartedAt, LastFinishedAt *time.Time
	LastStatus, LastError                      *string
}

type SchedulerReader interface {
	ListScheduledJobs(context.Context) ([]ScheduledJobRead, error)
	SyncDefaultScheduledJobs(context.Context, config.Config) (scheduler.SyncResult, error)
	EnqueuePlatformRefresh(context.Context) (map[string]any, error)
	PlatformRefreshStatus(context.Context) (map[string]any, error)
}

var _ ProfileStore = (*Store)(nil)

type NormalizeResult struct {
	Scanned  int
	Inserted int
	Updated  int
}

type RulesResult struct {
	Users, Events, Recommendations int
}

type PublicRulesResult struct{ Events, Recommendations, Inserted, Updated, Deactivated int }

type DispatchResult struct {
	Scanned, Sent, Failed, SkippedMissingChannel, SkippedQuietHours, SkippedCooldown,
	SkippedDailyCap, SkippedDisabled, SkippedDuplicate, Expired int
}

type SnapshotResult struct{ Users int }

type PublicDispatchResult struct{ Scanned, Sent, Failed, SkippedDuplicate int }

func (store *Store) ListActiveSourceIntervals(ctx context.Context) (map[string]int, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT source_code, poll_interval_seconds
		FROM data_sources
		WHERE is_active = TRUE
		ORDER BY source_code ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]int{}
	for rows.Next() {
		var code string
		var interval int
		if err := rows.Scan(&code, &interval); err != nil {
			return nil, err
		}
		result[code] = interval
	}
	return result, rows.Err()
}

func (store *Store) ListScheduledJobs(ctx context.Context) ([]ScheduledJobRead, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT id, job_key, task_type::text, interval_seconds, payload, is_enabled,
		       next_run_at, locked_by, locked_until, last_started_at, last_finished_at,
		       last_status::text, last_error
		FROM scheduled_jobs
		ORDER BY next_run_at ASC, job_key ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []ScheduledJobRead{}
	for rows.Next() {
		var item ScheduledJobRead
		var payload []byte
		var lockedBy, lastStatus, lastError sql.NullString
		var lockedUntil, lastStarted, lastFinished sql.NullTime
		if err := rows.Scan(&item.ID, &item.JobKey, &item.TaskType, &item.IntervalSeconds, &payload, &item.IsEnabled, &item.NextRunAt, &lockedBy, &lockedUntil, &lastStarted, &lastFinished, &lastStatus, &lastError); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return nil, err
		}
		if lockedBy.Valid {
			item.LockedBy = &lockedBy.String
		}
		if lockedUntil.Valid {
			value := lockedUntil.Time
			item.LockedUntil = &value
		}
		if lastStarted.Valid {
			value := lastStarted.Time
			item.LastStartedAt = &value
		}
		if lastFinished.Valid {
			value := lastFinished.Time
			item.LastFinishedAt = &value
		}
		if lastStatus.Valid {
			item.LastStatus = &lastStatus.String
		}
		if lastError.Valid {
			item.LastError = &lastError.String
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) SyncDefaultScheduledJobs(ctx context.Context, cfg config.Config) (scheduler.SyncResult, error) {
	intervals, err := store.ListActiveSourceIntervals(ctx)
	if err != nil {
		return scheduler.SyncResult{}, err
	}
	return store.SyncScheduledJobs(ctx, scheduler.BuildDefaultSpecs(intervals, cfg), time.Now().UTC(), cfg.SchedulerInitialJitterSeconds, cfg.Timezone)
}

func (store *Store) EnqueuePlatformRefresh(ctx context.Context) (map[string]any, error) {
	now := time.Now().UTC()
	var id, jobKey, lastStatus string
	var lockedUntil sql.NullTime
	err := store.pool.QueryRow(ctx, `SELECT id, job_key, last_status::text, locked_until FROM scheduled_jobs WHERE job_key = 'pipeline:platform-refresh'`).Scan(&id, &jobKey, &lastStatus, &lockedUntil)
	if err == pgx.ErrNoRows {
		return map[string]any{"status": "missing", "job_key": "pipeline:platform-refresh"}, nil
	}
	if err != nil {
		return nil, err
	}
	if lockedUntil.Valid && lockedUntil.Time.After(now) {
		return map[string]any{"status": "already_running", "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus), "locked_until": lockedUntil.Time.UTC().Format(time.RFC3339Nano), "message": "Platform refresh is already running."}, nil
	}
	if _, err := store.pool.Exec(ctx, `UPDATE scheduled_jobs SET next_run_at = $1, is_enabled = TRUE, updated_at = now() WHERE id = $2`, now, id); err != nil {
		return nil, err
	}
	return map[string]any{"status": "accepted", "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus), "message": "Platform refresh queued for the scheduler worker."}, nil
}

func (store *Store) PlatformRefreshStatus(ctx context.Context) (map[string]any, error) {
	var id, jobKey string
	var nextRun time.Time
	var lockedUntil, finished sql.NullTime
	var lastStatus, lastError sql.NullString
	err := store.pool.QueryRow(ctx, `SELECT id, job_key, next_run_at, locked_until, last_finished_at, last_status::text, last_error FROM scheduled_jobs WHERE job_key = 'pipeline:platform-refresh'`).Scan(&id, &jobKey, &nextRun, &lockedUntil, &finished, &lastStatus, &lastError)
	if err == pgx.ErrNoRows {
		return map[string]any{"status": "missing", "job_key": "pipeline:platform-refresh", "message": "Platform refresh job has not been synced yet."}, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	status := "idle"
	if lockedUntil.Valid && lockedUntil.Time.After(now) {
		status = "running"
	} else if !nextRun.After(now) {
		status = "queued"
	} else if lastStatus.Valid && lastStatus.String == "SUCCEEDED" {
		status = "succeeded"
	} else if lastStatus.Valid && lastStatus.String == "FAILED" {
		status = "failed"
	}
	result := map[string]any{"status": status, "job_id": id, "job_key": jobKey, "last_status": nullableString(lastStatus.String)}
	if lockedUntil.Valid {
		result["locked_until"] = lockedUntil.Time.UTC().Format(time.RFC3339Nano)
	}
	if finished.Valid {
		result["last_finished_at"] = finished.Time.UTC().Format(time.RFC3339Nano)
	}
	if lastError.Valid && strings.TrimSpace(lastError.String) != "" {
		result["last_error"] = "Platform refresh failed; provider details are not exposed."
	}
	return result, nil
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func (store *Store) RefreshDailySnapshots(ctx context.Context, now time.Time) (SnapshotResult, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT u.id, u.timezone, COALESCE(l.city, ''), COALESCE(l.label, ''), COALESCE(l.district, '')
		FROM users AS u
		LEFT JOIN LATERAL (
			SELECT city, label, district FROM user_locations
			WHERE user_id = u.id AND is_default = TRUE ORDER BY created_at DESC LIMIT 1
		) AS l ON TRUE
		WHERE u.status = 'ACTIVE'
	`)
	if err != nil {
		return SnapshotResult{}, err
	}
	type snapshotUser struct{ id, timezone, city, label, district string }
	users := []snapshotUser{}
	for rows.Next() {
		var user snapshotUser
		if err := rows.Scan(&user.id, &user.timezone, &user.city, &user.label, &user.district); err != nil {
			rows.Close()
			return SnapshotResult{}, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return SnapshotResult{}, err
	}
	rows.Close()
	result := SnapshotResult{}
	for _, user := range users {
		location, err := time.LoadLocation(user.timezone)
		if err != nil {
			location = time.UTC
		}
		localDate := now.UTC().In(location).Format("2006-01-02")
		refs := []string{strings.ToLower(user.city), strings.ToLower(user.label)}
		if user.district != "" {
			refs = append(refs, strings.ToLower(user.district))
		}
		eventRows, err := store.pool.Query(ctx, `
			SELECT event_type, title, summary, severity::text, ends_at
			FROM normalized_events
			WHERE ends_at >= $1 AND starts_at <= $2
			  AND location_type IN ('CITY'::location_type, 'DISTRICT'::location_type)
			  AND LOWER(location_ref) = ANY($3::text[])
			  AND event_type = ANY($4::text[])
			ORDER BY starts_at ASC
		`, now.UTC(), now.UTC().Add(18*time.Hour), refs, []string{"rain_risk", "weather_outlook", "air_quality_poor", "air_quality_status", "transit_delay", "transit_disruption", "cheap_energy_window"})
		if err != nil {
			return result, err
		}
		type card struct {
			Type, Title, Summary, Severity string
			ValidTo                        time.Time
		}
		cardsByType := map[string][]card{}
		for eventRows.Next() {
			var item card
			if err := eventRows.Scan(&item.Type, &item.Title, &item.Summary, &item.Severity, &item.ValidTo); err != nil {
				eventRows.Close()
				return result, err
			}
			cardsByType[item.Type] = append(cardsByType[item.Type], item)
		}
		if err := eventRows.Err(); err != nil {
			eventRows.Close()
			return result, err
		}
		eventRows.Close()
		cardSpecs := []struct {
			key, title, titleZH, empty, emptyZH string
			types                               []string
		}{{"weather", "Weather", "天气", "No normalized weather signal is available yet.", "暂时没有可用的标准化天气信号。", []string{"rain_risk", "weather_outlook"}}, {"commute", "Commute", "通勤", "Commute events will appear after transit alerts are normalized.", "标准化公共交通告警后，这里会显示通勤事件。", []string{"transit_delay", "transit_disruption"}}, {"energy", "Energy", "能源", "Energy windows will appear after electricity data is normalized.", "标准化电力数据后，这里会显示适合安排用电的时段。", []string{"cheap_energy_window"}}, {"air", "Air Quality", "空气质量", "No normalized air-quality signal is available yet.", "暂时没有可用的标准化空气质量信号。", []string{"air_quality_poor", "air_quality_status"}}}
		cards := []map[string]any{}
		for _, spec := range cardSpecs {
			selected := []card{}
			for _, kind := range spec.types {
				selected = append(selected, cardsByType[kind]...)
			}
			sort.SliceStable(selected, func(i, j int) bool {
				rank := map[string]int{"HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}
				if rank[selected[i].Severity] != rank[selected[j].Severity] {
					return rank[selected[i].Severity] > rank[selected[j].Severity]
				}
				return selected[i].ValidTo.Before(selected[j].ValidTo)
			})
			summary := spec.empty
			summaryZH := spec.emptyZH
			severity := "info"
			var validTo any
			if len(selected) > 0 {
				if len(selected) > 2 {
					selected = selected[:2]
				}
				parts := []string{}
				for _, item := range selected {
					parts = append(parts, item.Summary)
				}
				summary = strings.Join(parts, " ")
				// Event summaries are normalized in English only, so drop the
				// Chinese empty-state sentence once real signals are present:
				// the client falls back to the English summary when this is
				// blank, which beats telling a reader there is no signal.
				summaryZH = ""
				severity = strings.ToLower(selected[0].Severity)
				validTo = selected[0].ValidTo.UTC().Format(time.RFC3339Nano)
			}
			item := map[string]any{"type": spec.key, "title": spec.title, "title_zh": spec.titleZH, "summary": summary, "summary_zh": summaryZH, "severity": severity}
			if validTo != nil {
				item["valid_to"] = validTo
			}
			cards = append(cards, item)
		}
		payload, err := json.Marshal(map[string]any{"date": localDate, "location": user.city, "cards": cards, "notifications": []any{}})
		if err != nil {
			return result, err
		}
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO daily_snapshots (id, user_id, snapshot_date, summary, generated_at)
			VALUES ($1, $2, $3::date, $4::jsonb, $5)
			ON CONFLICT (user_id, snapshot_date) DO UPDATE SET summary = EXCLUDED.summary, generated_at = EXCLUDED.generated_at
		`, randomID(), user.id, localDate, payload, now.UTC()); err != nil {
			return result, err
		}
		result.Users++
	}
	return result, nil
}

func (store *Store) RunRules(ctx context.Context, now time.Time) (RulesResult, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return RulesResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	type userRow struct {
		id, timezone, city, label, district                           string
		caresWeather, caresAir, caresCommute, caresEnergy, hasCommute bool
	}
	userRows, err := tx.Query(ctx, `
		SELECT u.id, u.timezone,
		       COALESCE(p.cares_weather, TRUE), COALESCE(p.cares_air_quality, TRUE),
		       COALESCE(p.cares_commute, TRUE), COALESCE(p.cares_energy, FALSE),
		       COALESCE(l.city, ''), COALESCE(l.label, ''), COALESCE(l.district, ''),
		       EXISTS (SELECT 1 FROM user_commute_profiles cp WHERE cp.user_id = u.id AND cp.is_active = TRUE)
		FROM users AS u
		LEFT JOIN user_preferences AS p ON p.user_id = u.id
		LEFT JOIN LATERAL (
			SELECT city, label, district
			FROM user_locations
			WHERE user_id = u.id AND is_default = TRUE
			ORDER BY created_at DESC
			LIMIT 1
		) AS l ON TRUE
		WHERE u.status = 'ACTIVE'
	`)
	if err != nil {
		return RulesResult{}, err
	}
	users := []userRow{}
	for userRows.Next() {
		var user userRow
		if err := userRows.Scan(&user.id, &user.timezone, &user.caresWeather, &user.caresAir, &user.caresCommute, &user.caresEnergy, &user.city, &user.label, &user.district, &user.hasCommute); err != nil {
			userRows.Close()
			return RulesResult{}, err
		}
		users = append(users, user)
	}
	if err := userRows.Err(); err != nil {
		userRows.Close()
		return RulesResult{}, err
	}
	userRows.Close()

	type ruleRow struct {
		id, code string
		cooldown int
	}
	ruleRows, err := tx.Query(ctx, `SELECT id, rule_code, cooldown_minutes FROM rule_definitions WHERE is_active = TRUE`)
	if err != nil {
		return RulesResult{}, err
	}
	rulesByCode := map[string]ruleRow{}
	for ruleRows.Next() {
		var rule ruleRow
		if err := ruleRows.Scan(&rule.id, &rule.code, &rule.cooldown); err != nil {
			ruleRows.Close()
			return RulesResult{}, err
		}
		rulesByCode[rule.code] = rule
	}
	if err := ruleRows.Err(); err != nil {
		ruleRows.Close()
		return RulesResult{}, err
	}
	ruleRows.Close()

	result := RulesResult{Users: len(users)}
	horizon := now.UTC().Add(18 * time.Hour)
	for _, user := range users {
		locationRefs := rules.User{City: user.city, Label: user.label, District: user.district}.LocationRefs()
		if len(locationRefs) == 0 {
			continue
		}
		eventRows, queryErr := tx.Query(ctx, `
			SELECT id, event_type, severity::text, location_ref, starts_at, ends_at, title, attributes
			FROM normalized_events
			WHERE ends_at >= $1 AND starts_at <= $2
			  AND location_type IN ('CITY'::location_type, 'DISTRICT'::location_type)
			  AND LOWER(location_ref) = ANY($3::text[])
			ORDER BY starts_at ASC
		`, now.UTC(), horizon, locationRefs)
		if queryErr != nil {
			return RulesResult{}, queryErr
		}
		type evaluatedEvent struct {
			event rules.Event
			draft rules.Draft
			rule  ruleRow
		}
		evaluated := []evaluatedEvent{}
		for eventRows.Next() {
			var event rules.Event
			var attributeBytes []byte
			if err := eventRows.Scan(&event.ID, &event.EventType, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &attributeBytes); err != nil {
				eventRows.Close()
				return RulesResult{}, err
			}
			if err := json.Unmarshal(attributeBytes, &event.Attributes); err != nil {
				eventRows.Close()
				return RulesResult{}, err
			}
			result.Events++
			userContext := rules.User{ID: user.id, Timezone: user.timezone, City: user.city, Label: user.label, District: user.district, CaresWeather: user.caresWeather, CaresAir: user.caresAir, CaresCommute: user.caresCommute, CaresEnergy: user.caresEnergy, HasCommuteProfile: user.hasCommute}
			ruleCode := map[string]string{"rain_risk": "R1_RAIN_RISK", "weather_outlook": "R2_WEATHER_OUTLOOK", "air_quality_poor": "R10_AIR_QUALITY_POOR", "air_quality_status": "R11_AIR_QUALITY_STATUS", "transit_delay": "R20_COMMUTE_DISRUPTION", "transit_disruption": "R20_COMMUTE_DISRUPTION", "cheap_energy_window": "R30_ENERGY_WINDOW"}[event.EventType]
			rule, exists := rulesByCode[ruleCode]
			if !exists {
				continue
			}
			draft, shouldCreate := rules.Build(event, userContext, rule.cooldown)
			if !shouldCreate {
				continue
			}
			evaluated = append(evaluated, evaluatedEvent{event: event, draft: draft, rule: rule})
		}
		if err := eventRows.Err(); err != nil {
			eventRows.Close()
			return RulesResult{}, err
		}
		eventRows.Close()
		for _, item := range evaluated {
			event, draft, rule := item.event, item.draft, item.rule
			rationale, marshalErr := json.Marshal(draft.Rationale)
			if marshalErr != nil {
				return RulesResult{}, marshalErr
			}
			var recommendationID string
			recommendationErr := tx.QueryRow(ctx, `
				SELECT id FROM recommendations
				WHERE user_id = $1 AND event_id = $2 AND recommendation_type = $3::recommendation_type
			`, user.id, event.ID, draft.RecommendationType).Scan(&recommendationID)
			if recommendationErr == pgx.ErrNoRows {
				recommendationErr = tx.QueryRow(ctx, `
					INSERT INTO recommendations
						(id, user_id, event_id, recommendation_type, priority, status, advice_title, advice_body, advice_title_zh, advice_body_zh, rationale, valid_from, valid_to)
					VALUES ($1, $2, $3, $4::recommendation_type, $5, 'PENDING'::recommendation_status, $6, $7, $8, $9, $10::jsonb, $11, $12)
					RETURNING id
				`, randomID(), user.id, event.ID, draft.RecommendationType, draft.Priority, draft.Title, draft.Body, draft.TitleZH, draft.BodyZH, rationale, event.StartsAt.UTC(), event.EndsAt.UTC()).Scan(&recommendationID)
				if recommendationErr == nil {
					result.Recommendations++
				}
			} else if recommendationErr == nil {
				_, recommendationErr = tx.Exec(ctx, `
					UPDATE recommendations
					SET priority = $1, advice_title = $2, advice_body = $3, advice_title_zh = $4,
					    advice_body_zh = $5, rationale = $6::jsonb, valid_from = $7, valid_to = $8
					WHERE id = $9
				`, draft.Priority, draft.Title, draft.Body, draft.TitleZH, draft.BodyZH, rationale, event.StartsAt.UTC(), event.EndsAt.UTC(), recommendationID)
			}
			if recommendationErr != nil {
				return RulesResult{}, recommendationErr
			}
			var ruleHitID string
			hitErr := tx.QueryRow(ctx, `SELECT id FROM rule_hits WHERE rule_id = $1 AND user_id = $2 AND event_id = $3`, rule.id, user.id, event.ID).Scan(&ruleHitID)
			hitContext, _ := json.Marshal(map[string]any{"rule_code": rule.code, "recommendation_type": draft.RecommendationType, "priority": draft.Priority})
			if hitErr == pgx.ErrNoRows {
				_, hitErr = tx.Exec(ctx, `INSERT INTO rule_hits (id, rule_id, user_id, event_id, recommendation_id, hit_context) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, randomID(), rule.id, user.id, event.ID, recommendationID, hitContext)
			} else if hitErr == nil {
				_, hitErr = tx.Exec(ctx, `UPDATE rule_hits SET recommendation_id = $1, hit_context = $2::jsonb WHERE id = $3`, recommendationID, hitContext, ruleHitID)
			}
			if hitErr != nil {
				return RulesResult{}, hitErr
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return RulesResult{}, err
	}
	return result, nil
}

func (store *Store) SyncPublicRecommendations(ctx context.Context, now time.Time) (PublicRulesResult, error) {
	uusimaaLocations := []string{"helsinki", "espoo", "vantaa", "kauniainen", "uusimaa", "helsinki_uusimaa", "helsinki_metro", "finland"}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE e.ends_at >= $1
		  AND (e.event_type = 'cheap_energy_window' OR e.location_ref = '' OR LOWER(e.location_ref) = ANY($2::text[]))
		ORDER BY e.starts_at ASC
	`, now.UTC(), uusimaaLocations)
	if err != nil {
		return PublicRulesResult{}, err
	}
	events := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			rows.Close()
			return PublicRulesResult{}, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				rows.Close()
				return PublicRulesResult{}, err
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return PublicRulesResult{}, err
	}
	rows.Close()
	statusItems, err := store.ListSourceStatusAt(ctx, now.UTC())
	if err != nil {
		return PublicRulesResult{}, err
	}
	statuses := make(map[string]string, len(statusItems))
	for _, item := range statusItems {
		statuses[item.SourceCode] = sources.DeriveOperationalStatus(item, now.UTC())
	}
	drafts := publicrules.Build(events, statuses, now.UTC())
	result := PublicRulesResult{Events: len(events), Recommendations: len(drafts)}
	activeKeys := map[string]struct{}{}
	for _, draft := range drafts {
		activeKeys[draft.DedupeKey] = struct{}{}
		evidence, err := json.Marshal(draft.Evidence)
		if err != nil {
			return PublicRulesResult{}, err
		}
		var id string
		err = store.pool.QueryRow(ctx, `SELECT id FROM public_recommendations WHERE dedupe_key = $1`, draft.DedupeKey).Scan(&id)
		if err == pgx.ErrNoRows {
			if err := store.pool.QueryRow(ctx, `
				INSERT INTO public_recommendations
					(id, dedupe_key, event_id, scenario_key, recommendation_kind, area_scope, severity,
					 freshness_state, priority, title, body, evidence, confidence, valid_from, valid_to, is_active)
				VALUES ($1, $2, $3, $4::scenario_key, $5::public_recommendation_kind, $6::area_scope,
				        $7::public_recommendation_severity, $8::freshness_state, $9, $10, $11,
				        $12::jsonb, $13, $14, $15, TRUE)
				RETURNING id
			`, randomID(), draft.DedupeKey, draft.EventID, draft.ScenarioKey, draft.RecommendationKind, draft.AreaScope, draft.Severity, draft.FreshnessState, draft.Priority, draft.Title, draft.Body, evidence, draft.Confidence, draft.ValidFrom.UTC(), draft.ValidTo.UTC()).Scan(&id); err != nil {
				return PublicRulesResult{}, err
			}
			result.Inserted++
		} else if err == nil {
			if _, err := store.pool.Exec(ctx, `
				UPDATE public_recommendations SET event_id = $1, scenario_key = $2::scenario_key,
					recommendation_kind = $3::public_recommendation_kind, area_scope = $4::area_scope,
					severity = $5::public_recommendation_severity, freshness_state = $6::freshness_state,
					priority = $7, title = $8, body = $9, evidence = $10::jsonb, confidence = $11,
					valid_from = $12, valid_to = $13, is_active = TRUE
				WHERE id = $14
			`, draft.EventID, draft.ScenarioKey, draft.RecommendationKind, draft.AreaScope, draft.Severity, draft.FreshnessState, draft.Priority, draft.Title, draft.Body, evidence, draft.Confidence, draft.ValidFrom.UTC(), draft.ValidTo.UTC(), id); err != nil {
				return PublicRulesResult{}, err
			}
			result.Updated++
		} else {
			return PublicRulesResult{}, err
		}
	}
	activeRows, err := store.pool.Query(ctx, `SELECT id, dedupe_key FROM public_recommendations WHERE is_active = TRUE`)
	if err != nil {
		return PublicRulesResult{}, err
	}
	for activeRows.Next() {
		var id, key string
		if err := activeRows.Scan(&id, &key); err != nil {
			activeRows.Close()
			return PublicRulesResult{}, err
		}
		if _, ok := activeKeys[key]; !ok {
			if _, err := store.pool.Exec(ctx, `UPDATE public_recommendations SET is_active = FALSE WHERE id = $1`, id); err != nil {
				activeRows.Close()
				return PublicRulesResult{}, err
			}
			result.Deactivated++
		}
	}
	if err := activeRows.Err(); err != nil {
		activeRows.Close()
		return PublicRulesResult{}, err
	}
	activeRows.Close()
	return result, nil
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

type PersistResult struct {
	Inserted int
	Skipped  int
}

func (store *Store) PersistObservations(ctx context.Context, sourceCode string, items []collectors.Observation) (PersistResult, error) {
	if len(items) == 0 {
		return PersistResult{}, nil
	}
	var sourceID string
	if err := store.pool.QueryRow(ctx, `SELECT id FROM data_sources WHERE source_code = $1`, sourceCode).Scan(&sourceID); err != nil {
		return PersistResult{}, err
	}
	seen := map[string]struct{}{}
	result := PersistResult{}
	for _, item := range items {
		key := item.Hash + "|" + item.ObservedAt.UTC().Format(time.RFC3339Nano)
		if _, exists := seen[key]; exists {
			result.Skipped++
			continue
		}
		seen[key] = struct{}{}
		payload, err := json.Marshal(item.Payload)
		if err != nil {
			return PersistResult{}, err
		}
		command, err := store.pool.Exec(ctx, `
			INSERT INTO raw_observations (id, source_id, dataset, area_code, observed_at, payload, hash)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
			ON CONFLICT (hash, observed_at) DO NOTHING
		`, randomID(), sourceID, item.Dataset, item.AreaCode, item.ObservedAt.UTC(), payload, item.Hash)
		if err != nil {
			return PersistResult{}, err
		}
		if command.RowsAffected() == 0 {
			result.Skipped++
		} else {
			result.Inserted++
		}
	}
	return result, nil
}

func (store *Store) AppendCollectorRun(ctx context.Context, sourceCode, dataset, status string, startedAt, finishedAt time.Time, records int, errorMessage *string) error {
	var sourceID string
	if err := store.pool.QueryRow(ctx, `SELECT id FROM data_sources WHERE source_code = $1`, sourceCode).Scan(&sourceID); err != nil {
		return err
	}
	_, err := store.pool.Exec(ctx, `
		INSERT INTO collector_runs (id, source_id, dataset, status, started_at, finished_at, records_ingested, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, randomID(), sourceID, dataset, status, startedAt.UTC(), finishedAt.UTC(), records, errorMessage)
	return err
}

// NormalizeObservations materializes recent raw observations into the
// normalized_events rows the HTTP API and scheduler read. It is
// intentionally source-code scoped so collectors can be rolled out one
// provider at a time.
func (store *Store) NormalizeObservations(ctx context.Context, windowStart, windowEnd time.Time, sourceCode string) (NormalizeResult, error) {
	return store.NormalizeObservationsLimited(ctx, windowStart, windowEnd, sourceCode, 0)
}

// NormalizeObservationsLimited caps how many raw rows one pass reads. A run
// after a large backfill can otherwise pull an entire window into memory at
// once; batchSize <= 0 keeps the unbounded behaviour.
func (store *Store) NormalizeObservationsLimited(ctx context.Context, windowStart, windowEnd time.Time, sourceCode string, batchSize int) (NormalizeResult, error) {
	if !windowEnd.After(windowStart) {
		return NormalizeResult{}, fmt.Errorf("normalization window must end after it starts")
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return NormalizeResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	query := `
		SELECT s.source_code, r.dataset, r.area_code, r.observed_at, r.payload, r.hash
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE r.observed_at >= $1 AND r.observed_at < $2`
	args := []any{windowStart.UTC(), windowEnd.UTC()}
	if strings.TrimSpace(sourceCode) != "" {
		query += ` AND s.source_code = $3`
		args = append(args, sourceCode)
	}
	query += ` ORDER BY r.observed_at DESC`
	if batchSize > 0 {
		query += ` LIMIT ` + strconv.Itoa(batchSize)
	}
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return NormalizeResult{}, err
	}
	type rawItem struct {
		source string
		item   collectors.Observation
	}
	items := []rawItem{}
	for rows.Next() {
		var item collectors.Observation
		var resolvedSource string
		var payloadBytes []byte
		if err := rows.Scan(&resolvedSource, &item.Dataset, &item.AreaCode, &item.ObservedAt, &payloadBytes, &item.Hash); err != nil {
			return NormalizeResult{}, err
		}
		if err := json.Unmarshal(payloadBytes, &item.Payload); err != nil {
			return NormalizeResult{}, err
		}
		items = append(items, rawItem{source: resolvedSource, item: item})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return NormalizeResult{}, err
	}
	rows.Close()

	result := NormalizeResult{Scanned: len(items)}
	for _, raw := range items {
		for _, draft := range normalizer.Normalize(raw.item, raw.source) {
			attributes, marshalErr := json.Marshal(draft.Attributes)
			if marshalErr != nil {
				return NormalizeResult{}, marshalErr
			}
			var inserted bool
			err = tx.QueryRow(ctx, `
				INSERT INTO normalized_events
					(id, event_type, source_id, severity, location_type, location_ref,
					 starts_at, ends_at, confidence, title, summary, attributes, dedupe_key)
				SELECT $1, $2, s.id, $3::severity, $4::location_type, $5,
				       $6, $7, $8, $9, $10, $11::jsonb, $12
				FROM data_sources AS s
				WHERE s.source_code = $13
				ON CONFLICT (source_id, dedupe_key) DO UPDATE SET
					event_type = EXCLUDED.event_type,
					severity = EXCLUDED.severity,
					location_type = EXCLUDED.location_type,
					location_ref = EXCLUDED.location_ref,
					starts_at = EXCLUDED.starts_at,
					ends_at = EXCLUDED.ends_at,
					confidence = EXCLUDED.confidence,
					title = EXCLUDED.title,
					summary = EXCLUDED.summary,
					attributes = EXCLUDED.attributes
				RETURNING (xmax = 0)
			`, randomID(), draft.EventType, draft.Severity, draft.LocationType, draft.LocationRef,
				draft.StartsAt.UTC(), draft.EndsAt.UTC(), draft.Confidence, draft.Title, draft.Summary,
				attributes, draft.DedupeKey, raw.source).Scan(&inserted)
			if err != nil {
				return NormalizeResult{}, err
			}
			if inserted {
				result.Inserted++
			} else {
				result.Updated++
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return NormalizeResult{}, err
	}
	return result, nil
}

func (store *Store) sourceCodeForObservation(ctx context.Context, tx pgx.Tx, item collectors.Observation) (string, error) {
	var sourceCode string
	err := tx.QueryRow(ctx, `
		SELECT s.source_code
		FROM data_sources AS s
		JOIN raw_observations AS r ON r.source_id = s.id
		WHERE r.dataset = $1 AND r.area_code = $2 AND r.observed_at = $3 AND r.hash = $4
		LIMIT 1
	`, item.Dataset, item.AreaCode, item.ObservedAt.UTC(), item.Hash).Scan(&sourceCode)
	return sourceCode, err
}

// nullableDaily keeps an interval job's daily_at_local NULL rather than "", so
// the column reads as "not a wall-clock job" instead of an unparseable time.
func nullableDaily(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (store *Store) SyncScheduledJobs(ctx context.Context, specs []scheduler.JobSpec, now time.Time, initialJitterSeconds int, timezone string) (scheduler.SyncResult, error) {
	result := scheduler.SyncResult{Jobs: len(specs)}
	for _, spec := range specs {
		payload, err := json.Marshal(spec.Payload)
		if err != nil {
			return scheduler.SyncResult{}, err
		}
		var id, taskType string
		var interval int
		var nextRun time.Time
		var existingPayload []byte
		var existingDaily sql.NullString
		err = store.pool.QueryRow(ctx, `
			SELECT id, task_type::text, interval_seconds, daily_at_local, payload, next_run_at
			FROM scheduled_jobs WHERE job_key = $1
		`, spec.JobKey).Scan(&id, &taskType, &interval, &existingDaily, &existingPayload, &nextRun)
		if err == pgx.ErrNoRows {
			nextRun = now.UTC().Add(time.Duration(scheduler.StableJitterSeconds(spec.JobKey, spec.IntervalSeconds, initialJitterSeconds)) * time.Second)
			// A wall-clock job waits for its hour rather than firing at boot,
			// so a restart cannot send a morning brief in the evening.
			if at, ok := scheduler.NextDailyRun(now.UTC(), spec.DailyAtLocal, timezone); ok {
				nextRun = at
			}
			_, err = store.pool.Exec(ctx, `
				INSERT INTO scheduled_jobs
					(id, job_key, task_type, interval_seconds, daily_at_local, payload, is_enabled, next_run_at)
				VALUES ($1, $2, $3::scheduler_task_type, $4, $5, $6::jsonb, TRUE, $7)
			`, randomID(), spec.JobKey, string(spec.TaskType), spec.IntervalSeconds, nullableDaily(spec.DailyAtLocal), payload, nextRun)
			if err != nil {
				return scheduler.SyncResult{}, err
			}
			result.Created++
			continue
		}
		if err != nil {
			return scheduler.SyncResult{}, err
		}
		changed := taskType != string(spec.TaskType) || interval != spec.IntervalSeconds ||
			existingDaily.String != spec.DailyAtLocal || !bytes.Equal(existingPayload, payload)
		if changed {
			_, err = store.pool.Exec(ctx, `
				UPDATE scheduled_jobs
				SET task_type = $1::scheduler_task_type, interval_seconds = $2,
				    daily_at_local = $3, payload = $4::jsonb, updated_at = now()
				WHERE id = $5
			`, string(spec.TaskType), spec.IntervalSeconds, nullableDaily(spec.DailyAtLocal), payload, id)
			if err != nil {
				return scheduler.SyncResult{}, err
			}
			result.Updated++
		}
	}
	return result, nil
}

func (store *Store) ClaimScheduledJobs(ctx context.Context, instanceID string, now time.Time, maxJobs, lockTTLSeconds int) ([]scheduler.ClaimedJob, error) {
	if maxJobs <= 0 {
		return nil, nil
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	lockedUntil := now.UTC().Add(time.Duration(lockTTLSeconds) * time.Second)
	rows, err := tx.Query(ctx, `
		SELECT id, job_key, task_type::text, interval_seconds, daily_at_local, payload
		FROM scheduled_jobs
		WHERE is_enabled = TRUE
		  AND next_run_at <= $1
		  AND (locked_until IS NULL OR locked_until <= $1)
		  AND task_type::text IN ('COLLECTOR', 'PIPELINE_NORMALIZE', 'PIPELINE_SNAPSHOTS',
		                         'RULES', 'DISPATCH', 'BACKFILL', 'PLATFORM_REFRESH')
		ORDER BY next_run_at ASC, job_key ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`, now.UTC(), maxJobs)
	if err != nil {
		return nil, err
	}
	claimed := make([]scheduler.ClaimedJob, 0)
	for rows.Next() {
		var job scheduler.ClaimedJob
		var taskType string
		var payloadBytes []byte
		var dailyAt sql.NullString
		if err := rows.Scan(&job.ID, &job.JobKey, &taskType, &job.IntervalSeconds, &dailyAt, &payloadBytes); err != nil {
			return nil, err
		}
		job.DailyAtLocal = dailyAt.String
		job.TaskType = scheduler.TaskType(taskType)
		job.StartedAt = now.UTC()
		job.LockedBy = instanceID
		if err := json.Unmarshal(payloadBytes, &job.Payload); err != nil {
			return nil, err
		}
		job.RunID = randomID()
		claimed = append(claimed, job)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for _, job := range claimed {
		if _, err := tx.Exec(ctx, `
			UPDATE scheduled_jobs
			SET locked_by = $1, locked_until = $2, last_started_at = $3,
			    last_status = 'RUNNING'::scheduler_run_status, last_error = NULL,
			    updated_at = now()
			WHERE id = $4
		`, instanceID, lockedUntil, now.UTC(), job.ID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO scheduled_job_runs
				(id, job_id, job_key, task_type, status, started_at)
			VALUES ($1, $2, $3, $4::scheduled_job_run_task_type, 'RUNNING'::scheduled_job_run_status, $5)
		`, job.RunID, job.ID, job.JobKey, string(job.TaskType), now.UTC()); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return claimed, nil
}

func (store *Store) CompleteScheduledJob(ctx context.Context, job scheduler.ClaimedJob, status scheduler.RunStatus, result map[string]any, errorMessage *string, now time.Time, failureRetrySeconds, rescheduleJitterSeconds int, timezone string) error {
	finishedAt := now.UTC()
	duration := int(finishedAt.Sub(job.StartedAt.UTC()).Milliseconds())
	if duration < 0 {
		duration = 0
	}
	resultBytes, err := json.Marshal(result)
	if err != nil {
		return err
	}
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		UPDATE scheduled_job_runs
		SET status = $1::scheduled_job_run_status, finished_at = $2,
		    duration_ms = $3, result = $4::jsonb, error_message = $5
		WHERE id = $6
	`, string(status), finishedAt, duration, resultBytes, errorMessage, job.RunID); err != nil {
		return err
	}
	nextRun := scheduledNextRun(job, status, finishedAt, failureRetrySeconds, rescheduleJitterSeconds, timezone)
	_, err = tx.Exec(ctx, `
		UPDATE scheduled_jobs
		SET next_run_at = $1, locked_by = NULL, locked_until = NULL,
		    last_finished_at = $2, last_status = $3::scheduler_run_status,
		    last_error = $4, updated_at = now()
		WHERE id = $5 AND locked_by = $6
	`, nextRun, finishedAt, string(status), errorMessage, job.ID, job.LockedBy)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// scheduledNextRun places the job's next run. An interval job keeps the jittered
// spacing that spreads load; a wall-clock job returns to its hour, and gets no
// jitter because the whole point is that it lands at the time it advertises. A
// failed wall-clock run retries soon, but never past its own next occurrence.
func scheduledNextRun(job scheduler.ClaimedJob, status scheduler.RunStatus, finishedAt time.Time, failureRetrySeconds, rescheduleJitterSeconds int, timezone string) time.Time {
	daily, isDaily := scheduler.NextDailyRun(finishedAt, job.DailyAtLocal, timezone)
	if isDaily {
		if status == scheduler.RunSucceeded {
			return daily
		}
		if retry := finishedAt.Add(time.Duration(failureRetrySeconds) * time.Second); retry.Before(daily) {
			return retry
		}
		return daily
	}
	delay := job.IntervalSeconds
	if status != scheduler.RunSucceeded {
		delay = failureRetrySeconds
	}
	delay += scheduler.StableJitterSeconds(job.JobKey, delay, rescheduleJitterSeconds)
	return finishedAt.Add(time.Duration(delay) * time.Second)
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

func (store *Store) IsActiveUser(ctx context.Context, userID string) (bool, error) {
	var active bool
	err := store.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM users WHERE id = $1 AND status = 'ACTIVE'
		)
	`, userID).Scan(&active)
	return active, err
}

func (store *Store) GetUser(ctx context.Context, userID string) (users.User, error) {
	var user users.User
	err := scanUser(store.pool.QueryRow(ctx, `
		SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID), &user)
	return user, err
}

func (store *Store) GetOrCreateAdminUser(ctx context.Context, cfg config.Config) (users.User, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return users.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user users.User
	err = scanUser(tx.QueryRow(ctx, `
		SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
		FROM users WHERE email = $1
	`, cfg.AdminEmail), &user)
	if err == pgx.ErrNoRows {
		err = scanUser(tx.QueryRow(ctx, `
			SELECT id, email, name, locale, timezone, status::text, created_at, updated_at
			FROM users WHERE id = $1
		`, cfg.AdminUserID), &user)
	}
	if err == pgx.ErrNoRows {
		err = scanUser(tx.QueryRow(ctx, `
			INSERT INTO users (id, email, name, locale, timezone, status)
			VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
			RETURNING id, email, name, locale, timezone, status::text, created_at, updated_at
		`, cfg.AdminUserID, cfg.AdminEmail, cfg.AdminName, cfg.AdminLocale, cfg.Timezone), &user)
	} else if err == nil {
		err = scanUser(tx.QueryRow(ctx, `
			UPDATE users
			SET email = $1, name = $2, locale = $3, timezone = $4, status = 'ACTIVE', updated_at = now()
			WHERE id = $5
			RETURNING id, email, name, locale, timezone, status::text, created_at, updated_at
		`, cfg.AdminEmail, cfg.AdminName, cfg.AdminLocale, cfg.Timezone, user.ID), &user)
	}
	if err != nil {
		return users.User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return users.User{}, err
	}
	return user, nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanUser(row rowScanner, user *users.User) error {
	var email, name sql.NullString
	if err := row.Scan(
		&user.ID,
		&email,
		&name,
		&user.Locale,
		&user.Timezone,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return err
	}
	if email.Valid {
		user.Email = &email.String
	}
	if name.Valid {
		user.Name = &name.String
	}
	return nil
}

func (store *Store) ListSourceStatus(ctx context.Context) ([]sources.Status, error) {
	return store.ListSourceStatusAt(ctx, time.Now().UTC())
}

func (store *Store) ListSourceStatusAt(ctx context.Context, now time.Time) ([]sources.Status, error) {
	location, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		return nil, err
	}
	today := now.In(location)
	firstDay := today.AddDate(0, 0, -6).Format("2006-01-02")
	rows, err := store.pool.Query(ctx, `
		SELECT
			s.id,
			s.source_code,
			s.source_name,
			s.endpoint,
			s.auth_type::text,
			s.poll_interval_seconds,
			s.is_active,
			r.status,
			r.started_at,
			r.finished_at,
			r.records_ingested,
			r.error_message,
      success.finished_at,
      history.days
		FROM data_sources AS s
		LEFT JOIN LATERAL (
			SELECT CASE WHEN finished_at IS NULL OR finished_at > $3 THEN 'running' ELSE status END AS status,
        started_at,
        CASE WHEN finished_at <= $3 THEN finished_at END AS finished_at,
        CASE WHEN finished_at <= $3 THEN records_ingested ELSE 0 END AS records_ingested,
        CASE WHEN finished_at <= $3 THEN error_message END AS error_message
			FROM collector_runs
			WHERE source_id = s.id AND started_at <= $3
			ORDER BY started_at DESC
			LIMIT 1
		) AS r ON TRUE
    LEFT JOIN LATERAL (
      SELECT finished_at FROM collector_runs
      WHERE source_id = s.id AND status = 'succeeded' AND finished_at IS NOT NULL AND finished_at <= $3
      ORDER BY finished_at DESC LIMIT 1
    ) AS success ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.date) AS days FROM (
        SELECT day::date::text AS date,
          count(r.id)::int AS runs,
          count(r.id) FILTER (WHERE r.status = 'succeeded' AND r.finished_at <= $3)::int AS succeeded,
          count(r.id) FILTER (WHERE r.status = 'failed' AND r.finished_at <= $3)::int AS failed,
          count(r.id) FILTER (WHERE r.finished_at IS NULL OR r.finished_at > $3)::int AS running
        FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') AS day
        LEFT JOIN collector_runs AS r ON r.source_id = s.id
          AND r.started_at >= (day AT TIME ZONE 'Europe/Helsinki')
          AND r.started_at < ((day + interval '1 day') AT TIME ZONE 'Europe/Helsinki')
          AND r.started_at <= $3
        GROUP BY day
      ) AS daily
    ) AS history ON TRUE
		ORDER BY s.source_code ASC
	`, firstDay, today.Format("2006-01-02"), now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]sources.Status, 0)
	for rows.Next() {
		var source sources.Status
		var runStatus, startedAt, errorMessage sql.NullString
		var recordsIngested sql.NullInt64
		var startedAtTime, finishedAtTime, lastSuccessfulTime sql.NullTime
		var historyJSON []byte
		if err := rows.Scan(
			&source.ID,
			&source.SourceCode,
			&source.SourceName,
			&source.Endpoint,
			&source.AuthType,
			&source.PollIntervalSeconds,
			&source.IsActive,
			&runStatus,
			&startedAtTime,
			&finishedAtTime,
			&recordsIngested,
			&errorMessage,
			&lastSuccessfulTime,
			&historyJSON,
		); err != nil {
			return nil, err
		}
		if lastSuccessfulTime.Valid {
			value := formatTime(lastSuccessfulTime.Time)
			source.LastSuccessfulRunAt = &value
		}
		if err := json.Unmarshal(historyJSON, &source.RunHistory); err != nil {
			return nil, fmt.Errorf("decode source run history: %w", err)
		}
		if runStatus.Valid {
			startedAt = sql.NullString{String: formatTime(startedAtTime.Time), Valid: startedAtTime.Valid}
			var finishedAtValue *string
			if finishedAtTime.Valid {
				value := formatTime(finishedAtTime.Time)
				finishedAtValue = &value
			}
			source.LastRun = &sources.CollectorRun{
				Status:          runStatus.String,
				StartedAt:       startedAt.String,
				FinishedAt:      finishedAtValue,
				RecordsIngested: int(recordsIngested.Int64),
				ErrorMessage:    publicCollectionError(errorMessage),
			}
		}
		result = append(result, source)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (store *Store) ListRecommendations(ctx context.Context, userID string, limit int) ([]recommendations.Read, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := store.pool.Query(ctx, `
		SELECT
			r.id,
			r.recommendation_type::text,
			r.priority,
			r.status::text,
			r.advice_title,
			r.advice_title_zh,
			r.advice_body,
			r.advice_body_zh,
			r.rationale,
			r.valid_from,
			r.valid_to,
			e.event_type,
			e.severity::text
		FROM recommendations AS r
		JOIN normalized_events AS e ON e.id = r.event_id
		WHERE r.user_id = $1
		ORDER BY r.priority DESC, r.valid_from ASC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]recommendations.Read, 0)
	for rows.Next() {
		var item recommendations.Read
		var titleZH, bodyZH sql.NullString
		var rationaleBytes []byte
		if err := rows.Scan(
			&item.ID,
			&item.RecommendationType,
			&item.Priority,
			&item.Status,
			&item.AdviceTitle,
			&titleZH,
			&item.AdviceBody,
			&bodyZH,
			&rationaleBytes,
			&item.ValidFrom,
			&item.ValidTo,
			&item.EventType,
			&item.EventSeverity,
		); err != nil {
			return nil, err
		}
		if titleZH.Valid {
			item.AdviceTitleZH = &titleZH.String
		}
		if bodyZH.Valid {
			item.AdviceBodyZH = &bodyZH.String
		}
		item.Rationale = make(map[string]any)
		if len(rationaleBytes) > 0 {
			if err := json.Unmarshal(rationaleBytes, &item.Rationale); err != nil {
				return nil, err
			}
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (store *Store) LoadWeather(ctx context.Context, query observations.WeatherQuery) (observations.WeatherData, error) {
	outlook, err := store.loadWeatherEvent(ctx, "weather_outlook", query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	rain, err := store.loadWeatherEvent(ctx, "rain_risk", query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	raw, err := store.loadLatestWeatherRaw(ctx, query)
	if err != nil {
		return observations.WeatherData{}, err
	}
	return observations.WeatherData{Outlook: outlook, Rain: rain, Raw: raw}, nil
}

func (store *Store) LoadAirQuality(ctx context.Context, query airquality.Query) (airquality.Data, error) {
	event, err := store.loadAirQualityEvent(ctx, query)
	if err != nil {
		return airquality.Data{}, err
	}
	hsyRaw, err := store.loadAirQualityRaw(ctx, "hsy", query)
	if err != nil {
		return airquality.Data{}, err
	}
	openMeteoRaw, err := store.loadAirQualityRaw(ctx, "open_meteo_air", query)
	if err != nil {
		return airquality.Data{}, err
	}
	return airquality.Data{Event: event, HSYRaw: hsyRaw, OpenMeteoRaw: openMeteoRaw}, nil
}

func (store *Store) LoadEnergy(ctx context.Context, query energy.Query) (energy.Data, error) {
	price, err := store.loadEnergyRaw(ctx, "porssisahko", []string{"energy_price_timeseries"}, query)
	if err != nil {
		return energy.Data{}, err
	}
	grid, err := store.loadEnergyRaw(ctx, "fingrid", []string{"energy_timeseries", "dataset_probe"}, query)
	if err != nil {
		return energy.Data{}, err
	}
	var event *observations.NormalizedEvent
	if query.Historical {
		event, err = store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'fingrid'
			  AND e.event_type = 'cheap_energy_window'
			  AND e.ends_at > $1
			  AND e.starts_at < $2
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, *query.WindowStart, *query.WindowEnd))
	} else {
		event, err = store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'fingrid'
			  AND e.event_type = 'cheap_energy_window'
			  AND e.ends_at >= $1
			  AND e.starts_at <= $2
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, query.Now, query.Now.Add(energyLookahead(query))))
	}
	if err != nil {
		return energy.Data{}, err
	}
	return energy.Data{Price: price, Grid: grid, Event: event}, nil
}

func energyLookahead(query energy.Query) time.Duration {
	if query.LookaheadHours > 0 {
		return time.Duration(query.LookaheadHours) * time.Hour
	}
	return 36 * time.Hour
}

func (store *Store) LoadTraffic(ctx context.Context, query traffic.Query) (traffic.Data, error) {
	raw, err := store.loadTrafficRaw(ctx, query)
	if err != nil {
		return traffic.Data{}, err
	}
	events, err := store.loadTrafficEvents(ctx, query)
	if err != nil {
		return traffic.Data{}, err
	}
	return traffic.Data{Raw: raw, Events: events}, nil
}

func transitAreaRefs(locationRef string) []string {
	if platform.IsCapitalRegionCity(locationRef) {
		if strings.EqualFold(locationRef, "helsinki") {
			return []string{"helsinki"}
		}
		return []string{strings.ToLower(strings.TrimSpace(locationRef)), "helsinki"}
	}
	if strings.TrimSpace(locationRef) == "" {
		return nil
	}
	return []string{strings.ToLower(strings.TrimSpace(locationRef))}
}

func (store *Store) LoadTransit(ctx context.Context, query observations.TransitQuery) (observations.TransitData, error) {
	args := []any{"digitransit", "service_alerts"}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1 AND r.dataset = $2`
	areaRefs := transitAreaRefs(query.LocationRef)
	if len(areaRefs) > 0 {
		statement += " AND LOWER(r.area_code) = ANY($3::text[])"
		args = append(args, areaRefs)
	}
	if query.WindowStart != nil && query.WindowEnd != nil {
		startArg, endArg := len(args)+1, len(args)+2
		statement += fmt.Sprintf(" AND r.observed_at >= $%d AND r.observed_at < $%d", startArg, endArg)
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.observed_at DESC LIMIT 1"
	raw, err := store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
	if err != nil {
		return observations.TransitData{}, err
	}
	start, end := query.Now.Add(-24*time.Hour), query.Now.Add(30*24*time.Hour)
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		start, end = *query.WindowStart, *query.WindowEnd
	}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'digitransit'
		  AND e.event_type = ANY($3::text[])
		  AND e.ends_at >= $1 AND e.starts_at <= $2
		  AND (cardinality($4::text[]) = 0 OR LOWER(e.location_ref) = ANY($4::text[]))
		ORDER BY e.starts_at DESC
	`, start, end, []string{"transit_delay", "transit_disruption"}, areaRefs)
	if err != nil {
		return observations.TransitData{}, err
	}
	defer rows.Close()
	events := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return observations.TransitData{}, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return observations.TransitData{}, err
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return observations.TransitData{}, err
	}
	return observations.TransitData{Raw: raw, Events: events}, nil
}

func (store *Store) LoadPlatform(ctx context.Context, query platform.PlatformQuery) (platform.PlatformData, error) {
	start, end := query.Now.Add(-6*time.Hour), query.Now.Add(48*time.Hour)
	capitalMetro := platform.IsCapitalRegionCity(query.LocationRef)
	args := []any{start, end, query.LocationRef, capitalMetro}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		args = []any{*query.WindowStart, *query.WindowEnd, query.LocationRef, capitalMetro}
	}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE e.ends_at >= $1
		  AND e.starts_at <= $2
		  AND ($3 = '' OR e.location_ref = $3 OR e.location_ref = 'finland' OR ($4 AND s.source_code = 'digitransit' AND e.location_ref = 'helsinki'))
		ORDER BY e.starts_at ASC
		LIMIT 120
	`, args...)
	if err != nil {
		return platform.PlatformData{}, err
	}
	defer rows.Close()
	events := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return platform.PlatformData{}, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return platform.PlatformData{}, err
			}
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return platform.PlatformData{}, err
	}
	stats := []platform.RawStat{}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		statRows, err := store.pool.Query(ctx, `
			SELECT s.source_code, r.dataset, r.area_code, COUNT(*), MAX(r.observed_at)
			FROM raw_observations AS r
			JOIN data_sources AS s ON s.id = r.source_id
			WHERE r.observed_at >= $1 AND r.observed_at < $2
			GROUP BY s.source_code, r.dataset, r.area_code
		`, *query.WindowStart, *query.WindowEnd)
		if err != nil {
			return platform.PlatformData{}, err
		}
		defer statRows.Close()
		for statRows.Next() {
			var item platform.RawStat
			var count int
			var latest time.Time
			if err := statRows.Scan(&item.SourceCode, &item.Dataset, &item.AreaCode, &count, &latest); err != nil {
				return platform.PlatformData{}, err
			}
			item.Count, item.LatestAt = count, &latest
			stats = append(stats, item)
		}
		if err := statRows.Err(); err != nil {
			return platform.PlatformData{}, err
		}
	}
	return platform.PlatformData{Events: events, RawStat: stats}, nil
}

func (store *Store) loadTrafficRaw(ctx context.Context, query traffic.Query) ([]observations.RawObservation, error) {
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = 'digitraffic'
		  AND r.dataset = 'traffic_messages'
	`
	args := []any{}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $1 AND r.observed_at < $2 ORDER BY r.observed_at DESC"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	} else {
		latest, err := store.pool.Query(ctx, statement+" ORDER BY r.observed_at DESC LIMIT 1", args...)
		if err != nil {
			return nil, err
		}
		var latestAt time.Time
		if latest.Next() {
			var dataset, area string
			var payload []byte
			if err := latest.Scan(&dataset, &area, &latestAt, &payload); err != nil {
				latest.Close()
				return nil, err
			}
		}
		if err := latest.Err(); err != nil {
			latest.Close()
			return nil, err
		}
		latest.Close()
		if latestAt.IsZero() {
			return []observations.RawObservation{}, nil
		}
		statement += " AND r.observed_at >= $1 ORDER BY r.observed_at DESC"
		args = append(args, latestAt.Add(-5*time.Minute))
	}
	rows, err := store.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []observations.RawObservation{}
	seen := map[string]struct{}{}
	for rows.Next() {
		item, err := scanRawObservationRow(rows)
		if err != nil {
			return nil, err
		}
		messageType := item.Payload["message_type"]
		key, ok := messageType.(string)
		if !ok || key == "" {
			key = "traffic_messages"
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) loadTrafficEvents(ctx context.Context, query traffic.Query) ([]observations.NormalizedEvent, error) {
	start, end := query.Now.Add(-24*time.Hour), query.Now.Add(30*24*time.Hour)
	args := []any{start, end}
	if query.Historical && query.WindowStart != nil && query.WindowEnd != nil {
		start, end = *query.WindowStart, *query.WindowEnd
		args = []any{start, end}
	}
	rows, err := store.pool.Query(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.title, e.summary, e.attributes, e.created_at
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'digitraffic'
		  AND e.event_type = ANY($3::text[])
		  AND e.ends_at >= $1
		  AND e.starts_at <= $2
		ORDER BY e.starts_at DESC
	`, args[0], args[1], []string{"road_disruption", "road_weather_risk", "rail_delay", "marine_disruption"})
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []observations.NormalizedEvent{}
	for rows.Next() {
		var event observations.NormalizedEvent
		var attributes []byte
		if err := rows.Scan(&event.ID, &event.EventType, &event.SourceCode, &event.Severity, &event.LocationRef, &event.StartsAt, &event.EndsAt, &event.Title, &event.Summary, &attributes, &event.CreatedAt); err != nil {
			return nil, err
		}
		event.Attributes = map[string]any{}
		if len(attributes) > 0 {
			if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
				return nil, err
			}
		}
		result = append(result, event)
	}
	return result, rows.Err()
}

func scanRawObservationRow(row interface{ Scan(...any) error }) (observations.RawObservation, error) {
	var item observations.RawObservation
	var payload []byte
	if err := row.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
		return observations.RawObservation{}, err
	}
	item.Payload = map[string]any{}
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return observations.RawObservation{}, err
		}
	}
	return item, nil
}

func (store *Store) loadEnergyRaw(ctx context.Context, sourceCode string, datasets []string, query energy.Query) (observations.RawObservation, error) {
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1
		  AND r.dataset = ANY($2::text[])
	`
	args := []any{sourceCode, datasets}
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $3::timestamptz - INTERVAL '1 day' AND r.observed_at < $4::timestamptz"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.observed_at DESC LIMIT 1"
	return store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
}

func (store *Store) loadAirQualityEvent(ctx context.Context, query airquality.Query) (*observations.NormalizedEvent, error) {
	eventTypes := []string{"air_quality_status", "air_quality_poor"}
	if query.WindowStart != nil && query.WindowEnd != nil {
		return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'hsy'
			  AND e.event_type = ANY($1::text[])
			  AND e.location_ref = $2
			  AND e.starts_at >= $3
			  AND e.starts_at < $4
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, eventTypes, query.LocationRef, *query.WindowStart, *query.WindowEnd))
	}

	current, err := store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'hsy'
		  AND e.event_type = ANY($1::text[])
		  AND e.location_ref = $2
		  AND e.ends_at >= $3
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventTypes, query.LocationRef, query.Now))
	if err != nil && !IsNotFound(err) {
		return nil, err
	}
	if current != nil {
		return current, nil
	}
	return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'hsy'
		  AND e.event_type = ANY($1::text[])
		  AND e.location_ref = $2
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventTypes, query.LocationRef))
}

func (store *Store) loadAirQualityRaw(ctx context.Context, sourceCode string, query airquality.Query) (observations.RawObservation, error) {
	areaRefs := []string{strings.ToLower(strings.TrimSpace(query.LocationRef))}
	if sourceCode == "hsy" && platform.IsCapitalRegionCity(query.LocationRef) && !strings.EqualFold(query.LocationRef, "helsinki") {
		areaRefs = append(areaRefs, "helsinki")
	}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = $1
		  AND r.dataset = 'air_quality_current'
		  AND LOWER(r.area_code) = ANY($2::text[])
	`
	args := []any{sourceCode, areaRefs, strings.ToLower(strings.TrimSpace(query.LocationRef))}
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $4 AND r.observed_at < $5"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY (LOWER(r.area_code) = $3) DESC, r.observed_at DESC LIMIT 1"
	return store.scanRawObservation(store.pool.QueryRow(ctx, statement, args...))
}

func (store *Store) scanRawObservation(row rowScanner) (observations.RawObservation, error) {
	var item observations.RawObservation
	var payload []byte
	if err := row.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
		if IsNotFound(err) {
			return observations.RawObservation{}, nil
		}
		return observations.RawObservation{}, err
	}
	item.Payload = make(map[string]any)
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return observations.RawObservation{}, err
		}
	}
	return item, nil
}

func (store *Store) loadWeatherEvent(ctx context.Context, eventType string, query observations.WeatherQuery) (*observations.NormalizedEvent, error) {
	if query.WindowStart != nil && query.WindowEnd != nil {
		return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
			SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
			       e.starts_at, e.ends_at, e.summary, e.attributes
			FROM normalized_events AS e
			JOIN data_sources AS s ON s.id = e.source_id
			WHERE s.source_code = 'fmi'
			  AND e.event_type = $1
			  AND e.location_ref = $2
			  AND e.starts_at < $3
			  AND e.ends_at >= $4
			ORDER BY e.starts_at DESC
			LIMIT 1
		`, eventType, query.LocationRef, *query.WindowEnd, *query.WindowStart))
	}

	current, err := store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'fmi'
		  AND e.event_type = $1
		  AND e.location_ref = $2
		  AND e.ends_at >= $3
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventType, query.LocationRef, query.Now))
	if err != nil && !IsNotFound(err) {
		return nil, err
	}
	if current != nil {
		return current, nil
	}
	return store.scanWeatherEvent(store.pool.QueryRow(ctx, `
		SELECT e.id, e.event_type, s.source_code, e.severity::text, e.location_ref,
		       e.starts_at, e.ends_at, e.summary, e.attributes
		FROM normalized_events AS e
		JOIN data_sources AS s ON s.id = e.source_id
		WHERE s.source_code = 'fmi'
		  AND e.event_type = $1
		  AND e.location_ref = $2
		ORDER BY e.starts_at DESC
		LIMIT 1
	`, eventType, query.LocationRef))
}

func (store *Store) scanWeatherEvent(row rowScanner) (*observations.NormalizedEvent, error) {
	var event observations.NormalizedEvent
	var attributes []byte
	err := row.Scan(
		&event.ID,
		&event.EventType,
		&event.SourceCode,
		&event.Severity,
		&event.LocationRef,
		&event.StartsAt,
		&event.EndsAt,
		&event.Summary,
		&attributes,
	)
	if err != nil {
		if IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	event.Attributes = make(map[string]any)
	if len(attributes) > 0 {
		if err := json.Unmarshal(attributes, &event.Attributes); err != nil {
			return nil, err
		}
	}
	return &event, nil
}

func (store *Store) loadLatestWeatherRaw(ctx context.Context, query observations.WeatherQuery) (map[string]observations.RawObservation, error) {
	datasets := []string{
		"weather_forecast_raw",
		"weather_observations_raw",
		"weather_warnings_cap",
		"weather_radar_capabilities",
	}
	args := []any{datasets, []string{query.LocationRef, "finland"}}
	statement := `
		SELECT r.dataset, r.area_code, r.observed_at, r.payload
		FROM raw_observations AS r
		JOIN data_sources AS s ON s.id = r.source_id
		WHERE s.source_code = 'fmi'
		  AND r.dataset = ANY($1::text[])
		  AND r.area_code = ANY($2::text[])
	`
	if query.WindowStart != nil && query.WindowEnd != nil {
		statement += " AND r.observed_at >= $3 AND r.observed_at < $4"
		args = append(args, *query.WindowStart, *query.WindowEnd)
	}
	statement += " ORDER BY r.dataset ASC, r.observed_at DESC"
	rows, err := store.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	latest := make(map[string]observations.RawObservation)
	for rows.Next() {
		var item observations.RawObservation
		var payload []byte
		if err := rows.Scan(&item.Dataset, &item.AreaCode, &item.ObservedAt, &payload); err != nil {
			return nil, err
		}
		if _, exists := latest[item.Dataset]; exists {
			continue
		}
		item.Payload = make(map[string]any)
		if len(payload) > 0 {
			if err := json.Unmarshal(payload, &item.Payload); err != nil {
				return nil, err
			}
		}
		latest[item.Dataset] = item
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return latest, nil
}

func formatTime(value time.Time) string {
	return value.Format(time.RFC3339Nano)
}

func publicCollectionError(errorMessage sql.NullString) *string {
	if !errorMessage.Valid || strings.TrimSpace(errorMessage.String) == "" {
		return nil
	}
	redacted := "The latest collection attempt failed; provider details are not exposed."
	return &redacted
}

func (store *Store) DispatchPendingNotifications(ctx context.Context, now time.Time, sender dispatch.Sender) (DispatchResult, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT r.id, r.user_id, r.recommendation_type::text, r.priority,
		       r.advice_title, r.advice_body, r.advice_title_zh, r.advice_body_zh,
		       r.rationale, r.valid_from, r.valid_to, u.timezone, u.locale,
		       COALESCE(p.cares_weather, TRUE), COALESCE(p.cares_air_quality, TRUE),
		       COALESCE(p.cares_commute, TRUE), COALESCE(p.cares_energy, FALSE),
		       COALESCE(p.quiet_hours_start, ''), COALESCE(p.quiet_hours_end, ''),
		       COALESCE(p.max_notifications_per_day, 6)
		FROM recommendations AS r
		JOIN users AS u ON u.id = r.user_id
		LEFT JOIN user_preferences AS p ON p.user_id = u.id
		WHERE r.status = 'PENDING'
		ORDER BY r.priority DESC, r.valid_from ASC
	`)
	if err != nil {
		return DispatchResult{}, err
	}
	defer rows.Close()
	result := DispatchResult{}
	for rows.Next() {
		var id, userID, recommendationType, title, body, timezone, locale string
		var titleZH, bodyZH, quietStart, quietEnd sql.NullString
		var priority, maxPerDay int
		var rationaleBytes []byte
		var validFrom, validTo time.Time
		var caresWeather, caresAir, caresCommute, caresEnergy bool
		if err := rows.Scan(&id, &userID, &recommendationType, &priority, &title, &body, &titleZH, &bodyZH, &rationaleBytes, &validFrom, &validTo, &timezone, &locale, &caresWeather, &caresAir, &caresCommute, &caresEnergy, &quietStart, &quietEnd, &maxPerDay); err != nil {
			return result, err
		}
		result.Scanned++
		if validFrom.After(now.UTC()) {
			continue
		}
		if validTo.Before(now.UTC()) {
			if _, err := store.pool.Exec(ctx, `UPDATE recommendations SET status = 'EXPIRED'::recommendation_status WHERE id = $1`, id); err != nil {
				return result, err
			}
			result.Expired++
			continue
		}
		enabled := map[string]bool{"WEATHER": caresWeather, "AIR": caresAir, "COMMUTE": caresCommute, "ENERGY": caresEnergy, "SUMMARY": true}[recommendationType]
		if !enabled {
			if _, err := store.pool.Exec(ctx, `UPDATE recommendations SET status = 'SKIPPED'::recommendation_status WHERE id = $1`, id); err != nil {
				return result, err
			}
			result.SkippedDisabled++
			continue
		}
		var channelID, chatID string
		err := store.pool.QueryRow(ctx, `
			SELECT id, external_id FROM notification_channels
			WHERE user_id = $1 AND channel_type = 'TELEGRAM'::channel_type
			  AND is_active = TRUE AND is_verified = TRUE AND external_id IS NOT NULL
			LIMIT 1
		`, userID).Scan(&channelID, &chatID)
		if err == pgx.ErrNoRows {
			result.SkippedMissingChannel++
			continue
		}
		if err != nil {
			return result, err
		}
		var existingStatus string
		err = store.pool.QueryRow(ctx, `SELECT delivery_status::text FROM notifications WHERE recommendation_id = $1 AND channel_id = $2`, id, channelID).Scan(&existingStatus)
		if err == nil {
			if existingStatus == "QUEUED" || existingStatus == "SENT" || existingStatus == "CLICKED" || existingStatus == "MUTED" {
				result.SkippedDuplicate++
				continue
			}
		} else if err != pgx.ErrNoRows {
			return result, err
		}
		if inQuietHours(now.UTC(), quietStart.String, quietEnd.String, timezone) && priority < 90 {
			result.SkippedQuietHours++
			continue
		}
		sentCount, err := store.dailySentCount(ctx, userID, now.UTC(), timezone)
		if err != nil {
			return result, err
		}
		if sentCount >= maxPerDay && priority < 90 {
			result.SkippedDailyCap++
			continue
		}
		var rationale map[string]any
		if len(rationaleBytes) > 0 {
			if err := json.Unmarshal(rationaleBytes, &rationale); err != nil {
				return result, err
			}
		}
		if ruleCode, ok := rationale["rule_code"].(string); ok {
			cooldown := 0
			if value, ok := rationale["cooldown_minutes"].(float64); ok {
				cooldown = int(value)
			}
			if cooldown > 0 {
				var exists bool
				contextJSON := fmt.Sprintf(`{"rule_code":%q}`, ruleCode)
				if err := store.pool.QueryRow(ctx, `
					SELECT EXISTS (
						SELECT 1 FROM rule_hits h
						JOIN notifications n ON n.recommendation_id = h.recommendation_id
						WHERE h.user_id = $1
						  AND n.delivery_status IN ('SENT'::delivery_status, 'CLICKED'::delivery_status)
						  AND n.sent_at >= $2 AND h.hit_context @> $3::jsonb
					)
				`, userID, now.UTC().Add(-time.Duration(cooldown)*time.Minute), contextJSON).Scan(&exists); err != nil {
					return result, err
				}
				if exists {
					result.SkippedCooldown++
					continue
				}
			}
		}
		messageTitle, messageBody := title, body
		if strings.HasPrefix(strings.ToLower(locale), "zh") && titleZH.Valid && bodyZH.Valid {
			messageTitle, messageBody = titleZH.String, bodyZH.String
		}
		message := dispatch.FormatRecommendation(messageTitle, messageBody, &validTo)
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO notifications (id, user_id, recommendation_id, channel_id, delivery_status, message_text)
			VALUES ($1, $2, $3, $4, 'QUEUED'::delivery_status, $5)
			ON CONFLICT (recommendation_id, channel_id) DO UPDATE SET
				delivery_status = 'QUEUED'::delivery_status, message_text = EXCLUDED.message_text, error_message = NULL
		`, randomID(), userID, id, channelID, message); err != nil {
			return result, err
		}
		if err := sender.SendMessage(ctx, chatID, message); err != nil {
			if _, updateErr := store.pool.Exec(ctx, `UPDATE notifications SET delivery_status = 'FAILED'::delivery_status, error_message = $1 WHERE recommendation_id = $2 AND channel_id = $3`, err.Error(), id, channelID); updateErr != nil {
				return result, updateErr
			}
			result.Failed++
			continue
		}
		if _, err := store.pool.Exec(ctx, `UPDATE notifications SET delivery_status = 'SENT'::delivery_status, sent_at = $1, error_message = NULL WHERE recommendation_id = $2 AND channel_id = $3`, now.UTC(), id, channelID); err != nil {
			return result, err
		}
		if _, err := store.pool.Exec(ctx, `UPDATE recommendations SET status = 'SENT'::recommendation_status WHERE id = $1`, id); err != nil {
			return result, err
		}
		result.Sent++
	}
	return result, rows.Err()
}

func (store *Store) dailySentCount(ctx context.Context, userID string, now time.Time, timezone string) (int, error) {
	location, err := time.LoadLocation(timezone)
	if err != nil {
		location = time.UTC
	}
	local := now.In(location)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location).UTC()
	end := start.Add(24 * time.Hour)
	var count int
	err = store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND delivery_status IN ('SENT'::delivery_status, 'CLICKED'::delivery_status) AND sent_at >= $2 AND sent_at < $3`, userID, start, end).Scan(&count)
	return count, err
}

func inQuietHours(now time.Time, start, end, timezone string) bool {
	if start == "" || end == "" {
		return false
	}
	parse := func(value string) (int, bool) {
		parts := strings.Split(value, ":")
		if len(parts) != 2 {
			return 0, false
		}
		hour, hourErr := strconv.Atoi(parts[0])
		minute, minuteErr := strconv.Atoi(parts[1])
		if hourErr != nil || minuteErr != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
			return 0, false
		}
		return hour*60 + minute, true
	}
	startMinutes, startOK := parse(start)
	endMinutes, endOK := parse(end)
	if !startOK || !endOK {
		return false
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		location = time.UTC
	}
	local := now.In(location)
	current := local.Hour()*60 + local.Minute()
	if startMinutes <= endMinutes {
		return current >= startMinutes && current < endMinutes
	}
	return current >= startMinutes || current < endMinutes
}

func (store *Store) DispatchPublicBroadcasts(ctx context.Context, now time.Time, sender dispatch.Sender) (PublicDispatchResult, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT p.id, p.scenario_key::text, p.title, p.body, p.area_scope::text, p.valid_to,
		       c.id, c.external_id
		FROM public_recommendations AS p
		JOIN scenario_subscriptions AS ss ON ss.scenario_key::text = p.scenario_key::text
		JOIN notification_channels AS c ON c.id = ss.channel_id
		WHERE p.is_active = TRUE AND p.recommendation_kind = 'BROADCAST'::public_recommendation_kind
		  AND p.valid_from <= $1 AND p.valid_to >= $1
		  AND c.channel_type = 'TELEGRAM'::channel_type AND c.is_active = TRUE
		  AND c.is_verified = TRUE AND c.external_id IS NOT NULL
		ORDER BY p.priority DESC, p.valid_from ASC
	`, now.UTC())
	if err != nil {
		return PublicDispatchResult{}, err
	}
	defer rows.Close()
	result := PublicDispatchResult{}
	for rows.Next() {
		var recommendationID, scenario, title, body, area, channelID, chatID string
		var validTo time.Time
		if err := rows.Scan(&recommendationID, &scenario, &title, &body, &area, &validTo, &channelID, &chatID); err != nil {
			return result, err
		}
		result.Scanned++
		var existingStatus string
		err := store.pool.QueryRow(ctx, `SELECT delivery_status::text FROM public_deliveries WHERE public_recommendation_id = $1 AND channel_id = $2`, recommendationID, channelID).Scan(&existingStatus)
		if err == nil && (existingStatus == "QUEUED" || existingStatus == "SENT" || existingStatus == "CLICKED" || existingStatus == "MUTED") {
			result.SkippedDuplicate++
			continue
		}
		if err != nil && err != pgx.ErrNoRows {
			return result, err
		}
		message := dispatch.FormatPublicBroadcast(scenario, title, body, area, &validTo)
		if _, err := store.pool.Exec(ctx, `
			INSERT INTO public_deliveries (id, public_recommendation_id, channel_id, delivery_status, message_text)
			VALUES ($1, $2, $3, 'QUEUED'::public_delivery_status, $4)
			ON CONFLICT (public_recommendation_id, channel_id) DO UPDATE SET delivery_status = 'QUEUED'::public_delivery_status, message_text = EXCLUDED.message_text, error_message = NULL
		`, randomID(), recommendationID, channelID, message); err != nil {
			return result, err
		}
		if err := sender.SendMessage(ctx, chatID, message); err != nil {
			if _, updateErr := store.pool.Exec(ctx, `UPDATE public_deliveries SET delivery_status = 'FAILED'::public_delivery_status, error_message = $1 WHERE public_recommendation_id = $2 AND channel_id = $3`, err.Error(), recommendationID, channelID); updateErr != nil {
				return result, updateErr
			}
			result.Failed++
			continue
		}
		if _, err := store.pool.Exec(ctx, `UPDATE public_deliveries SET delivery_status = 'SENT'::public_delivery_status, sent_at = $1, error_message = NULL WHERE public_recommendation_id = $2 AND channel_id = $3`, now.UTC(), recommendationID, channelID); err != nil {
			return result, err
		}
		result.Sent++
	}
	return result, rows.Err()
}
