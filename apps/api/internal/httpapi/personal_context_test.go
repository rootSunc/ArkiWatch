package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func TestPersonalContextAggregationAndWrites(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	db := &profileDatabase{sourceDatabase: sourceDatabase{active: true}}
	server := New(cfg, db)
	server.now = func() time.Time { return time.Unix(2000000001, 0).UTC() }
	for _, c := range []struct {
		method, body string
		status       int
	}{
		{"GET", "", 200},
		{"POST", `{"resource":"locations","payload":{"label":"Home","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}}`, 201},
		{"POST", `{"resource":"locations","payload":{"id":"loc-1","label":"Office","country_code":"FI","city":"Helsinki","lat":60.17,"lon":24.94}}`, 200},
		{"POST", `{"resource":"locations","payload":{"user_id":"another-user"}}`, 403},
		{"POST", `{"resource":"locations","payload":{"label":"Home","country_code":"FI","city":"Helsinki","lat":999,"lon":24.94}}`, 422},
		{"POST", `{"resource":"locations","payload":{"id":"../loc"}}`, 400},
		{"POST", `{"resource":"preferences","payload":{"id":"pref-1"}}`, 400},
		{"POST", `{"resource":"unknown","payload":{}}`, 400},
		{"POST", `{"resource":"locations","payload":null}`, 400},
	} {
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, bearerRequest(c.method, "/api/me/context", c.body))
		if w.Code != c.status {
			t.Errorf("%s %s: got %d %s", c.method, c.body, w.Code, w.Body.String())
		}
		if c.method == "GET" && !strings.Contains(w.Body.String(), `"commuteProfiles"`) {
			t.Fatal(w.Body.String())
		}
	}
	unauth := httptest.NewRecorder()
	server.Handler().ServeHTTP(unauth, httptest.NewRequest(http.MethodGet, "/api/me/context", nil))
	if unauth.Code != 401 {
		t.Fatal(unauth.Code)
	}
}
