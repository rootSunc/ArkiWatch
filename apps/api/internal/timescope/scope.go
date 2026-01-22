package timescope

import (
	"fmt"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
)

type Scope struct {
	Mode          string
	Date          *string
	Timezone      string
	ReferenceTime time.Time
	WindowStart   *time.Time
	WindowEnd     *time.Time
}

func Build(targetDate *time.Time, now time.Time, timezoneName string) (Scope, error) {
	now = now.UTC()
	location, err := time.LoadLocation(timezoneName)
	if err != nil {
		return Scope{}, fmt.Errorf("load timezone %q: %w", timezoneName, err)
	}
	if targetDate == nil {
		return Scope{Mode: "live", Timezone: timezoneName, ReferenceTime: now}, nil
	}
	localDate := targetDate.In(time.UTC)
	localStart := time.Date(localDate.Year(), localDate.Month(), localDate.Day(), 0, 0, 0, 0, location)
	localEnd := localStart.AddDate(0, 0, 1)
	start := localStart.UTC()
	end := localEnd.UTC()
	reference := now
	if reference.Before(start) {
		reference = start
	}
	if !reference.Before(end) {
		reference = end.Add(-time.Second)
	}
	dateValue := localDate.Format("2006-01-02")
	return Scope{
		Mode:          "historical",
		Date:          &dateValue,
		Timezone:      timezoneName,
		ReferenceTime: reference,
		WindowStart:   &start,
		WindowEnd:     &end,
	}, nil
}

func (scope Scope) Payload() map[string]any {
	return map[string]any{
		"mode":           scope.Mode,
		"date":           scope.Date,
		"timezone":       scope.Timezone,
		"reference_time": Format(scope.ReferenceTime),
		"window_start":   formatOptional(scope.WindowStart),
		"window_end":     formatOptional(scope.WindowEnd),
	}
}

func Format(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.999999-07:00")
}

func formatOptional(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := Format(*value)
	return &formatted
}

func DefaultScope(targetDate *time.Time, now time.Time, cfg config.Config) (Scope, error) {
	return Build(targetDate, now, cfg.Timezone)
}
