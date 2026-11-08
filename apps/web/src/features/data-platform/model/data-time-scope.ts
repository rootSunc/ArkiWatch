import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import type { LanguageMode } from "../i18n";
import type { PlatformCategory, PlatformTimeScope } from "../types";
import { liveStatusLabel, liveStatusTone } from "./platform-status";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";

type TranslateMessage = (key: string) => string;

function formatHistoricalTimestamp(
  value: string,
  language: LanguageMode,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
      day: language === "zh" ? "numeric" : "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone,
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * A historical response is evidence for a selected calendar day, not a live
 * feed. Keep this check in one place so every workspace uses the same rule,
 * including older API payloads that may omit the explicit mode.
 */
export function isHistoricalTimeScope(
  timeScope?: PlatformTimeScope | null,
): boolean {
  return timeScope?.mode === "historical" || Boolean(timeScope?.date);
}

/**
 * Demo fixtures are intentionally frozen in time. Keep their timestamps
 * absolute so a page rendered months later still describes the same fixture
 * instead of inventing a moving relative age.
 */
export function isStaticDemoTimeScope(
  timeScope?: PlatformTimeScope | null,
): boolean {
  return timeScope?.is_demo === true;
}

/**
 * Historical views can contain both dated observations and static catalog
 * metadata. Only connected categories represent evidence from the selected
 * day; background/planned categories keep their catalog semantics.
 */
export function isHistoricalEvidenceScope(
  category: Pick<PlatformCategory, "stage"> | null | undefined,
  timeScope?: PlatformTimeScope | null,
): boolean {
  return isHistoricalTimeScope(timeScope) && category?.stage === "connected";
}

/**
 * Return the exact instant represented by a response scope. Historical
 * responses must use the snapshot reference, never the beginning of the
 * calendar window; live responses can fall back to their caller's checked-at
 * timestamp when older payloads omit the explicit field.
 */
export function scopedReferenceTime(
  timeScope: PlatformTimeScope | null | undefined,
  liveFallback: string | null = null,
): string | null {
  if (!timeScope) {
    return liveFallback;
  }

  const explicitReference = timeScope.reference_time?.trim() || null;

  if (isHistoricalTimeScope(timeScope)) {
    return explicitReference ?? timeScope.window_end ?? timeScope.window_start ?? liveFallback;
  }

  return explicitReference ?? liveFallback;
}

/**
 * Live data benefits from a relative age, while historical data must never be
 * described as "2 months ago" or "just now". Its calendar timestamp is the
 * useful, stable evidence marker.
 */
export function scopedDataTimestamp(
  value: string | null | undefined,
  timeScope: PlatformTimeScope | null | undefined,
  language: LanguageMode,
  tKey: TranslateMessage,
  fallbackKey: string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey(fallbackKey);
  }

  const resolvedTimeZone = resolveDataTimezone(timeZone);
  const absoluteTimestamp = isHistoricalTimeScope(timeScope) || isStaticDemoTimeScope(timeScope);
  const exact = absoluteTimestamp
    ? formatHistoricalTimestamp(value, language, resolvedTimeZone)
    : formatTimestamp(value, "dateTime", language, resolvedTimeZone);
  return absoluteTimestamp ? exact : `${exact} (${formatRelativeAge(value, language)})`;
}

/**
 * Preserve the old compact relative label for live workspaces and return a
 * precise timestamp for historical evidence.
 */
export function scopedDataAge(
  value: string | null | undefined,
  timeScope: PlatformTimeScope | null | undefined,
  language: LanguageMode,
  tKey: TranslateMessage,
  fallbackKey: string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey(fallbackKey);
  }

  return isHistoricalTimeScope(timeScope) || isStaticDemoTimeScope(timeScope)
    ? formatHistoricalTimestamp(value, language, resolveDataTimezone(timeZone))
    : formatRelativeAge(value, language);
}

/**
 * Detail pages use a live-feed status vocabulary by default. In a historical
 * scope, ready/stale signals are both evidence from the selected day; only
 * empty or failed states should retain an issue label.
 */
export function scopedStatusLabel(
  status: string | null | undefined,
  timeScope: PlatformTimeScope | null | undefined,
  tKey: TranslateMessage,
  readyKey: string,
  staleKey: string,
): string {
  const tone = liveStatusTone(status);
  if (isHistoricalTimeScope(timeScope) && tone !== "empty" && tone !== "failed") {
    return tKey("shell.historicalEvidence");
  }

  if (isStaticDemoTimeScope(timeScope) && tone !== "empty" && tone !== "failed") {
    return tKey("shell.demoSnapshot");
  }

  return liveStatusLabel(status, tKey, readyKey, staleKey);
}
