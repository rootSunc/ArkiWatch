package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
)

func (s *Server) locations(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListLocations(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload locationPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateLocationPayload(payload, true) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Location values are invalid."})
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	item, err := s.profiles.CreateLocation(request.Context(), user.ID, payload.input())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

func (s *Server) locationByID(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	locationID := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/user/locations/"), "/")
	if locationID == "" || strings.Contains(locationID, "/") {
		writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Location not found for the authenticated user."})
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer)
		return
	}
	var payload locationPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateLocationPayload(payload, false) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Location values are invalid."})
		return
	}
	item, err := s.profiles.UpdateLocation(request.Context(), user.ID, locationID, payload.input())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Location not found for the authenticated user."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, item)
}

type locationPayload struct {
	UserID      string  `json:"user_id"`
	Label       string  `json:"label"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	District    *string `json:"district"`
	Latitude    float64 `json:"lat"`
	Longitude   float64 `json:"lon"`
	IsDefault   bool    `json:"is_default"`
}

func (payload locationPayload) input() profile.LocationInput {
	return profile.LocationInput{Label: strings.TrimSpace(payload.Label), CountryCode: strings.TrimSpace(payload.CountryCode), City: strings.TrimSpace(payload.City), District: payload.District, Latitude: payload.Latitude, Longitude: payload.Longitude, IsDefault: payload.IsDefault}
}

func validateLocationPayload(payload locationPayload, requireUserID bool) bool {
	if (requireUserID && strings.TrimSpace(payload.UserID) == "") || strings.TrimSpace(payload.Label) == "" || len(strings.TrimSpace(payload.Label)) > 40 || len(strings.TrimSpace(payload.CountryCode)) != 2 || strings.TrimSpace(payload.City) == "" || len(strings.TrimSpace(payload.City)) > 80 || payload.Latitude < -90 || payload.Latitude > 90 || payload.Longitude < -180 || payload.Longitude > 180 {
		return false
	}
	return true
}

func (s *Server) preferences(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		item, err := s.profiles.GetPreferences(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, item)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload preferencePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if payload.MaxNotificationsPerDay == 0 {
		payload.MaxNotificationsPerDay = 6
	}
	if payload.MaxNotificationsPerDay < 1 || payload.MaxNotificationsPerDay > 20 || !validClock(payload.QuietHoursStart) || !validClock(payload.QuietHoursEnd) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Preference values are invalid."})
		return
	}
	item, err := s.profiles.UpsertPreferences(request.Context(), user.ID, profile.PreferenceInput{CaresEnergy: boolOr(payload.CaresEnergy, false), CaresAirQuality: boolOr(payload.CaresAirQuality, true), CaresWeather: boolOr(payload.CaresWeather, true), CaresCommute: boolOr(payload.CaresCommute, true), AllergySensitive: boolOr(payload.AllergySensitive, false), QuietHoursStart: payload.QuietHoursStart, QuietHoursEnd: payload.QuietHoursEnd, MaxNotificationsPerDay: payload.MaxNotificationsPerDay})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type preferencePayload struct {
	UserID                 string  `json:"user_id"`
	CaresEnergy            *bool   `json:"cares_energy"`
	CaresAirQuality        *bool   `json:"cares_air_quality"`
	CaresWeather           *bool   `json:"cares_weather"`
	CaresCommute           *bool   `json:"cares_commute"`
	AllergySensitive       *bool   `json:"allergy_sensitive"`
	QuietHoursStart        *string `json:"quiet_hours_start"`
	QuietHoursEnd          *string `json:"quiet_hours_end"`
	MaxNotificationsPerDay int     `json:"max_notifications_per_day"`
}

func (s *Server) commuteProfiles(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListCommuteProfiles(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload commutePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateCommutePayload(payload, true) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Commute profile values are invalid."})
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	item, err := s.profiles.CreateCommuteProfile(request.Context(), user.ID, payload.input())
	if err != nil {
		if errors.Is(err, database.ErrInvalidCommuteLocations) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

func (s *Server) commuteProfileByID(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	profileID := strings.Trim(strings.TrimPrefix(request.URL.Path, s.cfg.APIPrefix+"/user/commute-profiles/"), "/")
	if profileID == "" || strings.Contains(profileID, "/") || request.Method != http.MethodPut {
		methodNotAllowed(writer)
		return
	}
	var payload commutePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if !validateCommutePayload(payload, false) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Commute profile values are invalid."})
		return
	}
	item, err := s.profiles.UpdateCommuteProfile(request.Context(), user.ID, profileID, payload.input())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Commute profile not found for the authenticated user."})
			return
		}
		if errors.Is(err, database.ErrInvalidCommuteLocations) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, item)
}

type commutePayload struct {
	UserID                string   `json:"user_id"`
	Name                  string   `json:"name"`
	OriginLocationID      string   `json:"origin_location_id"`
	DestinationLocationID string   `json:"destination_location_id"`
	PreferredMode         string   `json:"preferred_mode"`
	DepartureTimeLocal    string   `json:"departure_time_local"`
	Weekdays              []int    `json:"weekdays"`
	RouteNames            []string `json:"route_names"`
	StopNames             []string `json:"stop_names"`
	IsActive              *bool    `json:"is_active"`
}

func (payload commutePayload) input() profile.CommuteProfileInput {
	mode := payload.PreferredMode
	if mode == "" {
		mode = "TRANSIT"
	}
	routes, _ := cleanNameList(payload.RouteNames)
	stops, _ := cleanNameList(payload.StopNames)
	return profile.CommuteProfileInput{Name: strings.TrimSpace(payload.Name), OriginLocationID: payload.OriginLocationID, DestinationLocationID: payload.DestinationLocationID, PreferredMode: mode, DepartureTimeLocal: payload.DepartureTimeLocal, Weekdays: payload.Weekdays, RouteNames: routes, StopNames: stops, IsActive: boolOr(payload.IsActive, true)}
}

func cleanNameList(values []string) ([]string, bool) {
	if len(values) > 12 {
		return nil, false
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" || len(text) > 80 {
			return nil, false
		}
		key := strings.ToLower(text)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, text)
	}
	return result, true
}

func validateCommutePayload(payload commutePayload, requireUserID bool) bool {
	if (requireUserID && strings.TrimSpace(payload.UserID) == "") || strings.TrimSpace(payload.Name) == "" || len(strings.TrimSpace(payload.Name)) > 80 || payload.OriginLocationID == "" || payload.DestinationLocationID == "" || payload.OriginLocationID == payload.DestinationLocationID || !validClock(&payload.DepartureTimeLocal) || len(payload.Weekdays) == 0 {
		return false
	}
	if payload.PreferredMode == "" {
		payload.PreferredMode = "TRANSIT"
	}
	if payload.PreferredMode != "TRANSIT" && payload.PreferredMode != "WALK" && payload.PreferredMode != "BIKE" && payload.PreferredMode != "DRIVE" {
		return false
	}
	if _, ok := cleanNameList(payload.RouteNames); !ok {
		return false
	}
	if _, ok := cleanNameList(payload.StopNames); !ok {
		return false
	}
	seen := map[int]struct{}{}
	for _, day := range payload.Weekdays {
		if day < 1 || day > 7 {
			return false
		}
		seen[day] = struct{}{}
	}
	return len(seen) > 0
}

func (s *Server) channels(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListChannels(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload channelPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if payload.ChannelType == "" {
		payload.ChannelType = "TELEGRAM"
	}
	if payload.ChannelType != "TELEGRAM" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Unsupported channel type."})
		return
	}
	item, err := s.profiles.UpsertChannel(request.Context(), user.ID, profile.ChannelInput{ChannelType: payload.ChannelType, ExternalID: payload.ExternalID, IsActive: boolOr(payload.IsActive, true)})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type channelPayload struct {
	UserID      string  `json:"user_id"`
	ChannelType string  `json:"channel_type"`
	ExternalID  *string `json:"external_id"`
	IsActive    *bool   `json:"is_active"`
}

func (s *Server) publicSubscriptions(writer http.ResponseWriter, request *http.Request) {
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if request.Method == http.MethodGet {
		if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		items, err := s.profiles.ListSubscriptions(request.Context(), user.ID)
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
			return
		}
		writeJSON(writer, http.StatusOK, items)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	var payload subscriptionPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if err := requireOwnUser(user.ID, payload.UserID); err != nil {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": err.Error()})
		return
	}
	if !validScenario(payload.ScenarioKey) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Unsupported scenario key."})
		return
	}
	item, err := s.profiles.UpsertSubscription(request.Context(), user.ID, payload.ScenarioKey)
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"detail": "Register a Telegram channel before subscribing to public scenario feeds."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusCreated, item)
}

type subscriptionPayload struct {
	UserID      string `json:"user_id"`
	ScenarioKey string `json:"scenario_key"`
}

func validScenario(value string) bool {
	return value == "commute" || value == "outdoor" || value == "home_air" || value == "energy" || value == "COMMUTE" || value == "OUTDOOR" || value == "HOME_AIR" || value == "ENERGY"
}

func validClock(value *string) bool {
	if value == nil || *value == "" {
		return true
	}
	if len(*value) != 5 || (*value)[2] != ':' {
		return false
	}
	hour, hourErr := strconv.Atoi((*value)[:2])
	minute, minuteErr := strconv.Atoi((*value)[3:])
	return hourErr == nil && minuteErr == nil && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}
