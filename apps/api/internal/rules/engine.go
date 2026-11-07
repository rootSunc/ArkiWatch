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

type Commute struct {
	Mode               string
	Departure          string
	Weekdays           []int
	Routes             []string
	Stops              []string
	DepartureMinutes   int
	HasDepartureMinute bool
}

type User struct {
	ID, Timezone, City, Label, District               string
	CaresWeather, CaresAir, CaresCommute, CaresEnergy bool
	HasCommuteProfile                                 bool
	Commutes                                          []Commute
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
		if !matchesPersonalCommute(event, user) {
			return Draft{}, false
		}
		draft = Draft{RuleCode: "R20_COMMUTE_DISRUPTION", RecommendationType: "COMMUTE", Priority: priority + 8, Title: event.TitleOr("Public transport service alert"), Body: fmt.Sprintf("Transit service risk is active from %s to %s. Check your commute before leaving and keep 10-15 minutes of buffer.", start, end), TitleZH: "公共交通服务提醒", BodyZH: fmt.Sprintf("%s 至 %s 存在公共交通服务风险。出发前查看通勤安排，并预留 10–15 分钟缓冲时间。", start, end)}
	case "road_disruption", "road_weather_risk":
		if !matchesPersonalCommute(event, user) || !roadAppliesToCommute(event, user) {
			return Draft{}, false
		}
		draft = Draft{RuleCode: "R21_ROAD_COMMUTE", RecommendationType: "COMMUTE", Priority: priority + 8, Title: event.TitleOr("Road disruption on a driving commute"), Body: fmt.Sprintf("A road disruption is active from %s to %s. Check the route before leaving and keep extra time.", start, end), TitleZH: "驾车通勤道路提醒", BodyZH: fmt.Sprintf("%s 至 %s 存在道路影响。出发前查看路线，并预留额外时间。", start, end)}
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

func matchesPersonalCommute(event Event, user User) bool {
	if !user.CaresCommute {
		return false
	}
	if len(user.Commutes) == 0 {
		return user.HasCommuteProfile && isTransitEvent(event.EventType)
	}
	zone, err := time.LoadLocation(user.Timezone)
	if err != nil {
		zone = time.UTC
	}
	for _, commute := range user.Commutes {
		if commuteAccepts(commute, event, zone) {
			return true
		}
	}
	return false
}

func commuteAccepts(commute Commute, event Event, zone *time.Location) bool {
	if !modeAccepts(commute.Mode, event.EventType) || !weekdayAccepts(commute.Weekdays, event, zone) || !targetsAccept(commute, event) {
		return false
	}
	if !commute.HasDepartureMinute {
		return true
	}
	localStart := event.StartsAt.In(zone)
	day := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, zone)
	windowStart := day.Add(time.Duration(commute.DepartureMinutes-45) * time.Minute)
	windowEnd := day.Add(time.Duration(commute.DepartureMinutes+90) * time.Minute)
	return event.EndsAt.After(windowStart) && event.StartsAt.Before(windowEnd)
}

func modeAccepts(mode, eventType string) bool {
	switch strings.ToUpper(strings.TrimSpace(mode)) {
	case "DRIVE", "BIKE":
		return eventType == "road_disruption" || eventType == "road_weather_risk"
	case "WALK":
		return isTransitEvent(eventType) || eventType == "road_weather_risk"
	default:
		return isTransitEvent(eventType)
	}
}

func weekdayAccepts(weekdays []int, event Event, zone *time.Location) bool {
	if len(weekdays) == 0 {
		return true
	}
	day := isoWeekday(event.StartsAt.In(zone))
	for _, wanted := range weekdays {
		if wanted == day {
			return true
		}
	}
	return false
}

func isoWeekday(value time.Time) int {
	day := int(value.Weekday())
	if day == 0 {
		return 7
	}
	return day
}

func isTransitEvent(eventType string) bool {
	return eventType == "transit_delay" || eventType == "transit_disruption"
}

func roadAppliesToCommute(event Event, user User) bool {
	ref := strings.ToLower(strings.TrimSpace(event.LocationRef))
	for _, place := range []string{user.City, user.Label, user.District} {
		if place = strings.ToLower(strings.TrimSpace(place)); place != "" && place == ref {
			return true
		}
	}
	if ref != "finland" && ref != "" {
		return false
	}
	haystack := strings.ToLower(event.Title)
	for _, key := range []string{"location_description", "summary", "comment"} {
		haystack += " " + strings.ToLower(renderAttribute(event.Attributes[key]))
	}
	for _, place := range []string{user.City, user.Label, user.District, "uusimaa", "kehä", "keha", "ring i", "ring iii"} {
		if place = strings.ToLower(strings.TrimSpace(place)); place != "" && strings.Contains(haystack, place) {
			return true
		}
	}
	return false
}

func targetsAccept(commute Commute, event Event) bool {
	if len(commute.Routes) == 0 && len(commute.Stops) == 0 {
		return true
	}
	routes := eventLabels(event, "routes", "route_ids")
	stops := eventLabels(event, "stops", "stop_ids")
	if len(commute.Routes) > 0 && len(routes) > 0 && !labelsOverlap(commute.Routes, routes) {
		return false
	}
	if len(commute.Stops) > 0 && len(stops) > 0 && !labelsOverlap(commute.Stops, stops) {
		return false
	}
	return true
}

func eventLabels(event Event, keys ...string) []string {
	labels := []string{}
	for _, key := range keys {
		labels = append(labels, labelsFrom(event.Attributes[key])...)
	}
	return labels
}

func labelsFrom(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case []string:
		return append([]string(nil), typed...)
	case []any:
		labels := []string{}
		for _, item := range typed {
			switch row := item.(type) {
			case string:
				labels = append(labels, row)
			case map[string]any:
				for _, key := range []string{"name", "short_name", "gtfs_id", "id"} {
					if text, ok := row[key].(string); ok {
						labels = append(labels, text)
					}
				}
			}
		}
		return labels
	default:
		return nil
	}
}

func labelsOverlap(wanted, found []string) bool {
	for _, left := range wanted {
		for _, right := range found {
			if labelMatches(left, right) {
				return true
			}
		}
	}
	return false
}

func labelMatches(left, right string) bool {
	first := strings.ToLower(strings.TrimSpace(left))
	second := strings.ToLower(strings.TrimSpace(right))
	if first == "" || second == "" {
		return false
	}
	if first == second {
		return true
	}
	if len([]rune(first)) >= 4 && len([]rune(second)) >= 4 && (strings.Contains(first, second) || strings.Contains(second, first)) {
		return true
	}
	return false
}

func (commute Commute) WithTargets(routes, stops []string) Commute {
	commute.Routes = append([]string(nil), routes...)
	commute.Stops = append([]string(nil), stops...)
	return commute
}

func ParseCommute(mode, departure string, weekdays []int) Commute {
	item := Commute{Mode: strings.ToUpper(strings.TrimSpace(mode)), Departure: strings.TrimSpace(departure), Weekdays: append([]int(nil), weekdays...)}
	if len(item.Departure) == 5 && item.Departure[2] == ':' {
		hour, hourErr := strconv.Atoi(item.Departure[:2])
		minute, minuteErr := strconv.Atoi(item.Departure[3:])
		if hourErr == nil && minuteErr == nil && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 {
			item.DepartureMinutes = hour*60 + minute
			item.HasDepartureMinute = true
		}
	}
	return item
}

func (event Event) TitleOr(fallback string) string {
	if strings.TrimSpace(event.Title) != "" {
		return event.Title
	}
	return fallback
}
