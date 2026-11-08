package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/dispatch"
)

type DispatchResult struct {
	Scanned, Sent, Failed, SkippedMissingChannel, SkippedQuietHours, SkippedCooldown,
	SkippedDailyCap, SkippedDisabled, SkippedDuplicate, Expired int
}

type PublicDispatchResult struct{ Scanned, Sent, Failed, SkippedDuplicate int }

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
