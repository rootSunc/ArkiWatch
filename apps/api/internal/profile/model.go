package profile

import "time"

type Location struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Label       string    `json:"label"`
	CountryCode string    `json:"country_code"`
	City        string    `json:"city"`
	District    *string   `json:"district"`
	Latitude    float64   `json:"lat"`
	Longitude   float64   `json:"lon"`
	IsDefault   bool      `json:"is_default"`
	CreatedAt   time.Time `json:"created_at"`
}

type LocationInput struct {
	Label       string
	CountryCode string
	City        string
	District    *string
	Latitude    float64
	Longitude   float64
	IsDefault   bool
}

type Preference struct {
	ID                     string    `json:"id"`
	UserID                 string    `json:"user_id"`
	CaresEnergy            bool      `json:"cares_energy"`
	CaresAirQuality        bool      `json:"cares_air_quality"`
	CaresWeather           bool      `json:"cares_weather"`
	CaresCommute           bool      `json:"cares_commute"`
	AllergySensitive       bool      `json:"allergy_sensitive"`
	QuietHoursStart        *string   `json:"quiet_hours_start"`
	QuietHoursEnd          *string   `json:"quiet_hours_end"`
	MaxNotificationsPerDay int       `json:"max_notifications_per_day"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type PreferenceInput struct {
	CaresEnergy            bool
	CaresAirQuality        bool
	CaresWeather           bool
	CaresCommute           bool
	AllergySensitive       bool
	QuietHoursStart        *string
	QuietHoursEnd          *string
	MaxNotificationsPerDay int
}

type CommuteProfile struct {
	ID                    string    `json:"id"`
	UserID                string    `json:"user_id"`
	Name                  string    `json:"name"`
	OriginLocationID      string    `json:"origin_location_id"`
	DestinationLocationID string    `json:"destination_location_id"`
	PreferredMode         string    `json:"preferred_mode"`
	DepartureTimeLocal    string    `json:"departure_time_local"`
	Weekdays              []int     `json:"weekdays"`
	IsActive              bool      `json:"is_active"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type CommuteProfileInput struct {
	Name                  string
	OriginLocationID      string
	DestinationLocationID string
	PreferredMode         string
	DepartureTimeLocal    string
	Weekdays              []int
	IsActive              bool
}

type Channel struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	ChannelType string    `json:"channel_type"`
	ExternalID  *string   `json:"external_id"`
	IsVerified  bool      `json:"is_verified"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ChannelInput struct {
	ChannelType string
	ExternalID  *string
	IsActive    bool
}

type Subscription struct {
	ID          string    `json:"id"`
	ChannelID   string    `json:"channel_id"`
	ScenarioKey string    `json:"scenario_key"`
	CreatedAt   time.Time `json:"created_at"`
}

type Notification struct {
	ID               string        `json:"id"`
	RecommendationID string        `json:"recommendation_id"`
	DeliveryStatus   string        `json:"delivery_status"`
	MessageText      string        `json:"message_text"`
	SentAt           *time.Time    `json:"sent_at"`
	ErrorMessage     *string       `json:"error_message"`
	CreatedAt        time.Time     `json:"created_at"`
	Event            *EventContent `json:"event"`
}

type EventContent struct {
	ID          string         `json:"id"`
	CategoryKey string         `json:"category_key"`
	EventType   string         `json:"event_type"`
	Title       string         `json:"title"`
	Body        string         `json:"body"`
	Severity    string         `json:"severity"`
	StartsAt    time.Time      `json:"starts_at"`
	EndsAt      time.Time      `json:"ends_at"`
	SourceCodes []string       `json:"source_codes"`
	Evidence    []string       `json:"evidence"`
	Attributes  map[string]any `json:"attributes"`
}
