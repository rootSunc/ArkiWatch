package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/assistant"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

type assistantMessagePayload struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type assistantChatPayload struct {
	Messages []assistantMessagePayload `json:"messages"`
	Language string                    `json:"language"`
	City     *string                   `json:"city"`
	Date     *string                   `json:"date"`
	UserID   *string                   `json:"user_id"`
}

func (s *Server) assistantChat(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.optionalCurrentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if !s.allowAssistant(request, user, "chat", writer) {
		return
	}
	var payload assistantChatPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if !validateAssistantChat(payload) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Assistant chat values are invalid."})
		return
	}
	messages := make([]assistant.Message, 0, len(payload.Messages))
	for _, message := range payload.Messages {
		messages = append(messages, assistant.Message{Role: message.Role, Content: message.Content})
	}
	result := assistant.Chat(request.Context(), s.cfg, messages, payload.Language, s.groundAssistant(request, payload))
	writeJSON(writer, http.StatusOK, map[string]any{"answer": result.Answer, "citations": result.Citations, "model": result.Model, "answer_mode": result.AnswerMode, "data_context": result.DataContext, "error_message": result.Error})
}

func (s *Server) assistantChatStream(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	user, failure := s.optionalCurrentUser(request)
	if failure != nil {
		writeAuthFailure(writer, failure)
		return
	}
	if !s.allowAssistant(request, user, "chat", writer) {
		return
	}
	var payload assistantChatPayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if !validateAssistantChat(payload) {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Assistant chat values are invalid."})
		return
	}
	messages := make([]assistant.Message, 0, len(payload.Messages))
	for _, message := range payload.Messages {
		messages = append(messages, assistant.Message{Role: message.Role, Content: message.Content})
	}
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.WriteHeader(http.StatusOK)
	flusher, _ := writer.(http.Flusher)
	encoder := json.NewEncoder(writer)

	// Each frame is emitted and flushed as it arrives, so the client renders the
	// answer progressively instead of waiting for the whole completion.
	emit := func(frame map[string]any) {
		_, _ = writer.Write([]byte("data: "))
		_ = encoder.Encode(frame)
		_, _ = writer.Write([]byte("\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}
	grounded := s.groundAssistant(request, payload)
	result := assistant.Stream(request.Context(), s.cfg, messages, payload.Language, grounded, func(delta string) {
		emit(map[string]any{"delta": delta})
	})
	emit(map[string]any{"answer": result.Answer, "citations": result.Citations, "model": result.Model, "answer_mode": result.AnswerMode, "data_context": result.DataContext, "error_message": result.Error})
	_, _ = writer.Write([]byte("data: [DONE]\n\n"))
	if flusher != nil {
		flusher.Flush()
	}
}

type assistantTranslatePayload struct {
	Text           string  `json:"text"`
	TargetLanguage string  `json:"target_language"`
	SourceLanguage string  `json:"source_language"`
	Context        *string `json:"context"`
}

func (s *Server) assistantTranslate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if !s.allowAssistant(request, nil, "translate", writer) {
		return
	}
	var payload assistantTranslatePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if strings.TrimSpace(payload.Text) == "" || len(payload.Text) > 3000 || (payload.TargetLanguage != "en" && payload.TargetLanguage != "zh") {
		writeJSON(writer, http.StatusUnprocessableEntity, map[string]string{"detail": "Translation values are invalid."})
		return
	}
	if payload.SourceLanguage == "" {
		payload.SourceLanguage = "auto"
	}
	contextHint := ""
	if payload.Context != nil {
		contextHint = *payload.Context
	}
	result := assistant.Translate(request.Context(), s.cfg, payload.Text, payload.SourceLanguage, payload.TargetLanguage, contextHint)
	writeJSON(writer, http.StatusOK, map[string]any{"translated_text": result.TranslatedText, "source_language": result.SourceLanguage, "target_language": result.TargetLanguage, "model": result.Model, "answer_mode": result.AnswerMode, "error_message": result.Error})
}

func validateAssistantChat(payload assistantChatPayload) bool {
	if len(payload.Messages) < 1 || len(payload.Messages) > 20 {
		return false
	}
	if payload.Language == "" {
		payload.Language = "en"
	}
	if payload.Language != "en" && payload.Language != "zh" && payload.Language != "fi" {
		return false
	}
	for _, message := range payload.Messages {
		if (message.Role != "user" && message.Role != "assistant") || strings.TrimSpace(message.Content) == "" || len(message.Content) > 4000 {
			return false
		}
	}
	return true
}

func (s *Server) allowAssistant(request *http.Request, user *users.User, operation string, writer http.ResponseWriter) bool {
	key := operation + ":" + loginRateLimitKey(request)
	if user != nil {
		key = operation + ":user:" + user.ID
	}
	decision := s.assistantLimiter.Check(key, s.cfg.AssistantRateLimitRequests, time.Duration(s.cfg.AssistantRateLimitWindowSeconds)*time.Second, s.now())
	if decision.Allowed {
		return true
	}
	writer.Header().Set("Retry-After", strconv.Itoa(decision.RetryAfterSeconds))
	writeJSON(writer, http.StatusTooManyRequests, map[string]string{"detail": "Assistant request limit reached. Please try again shortly."})
	return false
}
