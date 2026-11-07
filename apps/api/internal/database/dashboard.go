package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
)

type TodayReader interface {
	LoadToday(context.Context, string, time.Time) (map[string]any, error)
}

type PublicDashboardReader interface {
	LoadPublicDashboard(context.Context, *time.Time, time.Time) (map[string]any, error)
}

type PersonalDashboardReader interface {
	LoadPersonalDashboard(context.Context, string, time.Time) (map[string]any, error)
}

func (store *Store) LoadToday(ctx context.Context, userID string, now time.Time) (map[string]any, error) {
	var timezone, city string
	err := store.pool.QueryRow(ctx, `
		SELECT u.timezone, COALESCE(l.city, '')
		FROM users AS u
		LEFT JOIN LATERAL (
			SELECT city FROM user_locations
			WHERE user_id = u.id AND is_default = TRUE
			ORDER BY created_at DESC LIMIT 1
		) AS l ON TRUE
		WHERE u.id = $1 AND u.status = 'ACTIVE'
	`, userID).Scan(&timezone, &city)
	if err != nil {
		return nil, err
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		location = time.UTC
	}
	localDate := now.UTC().In(location).Format("2006-01-02")

	type cardRow struct {
		typeName, title, titleZH, body, bodyZH, severity string
		priority                                         int
		validTo                                          time.Time
	}
	recommendationRows, err := store.pool.Query(ctx, `
		SELECT r.recommendation_type::text, r.advice_title, COALESCE(r.advice_title_zh, ''),
		       r.advice_body, COALESCE(r.advice_body_zh, ''), r.priority, r.valid_to
		FROM recommendations AS r
		WHERE r.user_id = $1
		  AND r.status IN ('PENDING'::recommendation_status, 'SENT'::recommendation_status)
		  AND r.valid_from <= $2 AND r.valid_to >= $2
		ORDER BY r.priority DESC, r.valid_from ASC LIMIT 5
	`, userID, now.UTC())
	if err != nil {
		return nil, err
	}
	cards := []map[string]any{}
	for recommendationRows.Next() {
		var item cardRow
		if err := recommendationRows.Scan(&item.typeName, &item.title, &item.titleZH, &item.body, &item.bodyZH, &item.priority, &item.validTo); err != nil {
			recommendationRows.Close()
			return nil, err
		}
		card := map[string]any{
			"type": strings.ToLower(item.typeName), "title": item.title, "title_zh": nullableText(item.titleZH),
			"summary": item.body, "summary_zh": nullableText(item.bodyZH),
			"severity": prioritySeverity(item.priority), "valid_to": item.validTo.UTC().Format(time.RFC3339Nano),
		}
		cards = append(cards, card)
	}
	if err := recommendationRows.Err(); err != nil {
		recommendationRows.Close()
		return nil, err
	}
	recommendationRows.Close()

	notificationRows, err := store.pool.Query(ctx, `
		SELECT id, delivery_status::text, message_text, sent_at
		FROM notifications WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 5
	`, userID)
	if err != nil {
		return nil, err
	}
	notifications := []map[string]any{}
	for notificationRows.Next() {
		var id, status, message string
		var sentAt sql.NullTime
		if err := notificationRows.Scan(&id, &status, &message, &sentAt); err != nil {
			notificationRows.Close()
			return nil, err
		}
		item := map[string]any{"id": id, "status": status, "message": message, "sent_at": nil}
		if sentAt.Valid {
			item["sent_at"] = sentAt.Time.UTC().Format(time.RFC3339Nano)
		}
		notifications = append(notifications, item)
	}
	if err := notificationRows.Err(); err != nil {
		notificationRows.Close()
		return nil, err
	}
	notificationRows.Close()

	if len(cards) == 0 {
		var snapshot []byte
		err := store.pool.QueryRow(ctx, `
			SELECT summary FROM daily_snapshots
			WHERE user_id = $1 AND snapshot_date = $2::date
		`, userID, localDate).Scan(&snapshot)
		if err == nil {
			var summary map[string]any
			if json.Unmarshal(snapshot, &summary) == nil {
				summary["notifications"] = notifications
				return summary, nil
			}
		} else if err != nil && err != pgx.ErrNoRows {
			return nil, err
		}
	}
	return map[string]any{"date": localDate, "location": nullableText(city), "cards": cards, "notifications": notifications}, nil
}

func nullableText(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func prioritySeverity(priority int) string {
	switch {
	case priority >= 90:
		return "high"
	case priority >= 60:
		return "medium"
	case priority >= 30:
		return "low"
	default:
		return "info"
	}
}

// LoadPublicDashboard serves the stored regional snapshot for the requested day
// when one exists, and otherwise composes the payload from live rows.
//
// A live read only ever accepts today's snapshot. Falling back to yesterday's
// would present time-bound regional advice as current, which is how a reader
// ends up acting on an expired recommendation.
func (store *Store) LoadPublicDashboard(ctx context.Context, targetDate *time.Time, now time.Time) (map[string]any, error) {
	snapshotDay := now.UTC().Format("2006-01-02")
	if targetDate != nil {
		snapshotDay = targetDate.UTC().Format("2006-01-02")
	}
	if snapshot, ok, err := store.loadRegionalSnapshot(ctx, snapshotDay); err != nil {
		return nil, err
	} else if ok {
		snapshot["snapshot_date"] = snapshotDay
		snapshot["snapshot_available"] = true
		return snapshot, nil
	}
	return store.buildPublicDashboard(ctx, targetDate, now)
}

// loadRegionalSnapshot returns the stored payload for one day, if it exists.
func (store *Store) loadRegionalSnapshot(ctx context.Context, day string) (map[string]any, bool, error) {
	var summaryBytes []byte
	err := store.pool.QueryRow(ctx, `
		SELECT summary
		FROM regional_snapshots
		WHERE area_scope = 'HELSINKI_UUSIMAA'::snapshot_area_scope AND snapshot_date = $1::date
	`, day).Scan(&summaryBytes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	var summary map[string]any
	if err := json.Unmarshal(summaryBytes, &summary); err != nil {
		return nil, false, nil
	}
	return summary, true, nil
}

// RefreshRegionalSnapshot stores today's public dashboard payload so historical
// reads of /api/public/dashboard have something to serve.
func (store *Store) RefreshRegionalSnapshot(ctx context.Context, now time.Time) error {
	payload, err := store.buildPublicDashboard(ctx, nil, now)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode regional snapshot: %w", err)
	}
	_, err = store.pool.Exec(ctx, `
		INSERT INTO regional_snapshots (id, area_scope, snapshot_date, summary, generated_at)
		VALUES ($1, 'HELSINKI_UUSIMAA'::snapshot_area_scope, $2::date, $3, $4)
		ON CONFLICT (area_scope, snapshot_date)
		DO UPDATE SET summary = EXCLUDED.summary, generated_at = EXCLUDED.generated_at
	`, randomID(), now.UTC().Format("2006-01-02"), encoded, now.UTC())
	if err != nil {
		return fmt.Errorf("upsert regional snapshot: %w", err)
	}
	return nil
}

func (store *Store) buildPublicDashboard(ctx context.Context, targetDate *time.Time, now time.Time) (map[string]any, error) {
	start, end := now.UTC(), now.UTC()
	if targetDate != nil {
		start = targetDate.UTC()
		end = start.Add(24 * time.Hour)
	}
	rows, err := store.pool.Query(ctx, `
		SELECT id, scenario_key::text, recommendation_kind::text, area_scope::text,
		       severity::text, freshness_state::text, priority, title, body, evidence,
		       valid_from, valid_to
		FROM public_recommendations
		WHERE is_active = TRUE AND valid_to >= $1 AND valid_from < $2
		ORDER BY priority DESC, valid_from ASC
	`, start, end)
	if err != nil {
		return nil, err
	}
	type action struct {
		id, scenario, kind, areaScope, severity, freshness, title, body string
		priority                                                        int
		evidence                                                        []string
		validFrom, validTo                                              time.Time
	}
	actions := []action{}
	for rows.Next() {
		var item action
		var evidenceBytes []byte
		if err := rows.Scan(&item.id, &item.scenario, &item.kind, &item.areaScope, &item.severity, &item.freshness, &item.priority, &item.title, &item.body, &evidenceBytes, &item.validFrom, &item.validTo); err != nil {
			rows.Close()
			return nil, err
		}
		if len(evidenceBytes) > 0 {
			_ = json.Unmarshal(evidenceBytes, &item.evidence)
		}
		actions = append(actions, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	checkedAt := now.UTC().Format(time.RFC3339Nano)
	toRead := func(item action) map[string]any {
		return map[string]any{
			"id": item.id, "scenario_key": strings.ToLower(item.scenario), "title": item.title, "body": item.body,
			"severity": strings.ToLower(item.severity), "area_scope": strings.ToLower(item.areaScope),
			"freshness_state": strings.ToLower(item.freshness), "valid_from": item.validFrom.UTC().Format(time.RFC3339Nano),
			"valid_to": item.validTo.UTC().Format(time.RFC3339Nano), "evidence": item.evidence,
		}
	}
	placeholder := func(key, title string) map[string]any {
		return map[string]any{"id": "placeholder-" + key, "scenario_key": key, "title": "No active " + strings.ToLower(title) + " recommendation", "body": "Data will appear here after the public rule engine emits the first regional recommendation.", "severity": "info", "area_scope": "helsinki_uusimaa", "freshness_state": "degraded", "valid_from": checkedAt, "valid_to": checkedAt, "evidence": []string{"No active regional recommendation yet."}}
	}
	scenarioMeta := []struct{ key, title, description string }{
		{"commute", "Commute", "Alerts for transit and road disruption windows."},
		{"outdoor", "Outdoor", "Weather windows that may change outdoor plans."},
		{"home_air", "Home air", "Ventilation timing based on air-quality signals."},
		{"energy", "Energy", "Lower-value windows for flexible electricity use."},
	}
	top := []map[string]any{}
	used := map[string]bool{}
	for _, item := range actions {
		if strings.ToLower(item.kind) != "top_action" || used[strings.ToLower(item.scenario)] {
			continue
		}
		top = append(top, toRead(item))
		used[strings.ToLower(item.scenario)] = true
		if len(top) == 3 {
			break
		}
	}
	if len(top) < 3 {
		for _, item := range actions {
			if strings.ToLower(item.kind) != "top_action" {
				continue
			}
			duplicate := false
			for _, existing := range top {
				if existing["id"] == item.id {
					duplicate = true
					break
				}
			}
			if duplicate {
				continue
			}
			top = append(top, toRead(item))
			if len(top) == 3 {
				break
			}
		}
	}
	byScenario := map[string]map[string]any{}
	broadcasts := []map[string]any{}
	for _, item := range actions {
		scenario := strings.ToLower(item.scenario)
		switch strings.ToLower(item.kind) {
		case "scenario_card":
			if _, exists := byScenario[scenario]; !exists {
				byScenario[scenario] = toRead(item)
			}
		case "broadcast":
			broadcasts = append(broadcasts, toRead(item))
		}
	}
	sections := []map[string]any{}
	timeline := []map[string]any{}
	for _, meta := range scenarioMeta {
		recommendation, ok := byScenario[meta.key]
		if !ok {
			recommendation = placeholder(meta.key, meta.title)
		}
		sections = append(sections, map[string]any{"key": meta.key, "title": meta.title, "description": meta.description, "status_label": recommendation["title"], "area_scope": recommendation["area_scope"], "freshness_state": recommendation["freshness_state"], "valid_from": recommendation["valid_from"], "valid_to": recommendation["valid_to"], "evidence": recommendation["evidence"], "source_codes": publicScenarioSources(meta.key), "recommendation": recommendation})
		timeline = append(timeline, map[string]any{"scenario_key": meta.key, "label": recommendation["title"], "severity": recommendation["severity"], "starts_at": recommendation["valid_from"], "ends_at": recommendation["valid_to"]})
	}
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i]["starts_at"].(string) < timeline[j]["starts_at"].(string) })
	sources, err := store.publicDashboardSources(ctx, now)
	if err != nil {
		return nil, err
	}
	snapshotAvailable := targetDate == nil || len(actions) > 0
	snapshotDate := any(nil)
	if targetDate != nil {
		snapshotDate = targetDate.UTC().Format("2006-01-02")
	}
	return map[string]any{"checked_at": checkedAt, "snapshot_date": snapshotDate, "snapshot_available": snapshotAvailable, "app_name": "ArkiWatch", "timezone": "Europe/Helsinki", "coverage_area": "Helsinki/Uusimaa", "top_actions": top, "scenario_channels": publicScenarioChannels(), "scenario_sections": sections, "timeline": timeline, "broadcasts": broadcasts[:minInt(len(broadcasts), 6)], "sources": sources}, nil
}

func publicScenarioSources(key string) []string {
	switch key {
	case "commute":
		return []string{"digitransit", "digitraffic"}
	case "outdoor":
		return []string{"fmi"}
	case "home_air":
		return []string{"hsy"}
	case "energy":
		return []string{"porssisahko", "fingrid"}
	default:
		return []string{}
	}
}

func publicScenarioChannels() []map[string]any {
	return []map[string]any{{"scenario_key": "commute", "title": "Commute", "description": "Alerts for transit and road disruption windows."}, {"scenario_key": "outdoor", "title": "Outdoor", "description": "Weather windows that may change outdoor plans."}, {"scenario_key": "home_air", "title": "Home air", "description": "Ventilation timing based on air-quality signals."}, {"scenario_key": "energy", "title": "Energy", "description": "Lower-value windows for flexible electricity use."}}
}

func (store *Store) publicDashboardSources(ctx context.Context, now time.Time) ([]map[string]any, error) {
	items, err := store.ListSourceStatus(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		operational := sources.DeriveOperationalStatus(item, now)
		read := map[string]any{"id": item.ID, "source_code": item.SourceCode, "source_name": item.SourceName, "auth_type": item.AuthType, "poll_interval_seconds": item.PollIntervalSeconds, "operational_status": operational, "stage": "connected", "categories": []string{}, "datasets": []string{}, "key_data_items": []string{}, "data_structures": []any{}, "normalized_event_structures": []any{}, "license_label": nil, "documentation_url": nil, "last_run_status": nil, "last_run_started_at": nil, "last_run_finished_at": nil, "records_ingested": nil, "error_message": nil}
		if item.LastRun != nil {
			read["last_run_status"] = item.LastRun.Status
			read["last_run_started_at"] = item.LastRun.StartedAt
			read["last_run_finished_at"] = item.LastRun.FinishedAt
			read["records_ingested"] = item.LastRun.RecordsIngested
			read["error_message"] = item.LastRun.ErrorMessage
		}
		result = append(result, read)
	}
	return result, nil
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func (store *Store) LoadPersonalDashboard(ctx context.Context, userID string, now time.Time) (map[string]any, error) {
	var email, name, locale, timezone, defaultCity sql.NullString
	err := store.pool.QueryRow(ctx, `
		SELECT u.email, u.name, u.locale, u.timezone,
		       (SELECT city FROM user_locations WHERE user_id = u.id AND is_default = TRUE ORDER BY created_at DESC LIMIT 1)
		FROM users AS u WHERE u.id = $1 AND u.status = 'ACTIVE'
	`, userID).Scan(&email, &name, &locale, &timezone, &defaultCity)
	if err != nil {
		return nil, err
	}
	today, err := store.LoadToday(ctx, userID, now)
	if err != nil {
		return nil, err
	}
	recommendations, err := store.ListRecommendations(ctx, userID, 6)
	if err != nil {
		return nil, err
	}
	recommendationReads := make([]map[string]any, 0, len(recommendations))
	for _, item := range recommendations {
		recommendationReads = append(recommendationReads, item.API())
	}
	notifications, err := store.ListNotifications(ctx, userID, 6)
	if err != nil {
		return nil, err
	}
	notificationReads := make([]profileNotificationJSON, 0, len(notifications))
	for _, item := range notifications {
		notificationReads = append(notificationReads, profileNotificationJSON{Notification: item})
	}
	sources, err := store.publicDashboardSources(ctx, now)
	if err != nil {
		return nil, err
	}
	defaultLocationComplete := defaultCity.Valid && strings.TrimSpace(defaultCity.String) != ""
	var preferenceCount, commuteCount, channelCount int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_preferences WHERE user_id = $1`, userID).Scan(&preferenceCount); err != nil {
		return nil, err
	}
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_commute_profiles WHERE user_id = $1 AND is_active = TRUE`, userID).Scan(&commuteCount); err != nil {
		return nil, err
	}
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*) FROM notification_channels WHERE user_id = $1 AND channel_type = 'TELEGRAM'::channel_type`, userID).Scan(&channelCount); err != nil {
		return nil, err
	}
	steps := []map[string]any{
		{"key": "user", "title": "Create user context", "status": "complete", "detail": "The authenticated user context is available."},
		{"key": "location", "title": "Set default location", "status": boolStatus(defaultLocationComplete, "complete", "action_required"), "detail": locationStepDetail(defaultLocationComplete, defaultCity.String)},
		{"key": "preferences", "title": "Define preferences", "status": boolStatus(preferenceCount > 0, "complete", "action_required"), "detail": "Save user preferences to control recommendation tracks."},
		{"key": "commute", "title": "Add commute profile", "status": boolStatus(commuteCount > 0, "complete", "action_required"), "detail": "Save an active commute profile to unlock route-aware guidance."},
		{"key": "telegram", "title": "Connect Telegram", "status": boolStatus(channelCount > 0, "in_progress", "action_required"), "detail": "Attach a Telegram channel to activate push delivery."},
	}
	completeSteps := 1
	if defaultLocationComplete {
		completeSteps++
	}
	if preferenceCount > 0 {
		completeSteps++
	}
	if commuteCount > 0 {
		completeSteps++
	}
	if channelCount > 0 {
		completeSteps++
	}
	scenarioSections := dashboardScenarios(recommendationReads, today, sources, defaultLocationComplete)
	currentUser := map[string]any{"id": userID, "email": nullableSQLText(email), "name": nullableSQLText(name), "locale": locale.String, "timezone": timezone.String, "default_location": nullableSQLText(defaultCity)}
	healthStatus := "ok"
	for _, item := range sources {
		if value, ok := item["operational_status"].(string); ok && (value == "failing" || value == "stale") {
			healthStatus = "degraded"
			break
		}
	}
	return map[string]any{"checked_at": now.UTC().Format(time.RFC3339Nano), "app_name": "ArkiWatch", "timezone": timezone.String, "health_status": healthStatus, "database": "up", "selection_mode": "explicit", "selection_error": nil, "current_user": currentUser, "onboarding_completion_percent": completeSteps * 20, "workflow_steps": steps, "scenario_sections": scenarioSections, "today": today, "recommendations": recommendationReads, "notifications": notificationReads, "sources": sources}, nil
}

type profileNotificationJSON struct {
	profile.Notification
}

func (item profileNotificationJSON) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{"id": item.ID, "recommendation_id": item.RecommendationID, "delivery_status": item.DeliveryStatus, "message_text": item.MessageText, "sent_at": item.SentAt, "error_message": item.ErrorMessage, "created_at": item.CreatedAt, "event": item.Event})
}

func boolStatus(condition bool, yes, no string) string {
	if condition {
		return yes
	}
	return no
}

func locationStepDetail(complete bool, city string) string {
	if complete {
		return "Default location is " + city + "."
	}
	return "Add and mark a default location so Today can resolve place-based signals."
}

func nullableSQLText(value sql.NullString) any {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	return value.String
}

func dashboardScenarios(recommendations []map[string]any, today map[string]any, sources []map[string]any, hasLocation bool) []map[string]any {
	types := map[string]struct {
		title, description string
		sources            []string
	}{
		"weather": {"Weather", "Rain risk, forecast shifts, and outdoor timing.", []string{"fmi"}},
		"air":     {"Air quality", "Outdoor exposure guidance and air-quality risk windows.", []string{"hsy"}},
		"commute": {"Commute", "Transit data, road disruption, route risk, and departure timing.", []string{"digitransit", "digitraffic"}},
		"energy":  {"Energy", "Household spot-price windows and deferrable high-load tasks.", []string{"porssisahko", "fingrid"}},
	}
	byType := map[string][]map[string]any{}
	for _, item := range recommendations {
		if value, ok := item["recommendation_type"].(string); ok {
			key := strings.ToLower(value)
			byType[key] = append(byType[key], item)
		}
	}
	cards := []any{}
	if typed, ok := today["cards"].([]map[string]any); ok {
		for _, card := range typed {
			cards = append(cards, card)
		}
	}
	result := []map[string]any{}
	for key, config := range types {
		status := "unknown"
		for _, source := range sources {
			for _, sourceCode := range config.sources {
				if source["source_code"] == sourceCode {
					if sourceStatus, ok := source["operational_status"].(string); ok && sourceStatus == "healthy" {
						status = "healthy"
					} else if _, ok := source["operational_status"].(string); ok {
						status = "watch"
					}
				}
			}
		}
		readiness := "idle"
		if !hasLocation {
			readiness = "setup_required"
		} else if len(byType[key]) > 0 {
			readiness = "active"
		} else if status == "healthy" {
			readiness = "ready"
		}
		var primaryCard any
		for _, card := range cards {
			if cardMap, ok := card.(map[string]any); ok && strings.ToLower(strings.TrimSpace(toString(cardMap["type"]))) == key {
				primaryCard = cardMap
				break
			}
		}
		result = append(result, map[string]any{"key": key, "title": config.title, "description": config.description, "readiness": readiness, "readiness_detail": config.title + " data is available when its sources are healthy.", "source_status": status, "source_codes": config.sources, "missing_env": []string{}, "supports_recommendations": true, "primary_card": primaryCard, "recommendations": byType[key]})
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i]["key"].(string) < result[j]["key"].(string) })
	return result
}

func toString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}
