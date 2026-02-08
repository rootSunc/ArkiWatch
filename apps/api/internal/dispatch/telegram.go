package dispatch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type Sender interface {
	SendMessage(context.Context, string, string) error
}

type TelegramSender struct {
	cfg    config.Config
	client *http.Client
}

func NewTelegramSender(cfg config.Config) *TelegramSender {
	return &TelegramSender{cfg: cfg, client: &http.Client{Timeout: 30 * time.Second}}
}

func (sender *TelegramSender) SendMessage(ctx context.Context, chatID, text string) error {
	if strings.TrimSpace(sender.cfg.TelegramBotToken) == "" {
		return fmt.Errorf("TELEGRAM_BOT_TOKEN is not configured")
	}
	endpoint := strings.TrimRight(sender.cfg.TelegramAPIBaseURL, "/") + "/bot" + sender.cfg.TelegramBotToken + "/sendMessage"
	payload, _ := json.Marshal(map[string]any{"chat_id": chatID, "text": trimMessage(text), "disable_web_page_preview": true})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := sender.client.Do(request)
	if err != nil {
		return fmt.Errorf("Telegram request failed: %w", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 400 {
		return fmt.Errorf("Telegram sendMessage failed with %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("Telegram returned invalid JSON: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("Telegram sendMessage returned not ok")
	}
	return nil
}

func trimMessage(value string) string {
	if len(value) > 4096 {
		return value[:4096]
	}
	return value
}
func FormatRecommendation(title, body string, validTo *time.Time) string {
	parts := []string{"ArkiWatch\n\n" + title, body}
	if validTo != nil {
		parts = append(parts, "Valid until "+validTo.UTC().Format("2006-01-02 15:04 UTC"))
	}
	return trimMessage(strings.Join(parts, "\n\n"))
}

func FormatPublicBroadcast(scenario, title, body, area string, validTo *time.Time) string {
	parts := []string{"ArkiWatch " + strings.ToLower(scenario), title, body, "Scope: " + strings.ToLower(area)}
	if validTo != nil {
		parts = append(parts, "Valid until "+validTo.UTC().Format("2006-01-02 15:04 UTC"))
	}
	return trimMessage(strings.Join(parts, "\n\n"))
}
