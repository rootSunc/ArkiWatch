package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/publicrules"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/recommendations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/rules"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
)

type RulesResult struct {
	Users, Events, Recommendations int
}

type PublicRulesResult struct{ Events, Recommendations, Inserted, Updated, Deactivated int }

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

	commuteRows, err := tx.Query(ctx, `
		SELECT user_id, preferred_mode::text, departure_time_local, weekdays, route_names, stop_names
		FROM user_commute_profiles
		WHERE is_active = TRUE
	`)
	if err != nil {
		return RulesResult{}, err
	}
	commutesByUser := map[string][]rules.Commute{}
	for commuteRows.Next() {
		var userID, mode, departure string
		var weekdays []int32
		var routes, stops []string
		if err := commuteRows.Scan(&userID, &mode, &departure, &weekdays, &routes, &stops); err != nil {
			commuteRows.Close()
			return RulesResult{}, err
		}
		days := make([]int, len(weekdays))
		for index, day := range weekdays {
			days[index] = int(day)
		}
		commutesByUser[userID] = append(commutesByUser[userID], rules.ParseCommute(mode, departure, days).WithTargets(routes, stops))
	}
	if err := commuteRows.Err(); err != nil {
		commuteRows.Close()
		return RulesResult{}, err
	}
	commuteRows.Close()

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
			  AND (
			    (location_type IN ('CITY'::location_type, 'DISTRICT'::location_type) AND LOWER(location_ref) = ANY($3::text[]))
			    OR event_type = ANY($4::text[])
			  )
			ORDER BY starts_at ASC
		`, now.UTC(), horizon, locationRefs, []string{"road_disruption", "road_weather_risk"})
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
			userContext := rules.User{ID: user.id, Timezone: user.timezone, City: user.city, Label: user.label, District: user.district, CaresWeather: user.caresWeather, CaresAir: user.caresAir, CaresCommute: user.caresCommute, CaresEnergy: user.caresEnergy, HasCommuteProfile: user.hasCommute, Commutes: commutesByUser[user.id]}
			ruleCode := map[string]string{"rain_risk": "R1_RAIN_RISK", "weather_outlook": "R2_WEATHER_OUTLOOK", "air_quality_poor": "R10_AIR_QUALITY_POOR", "air_quality_status": "R11_AIR_QUALITY_STATUS", "transit_delay": "R20_COMMUTE_DISRUPTION", "transit_disruption": "R20_COMMUTE_DISRUPTION", "road_disruption": "R21_ROAD_COMMUTE", "road_weather_risk": "R21_ROAD_COMMUTE", "cheap_energy_window": "R30_ENERGY_WINDOW"}[event.EventType]
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
