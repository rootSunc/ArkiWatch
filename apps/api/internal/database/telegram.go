package database

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type TelegramReply struct {
	ChatID string
	Text   string
}

type TelegramStore interface {
	ProcessTelegramUpdate(context.Context, *int64, string, string, time.Time) (*TelegramReply, error)
}

func (store *Store) ProcessTelegramUpdate(ctx context.Context, updateID *int64, chatID, text string, now time.Time) (*TelegramReply, error) {
	if updateID != nil {
		result, err := store.pool.Exec(ctx, `INSERT INTO telegram_webhook_updates (update_id) VALUES ($1) ON CONFLICT (update_id) DO NOTHING`, *updateID)
		if err != nil {
			return nil, err
		}
		if result.RowsAffected() == 0 {
			return nil, nil
		}
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}
	var channelID string
	err := store.pool.QueryRow(ctx, `
		SELECT id FROM notification_channels
		WHERE channel_type = 'TELEGRAM'::channel_type AND external_id = $1
	`, chatID).Scan(&channelID)
	channelExists := err == nil
	if err != nil && !IsNotFound(err) {
		return nil, err
	}
	if !channelExists && strings.HasPrefix(text, "/start") {
		return &TelegramReply{ChatID: chatID, Text: "ArkiWatch bot is reachable. Register this Telegram chat ID in the app and retry: " + chatID}, nil
	}
	if strings.HasPrefix(text, "/today") {
		dashboard, err := store.LoadPublicDashboard(ctx, nil, now)
		if err != nil {
			return nil, err
		}
		return &TelegramReply{ChatID: chatID, Text: formatTelegramToday(dashboard)}, nil
	}
	for command, scenario := range map[string]string{"/commute": "COMMUTE", "/outdoor": "OUTDOOR", "/air": "HOME_AIR", "/energy": "ENERGY"} {
		if strings.HasPrefix(text, command) {
			var title, body, area string
			var validTo time.Time
			err := store.pool.QueryRow(ctx, `
				SELECT title, body, area_scope::text, valid_to
				FROM public_recommendations
				WHERE scenario_key = $1::scenario_key AND recommendation_kind = 'BROADCAST'::public_recommendation_kind
				  AND is_active = TRUE AND valid_from <= $2 AND valid_to >= $2
				ORDER BY valid_from ASC LIMIT 1
			`, scenario, now.UTC()).Scan(&title, &body, &area, &validTo)
			if IsNotFound(err) {
				return &TelegramReply{ChatID: chatID, Text: "No active " + strings.ToLower(scenario) + " broadcast right now."}, nil
			}
			if err != nil {
				return nil, err
			}
			return &TelegramReply{ChatID: chatID, Text: fmt.Sprintf("ArkiWatch %s\n\n%s\n\n%s\n\nScope: %s\n\nValid until %s", strings.ToLower(scenario), title, body, strings.ToLower(area), validTo.UTC().Format("2006-01-02 15:04 UTC"))}, nil
		}
	}
	if !channelExists {
		return nil, nil
	}
	if strings.HasPrefix(text, "/resume") {
		if _, err := store.pool.Exec(ctx, `UPDATE notification_channels SET is_verified = TRUE, is_active = TRUE, updated_at = now() WHERE id = $1`, channelID); err != nil {
			return nil, err
		}
		return &TelegramReply{ChatID: chatID, Text: "ArkiWatch notifications resumed for this chat."}, nil
	}
	if strings.HasPrefix(text, "/mute") {
		if _, err := store.pool.Exec(ctx, `UPDATE notification_channels SET is_verified = TRUE, is_active = FALSE, updated_at = now() WHERE id = $1`, channelID); err != nil {
			return nil, err
		}
		return &TelegramReply{ChatID: chatID, Text: "ArkiWatch notifications muted for this chat."}, nil
	}
	if _, err := store.pool.Exec(ctx, `UPDATE notification_channels SET is_verified = TRUE, is_active = TRUE, updated_at = now() WHERE id = $1`, channelID); err != nil {
		return nil, err
	}
	return &TelegramReply{ChatID: chatID, Text: "ArkiWatch bot is connected. Commands: /today, /commute, /outdoor, /air, /energy, /mute, /resume"}, nil
}

func formatTelegramToday(dashboard map[string]any) string {
	parts := []string{"ArkiWatch today"}
	if actions, ok := dashboard["top_actions"].([]map[string]any); ok {
		for _, action := range actions {
			parts = append(parts, fmt.Sprintf("%v\n%v", action["title"], action["body"]))
		}
	}
	if len(parts) == 1 {
		parts = append(parts, "No active public recommendations right now.")
	}
	return strings.Join(parts, "\n\n")
}
