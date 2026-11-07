package assistant

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResult struct {
	Answer      string
	Citations   []Citation
	Model       *string
	AnswerMode  string
	DataContext []string
	Error       *string
}

type TranslateResult struct {
	TranslatedText string
	SourceLanguage string
	TargetLanguage string
	Model          *string
	AnswerMode     string
	Error          *string
}

// Chat answers a question against the supplied live ArkiWatch context. The
// grounding is what separates this from a general-purpose chatbot: the model is
// given the current readings and told to answer only from them, and the same
// datasets come back as citations so a reader can check the basis of an answer.
func Chat(ctx context.Context, cfg config.Config, messages []Message, language string, grounded GroundedContext) ChatResult {
	if !grounded.HasUsableEvidence() {
		return insufficientEvidence(language, grounded)
	}
	if strings.TrimSpace(cfg.DeepseekAPIKey) == "" {
		return fallbackChat(language, grounded)
	}
	requestMessages := []Message{{Role: "system", Content: assistantSystemPrompt(language, grounded)}}
	requestMessages = append(requestMessages, messages...)
	var response deepseekResponse
	if err := callDeepseek(ctx, cfg, requestMessages, &response); err != nil {
		message := "Assistant provider is unavailable; using offline fallback."
		fallback := fallbackChat(language, grounded)
		fallback.Error = &message
		return fallback
	}
	content := strings.TrimSpace(response.FirstContent())
	if content == "" {
		return fallbackChat(language, grounded)
	}
	model := response.Model
	return ChatResult{Answer: content, Citations: grounded.Citations, Model: &model, AnswerMode: "deepseek", DataContext: grounded.DataContext}
}

func Translate(ctx context.Context, cfg config.Config, text, sourceLanguage, targetLanguage, contextHint string) TranslateResult {
	if strings.TrimSpace(cfg.DeepseekAPIKey) == "" {
		return TranslateResult{TranslatedText: text, SourceLanguage: inferredSourceLanguage(sourceLanguage), TargetLanguage: targetLanguage, AnswerMode: "source"}
	}
	prompt := fmt.Sprintf("Translate the following text to %s. Return only the translation. Source language: %s. Context: %s\n\n%s", targetLanguage, sourceLanguage, contextHint, text)
	result := Chat(ctx, cfg, []Message{{Role: "user", Content: prompt}}, targetLanguage, GroundedContext{})
	if result.AnswerMode != "deepseek" {
		return TranslateResult{TranslatedText: text, SourceLanguage: inferredSourceLanguage(sourceLanguage), TargetLanguage: targetLanguage, AnswerMode: "fallback", Error: result.Error}
	}
	return TranslateResult{TranslatedText: result.Answer, SourceLanguage: inferredSourceLanguage(sourceLanguage), TargetLanguage: targetLanguage, Model: result.Model, AnswerMode: "deepseek", Error: result.Error}
}

func callDeepseek(ctx context.Context, cfg config.Config, messages []Message, destination *deepseekResponse) error {
	timeout := time.Duration(cfg.AssistantRequestTimeoutSeconds * float64(time.Second))
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	payload := map[string]any{"model": cfg.DeepseekModel, "messages": messages, "temperature": 0.2, "stream": false}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, strings.TrimRight(cfg.DeepseekAPIBaseURL, "/")+"/chat/completions", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+cfg.DeepseekAPIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: timeout}).Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("assistant provider returned HTTP %d", response.StatusCode)
	}
	if err := json.Unmarshal(responseBody, destination); err != nil {
		return err
	}
	return nil
}

type deepseekResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
}

func (response deepseekResponse) FirstContent() string {
	if len(response.Choices) == 0 {
		return ""
	}
	return response.Choices[0].Message.Content
}

// fallbackChat answers without a model provider. It still reports the live
// readings rather than apologising, because the data is the useful part and it
// is available whether or not the provider is configured.
func insufficientEvidence(language string, grounded GroundedContext) ChatResult {
	answer := map[string]string{
		"zh": "目前没有足够新的本地观测，无法判断这个问题。",
		"fi": "Minulla ei ole riittävän tuoreita paikallisia mittauksia tämän arvioimiseen.",
	}[language]
	if answer == "" {
		answer = "I don't have sufficiently recent local measurements to assess this."
	}
	return ChatResult{Answer: answer, Citations: citationsOrEmpty(grounded.Citations), AnswerMode: "insufficient_evidence", DataContext: dataContextOrEmpty(grounded.DataContext)}
}

func fallbackChat(language string, grounded GroundedContext) ChatResult {
	intro := map[string]string{
		"zh": "助手服务当前不可用，以下是 ArkiWatch 的实时数据：",
		"fi": "Avustajapalvelu ei ole käytettävissä. Tässä ArkiWatchin tuoreimmat lukemat:",
	}[language]
	if intro == "" {
		intro = "The assistant provider is unavailable. Here are the current ArkiWatch readings:"
	}
	empty := map[string]string{
		"zh": "助手服务当前不可用，且暂时没有可展示的实时数据。",
		"fi": "Avustajapalvelu ei ole käytettävissä, eikä tuoreita lukemia ole juuri nyt saatavilla.",
	}[language]
	if empty == "" {
		empty = "The assistant provider is unavailable, and there are no current readings to show."
	}
	if len(grounded.Facts) == 0 {
		return ChatResult{Answer: empty, Citations: citationsOrEmpty(grounded.Citations), AnswerMode: "fallback", DataContext: dataContextOrEmpty(grounded.DataContext)}
	}
	lines := []string{intro}
	for index, fact := range grounded.Facts {
		if index >= 8 {
			break
		}
		lines = append(lines, "- "+fact)
	}
	return ChatResult{Answer: strings.Join(lines, "\n"), Citations: citationsOrEmpty(grounded.Citations), AnswerMode: "fallback", DataContext: dataContextOrEmpty(grounded.DataContext)}
}

func citationsOrEmpty(citations []Citation) []Citation {
	if citations == nil {
		return []Citation{}
	}
	return citations
}

func dataContextOrEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func assistantSystemPrompt(language string, grounded GroundedContext) string {
	instructions := "You are the ArkiWatch assistant. Answer in " + language + ". Use concise, practical wording. " +
		"Answer only from the ArkiWatch readings below; if they do not cover the question, say so plainly instead of guessing. " +
		"Never invent measurements, times, or sources."
	if len(grounded.Facts) == 0 {
		return instructions + "\n\nNo live ArkiWatch readings are available for this question."
	}
	return instructions + "\n\nCurrent ArkiWatch readings:\n" + strings.Join(grounded.Facts, "\n")
}

func inferredSourceLanguage(value string) string {
	if value == "auto" || strings.TrimSpace(value) == "" {
		return "auto"
	}
	return value
}

// Stream answers like Chat but forwards the provider's tokens to onDelta as
// they arrive. Callers that cannot stream still receive the complete result, so
// a provider without streaming support degrades to a single delta.
func Stream(ctx context.Context, cfg config.Config, messages []Message, language string, grounded GroundedContext, onDelta func(string)) ChatResult {
	if !grounded.HasUsableEvidence() {
		result := insufficientEvidence(language, grounded)
		onDelta(result.Answer)
		return result
	}
	if strings.TrimSpace(cfg.DeepseekAPIKey) == "" {
		result := fallbackChat(language, grounded)
		onDelta(result.Answer)
		return result
	}
	requestMessages := []Message{{Role: "system", Content: assistantSystemPrompt(language, grounded)}}
	requestMessages = append(requestMessages, messages...)

	var builder strings.Builder
	model, err := streamDeepseek(ctx, cfg, requestMessages, func(delta string) {
		builder.WriteString(delta)
		onDelta(delta)
	})
	answer := strings.TrimSpace(builder.String())
	if err != nil && answer == "" {
		message := "Assistant provider is unavailable; using offline fallback."
		fallback := fallbackChat(language, grounded)
		fallback.Error = &message
		onDelta(fallback.Answer)
		return fallback
	}
	if answer == "" {
		result := fallbackChat(language, grounded)
		onDelta(result.Answer)
		return result
	}
	result := ChatResult{Answer: answer, Citations: grounded.Citations, Model: &model, AnswerMode: "deepseek", DataContext: dataContextOrEmpty(grounded.DataContext)}
	if err != nil {
		// The provider dropped mid-answer. The partial answer is still returned
		// because it is grounded and useful, but the truncation is reported.
		message := "Assistant response ended early; the answer may be incomplete."
		result.Error = &message
	}
	return result
}

func streamDeepseek(ctx context.Context, cfg config.Config, messages []Message, onDelta func(string)) (string, error) {
	timeout := time.Duration(cfg.AssistantRequestTimeoutSeconds * float64(time.Second))
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	body, err := json.Marshal(map[string]any{"model": cfg.DeepseekModel, "messages": messages, "temperature": 0.2, "stream": true})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, strings.TrimRight(cfg.DeepseekAPIBaseURL, "/")+"/chat/completions", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+cfg.DeepseekAPIKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "text/event-stream")
	response, err := (&http.Client{Timeout: timeout}).Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("assistant provider returned HTTP %d", response.StatusCode)
	}

	model := cfg.DeepseekModel
	scanner := bufio.NewScanner(io.LimitReader(response.Body, 8<<20))
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk deepseekStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Model != "" {
			model = chunk.Model
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				onDelta(choice.Delta.Content)
			}
		}
	}
	return model, scanner.Err()
}

type deepseekStreamChunk struct {
	Model   string `json:"model"`
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}
