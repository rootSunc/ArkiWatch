import { formatNumber } from "../../model/workspace-format";
export { formatNumber } from "../../model/workspace-format";
import { localizedContent } from "../../model/content-localization";
import { formatHistoryDate } from "../../model/workspace-datetime";
import { localizedPlatformCopy } from "../../model/platform-copy";
export { liveStatusLabel, liveStatusTone } from "../../model/platform-status";
import { UNAVAILABLE_DATA_VALUE } from "../../model/data-value";
import { parseValidDate } from "@/features/shared/format";

import type { LanguageMode } from "../../i18n";
import type { TrendChartPoint } from "../lazy-trend-chart";
import type {
  PlatformCategory,
  PlatformEvent,
  PlatformHistoricalSnapshot,
  WeatherDataStage,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherRainWindow,
} from "../../types";
import type { CurrentMetricCard, TimelineItem } from "./weather-detail-types";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "../../model/data-timezone";
import { isHistoricalTimeScope, scopedDataTimestamp } from "../../model/data-time-scope";
import { type ScopedEventState } from "../../model/event-time-state";

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
    return UNAVAILABLE_DATA_VALUE;
  }

  return `${formatNumber(value, 1)}°`;
}

export function formatCompactTime(
  value: string | null | undefined,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return UNAVAILABLE_DATA_VALUE;
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return UNAVAILABLE_DATA_VALUE;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone)
  }).format(parsedDate);
}

export function exactDataTime(
  value: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
  timeScope?: WeatherForecastResponse["time_scope"],
): string {
  return scopedDataTimestamp(
    value,
    timeScope,
    language,
    tKey,
    "weather.notObserved",
    resolveDataTimezone(timeZone),
  );
}

export function formatTimeZoneName(
  value: string | null | undefined,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return "EET";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "EET";
  }

  const timeZoneName = new Intl.DateTimeFormat(
    language === "zh" ? "zh-CN" : "en-GB",
    {
      timeZone: resolveDataTimezone(timeZone),
      timeZoneName: "short",
    },
  )
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  return timeZoneName ?? "EET";
}

function formatTimelineTime(
  value: string | null | undefined,
  language: LanguageMode,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return "PENDING";
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return UNAVAILABLE_DATA_VALUE;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsedDate)
    .toUpperCase();
}

function pointTime(point: WeatherForecastPoint): number {
  return new Date(point.timestamp).getTime();
}

function referenceTimestamp(value: string | number | null | undefined): number {
  const timestamp = typeof value === "number" ? value : new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function orderedPoints(points: WeatherForecastPoint[]): WeatherForecastPoint[] {
  return [...points].sort((left, right) => pointTime(left) - pointTime(right));
}

export function forecastWindow(
  points: WeatherForecastPoint[],
  limit = 50,
  referenceAt?: string | number | null,
): WeatherForecastPoint[] {
  const ordered = orderedPoints(points);
  const reference = referenceTimestamp(referenceAt);
  const upcoming = ordered.filter((point) => pointTime(point) >= reference);
  return (upcoming.length > 0 ? upcoming : ordered).slice(0, limit);
}

export function latestPoint(
  points: WeatherForecastPoint[],
  referenceAt?: string | number | null,
): WeatherForecastPoint | null {
  if (points.length === 0) {
    return null;
  }

  const reference = referenceTimestamp(referenceAt);
  const ordered = orderedPoints(points);
  return (
    ordered.find((point) => pointTime(point) >= reference) ??
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
  return point?.assessment?.apparent_temperature_c ?? null;
}

export function conditionForPoint(point: WeatherForecastPoint | null, tKey: (key: string) => string): { icon: string; label: string } {
  const options: Record<string, [string, string]> = {
    snow: ["cloudy_snowing", "lightSnowOvercast"], rain: ["rainy", "rainLowCloud"],
    wind: ["air", "windAdvisoryConditions"], overcast: ["cloud", "overcast"],
    clear: ["clear_day", "clearSpell"], partly_cloudy: ["partly_cloudy_day", "partlyCloudy"],
    unavailable: ["cloud_sync", "awaitingForecast"],
  };
  const [icon, key] = options[point?.assessment?.condition ?? "unavailable"] ?? options.unavailable;
  return { icon, label: tKey(`weather.${key}`) };
}

export function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

export function compassDirection(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) {
    return UNAVAILABLE_DATA_VALUE;
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

export function buildTimelineItems(
  weather: WeatherForecastResponse | null,
  category: PlatformCategory | null,
  language: LanguageMode,
  tKey: (key: string) => string,
  highlightedEventId?: string | null,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TimelineItem[] {
  const isHistorical = isHistoricalTimeScope(weather?.time_scope);
  const stateLabel = (state: ScopedEventState): string => {
    if (state === "active") {
      return tKey(isHistorical ? "weather.activeAtSnapshot" : "weather.activeNow");
    }
    if (state === "upcoming") {
      return tKey(isHistorical ? "weather.upcomingAtSnapshot" : "weather.upcoming");
    }
    return tKey(isHistorical ? "weather.endedBeforeSnapshot" : "weather.ended");
  };
  const eventTimeLabel = (state: ScopedEventState, startsAt: string): string => {
    const status = stateLabel(state);
    return state === "active"
      ? status
      : `${status}, ${formatTimelineTime(startsAt, language, timeZone)}`;
  };
  const warningItems =
    weather?.warnings.map((warning, index) => ({
      id: `warning-${index}-${warning.title}`,
      time: isHistorical
        ? tKey("weather.warningCapturedAtSnapshot")
        : tKey("weather.activeNow"),
      title: warning.title,
      body: warning.description ?? tKey("weather.weatherWarningFromTheProviderFeed"),
      tone: (warning.tone ?? "neutral") as TimelineItem["tone"],
      active: !isHistorical,
    })) ?? [];

  const eventItems =
    category?.events
      .filter((event) => event.detail_visible !== false)
      .map((event) => {
        const state = (event.state ?? "ended") as ScopedEventState;
        return {
          id: event.id,
          time: eventTimeLabel(state, event.starts_at),
          title: localizedContent(language, event.title, event.title_zh),
          body: localizedContent(language, event.body, event.body_zh),
          tone: eventTone(event),
          active: state === "active",
          state,
        };
      }) ?? [];

  const syntheticItems: TimelineItem[] = (weather?.advisories ?? []).map((advisory) => {
    const state = advisory.state as ScopedEventState;
    const copy: Record<string, { title: string; body: string; tone: TimelineItem["tone"] }> = {
      gust: { title: "highWindAdvisory", body: `${tKey("weather.gustsNear")} ${formatNumber(advisory.value)} m/s ${tKey("weather.acrossTheForecastWindow")}`, tone: "warn" },
      visibility: { title: "reducedVisibility", body: `${tKey("weather.visibilityIs")} ${formatNumber(advisory.value / 1000)} km. ${tKey("weather.slowMovementWindowsMayNeedExtraMargin")}`, tone: "bad" },
      rain: { title: "heavyRainAdvisory", body: `${tKey("weather.peakRain")} ${formatNumber(advisory.value)} mm/h, ${tKey("weather.rainTotal")} ${formatNumber(advisory.total)} mm.`, tone: "warn" },
    };
    const item = copy[advisory.kind];
    return { id: `${advisory.kind}-advisory`, time: eventTimeLabel(state, advisory.starts_at), title: tKey(`weather.${item.title}`), body: item.body, tone: item.tone, active: state === "active", state };
  });

  if (warningItems.length + eventItems.length + syntheticItems.length === 0) {
    syntheticItems.push({
      id: "system-clearance",
      time: weather?.valid_to ? formatTimelineTime(weather.valid_to, language, timeZone) : tKey("weather.nextWindow"),
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
    return UNAVAILABLE_DATA_VALUE;
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

export function formatRainWindow(
  window: WeatherRainWindow,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  return `${formatCompactTime(window.starts_at, language, timeZone)} ${tKey("weather.to")} ${formatCompactTime(window.ends_at, language, timeZone)}`;
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

export function currentMetricCards(
  current: WeatherForecastPoint | null,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): CurrentMetricCard[] {
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
          detail: `${tKey("weather.peak")}: ${formatCompactTime(current.timestamp, language, timeZone)}`,
          progress: Math.min(100, (current.wind_gust_ms / 26) * 100),
          tone: current.assessment?.gust_risk ? "warn" : "primary"
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
          detail: current.assessment?.low_visibility ? tKey("weather.reduced") : tKey("weather.operational"),
          progress: Math.max(8, Math.min(100, (current.visibility_m / 30000) * 100)),
          tone: current.assessment?.low_visibility ? "warn" : "visibility"
        }
      : null,
    hasNumber(current.cloud_cover_pct)
      ? {
          key: "cloud",
          icon: "cloud",
          label: tKey("weather.cloudCover"),
          value: formatNumber(current.cloud_cover_pct, 0),
          unit: "%",
          detail: `FMI ${tKey("weather.symbol")} ${current.weather_symbol ?? UNAVAILABLE_DATA_VALUE} / ${tKey("weather.smartSymbol")} ${current.smart_symbol ?? UNAVAILABLE_DATA_VALUE}`,
          progress: Math.min(100, current.cloud_cover_pct),
          tone: "cloud"
        }
      : null
  ].filter((item): item is CurrentMetricCard => item !== null);
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
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
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
        label: formatHistoryDate(snapshot.date, language, timeZone),
        value: averageTemperature,
        detail: tKey("weather.historyPointDetail")
          .replace("{rain}", formatNumber(totalRain, 1))
          .replace("{points}", String(data.quality.point_count))
      }
    ];
  });
}
