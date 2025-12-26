"use client";

import { useMemo, useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import {
  PlatformCategory,
  PlatformEvent,
  WeatherDataStage,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherRainWindow,
  WeatherSourceLayer,
  WeatherWarning
} from "./types";

type WeatherDetailViewProps = {
  category: PlatformCategory | null;
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

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const OUTDOOR_MAX_GUST_MS = 14;
const OUTDOOR_MIN_VISIBILITY_M = 5000;
const CHART_MODES: Array<{
  key: ChartMode;
  label: string;
  unit: string;
  tone: "primary" | "rain" | "wind" | "cloud" | "humidity" | "pressure" | "visibility";
}> = [
  { key: "temperature", label: "TMP", unit: "°", tone: "primary" },
  { key: "precipitation", label: "PRCP", unit: " mm", tone: "rain" },
  { key: "wind", label: "WIND", unit: " m/s", tone: "wind" },
  { key: "gust", label: "GUST", unit: " m/s", tone: "wind" },
  { key: "cloud", label: "CLD", unit: "%", tone: "cloud" },
  { key: "humidity", label: "RH", unit: "%", tone: "humidity" },
  { key: "dewPoint", label: "DEW", unit: "°", tone: "humidity" },
  { key: "pressure", label: "HPA", unit: " hPa", tone: "pressure" },
  { key: "visibility", label: "VIS", unit: " km", tone: "visibility" }
];

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

function displayRegion(value: string | null | undefined): string {
  const location = value?.trim();
  if (!location || location.toLowerCase() === "helsinki") {
    return "Helsinki Meteorological Region";
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

function formatCompactTime(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

function formatTimelineTime(value: string | null | undefined): string {
  if (!value) {
    return "PENDING";
  }

  return new Intl.DateTimeFormat("en-GB", {
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

function conditionForPoint(point: WeatherForecastPoint | null): { icon: string; label: string } {
  if (!point) {
    return { icon: "cloud_sync", label: "Awaiting Forecast" };
  }

  const precipitation = point.precipitation_mm ?? 0;
  const temperature = point.temperature_c ?? 5;
  const cloud = point.cloud_cover_pct ?? 100;
  const gust = point.wind_gust_ms ?? point.wind_speed_ms ?? 0;

  if (precipitation >= 0.3 && temperature <= 1) {
    return { icon: "cloudy_snowing", label: "Light Snow & Overcast" };
  }
  if (precipitation >= 0.3) {
    return { icon: "rainy", label: "Rain & Low Cloud" };
  }
  if (gust >= OUTDOOR_MAX_GUST_MS) {
    return { icon: "air", label: "Wind Advisory Conditions" };
  }
  if (cloud >= 75) {
    return { icon: "cloud", label: "Overcast" };
  }
  if (cloud <= 30) {
    return { icon: "clear_day", label: "Clear Spell" };
  }

  return { icon: "partly_cloudy_day", label: "Partly Cloudy" };
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

function buildTimelineItems(
  weather: WeatherForecastResponse | null,
  category: PlatformCategory | null,
  current: WeatherForecastPoint | null
): TimelineItem[] {
  const now = Date.now();
  const warningItems =
    weather?.warnings.map((warning, index) => ({
      id: `warning-${index}-${warning.title}`,
      time: warning.published_at ? formatTimelineTime(warning.published_at) : "ACTIVE NOW",
      title: warning.title,
      body: warning.description ?? "Weather warning from the provider feed.",
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
          time: startsAt <= now && endsAt >= now ? "ACTIVE NOW" : formatTimelineTime(event.starts_at),
          title: event.title,
          body: event.body,
          tone: eventTone(event),
          active: startsAt <= now && endsAt >= now
        };
      }) ?? [];

  const syntheticItems: TimelineItem[] = [];
  if (current && (current.wind_gust_ms ?? current.wind_speed_ms ?? 0) >= OUTDOOR_MAX_GUST_MS) {
    syntheticItems.push({
      id: "gust-advisory",
      time: formatTimelineTime(current.timestamp),
      title: "High Wind Advisory",
      body: `Gusts near ${formatNumber(current.wind_gust_ms ?? current.wind_speed_ms)} m/s across the forecast window.`,
      tone: "warn",
      active: true
    });
  }
  if (current && current.visibility_m !== null && current.visibility_m < OUTDOOR_MIN_VISIBILITY_M) {
    syntheticItems.push({
      id: "visibility-advisory",
      time: "ACTIVE NOW",
      title: "Reduced Visibility",
      body: `Visibility is ${formatNumber(current.visibility_m / 1000)} km. Slow movement windows may need extra margin.`,
      tone: "bad",
      active: true
    });
  }

  if (warningItems.length + eventItems.length + syntheticItems.length === 0) {
    syntheticItems.push({
      id: "system-clearance",
      time: weather?.valid_to ? formatTimelineTime(weather.valid_to) : "NEXT WINDOW",
      title: "System Clearance",
      body: weather?.summary ?? "No active warning or disruption event is present in the current weather feed.",
      tone: "good",
      active: false
    });
  }

  return [...warningItems, ...syntheticItems, ...eventItems].slice(0, 5);
}

function chartConfig(mode: ChartMode) {
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

function chartPoints(points: WeatherForecastPoint[], mode: ChartMode): Array<{ label: string; value: number }> {
  return points.flatMap((point) => {
    const value = chartValue(point, mode);
    if (value === null || value === undefined) {
      return [];
    }

    return [{ label: formatCompactTime(point.timestamp), value }];
  });
}

function chartPolyline(points: Array<{ value: number }>): string {
  if (points.length === 0) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, min + 1);
  const pad = Math.max((max - min) * 0.15, 1);
  const low = min - pad;
  const high = max + pad;
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 1000;
      const y = 190 - ((point.value - low) / (high - low)) * 170;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartAxis(points: Array<{ value: number }>): { top: string; middle: string; bottom: string } {
  if (points.length === 0) {
    return { top: "n/a", middle: "n/a", bottom: "n/a" };
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, min + 1);
  return {
    top: formatNumber(max, 0),
    middle: formatNumber((max + min) / 2, 0),
    bottom: formatNumber(min, 0)
  };
}

function chartReadout(points: Array<{ value: number }>, mode: ChartMode): string {
  if (points.length === 0) {
    return "No values";
  }

  const config = chartConfig(mode);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const digits = ["cloud", "humidity", "pressure"].includes(mode) ? 0 : 1;
  return `${formatNumber(min, digits)}${config.unit} to ${formatNumber(max, digits)}${config.unit}`;
}

function chartXAxisLabels(points: Array<{ label: string; value: number }>): string[] {
  if (points.length <= 5) {
    return points.map((point) => point.label);
  }

  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.min(points.length - 1, Math.round((points.length - 1) * ratio));
    return points[index].label;
  });
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

function fieldCoverageLabel(weather: WeatherForecastResponse): string {
  const missing = weather.quality.missing_fields;
  if (missing.length === 0) {
    return "All tracked fields present";
  }

  return `Missing ${missing.join(", ")}`;
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

function formatRainWindow(window: WeatherRainWindow): string {
  return `${formatCompactTime(window.starts_at)} to ${formatCompactTime(window.ends_at)}`;
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

function sourceRequestHost(endpoint: string | null): string {
  if (!endpoint) {
    return "endpoint not recorded";
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function currentMetricCards(current: WeatherForecastPoint | null): CurrentMetricCard[] {
  if (!current) {
    return [];
  }

  return [
    hasNumber(current.wind_speed_ms)
      ? {
          key: "wind",
          icon: "air",
          label: "Wind",
          value: formatNumber(current.wind_speed_ms, 1),
          unit: "m/s",
          detail: `Dir: ${compassDirection(current.wind_direction_deg)} (${formatNumber(current.wind_direction_deg, 0)}°)`,
          progress: Math.min(100, (current.wind_speed_ms / 26) * 100),
          tone: "primary"
        }
      : null,
    hasNumber(current.wind_gust_ms)
      ? {
          key: "gust",
          icon: "storm",
          label: "Max Gust",
          value: formatNumber(current.wind_gust_ms, 1),
          unit: "m/s",
          detail: `Peak: ${formatCompactTime(current.timestamp)}`,
          progress: Math.min(100, (current.wind_gust_ms / 26) * 100),
          tone: current.wind_gust_ms >= OUTDOOR_MAX_GUST_MS ? "warn" : "primary"
        }
      : null,
    hasNumber(current.humidity_pct)
      ? {
          key: "humidity",
          icon: "humidity_percentage",
          label: "Humidity",
          value: formatNumber(current.humidity_pct, 0),
          unit: "%",
          detail: hasNumber(current.dew_point_c) ? `Dew point ${formatDegree(current.dew_point_c)}` : "Dew point unavailable",
          progress: Math.min(100, current.humidity_pct),
          tone: "humidity"
        }
      : null,
    hasNumber(current.pressure_hpa)
      ? {
          key: "pressure",
          icon: "speed",
          label: "Pressure",
          value: formatNumber(current.pressure_hpa, 0),
          unit: "hPa",
          detail: "Sea-level pressure signal",
          progress: Math.max(8, Math.min(100, ((current.pressure_hpa - 960) / 90) * 100)),
          tone: "pressure"
        }
      : null,
    hasNumber(current.visibility_m)
      ? {
          key: "visibility",
          icon: "visibility",
          label: "Visibility",
          value: formatNumber(current.visibility_m / 1000, 1),
          unit: "km",
          detail: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? "Reduced" : "Operational",
          progress: Math.max(8, Math.min(100, (current.visibility_m / 30000) * 100)),
          tone: current.visibility_m < OUTDOOR_MIN_VISIBILITY_M ? "warn" : "visibility"
        }
      : null,
    hasNumber(current.cloud_cover_pct)
      ? {
          key: "cloud",
          icon: "cloud",
          label: "Cloud Cover",
          value: formatNumber(current.cloud_cover_pct, 0),
          unit: "%",
          detail: `FMI symbol ${current.weather_symbol ?? "n/a"} / smart ${current.smart_symbol ?? "n/a"}`,
          progress: Math.min(100, current.cloud_cover_pct),
          tone: "cloud"
        }
      : null
  ].filter((item): item is CurrentMetricCard => item !== null);
}

export function WeatherDetailView({ category, weather }: WeatherDetailViewProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("temperature");
  const points = useMemo(() => forecastWindow(weather?.points ?? []), [weather]);
  const current = latestPoint(points.length > 0 ? points : weather?.points ?? []);
  const previous = pointThreeHoursEarlier(weather?.points ?? [], current);
  const nextTrendPoint = previous ? null : pointThreeHoursLater(weather?.points ?? [], current);
  const condition = conditionForPoint(current);
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
  const trendLabel = previous ? "Trend 3H" : "Next 3H";
  const timelineItems = buildTimelineItems(weather, category, current);
  const chartData = chartPoints(points, chartMode);
  const activeChartConfig = chartConfig(chartMode);
  const axis = chartAxis(chartData);
  const polyline = chartPolyline(chartData);
  const chartLabels = chartXAxisLabels(chartData);
  const sourceRequest = weather?.source_requests[0];
  const syncTime = weather?.generated_at ?? weather?.checked_at ?? sourceRequest?.fetched_at ?? null;
  const metricCards = currentMetricCards(current);

  if (!weather) {
    return (
      <section className="weather-detail-empty">
        <span>Weather Detail</span>
        <h2>Weather data is not available yet</h2>
        <p>The FMI forecast endpoint did not return current weather data for this platform window.</p>
      </section>
    );
  }

  return (
    <div className="weather-detail-page">
      <div className="weather-detail-header">
        <div>
          <h2>{displayRegion(weather.location)}</h2>
          <div className="weather-live-status">
            <span aria-hidden="true" />
            <strong>{weather.status === "stale" ? "Sync Delayed" : "Live Sync Active"}</strong>
          </div>
        </div>
        <div>LAT 60.1699 N / LON 24.9384 E</div>
      </div>

      <section className="weather-bento-grid" aria-label="Weather conditions">
        <article className="weather-hero-card weather-glass-panel">
          <div className="weather-card-kicker">
            <span>Current Condition</span>
            <time>{formatCompactTime(current?.timestamp ?? weather.checked_at)} EET</time>
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
              <span>Feels Like</span>
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

      <section className="weather-summary-strip" aria-label="Weather summary metrics">
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
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="weather-lower-grid" aria-label="Weather forecast and events">
        <article className="weather-glass-panel weather-chart-panel">
          <header>
            <span>{weather.quality.forecast_hours}H Forecast Trajectory</span>
            <strong>{chartReadout(chartData, chartMode)}</strong>
            <div className="weather-chart-toggle" aria-label="Forecast chart mode">
              {CHART_MODES.map((mode) => (
                <button
                  className={chartMode === mode.key ? "active" : ""}
                  key={mode.key}
                  onClick={() => setChartMode(mode.key)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </header>
          <div className={`weather-line-chart weather-line-chart-${activeChartConfig.tone}`}>
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
            {chartData.length > 0 ? (
              <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1000 220">
                <polyline className="weather-chart-line" points={polyline} />
                <line className="weather-chart-marker" x1="0" x2="0" y1="0" y2="220" />
                <circle className="weather-chart-point" cx="0" cy={polyline.split(" ")[0]?.split(",")[1] ?? "110"} r="4" />
              </svg>
            ) : (
              <div className="weather-chart-empty">No forecast points available</div>
            )}
            <div className="weather-chart-x-axis">
              {chartLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="weather-glass-panel weather-event-panel">
          <h3>Event Timeline</h3>
          <div className="weather-event-list">
            {timelineItems.map((item) => (
              <article className={`weather-event-item weather-event-${item.tone}`} key={item.id}>
                <span className="weather-event-dot" aria-hidden="true" />
                <time>{item.active ? "ACTIVE NOW" : item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="weather-ops-grid" aria-label="Weather operations data">
        <article className="weather-glass-panel weather-rain-window-panel">
          <header>
            <span>Rain Windows</span>
            <strong>{weather.rain_windows.length}</strong>
          </header>
          <div>
            {weather.rain_windows.length > 0 ? (
              weather.rain_windows.map((window) => (
                <article key={`${window.starts_at}-${window.ends_at}`}>
                  <div>
                    <strong>{formatRainWindow(window)}</strong>
                    <span>{window.hours}h</span>
                  </div>
                  <p>
                    Peak {formatNumber(window.peak_precip_mm, 1)} mm at{" "}
                    {formatCompactTime(window.peak_precip_at)} · total{" "}
                    {formatNumber(window.total_precip_mm, 1)} mm
                  </p>
                  <span className="weather-rain-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(10, (window.total_precip_mm / maxRainWindowTotal(weather.rain_windows)) * 100)}%` }} />
                  </span>
                </article>
              ))
            ) : (
              <p>No rain windows in the current forecast horizon.</p>
            )}
          </div>
        </article>

        <article className="weather-glass-panel weather-quality-panel">
          <header>
            <span>Data Quality</span>
            <strong>{formatNumber(weather.quality.field_coverage_pct, 0)}%</strong>
          </header>
          <span className="weather-quality-meter" aria-hidden="true">
            <span style={{ width: `${weather.quality.field_coverage_pct}%` }} />
          </span>
          <div className="weather-quality-stats">
            <span>{weather.quality.point_count} points</span>
            <span>{weather.quality.forecast_hours}h horizon</span>
            <span>{weather.quality.rain_window_count} rain windows</span>
          </div>
          <p>{fieldCoverageLabel(weather)}</p>
          {weather.quality.notes.map((note) => (
            <small key={note}>{note}</small>
          ))}
        </article>

        <article className="weather-glass-panel weather-pipeline-panel">
          <header>
            <span>Pipeline</span>
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
                  <span>{stage.status.replaceAll("_", " ")}</span>
                </div>
                <p>
                  {stage.detail}
                  {stage.record_count !== null ? ` · ${stage.record_count} records` : ""}
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
            <span>Source Layers</span>
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
                    <span>{layer.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>{layer.detail}</p>
                  <small>
                    {request ? `${sourceRequestHost(request.endpoint)} · ${request.content_type ?? "unknown content"}` : "request metadata unavailable"}
                  </small>
                </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className="weather-provider-status" aria-label="Weather provider status">
        <div>
          <span aria-hidden="true" />
          <strong>Provider Status</strong>
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
            Last Sync: {syncTime ? `${formatCompactTime(syncTime)} EET` : "n/a"}
          </span>
          <i aria-hidden="true" />
          <span className="weather-provider-latency">
            Coverage: {metricValue(weather, "forecast_hours") !== "n/a" ? metricValue(weather, "forecast_hours") : `${weather.quality.field_coverage_pct}%`}
          </span>
        </div>
      </section>

      <p className="weather-detail-freshness">
        Forecast feed checked {formatRelativeAge(weather.checked_at)}. {weather.summary ?? category?.description}
      </p>
    </div>
  );
}
