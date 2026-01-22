"use client";

import { useMemo, useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import { LanguageMode, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformEvent,
  PlatformHistoricalSnapshot,
  WeatherDataStage,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherRainWindow,
  WeatherSourceLayer,
  WeatherWarning
} from "./types";
import { TrendChart, TrendChartPoint } from "./trend-chart";
import { eventAnchorId } from "./recent-events";

type WeatherDetailViewProps = {
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  weather: WeatherForecastResponse | null;
};

type ChartMode =
  | "temperature"
  | "precipitation"
  | "wind"
  | "gust"
  | "cloud"
  | "humidity"
  | "dewPoint"
  | "pressure"
  | "visibility";

type TimelineItem = {
  id: string;
  time: string;
  title: string;
  body: string;
  tone: "good" | "warn" | "bad" | "neutral";
  active: boolean;
};

type CurrentMetricCard = {
  key: string;
  icon: string;
  label: string;
  value: string;
  unit: string;
  detail: string;
  progress: number;
  tone: string;
};

type ForecastChartKind = "line" | "bar" | "area" | "band" | "dual-line";
type ForecastChartTone = "primary" | "rain" | "wind" | "cloud" | "humidity" | "pressure" | "visibility";

type ForecastChartConfig = {
  key: ChartMode;
  label: string;
  fullLabel: string;
  unit: string;
  tone: ForecastChartTone;
  kind: ForecastChartKind;
  description: string;
  floorZero?: boolean;
  fixedMin?: number;
  fixedMax?: number;
  pairedKey?: ChartMode;
  pairedLabel?: string;
};

type ForecastChartPoint = {
  label: string;
  sourceCount: number;
  sourceIndex: number;
  timestamp: string;
  value: number;
};

type ForecastChartScale = {
  min: number;
  max: number;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const OUTDOOR_MAX_GUST_MS = 14;
const OUTDOOR_MIN_VISIBILITY_M = 5000;
const HEAVY_RAIN_PEAK_MM = 5;
const HEAVY_RAIN_TOTAL_MM = 15;
const FORECAST_CHART_WIDTH = 1000;
const FORECAST_CHART_HEIGHT = 220;
const FORECAST_CHART_TOP = 18;
const FORECAST_CHART_BOTTOM = 190;
const CHART_MODES: ForecastChartConfig[] = [
  {
    key: "temperature",
    label: "TMP",
    fullLabel: "Temperature",
    unit: "°",
    tone: "primary",
    kind: "line",
    description: "Continuous thermal curve"
  },
  {
    key: "precipitation",
    label: "PRCP",
    fullLabel: "Precipitation",
    unit: " mm",
    tone: "rain",
    kind: "bar",
    description: "Hourly rain volume",
    floorZero: true
  },
  {
    key: "wind",
    label: "WIND",
    fullLabel: "Wind and Gust",
    unit: " m/s",
    tone: "wind",
    kind: "dual-line",
    description: "Sustained wind with gust overlay",
    floorZero: true,
    pairedKey: "gust",
    pairedLabel: "Gust"
  },
  {
    key: "gust",
    label: "GUST",
    fullLabel: "Gust and Wind",
    unit: " m/s",
    tone: "wind",
    kind: "dual-line",
    description: "Gust peaks against sustained wind",
    floorZero: true,
    pairedKey: "wind",
    pairedLabel: "Wind"
  },
  {
    key: "cloud",
    label: "CLD",
    fullLabel: "Cloud Cover",
    unit: "%",
    tone: "cloud",
    kind: "band",
    description: "Percent coverage band",
    fixedMin: 0,
    fixedMax: 100
  },
  {
    key: "humidity",
    label: "RH",
    fullLabel: "Humidity",
    unit: "%",
    tone: "humidity",
    kind: "band",
    description: "Relative humidity band",
    fixedMin: 0,
    fixedMax: 100
  },
  {
    key: "dewPoint",
    label: "DEW",
    fullLabel: "Dew Point",
    unit: "°",
    tone: "humidity",
    kind: "line",
    description: "Moisture temperature curve"
  },
  {
    key: "pressure",
    label: "HPA",
    fullLabel: "Pressure",
    unit: " hPa",
    tone: "pressure",
    kind: "line",
    description: "Pressure trend line"
  },
  {
    key: "visibility",
    label: "VIS",
    fullLabel: "Visibility",
    unit: " km",
    tone: "visibility",
    kind: "area",
    description: "Distance envelope",
    floorZero: true
  }
];

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

function displayRegion(value: string | null | undefined, t: (value: string) => string): string {
  const location = value?.trim();
  if (!location || location.toLowerCase() === "helsinki") {
    return t("Helsinki Meteorological Region");
  }

  return location
    .split(/\s+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDegree(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${formatNumber(value, 1)}°`;
}

function formatCompactTime(value: string | null | undefined, language: LanguageMode = "en"): string {
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

function formatTimelineTime(value: string | null | undefined, language: LanguageMode): string {
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

function pointTime(point: WeatherForecastPoint): number {
  return new Date(point.timestamp).getTime();
}

function orderedPoints(points: WeatherForecastPoint[]): WeatherForecastPoint[] {
  return [...points].sort((left, right) => pointTime(left) - pointTime(right));
}

function forecastWindow(points: WeatherForecastPoint[], limit = 50): WeatherForecastPoint[] {
  const ordered = orderedPoints(points);
  const now = Date.now();
  const upcoming = ordered.filter((point) => pointTime(point) >= now);
  return (upcoming.length > 0 ? upcoming : ordered).slice(0, limit);
}

function latestPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
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

function pointThreeHoursEarlier(
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

function pointThreeHoursLater(
  points: WeatherForecastPoint[],
  current: WeatherForecastPoint | null
): WeatherForecastPoint | null {
  if (!current) {
    return null;
  }

  const target = pointTime(current) + 3 * 60 * 60 * 1000;
  return orderedPoints(points).find((point) => pointTime(point) >= target) ?? null;
}

function apparentTemperature(point: WeatherForecastPoint | null): number | null {
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

function conditionForPoint(point: WeatherForecastPoint | null, t: (value: string) => string): { icon: string; label: string } {
  if (!point) {
    return { icon: "cloud_sync", label: t("Awaiting Forecast") };
  }

  const precipitation = point.precipitation_mm ?? 0;
  const temperature = point.temperature_c ?? 5;
  const cloud = point.cloud_cover_pct ?? 100;
  const gust = point.wind_gust_ms ?? point.wind_speed_ms ?? 0;

  if (precipitation >= 0.3 && temperature <= 1) {
    return { icon: "cloudy_snowing", label: t("Light Snow & Overcast") };
  }
  if (precipitation >= 0.3) {
    return { icon: "rainy", label: t("Rain & Low Cloud") };
  }
  if (gust >= OUTDOOR_MAX_GUST_MS) {
    return { icon: "air", label: t("Wind Advisory Conditions") };
  }
  if (cloud >= 75) {
    return { icon: "cloud", label: t("Overcast") };
  }
  if (cloud <= 30) {
    return { icon: "clear_day", label: t("Clear Spell") };
  }

  return { icon: "partly_cloudy_day", label: t("Partly Cloudy") };
}

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

function compassDirection(degrees: number | null | undefined): string {
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

function warningTone(warning: WeatherWarning): TimelineItem["tone"] {
  const severity = warning.severity?.toLowerCase() ?? "";
  if (severity.includes("high") || severity.includes("severe") || severity.includes("red")) {
    return "bad";
  }
  if (severity.includes("medium") || severity.includes("yellow") || severity.includes("warn")) {
    return "warn";
  }
  return "neutral";
}

function eventTone(event: PlatformEvent): TimelineItem["tone"] {
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

function peakGustPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
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

function lowestVisibilityPoint(points: WeatherForecastPoint[]): WeatherForecastPoint | null {
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

function strongestRainWindow(windows: WeatherRainWindow[]): WeatherRainWindow | null {
  return (
    [...windows].sort(
      (left, right) =>
        Math.max(right.peak_precip_mm, right.total_precip_mm / Math.max(right.hours, 1)) -
        Math.max(left.peak_precip_mm, left.total_precip_mm / Math.max(left.hours, 1)),
    )[0] ?? null
  );
}

function buildTimelineItems(
  weather: WeatherForecastResponse | null,
  category: PlatformCategory | null,
  language: LanguageMode,
  t: (value: string) => string,
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
      time: warning.published_at ? formatTimelineTime(warning.published_at, language) : t("ACTIVE NOW"),
      title: warning.title,
      body: warning.description ?? t("Weather warning from the provider feed."),
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
          time: startsAt <= now && endsAt >= now ? t("ACTIVE NOW") : formatTimelineTime(event.starts_at, language),
          title: event.title,
          body: event.body,
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
      title: t("High Wind Advisory"),
      body: `${t("Gusts near")} ${formatNumber(peakGust)} m/s ${t("across the forecast window.")}`,
      tone: "warn",
      active: isActiveWindow(gustPoint.timestamp, gustEndsAt)
    });
  }
  if (visibilityPoint && minVisibility !== null && minVisibility < OUTDOOR_MIN_VISIBILITY_M) {
    const visibilityEndsAt = new Date(new Date(visibilityPoint.timestamp).getTime() + 3 * 60 * 60 * 1000).toISOString();
    syntheticItems.push({
      id: "visibility-advisory",
      time: formatTimelineTime(visibilityPoint.timestamp, language),
      title: t("Reduced Visibility"),
      body: `${t("Visibility is")} ${formatNumber(minVisibility / 1000)} km. ${t("Slow movement windows may need extra margin.")}`,
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
      title: t("Heavy Rain Advisory"),
      body: `${t("Peak rain")} ${formatNumber(rainWindow.peak_precip_mm)} mm/h · ${t("Rain total")} ${formatNumber(rainWindow.total_precip_mm)} mm.`,
      tone: "warn",
      active: isActiveWindow(rainWindow.starts_at, rainWindow.ends_at)
    });
  }

  if (warningItems.length + eventItems.length + syntheticItems.length === 0) {
    syntheticItems.push({
      id: "system-clearance",
      time: weather?.valid_to ? formatTimelineTime(weather.valid_to, language) : t("NEXT WINDOW"),
      title: t("System Clearance"),
      body: weather?.summary ?? t("No active warning or disruption event is present in the current weather feed."),
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

function chartConfig(mode: ChartMode): ForecastChartConfig {
  return CHART_MODES.find((item) => item.key === mode) ?? CHART_MODES[0];
}

function chartValue(point: WeatherForecastPoint, mode: ChartMode): number | null {
  switch (mode) {
    case "temperature":
      return point.temperature_c;
    case "precipitation":
      return point.precipitation_mm;
    case "wind":
      return point.wind_speed_ms;
    case "gust":
      return point.wind_gust_ms;
    case "cloud":
      return point.cloud_cover_pct;
    case "humidity":
      return point.humidity_pct;
    case "dewPoint":
      return point.dew_point_c;
    case "pressure":
      return point.pressure_hpa;
    case "visibility":
      return hasNumber(point.visibility_m) ? point.visibility_m / 1000 : null;
    default:
      return null;
  }
}

function chartPoints(
  points: WeatherForecastPoint[],
  mode: ChartMode,
  language: LanguageMode
): ForecastChartPoint[] {
  return points.flatMap((point, index) => {
    const value = chartValue(point, mode);
    if (value === null || value === undefined) {
      return [];
    }

    return [
      {
        label: formatCompactTime(point.timestamp, language),
        sourceCount: points.length,
        sourceIndex: index,
        timestamp: point.timestamp,
        value
      }
    ];
  });
}

function chartScale(
  config: ForecastChartConfig,
  primaryPoints: ForecastChartPoint[],
  secondaryPoints: ForecastChartPoint[] = []
): ForecastChartScale {
  if (config.fixedMin !== undefined && config.fixedMax !== undefined) {
    return { min: config.fixedMin, max: config.fixedMax };
  }

  const values = [...primaryPoints, ...secondaryPoints].map((point) => point.value);
  if (values.length === 0) {
    return {
      min: config.fixedMin ?? 0,
      max: config.fixedMax ?? 1
    };
  }

  const rawMin = config.fixedMin ?? (config.floorZero ? 0 : Math.min(...values));
  const rawMax = config.fixedMax ?? Math.max(...values, config.floorZero ? 1 : values[0]);
  if (rawMax === rawMin) {
    const padding = rawMax === 0 ? 1 : Math.abs(rawMax) * 0.12;
    return {
      min: config.floorZero ? 0 : rawMin - padding,
      max: rawMax + padding
    };
  }

  const padding = config.fixedMax !== undefined ? 0 : Math.max((rawMax - rawMin) * 0.12, config.floorZero ? 0 : 0.5);
  return {
    min: config.floorZero ? 0 : rawMin - padding,
    max: rawMax + padding
  };
}

function chartX(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }

  return (index / (count - 1)) * FORECAST_CHART_WIDTH;
}

function chartPointX(point: ForecastChartPoint): number {
  return chartX(point.sourceIndex, point.sourceCount);
}

function chartY(value: number, scale: ForecastChartScale): number {
  if (scale.max === scale.min) {
    return FORECAST_CHART_TOP + (FORECAST_CHART_BOTTOM - FORECAST_CHART_TOP) / 2;
  }

  return (
    FORECAST_CHART_BOTTOM -
    ((value - scale.min) / (scale.max - scale.min)) * (FORECAST_CHART_BOTTOM - FORECAST_CHART_TOP)
  );
}

function chartLinePath(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = chartPointX(point);
      const y = chartY(point.value, scale);
      const command = index === 0 ? "M" : "L";
      return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartAreaPath(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  if (points.length === 0) {
    return "";
  }

  const linePath = chartLinePath(points, scale);
  return `${linePath} L${chartPointX(points[points.length - 1]).toFixed(1)},${FORECAST_CHART_BOTTOM} L${chartPointX(points[0]).toFixed(1)},${FORECAST_CHART_BOTTOM} Z`;
}

function chartPolyline(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  return points
    .map((point) => {
      const x = chartPointX(point);
      const y = chartY(point.value, scale);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartAxis(scale: ForecastChartScale, config: ForecastChartConfig): { top: string; middle: string; bottom: string } {
  const digits = ["pressure", "cloud", "humidity"].includes(config.key) ? 0 : 1;
  return {
    top: formatNumber(scale.max, digits),
    middle: formatNumber((scale.max + scale.min) / 2, digits),
    bottom: formatNumber(scale.min, digits)
  };
}

function chartReadout(
  points: ForecastChartPoint[],
  mode: ChartMode,
  t: (value: string) => string,
  secondaryPoints: ForecastChartPoint[] = []
): string {
  if (points.length === 0) {
    return t("No values");
  }

  const config = chartConfig(mode);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const digits = ["cloud", "humidity", "pressure"].includes(mode) ? 0 : 1;
  if (config.kind === "bar") {
    const total = values.reduce((sum, value) => sum + value, 0);
    return `${t("total")} ${formatNumber(total, 1)}${config.unit} / ${t("peak")} ${formatNumber(max, 1)}${config.unit}`;
  }
  if (config.kind === "dual-line" && secondaryPoints.length > 0) {
    const secondaryMax = Math.max(...secondaryPoints.map((point) => point.value));
    return `${formatNumber(min, digits)}-${formatNumber(max, digits)}${config.unit} / ${config.pairedLabel ?? t("Overlay")} ${formatNumber(secondaryMax, digits)}${config.unit}`;
  }

  return `${formatNumber(min, digits)}${config.unit} to ${formatNumber(max, digits)}${config.unit}`;
}

function chartKindLabel(kind: ForecastChartKind): string {
  if (kind === "bar") {
    return "Bar chart";
  }
  if (kind === "area") {
    return "Area chart";
  }
  if (kind === "band") {
    return "Coverage band";
  }
  if (kind === "dual-line") {
    return "Dual-line chart";
  }

  return "Line chart";
}

function chartXAxisLabels(points: ForecastChartPoint[]): string[] {
  if (points.length <= 5) {
    return points.map((point) => point.label);
  }

  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.min(points.length - 1, Math.round((points.length - 1) * ratio));
    return points[index].label;
  });
}

function renderForecastChart(
  points: ForecastChartPoint[],
  secondaryPoints: ForecastChartPoint[],
  config: ForecastChartConfig,
  t: (value: string) => string
) {
  if (points.length === 0) {
    return <div className="weather-chart-empty">{t("No forecast points available")}</div>;
  }

  const scale = chartScale(config, points, secondaryPoints);
  const linePath = chartLinePath(points, scale);
  const areaPath = chartAreaPath(points, scale);
  const polyline = chartPolyline(points, scale);
  const secondaryLinePath = chartLinePath(secondaryPoints, scale);
  const sourceCount = points[0]?.sourceCount ?? points.length;
  const slotWidth = FORECAST_CHART_WIDTH / Math.max(sourceCount, 1);
  const barWidth = Math.max(8, slotWidth * 0.68);
  const firstX = chartPointX(points[0]);
  const lastX = chartPointX(points[points.length - 1]);

  return (
    <svg
      aria-hidden="true"
      className="weather-forecast-svg"
      preserveAspectRatio="none"
      viewBox={`0 0 ${FORECAST_CHART_WIDTH} ${FORECAST_CHART_HEIGHT}`}
    >
      {[FORECAST_CHART_TOP, (FORECAST_CHART_TOP + FORECAST_CHART_BOTTOM) / 2, FORECAST_CHART_BOTTOM].map((yValue) => (
        <line
          className="weather-chart-grid-line"
          key={yValue}
          x1="0"
          x2={FORECAST_CHART_WIDTH}
          y1={yValue}
          y2={yValue}
        />
      ))}
      {scale.min < 0 && scale.max > 0 ? (
        <line
          className="weather-chart-zero-line"
          x1="0"
          x2={FORECAST_CHART_WIDTH}
          y1={chartY(0, scale)}
          y2={chartY(0, scale)}
        />
      ) : null}

      {config.kind === "bar"
        ? points.map((point, index) => {
            const x = chartPointX(point) - barWidth / 2;
            const y = chartY(point.value, scale);
            return (
              <rect
                className="weather-chart-bar"
                height={Math.max(2, FORECAST_CHART_BOTTOM - y)}
                key={`${point.timestamp}-${index}`}
                rx="4"
                width={barWidth}
                x={Math.max(0, Math.min(FORECAST_CHART_WIDTH - barWidth, x))}
                y={y}
              >
                <title>{`${point.label}: ${formatNumber(point.value, 1)}${config.unit}`}</title>
              </rect>
            );
          })
        : null}

      {config.kind === "area" ? <path className="weather-chart-area" d={areaPath} /> : null}
      {config.kind === "band" ? <polygon className="weather-chart-band" points={`${polyline} ${lastX},${FORECAST_CHART_BOTTOM} ${firstX},${FORECAST_CHART_BOTTOM}`} /> : null}

      {config.kind !== "bar" ? <path className="weather-chart-line" d={linePath} /> : null}
      {config.kind === "dual-line" && secondaryLinePath ? (
        <path className="weather-chart-line-secondary" d={secondaryLinePath} />
      ) : null}

      {points.map((point, index) => (
        <circle
          className="weather-chart-point"
          cx={chartPointX(point)}
          cy={chartY(point.value, scale)}
          key={`${point.timestamp}-${index}`}
          r={index === points.length - 1 ? 4 : 2.4}
        >
          <title>{`${config.fullLabel}: ${formatNumber(point.value, 1)}${config.unit} at ${point.label}`}</title>
        </circle>
      ))}
      {config.kind === "dual-line"
        ? secondaryPoints.map((point, index) => (
            <circle
              className="weather-chart-point-secondary"
              cx={chartPointX(point)}
              cy={chartY(point.value, scale)}
              key={`${point.timestamp}-secondary-${index}`}
              r={index === secondaryPoints.length - 1 ? 3.4 : 2}
            >
              <title>{`${config.pairedLabel ?? t("Overlay")}: ${formatNumber(point.value, 1)}${config.unit} at ${point.label}`}</title>
            </circle>
          ))
        : null}
    </svg>
  );
}

function metricValue(weather: WeatherForecastResponse | null, key: string): string {
  const metric = weather?.metrics.find((item) => item.key === key);
  if (!metric) {
    return "n/a";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricByKey(weather: WeatherForecastResponse, key: string): string | null {
  const metric = weather.metrics.find((item) => item.key === key);
  if (!metric || metric.value === "n/a") {
    return null;
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function fieldCoverageLabel(weather: WeatherForecastResponse, t: (value: string) => string): string {
  const missing = weather.quality.missing_fields;
  if (missing.length === 0) {
    return t("All tracked fields present");
  }

  return `${t("Missing")} ${missing.join(", ")}`;
}

function sourceTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ready" || status === "fetched") {
    return "good";
  }
  if (status === "missing" || status === "not_collected" || status === "empty") {
    return "warn";
  }
  if (status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
}

function formatRainWindow(window: WeatherRainWindow, language: LanguageMode, t: (value: string) => string): string {
  return `${formatCompactTime(window.starts_at, language)} ${t("to")} ${formatCompactTime(window.ends_at, language)}`;
}

function maxRainWindowTotal(windows: WeatherRainWindow[]): number {
  return Math.max(0.1, ...windows.map((window) => window.total_precip_mm));
}

function stageProgress(stage: WeatherDataStage): number {
  if (stage.status === "ready") {
    return 100;
  }
  if (stage.status === "empty" || stage.status === "missing") {
    return 20;
  }
  return 55;
}

function sourceRequestHost(endpoint: string | null, t: (value: string) => string): string {
  if (!endpoint) {
    return t("endpoint not recorded");
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function currentMetricCards(current: WeatherForecastPoint | null, language: LanguageMode, t: (value: string) => string): CurrentMetricCard[] {
  if (!current) {
    return [];
  }

  return [
    hasNumber(current.wind_speed_ms)
      ? {
          key: "wind",
          icon: "air",
          label: t("Wind"),
          value: formatNumber(current.wind_speed_ms, 1),
          unit: "m/s",
          detail: `${t("Dir")}: ${compassDirection(current.wind_direction_deg)} (${formatNumber(current.wind_direction_deg, 0)}°)`,
          progress: Math.min(100, (current.wind_speed_ms / 26) * 100),
          tone: "primary"
        }
      : null,
    hasNumber(current.wind_gust_ms)
      ? {
          key: "gust",
          icon: "storm",
          label: t("Max Gust"),
          value: formatNumber(current.wind_gust_ms, 1),
          unit: "m/s",
          detail: `${t("Peak")}: ${formatCompactTime(current.timestamp, language)}`,
          progress: Math.min(100, (current.wind_gust_ms / 26) * 100),
          tone: current.wind_gust_ms >= OUTDOOR_MAX_GUST_MS ? "warn" : "primary"
        }
      : null,
    hasNumber(current.humidity_pct)
      ? {
          key: "humidity",
          icon: "humidity_percentage",
          label: t("Humidity"),
          value: formatNumber(current.humidity_pct, 0),
          unit: "%",
          detail: hasNumber(current.dew_point_c) ? `${t("Dew point")} ${formatDegree(current.dew_point_c)}` : t("Dew point unavailable"),
          progress: Math.min(100, current.humidity_pct),
          tone: "humidity"
        }
      : null,
    hasNumber(current.pressure_hpa)
      ? {
          key: "pressure",
          icon: "speed",
          label: t("Pressure"),
          value: formatNumber(current.pressure_hpa, 0),
          unit: "hPa",
          detail: t("Sea-level pressure signal"),
          progress: Math.max(8, Math.min(100, ((current.pressure_hpa - 960) / 90) * 100)),
          tone: "pressure"
        }
      : null,
    hasNumber(current.visibility_m)
      ? {
          key: "visibility",
          icon: "visibility",
          label: t("Visibility"),
          value: formatNumber(current.visibility_m / 1000, 1),
          unit: "km",
          detail: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? t("Reduced") : t("Operational"),
          progress: Math.max(8, Math.min(100, (current.visibility_m / 30000) * 100)),
          tone: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? "warn" : "visibility"
        }
      : null,
    hasNumber(current.cloud_cover_pct)
      ? {
          key: "cloud",
          icon: "cloud",
          label: t("Cloud Cover"),
          value: formatNumber(current.cloud_cover_pct, 0),
          unit: "%",
          detail: `FMI ${t("symbol")} ${current.weather_symbol ?? "n/a"} / smart ${current.smart_symbol ?? "n/a"}`,
          progress: Math.min(100, current.cloud_cover_pct),
          tone: "cloud"
        }
      : null
  ].filter((item): item is CurrentMetricCard => item !== null);
}

function formatHistoryDate(value: string): string {
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

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weatherHistoryPoints(
  history: PlatformHistoricalSnapshot<WeatherForecastResponse>[]
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
        detail: `${formatNumber(totalRain, 1)} mm rain · ${data.quality.point_count} pts`
      }
    ];
  });
}

export function WeatherDetailView({
  category,
  highlightedEventId,
  history,
  weather,
}: WeatherDetailViewProps) {
  const { language, t } = useI18n();
  const [chartMode, setChartMode] = useState<ChartMode>("temperature");
  const points = useMemo(() => forecastWindow(weather?.points ?? []), [weather]);
  const current = latestPoint(points.length > 0 ? points : weather?.points ?? []);
  const previous = pointThreeHoursEarlier(weather?.points ?? [], current);
  const nextTrendPoint = previous ? null : pointThreeHoursLater(weather?.points ?? [], current);
  const condition = conditionForPoint(current, t);
  const feelsLike = apparentTemperature(current);
  const trend =
    current?.temperature_c !== null &&
    current?.temperature_c !== undefined &&
    ((previous?.temperature_c !== null && previous?.temperature_c !== undefined) ||
      (nextTrendPoint?.temperature_c !== null && nextTrendPoint?.temperature_c !== undefined))
      ? previous?.temperature_c !== null && previous?.temperature_c !== undefined
        ? current.temperature_c - previous.temperature_c
        : (nextTrendPoint?.temperature_c ?? current.temperature_c) - current.temperature_c
      : null;
  const trendLabel = previous ? t("Trend 3H") : t("Next 3H");
  const timelineItems = buildTimelineItems(
    weather,
    category,
    language,
    t,
    highlightedEventId,
  );
  const activeChartConfig = chartConfig(chartMode);
  const chartData = chartPoints(points, chartMode, language);
  const secondaryChartData = activeChartConfig.pairedKey
    ? chartPoints(points, activeChartConfig.pairedKey, language)
    : [];
  const chartScaleValue = chartScale(activeChartConfig, chartData, secondaryChartData);
  const axis = chartAxis(chartScaleValue, activeChartConfig);
  const chartLabels = chartXAxisLabels(chartData);
  const sourceRequest = weather?.source_requests[0];
  const syncTime = weather?.generated_at ?? weather?.checked_at ?? sourceRequest?.fetched_at ?? null;
  const metricCards = currentMetricCards(current, language, t);
  const historyPoints = weatherHistoryPoints(history);

  if (!weather) {
    return (
      <section className="weather-detail-empty">
        <span>{t("Weather Detail")}</span>
        <h2>{t("Weather data is not available yet")}</h2>
        <p>{t("The FMI forecast endpoint did not return current weather data for this platform window.")}</p>
      </section>
    );
  }

  return (
    <div className="weather-detail-page">
      <div className="weather-detail-header">
        <div>
          <h2>{displayRegion(weather.location, t)}</h2>
          <div className="weather-live-status">
            <span aria-hidden="true" />
            <strong>{weather.status === "stale" ? t("Sync Delayed") : t("Live Sync Active")}</strong>
          </div>
        </div>
        <div>LAT 60.1699 N / LON 24.9384 E</div>
      </div>

      <section className="weather-bento-grid" aria-label={t("Weather conditions")}>
        <article className="weather-hero-card weather-glass-panel">
          <div className="weather-card-kicker">
            <span>{t("Current Condition")}</span>
            <time>{formatCompactTime(current?.timestamp ?? weather.checked_at, language)} EET</time>
          </div>
          <div className="weather-current-cluster">
            <span className="material-symbols-outlined weather-condition-icon" aria-hidden="true">
              {condition.icon}
            </span>
            <div>
              <strong>{formatDegree(current?.temperature_c)}</strong>
              <p>{condition.label}</p>
            </div>
          </div>
          <div className="weather-hero-footer">
            <div>
              <span>{t("Feels Like")}</span>
              <strong>{formatDegree(feelsLike)}</strong>
            </div>
            {trend !== null ? (
              <div>
                <span>{trendLabel}</span>
                <strong className={trend < 0 ? "weather-trend-down" : "weather-trend-up"}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {trend < 0 ? "arrow_downward" : "arrow_upward"}
                  </span>
                  {formatDegree(Math.abs(trend))}
                </strong>
              </div>
            ) : null}
          </div>
        </article>

        <div className="weather-detail-metrics">
          {metricCards.map((card) => (
            <article
              className={`weather-glass-panel weather-metric-box weather-metric-${card.tone}`}
              key={card.key}
            >
              <div className="weather-metric-label">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {card.icon}
                </span>
                {card.label}
              </div>
              <div>
                <strong>
                  {card.value}
                  <small>{card.unit}</small>
                </strong>
                <p>{card.detail}</p>
              </div>
              <span className="weather-progress" aria-hidden="true">
                <span style={{ width: `${card.progress}%` }} />
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="weather-summary-strip" aria-label={t("Weather summary metrics")}>
        {[
          ["temperature_range", "Thermal Range"],
          ["peak_wind", "Peak Wind"],
          ["peak_gust", "Peak Gust"],
          ["peak_precipitation", "Peak Rain"],
          ["total_precipitation", "Rain Total"],
          ["forecast_points", "Hourly Points"]
        ].flatMap(([key, label]) => {
          const value = metricByKey(weather, key);
          return value ? [{ key, label, value }] : [];
        }).map((item) => (
          <article className="weather-glass-panel" key={item.key}>
            <span>{t(item.label)}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <TrendChart
        className="weather-glass-panel"
        emptyMessage={t("No daily weather history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={1}
        points={historyPoints}
        title={t("Daily Average Temperature")}
        tone="primary"
        unit="C"
      />

      <section className="weather-lower-grid" aria-label={t("Weather forecast and events")}>
        <article className="weather-glass-panel weather-chart-panel">
          <header>
            <span>{weather.quality.forecast_hours}H {t("Forecast Trajectory")}</span>
            <strong>{chartReadout(chartData, chartMode, t, secondaryChartData)}</strong>
            <small className="weather-chart-kind">
              {t(chartKindLabel(activeChartConfig.kind))} · {t(activeChartConfig.description)}
            </small>
            <div className="weather-chart-toggle" aria-label={t("Forecast chart mode")}>
              {CHART_MODES.map((mode) => (
                <button
                  aria-label={`${t(mode.fullLabel)} · ${t(mode.description)}`}
                  className={chartMode === mode.key ? "active" : ""}
                  key={mode.key}
                  onClick={() => setChartMode(mode.key)}
                  title={`${t(mode.fullLabel)} · ${t(mode.description)}`}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </header>
          <div
            className={`weather-line-chart weather-forecast-chart weather-forecast-chart-${activeChartConfig.tone} weather-forecast-chart-${activeChartConfig.kind}`}
          >
            <span className="weather-axis weather-axis-top">
              {axis.top}
              {activeChartConfig.unit}
            </span>
            <span className="weather-axis weather-axis-mid">
              {axis.middle}
              {activeChartConfig.unit}
            </span>
            <span className="weather-axis weather-axis-bottom">
              {axis.bottom}
              {activeChartConfig.unit}
            </span>
            {renderForecastChart(chartData, secondaryChartData, activeChartConfig, t)}
            <div className="weather-chart-x-axis">
              {chartLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="weather-glass-panel weather-event-panel">
          <h3>{t("Event Timeline")}</h3>
          <div className="weather-event-list">
            {timelineItems.map((item) => (
              <article
                className={`weather-event-item weather-event-${item.tone}`}
                id={eventAnchorId(item.id)}
                key={item.id}
              >
                <span className="weather-event-dot" aria-hidden="true" />
                <time>{item.active ? t("ACTIVE NOW") : item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="weather-ops-grid" aria-label={t("Weather operations data")}>
        <article className="weather-glass-panel weather-rain-window-panel">
          <header>
            <span>{t("Rain Windows")}</span>
            <strong>{weather.rain_windows.length}</strong>
          </header>
          <div>
            {weather.rain_windows.length > 0 ? (
              weather.rain_windows.map((window) => (
                <article key={`${window.starts_at}-${window.ends_at}`}>
                  <div>
                    <strong>{formatRainWindow(window, language, t)}</strong>
                    <span>{window.hours}h</span>
                  </div>
                  <p>
                    {t("Peak")} {formatNumber(window.peak_precip_mm, 1)} mm {t("at")}{" "}
                    {formatCompactTime(window.peak_precip_at, language)} · {t("total")}{" "}
                    {formatNumber(window.total_precip_mm, 1)} mm
                  </p>
                  <span className="weather-rain-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(10, (window.total_precip_mm / maxRainWindowTotal(weather.rain_windows)) * 100)}%` }} />
                  </span>
                </article>
              ))
            ) : (
              <p>{t("No rain windows in the current forecast horizon.")}</p>
            )}
          </div>
        </article>

        <article className="weather-glass-panel weather-quality-panel">
          <header>
            <span>{t("Data Quality")}</span>
            <strong>{formatNumber(weather.quality.field_coverage_pct, 0)}%</strong>
          </header>
          <span className="weather-quality-meter" aria-hidden="true">
            <span style={{ width: `${weather.quality.field_coverage_pct}%` }} />
          </span>
          <div className="weather-quality-stats">
            <span>{weather.quality.point_count} {t("points")}</span>
            <span>{weather.quality.forecast_hours}h {t("horizon")}</span>
            <span>{weather.quality.rain_window_count} {t("rain windows")}</span>
          </div>
          <p>{fieldCoverageLabel(weather, t)}</p>
          {weather.quality.notes.map((note) => (
            <small key={note}>{note}</small>
          ))}
        </article>

        <article className="weather-glass-panel weather-pipeline-panel">
          <header>
            <span>{t("Pipeline")}</span>
            <strong>
              {weather.data_pipeline.filter((stage) => stage.status === "ready").length}/
              {weather.data_pipeline.length}
            </strong>
          </header>
          <div>
            {weather.data_pipeline.map((stage) => (
              <article className={`weather-pipeline-stage weather-pipeline-${sourceTone(stage.status)}`} key={stage.key}>
                <div>
                    <strong>{stage.label}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${t("records")}` : ""}
                  </p>
                <span className="weather-pipeline-meter" aria-hidden="true">
                  <span style={{ width: `${stageProgress(stage)}%` }} />
                </span>
              </article>
            ))}
          </div>
        </article>

        <article className="weather-glass-panel weather-source-panel">
          <header>
            <span>{t("Source Layers")}</span>
            <strong>
              {weather.source_layers.filter((layer) => layer.status === "ready").length}/
              {weather.source_layers.length}
            </strong>
          </header>
          <div>
            {weather.source_layers.map((layer: WeatherSourceLayer) => {
              const request = weather.source_requests.find((item) => item.key === layer.key);
              return (
                <article className={`weather-source-layer weather-source-${sourceTone(layer.status)}`} key={layer.key}>
                  <div>
                    <strong>{layer.label}</strong>
                    <span>{t(layer.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>{layer.detail}</p>
                  <small>
                    {request ? `${sourceRequestHost(request.endpoint, t)} · ${request.content_type ?? t("unknown content")}` : t("request metadata unavailable")}
                  </small>
                </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className="weather-provider-status" aria-label={t("Weather provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {weather.source_code.toUpperCase()} (Finnish Meteorological Institute)
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {syncTime ? `${formatCompactTime(syncTime, language)} EET` : "n/a"}
          </span>
          <i aria-hidden="true" />
          <span className="weather-provider-latency">
            {t("Coverage")}: {metricValue(weather, "forecast_hours") !== "n/a" ? metricValue(weather, "forecast_hours") : `${weather.quality.field_coverage_pct}%`}
          </span>
        </div>
      </section>

      <p className="weather-detail-freshness">
        {t("Forecast feed checked")} {formatRelativeAge(weather.checked_at, language)}. {weather.summary ?? category?.description}
      </p>
    </div>
  );
}
