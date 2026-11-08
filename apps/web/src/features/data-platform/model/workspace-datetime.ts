import { UNAVAILABLE_DATA_VALUE } from "./data-value";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";
import type { LanguageMode } from "../language";

/**
 * Date and time formatting shared by the detail workspaces.
 *
 * Every workspace renders the same two shapes — a trend-chart day label and a
 * compact date-time for an observation — so they are defined once here. Locale
 * choice is deliberate: Chinese renders a numeric day, English a zero-padded
 * one, and both read the timezone the payload declares.
 */

/** Day label for a history point, e.g. "08 Aug" or "8月8日". */
export function formatHistoryDate(
  value: string,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  // Midday avoids a timezone shift moving the label onto the neighbouring day.
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    timeZone: resolveDataTimezone(timeZone),
  }).format(parsed);
}

/**
 * Compact date and time for an observation, e.g. "08 AUG, 14:30".
 * `fallback` is the workspace's own wording for an absent value.
 */
export function formatCompactDateTime(
  value: string | null | undefined,
  language: LanguageMode,
  fallback: string = UNAVAILABLE_DATA_VALUE,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone),
  })
    .format(parsed)
    .toUpperCase();
}
