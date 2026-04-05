import { formatTimestamp } from "@/features/shared/format";

import type { LanguageMode } from "./i18n";
import type {
  AirQualityCurrentResponse,
  PlatformEvent,
  WeatherForecastResponse,
  WeatherWarning,
} from "./types";

export const RECENT_EVENT_LIMIT = 6;

type RecentEventTarget = {
  mobilityTab?: "traffic" | "transit";
  navKey: string;
};

type CuratedRecentEventOptions = {
  city?: string | null;
};

export type RecentEventDetail = {
  key: string;
  label: string;
  value: string;
};

const CATEGORY_USEFULNESS: Record<string, number> = {
  air: 78,
  city_services: 58,
  energy: 64,
  events: 38,
  traffic: 86,
  transit: 88,
  water: 72,
  weather: 82,
};

const SOURCE_USEFULNESS: Record<string, number> = {
  digitraffic: 22,
  digitransit: 24,
  fingrid: 14,
  fmi: 22,
  hsy: 20,
  linkedevents: 6,
  porssisahko: 18,
  servicemap: 14,
  syke: 18,
};

const EVENT_TYPE_USEFULNESS: Record<string, number> = {
  air_quality_poor: 36,
  air_quality_status: 18,
  blue_green_algae: 24,
  cheap_energy_window: 24,
  drought_risk: 24,
  facility_availability: 12,
  flood_warning: 42,
  heavy_rain: 46,
  high_wind: 48,
  marine_disruption: 24,
  public_event: 10,
  rail_delay: 34,
  rain_risk: 30,
  reduced_visibility: 42,
  road_disruption: 38,
  road_weather_risk: 34,
  service_closure: 30,
  snow_load: 28,
  transit_delay: 32,
  transit_disruption: 40,
  weather_warning: 54,
  weather_outlook: 18,
};

const SEVERITY_USEFULNESS: Record<string, number> = {
  HIGH: 48,
  INFO: 0,
  LOW: 12,
  MEDIUM: 30,
};

const CITY_RELEVANCE_TERMS: Record<string, string[]> = {
  espoo: ["espoo", "kauniainen", "kirkkonummi", "helsinki", "vantaa"],
  helsinki: [
    "helsinki",
    "espoo",
    "vantaa",
    "kauniainen",
    "kerava",
    "kirkkonummi",
    "sipoo",
    "tuusula",
  ],
  oulu: ["oulu"],
  tampere: ["tampere"],
  turku: ["turku"],
  vantaa: ["vantaa", "helsinki", "espoo", "kauniainen", "kerava", "tuusula"],
};

const CITY_CENTERS: Record<string, { latitude: number; longitude: number; radiusKm: number }> = {
  espoo: { latitude: 60.2055, longitude: 24.6559, radiusKm: 32 },
  helsinki: { latitude: 60.1699, longitude: 24.9384, radiusKm: 32 },
  oulu: { latitude: 65.0121, longitude: 25.4651, radiusKm: 30 },
  tampere: { latitude: 61.4978, longitude: 23.761, radiusKm: 30 },
  turku: { latitude: 60.4518, longitude: 22.2666, radiusKm: 30 },
  vantaa: { latitude: 60.2934, longitude: 25.0378, radiusKm: 32 },
};

const NOISE_PATTERN =
  /no active|data will appear here after|placeholder|system clearance|nominal for the current view/i;

const HIGH_WIND_GUST_MS = 14;
const SEVERE_WIND_GUST_MS = 20;
const LOW_VISIBILITY_M = 5000;
const SEVERE_VISIBILITY_M = 1000;
const HEAVY_RAIN_PEAK_MM = 5;
const HEAVY_RAIN_TOTAL_MM = 15;
const POOR_AIR_QUALITY_SCORE = 4;

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

function attributeNumberList(event: PlatformEvent, key: string): number[] {
  const value = attributeValue(event, key);
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter(Number.isFinite);
}

function attributeBoolean(event: PlatformEvent, key: string): boolean {
  return attributeValue(event, key) === true;
}

function normalizedCity(value: string | null | undefined): string | null {
  const normalizedValue = (value ?? "").trim().toLowerCase().replaceAll(" ", "_");
  return normalizedValue ? normalizedValue : null;
}

function attributeSearchText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(attributeSearchText).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(attributeSearchText).join(" ");
  }

  return "";
}

function eventSearchText(event: PlatformEvent): string {
  return [
    event.id,
    event.title,
    event.body,
    event.source_codes.join(" "),
    event.evidence.join(" "),
    attributeSearchText(event.attributes),
  ]
    .join(" ")
    .toLowerCase();
}

function warningSeverityRank(warning: WeatherWarning): number {
  const severity = (warning.severity ?? "").toLowerCase();
  if (severity.includes("red")) {
    return 3;
  }
  if (severity.includes("orange")) {
    return 2;
  }
  if (severity.includes("yellow")) {
    return 1;
  }

  const text = warning.title.toLowerCase();
  if (/red|extreme/.test(text)) {
    return 3;
  }
  if (/orange|high|severe/.test(text)) {
    return 2;
  }
  if (/yellow|warn|advisory/.test(text)) {
    return 1;
  }

  return 0;
}

function warningEventSeverity(warning: WeatherWarning): PlatformEvent["severity"] {
  const rank = warningSeverityRank(warning);
  if (rank >= 2) {
    return "HIGH";
  }
  if (rank === 1) {
    return "MEDIUM";
  }

  return "LOW";
}

function isWeatherWarningRelevant(
  warning: WeatherWarning,
  options: CuratedRecentEventOptions,
): boolean {
  const rank = warningSeverityRank(warning);
  if (rank >= 2) {
    return true;
  }

  const city = normalizedCity(options.city);
  const text = `${warning.title} ${warning.description ?? ""}`.toLowerCase();
  if (/whole country|entire country|all land areas/.test(text)) {
    return true;
  }
  if (!city) {
    return rank > 0;
  }

  const terms = CITY_RELEVANCE_TERMS[city] ?? [city];
  const regionalTerms = city === "helsinki" || city === "espoo" || city === "vantaa"
    ? ["uusimaa", "capital region", "metropolitan area", "southern part of the country"]
    : [];

  return [...terms, ...regionalTerms].some((term) => text.includes(term));
}

function isoFromTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function isoPlusHours(value: string, hours: number): string {
  const timestamp = new Date(value).getTime();
  const base = Number.isFinite(timestamp) ? timestamp : Date.now();

  return new Date(base + hours * 60 * 60 * 1000).toISOString();
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

export function buildWeatherRecentEvents(
  weather: WeatherForecastResponse | null,
  options: CuratedRecentEventOptions = {},
): PlatformEvent[] {
  if (!weather) {
    return [];
  }

  const checkedAt = isoFromTimestamp(weather.checked_at, new Date().toISOString());
  const fallbackEnd = weather.valid_to ?? isoPlusHours(checkedAt, 48);
  const warningEvents = weather.warnings
    .map((warning, index) => ({ warning, index }))
    .filter(({ warning }) => isWeatherWarningRelevant(warning, options))
    .sort((left, right) => warningSeverityRank(right.warning) - warningSeverityRank(left.warning))
    .slice(0, 2)
    .map(({ warning, index }) => ({
      id: `warning-${index}-${warning.title}`,
      category_key: "weather",
      event_type: "weather_warning",
      title: warning.title,
      body: warning.description ?? "Official weather warning from FMI.",
      severity: warningEventSeverity(warning),
      starts_at: isoFromTimestamp(warning.published_at, checkedAt),
      ends_at: isoFromTimestamp(fallbackEnd, isoPlusHours(checkedAt, 48)),
      source_codes: ["fmi"],
      evidence: ["FMI warning feed (fmi)", "Event type: weather_warning"],
      attributes: {
        event_type: "weather_warning",
        info_url: warning.link,
        provider: "FMI",
        warning_severity: warning.severity ?? "warning",
      },
    }));

  const strongestGustPoint = [...weather.points]
    .filter((point) => point.wind_gust_ms !== null || point.wind_speed_ms !== null)
    .sort(
      (left, right) =>
        (right.wind_gust_ms ?? right.wind_speed_ms ?? 0) -
        (left.wind_gust_ms ?? left.wind_speed_ms ?? 0),
    )[0];
  const strongestGust =
    strongestGustPoint?.wind_gust_ms ?? strongestGustPoint?.wind_speed_ms ?? null;

  const lowestVisibilityPoint = [...weather.points]
    .filter((point) => point.visibility_m !== null)
    .sort((left, right) => (left.visibility_m ?? Infinity) - (right.visibility_m ?? Infinity))[0];
  const lowestVisibility = lowestVisibilityPoint?.visibility_m ?? null;

  const strongestRainWindow = [...weather.rain_windows].sort(
    (left, right) =>
      Math.max(right.peak_precip_mm, right.total_precip_mm / Math.max(right.hours, 1)) -
      Math.max(left.peak_precip_mm, left.total_precip_mm / Math.max(left.hours, 1)),
  )[0];

  const syntheticEvents: PlatformEvent[] = [];
  if (strongestGustPoint && strongestGust !== null && strongestGust >= HIGH_WIND_GUST_MS) {
    syntheticEvents.push({
      id: "gust-advisory",
      category_key: "weather",
      event_type: "high_wind",
      title: "High Wind Advisory",
      body: `Forecast gusts may reach ${formatCompactNumber(strongestGust)} m/s. Outdoor movement and exposed routes may need extra margin.`,
      severity: strongestGust >= SEVERE_WIND_GUST_MS ? "HIGH" : "MEDIUM",
      starts_at: strongestGustPoint.timestamp,
      ends_at: isoPlusHours(strongestGustPoint.timestamp, 3),
      source_codes: ["fmi"],
      evidence: ["FMI forecast (fmi)", "Event type: high_wind"],
      attributes: {
        event_type: "high_wind",
        peak_gust_ms: strongestGust,
        provider: "FMI",
      },
    });
  }

  if (
    lowestVisibilityPoint &&
    lowestVisibility !== null &&
    lowestVisibility < LOW_VISIBILITY_M
  ) {
    syntheticEvents.push({
      id: "visibility-advisory",
      category_key: "weather",
      event_type: "reduced_visibility",
      title: "Reduced Visibility",
      body: `Forecast visibility may drop to ${formatCompactNumber(lowestVisibility / 1000)} km. Leave more time for outdoor movement.`,
      severity: lowestVisibility < SEVERE_VISIBILITY_M ? "HIGH" : "MEDIUM",
      starts_at: lowestVisibilityPoint.timestamp,
      ends_at: isoPlusHours(lowestVisibilityPoint.timestamp, 3),
      source_codes: ["fmi"],
      evidence: ["FMI forecast (fmi)", "Event type: reduced_visibility"],
      attributes: {
        event_type: "reduced_visibility",
        provider: "FMI",
        visibility_m: lowestVisibility,
      },
    });
  }

  if (
    strongestRainWindow &&
    (strongestRainWindow.peak_precip_mm >= HEAVY_RAIN_PEAK_MM ||
      strongestRainWindow.total_precip_mm >= HEAVY_RAIN_TOTAL_MM)
  ) {
    syntheticEvents.push({
      id: "rain-advisory",
      category_key: "weather",
      event_type: "heavy_rain",
      title: "Heavy Rain Advisory",
      body: `Forecast rain may peak near ${formatCompactNumber(strongestRainWindow.peak_precip_mm)} mm/h with ${formatCompactNumber(strongestRainWindow.total_precip_mm)} mm total.`,
      severity: strongestRainWindow.total_precip_mm >= 30 ? "HIGH" : "MEDIUM",
      starts_at: strongestRainWindow.starts_at,
      ends_at: strongestRainWindow.ends_at,
      source_codes: ["fmi"],
      evidence: ["FMI forecast (fmi)", "Event type: heavy_rain"],
      attributes: {
        event_type: "heavy_rain",
        peak_precip_mm: strongestRainWindow.peak_precip_mm,
        provider: "FMI",
        total_precip_mm: strongestRainWindow.total_precip_mm,
      },
    });
  }

  return [...warningEvents, ...syntheticEvents];
}

function airQualityLabel(score: number, fallback: string | null | undefined): string {
  const labels = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];
  return labels[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "Poor";
}

export function buildAirQualityRecentEvents(
  airQuality: AirQualityCurrentResponse | null,
): PlatformEvent[] {
  const score = airQuality?.worst_score;
  if (score === null || score === undefined || score < POOR_AIR_QUALITY_SCORE) {
    return [];
  }

  const observedAt = isoFromTimestamp(
    airQuality?.observed_at,
    isoFromTimestamp(airQuality?.checked_at, new Date().toISOString()),
  );
  const validTo = isoFromTimestamp(airQuality?.valid_to, isoPlusHours(observedAt, 3));
  const label = airQualityLabel(score, airQuality?.worst_label);
  const station = airQuality?.worst_station ?? "the worst reporting HSY station";

  return [
    {
      id: "air-quality-advisory",
      category_key: "air",
      event_type: "air_quality_poor",
      title: `${label} air quality detected`,
      body: `${station} is reporting ${label.toLowerCase()} air quality (${Math.round(score)}/5). Sensitive groups may want to reduce exposure near busy roads.`,
      severity: score >= 5 ? "HIGH" : "MEDIUM",
      starts_at: observedAt,
      ends_at: validTo,
      source_codes: ["hsy"],
      evidence: ["HSY air-quality stations (hsy)", "Event type: air_quality_poor"],
      attributes: {
        event_type: "air_quality_poor",
        provider: "HSY",
        worst_label: airQuality?.worst_label ?? label,
        worst_score: score,
        worst_station: airQuality?.worst_station,
      },
    },
  ];
}

function distanceKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number): number => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function eventGeometryCenter(
  event: PlatformEvent,
): { latitude: number; longitude: number } | null {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] =
    attributeNumberList(event, "geometry_bbox");

  if (
    minLongitude === undefined ||
    minLatitude === undefined ||
    maxLongitude === undefined ||
    maxLatitude === undefined
  ) {
    return null;
  }

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
  };
}

function isCityRelevantEvent(
  event: PlatformEvent,
  options: CuratedRecentEventOptions,
): boolean {
  if (event.category_key !== "traffic") {
    return true;
  }

  const city = normalizedCity(options.city);
  if (!city) {
    return true;
  }

  const cityCenter = CITY_CENTERS[city];
  const eventCenter = eventGeometryCenter(event);
  if (cityCenter && eventCenter) {
    return distanceKm(cityCenter, eventCenter) <= cityCenter.radiusKm;
  }

  const terms = CITY_RELEVANCE_TERMS[city] ?? [city];
  const text = eventSearchText(event);

  return terms.some((term) => text.includes(term));
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

function startsAtMs(event: PlatformEvent): number {
  const value = new Date(event.starts_at).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function endsAtMs(event: PlatformEvent): number {
  const value = new Date(event.ends_at).getTime();
  return Number.isFinite(value) ? value : startsAtMs(event);
}

function isActiveAt(event: PlatformEvent, now: number): boolean {
  return startsAtMs(event) <= now && endsAtMs(event) >= now;
}

function relevantTimeMs(event: PlatformEvent, now: number): number {
  if (isActiveAt(event, now)) {
    return endsAtMs(event);
  }

  return startsAtMs(event);
}

function hoursUntilStart(event: PlatformEvent, now: number): number {
  return (startsAtMs(event) - now) / (60 * 60 * 1000);
}

function hoursUntilEnd(event: PlatformEvent, now: number): number {
  return (endsAtMs(event) - now) / (60 * 60 * 1000);
}

function hasConcreteDetails(event: PlatformEvent): boolean {
  return Boolean(
    attributeText(event, "place_name") ||
      attributeText(event, "location_description") ||
      attributeText(event, "provider") ||
      attributeText(event, "info_url") ||
      attributeList(event, "route_ids").length > 0 ||
      attributeList(event, "stop_ids").length > 0 ||
      attributeList(event, "trip_ids").length > 0 ||
      attributeBoolean(event, "is_free"),
  );
}

function isNoiseEvent(event: PlatformEvent): boolean {
  return NOISE_PATTERN.test(`${event.id} ${event.title} ${event.body}`);
}

function isLongRunningBackgroundEvent(event: PlatformEvent, now: number): boolean {
  if (!isActiveAt(event, now)) {
    return false;
  }

  const daysSinceStart = (now - startsAtMs(event)) / (24 * 60 * 60 * 1000);
  const daysUntilEnd = (endsAtMs(event) - now) / (24 * 60 * 60 * 1000);

  return daysSinceStart > 21 && daysUntilEnd > 14;
}

function publicEventTimeBoost(event: PlatformEvent, now: number): number {
  if (event.category_key !== "events") {
    return 0;
  }

  const hours = hoursUntilStart(event, now);
  if (hours < -3 || hours > 36) {
    return -18;
  }

  return (attributeBoolean(event, "is_free") ? 12 : 0) + (hours <= 12 ? 10 : 4);
}

export function recentEventUsefulness(event: PlatformEvent, now = Date.now()): number {
  const type = eventType(event) ?? "";
  const starts = startsAtMs(event);
  const ends = endsAtMs(event);
  const isActive = starts <= now && ends >= now;
  const hours = hoursUntilStart(event, now);
  const endHours = hoursUntilEnd(event, now);
  const timeScore = isActive
    ? endHours <= 6
      ? 34
      : endHours <= 72
        ? 28
        : endHours <= 14 * 24
          ? 18
          : 6
    : hours >= 0 && hours <= 3
      ? 24
      : hours > 3 && hours <= 12
        ? 16
        : hours > 12 && hours <= 48
          ? 8
          : 0;
  const sourceScore = event.source_codes.reduce(
    (score, sourceCode) => score + (SOURCE_USEFULNESS[sourceCode] ?? 0),
    0,
  );

  return (
    (CATEGORY_USEFULNESS[event.category_key] ?? 24) +
    (EVENT_TYPE_USEFULNESS[type] ?? 0) +
    (SEVERITY_USEFULNESS[event.severity.toUpperCase()] ?? 0) +
    sourceScore +
    timeScore +
    (hasConcreteDetails(event) ? 10 : 0) +
    publicEventTimeBoost(event, now)
  );
}

export function curatedRecentEvents(
  events: PlatformEvent[],
  limit = RECENT_EVENT_LIMIT,
  options: CuratedRecentEventOptions = {},
): PlatformEvent[] {
  const now = Date.now();
  const earliestStart = now - 6 * 60 * 60 * 1000;
  const latestStart = now + 48 * 60 * 60 * 1000;
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()]
    .filter((event) => !isNoiseEvent(event))
    .filter((event) => isCityRelevantEvent(event, options))
    .filter((event) => !isLongRunningBackgroundEvent(event, now))
    .filter((event) => {
      const starts = startsAtMs(event);
      if (event.category_key === "events" && starts < earliestStart) {
        return false;
      }

      return (
        (starts >= earliestStart && starts <= latestStart) ||
        isActiveAt(event, now)
      );
    })
    .map((event) => ({
      event,
      score: recentEventUsefulness(event, now),
    }))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return startsAtMs(left.event) - startsAtMs(right.event);
    });

  const selected: PlatformEvent[] = [];
  const categoryCounts = new Map<string, number>();

  for (const candidate of uniqueEvents) {
    const categoryLimit = candidate.event.category_key === "events" ? 1 : 2;
    const categoryCount = categoryCounts.get(candidate.event.category_key) ?? 0;
    if (categoryCount >= categoryLimit) {
      continue;
    }

    selected.push(candidate.event);
    categoryCounts.set(candidate.event.category_key, categoryCount + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected.sort((left, right) => {
    const timeDiff = relevantTimeMs(left, now) - relevantTimeMs(right, now);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return startsAtMs(left) - startsAtMs(right);
  });
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
    value: formatTimestamp(event.ends_at, "dateTime", language),
  });

  return details.slice(0, 4);
}
