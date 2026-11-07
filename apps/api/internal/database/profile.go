package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
)

var ErrInvalidCommuteLocations = errors.New("origin and destination locations must belong to the same user")

type ProfileStore interface {
	ListLocations(context.Context, string) ([]profile.Location, error)
	CreateLocation(context.Context, string, profile.LocationInput) (profile.Location, error)
	UpdateLocation(context.Context, string, string, profile.LocationInput) (profile.Location, error)
	GetPreferences(context.Context, string) (*profile.Preference, error)
	UpsertPreferences(context.Context, string, profile.PreferenceInput) (profile.Preference, error)
	ListCommuteProfiles(context.Context, string) ([]profile.CommuteProfile, error)
	CreateCommuteProfile(context.Context, string, profile.CommuteProfileInput) (profile.CommuteProfile, error)
	UpdateCommuteProfile(context.Context, string, string, profile.CommuteProfileInput) (profile.CommuteProfile, error)
	ListChannels(context.Context, string) ([]profile.Channel, error)
	UpsertChannel(context.Context, string, profile.ChannelInput) (profile.Channel, error)
	ListSubscriptions(context.Context, string) ([]profile.Subscription, error)
	UpsertSubscription(context.Context, string, string) (profile.Subscription, error)
	ListNotifications(context.Context, string, int) ([]profile.Notification, error)
}

func (store *Store) ListLocations(ctx context.Context, userID string) ([]profile.Location, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT id, user_id, label, country_code, city, district, lat, lon, is_default, created_at
		FROM user_locations WHERE user_id = $1
		ORDER BY is_default DESC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []profile.Location{}
	for rows.Next() {
		item, err := scanLocation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) CreateLocation(ctx context.Context, userID string, input profile.LocationInput) (profile.Location, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return profile.Location{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if input.IsDefault {
		if _, err := tx.Exec(ctx, `UPDATE user_locations SET is_default = FALSE WHERE user_id = $1`, userID); err != nil {
			return profile.Location{}, err
		}
	}
	item, err := scanLocation(tx.QueryRow(ctx, `
		INSERT INTO user_locations
			(id, user_id, label, country_code, city, district, lat, lon, is_default)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, user_id, label, country_code, city, district, lat, lon, is_default, created_at
	`, randomID(), userID, input.Label, strings.ToUpper(input.CountryCode), input.City, input.District, input.Latitude, input.Longitude, input.IsDefault))
	if err != nil {
		return profile.Location{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return profile.Location{}, err
	}
	return item, nil
}

func (store *Store) UpdateLocation(ctx context.Context, userID, locationID string, input profile.LocationInput) (profile.Location, error) {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return profile.Location{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	item, err := scanLocation(tx.QueryRow(ctx, `
		UPDATE user_locations
		SET label = $1, country_code = $2, city = $3, district = $4,
		    lat = $5, lon = $6, is_default = $7
		WHERE id = $8 AND user_id = $9
		RETURNING id, user_id, label, country_code, city, district, lat, lon, is_default, created_at
	`, input.Label, strings.ToUpper(input.CountryCode), input.City, input.District, input.Latitude, input.Longitude, input.IsDefault, locationID, userID))
	if err != nil {
		return profile.Location{}, err
	}
	if input.IsDefault {
		if _, err := tx.Exec(ctx, `UPDATE user_locations SET is_default = FALSE WHERE user_id = $1 AND id <> $2`, userID, locationID); err != nil {
			return profile.Location{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return profile.Location{}, err
	}
	return item, nil
}

func scanLocation(row interface{ Scan(...any) error }) (profile.Location, error) {
	var item profile.Location
	if err := row.Scan(&item.ID, &item.UserID, &item.Label, &item.CountryCode, &item.City, &item.District, &item.Latitude, &item.Longitude, &item.IsDefault, &item.CreatedAt); err != nil {
		return profile.Location{}, err
	}
	return item, nil
}

func (store *Store) GetPreferences(ctx context.Context, userID string) (*profile.Preference, error) {
	item, err := scanPreference(store.pool.QueryRow(ctx, `
		SELECT id, user_id, cares_energy, cares_air_quality, cares_weather, cares_commute,
		       allergy_sensitive, quiet_hours_start, quiet_hours_end, max_notifications_per_day,
		       created_at, updated_at
		FROM user_preferences WHERE user_id = $1
	`, userID))
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (store *Store) UpsertPreferences(ctx context.Context, userID string, input profile.PreferenceInput) (profile.Preference, error) {
	return scanPreference(store.pool.QueryRow(ctx, `
		INSERT INTO user_preferences
			(id, user_id, cares_energy, cares_air_quality, cares_weather, cares_commute,
			 allergy_sensitive, quiet_hours_start, quiet_hours_end, max_notifications_per_day)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (user_id) DO UPDATE SET
			cares_energy = EXCLUDED.cares_energy,
			cares_air_quality = EXCLUDED.cares_air_quality,
			cares_weather = EXCLUDED.cares_weather,
			cares_commute = EXCLUDED.cares_commute,
			allergy_sensitive = EXCLUDED.allergy_sensitive,
			quiet_hours_start = EXCLUDED.quiet_hours_start,
			quiet_hours_end = EXCLUDED.quiet_hours_end,
			max_notifications_per_day = EXCLUDED.max_notifications_per_day,
			updated_at = now()
		RETURNING id, user_id, cares_energy, cares_air_quality, cares_weather, cares_commute,
		          allergy_sensitive, quiet_hours_start, quiet_hours_end, max_notifications_per_day,
		          created_at, updated_at
	`, randomID(), userID, input.CaresEnergy, input.CaresAirQuality, input.CaresWeather, input.CaresCommute, input.AllergySensitive, input.QuietHoursStart, input.QuietHoursEnd, input.MaxNotificationsPerDay))
}

func scanPreference(row interface{ Scan(...any) error }) (profile.Preference, error) {
	var item profile.Preference
	if err := row.Scan(&item.ID, &item.UserID, &item.CaresEnergy, &item.CaresAirQuality, &item.CaresWeather, &item.CaresCommute, &item.AllergySensitive, &item.QuietHoursStart, &item.QuietHoursEnd, &item.MaxNotificationsPerDay, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return profile.Preference{}, err
	}
	return item, nil
}

func (store *Store) ListCommuteProfiles(ctx context.Context, userID string) ([]profile.CommuteProfile, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT id, user_id, name, origin_location_id, destination_location_id,
		       preferred_mode::text, departure_time_local, weekdays, route_names, stop_names, is_active, created_at, updated_at
		FROM user_commute_profiles WHERE user_id = $1
		ORDER BY is_active DESC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []profile.CommuteProfile{}
	for rows.Next() {
		item, err := scanCommute(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) CreateCommuteProfile(ctx context.Context, userID string, input profile.CommuteProfileInput) (profile.CommuteProfile, error) {
	if err := store.assertCommuteLocations(ctx, userID, input); err != nil {
		return profile.CommuteProfile{}, err
	}
	return scanCommute(store.pool.QueryRow(ctx, `
		INSERT INTO user_commute_profiles
			(id, user_id, name, origin_location_id, destination_location_id, preferred_mode,
			 departure_time_local, weekdays, route_names, stop_names, is_active)
		VALUES ($1, $2, $3, $4, $5, $6::commute_mode, $7, $8, $9, $10, $11)
		RETURNING id, user_id, name, origin_location_id, destination_location_id,
		          preferred_mode::text, departure_time_local, weekdays, route_names, stop_names, is_active, created_at, updated_at
	`, randomID(), userID, input.Name, input.OriginLocationID, input.DestinationLocationID, input.PreferredMode, input.DepartureTimeLocal, int32Slice(input.Weekdays), textSlice(input.RouteNames), textSlice(input.StopNames), input.IsActive))
}

func (store *Store) UpdateCommuteProfile(ctx context.Context, userID, profileID string, input profile.CommuteProfileInput) (profile.CommuteProfile, error) {
	if err := store.assertCommuteLocations(ctx, userID, input); err != nil {
		return profile.CommuteProfile{}, err
	}
	return scanCommute(store.pool.QueryRow(ctx, `
		UPDATE user_commute_profiles
		SET name = $1, origin_location_id = $2, destination_location_id = $3,
		    preferred_mode = $4::commute_mode, departure_time_local = $5,
		    weekdays = $6, route_names = $7, stop_names = $8, is_active = $9, updated_at = now()
		WHERE id = $10 AND user_id = $11
		RETURNING id, user_id, name, origin_location_id, destination_location_id,
		          preferred_mode::text, departure_time_local, weekdays, route_names, stop_names, is_active, created_at, updated_at
	`, input.Name, input.OriginLocationID, input.DestinationLocationID, input.PreferredMode, input.DepartureTimeLocal, int32Slice(input.Weekdays), textSlice(input.RouteNames), textSlice(input.StopNames), input.IsActive, profileID, userID))
}

func (store *Store) assertCommuteLocations(ctx context.Context, userID string, input profile.CommuteProfileInput) error {
	var count int
	err := store.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_locations
		WHERE user_id = $1 AND id = ANY($2::text[])
	`, userID, []string{input.OriginLocationID, input.DestinationLocationID}).Scan(&count)
	if err != nil {
		return err
	}
	if count != 2 || input.OriginLocationID == input.DestinationLocationID {
		return ErrInvalidCommuteLocations
	}
	return nil
}

func scanCommute(row interface{ Scan(...any) error }) (profile.CommuteProfile, error) {
	var item profile.CommuteProfile
	var weekdays []int32
	if err := row.Scan(&item.ID, &item.UserID, &item.Name, &item.OriginLocationID, &item.DestinationLocationID, &item.PreferredMode, &item.DepartureTimeLocal, &weekdays, &item.RouteNames, &item.StopNames, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return profile.CommuteProfile{}, err
	}
	item.Weekdays = make([]int, len(weekdays))
	for index, value := range weekdays {
		item.Weekdays[index] = int(value)
	}
	return item, nil
}

func textSlice(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func int32Slice(values []int) []int32 {
	result := make([]int32, len(values))
	for index, value := range values {
		result[index] = int32(value)
	}
	return result
}

func (store *Store) ListChannels(ctx context.Context, userID string) ([]profile.Channel, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT id, user_id, channel_type::text, external_id, is_verified, is_active, created_at, updated_at
		FROM notification_channels WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []profile.Channel{}
	for rows.Next() {
		item, err := scanChannel(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) UpsertChannel(ctx context.Context, userID string, input profile.ChannelInput) (profile.Channel, error) {
	return scanChannel(store.pool.QueryRow(ctx, `
		INSERT INTO notification_channels
			(id, user_id, channel_type, external_id, is_verified, is_active)
		VALUES ($1, $2, $3::channel_type, $4, FALSE, $5)
		ON CONFLICT (user_id, channel_type) DO UPDATE SET
			external_id = EXCLUDED.external_id,
			is_active = EXCLUDED.is_active,
			is_verified = CASE WHEN notification_channels.external_id IS DISTINCT FROM EXCLUDED.external_id THEN FALSE ELSE notification_channels.is_verified END,
			updated_at = now()
		RETURNING id, user_id, channel_type::text, external_id, is_verified, is_active, created_at, updated_at
	`, randomID(), userID, input.ChannelType, input.ExternalID, input.IsActive))
}

func scanChannel(row interface{ Scan(...any) error }) (profile.Channel, error) {
	var item profile.Channel
	if err := row.Scan(&item.ID, &item.UserID, &item.ChannelType, &item.ExternalID, &item.IsVerified, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return profile.Channel{}, err
	}
	return item, nil
}

func (store *Store) ListSubscriptions(ctx context.Context, userID string) ([]profile.Subscription, error) {
	rows, err := store.pool.Query(ctx, `
		SELECT s.id, s.channel_id, s.scenario_key::text, s.created_at
		FROM scenario_subscriptions AS s
		JOIN notification_channels AS c ON c.id = s.channel_id
		WHERE c.user_id = $1 ORDER BY s.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []profile.Subscription{}
	for rows.Next() {
		var item profile.Subscription
		if err := rows.Scan(&item.ID, &item.ChannelID, &item.ScenarioKey, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.ScenarioKey = strings.ToLower(item.ScenarioKey)
		result = append(result, item)
	}
	return result, rows.Err()
}

func (store *Store) UpsertSubscription(ctx context.Context, userID, scenarioKey string) (profile.Subscription, error) {
	scenarioKey = strings.ToUpper(strings.TrimSpace(scenarioKey))
	var channelID string
	if err := store.pool.QueryRow(ctx, `
		SELECT id FROM notification_channels
		WHERE user_id = $1 AND channel_type = 'TELEGRAM'::channel_type
	`, userID).Scan(&channelID); err != nil {
		return profile.Subscription{}, err
	}
	return scanSubscription(store.pool.QueryRow(ctx, `
		INSERT INTO scenario_subscriptions (id, channel_id, scenario_key)
		VALUES ($1, $2, $3::subscription_scenario_key)
		ON CONFLICT (channel_id, scenario_key) DO UPDATE SET channel_id = EXCLUDED.channel_id
		RETURNING id, channel_id, scenario_key::text, created_at
	`, randomID(), channelID, scenarioKey))
}

func scanSubscription(row interface{ Scan(...any) error }) (profile.Subscription, error) {
	var item profile.Subscription
	if err := row.Scan(&item.ID, &item.ChannelID, &item.ScenarioKey, &item.CreatedAt); err != nil {
		return profile.Subscription{}, err
	}
	return item, nil
}

func (store *Store) ListNotifications(ctx context.Context, userID string, limit int) ([]profile.Notification, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := store.pool.Query(ctx, `
		SELECT n.id, n.recommendation_id, n.delivery_status::text, n.message_text,
		       n.sent_at, n.error_message, n.created_at,
		       e.id, e.event_type, e.severity::text, e.location_ref, e.starts_at, e.ends_at,
		       e.title, e.summary, e.attributes, ds.source_code
		FROM notifications AS n
		JOIN recommendations AS r ON r.id = n.recommendation_id
		JOIN normalized_events AS e ON e.id = r.event_id
		JOIN data_sources AS ds ON ds.id = e.source_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []profile.Notification{}
	for rows.Next() {
		var item profile.Notification
		var event profile.EventContent
		var eventAttributes []byte
		var sourceCode string
		var errorMessage sql.NullString
		if err := rows.Scan(&item.ID, &item.RecommendationID, &item.DeliveryStatus, &item.MessageText, &item.SentAt, &errorMessage, &item.CreatedAt, &event.ID, &event.EventType, &event.Severity, &event.CategoryKey, &event.StartsAt, &event.EndsAt, &event.Title, &event.Body, &eventAttributes, &sourceCode); err != nil {
			return nil, err
		}
		if errorMessage.Valid {
			item.ErrorMessage = &errorMessage.String
		}
		event.Attributes = map[string]any{}
		if len(eventAttributes) > 0 {
			if err := json.Unmarshal(eventAttributes, &event.Attributes); err != nil {
				return nil, err
			}
		}
		event.CategoryKey = categoryForEvent(event.EventType)
		event.SourceCodes = []string{sourceCode}
		event.Evidence = []string{event.Body}
		item.Event = &event
		result = append(result, item)
	}
	return result, rows.Err()
}

func categoryForEvent(eventType string) string {
	switch eventType {
	case "weather_outlook", "rain_risk":
		return "weather"
	case "air_quality_status", "air_quality_poor":
		return "air"
	case "transit_delay", "transit_disruption":
		return "transit"
	case "cheap_energy_window":
		return "energy"
	case "road_disruption", "road_weather_risk", "rail_delay", "marine_disruption":
		return "traffic"
	default:
		return ""
	}
}
