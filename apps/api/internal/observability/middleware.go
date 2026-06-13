package observability

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// Options configures the request middleware.
type Options struct {
	RequestIDHeader string
	RequestLogging  bool
	Routes          []string
}

// NewLogger builds the process logger. JSON is the default because the service
// runs behind a log collector; "text" stays available for local work.
func NewLogger(level, format string) *slog.Logger {
	var slogLevel slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		slogLevel = slog.LevelDebug
	case "warn", "warning":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}
	handlerOptions := &slog.HandlerOptions{Level: slogLevel}
	if strings.EqualFold(strings.TrimSpace(format), "text") {
		return slog.New(slog.NewTextHandler(os.Stdout, handlerOptions))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, handlerOptions))
}

// statusRecorder captures the status code and body size the handler produced,
// which http.ResponseWriter does not expose on its own.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written int
}

func (recorder *statusRecorder) WriteHeader(status int) {
	if recorder.status == 0 {
		recorder.status = status
	}
	recorder.ResponseWriter.WriteHeader(status)
}

func (recorder *statusRecorder) Write(payload []byte) (int, error) {
	if recorder.status == 0 {
		recorder.status = http.StatusOK
	}
	written, err := recorder.ResponseWriter.Write(payload)
	recorder.written += written
	return written, err
}

// Flush forwards to the wrapped writer so server-sent-event handlers keep
// streaming through the middleware.
func (recorder *statusRecorder) Flush() {
	if flusher, ok := recorder.ResponseWriter.(http.Flusher); ok {
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}
		flusher.Flush()
	}
}

// Middleware records one metric series and one access log line per request, and
// echoes a request id so a log line can be tied back to a client report.
func Middleware(next http.Handler, registry *Registry, logger *slog.Logger, options Options) http.Handler {
	matcher := newRouteMatcher(options.Routes)
	header := strings.TrimSpace(options.RequestIDHeader)
	if header == "" {
		header = "X-Request-ID"
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestID := strings.TrimSpace(request.Header.Get(header))
		if requestID == "" {
			requestID = newRequestID()
		}
		writer.Header().Set(header, requestID)

		recorder := &statusRecorder{ResponseWriter: writer}
		route := matcher.match(request.URL.Path)
		started := time.Now()
		registry.StartRequest()
		next.ServeHTTP(recorder, request)
		duration := time.Since(started)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}
		registry.ObserveRequest(request.Method, route, recorder.status, duration)

		if options.RequestLogging && logger != nil {
			logger.Info("http_request",
				slog.String("request_id", requestID),
				slog.String("method", request.Method),
				slog.String("route", route),
				slog.Int("status", recorder.status),
				slog.Int("bytes", recorder.written),
				slog.Float64("duration_ms", float64(duration.Microseconds())/1000),
			)
		}
	})
}

func newRequestID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "req-" + time.Now().UTC().Format("20060102150405.000000")
	}
	return hex.EncodeToString(bytes[:])
}

// routeMatcher maps a request path back to the registered route pattern.
//
// Labelling metrics with the raw path would create a new time series per
// location id or event id, so an unrecognised path collapses to "other".
type routeMatcher struct {
	exact    map[string]struct{}
	prefixes []string
}

func newRouteMatcher(routes []string) routeMatcher {
	matcher := routeMatcher{exact: map[string]struct{}{}}
	for _, route := range routes {
		if strings.HasSuffix(route, "/") && route != "/" {
			matcher.prefixes = append(matcher.prefixes, route)
			continue
		}
		matcher.exact[route] = struct{}{}
	}
	// Longer prefixes win, so /api/platform/history/ is not shadowed by a
	// shorter registration.
	for index := 1; index < len(matcher.prefixes); index++ {
		for inner := index; inner > 0 && len(matcher.prefixes[inner]) > len(matcher.prefixes[inner-1]); inner-- {
			matcher.prefixes[inner], matcher.prefixes[inner-1] = matcher.prefixes[inner-1], matcher.prefixes[inner]
		}
	}
	return matcher
}

func (matcher routeMatcher) match(path string) string {
	if _, ok := matcher.exact[path]; ok {
		return path
	}
	for _, prefix := range matcher.prefixes {
		if strings.HasPrefix(path, prefix) {
			return prefix + "{id}"
		}
	}
	if path == "/" {
		return "/"
	}
	return "other"
}
