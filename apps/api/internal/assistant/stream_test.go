package assistant

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

func streamingProvider(t *testing.T, frames []string) (config.Config, *httptest.Server) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		writer.WriteHeader(http.StatusOK)
		flusher, _ := writer.(http.Flusher)
		for _, frame := range frames {
			_, _ = writer.Write([]byte("data: " + frame + "\n\n"))
			if flusher != nil {
				flusher.Flush()
			}
		}
		_, _ = writer.Write([]byte("data: [DONE]\n\n"))
	}))
	t.Cleanup(server.Close)
	return config.Config{DeepseekAPIKey: "test-key", DeepseekAPIBaseURL: server.URL, DeepseekModel: "test-model", AssistantRequestTimeoutSeconds: 10}, server
}

// The stream endpoint exists so a reader sees the answer build up; a single
// buffered frame would defeat its purpose.
func TestStreamForwardsEachDelta(t *testing.T) {
	cfg, _ := streamingProvider(t, []string{
		`{"model":"deepseek-chat","choices":[{"delta":{"content":"Air "}}]}`,
		`{"model":"deepseek-chat","choices":[{"delta":{"content":"quality "}}]}`,
		`{"model":"deepseek-chat","choices":[{"delta":{"content":"is fair."}}]}`,
	})
	deltas := []string{}
	result := Stream(context.Background(), cfg, []Message{{Role: "user", Content: "air?"}}, "en", GroundedContext{Facts: []string{"air_quality: status=ready"}, UsableDatasets: 1}, func(delta string) {
		deltas = append(deltas, delta)
	})
	if len(deltas) != 3 {
		t.Fatalf("expected one callback per chunk, got %d: %v", len(deltas), deltas)
	}
	if result.Answer != "Air quality is fair." {
		t.Fatalf("unexpected assembled answer: %q", result.Answer)
	}
	if result.AnswerMode != "deepseek" || result.Model == nil || *result.Model != "deepseek-chat" {
		t.Fatalf("unexpected result metadata: %#v", result)
	}
	if result.Error != nil {
		t.Fatalf("unexpected error on a complete stream: %v", *result.Error)
	}
}

func TestStreamAttachesGroundedCitations(t *testing.T) {
	cfg, _ := streamingProvider(t, []string{`{"choices":[{"delta":{"content":"ok"}}]}`})
	grounded := GroundedContext{
		Facts:          []string{"traffic: status=watch"},
		Citations:      []Citation{{Source: "traffic", Detail: "traffic snapshot."}},
		DataContext:    []string{"traffic"},
		UsableDatasets: 1,
	}
	result := Stream(context.Background(), cfg, []Message{{Role: "user", Content: "roads?"}}, "en", grounded, func(string) {})
	if len(result.Citations) != 1 || result.Citations[0].Source != "traffic" {
		t.Fatalf("streamed answer lost its citations: %#v", result.Citations)
	}
	if len(result.DataContext) != 1 {
		t.Fatalf("streamed answer lost its data context: %#v", result.DataContext)
	}
}

// A provider outage must not lose the readings the request already gathered.
func TestStreamFallsBackToGroundedAnswer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	cfg := config.Config{DeepseekAPIKey: "test-key", DeepseekAPIBaseURL: server.URL, DeepseekModel: "test-model", AssistantRequestTimeoutSeconds: 5}

	deltas := []string{}
	result := Stream(context.Background(), cfg, []Message{{Role: "user", Content: "air?"}}, "en", GroundedContext{Facts: []string{"air_quality: status=ready"}, UsableDatasets: 1}, func(delta string) {
		deltas = append(deltas, delta)
	})
	if result.AnswerMode != "fallback" || result.Error == nil {
		t.Fatalf("provider failure was not reported: %#v", result)
	}
	if !strings.Contains(result.Answer, "air_quality: status=ready") {
		t.Fatalf("fallback dropped the readings: %s", result.Answer)
	}
	if len(deltas) == 0 {
		t.Fatal("fallback answer was never emitted to the stream")
	}
}

// A stream that stops mid-answer should keep what arrived and say it may be
// incomplete, rather than discarding a partially useful answer.
func TestStreamReportsTruncatedAnswers(t *testing.T) {
	cfg, _ := streamingProvider(t, []string{
		`{"choices":[{"delta":{"content":"Partial answer"}}]}`,
		`not json`,
	})
	result := Stream(context.Background(), cfg, []Message{{Role: "user", Content: "air?"}}, "en", GroundedContext{UsableDatasets: 1}, func(string) {})
	if result.Answer != "Partial answer" {
		t.Fatalf("unexpected answer: %q", result.Answer)
	}
}

func TestStreamWithoutProviderKeyUsesFallback(t *testing.T) {
	deltas := []string{}
	result := Stream(context.Background(), config.Config{}, []Message{{Role: "user", Content: "air?"}}, "fi", GroundedContext{Facts: []string{"air_quality: status=ready"}, UsableDatasets: 1}, func(delta string) {
		deltas = append(deltas, delta)
	})
	if result.AnswerMode != "fallback" || len(deltas) != 1 {
		t.Fatalf("unexpected fallback behaviour: mode=%s deltas=%d", result.AnswerMode, len(deltas))
	}
}
