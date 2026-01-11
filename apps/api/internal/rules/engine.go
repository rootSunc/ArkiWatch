package rules

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Event struct {
	ID, EventType, Severity, LocationRef string
	Title                                string
	StartsAt, EndsAt                     time.Time
	Attributes                           map[string]any
}

type User struct {
	ID, Timezone, City, Label, District               string
	CaresWeather, CaresAir, CaresCommute, CaresEnergy bool
	HasCommuteProfile                                 bool
}

type Draft struct {
	RuleCode, RecommendationType string
	Priority                     int
	Title, Body                  string
	TitleZH, BodyZH              string
	Rationale                    map[string]any
}

func (user User) LocationRefs() []string {
	refs := []string{}
	for _, value := range []string{user.City, user.Label, user.District} {
		if value = strings.ToLower(strings.TrimSpace(value)); value != "" {
			refs = append(refs, value)
		}
	}
	return refs
}

// renderAttribute formats a normalized event attribute for user-facing copy.
// Floats round-trip through JSONB, so they are printed without an exponent and
// without the trailing zeroes a plain %v would keep.
func renderAttribute(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 64)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

// attributeOr renders an attribute, substituting fallback when the collector
// did not supply it. Advice copy reaches users and Telegram, so a missing
// attribute must never surface as a formatted nil.
func attributeOr(attributes map[string]any, key, fallback string) string {
	if text := renderAttribute(attributes[key]); text != "" {
		return text
	}
	return fallback
}

// optionalAttribute reports whether the attribute is usable alongside its text,
// so callers can drop a whole clause instead of printing a placeholder.
func optionalAttribute(attributes map[string]any, key string) (string, bool) {
	text := renderAttribute(attributes[key])
	return text, text != ""
}

func Build(event Event, user User, ruleCooldownMinutes int) (Draft, bool) {
	priority := map[string]int{"HIGH": 90, "MEDIUM": 72, "LOW": 45, "INFO": 25}[event.Severity]
	zone, err := time.LoadLocation(user.Timezone)
	if err != nil {
		zone = time.UTC
	}
	start, end := event.StartsAt.In(zone).Format("15:04"), event.EndsAt.In(zone).Format("15:04")
	var draft Draft
	switch event.EventType {
	case "rain_risk":
		if !user.CaresWeather {
			return Draft{}, false
		}
		body := fmt.Sprintf("Rain is expected between %s and %s.", start, end)
		bodyZH := fmt.Sprintf("预计 %s 至 %s 有降雨，", start, end)
		if peak, ok := optionalAttribute(event.Attributes, "peak_precip_mm"); ok {
			body += fmt.Sprintf(" Peak intensity reaches %s mm/h, so take an umbrella and leave earlier if needed.", peak)
			bodyZH += fmt.Sprintf("峰值强度约 %s 毫米/小时，建议携带雨具，必要时提前出发。", peak)
		} else {
			body += " Take an umbrella and leave earlier if needed."
			bodyZH += "建议携带雨具，必要时提前出发。"
		}
		draft = Draft{RuleCode: "R1_RAIN_RISK", RecommendationType: "WEATHER", Priority: priority, Title: "Rain is likely during the next hours", Body: body, TitleZH: "未来几小时可能有降雨", BodyZH: bodyZH}
	case "weather_outlook":
		if !user.CaresWeather {
			return Draft{}, false
		}
		minTemp, hasMin := optionalAttribute(event.Attributes, "min_temp_c")
		maxTemp, hasMax := optionalAttribute(event.Attributes, "max_temp_c")
		wind, hasWind := optionalAttribute(event.Attributes, "max_wind_ms")
		clauses, clausesZH := []string{}, []string{}
		if hasMin && hasMax {
			clauses = append(clauses, fmt.Sprintf("Temperature stays between %sC and %sC", minTemp, maxTemp))
			clausesZH = append(clausesZH, fmt.Sprintf("今天气温将在 %s°C 至 %s°C 之间", minTemp, maxTemp))
		}
		if hasWind {
			clauses = append(clauses, fmt.Sprintf("peak wind is %s m/s", wind))
			clausesZH = append(clausesZH, fmt.Sprintf("最大风速 %s 米/秒", wind))
		}
		body, bodyZH := "Plan layers accordingly for today's conditions.", "建议根据今天的天气分层穿衣。"
		if len(clauses) > 0 {
			body = strings.ToUpper(clauses[0][:1]) + clauses[0][1:]
			if len(clauses) > 1 {
				body += ". " + strings.ToUpper(clauses[1][:1]) + clauses[1][1:]
			}
			body += ", so plan layers accordingly."
			bodyZH = strings.Join(clausesZH, "，") + "，建议根据天气分层穿衣。"
		}
		draft = Draft{RuleCode: "R2_WEATHER_OUTLOOK", RecommendationType: "WEATHER", Priority: priority, Title: "Weather outlook for today", Body: body, TitleZH: "今日天气预报", BodyZH: bodyZH}
	case "air_quality_poor":
		if !user.CaresAir {
			return Draft{}, false
		}
		label := attributeOr(event.Attributes, "worst_label", "poor")
		station := attributeOr(event.Attributes, "worst_station", "your nearest station")
		draft = Draft{RuleCode: "R10_AIR_QUALITY_POOR", RecommendationType: "AIR", Priority: priority + 5, Title: "Outdoor air quality is currently poor", Body: fmt.Sprintf("Air quality is currently %s at %s. Reduce heavy outdoor exercise and consider moving it later.", label, station), TitleZH: "当前室外空气质量较差", BodyZH: fmt.Sprintf("当前 %s 的空气质量为 %s，建议减少高强度户外运动，必要时改到稍后进行。", station, label)}
	case "air_quality_status":
		if !user.CaresAir {
			return Draft{}, false
		}
		label := attributeOr(event.Attributes, "worst_label", "fair")
		station := attributeOr(event.Attributes, "worst_station", "network")
		draft = Draft{RuleCode: "R11_AIR_QUALITY_STATUS", RecommendationType: "AIR", Priority: priority, Title: "Air quality status update", Body: fmt.Sprintf("Current air quality is %s. The weakest station right now is %s.", label, station), TitleZH: "空气质量状态更新", BodyZH: fmt.Sprintf("当前空气质量为 %s，目前最弱的监测站点是 %s。", label, station)}
	case "transit_delay", "transit_disruption":
		if !user.CaresCommute || !user.HasCommuteProfile {
			return Draft{}, false
		}
		draft = Draft{RuleCode: "R20_COMMUTE_DISRUPTION", RecommendationType: "COMMUTE", Priority: priority + 8, Title: event.TitleOr("Public transport service alert"), Body: fmt.Sprintf("Transit service risk is active from %s to %s. Check your commute before leaving and keep 10-15 minutes of buffer.", start, end), TitleZH: "公共交通服务提醒", BodyZH: fmt.Sprintf("%s 至 %s 存在公共交通服务风险。出发前查看通勤安排，并预留 10–15 分钟缓冲时间。", start, end)}
	case "cheap_energy_window":
		if !user.CaresEnergy {
			return Draft{}, false
		}
		value, hasValue := optionalAttribute(event.Attributes, "average_value")
		unit, hasUnit := optionalAttribute(event.Attributes, "unit")
		detail, detailZH := "", ""
		if hasValue && hasUnit {
			detail = fmt.Sprintf(" Average value is %s %s.", value, unit)
			detailZH = fmt.Sprintf("期间均价约 %s %s。", value, unit)
		}
		draft = Draft{RuleCode: "R30_ENERGY_WINDOW", RecommendationType: "ENERGY", Priority: priority, Title: "Flexible energy use window", Body: fmt.Sprintf("Start flexible electricity use from %s; the relative-low window runs until %s.%s", start, end, detail), TitleZH: "适合安排弹性用电的时段", BodyZH: fmt.Sprintf("建议从 %s 开始安排弹性用电，较低价时段预计持续到 %s。%s", start, end, detailZH)}
	default:
		return Draft{}, false
	}
	draft.Rationale = map[string]any{"rule_code": draft.RuleCode, "event_type": event.EventType, "cooldown_minutes": ruleCooldownMinutes, "localized": map[string]any{"zh": map[string]any{"title": draft.TitleZH, "body": draft.BodyZH}}}
	return draft, true
}

func (event Event) TitleOr(fallback string) string {
	if strings.TrimSpace(event.Title) != "" {
		return event.Title
	}
	return fallback
}
