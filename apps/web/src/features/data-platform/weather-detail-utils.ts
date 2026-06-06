import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import { localizedContent } from "./content-localization";
import { localizedPlatformCopy } from "./platform-copy";

import type { LanguageMode } from "./i18n";
import type { TrendChartPoint } from "./lazy-trend-chart";
import type {
  PlatformCategory,
  PlatformEvent,
  PlatformHistoricalSnapshot,
  WeatherDataStage,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherRainWindow,
  WeatherWarning,
} from "./types";
import type { CurrentMetricCard, TimelineItem } from "./weather-detail-types";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const OUTDOOR_MAX_GUST_MS = 14;
const OUTDOOR_MIN_VISIBILITY_M = 5000;
const HEAVY_RAIN_PEAK_MM = 5;
const HEAVY_RAIN_TOTAL_MM = 15;

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

export function displayRegion(value: string | null | undefined, tKey: (key: string) => string): string {
  const location = value?.trim();
  if (!location || location.toLowerCase() === "helsinki") {
    return tKey("weather.helsinkiMeteorologicalRegion");
  }

  return location
    .split(/\s+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatDegree(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${formatNumber(value, 1)}°`;
}

export function formatCompactTime(value: string | null | undefined, language: LanguageMode = "en"): string {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

export function liveStatusTone(status: string | null | undefined): "ready" | "stale" | "empty" {
  if (status === "ready" || status === "summary_only") {
    return "ready";
  }
  if (status === "stale") {
    return "stale";
  }
  return "empty";
}

export function exactDataTime(value: string | null | undefined, language: LanguageMode, tKey: (key: string) => string): string {
  if (!value) {
    return tKey("weather.notObserved");
  }

  return `${formatTimestamp(value, "dateTime", language)} (${formatRelativeAge(value, language)})`;
}

export function formatTimelineTime(value: string | null | undefined, language: LanguageMode): string {
  if (!value) {
    return "PENDING";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(new Date(value))
    .toUpperCase();
}

export function pointTime(point: WeatherForecastPoint): number {
  return new Date(point.timestamp).getTime();
}

export function orderedPoints(points: WeatherForecastPoint[]): WeatherForecastPoint[] {
  return [...points].sort((left, right) => pointTime(left) - pointTime(right));
}

export function forecastWindow(points: WeatherForecastPoint[], limit = 50): WeatherForecastPoint[] {
  const ordered = orderedPoints(points);
  const now = Date.now();
  const upcoming = ordered.filter((point) => pointTime(point) >= now);
  return (upcoming.length > 0 ? upcoming : ordered).slice(0, limit);
}

export function latestPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
  if (points.length === 0) {
    return null;
  }

  const now = Date.now();
  const ordered = orderedPoints(points);
  return (
    ordered.find((point) => pointTime(point) >= now) ??
    ordered.reduce((latest, point) => (pointTime(point) > pointTime(latest) ? point : latest))
  );
}

export function pointThreeHoursEarlier(
  points: WeatherForecastPoint[],
  current: WeatherForecastPoint | null
): WeatherForecastPoint | null {
  if (!current) {
    return null;
  }

  const target = pointTime(current) - 3 * 60 * 60 * 1000;
  const earlier = orderedPoints(points).filter((point) => pointTime(point) <= target);
  return earlier[earlier.length - 1] ?? null;
}

export function pointThreeHoursLater(
  points: WeatherForecastPoint[],
  current: WeatherForecastPoint | null
): WeatherForecastPoint | null {
  if (!current) {
    return null;
  }

  const target = pointTime(current) + 3 * 60 * 60 * 1000;
  return orderedPoints(points).find((point) => pointTime(point) >= target) ?? null;
}

export function apparentTemperature(point: WeatherForecastPoint | null): number | null {
  const temp = point?.temperature_c;
  if (temp === null || temp === undefined) {
    return null;
  }

  const windKmh = (point?.wind_speed_ms ?? 0) * 3.6;
  if (temp <= 10 && windKmh > 4.8) {
    return (
      13.12 +
      0.6215 * temp -
      11.37 * Math.pow(windKmh, 0.16) +
      0.3965 * temp * Math.pow(windKmh, 0.16)
    );
  }

  return temp;
}

export function conditionForPoint(point: WeatherForecastPoint | null, tKey: (key: string) => string): { icon: string; label: string } {
  if (!point) {
    return { icon: "cloud_sync", label: tKey("weather.awaitingForecast") };
  }

  const precipitation = point.precipitation_mm ?? 0;
  const temperature = point.temperature_c ?? 5;
  const cloud = point.cloud_cover_pct ?? 100;
  const gust = point.wind_gust_ms ?? point.wind_speed_ms ?? 0;

  if (precipitation >= 0.3 && temperature <= 1) {
    return { icon: "cloudy_snowing", label: tKey("weather.lightSnowOvercast") };
  }
  if (precipitation >= 0.3) {
    return { icon: "rainy", label: tKey("weather.rainLowCloud") };
  }
  if (gust >= OUTDOOR_MAX_GUST_MS) {
    return { icon: "air", label: tKey("weather.windAdvisoryConditions") };
  }
  if (cloud >= 75) {
    return { icon: "cloud", label: tKey("weather.overcast") };
  }
  if (cloud <= 30) {
    return { icon: "clear_day", label: tKey("weather.clearSpell") };
  }

  return { icon: "partly_cloudy_day", label: tKey("weather.partlyCloudy") };
}

export function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

export function compassDirection(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) {
    return "n/a";
  }

  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW"
  ];
  return directions[Math.round(degrees / 22.5) % directions.length];
}

export function warningTone(warning: WeatherWarning): TimelineItem["tone"] {
  const severity = warning.severity?.toLowerCase() ?? "";
  if (severity.includes("high") || severity.includes("severe") || severity.includes("red")) {
    return "bad";
  }
  if (severity.includes("medium") || severity.includes("yellow") || severity.includes("warn")) {
    return "warn";
  }
  return "neutral";
}

export function eventTone(event: PlatformEvent): TimelineItem["tone"] {
  if (event.severity.toUpperCase() === "HIGH") {
    return "bad";
  }
  if (event.severity.toUpperCase() === "MEDIUM") {
    return "warn";
  }
  if (event.severity.toUpperCase() === "LOW") {
    return "good";
  }
  return "neutral";
}

export function peakGustPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
  return (
    [...points]
      .filter((point) => point.wind_gust_ms !== null || point.wind_speed_ms !== null)
      .sort(
        (left, right) =>
          (right.wind_gust_ms ?? right.wind_speed_ms ?? 0) -
          (left.wind_gust_ms ?? left.wind_speed_ms ?? 0),
      )[0] ?? null
  );
}

export function lowestVisibilityPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
  return (
    [...points]
      .filter((point) => point.visibility_m !== null)
      .sort(
        (left, right) =>
          (left.visibility_m ?? Number.MAX_SAFE_INTEGER) -
          (right.visibility_m ?? Number.MAX_SAFE_INTEGER),
      )[0] ?? null
  );
}

export function strongestRainWindow(windows: WeatherRainWindow[]): WeatherRainWindow | null {
  return (
    [...windows].sort(
      (left, right) =>
        Math.max(right.peak_precip_mm, right.total_precip_mm / Math.max(right.hours, 1)) -
        Math.max(left.peak_precip_mm, left.total_precip_mm / Math.max(left.hours, 1)),
    )[0] ?? null
  );
}

export function buildTimelineItems(
  weather: WeatherForecastResponse | null,
  category: PlatformCategory | null,
  language: LanguageMode,
  tKey: (key: string) => string,
  highlightedEventId?: string | null
): TimelineItem[] {
  const now = Date.now();
  const isActiveWindow = (startsAt: string, endsAt: string): boolean => {
    const startTime = new Date(startsAt).getTime();
    const endTime = new Date(endsAt).getTime();
    return Number.isFinite(startTime) && Number.isFinite(endTime) && startTime <= now && endTime >= now;
  };
  const warningItems =
    weather?.warnings.map((warning, index) => ({
      id: `warning-${index}-${warning.title}`,
      time: warning.published_at ? formatTimelineTime(warning.published_at, language) : tKey("weather.activeNow"),
      title: warning.title,
      body: warning.description ?? tKey("weather.weatherWarningFromTheProviderFeed"),
      tone: warningTone(warning),
      active: true
    })) ?? [];

  const eventItems =
    category?.events
      .filter((event) => !/no active outdoor conditions|data will appear/i.test(`${event.title} ${event.body}`))
      .map((event) => {
        const startsAt = new Date(event.starts_at).getTime();
        const endsAt = new Date(event.ends_at).getTime();
        return {
          id: event.id,
          time: startsAt <= now && endsAt >= now ? tKey("weather.activeNow") : formatTimelineTime(event.starts_at, language),
          title: localizedContent(language, event.title, event.title_zh),
          body: localizedContent(language, event.body, event.body_zh),
          tone: eventTone(event),
          active: startsAt <= now && endsAt >= now
        };
      }) ?? [];

  const syntheticItems: TimelineItem[] = [];
  const gustPoint = peakGustPoint(weather?.points ?? []);
  const peakGust = gustPoint?.wind_gust_ms ?? gustPoint?.wind_speed_ms ?? null;
  const visibilityPoint = lowestVisibilityPoint(weather?.points ?? []);
  const minVisibility = visibilityPoint?.visibility_m ?? null;
  const rainWindow = strongestRainWindow(weather?.rain_windows ?? []);

  if (gustPoint && peakGust !== null && peakGust >= OUTDOOR_MAX_GUST_MS) {
    const gustEndsAt = new Date(new Date(gustPoint.timestamp).getTime() + 3 * 60 * 60 * 1000).toISOString();
    syntheticItems.push({
      id: "gust-advisory",
      time: formatTimelineTime(gustPoint.timestamp, language),
      title: tKey("weather.highWindAdvisory"),
      body: `${tKey("weather.gustsNear")} ${formatNumber(peakGust)} m/s ${tKey("weather.acrossTheForecastWindow")}`,
      tone: "warn",
      active: isActiveWindow(gustPoint.timestamp, gustEndsAt)
    });
  }
  if (visibilityPoint && minVisibility !== null && minVisibility < OUTDOOR_MIN_VISIBILITY_M) {
    const visibilityEndsAt = new Date(new Date(visibilityPoint.timestamp).getTime() + 3 * 60 * 60 * 1000).toISOString();
    syntheticItems.push({
      id: "visibility-advisory",
      time: formatTimelineTime(visibilityPoint.timestamp, language),
      title: tKey("weather.reducedVisibility"),
      body: `${tKey("weather.visibilityIs")} ${formatNumber(minVisibility / 1000)} km. ${tKey("weather.slowMovementWindowsMayNeedExtraMargin")}`,
      tone: "bad",
      active: isActiveWindow(visibilityPoint.timestamp, visibilityEndsAt)
    });
  }
  if (
    rainWindow &&
    (rainWindow.peak_precip_mm >= HEAVY_RAIN_PEAK_MM ||
      rainWindow.total_precip_mm >= HEAVY_RAIN_TOTAL_MM)
  ) {
    syntheticItems.push({
      id: "rain-advisory",
      time: formatTimelineTime(rainWindow.starts_at, language),
      title: tKey("weather.heavyRainAdvisory"),
      body: `${tKey("weather.peakRain")} ${formatNumber(rainWindow.peak_precip_mm)} mm/h · ${tKey("weather.rainTotal")} ${formatNumber(rainWindow.total_precip_mm)} mm.`,
      tone: "warn",
      active: isActiveWindow(rainWindow.starts_at, rainWindow.ends_at)
    });
  }

  if (warningItems.length + eventItems.length + syntheticItems.length === 0) {
    syntheticItems.push({
      id: "system-clearance",
      time: weather?.valid_to ? formatTimelineTime(weather.valid_to, language) : tKey("weather.nextWindow"),
      title: tKey("weather.systemClearance"),
      body: localizedPlatformCopy(weather?.summary, language) ?? tKey("weather.noActiveWarningOrDisruptionEventIsPresentInTheCurrentWeatherFeed"),
      tone: "good",
      active: false
    });
  }

  const items = [...warningItems, ...syntheticItems, ...eventItems];
  const visibleItems = items.slice(0, 5);
  const highlightedItem = highlightedEventId
    ? items.find((item) => item.id === highlightedEventId)
    : null;
  if (highlightedItem && !visibleItems.some((item) => item.id === highlightedItem.id)) {
    return [highlightedItem, ...visibleItems].slice(0, 5);
  }

  return visibleItems;
}

export function metricValue(weather: WeatherForecastResponse | null, key: string): string {
  const metric = weather?.metrics.find((item) => item.key === key);
  if (!metric) {
    return "n/a";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export function metricByKey(weather: WeatherForecastResponse, key: string): string | null {
  const metric = weather.metrics.find((item) => item.key === key);
  if (!metric || metric.value === "n/a") {
    return null;
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export function fieldCoverageLabel(weather: WeatherForecastResponse, tKey: (key: string) => string): string {
  const missing = weather.quality.missing_fields;
  if (missing.length === 0) {
    return tKey("weather.allTrackedFieldsPresent");
  }

  return `${tKey("weather.missing")} ${missing.join(", ")}`;
}

export function sourceTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ready" || status === "fetched") {
    return "good";
  }
  if (status === "missing" || status === "not_collected" || status === "empty" || status === "stale") {
    return "warn";
  }
  if (status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
}

export function formatRainWindow(window: WeatherRainWindow, language: LanguageMode, tKey: (key: string) => string): string {
  return `${formatCompactTime(window.starts_at, language)} ${tKey("weather.to")} ${formatCompactTime(window.ends_at, language)}`;
}

export function maxRainWindowTotal(windows: WeatherRainWindow[]): number {
  return Math.max(0.1, ...windows.map((window) => window.total_precip_mm));
}

export function stageProgress(stage: WeatherDataStage): number {
  if (stage.status === "ready") {
    return 100;
  }
  if (stage.status === "empty" || stage.status === "missing") {
    return 20;
  }
  return 55;
}

export function sourceRequestHost(endpoint: string | null, tKey: (key: string) => string): string {
  if (!endpoint) {
    return tKey("weather.endpointNotRecorded");
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

export function currentMetricCards(current: WeatherForecastPoint | null, language: LanguageMode, tKey: (key: string) => string): CurrentMetricCard[] {
  if (!current) {
    return [];
  }

  return [
    hasNumber(current.wind_speed_ms)
      ? {
          key: "wind",
          icon: "air",
          label: tKey("weather.wind"),
          value: formatNumber(current.wind_speed_ms, 1),
          unit: "m/s",
          detail: `${tKey("weather.dir")}: ${compassDirection(current.wind_direction_deg)} (${formatNumber(current.wind_direction_deg, 0)}°)`,
          progress: Math.min(100, (current.wind_speed_ms / 26) * 100),
          tone: "primary"
        }
      : null,
    hasNumber(current.wind_gust_ms)
      ? {
          key: "gust",
          icon: "storm",
          label: tKey("weather.maxGust"),
          value: formatNumber(current.wind_gust_ms, 1),
          unit: "m/s",
          detail: `${tKey("weather.peak")}: ${formatCompactTime(current.timestamp, language)}`,
          progress: Math.min(100, (current.wind_gust_ms / 26) * 100),
          tone: current.wind_gust_ms >= OUTDOOR_MAX_GUST_MS ? "warn" : "primary"
        }
      : null,
    hasNumber(current.humidity_pct)
      ? {
          key: "humidity",
          icon: "humidity_percentage",
          label: tKey("weather.humidity"),
          value: formatNumber(current.humidity_pct, 0),
          unit: "%",
          detail: hasNumber(current.dew_point_c) ? `${tKey("weather.dewPoint2")} ${formatDegree(current.dew_point_c)}` : tKey("weather.dewPointUnavailable"),
          progress: Math.min(100, current.humidity_pct),
          tone: "humidity"
        }
      : null,
    hasNumber(current.pressure_hpa)
      ? {
          key: "pressure",
          icon: "speed",
          label: tKey("weather.pressure"),
          value: formatNumber(current.pressure_hpa, 0),
          unit: "hPa",
          detail: tKey("weather.seaLevelPressureSignal"),
          progress: Math.max(8, Math.min(100, ((current.pressure_hpa - 960) / 90) * 100)),
          tone: "pressure"
        }
      : null,
    hasNumber(current.visibility_m)
      ? {
          key: "visibility",
          icon: "visibility",
          label: tKey("weather.visibility"),
          value: formatNumber(current.visibility_m / 1000, 1),
          unit: "km",
          detail: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? tKey("weather.reduced") : tKey("weather.operational"),
          progress: Math.max(8, Math.min(100, (current.visibility_m / 30000) * 100)),
          tone: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? "warn" : "visibility"
        }
      : null,
    hasNumber(current.cloud_cover_pct)
      ? {
          key: "cloud",
          icon: "cloud",
          label: tKey("weather.cloudCover"),
          value: formatNumber(current.cloud_cover_pct, 0),
          unit: "%",
          detail: `FMI ${tKey("weather.symbol")} ${current.weather_symbol ?? "n/a"} / smart ${current.smart_symbol ?? "n/a"}`,
          progress: Math.min(100, current.cloud_cover_pct),
          tone: "cloud"
        }
      : null
  ].filter((item): item is CurrentMetricCard => item !== null);
}

export function formatHistoryDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(parsed)
    .toUpperCase();
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function weatherHistoryPoints(
  history: PlatformHistoricalSnapshot<WeatherForecastResponse>[],
  tKey: (key: string) => string,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    const temperatures = data.points
      .map((point) => point.temperature_c)
      .filter(hasNumber);
    const averageTemperature = average(temperatures);
    if (averageTemperature === null) {
      return [];
    }

    const totalRain = data.points.reduce(
      (sum, point) => sum + (point.precipitation_mm ?? 0),
      0
    );

    return [
      {
        label: formatHistoryDate(snapshot.date),
        value: averageTemperature,
        detail: tKey("weather.historyPointDetail")
          .replace("{rain}", formatNumber(totalRain, 1))
          .replace("{points}", String(data.quality.point_count))
      }
    ];
  });
}
