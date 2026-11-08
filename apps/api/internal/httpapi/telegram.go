package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"net/http"
	"strconv"
	"strings"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/dispatch"
)

type telegramUpdatePayload struct {
	UpdateID *int64 `json:"update_id"`
	Message  *struct {
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

func (s *Server) telegramWebhook(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer)
		return
	}
	if strings.TrimSpace(s.cfg.TelegramWebhookSecret) == "" {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram webhook is not configured."})
		return
	}
	expected := []byte(s.cfg.TelegramWebhookSecret)
	provided := []byte(request.Header.Get("X-Telegram-Bot-Api-Secret-Token"))
	expectedDigest := sha256.Sum256(expected)
	providedDigest := sha256.Sum256(provided)
	if !hmac.Equal(expectedDigest[:], providedDigest[:]) || string(provided) != s.cfg.TelegramWebhookSecret {
		writeJSON(writer, http.StatusForbidden, map[string]string{"detail": "Invalid Telegram webhook secret."})
		return
	}
	var payload telegramUpdatePayload
	if !decodeRequest(writer, request, &payload) {
		return
	}
	if s.telegram == nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Database is unavailable."})
		return
	}
	if payload.Message != nil {
		chatID := strconv.FormatInt(payload.Message.Chat.ID, 10)
		reply, err := s.telegram.ProcessTelegramUpdate(request.Context(), payload.UpdateID, chatID, payload.Message.Text, s.now().UTC())
		if err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram update could not be processed."})
			return
		}
		if reply != nil && strings.TrimSpace(s.cfg.TelegramBotToken) != "" {
			_ = dispatch.NewTelegramSender(s.cfg).SendMessage(request.Context(), reply.ChatID, reply.Text)
		}
	} else if payload.UpdateID != nil {
		if _, err := s.telegram.ProcessTelegramUpdate(request.Context(), payload.UpdateID, "", "", s.now().UTC()); err != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"detail": "Telegram update could not be processed."})
			return
		}
	}
	writeJSON(writer, http.StatusOK, map[string]bool{"ok": true})
}
