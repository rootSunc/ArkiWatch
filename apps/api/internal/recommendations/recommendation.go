package recommendations

import "time"

type Read struct {
	ID                 string         `json:"id"`
	RecommendationType string         `json:"recommendation_type"`
	Priority           int            `json:"priority"`
	Status             string         `json:"status"`
	AdviceTitle        string         `json:"advice_title"`
	AdviceTitleZH      *string        `json:"advice_title_zh"`
	AdviceBody         string         `json:"advice_body"`
	AdviceBodyZH       *string        `json:"advice_body_zh"`
	ValidFrom          time.Time      `json:"-"`
	ValidTo            time.Time      `json:"-"`
	EventType          string         `json:"event_type"`
	EventSeverity      string         `json:"event_severity"`
	Rationale          map[string]any `json:"-"`
}

func (read Read) Localized() Read {
	title := read.AdviceTitleZH
	body := read.AdviceBodyZH
	localized, ok := read.Rationale["localized"].(map[string]any)
	if ok {
		zh, ok := localized["zh"].(map[string]any)
		if ok {
			if title == nil {
				if value, ok := zh["title"].(string); ok && value != "" {
					title = &value
				}
			}
			if body == nil {
				if value, ok := zh["body"].(string); ok && value != "" {
					body = &value
				}
			}
		}
	}
	read.AdviceTitleZH = title
	read.AdviceBodyZH = body
	return read
}

type PublicRead struct {
	ID                 string  `json:"id"`
	RecommendationType string  `json:"recommendation_type"`
	Priority           int     `json:"priority"`
	Status             string  `json:"status"`
	AdviceTitle        string  `json:"advice_title"`
	AdviceTitleZH      *string `json:"advice_title_zh"`
	AdviceBody         string  `json:"advice_body"`
	AdviceBodyZH       *string `json:"advice_body_zh"`
	ValidFrom          string  `json:"valid_from"`
	ValidTo            string  `json:"valid_to"`
	EventType          string  `json:"event_type"`
	EventSeverity      string  `json:"event_severity"`
}

func (read Read) API() map[string]any {
	localized := read.Localized()
	return map[string]any{
		"id":                  localized.ID,
		"recommendation_type": localized.RecommendationType,
		"priority":            localized.Priority,
		"status":              localized.Status,
		"advice_title":        localized.AdviceTitle,
		"advice_title_zh":     localized.AdviceTitleZH,
		"advice_body":         localized.AdviceBody,
		"advice_body_zh":      localized.AdviceBodyZH,
		"valid_from":          localized.ValidFrom,
		"valid_to":            localized.ValidTo,
		"event_type":          localized.EventType,
		"event_severity":      localized.EventSeverity,
	}
}
