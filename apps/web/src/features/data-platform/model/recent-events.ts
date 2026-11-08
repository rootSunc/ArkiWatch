import { formatTimestamp } from "@/features/shared/format";
import type { LanguageMode } from "../i18n";
import type { PlatformEvent } from "../types";
export const RECENT_EVENT_LIMIT = 6;

type RecentEventTarget = {
  mobilityTab?: "traffic" | "transit";
  navKey: string;
};

export type RecentEventDetail = {
  key: string;
  label: string;
  value: string;
};

function attributeValue(event: PlatformEvent, key: string): unknown {
  return event.attributes?.[key];
}

function attributeText(event: PlatformEvent, key: string): string | null {
  const value = attributeValue(event, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attributeList(event: PlatformEvent, key: string): string[] {
  const value = attributeValue(event, key);
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item)).filter(Boolean);
}

function attributeNumber(event: PlatformEvent, key: string): number | null {
  const value = attributeValue(event, key);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function attributeBoolean(event: PlatformEvent, key: string): boolean {
  return attributeValue(event, key) === true;
}

function formatCompactNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function eventType(event: PlatformEvent): string | null {
  const evidenceType = event.evidence
    .find((item) => item.toLowerCase().startsWith("event type:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();

  return attributeText(event, "event_type") ?? evidenceType ?? null;
}

export function eventAnchorId(eventId: string): string {
  const normalized = eventId.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return `platform-event-${normalized || "unknown"}`;
}

export function eventNavigationId(event: PlatformEvent): string {
  if (event.category_key === "transit") {
    return attributeText(event, "alert_id") ?? event.id;
  }
  if (event.category_key === "traffic") {
    return attributeText(event, "situation_id") ?? event.id;
  }
  return event.id;
}

export function eventTarget(event: PlatformEvent): RecentEventTarget {
  if (event.category_key === "transit" || event.category_key === "traffic") {
    return {
      mobilityTab: event.category_key,
      navKey: "mobility",
    };
  }

  return { navKey: event.category_key };
}

function compactList(values: string[], maxItems: number): string {
  if (values.length <= maxItems) {
    return values.join(", ");
  }

  return `${values.slice(0, maxItems).join(", ")} +${values.length - maxItems}`;
}

export function recentEventDetails(
  event: PlatformEvent,
  language: LanguageMode,
  tKey: (key: string) => string,
  timezone?: string,
): RecentEventDetail[] {
  const details: RecentEventDetail[] = [];
  const place =
    attributeText(event, "place_name") ??
    attributeText(event, "location_description") ??
    attributeText(event, "worst_station");
  const routes = attributeList(event, "route_ids");
  const stops = attributeList(event, "stop_ids");
  const trips = attributeList(event, "trip_ids");
  const cause = attributeText(event, "cause");
  const effect = attributeText(event, "effect");
  const provider = attributeText(event, "provider");
  const airQualityScore = attributeNumber(event, "worst_score");
  const warningSeverity = attributeText(event, "warning_severity");
  const peakGust = attributeNumber(event, "peak_gust_ms");
  const visibility = attributeNumber(event, "visibility_m");
  const peakPrecip = attributeNumber(event, "peak_precip_mm");
  const totalPrecip = attributeNumber(event, "total_precip_mm");

  if (place) {
    details.push({ key: "place", label: tKey("shell.location"), value: place });
  }
  if (airQualityScore !== null) {
    details.push({
      key: "air_quality_score",
      label: tKey("shell.aqScore"),
      value: `${Math.round(airQualityScore)}/5`,
    });
  }
  if (warningSeverity) {
    details.push({
      key: "warning",
      label: tKey("shell.warning"),
      value: titleCase(warningSeverity),
    });
  }
  if (peakGust !== null) {
    details.push({
      key: "peak_gust",
      label: tKey("shell.peakGust"),
      value: `${formatCompactNumber(peakGust)} m/s`,
    });
  }
  if (visibility !== null) {
    details.push({
      key: "visibility",
      label: tKey("shell.visibility"),
      value: `${formatCompactNumber(visibility / 1000)} km`,
    });
  }
  if (peakPrecip !== null) {
    details.push({
      key: "peak_precip",
      label: tKey("shell.peakRain"),
      value: `${formatCompactNumber(peakPrecip)} mm/h`,
    });
  }
  if (totalPrecip !== null) {
    details.push({
      key: "total_precip",
      label: tKey("shell.rainTotal"),
      value: `${formatCompactNumber(totalPrecip)} mm`,
    });
  }
  if (routes.length > 0) {
    details.push({ key: "routes", label: tKey("shell.eventRoutes"), value: compactList(routes, 4) });
  }
  if (stops.length > 0) {
    details.push({ key: "stops", label: tKey("shell.eventStops"), value: compactList(stops, 3) });
  }
  if (trips.length > 0) {
    details.push({ key: "trips", label: tKey("shell.eventTrips"), value: compactList(trips, 2) });
  }
  if (cause) {
    details.push({ key: "cause", label: tKey("shell.cause"), value: cause });
  }
  if (effect) {
    details.push({ key: "effect", label: tKey("shell.effect"), value: effect });
  }
  if (attributeBoolean(event, "is_free")) {
    details.push({ key: "ticketing", label: tKey("shell.ticketing"), value: tKey("shell.free") });
  }
  if (provider) {
    details.push({ key: "provider", label: tKey("shell.provider"), value: provider });
  }

  details.push({
    key: "until",
    label: tKey("shell.until"),
    value: formatTimestamp(event.ends_at, "dateTime", language, timezone),
  });

  return details.slice(0, 4);
}
