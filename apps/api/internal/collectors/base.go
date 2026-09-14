package collectors

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Observation struct {
	Dataset    string
	AreaCode   string
	ObservedAt time.Time
	Payload    map[string]any
	Hash       string
}

type Collector interface {
	SourceCode() string
	Dataset() string
	Collect(context.Context) ([]Observation, error)
}

type RangeCollector interface {
	Collector
	CollectRange(context.Context, time.Time, time.Time, string, string) ([]Observation, error)
}

// maxResponseBytes caps a single collector response. The Helsinki Service Map
// unit index alone is well over 10 MB, so the ceiling has to clear that while
// still bounding memory for a misbehaving upstream.
const maxResponseBytes = 32 << 20

func BuildObservationHash(sourceCode, dataset, areaCode string, observedAt time.Time, payload map[string]any) (string, error) {
	canonical, err := json.Marshal(map[string]any{"source_code": sourceCode, "dataset": dataset, "area_code": areaCode, "observed_at": observedAt.UTC().Format(time.RFC3339Nano), "payload": payload})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(canonical)
	return hex.EncodeToString(digest[:]), nil
}

func CollectJSON(ctx context.Context, client *http.Client, method, endpoint string, headers map[string]string, query map[string]string) (map[string]any, http.Header, string, error) {
	return collectRequest(ctx, client, method, endpoint, headers, query, nil)
}

// CollectGraphQL posts a GraphQL document. Digitransit's routing API only
// answers POST with a JSON body, which the query-string path cannot express.
func CollectGraphQL(ctx context.Context, client *http.Client, endpoint string, headers map[string]string, document string, variables map[string]any) (map[string]any, http.Header, string, error) {
	request := map[string]any{"query": document}
	if len(variables) > 0 {
		request["variables"] = variables
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return nil, nil, "", err
	}
	return collectRequest(ctx, client, http.MethodPost, endpoint, headers, nil, encoded)
}

func collectRequest(ctx context.Context, client *http.Client, method, endpoint string, headers map[string]string, query map[string]string, requestBody []byte) (map[string]any, http.Header, string, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		var reader io.Reader
		if requestBody != nil {
			reader = bytes.NewReader(requestBody)
		}
		request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
		if err != nil {
			return nil, nil, "", err
		}
		if requestBody != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		values := request.URL.Query()
		for key, value := range query {
			values.Set(key, value)
		}
		request.URL.RawQuery = values.Encode()
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		response, err := client.Do(request)
		if err != nil {
			lastErr = err
			if attempt < 2 {
				time.Sleep(time.Duration(1<<attempt) * 100 * time.Millisecond)
				continue
			}
			break
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
		response.Body.Close()
		if readErr != nil {
			lastErr = readErr
			break
		}
		// A truncated body still parses as "no records" for several upstreams,
		// which would silently drop a whole source. Fail the run instead.
		if len(body) > maxResponseBytes {
			return nil, response.Header, "", fmt.Errorf("collector response exceeded %d bytes", maxResponseBytes)
		}
		if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
			lastErr = fmt.Errorf("collector request returned HTTP %d", response.StatusCode)
			if attempt < 2 {
				delay := retryAfter(response.Header.Get("Retry-After"), attempt)
				time.Sleep(delay)
				continue
			}
			break
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, response.Header, string(body), fmt.Errorf("collector request returned HTTP %d", response.StatusCode)
		}
		payload := decodeJSONBody(body)
		payload = sanitizeJSONMap(payload)
		return payload, response.Header, string(body), nil
	}
	return nil, nil, "", lastErr
}

// decodeJSONBody normalizes a response body into the map every collector and
// normalizer expects. Several upstreams (the Helsinki Service Map among them)
// answer with a top-level JSON array, which must be carried through as parsed
// values under "items" rather than stringified, or downstream normalization
// silently sees no records at all.
func decodeJSONBody(body []byte) map[string]any {
	payload := map[string]any{}
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return payload
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		return payload
	}
	var list []any
	if err := json.Unmarshal(body, &list); err == nil {
		return map[string]any{"items": list, "item_count": len(list)}
	}
	payload["raw"] = string(body)
	return payload
}

func retryAfter(value string, attempt int) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && seconds >= 0 && seconds <= 30 {
		return time.Duration(seconds) * time.Second
	}
	return time.Duration(1<<attempt) * 100 * time.Millisecond
}

func observedNow() time.Time { return time.Now().UTC() }

func payloadForRequest(body map[string]any, responseURL, contentType string) map[string]any {
	return map[string]any{"request_url": responseURL, "content_type": contentType, "body": body}
}

// client builds the outbound HTTP client for a collector run. The timeout is
// configurable because upstream open-data endpoints differ widely in latency.
func client(timeoutSeconds float64) *http.Client {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}
	return &http.Client{Timeout: time.Duration(timeoutSeconds * float64(time.Second))}
}

// PostgreSQL jsonb rejects the U+0000 character even when encoding/json has
// represented it as a valid JSON unicode escape. Public APIs can legitimately
// return that character in free-form text, so strip it at the ingestion edge.
func sanitizeJSONMap(payload map[string]any) map[string]any {
	cleaned := make(map[string]any, len(payload))
	for key, value := range payload {
		cleanKey := strings.ReplaceAll(key, "\x00", "")
		cleaned[cleanKey] = sanitizeJSONValue(value)
	}
	return cleaned
}

func sanitizeJSONValue(value any) any {
	switch typed := value.(type) {
	case string:
		return strings.ReplaceAll(typed, "\x00", "")
	case []any:
		cleaned := make([]any, len(typed))
		for index, item := range typed {
			cleaned[index] = sanitizeJSONValue(item)
		}
		return cleaned
	case map[string]any:
		return sanitizeJSONMap(typed)
	case float64:
		// FMI and other measurement feeds emit NaN for a missing reading, and
		// JSON has no representation for it. encoding/json refuses to marshal
		// the value, which would fail the whole observation, so a missing
		// number is stored as an explicit null instead.
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return nil
		}
		return typed
	case float32:
		promoted := float64(typed)
		if math.IsNaN(promoted) || math.IsInf(promoted, 0) {
			return nil
		}
		return promoted
	default:
		return value
	}
}
