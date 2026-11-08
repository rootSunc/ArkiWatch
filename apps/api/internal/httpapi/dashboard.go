package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
)

func (s *Server) listRecommendations(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	userID := strings.TrimSpace(request.URL.Query().Get("user_id"))
	if userID == "" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "user_id is required."})
		return
	}
	if user.ID != userID {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Authenticated user cannot modify another user's resources."})
		return
	}
	if s.recommendations == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	limit := 20
	if rawLimit := request.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 1 || parsed > 100 {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "limit must be between 1 and 100."})
			return
		}
		limit = parsed
	}
	items, err := s.recommendations.ListRecommendations(request.Context(), userID, limit)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	payload := make([]map[string]any, 0, len(items))
	for _, item := range items {
		payload = append(payload, item.API())
	}
	writeJSON(writer, http.StatusOK, payload)
}

func (s *Server) listNotifications(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.profiles == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	limit := 50
	if value := request.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 200 {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "limit must be between 1 and 200."})
			return
		}
		limit = parsed
	}
	if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	items, err := s.profiles.ListNotifications(request.Context(), user.ID, limit)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, items)
}

func (s *Server) todaySummary(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.today == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if err := requireOwnUser(user.ID, request.URL.Query().Get("user_id")); err != nil {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	result, err := s.today.LoadToday(request.Context(), user.ID, s.now().UTC())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "User not found."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

// cachedRead serves a read model from the short-lived cache when possible.
// Only anonymous, non-user-scoped payloads are cached, so no request can ever
// observe another user's data.
func (s *Server) cachedRead(key string, build func() (map[string]any, error)) (map[string]any, error) {
	if cached, ok := s.readCache.Get(key); ok {
		if payload, ok := cached.(map[string]any); ok {
			return payload, nil
		}
	}
	payload, err := build()
	if err != nil {
		return nil, err
	}
	s.readCache.Set(key, payload)
	return payload, nil
}

func (s *Server) publicDashboardHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	if s.publicDashboard == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	var targetDate *time.Time
	if value := strings.TrimSpace(request.URL.Query().Get("date")); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "date must use YYYY-MM-DD format."})
			return
		}
		targetDate = &parsed
	}
	cacheKey := "public_dashboard:live"
	if targetDate != nil {
		cacheKey = "public_dashboard:" + targetDate.UTC().Format("2006-01-02")
	}
	result, err := s.cachedRead(cacheKey, func() (map[string]any, error) {
		return s.publicDashboard.LoadPublicDashboard(request.Context(), targetDate, s.now().UTC())
	})
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) personalDashboardHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if s.personalDashboard == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	requested := strings.TrimSpace(request.URL.Query().Get("user_id"))
	if requested != "" && requested != user.ID {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Authenticated user cannot modify another user's resources."})
		return
	}
	result, err := s.personalDashboard.LoadPersonalDashboard(request.Context(), user.ID, s.now().UTC())
	if err != nil {
		if database.IsNotFound(err) {
			writeJSON(writer, http.StatusNotFound, map[string]string{"detail": "Requested user was not found."})
			return
		}
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	writeJSON(writer, http.StatusOK, result)
}
