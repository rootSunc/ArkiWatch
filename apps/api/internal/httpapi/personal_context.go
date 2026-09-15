package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/profile"
)

// personalContext keeps identity resolution, aggregation and resource dispatch
// behind the authenticated Go boundary. Resource handlers own their validation.
func (s *Server) personalContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user, failure := s.currentUser(r)
	if failure != nil {
		writeAuthFailure(w, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if r.Method == http.MethodGet {
		locations, err := s.profiles.ListLocations(r.Context(), user.ID)
		if err != nil {
			personalContextUnavailable(w)
			return
		}
		preferences, err := s.profiles.GetPreferences(r.Context(), user.ID)
		if err != nil {
			personalContextUnavailable(w)
			return
		}
		commutes, err := s.profiles.ListCommuteProfiles(r.Context(), user.ID)
		if err != nil {
			personalContextUnavailable(w)
			return
		}
		channels, err := s.profiles.ListChannels(r.Context(), user.ID)
		if err != nil {
			personalContextUnavailable(w)
			return
		}
		if locations == nil {
			locations = []profile.Location{}
		}
		if commutes == nil {
			commutes = []profile.CommuteProfile{}
		}
		if channels == nil {
			channels = []profile.Channel{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"locations": locations, "preferences": preferences, "commuteProfiles": commutes, "channels": channels})
		return
	}
	var body struct {
		Resource string                     `json:"resource"`
		Payload  map[string]json.RawMessage `json:"payload"`
	}
	if !decodeRequest(w, r, &body) {
		return
	}
	if body.Payload == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "A personal context payload is required."})
		return
	}
	// A client-supplied owner cannot override the verified identity.
	if raw, ok := body.Payload["user_id"]; ok {
		var requested string
		if json.Unmarshal(raw, &requested) != nil || requested != user.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Authenticated user cannot modify another user's resources."})
			return
		}
	}
	id := ""
	if raw, ok := body.Payload["id"]; ok && string(raw) != "null" {
		if json.Unmarshal(raw, &id) != nil || strings.TrimSpace(id) == "" || strings.ContainsAny(id, "/\\") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "A valid resource id is required."})
			return
		}
	}
	var path string
	var handler http.HandlerFunc
	switch body.Resource {
	case "locations":
		path = "/user/locations"
		handler = s.locations
		if id != "" {
			handler = s.locationByID
		}
	case "commuteProfiles":
		path = "/user/commute-profiles"
		handler = s.commuteProfiles
		if id != "" {
			handler = s.commuteProfileByID
		}
	case "preferences":
		path = "/user/preferences"
		handler = s.preferences
	case "channels":
		path = "/user/channels"
		handler = s.channels
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "A valid personal context resource is required."})
		return
	}
	if id != "" && body.Resource != "locations" && body.Resource != "commuteProfiles" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Only saved locations and commute profiles can be updated by id."})
		return
	}
	delete(body.Payload, "id")
	body.Payload["user_id"], _ = json.Marshal(user.ID)
	payload, err := json.Marshal(body.Payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid personal context payload."})
		return
	}
	method := http.MethodPost
	if id != "" {
		method = http.MethodPut
		path += "/" + url.PathEscape(id)
	}
	forwarded, err := http.NewRequestWithContext(r.Context(), method, s.cfg.APIPrefix+path, bytes.NewReader(payload))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "Invalid resource id."})
		return
	}
	forwarded.Header = r.Header.Clone()
	handler(w, forwarded)
}
func personalContextUnavailable(w http.ResponseWriter) {
	writeJSON(w, http.StatusServiceUnavailable, map[string]string{"detail": "Personal context could not be loaded."})
}
