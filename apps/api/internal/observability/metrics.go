// Package observability provides the request-level instrumentation the service
// exposes: a Prometheus registry and structured access logging.
package observability

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// PrometheusContentType is the exposition format version /api/metrics serves.
const PrometheusContentType = "text/plain; version=0.0.4; charset=utf-8"

type requestKey struct {
	method, route, status string
}

// Registry accumulates request counters and latency totals.
//
// Series are keyed by the matched route rather than the raw path, so a
// high-cardinality identifier in a URL cannot grow the metric set without
// bound.
type Registry struct {
	appName, version, buildSHA string
	enabled                    bool
	startedAt                  time.Time

	mutex       sync.Mutex
	requests    map[requestKey]uint64
	durationSum map[requestKey]float64
	inFlight    int64
}

func NewRegistry(appName, version, buildSHA string, enabled bool) *Registry {
	return &Registry{
		appName:     appName,
		version:     version,
		buildSHA:    buildSHA,
		enabled:     enabled,
		startedAt:   time.Now().UTC(),
		requests:    map[requestKey]uint64{},
		durationSum: map[requestKey]float64{},
	}
}

func (registry *Registry) Enabled() bool { return registry != nil && registry.enabled }

func (registry *Registry) StartRequest() {
	if !registry.Enabled() {
		return
	}
	registry.mutex.Lock()
	registry.inFlight++
	registry.mutex.Unlock()
}

func (registry *Registry) ObserveRequest(method, route string, statusCode int, duration time.Duration) {
	if !registry.Enabled() {
		return
	}
	key := requestKey{method: strings.ToUpper(method), route: route, status: strconv.Itoa(statusCode)}
	registry.mutex.Lock()
	registry.requests[key]++
	registry.durationSum[key] += duration.Seconds()
	registry.inFlight--
	registry.mutex.Unlock()
}

// Render writes the Prometheus exposition text for everything collected so far.
func (registry *Registry) Render() string {
	if registry == nil {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("# HELP arkiwatch_api_info ArkiWatch API build information.\n")
	builder.WriteString("# TYPE arkiwatch_api_info gauge\n")
	fmt.Fprintf(&builder, "arkiwatch_api_info{backend=\"go\",app=%q,version=%q,build_sha=%q} 1\n", registry.appName, registry.version, registry.buildSHA)

	builder.WriteString("# HELP arkiwatch_api_uptime_seconds Seconds since the API process started.\n")
	builder.WriteString("# TYPE arkiwatch_api_uptime_seconds gauge\n")
	fmt.Fprintf(&builder, "arkiwatch_api_uptime_seconds %s\n", formatFloat(time.Since(registry.startedAt).Seconds()))

	if !registry.enabled {
		return builder.String()
	}

	registry.mutex.Lock()
	keys := make([]requestKey, 0, len(registry.requests))
	for key := range registry.requests {
		keys = append(keys, key)
	}
	requests := make(map[requestKey]uint64, len(registry.requests))
	durations := make(map[requestKey]float64, len(registry.durationSum))
	for key, value := range registry.requests {
		requests[key] = value
	}
	for key, value := range registry.durationSum {
		durations[key] = value
	}
	inFlight := registry.inFlight
	registry.mutex.Unlock()

	sort.Slice(keys, func(i, j int) bool {
		if keys[i].route != keys[j].route {
			return keys[i].route < keys[j].route
		}
		if keys[i].method != keys[j].method {
			return keys[i].method < keys[j].method
		}
		return keys[i].status < keys[j].status
	})

	builder.WriteString("# HELP arkiwatch_api_requests_total Total HTTP requests handled.\n")
	builder.WriteString("# TYPE arkiwatch_api_requests_total counter\n")
	for _, key := range keys {
		fmt.Fprintf(&builder, "arkiwatch_api_requests_total{method=%q,route=%q,status=%q} %d\n", key.method, key.route, key.status, requests[key])
	}

	builder.WriteString("# HELP arkiwatch_api_request_duration_seconds_sum Total time spent handling HTTP requests.\n")
	builder.WriteString("# TYPE arkiwatch_api_request_duration_seconds_sum counter\n")
	for _, key := range keys {
		fmt.Fprintf(&builder, "arkiwatch_api_request_duration_seconds_sum{method=%q,route=%q,status=%q} %s\n", key.method, key.route, key.status, formatFloat(durations[key]))
	}

	builder.WriteString("# HELP arkiwatch_api_requests_in_flight HTTP requests currently being handled.\n")
	builder.WriteString("# TYPE arkiwatch_api_requests_in_flight gauge\n")
	fmt.Fprintf(&builder, "arkiwatch_api_requests_in_flight %d\n", inFlight)

	return builder.String()
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}
