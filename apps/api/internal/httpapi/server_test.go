package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/airquality"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/energy"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observability"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/observations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/platform"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/recommendations"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/sources"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/timescope"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/traffic"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/weather"
)

const legacyCompatibleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"

type fakeDatabase struct{ err error }

func (database fakeDatabase) Ping(context.Context) error { return database.err }

type sourceDatabase struct {
	active bool
}

func (database sourceDatabase) Ping(context.Context) error { return nil }

func (database sourceDatabase) IsActiveUser(context.Context, string) (bool, error) {
	return database.active, nil
}

func (database sourceDatabase) GetUser(context.Context, string) (users.User, error) {
	status := "DISABLED"
	if database.active {
		status = "ACTIVE"
	}
	return users.User{
		ID:       "user-1",
		Status:   status,
		Locale:   "zh-CN",
		Timezone: "Europe/Helsinki",
	}, nil
}

func (sourceDatabase) ListSourceStatus(context.Context) ([]sources.Status, error) {
	finishedAt := "2026-08-21T14:00:00Z"
	return []sources.Status{{
		ID:                  "source-fmi",
		SourceCode:          "fmi",
		SourceName:          "Finnish Meteorological Institute",
		Endpoint:            "https://opendata.fmi.fi",
		AuthType:            "NONE",
		PollIntervalSeconds: 1800,
		IsActive:            true,
		LastRun: &sources.CollectorRun{
			Status:          "succeeded",
			StartedAt:       "2026-08-21T13:59:00Z",
			FinishedAt:      &finishedAt,
			RecordsIngested: 10,
		},
	}}, nil
}

type adminDatabase struct {
	sourceDatabase
}

func (database adminDatabase) GetOrCreateAdminUser(context.Context, config.Config) (users.User, error) {
	email := "admin@arkiwatch.local"
	name := "Admin"
	return users.User{
		ID:        "admin",
		Email:     &email,
		Name:      &name,
		Locale:    "zh-CN",
		Timezone:  "Europe/Helsinki",
		Status:    "ACTIVE",
		CreatedAt: time.Unix(2000000000, 0).UTC(),
		UpdatedAt: time.Unix(2000000000, 0).UTC(),
	}, nil
}

type recommendationDatabase struct {
	adminDatabase
}

func (recommendationDatabase) ListRecommendations(context.Context, string, int) ([]recommendations.Read, error) {
	return []recommendations.Read{
		{
			ID:                 "recommendation-1",
			RecommendationType: "WEATHER",
			Priority:           10,
			Status:             "PENDING",
			AdviceTitle:        "Take a jacket",
			AdviceBody:         "Wind increases this afternoon.",
			ValidFrom:          time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC),
			ValidTo:            time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC),
			EventType:          "weather_outlook",
			EventSeverity:      "MEDIUM",
			Rationale: map[string]any{
				"localized": map[string]any{
					"zh": map[string]any{"title": "带上外套", "body": "今天下午风力会增强。"},
				},
			},
		},
	}, nil
}

type weatherDatabase struct {
	sourceDatabase
	data      observations.WeatherData
	err       error
	lastQuery *observations.WeatherQuery
}

func (database *weatherDatabase) LoadWeather(_ context.Context, query observations.WeatherQuery) (observations.WeatherData, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type airQualityDatabase struct {
	sourceDatabase
	data      airquality.Data
	err       error
	lastQuery *airquality.Query
}

func (database *airQualityDatabase) LoadAirQuality(_ context.Context, query airquality.Query) (airquality.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type energyDatabase struct {
	sourceDatabase
	data      energy.Data
	err       error
	lastQuery *energy.Query
}

func (database *energyDatabase) LoadEnergy(_ context.Context, query energy.Query) (energy.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type trafficDatabase struct {
	sourceDatabase
	data      traffic.Data
	err       error
	lastQuery *traffic.Query
}

func (database *trafficDatabase) LoadTraffic(_ context.Context, query traffic.Query) (traffic.Data, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type transitDatabase struct {
	sourceDatabase
	data      observations.TransitData
	err       error
	lastQuery *observations.TransitQuery
}

func (database *transitDatabase) LoadTransit(_ context.Context, query observations.TransitQuery) (observations.TransitData, error) {
	database.lastQuery = &query
	return database.data, database.err
}

type platformDatabase struct {
	sourceDatabase
	data      platform.PlatformData
	err       error
	lastQuery *platform.PlatformQuery
}

func (database *platformDatabase) LoadPlatform(_ context.Context, query platform.PlatformQuery) (platform.PlatformData, error) {
	database.lastQuery = &query
	return database.data, database.err
}

// profileDatabase implements the full (13-method) database.ProfileStore so it
// can back every /api/user/* handler (locations, preferences, commute
// profiles, channels, subscriptions, notifications) with one fake.
type profileDatabase struct {
	sourceDatabase
	lastLocationInput profile.LocationInput
	lastCommuteInput  profile.CommuteProfileInput
}

func (database *profileDatabase) ListLocations(context.Context, string) ([]profile.Location, error) {
	return []profile.Location{{ID: "loc-1", Label: "Home"}}, nil
}

func (database *profileDatabase) CreateLocation(_ context.Context, userID string, input profile.LocationInput) (profile.Location, error) {
	database.lastLocationInput = input
	return profile.Location{ID: "loc-new", UserID: userID, Label: input.Label}, nil
}

func (database *profileDatabase) UpdateLocation(_ context.Context, userID, locationID string, input profile.LocationInput) (profile.Location, error) {
	return profile.Location{ID: locationID, UserID: userID, Label: input.Label}, nil
}

func (database *profileDatabase) GetPreferences(context.Context, string) (*profile.Preference, error) {
	return &profile.Preference{ID: "pref-1", MaxNotificationsPerDay: 6}, nil
}

func (database *profileDatabase) UpsertPreferences(_ context.Context, userID string, input profile.PreferenceInput) (profile.Preference, error) {
	return profile.Preference{ID: "pref-1", UserID: userID, MaxNotificationsPerDay: input.MaxNotificationsPerDay}, nil
}

func (database *profileDatabase) ListCommuteProfiles(context.Context, string) ([]profile.CommuteProfile, error) {
	return []profile.CommuteProfile{{ID: "commute-1", Name: "Work"}}, nil
}

func (database *profileDatabase) CreateCommuteProfile(_ context.Context, userID string, input profile.CommuteProfileInput) (profile.CommuteProfile, error) {
	database.lastCommuteInput = input
	return profile.CommuteProfile{ID: "commute-new", UserID: userID, Name: input.Name}, nil
}

func (database *profileDatabase) UpdateCommuteProfile(_ context.Context, userID, profileID string, input profile.CommuteProfileInput) (profile.CommuteProfile, error) {
	return profile.CommuteProfile{ID: profileID, UserID: userID, Name: input.Name}, nil
}

func (database *profileDatabase) ListChannels(context.Context, string) ([]profile.Channel, error) {
	return []profile.Channel{{ID: "channel-1", ChannelType: "TELEGRAM"}}, nil
}

func (database *profileDatabase) UpsertChannel(_ context.Context, userID string, input profile.ChannelInput) (profile.Channel, error) {
	return profile.Channel{ID: "channel-1", UserID: userID, ChannelType: input.ChannelType}, nil
}

func (database *profileDatabase) ListSubscriptions(context.Context, string) ([]profile.Subscription, error) {
	return []profile.Subscription{{ID: "sub-1", ScenarioKey: "commute"}}, nil
}

func (database *profileDatabase) UpsertSubscription(_ context.Context, userID, scenarioKey string) (profile.Subscription, error) {
	return profile.Subscription{ID: "sub-new", ChannelID: userID, ScenarioKey: scenarioKey}, nil
}

func (database *profileDatabase) ListNotifications(_ context.Context, _ string, limit int) ([]profile.Notification, error) {
	items := make([]profile.Notification, 0, limit)
	for i := 0; i < limit && i < 2; i++ {
		items = append(items, profile.Notification{ID: "notif-1"})
	}
	return items, nil
}

type todayDatabase struct {
	sourceDatabase
	result map[string]any
	err    error
}

func (database todayDatabase) LoadToday(context.Context, string, time.Time) (map[string]any, error) {
	return database.result, database.err
}

type personalDashboardDatabase struct {
	sourceDatabase
	result map[string]any
	err    error
}

func (database personalDashboardDatabase) LoadPersonalDashboard(context.Context, string, time.Time) (map[string]any, error) {
	return database.result, database.err
}

type publicDashboardDatabase struct {
	sourceDatabase
	calls int
	dates []string
}

func (database *publicDashboardDatabase) LoadPublicDashboard(_ context.Context, date *time.Time, _ time.Time) (map[string]any, error) {
	database.calls++
	value := "live"
	if date != nil {
		value = date.Format("2006-01-02")
	}
	database.dates = append(database.dates, value)
	return map[string]any{"snapshot_date": value}, nil
}

// assistantGroundingDatabase wires every reader groundAssistant can draw on
// (weather, air quality, energy, traffic, transit, platform overview, and
// source status via the embedded sourceDatabase) so the routing logic in
// SelectDataSources can be exercised end to end without a real DeepSeek call.
type assistantGroundingDatabase struct {
	sourceDatabase
}

func (assistantGroundingDatabase) LoadWeather(context.Context, observations.WeatherQuery) (observations.WeatherData, error) {
	return observations.WeatherData{}, nil
}

func (assistantGroundingDatabase) LoadAirQuality(context.Context, airquality.Query) (airquality.Data, error) {
	return airquality.Data{}, nil
}

func (assistantGroundingDatabase) LoadEnergy(context.Context, energy.Query) (energy.Data, error) {
	return energy.Data{}, nil
}

func (assistantGroundingDatabase) LoadTraffic(context.Context, traffic.Query) (traffic.Data, error) {
	return traffic.Data{}, nil
}

func (assistantGroundingDatabase) LoadTransit(context.Context, observations.TransitQuery) (observations.TransitData, error) {
	return observations.TransitData{}, nil
}

func (assistantGroundingDatabase) LoadPlatform(context.Context, platform.PlatformQuery) (platform.PlatformData, error) {
	return platform.PlatformData{}, nil
}

type platformHistoryDatabase struct {
	sourceDatabase
	historyCalls int
	err          error
}

func (database *platformHistoryDatabase) LoadPlatformHistory(context.Context, string, *time.Time, int, time.Time) (map[string]any, error) {
	database.historyCalls++
	return map[string]any{"days": 1}, database.err
}

func (database *platformHistoryDatabase) LoadPlatformHistoryAvailability(context.Context, string, *time.Time, int, time.Time) (map[string]any, error) {
	return map[string]any{"available": true}, database.err
}

func (database *platformHistoryDatabase) LoadPlatformEvent(_ context.Context, eventID string) (map[string]any, error) {
	if database.err != nil {
		return nil, database.err
	}
	return map[string]any{"id": eventID}, nil
}

type telegramDatabase struct {
	sourceDatabase
	err        error
	calls      int
	lastChatID string
	lastText   string
}

func (telegramDB *telegramDatabase) ProcessTelegramUpdate(_ context.Context, _ *int64, chatID, text string, _ time.Time) (*database.TelegramReply, error) {
	telegramDB.calls++
	telegramDB.lastChatID, telegramDB.lastText = chatID, text
	return nil, telegramDB.err
}

func bearerRequest(method, target, body string) *http.Request {
	var request *http.Request
	if body == "" {
		request = httptest.NewRequest(method, target, nil)
	} else {
		request = httptest.NewRequest(method, target, strings.NewReader(body))
	}
	request.Header.Set("Authorization", "Bearer "+legacyCompatibleToken)
	return request
}

func TestLocationsHandlerCoversListCreateValidationAndOwnership(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	database := &profileDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	list := httptest.NewRecorder()
	server.Handler().ServeHTTP(list, bearerRequest(http.MethodGet, "/api/user/locations?user_id=user-1", ""))
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d; body = %s", list.Code, list.Body.String())
	}

	wrongUser := httptest.NewRecorder()
	server.Handler().ServeHTTP(wrongUser, bearerRequest(http.MethodGet, "/api/user/locations?user_id=someone-else", ""))
	if wrongUser.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a GET ownership mismatch to be 422, got %d", wrongUser.Code)
	}

	validCreate := `{"user_id":"user-1","label":"Home","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}`
	created := httptest.NewRecorder()
	server.Handler().ServeHTTP(created, bearerRequest(http.MethodPost, "/api/user/locations", validCreate))
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d; body = %s", created.Code, created.Body.String())
	}
	if database.lastLocationInput.Label != "Home" {
		t.Fatalf("expected the create input to reach the store: %#v", database.lastLocationInput)
	}

	invalidCreate := `{"user_id":"user-1","label":"","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}`
	rejected := httptest.NewRecorder()
	server.Handler().ServeHTTP(rejected, bearerRequest(http.MethodPost, "/api/user/locations", invalidCreate))
	if rejected.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a blank label to be 422, got %d", rejected.Code)
	}

	mismatchedOwner := `{"user_id":"someone-else","label":"Home","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}`
	forbidden := httptest.NewRecorder()
	server.Handler().ServeHTTP(forbidden, bearerRequest(http.MethodPost, "/api/user/locations", mismatchedOwner))
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("expected a POST body user_id mismatch to be 403 (not 422 like the GET case), got %d", forbidden.Code)
	}
}

func TestListNotificationsValidatesLimitAndOwnership(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, &profileDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, bearerRequest(http.MethodGet, "/api/notifications?user_id=user-1&limit=2", ""))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}
	var items []profile.Notification
	if err := json.Unmarshal(ok.Body.Bytes(), &items); err != nil || len(items) != 2 {
		t.Fatalf("expected 2 notifications, got %v (err=%v)", items, err)
	}

	tooMany := httptest.NewRecorder()
	server.Handler().ServeHTTP(tooMany, bearerRequest(http.MethodGet, "/api/notifications?user_id=user-1&limit=201", ""))
	if tooMany.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected limit>200 to be rejected, got %d", tooMany.Code)
	}

	notOwner := httptest.NewRecorder()
	server.Handler().ServeHTTP(notOwner, bearerRequest(http.MethodGet, "/api/notifications?user_id=someone-else", ""))
	if notOwner.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an ownership mismatch to be rejected, got %d", notOwner.Code)
	}
}

func TestTodaySummaryReturnsNotFoundForAMissingUser(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, todayDatabase{sourceDatabase: sourceDatabase{active: true}, result: map[string]any{"lead": "bike"}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, bearerRequest(http.MethodGet, "/api/today?user_id=user-1", ""))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}

	mismatch := httptest.NewRecorder()
	server.Handler().ServeHTTP(mismatch, bearerRequest(http.MethodGet, "/api/today?user_id=someone-else", ""))
	if mismatch.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an ownership mismatch to be 422, got %d", mismatch.Code)
	}

	notFoundServer := New(cfg, todayDatabase{sourceDatabase: sourceDatabase{active: true}, err: pgx.ErrNoRows})
	notFoundServer.now = server.now
	notFound := httptest.NewRecorder()
	notFoundServer.Handler().ServeHTTP(notFound, bearerRequest(http.MethodGet, "/api/today?user_id=user-1", ""))
	if notFound.Code != http.StatusNotFound {
		t.Fatalf("expected a missing user to be 404, got %d; body = %s", notFound.Code, notFound.Body.String())
	}
}

func TestPersonalDashboardHandlerEnforcesOwnershipAndNotFound(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, personalDashboardDatabase{sourceDatabase: sourceDatabase{active: true}, result: map[string]any{"lead": "umbrella"}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, bearerRequest(http.MethodGet, "/api/personal/dashboard", ""))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}

	forbidden := httptest.NewRecorder()
	server.Handler().ServeHTTP(forbidden, bearerRequest(http.MethodGet, "/api/personal/dashboard?user_id=someone-else", ""))
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("expected an ownership mismatch here to be 403 (this handler checks inline, not via requireOwnUser's 422), got %d", forbidden.Code)
	}

	notFoundServer := New(cfg, personalDashboardDatabase{sourceDatabase: sourceDatabase{active: true}, err: pgx.ErrNoRows})
	notFoundServer.now = server.now
	notFound := httptest.NewRecorder()
	notFoundServer.Handler().ServeHTTP(notFound, bearerRequest(http.MethodGet, "/api/personal/dashboard", ""))
	if notFound.Code != http.StatusNotFound {
		t.Fatalf("expected a missing user to be 404, got %d", notFound.Code)
	}
}

func TestPublicDashboardHandlerParsesDateAndCachesByKey(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &publicDashboardDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	live := httptest.NewRecorder()
	server.Handler().ServeHTTP(live, httptest.NewRequest(http.MethodGet, "/api/dashboard", nil))
	if live.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", live.Code, live.Body.String())
	}

	liveAgain := httptest.NewRecorder()
	server.Handler().ServeHTTP(liveAgain, httptest.NewRequest(http.MethodGet, "/api/dashboard", nil))
	if liveAgain.Code != http.StatusOK || database.calls != 1 {
		t.Fatalf("expected the second identical request to be served from cache (1 store call), got %d calls", database.calls)
	}

	dated := httptest.NewRecorder()
	server.Handler().ServeHTTP(dated, httptest.NewRequest(http.MethodGet, "/api/dashboard?date=2026-04-12", nil))
	if dated.Code != http.StatusOK || database.calls != 2 {
		t.Fatalf("expected a different date to bypass the live cache entry and hit the store, got %d calls", database.calls)
	}

	malformed := httptest.NewRecorder()
	server.Handler().ServeHTTP(malformed, httptest.NewRequest(http.MethodGet, "/api/dashboard?date=12-04-2026", nil))
	if malformed.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a malformed date to be rejected, got %d", malformed.Code)
	}
}

func TestGroundAssistantSelectsDatasetsFromTheQuestionKeywords(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, assistantGroundingDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/chat", nil)

	weatherOnly := server.groundAssistant(request, assistantChatPayload{Messages: []assistantMessagePayload{{Role: "user", Content: "will it rain today?"}}})
	if !containsString(weatherOnly.DataContext, "weather") || !containsString(weatherOnly.DataContext, "platform_overview") {
		t.Fatalf("expected weather + platform_overview to be grounded for a weather question: %v", weatherOnly.DataContext)
	}
	if containsString(weatherOnly.DataContext, "energy") || containsString(weatherOnly.DataContext, "traffic") {
		t.Fatalf("expected an unrelated dataset like energy/traffic not to be pulled in for a weather-only question: %v", weatherOnly.DataContext)
	}

	offTopic := server.groundAssistant(request, assistantChatPayload{Messages: []assistantMessagePayload{{Role: "user", Content: "hello there"}}})
	for _, dataset := range []string{"weather", "air_quality", "energy", "traffic", "transit", "platform_overview"} {
		if !containsString(offTopic.DataContext, dataset) {
			t.Fatalf("expected an off-topic question with no keyword match to ground every dataset (the SelectDataSources 'select all' fallback), missing %q: %v", dataset, offTopic.DataContext)
		}
	}
}

func TestGroundAssistantSkipsDatasetsWithoutAWiredReader(t *testing.T) {
	cfg := config.DefaultConfig()
	// weatherDatabase only satisfies database.WeatherReader (plus the base
	// HealthChecker/UserReader via sourceDatabase) -- air quality, energy,
	// traffic, and transit are all left nil on the Server.
	server := New(cfg, &weatherDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/chat", nil)

	got := server.groundAssistant(request, assistantChatPayload{Messages: []assistantMessagePayload{{Role: "user", Content: "hello"}}})
	if containsString(got.DataContext, "energy") || containsString(got.DataContext, "traffic") || containsString(got.DataContext, "transit") || containsString(got.DataContext, "air_quality") {
		t.Fatalf("expected datasets without a wired reader to be silently skipped, not errored: %v", got.DataContext)
	}
	if !containsString(got.DataContext, "weather") {
		t.Fatalf("expected weather (the one wired reader) to still be grounded: %v", got.DataContext)
	}
}

func TestPlatformOverviewPayloadFallsBackWithoutWiredReaders(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, fakeDatabase{})
	scope, err := timescope.DefaultScope(nil, time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC), cfg)
	if err != nil {
		t.Fatal(err)
	}
	// Neither sources nor platformReader is wired on a bare fakeDatabase; this
	// must degrade to an empty-but-valid overview rather than panicking.
	got := server.platformOverviewPayload(context.Background(), "helsinki", scope)
	if got == nil {
		t.Fatal("expected a non-nil overview payload even with nothing wired")
	}
}

func TestPlatformHistoryHandlerValidatesDaysRangeAndCaches(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &platformHistoryDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, httptest.NewRequest(http.MethodGet, "/api/platform/history?city=helsinki&days=7", nil))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}
	server.Handler().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/platform/history?city=helsinki&days=7", nil))
	if database.historyCalls != 1 {
		t.Fatalf("expected the identical repeat request to be served from cache, got %d store calls", database.historyCalls)
	}

	tooManyDays := httptest.NewRecorder()
	server.Handler().ServeHTTP(tooManyDays, httptest.NewRequest(http.MethodGet, "/api/platform/history?days=50", nil))
	if tooManyDays.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected days=50 to be rejected for /history (max 31), got %d", tooManyDays.Code)
	}

	unsupportedCity := httptest.NewRecorder()
	server.Handler().ServeHTTP(unsupportedCity, httptest.NewRequest(http.MethodGet, "/api/platform/history?city=narnia", nil))
	if unsupportedCity.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an unsupported city to be rejected, got %d", unsupportedCity.Code)
	}
}

func TestPlatformHistoryAvailabilityAllowsTheWiderDaysRange(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, &platformHistoryDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }

	wideRange := httptest.NewRecorder()
	server.Handler().ServeHTTP(wideRange, httptest.NewRequest(http.MethodGet, "/api/platform/history/availability?days=50", nil))
	if wideRange.Code != http.StatusOK {
		t.Fatalf("expected days=50 to be accepted for /availability (max 90, vs 31 for /history), got %d; body = %s", wideRange.Code, wideRange.Body.String())
	}

	tooMany := httptest.NewRecorder()
	server.Handler().ServeHTTP(tooMany, httptest.NewRequest(http.MethodGet, "/api/platform/history/availability?days=91", nil))
	if tooMany.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected days=91 to still be rejected, got %d", tooMany.Code)
	}
}

func TestPlatformEventLookupHandlesNestedPathsAndNotFound(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, &platformHistoryDatabase{sourceDatabase: sourceDatabase{active: true}})

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, httptest.NewRequest(http.MethodGet, "/api/platform/events/event-1", nil))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}

	nested := httptest.NewRecorder()
	server.Handler().ServeHTTP(nested, httptest.NewRequest(http.MethodGet, "/api/platform/events/event-1/extra", nil))
	if nested.Code != http.StatusNotFound {
		t.Fatalf("expected a nested path segment to 404, got %d", nested.Code)
	}

	notFoundServer := New(cfg, &platformHistoryDatabase{sourceDatabase: sourceDatabase{active: true}, err: pgx.ErrNoRows})
	notFound := httptest.NewRecorder()
	notFoundServer.Handler().ServeHTTP(notFound, httptest.NewRequest(http.MethodGet, "/api/platform/events/missing", nil))
	if notFound.Code != http.StatusNotFound {
		t.Fatalf("expected a missing event to 404, got %d", notFound.Code)
	}
}

func TestPlatformOverviewExportSupportsJSONAndCSVFormats(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &platformDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: platform.PlatformData{Events: []observations.NormalizedEvent{{
			ID: "weather-event", EventType: "weather_outlook", SourceCode: "fmi", Severity: "MEDIUM", LocationRef: "helsinki", StartsAt: now, EndsAt: now.Add(6 * time.Hour), Title: "Cloudy", Summary: "Cloudy.",
		}}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }

	jsonExport := httptest.NewRecorder()
	server.Handler().ServeHTTP(jsonExport, httptest.NewRequest(http.MethodGet, "/api/platform/overview/export", nil))
	if jsonExport.Code != http.StatusOK || !strings.Contains(jsonExport.Header().Get("Content-Disposition"), "arkiwatch-helsinki-live.json") {
		t.Fatalf("status = %d; Content-Disposition = %q", jsonExport.Code, jsonExport.Header().Get("Content-Disposition"))
	}

	csvExport := httptest.NewRecorder()
	server.Handler().ServeHTTP(csvExport, httptest.NewRequest(http.MethodGet, "/api/platform/overview/export?format=csv", nil))
	if csvExport.Code != http.StatusOK || csvExport.Header().Get("Content-Type") != "text/csv; charset=utf-8" {
		t.Fatalf("csv status = %d; content-type = %q", csvExport.Code, csvExport.Header().Get("Content-Type"))
	}
	if !strings.Contains(csvExport.Body.String(), "category,event_type,title,severity,starts_at,ends_at,source_codes") || !strings.Contains(csvExport.Body.String(), "Cloudy") {
		t.Fatalf("expected a CSV header and the weather event row, got: %s", csvExport.Body.String())
	}

	badFormat := httptest.NewRecorder()
	server.Handler().ServeHTTP(badFormat, httptest.NewRequest(http.MethodGet, "/api/platform/overview/export?format=xml", nil))
	if badFormat.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an unsupported format to be 422, got %d", badFormat.Code)
	}
}

func TestPlatformCategoryFindsByKeyOrReturns404(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &platformDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }

	found := httptest.NewRecorder()
	server.Handler().ServeHTTP(found, httptest.NewRequest(http.MethodGet, "/api/platform/categories/weather", nil))
	if found.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", found.Code, found.Body.String())
	}

	missing := httptest.NewRecorder()
	server.Handler().ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/platform/categories/not-a-category", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("expected an unknown category key to 404, got %d", missing.Code)
	}

	nested := httptest.NewRecorder()
	server.Handler().ServeHTTP(nested, httptest.NewRequest(http.MethodGet, "/api/platform/categories/weather/extra", nil))
	if nested.Code != http.StatusNotFound {
		t.Fatalf("expected a nested path segment to 404, got %d", nested.Code)
	}
}

func TestTelegramWebhookValidatesSecretAndProcessesUpdates(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.TelegramWebhookSecret = "shh-its-a-secret"
	database := &telegramDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	unconfiguredServer := New(config.DefaultConfig(), database)
	unconfigured := httptest.NewRecorder()
	unconfiguredServer.Handler().ServeHTTP(unconfigured, httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader("{}")))
	if unconfigured.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected no configured secret to be 503, got %d", unconfigured.Code)
	}

	wrongSecret := httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader("{}"))
	wrongSecret.Header.Set("X-Telegram-Bot-Api-Secret-Token", "not-it")
	forbidden := httptest.NewRecorder()
	server.Handler().ServeHTTP(forbidden, wrongSecret)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("expected a wrong secret to be 403, got %d", forbidden.Code)
	}

	messageBody := `{"update_id":42,"message":{"chat":{"id":777},"text":"hello"}}`
	messageRequest := httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader(messageBody))
	messageRequest.Header.Set("X-Telegram-Bot-Api-Secret-Token", "shh-its-a-secret")
	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, messageRequest)
	if ok.Code != http.StatusOK || database.calls != 1 || database.lastChatID != "777" || database.lastText != "hello" {
		t.Fatalf("status = %d; calls = %d; chatID = %q; text = %q", ok.Code, database.calls, database.lastChatID, database.lastText)
	}

	updateOnlyBody := `{"update_id":43}`
	updateOnlyRequest := httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader(updateOnlyBody))
	updateOnlyRequest.Header.Set("X-Telegram-Bot-Api-Secret-Token", "shh-its-a-secret")
	updateOnly := httptest.NewRecorder()
	server.Handler().ServeHTTP(updateOnly, updateOnlyRequest)
	if updateOnly.Code != http.StatusOK || database.calls != 2 || database.lastChatID != "" {
		t.Fatalf("expected an update-only payload (no message) to still process with an empty chatID: status=%d calls=%d chatID=%q", updateOnly.Code, database.calls, database.lastChatID)
	}

	failing := &telegramDatabase{sourceDatabase: sourceDatabase{active: true}, err: context.DeadlineExceeded}
	failingServer := New(cfg, failing)
	failingRequest := httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader(messageBody))
	failingRequest.Header.Set("X-Telegram-Bot-Api-Secret-Token", "shh-its-a-secret")
	degraded := httptest.NewRecorder()
	failingServer.Handler().ServeHTTP(degraded, failingRequest)
	if degraded.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected a store error to be 503, got %d", degraded.Code)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/telegram/webhook", nil)
	methodNotAllowedRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(methodNotAllowedRecorder, getRequest)
	if methodNotAllowedRecorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected GET to be 405, got %d", methodNotAllowedRecorder.Code)
	}
}

func TestMetricsRequiresBearerTokenOnlyWhenConfigured(t *testing.T) {
	open := httptest.NewRecorder()
	New(config.DefaultConfig(), fakeDatabase{}).Handler().ServeHTTP(open, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
	if open.Code != http.StatusOK {
		t.Fatalf("expected metrics to be open when no token is configured, got %d", open.Code)
	}

	cfg := config.DefaultConfig()
	cfg.MetricsBearerToken = "secret-metrics-token"
	server := New(cfg, fakeDatabase{})

	missing := httptest.NewRecorder()
	server.Handler().ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
	if missing.Code != http.StatusUnauthorized {
		t.Fatalf("expected a missing bearer token to be 401, got %d", missing.Code)
	}

	wrong := httptest.NewRecorder()
	wrongRequest := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	wrongRequest.Header.Set("Authorization", "Bearer nope")
	server.Handler().ServeHTTP(wrong, wrongRequest)
	if wrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected the wrong bearer token to be 401, got %d", wrong.Code)
	}

	correct := httptest.NewRecorder()
	correctRequest := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	correctRequest.Header.Set("Authorization", "Bearer secret-metrics-token")
	server.Handler().ServeHTTP(correct, correctRequest)
	if correct.Code != http.StatusOK {
		t.Fatalf("expected the correct bearer token to be 200, got %d", correct.Code)
	}
	if correct.Header().Get("Content-Type") != observability.PrometheusContentType {
		t.Fatalf("expected the Prometheus content type, got %q", correct.Header().Get("Content-Type"))
	}
}

func TestTransitCurrentValidatesCityAndFallsBackToUnavailable(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &transitDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	server.now = func() time.Time { return now }

	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, httptest.NewRequest(http.MethodGet, "/api/transit/current?city=helsinki", nil))
	if ok.Code != http.StatusOK || database.lastQuery == nil || database.lastQuery.LocationRef != "helsinki" {
		t.Fatalf("status = %d; query = %#v; body = %s", ok.Code, database.lastQuery, ok.Body.String())
	}

	unsupported := httptest.NewRecorder()
	server.Handler().ServeHTTP(unsupported, httptest.NewRequest(http.MethodGet, "/api/transit/current?city=narnia", nil))
	if unsupported.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an unconfigured city to be 422, got %d; body = %s", unsupported.Code, unsupported.Body.String())
	}

	malformedDate := httptest.NewRecorder()
	server.Handler().ServeHTTP(malformedDate, httptest.NewRequest(http.MethodGet, "/api/transit/current?date=not-a-date", nil))
	if malformedDate.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a malformed date to be 422, got %d", malformedDate.Code)
	}

	failing := &transitDatabase{sourceDatabase: sourceDatabase{active: true}, err: context.DeadlineExceeded}
	failingServer := New(cfg, failing)
	failingServer.now = server.now
	degraded := httptest.NewRecorder()
	failingServer.Handler().ServeHTTP(degraded, httptest.NewRequest(http.MethodGet, "/api/transit/current", nil))
	if degraded.Code != http.StatusOK {
		t.Fatalf("expected a store error to be swallowed into an 'unavailable' 200 (not a 5xx), got %d", degraded.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(degraded.Body.Bytes(), &payload); err != nil || payload["status"] != "unavailable" {
		t.Fatalf("expected an unavailable status payload, got %#v (err=%v)", payload, err)
	}

	noReader := httptest.NewRecorder()
	New(cfg, sourceDatabase{active: true}).Handler().ServeHTTP(noReader, httptest.NewRequest(http.MethodGet, "/api/transit/current", nil))
	if noReader.Code != http.StatusOK {
		t.Fatalf("expected no TransitReader wired to also degrade to 200, got %d", noReader.Code)
	}
}

func TestFormatOptionalTimeHandlesNilAndUTCFormatting(t *testing.T) {
	if formatOptionalTime(nil) != nil {
		t.Fatal("expected nil in, nil out")
	}
	helsinki, err := time.LoadLocation("Europe/Helsinki")
	if err != nil {
		t.Fatal(err)
	}
	moment := time.Date(2026, 4, 12, 15, 0, 0, 0, helsinki)
	got := formatOptionalTime(&moment)
	if got == nil || *got != "2026-04-12T12:00:00Z" {
		t.Fatalf("expected the moment converted to UTC RFC3339Nano, got %v", got)
	}
}

func TestLocationByIDUpdatesAndRejectsNestedPaths(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, &profileDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	update := `{"label":"Home","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}`
	ok := httptest.NewRecorder()
	server.Handler().ServeHTTP(ok, bearerRequest(http.MethodPut, "/api/user/locations/loc-1", update))
	if ok.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", ok.Code, ok.Body.String())
	}

	wrongMethod := httptest.NewRecorder()
	server.Handler().ServeHTTP(wrongMethod, bearerRequest(http.MethodGet, "/api/user/locations/loc-1", ""))
	if wrongMethod.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected GET on a specific location to be 405, got %d", wrongMethod.Code)
	}

	nested := httptest.NewRecorder()
	server.Handler().ServeHTTP(nested, bearerRequest(http.MethodPut, "/api/user/locations/loc-1/extra", update))
	if nested.Code != http.StatusNotFound {
		t.Fatalf("expected a nested path segment to 404, got %d", nested.Code)
	}
}

func TestPreferencesGetAndUpsertAppliesDefaultsAndClockValidation(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, &profileDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	get := httptest.NewRecorder()
	server.Handler().ServeHTTP(get, bearerRequest(http.MethodGet, "/api/user/preferences?user_id=user-1", ""))
	if get.Code != http.StatusOK {
		t.Fatalf("get status = %d; body = %s", get.Code, get.Body.String())
	}

	upsert := httptest.NewRecorder()
	server.Handler().ServeHTTP(upsert, bearerRequest(http.MethodPost, "/api/user/preferences", `{"user_id":"user-1"}`))
	if upsert.Code != http.StatusCreated {
		t.Fatalf("expected an empty body to fall back to defaults (max_notifications_per_day=6), got %d; body = %s", upsert.Code, upsert.Body.String())
	}
	var preference profile.Preference
	if err := json.Unmarshal(upsert.Body.Bytes(), &preference); err != nil || preference.MaxNotificationsPerDay != 6 {
		t.Fatalf("expected the default of 6, got %#v (err=%v)", preference, err)
	}

	badClock := httptest.NewRecorder()
	server.Handler().ServeHTTP(badClock, bearerRequest(http.MethodPost, "/api/user/preferences", `{"user_id":"user-1","quiet_hours_start":"25:00"}`))
	if badClock.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an invalid quiet-hours clock value to be 422, got %d", badClock.Code)
	}

	badCount := httptest.NewRecorder()
	server.Handler().ServeHTTP(badCount, bearerRequest(http.MethodPost, "/api/user/preferences", `{"user_id":"user-1","max_notifications_per_day":21}`))
	if badCount.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected max_notifications_per_day over 20 to be 422, got %d", badCount.Code)
	}
}

func TestCommuteProfilesHandlersCoverListCreateAndUpdate(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	database := &profileDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	list := httptest.NewRecorder()
	server.Handler().ServeHTTP(list, bearerRequest(http.MethodGet, "/api/user/commute-profiles?user_id=user-1", ""))
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d; body = %s", list.Code, list.Body.String())
	}

	create := `{"user_id":"user-1","name":"Work","origin_location_id":"loc-a","destination_location_id":"loc-b","departure_time_local":"07:30","weekdays":[1,2,3,4,5]}`
	created := httptest.NewRecorder()
	server.Handler().ServeHTTP(created, bearerRequest(http.MethodPost, "/api/user/commute-profiles", create))
	if created.Code != http.StatusCreated || database.lastCommuteInput.PreferredMode != "TRANSIT" {
		t.Fatalf("expected a blank preferred_mode to default to TRANSIT on create: status=%d input=%#v body=%s", created.Code, database.lastCommuteInput, created.Body.String())
	}

	update := httptest.NewRecorder()
	server.Handler().ServeHTTP(update, bearerRequest(http.MethodPut, "/api/user/commute-profiles/commute-1", create))
	if update.Code != http.StatusOK {
		t.Fatalf("update status = %d; body = %s", update.Code, update.Body.String())
	}

	invalid := httptest.NewRecorder()
	server.Handler().ServeHTTP(invalid, bearerRequest(http.MethodPost, "/api/user/commute-profiles", `{"user_id":"user-1","name":"Work","origin_location_id":"loc-a","destination_location_id":"loc-a","departure_time_local":"07:30","weekdays":[1]}`))
	if invalid.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected identical origin/destination to be rejected, got %d", invalid.Code)
	}
}

func TestChannelsHandlerDefaultsAndRejectsUnsupportedType(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, &profileDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	list := httptest.NewRecorder()
	server.Handler().ServeHTTP(list, bearerRequest(http.MethodGet, "/api/user/channels?user_id=user-1", ""))
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d; body = %s", list.Code, list.Body.String())
	}

	defaulted := httptest.NewRecorder()
	server.Handler().ServeHTTP(defaulted, bearerRequest(http.MethodPost, "/api/user/channels", `{"user_id":"user-1"}`))
	if defaulted.Code != http.StatusCreated {
		t.Fatalf("expected a blank channel_type to default to TELEGRAM and succeed, got %d; body = %s", defaulted.Code, defaulted.Body.String())
	}

	unsupported := httptest.NewRecorder()
	server.Handler().ServeHTTP(unsupported, bearerRequest(http.MethodPost, "/api/user/channels", `{"user_id":"user-1","channel_type":"SMS"}`))
	if unsupported.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an unsupported channel type to be 422, got %d", unsupported.Code)
	}
}

func TestPublicSubscriptionsValidatesScenarioKey(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, &profileDatabase{sourceDatabase: sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }

	list := httptest.NewRecorder()
	server.Handler().ServeHTTP(list, bearerRequest(http.MethodGet, "/api/public/subscriptions?user_id=user-1", ""))
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d; body = %s", list.Code, list.Body.String())
	}

	valid := httptest.NewRecorder()
	server.Handler().ServeHTTP(valid, bearerRequest(http.MethodPost, "/api/public/subscriptions", `{"user_id":"user-1","scenario_key":"commute"}`))
	if valid.Code != http.StatusCreated {
		t.Fatalf("expected a valid scenario_key to succeed, got %d; body = %s", valid.Code, valid.Body.String())
	}

	invalid := httptest.NewRecorder()
	server.Handler().ServeHTTP(invalid, bearerRequest(http.MethodPost, "/api/public/subscriptions", `{"user_id":"user-1","scenario_key":"unknown"}`))
	if invalid.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected an unsupported scenario_key to be 422, got %d", invalid.Code)
	}
}

func TestValidateAssistantChatEnforcesMessageAndLanguageRules(t *testing.T) {
	valid := assistantChatPayload{Language: "en", Messages: []assistantMessagePayload{{Role: "user", Content: "hello"}}}
	if !validateAssistantChat(valid) {
		t.Fatal("expected a well-formed payload to pass")
	}

	blankLanguage := valid
	blankLanguage.Language = ""
	if !validateAssistantChat(blankLanguage) {
		t.Fatal("expected a blank language to default to English and pass")
	}

	noMessages := valid
	noMessages.Messages = nil
	if validateAssistantChat(noMessages) {
		t.Fatal("expected zero messages to be rejected")
	}

	tooMany := valid
	tooMany.Messages = make([]assistantMessagePayload, 21)
	for i := range tooMany.Messages {
		tooMany.Messages[i] = assistantMessagePayload{Role: "user", Content: "hi"}
	}
	if validateAssistantChat(tooMany) {
		t.Fatal("expected more than 20 messages to be rejected")
	}

	unsupportedLanguage := valid
	unsupportedLanguage.Language = "sv"
	if validateAssistantChat(unsupportedLanguage) {
		t.Fatal("expected an unsupported language to be rejected")
	}

	badRole := valid
	badRole.Messages = []assistantMessagePayload{{Role: "system", Content: "hi"}}
	if validateAssistantChat(badRole) {
		t.Fatal("expected a role other than user/assistant to be rejected")
	}

	blankContent := valid
	blankContent.Messages = []assistantMessagePayload{{Role: "user", Content: "   "}}
	if validateAssistantChat(blankContent) {
		t.Fatal("expected blank message content to be rejected")
	}

	tooLongContent := valid
	tooLongContent.Messages = []assistantMessagePayload{{Role: "user", Content: strings.Repeat("a", 4001)}}
	if validateAssistantChat(tooLongContent) {
		t.Fatal("expected message content over 4000 characters to be rejected")
	}

	for _, language := range []string{"en", "zh", "fi"} {
		payload := valid
		payload.Language = language
		if !validateAssistantChat(payload) {
			t.Fatalf("expected supported language %q to pass", language)
		}
	}
}

func TestRootMatchesPublicMetadataContract(t *testing.T) {
	cfg := config.DefaultConfig()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["service"] != "ArkiWatch" || payload["backend"] != "go" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestHealthReportsDatabaseFailureAsDegraded(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	New(cfg, fakeDatabase{err: context.DeadlineExceeded}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["status"] != "degraded" || payload["database"] != "down" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestDataQualityUsesSourceFreshnessContract(t *testing.T) {
	cfg := config.DefaultConfig()
	server := New(cfg, sourceDatabase{active: true})
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 30, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health/data-quality", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Status       string `json:"status"`
		SourceCount  int    `json:"source_count"`
		HealthyCount int    `json:"healthy_count"`
		IssueCount   int    `json:"issue_count"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "healthy" || payload.SourceCount != 1 || payload.HealthyCount != 1 || payload.IssueCount != 0 {
		t.Fatalf("unexpected data-quality payload: %#v", payload)
	}
}

func TestOperationalStatusMatchesExistingStateRules(t *testing.T) {
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	if got := operationalStatus(sources.Status{IsActive: false}, now); got != "inactive" {
		t.Fatalf("inactive status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true}, now); got != "pending" {
		t.Fatalf("pending status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true, PollIntervalSeconds: 60, LastRun: &sources.CollectorRun{Status: "failed", StartedAt: "2026-08-21T13:59:00Z"}}, now); got != "failing" {
		t.Fatalf("failing status = %q", got)
	}
	if got := operationalStatus(sources.Status{IsActive: true, PollIntervalSeconds: 60, LastRun: &sources.CollectorRun{Status: "succeeded", FinishedAt: stringPointer("2026-08-21T13:57:00Z"), StartedAt: "2026-08-21T13:56:00Z"}}, now); got != "stale" {
		t.Fatalf("stale status = %q", got)
	}
}

func stringPointer(value string) *string { return &value }

func TestCoverageUsesAPIContractPath(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/coverage", nil)
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	var payload struct {
		DefaultCity string `json:"default_city"`
		Cities      []any  `json:"cities"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.DefaultCity != "helsinki" || len(payload.Cities) != 6 {
		t.Fatalf("unexpected coverage payload: %#v", payload)
	}
}

func TestSourceStatusRequiresExistingBearerIdentity(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/sources/status", nil)
	New(cfg, sourceDatabase{active: true}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
	if recorder.Header().Get("WWW-Authenticate") != "Bearer" {
		t.Fatalf("WWW-Authenticate = %q, want Bearer", recorder.Header().Get("WWW-Authenticate"))
	}
}

func TestSourceStatusUsesExistingAuthContract(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/sources/status", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	server := New(cfg, sourceDatabase{active: true})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload []sources.Status
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 1 || payload[0].SourceCode != "fmi" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestLoginAndAuthMeUseExistingAuthContract(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AdminPassword = "secret"
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	cfg.AuthTokenTTLMinutes = 60
	server := New(cfg, adminDatabase{sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000000, 0).UTC() }

	loginRecorder := httptest.NewRecorder()
	loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"secret"}`))
	server.Handler().ServeHTTP(loginRecorder, loginRequest)
	if loginRecorder.Code != http.StatusOK {
		t.Fatalf("login status = %d; body = %s", loginRecorder.Code, loginRecorder.Body.String())
	}
	var loginPayload authTokenResponse
	if err := json.Unmarshal(loginRecorder.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.TokenType != "bearer" || loginPayload.User.ID != "admin" || loginPayload.AccessToken == "" {
		t.Fatalf("unexpected login payload: %#v", loginPayload)
	}

	meRecorder := httptest.NewRecorder()
	meRequest := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meRequest.Header.Set("Authorization", "Bearer "+loginPayload.AccessToken)
	server.Handler().ServeHTTP(meRecorder, meRequest)
	if meRecorder.Code != http.StatusOK {
		t.Fatalf("auth/me status = %d; body = %s", meRecorder.Code, meRecorder.Body.String())
	}
}

func TestLoginRateLimitsFailedAttempts(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AdminPassword = "secret"
	cfg.LoginRateLimitRequests = 1
	cfg.LoginRateLimitWindowSeconds = 60
	server := New(cfg, adminDatabase{sourceDatabase{active: true}})
	server.now = func() time.Time { return time.Unix(2000000000, 0).UTC() }

	request := func() *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"username":"admin","password":"wrong"}`))
		server.Handler().ServeHTTP(recorder, loginRequest)
		return recorder
	}
	if first := request(); first.Code != http.StatusUnauthorized {
		t.Fatalf("first failed login status = %d", first.Code)
	}
	if second := request(); second.Code != http.StatusTooManyRequests {
		t.Fatalf("second failed login status = %d", second.Code)
	}
}

func TestRecommendationsUsesAuthenticatedUserAndLocalizedFallback(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	server := New(cfg, recommendationDatabase{adminDatabase{sourceDatabase{active: true}}})
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/recommendations?user_id=user-1&limit=1", nil)
	request.Header.Set("Authorization", "Bearer "+legacyCompatibleToken)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 1 || payload[0]["advice_title_zh"] != "带上外套" {
		t.Fatalf("unexpected recommendation payload: %#v", payload)
	}
}

func TestWeatherForecastBuildsLiveReadModel(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	forecastStart := now.Add(-time.Hour)
	forecastEnd := now.Add(12 * time.Hour)
	data := observations.WeatherData{
		Outlook: &observations.NormalizedEvent{
			ID: "weather-1", EventType: "weather_outlook", SourceCode: "fmi", LocationRef: "helsinki",
			StartsAt: forecastStart, EndsAt: forecastEnd, Summary: "Partly cloudy with stronger wind.",
			Attributes: map[string]any{
				"generated_at": "2026-08-21T13:30:00+00:00",
				"forecast_points": []any{
					map[string]any{"timestamp": "2026-08-21T14:00:00+00:00", "temperature_c": 18.5, "precipitation_mm": 0.2, "wind_speed_ms": 5.0, "wind_gust_ms": 8.0, "cloud_cover_pct": 70.0, "humidity_pct": 65.0, "visibility_m": 12000.0},
					map[string]any{"timestamp": "2026-08-21T15:00:00+00:00", "temperature_c": 18.0, "precipitation_mm": 0.4, "wind_speed_ms": 5.5, "wind_gust_ms": 9.0, "cloud_cover_pct": 75.0, "humidity_pct": 68.0, "visibility_m": 11000.0},
				},
			},
		},
		Rain: &observations.NormalizedEvent{Attributes: map[string]any{
			"peak_precip_mm": 0.4, "total_precip_mm": 0.6,
		}},
		Raw: map[string]observations.RawObservation{
			"weather_forecast_raw":     {Dataset: "weather_forecast_raw", ObservedAt: now.Add(-30 * time.Minute), Payload: map[string]any{"request_url": "https://opendata.fmi.fi/forecast", "content_type": "application/xml"}},
			"weather_observations_raw": {Dataset: "weather_observations_raw", ObservedAt: now.Add(-20 * time.Minute), Payload: map[string]any{}},
		},
	}
	database := &weatherDatabase{sourceDatabase: sourceDatabase{active: true}, data: data}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?city=helsinki", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.Location == nil || *payload.Location != "helsinki" || len(payload.Points) != 2 {
		t.Fatalf("unexpected weather payload: %#v", payload)
	}
	if payload.TimeScope["mode"] != "live" || len(payload.SourceRequests) != 4 {
		t.Fatalf("unexpected weather scope or source requests: %#v", payload)
	}
}

func TestWeatherForecastAppliesHistoricalWindow(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &weatherDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: observations.WeatherData{Outlook: &observations.NormalizedEvent{
			SourceCode: "fmi", LocationRef: "helsinki", StartsAt: now.Add(-24 * time.Hour), EndsAt: now.Add(24 * time.Hour),
			Attributes: map[string]any{"forecast_points": []any{
				map[string]any{"timestamp": "2026-08-20T10:00:00+00:00", "temperature_c": 15.0},
				map[string]any{"timestamp": "2026-08-21T10:00:00+00:00", "temperature_c": 20.0},
			}},
		}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.TimeScope["mode"] != "historical" || payload.TimeScope["date"] != "2026-08-20" || len(payload.Points) != 1 {
		t.Fatalf("unexpected historical payload: %#v", payload)
	}
	if database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil {
		t.Fatalf("weather reader did not receive a historical window: %#v", database.lastQuery)
	}
}

func TestWeatherForecastRejectsUnsupportedCity(t *testing.T) {
	cfg := config.DefaultConfig()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast?city=stockholm", nil)
	New(cfg, fakeDatabase{}).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "City is not configured for city-scoped data.") {
		t.Fatalf("unexpected error body: %s", recorder.Body.String())
	}
}

func TestWeatherForecastDegradesToUnavailableOnDatabaseError(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &weatherDatabase{sourceDatabase: sourceDatabase{active: true}, err: context.DeadlineExceeded}
	server := New(cfg, database)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/weather/forecast", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload weather.Forecast
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "unavailable" || payload.Summary == nil {
		t.Fatalf("unexpected unavailable payload: %#v", payload)
	}
}

func TestAirQualityCurrentBuildsStationsAndMetrics(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &airQualityDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: airquality.Data{
			Event: &observations.NormalizedEvent{
				SourceCode: "hsy", LocationRef: "helsinki", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(2 * time.Hour),
				Summary:    "Two stations reported; air quality is poor at Mannerheimintie.",
				Attributes: map[string]any{"worst_score": 4.0, "worst_label": "poor", "worst_station": "Mannerheimintie"},
			},
			HSYRaw: observations.RawObservation{
				Dataset: "air_quality_current", AreaCode: "helsinki", ObservedAt: now.Add(-20 * time.Minute),
				Payload: map[string]any{
					"request_url": "https://kartta.hsy.fi/geoserver/ilmanlaatu/wfs", "content_type": "application/json",
					"body": map[string]any{"features": []any{
						map[string]any{"geometry": map[string]any{"coordinates": []any{24.94, 60.17}}, "properties": map[string]any{"station": "Mannerheimintie", "air_quality": "poor", "pm2_5": 12.4, "pm10": 29.8, "no2": 42.0}},
						map[string]any{"geometry": map[string]any{"coordinates": []any{24.81, 60.22}}, "properties": map[string]any{"station": "Leppavaara", "air_quality": "fair", "pm2_5": 5.2, "pm10": 14.0, "no2": 18.0}},
					}},
				},
			},
		},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/air-quality/current?city=helsinki", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload airquality.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.WorstScore == nil || *payload.WorstScore != 4 || len(payload.Stations) != 2 {
		t.Fatalf("unexpected air-quality payload: %#v", payload)
	}
	if payload.Stations[0].Station != "Mannerheimintie" || payload.Stations[0].Score == nil || *payload.Stations[0].Score != 4 {
		t.Fatalf("unexpected station ordering: %#v", payload.Stations)
	}
	if payload.Quality.ReportingStationCount != 2 || payload.Quality.FieldCoveragePct != 100 {
		t.Fatalf("unexpected quality: %#v", payload.Quality)
	}
}

func TestAirQualityCurrentAppliesHistoricalWindow(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &airQualityDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/air-quality/current?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
	var payload airquality.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "empty" || payload.TimeScope["mode"] != "historical" {
		t.Fatalf("unexpected historical payload: %#v", payload)
	}
}

func TestEnergyCurrentBuildsPriceWindowAndHouseholdCost(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	prices := []any{}
	for hour, value := range []float64{8.2, 3.1, 3.4, 12.0} {
		prices = append(prices, map[string]any{
			"startDate": now.Add(time.Duration(hour) * time.Hour).Format(time.RFC3339),
			"endDate":   now.Add(time.Duration(hour+1) * time.Hour).Format(time.RFC3339),
			"price":     value,
		})
	}
	database := &energyDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: energy.Data{Price: observations.RawObservation{Dataset: energy.PriceDataset, AreaCode: "helsinki", ObservedAt: now, Payload: map[string]any{
			"request_url": "https://api.porssisahko.net/v2/latest-prices.json", "content_type": "application/json",
			"body": map[string]any{"unit": energy.PriceUnit, "prices": prices},
		}}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/energy/current?source=porssisahko", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload energy.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || payload.SourceCode != energy.PriceSourceCode || payload.CurrentWindow == nil || payload.CurrentWindow.EstimatedCostEUR == nil {
		t.Fatalf("unexpected energy payload: %#v", payload)
	}
	if payload.CurrentWindow.AverageValue != 3.25 || *payload.CurrentWindow.EstimatedCostEUR != 0.065 || len(payload.Points) != 4 {
		t.Fatalf("unexpected energy values: %#v", payload)
	}
	if database.lastQuery == nil || database.lastQuery.WindowStart == nil || database.lastQuery.WindowEnd == nil || database.lastQuery.SourceCode != energy.PriceSourceCode {
		t.Fatalf("unexpected energy query: %#v", database.lastQuery)
	}
}

func TestEnergyCurrentRejectsUnknownSource(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/energy/current?source=unknown", nil)
	New(config.DefaultConfig(), fakeDatabase{}).Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), "source must be fingrid or porssisahko") {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestTrafficCurrentBuildsIncidentsAndCorridors(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &trafficDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: traffic.Data{
			Raw: []observations.RawObservation{{
				Dataset: "traffic_messages", AreaCode: "finland", ObservedAt: now.Add(-20 * time.Minute),
				Payload: map[string]any{
					"message_type": "roadworks", "request_url": "https://tie.digitraffic.fi/api/v3/traffic-message/v3/messages", "content_type": "application/json",
					"body": map[string]any{"features": []any{map[string]any{
						"geometry":   map[string]any{"bbox": []any{24.8, 60.1, 24.9, 60.2}},
						"properties": map[string]any{"situationId": "sit-1", "situationType": "ROADWORKS", "releaseTime": "2026-08-21T13:30:00Z", "announcements": []any{map[string]any{"language": "en", "title": "Roadworks on Ring I", "location": map[string]any{"description": "Ring I"}}}},
					}}, "feature_count_returned": 1},
				},
			}},
			Events: []observations.NormalizedEvent{{
				ID: "event-1", EventType: "road_disruption", SourceCode: "digitraffic", Severity: "HIGH", LocationRef: "road-ring-i", StartsAt: now.Add(-30 * time.Minute), EndsAt: now.Add(2 * time.Hour), Title: "Roadworks on Ring I", Summary: "One lane is closed.",
				Attributes: map[string]any{"situation_id": "sit-1", "situation_type": "ROADWORKS", "message_type": "roadworks", "location_description": "Ring I", "geometry_bbox": []any{24.8, 60.1, 24.9, 60.2}, "feature_names": []any{"Road 100"}},
			}, {
				ID: "event-2", EventType: "road_weather_risk", SourceCode: "digitraffic", Severity: "MEDIUM", LocationRef: "road-ring-i", StartsAt: now.Add(-time.Hour), EndsAt: now.Add(time.Hour), Title: "Slippery road", Summary: "Road surface may be slippery.",
				Attributes: map[string]any{},
			}},
		},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/traffic/current", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload traffic.Current
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "ready" || len(payload.Incidents) != 2 || len(payload.Corridors) != 1 || payload.Quality.ActiveEventCount != 2 {
		t.Fatalf("unexpected traffic payload: %#v", payload)
	}
	if payload.Corridors[0].Key != "road-ring-i" || payload.Corridors[0].WeatherRiskCount != 1 || payload.Incidents[0].Severity != "HIGH" {
		t.Fatalf("unexpected traffic details: %#v", payload)
	}
}

func TestTrafficCurrentAppliesHistoricalScope(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &trafficDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/traffic/current?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || database.lastQuery == nil || database.lastQuery.WindowStart == nil || !database.lastQuery.Historical {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
}

func TestPlatformOverviewBuildsCategoriesAndCityCoverage(t *testing.T) {
	cfg := config.DefaultConfig()
	now := time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC)
	database := &platformDatabase{
		sourceDatabase: sourceDatabase{active: true},
		data: platform.PlatformData{Events: []observations.NormalizedEvent{{
			ID: "weather-event", EventType: "weather_outlook", SourceCode: "fmi", Severity: "MEDIUM", LocationRef: "espoo", StartsAt: now, EndsAt: now.Add(6 * time.Hour), Title: "Cloudy", Summary: "Cloudy with moderate wind.", Attributes: map[string]any{"min_temp_c": 10.0, "max_temp_c": 14.0},
		}}},
	}
	server := New(cfg, database)
	server.now = func() time.Time { return now }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/overview?city=espoo", nil)
	server.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", recorder.Code, recorder.Body.String())
	}
	var payload platform.Overview
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.CoverageArea != "Espoo/Uusimaa" || len(payload.Categories) != 10 || len(payload.RecentEvents) != 1 {
		t.Fatalf("unexpected platform overview: coverage=%q categories=%d recent=%d", payload.CoverageArea, len(payload.Categories), len(payload.RecentEvents))
	}
	if payload.Categories[0].Key != "weather" || payload.Categories[0].Events[0].Title != "Cloudy" {
		t.Fatalf("unexpected weather category: %#v", payload.Categories[0])
	}
}

func TestPlatformOverviewAppliesHistoricalScope(t *testing.T) {
	cfg := config.DefaultConfig()
	database := &platformDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, database)
	server.now = func() time.Time { return time.Date(2026, 8, 21, 14, 0, 0, 0, time.UTC) }
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/platform/overview?date=2026-08-20", nil)
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || database.lastQuery == nil || !database.lastQuery.Historical || database.lastQuery.WindowStart == nil {
		t.Fatalf("status = %d; query = %#v; body = %s", recorder.Code, database.lastQuery, recorder.Body.String())
	}
}

func TestValidateLocationPayloadRejectsOutOfBoundsAndBlankValues(t *testing.T) {
	valid := locationPayload{UserID: "user-1", Label: "Home", CountryCode: "FI", City: "Helsinki", Latitude: 60.17, Longitude: 24.94}
	if !validateLocationPayload(valid, true) {
		t.Fatal("expected a well-formed payload to pass")
	}
	if validateLocationPayload(valid, false) != true {
		t.Fatal("expected requireUserID=false to still accept a payload that happens to have one")
	}

	withoutUserID := valid
	withoutUserID.UserID = ""
	if validateLocationPayload(withoutUserID, true) {
		t.Fatal("expected a missing user_id to fail when required")
	}
	if !validateLocationPayload(withoutUserID, false) {
		t.Fatal("expected a missing user_id to be fine when not required (e.g. on update)")
	}

	cases := []struct {
		name    string
		mutate  func(locationPayload) locationPayload
		wantErr bool
	}{
		{"blank label", func(p locationPayload) locationPayload { p.Label = "  "; return p }, true},
		{"label too long", func(p locationPayload) locationPayload { p.Label = strings.Repeat("a", 41); return p }, true},
		{"country code too short", func(p locationPayload) locationPayload { p.CountryCode = "F"; return p }, true},
		{"country code too long", func(p locationPayload) locationPayload { p.CountryCode = "FIN"; return p }, true},
		{"blank city", func(p locationPayload) locationPayload { p.City = " "; return p }, true},
		{"city too long", func(p locationPayload) locationPayload { p.City = strings.Repeat("a", 81); return p }, true},
		{"latitude too high", func(p locationPayload) locationPayload { p.Latitude = 90.1; return p }, true},
		{"latitude too low", func(p locationPayload) locationPayload { p.Latitude = -90.1; return p }, true},
		{"longitude too high", func(p locationPayload) locationPayload { p.Longitude = 180.1; return p }, true},
		{"longitude too low", func(p locationPayload) locationPayload { p.Longitude = -180.1; return p }, true},
		{"boundary latitude/longitude accepted", func(p locationPayload) locationPayload { p.Latitude, p.Longitude = 90, -180; return p }, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := validateLocationPayload(testCase.mutate(valid), true)
			if got == testCase.wantErr {
				t.Fatalf("validateLocationPayload = %v, wantErr %v", got, testCase.wantErr)
			}
		})
	}
}

func TestValidateCommutePayloadRejectsInvalidModeWeekdaysAndClock(t *testing.T) {
	valid := commutePayload{UserID: "user-1", Name: "Work", OriginLocationID: "loc-a", DestinationLocationID: "loc-b", PreferredMode: "TRANSIT", DepartureTimeLocal: "07:30", Weekdays: []int{1, 2, 3, 4, 5}}
	if !validateCommutePayload(valid, true) {
		t.Fatal("expected a well-formed payload to pass")
	}

	blankMode := valid
	blankMode.PreferredMode = ""
	if !validateCommutePayload(blankMode, true) {
		t.Fatal("expected a blank preferred mode to default to TRANSIT and pass")
	}

	cases := []struct {
		name   string
		mutate func(commutePayload) commutePayload
	}{
		{"blank name", func(p commutePayload) commutePayload { p.Name = " "; return p }},
		{"name too long", func(p commutePayload) commutePayload { p.Name = strings.Repeat("a", 81); return p }},
		{"same origin and destination", func(p commutePayload) commutePayload { p.DestinationLocationID = p.OriginLocationID; return p }},
		{"malformed departure time", func(p commutePayload) commutePayload { p.DepartureTimeLocal = "7:30"; return p }},
		{"no weekdays", func(p commutePayload) commutePayload { p.Weekdays = nil; return p }},
		{"weekday out of range low", func(p commutePayload) commutePayload { p.Weekdays = []int{0}; return p }},
		{"weekday out of range high", func(p commutePayload) commutePayload { p.Weekdays = []int{8}; return p }},
		{"unsupported preferred mode", func(p commutePayload) commutePayload { p.PreferredMode = "FLY"; return p }},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if validateCommutePayload(testCase.mutate(valid), true) {
				t.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}

	duplicateWeekdays := valid
	duplicateWeekdays.Weekdays = []int{1, 1, 1}
	if !validateCommutePayload(duplicateWeekdays, true) {
		t.Fatal("expected duplicate weekdays to still pass (deduplicated, non-empty)")
	}
}

func TestRequireOwnUserRejectsBlankOrMismatchedIDs(t *testing.T) {
	if err := requireOwnUser("user-1", "user-1"); err != nil {
		t.Fatalf("expected no error for a matching user, got %v", err)
	}
	if err := requireOwnUser("user-1", "  "); err == nil {
		t.Fatal("expected an error for a blank requested user_id")
	}
	if err := requireOwnUser("user-1", "user-2"); err == nil {
		t.Fatal("expected an error when the requested user differs from the authenticated one")
	}
}

func TestValidScenarioAcceptsBothCases(t *testing.T) {
	for _, value := range []string{"commute", "outdoor", "home_air", "energy", "COMMUTE", "OUTDOOR", "HOME_AIR", "ENERGY"} {
		if !validScenario(value) {
			t.Fatalf("expected %q to be a valid scenario", value)
		}
	}
	for _, value := range []string{"", "Commute", "unknown", "commute "} {
		if validScenario(value) {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestValidClockAcceptsNilAndHHMMOnly(t *testing.T) {
	if !validClock(nil) {
		t.Fatal("expected nil to be valid (no preference set)")
	}
	blank := ""
	if !validClock(&blank) {
		t.Fatal("expected an empty string to be valid")
	}
	for _, value := range []string{"07:30", "00:00", "23:59"} {
		v := value
		if !validClock(&v) {
			t.Fatalf("expected %q to be a valid clock value", value)
		}
	}
	for _, value := range []string{"7:30", "07-30", "24:00", "07:60", "0730", "ab:cd"} {
		v := value
		if validClock(&v) {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestBoolOrFallsBackOnlyWhenNil(t *testing.T) {
	yes := true
	if !boolOr(&yes, false) {
		t.Fatal("expected the pointer's value to win over the fallback")
	}
	if !boolOr(nil, true) {
		t.Fatal("expected the fallback when the pointer is nil")
	}
}

func TestDecodeRequestRejectsInvalidJSONWithUnprocessableEntity(t *testing.T) {
	var destination map[string]string
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{not json"))
	if ok := decodeRequest(recorder, request, &destination); ok {
		t.Fatal("expected decodeRequest to report failure for invalid JSON")
	}
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", recorder.Code)
	}

	recorder2 := httptest.NewRecorder()
	request2 := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"a":"b"}`))
	var target map[string]string
	if ok := decodeRequest(recorder2, request2, &target); !ok || target["a"] != "b" {
		t.Fatalf("expected successful decode, ok=%v target=%v", ok, target)
	}
}

func TestMethodNotAllowedWritesStatusAndAllowHeader(t *testing.T) {
	recorder := httptest.NewRecorder()
	methodNotAllowed(recorder)
	if recorder.Code != http.StatusMethodNotAllowed || recorder.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("status = %d, Allow = %q", recorder.Code, recorder.Header().Get("Allow"))
	}
}

func TestLoginRateLimitKeyFallsBackWhenRemoteAddrHasNoPort(t *testing.T) {
	withPort := httptest.NewRequest(http.MethodPost, "/", nil)
	withPort.RemoteAddr = "203.0.113.5:54321"
	if got := loginRateLimitKey(withPort); got != "login:203.0.113.5" {
		t.Fatalf("expected the host without its port, got %q", got)
	}

	withoutPort := httptest.NewRequest(http.MethodPost, "/", nil)
	withoutPort.RemoteAddr = "203.0.113.5" // no ":port" -- net.SplitHostPort fails, so the raw value is used
	if got := loginRateLimitKey(withoutPort); got != "login:203.0.113.5" {
		t.Fatalf("expected the raw RemoteAddr as a fallback, got %q", got)
	}
}

func TestWithCORSSetsHeadersForAllowedOriginAndHandlesPreflight(t *testing.T) {
	next := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) { writer.WriteHeader(http.StatusOK) })
	handler := withCORS(next, []string{"https://example.com"})

	allowed := httptest.NewRecorder()
	allowedRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	allowedRequest.Header.Set("Origin", "https://example.com")
	handler.ServeHTTP(allowed, allowedRequest)
	if allowed.Header().Get("Access-Control-Allow-Origin") != "https://example.com" || allowed.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("expected CORS headers for an allowed origin: %#v", allowed.Header())
	}
	if allowed.Code != http.StatusOK {
		t.Fatalf("expected the request to still reach the handler, got %d", allowed.Code)
	}

	disallowed := httptest.NewRecorder()
	disallowedRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	disallowedRequest.Header.Set("Origin", "https://evil.example")
	handler.ServeHTTP(disallowed, disallowedRequest)
	if disallowed.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("expected no CORS header for a disallowed origin, got %q", disallowed.Header().Get("Access-Control-Allow-Origin"))
	}
	if disallowed.Code != http.StatusOK {
		t.Fatalf("expected the request to still reach the handler even without CORS headers, got %d", disallowed.Code)
	}

	preflight := httptest.NewRecorder()
	preflightRequest := httptest.NewRequest(http.MethodOptions, "/", nil)
	preflightRequest.Header.Set("Origin", "https://example.com")
	handler.ServeHTTP(preflight, preflightRequest)
	if preflight.Code != http.StatusNoContent {
		t.Fatalf("expected a 204 preflight response, got %d", preflight.Code)
	}
	if preflight.Header().Get("Access-Control-Allow-Methods") == "" || preflight.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("expected preflight-specific headers to be set: %#v", preflight.Header())
	}

	passthrough := withCORS(next, nil)
	bare := httptest.NewRecorder()
	passthrough.ServeHTTP(bare, httptest.NewRequest(http.MethodGet, "/", nil))
	if bare.Code != http.StatusOK {
		t.Fatalf("expected no configured origins to just pass through, got %d", bare.Code)
	}
}
