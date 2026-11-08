package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/auth"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/database"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authTokenResponse struct {
	AccessToken string     `json:"access_token"`
	TokenType   string     `json:"token_type"`
	ExpiresAt   time.Time  `json:"expires_at"`
	User        users.User `json:"user"`
}

type authFailure struct {
	status int
	detail string
	bearer bool
}

func (s *Server) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if s.admin == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	var payload loginRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || strings.TrimSpace(payload.Username) == "" || payload.Password == "" {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Invalid login payload."})
		return
	}

	if !auth.VerifyAdminCredentials(payload.Username, payload.Password, s.cfg) {
		decision := s.loginLimiter.Check(
			loginRateLimitKey(request),
			s.cfg.LoginRateLimitRequests,
			time.Duration(s.cfg.LoginRateLimitWindowSeconds)*time.Second,
			s.now(),
		)
		if !decision.Allowed {
			writer.Header().Set("Retry-After", strconv.Itoa(decision.RetryAfterSeconds))
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"detail": "Too many failed login attempts. Please try again shortly."})
			return
		}
		writer.Header().Set("WWW-Authenticate", "Bearer")
		writeJSON(writer, http.StatusUnauthorized, map[string]string{"detail": "Invalid username or password."})
		return
	}

	user, err := s.admin.GetOrCreateAdminUser(request.Context(), s.cfg)
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	accessToken, expiresAt := auth.CreateAccessToken(user, s.cfg, s.now())
	writeJSON(writer, http.StatusOK, authTokenResponse{
		AccessToken: accessToken,
		TokenType:   "bearer",
		ExpiresAt:   expiresAt,
		User:        user,
	})
}

func (s *Server) authMe(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	writeJSON(writer, http.StatusOK, user)
}

func (s *Server) optionalCurrentUser(request *http.Request) (*users.User, *authFailure) {
	if _, ok := bearerToken(request); !ok {
		return nil, nil
	}
	user, failure := s.currentUser(request)
	if failure != nil {
		return nil, failure
	}
	return &user, nil
}

func requireOwnUser(currentID, requestedID string) error {
	requestedID = strings.TrimSpace(requestedID)
	if requestedID == "" {
		return errors.New("user_id is required.")
	}
	if requestedID != currentID {
		return errors.New("Authenticated user cannot modify another user's resources.")
	}
	return nil
}

func (s *Server) currentUser(request *http.Request) (users.User, *authFailure) {
	if s.users == nil {
		return users.User{}, &authFailure{status: http.StatusServiceUnavailable, detail: "Database is unavailable."}
	}
	token, ok := bearerToken(request)
	if !ok {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authentication is required.", bearer: true}
	}
	claims, err := auth.DecodeAccessToken(token, s.cfg, s.now().UTC())
	if err != nil {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: err.Error(), bearer: true}
	}
	user, err := s.users.GetUser(request.Context(), claims.Subject)
	if err != nil {
		if database.IsNotFound(err) {
			return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authenticated user is not available.", bearer: true}
		}
		return users.User{}, &authFailure{status: http.StatusServiceUnavailable, detail: "Database is unavailable."}
	}
	if user.Status != "ACTIVE" {
		return users.User{}, &authFailure{status: http.StatusUnauthorized, detail: "Authenticated user is not available.", bearer: true}
	}
	return user, nil
}

func writeAuthFailure(writer http.ResponseWriter, failure *authFailure) {
	if failure.bearer {
		writer.Header().Set("WWW-Authenticate", "Bearer")
	}
	writeJSON(writer, failure.status, map[string]string{"detail": failure.detail})
}

func loginRateLimitKey(request *http.Request) string {
	host := requestClientIP(request)
	if host == "" {
		host = "unknown"
	}
	return "login:" + host
}

func requestClientIP(request *http.Request) string {
	host := remoteHost(request.RemoteAddr)
	if isLoopback(host) {
		if forwarded := forwardedClientIP(request); forwarded != "" {
			return forwarded
		}
	}
	return host
}

func remoteHost(value string) string {
	host, _, err := net.SplitHostPort(value)
	if err != nil || host == "" {
		return value
	}
	return host
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func forwardedClientIP(request *http.Request) string {
	header := strings.TrimSpace(request.Header.Get("X-Forwarded-For"))
	if header == "" {
		header = strings.TrimSpace(request.Header.Get("X-Real-IP"))
	}
	first := strings.TrimSpace(strings.Split(header, ",")[0])
	if ip := net.ParseIP(first); ip != nil {
		return ip.String()
	}
	return ""
}

func bearerToken(request *http.Request) (string, bool) {
	parts := strings.Fields(request.Header.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}
