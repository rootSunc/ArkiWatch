package observations

import "time"

type NormalizedEvent struct {
	ID          string
	EventType   string
	SourceCode  string
	Severity    string
	LocationRef string
	StartsAt    time.Time
	EndsAt      time.Time
	Title       string
	Summary     string
	Attributes  map[string]any
	CreatedAt   time.Time
}

type RawObservation struct {
	Dataset    string
	AreaCode   string
	ObservedAt time.Time
	Payload    map[string]any
}

type WeatherQuery struct {
	Now         time.Time
	LocationRef string
	WindowStart *time.Time
	WindowEnd   *time.Time
}

type WeatherData struct {
	Outlook *NormalizedEvent
	Rain    *NormalizedEvent
	Raw     map[string]RawObservation
}

type TransitQuery struct {
	Now         time.Time
	LocationRef string
	WindowStart *time.Time
	WindowEnd   *time.Time
	Historical  bool
}

type TransitData struct {
	Raw    RawObservation
	Events []NormalizedEvent
}
