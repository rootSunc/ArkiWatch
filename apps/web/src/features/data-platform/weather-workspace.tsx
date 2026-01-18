import type { CSSProperties } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import {
  WeatherDataStage,
  PlatformCategory,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherQuality,
  WeatherRainWindow,
  WeatherSourceRequest,
  WeatherSourceLayer,
  WeatherTimeWindow,
  WeatherWarning
} from "./types";
import { LanguageMode, useI18n } from "./i18n";

type WeatherWorkspaceProps = {
  category: PlatformCategory | null;
  weather: WeatherForecastResponse | null;
  timeWindow: WeatherTimeWindow;
};

type WeatherChartPoint = {
  label: string;
  timestamp: string;
  value: number;
};

type WeatherChartSeries = {
  key: string;
  label: string;
  unit: string;
  tone: "temperature" | "rain" | "wind" | "cloud";
  chart: "line" | "bar";
  points: WeatherChartPoint[];
  floorZero?: boolean;
  maxOverride?: number;
};

type WeatherWindow = {
  starts_at: string;
  ends_at: string;
  hours: number;
  detail: string;
};

type Translate = (value: string) => string;

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const RAIN_WINDOW_MIN_MM = 0.1;
const OUTDOOR_MAX_WIND_MS = 10;
const OUTDOOR_MAX_GUST_MS = 14;
const OUTDOOR_MIN_VISIBILITY_M = 5000;
const STALE_FORECAST_MS = 2 * 60 * 60 * 1000;

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
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

function formatDateTime(value: string | null | undefined, language: LanguageMode = "en"): string {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

function localDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: HELSINKI_TIME_ZONE
  }).format(value);
}

function formatTimeWithDay(value: string, language: LanguageMode = "en"): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

function formatTimeRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  t: Translate,
  language: LanguageMode = "en"
): string {
  if (!startsAt || !endsAt) {
    return "n/a";
  }

  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (localDateKey(starts) === localDateKey(ends)) {
    return `${formatCompactTime(startsAt, language)} ${t("to")} ${formatCompactTime(endsAt, language)}`;
  }

  return `${formatTimeWithDay(startsAt, language)} ${t("to")} ${formatTimeWithDay(endsAt, language)}`;
}

function formatTableTime(value: string, language: LanguageMode = "en"): string {
  const date = new Date(value);
  if (localDateKey(date) === localDateKey(new Date())) {
    return formatCompactTime(value, language);
  }

  return formatTimeWithDay(value, language);
}

function pointTime(point: WeatherForecastPoint): number {
  return new Date(point.timestamp).getTime();
}

function orderedPoints(points: WeatherForecastPoint[]): WeatherForecastPoint[] {
  return [...points].sort((a, b) => pointTime(a) - pointTime(b));
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

type ForecastPointSelection = {
  points: WeatherForecastPoint[];
  fallbackLabel: string | null;
};

function fallbackPointLimit(timeWindow: WeatherTimeWindow): number {
  if (timeWindow.preset === "next24h") {
    return 24;
  }
  if (timeWindow.preset === "next7d") {
    return 168;
  }
  if (timeWindow.preset === "day") {
    return 18;
  }
  return 0;
}

function forecastPointsForWindow(
  points: WeatherForecastPoint[],
  timeWindow: WeatherTimeWindow,
  t: Translate,
  language: LanguageMode
): ForecastPointSelection {
  const ordered = orderedPoints(points);
  if (!timeWindow.isValid || !timeWindow.startsAt || !timeWindow.endsAt) {
    return { points: [], fallbackLabel: null };
  }

  const startsAt = new Date(timeWindow.startsAt).getTime();
  const endsAt = new Date(timeWindow.endsAt).getTime();
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) {
    return { points: [], fallbackLabel: null };
  }

  const windowPoints = ordered.filter((point) => {
    const timestamp = pointTime(point);
    return timestamp >= startsAt && timestamp < endsAt;
  });
  if (windowPoints.length > 0 || timeWindow.preset === "custom") {
    return { points: windowPoints, fallbackLabel: null };
  }

  const fallbackPoints = ordered.slice(0, fallbackPointLimit(timeWindow));
  return {
    points: fallbackPoints,
    fallbackLabel:
      fallbackPoints.length > 0
        ? `${t("Available data")} ${formatTimeRange(
            fallbackPoints[0].timestamp,
            fallbackPoints[fallbackPoints.length - 1].timestamp,
            t,
            language
          )}`
        : null
  };
}

function weatherSignalText(point: WeatherForecastPoint | null, t: Translate): string {
  if (!point) {
    return t("Waiting for FMI forecast points");
  }

  const rain = point.precipitation_mm ?? 0;
  const wind = point.wind_speed_ms ?? 0;
  const gust = point.wind_gust_ms ?? wind;
  const visibility = point.visibility_m;
  const cloud = point.cloud_cover_pct ?? 0;
  if (rain >= 1) {
    return t("Rain gear useful");
  }
  if (gust >= OUTDOOR_MAX_GUST_MS || wind >= OUTDOOR_MAX_WIND_MS) {
    return t("Windy window");
  }
  if (visibility !== null && visibility < OUTDOOR_MIN_VISIBILITY_M) {
    return t("Low visibility");
  }
  if (cloud <= 35) {
    return t("Brighter spell");
  }
  return t("Ordinary outdoor conditions");
}

function maxValue(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null
): number {
  return Math.max(1, ...points.map((point) => selector(point) ?? 0));
}

function metricValue(weather: WeatherForecastResponse, key: string, t?: Translate): string {
  const metric = weather.metrics.find((item) => item.key === key);
  if (!metric) {
    return "n/a";
  }

  const value = t ? metric.value.replace(" to ", ` ${t("to")} `) : metric.value;
  return `${value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function firstMetricValue(weather: WeatherForecastResponse, keys: string[], t: Translate): string {
  for (const key of keys) {
    const value = metricValue(weather, key, t);
    if (!value.startsWith("n/a")) {
      return value;
    }
  }

  return "n/a";
}

function seriesPoints(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null,
  language: LanguageMode
): WeatherChartPoint[] {
  return points.flatMap((point) => {
    const value = selector(point);
    if (value === null) {
      return [];
    }

    return [
      {
        label: formatTableTime(point.timestamp, language),
        timestamp: point.timestamp,
        value
      }
    ];
  });
}

function buildWeatherSeries(
  points: WeatherForecastPoint[],
  t: Translate,
  language: LanguageMode
): WeatherChartSeries[] {
  return [
    {
      key: "temperature",
      label: t("Temperature"),
      unit: "C",
      tone: "temperature",
      chart: "line",
      points: seriesPoints(points, (point) => point.temperature_c, language)
    },
    {
      key: "rain",
      label: t("Rain"),
      unit: "mm",
      tone: "rain",
      chart: "bar",
      floorZero: true,
      points: seriesPoints(points, (point) => point.precipitation_mm, language)
    },
    {
      key: "wind",
      label: t("Wind"),
      unit: "m/s",
      tone: "wind",
      chart: "line",
      floorZero: true,
      points: seriesPoints(points, (point) => point.wind_gust_ms ?? point.wind_speed_ms, language)
    },
    {
      key: "cloud",
      label: t("Cloud"),
      unit: "%",
      tone: "cloud",
      chart: "line",
      floorZero: true,
      maxOverride: 100,
      points: seriesPoints(points, (point) => point.cloud_cover_pct, language)
    }
  ];
}

function chartRange(series: WeatherChartSeries): { min: number; max: number } {
  if (series.points.length === 0) {
    return { min: 0, max: series.maxOverride ?? 1 };
  }

  const values = series.points.map((point) => point.value);
  const rawMin = series.floorZero ? 0 : Math.min(...values);
  const rawMax = series.maxOverride ?? Math.max(...values, series.floorZero ? 1 : values[0]);
  if (rawMax === rawMin) {
    const pad = rawMax === 0 ? 1 : Math.abs(rawMax) * 0.15;
    return {
      min: series.floorZero ? 0 : rawMin - pad,
      max: rawMax + pad
    };
  }

  const padding = series.maxOverride ? 0 : (rawMax - rawMin) * 0.12;
  return {
    min: series.floorZero ? 0 : rawMin - padding,
    max: rawMax + padding
  };
}

function chartX(index: number, count: number): number {
  if (count <= 1) {
    return 18;
  }

  return 18 + (index / (count - 1)) * 164;
}

function chartY(value: number, min: number, max: number): number {
  if (max === min) {
    return 40;
  }

  return 68 - ((value - min) / (max - min)) * 52;
}

function formatChartValue(series: WeatherChartSeries, value: number): string {
  return `${formatNumber(value, series.unit === "%" ? 0 : 1)} ${series.unit}`;
}

function seriesReadout(series: WeatherChartSeries, t: Translate): string {
  const values = series.points.map((point) => point.value);
  if (values.length === 0) {
    return "n/a";
  }

  if (series.key === "temperature") {
    return `${formatChartValue(series, Math.min(...values))} ${t("to")} ${formatChartValue(
      series,
      Math.max(...values)
    )}`;
  }

  return `${t("peak")} ${formatChartValue(series, Math.max(...values))}`;
}

function renderMiniChart(series: WeatherChartSeries, t: Translate) {
  if (series.points.length === 0) {
    return <div className="weather-chart-empty">n/a</div>;
  }

  const range = chartRange(series);
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  const polylinePoints = series.points
    .map(
      (point, index) =>
        `${chartX(index, series.points.length).toFixed(1)},${chartY(
          point.value,
          range.min,
          range.max
        ).toFixed(1)}`
    )
    .join(" ");

  return (
    <>
      <div className="weather-chart-card-readout">
        <strong>{seriesReadout(series, t)}</strong>
        <small>
          {first.label} {t("to")} {last.label}
        </small>
      </div>
      <svg aria-hidden="true" className="weather-mini-svg" viewBox="0 0 200 82">
        <line className="weather-mini-grid" x1="18" x2="182" y1="68" y2="68" />
        <line className="weather-mini-grid" x1="18" x2="182" y1="42" y2="42" />
        {series.chart === "bar" ? (
          series.points.map((point, index) => {
            const slotWidth = 164 / Math.max(series.points.length, 1);
            const barWidth = Math.max(3, slotWidth - 3);
            const y = chartY(point.value, range.min, range.max);
            return (
              <rect
                className="weather-mini-bar"
                height={Math.max(3, 68 - y)}
                key={`${series.key}-${point.timestamp}`}
                rx="2"
                width={barWidth}
                x={18 + index * slotWidth}
                y={y}
              >
                <title>{`${series.label}: ${formatChartValue(series, point.value)} ${t("at")} ${point.label}`}</title>
              </rect>
            );
          })
        ) : (
          <>
            <polyline className="weather-mini-line" points={polylinePoints} />
            {series.points.map((point, index) => (
              <circle
                className="weather-mini-point"
                cx={chartX(index, series.points.length)}
                cy={chartY(point.value, range.min, range.max)}
                key={`${series.key}-${point.timestamp}`}
                r="2"
              >
                <title>{`${series.label}: ${formatChartValue(series, point.value)} ${t("at")} ${point.label}`}</title>
              </circle>
            ))}
          </>
        )}
      </svg>
    </>
  );
}

function formatDuration(milliseconds: number, t: Translate): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} ${t("min")}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ${t("h")} ${minutes} ${t("min")}` : `${hours} ${t("h")}`;
}

function rainSummaryForWindows(windows: WeatherRainWindow[], t: Translate, language: LanguageMode): {
  label: string;
  value: string;
  detail: string;
} {
  const now = Date.now();
  const currentWindow = windows.find(
    (window) =>
      new Date(window.starts_at).getTime() <= now && new Date(window.ends_at).getTime() >= now
  );
  if (currentWindow) {
    return {
      label: t("Rain now"),
      value: `${t("Until")} ${formatTableTime(currentWindow.ends_at, language)}`,
      detail: `${t("ends in")} ${formatDuration(new Date(currentWindow.ends_at).getTime() - now, t)}`
    };
  }

  const nextWindow = windows
    .filter((window) => new Date(window.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  if (nextWindow) {
    return {
      label: t("Next rain"),
      value: formatTableTime(nextWindow.starts_at, language),
      detail: `${t("starts in")} ${formatDuration(new Date(nextWindow.starts_at).getTime() - now, t)}, ${t("peak")} ${formatNumber(
        nextWindow.peak_precip_mm
      )} mm`
    };
  }

  return {
    label: t("Rain"),
    value: t("No rain"),
    detail: t("No rain window in the selected forecast range")
  };
}

function isOutdoorPoint(point: WeatherForecastPoint): boolean {
  const rain = point.precipitation_mm ?? 0;
  const wind = point.wind_speed_ms ?? 0;
  const gust = point.wind_gust_ms ?? wind;
  const visibility = point.visibility_m;
  return (
    rain < RAIN_WINDOW_MIN_MM &&
    wind <= OUTDOOR_MAX_WIND_MS &&
    gust <= OUTDOOR_MAX_GUST_MS &&
    (visibility === null || visibility >= OUTDOOR_MIN_VISIBILITY_M)
  );
}

function outdoorWindows(points: WeatherForecastPoint[], t: Translate): WeatherWindow[] {
  const windows: WeatherForecastPoint[][] = [];
  let current: WeatherForecastPoint[] = [];
  let previous: WeatherForecastPoint | null = null;

  for (const point of points) {
    if (!isOutdoorPoint(point)) {
      if (current.length > 0) {
        windows.push(current);
      }
      current = [];
      previous = null;
      continue;
    }

    if (!previous || pointTime(point) <= pointTime(previous) + 65 * 60 * 1000) {
      current.push(point);
    } else {
      windows.push(current);
      current = [point];
    }
    previous = point;
  }

  if (current.length > 0) {
    windows.push(current);
  }

  return windows.map((window) => {
    const maxWind = Math.max(...window.map((point) => point.wind_speed_ms ?? 0));
    const maxRain = Math.max(...window.map((point) => point.precipitation_mm ?? 0));
    return {
      starts_at: window[0].timestamp,
      ends_at: new Date(pointTime(window[window.length - 1]) + 60 * 60 * 1000).toISOString(),
      hours: window.length,
      detail: `${formatNumber(maxRain)} mm ${t("rain")}, ${formatNumber(maxWind)} m/s ${t("wind")}`
    };
  });
}

function bestOutdoorWindow(points: WeatherForecastPoint[], t: Translate): WeatherWindow | null {
  const windows = outdoorWindows(points, t);
  if (windows.length === 0) {
    return null;
  }

  return [...windows].sort((a, b) => b.hours - a.hours || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
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

  const humidity = point?.humidity_pct;
  if (humidity !== null && humidity !== undefined && temp >= 27) {
    const tempF = (temp * 9) / 5 + 32;
    const heatIndexF =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidity -
      0.22475541 * tempF * humidity -
      0.00683783 * tempF * tempF -
      0.05481717 * humidity * humidity +
      0.00122874 * tempF * tempF * humidity +
      0.00085282 * tempF * humidity * humidity -
      0.00000199 * tempF * tempF * humidity * humidity;
    return ((heatIndexF - 32) * 5) / 9;
  }

  return temp;
}

function comfortLabel(point: WeatherForecastPoint | null, t: Translate): string {
  if (!point) {
    return "n/a";
  }

  const feelsLike = apparentTemperature(point);
  const gust = point.wind_gust_ms ?? point.wind_speed_ms ?? 0;
  if (point.visibility_m !== null && point.visibility_m < OUTDOOR_MIN_VISIBILITY_M) {
    return t("Low visibility");
  }
  if (gust >= OUTDOOR_MAX_GUST_MS) {
    return t("Gusty");
  }
  if (feelsLike !== null && feelsLike <= 0) {
    return t("Cold");
  }
  if (feelsLike !== null && feelsLike <= 10) {
    return t("Cool");
  }
  if (feelsLike !== null && feelsLike >= 27) {
    return t("Hot");
  }
  if ((point.humidity_pct ?? 0) >= 85) {
    return t("Humid");
  }
  return t("Comfortable");
}

function windDirectionLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(value / 45) % directions.length];
}

function formatWind(
  speed: number | null | undefined,
  direction: number | null | undefined
): string {
  const directionLabel = windDirectionLabel(direction);
  return `${formatNumber(speed)} m/s${directionLabel ? ` ${directionLabel}` : ""}`;
}

function conditionLabel(point: WeatherForecastPoint | null): string {
  if (!point) {
    return "n/a";
  }

  const code = point.smart_symbol ?? point.weather_symbol;
  if (code !== null && code !== undefined) {
    if (code >= 61 || code === 21 || code === 22 || code === 23) {
      return "Rain";
    }
    if (code >= 41 && code <= 49) {
      return "Snow";
    }
    if (code >= 31 && code <= 39) {
      return "Showers";
    }
    if (code >= 11 && code <= 19) {
      return "Cloudy";
    }
    if (code >= 4 && code <= 10) {
      return "Partly cloudy";
    }
    if (code >= 1 && code <= 3) {
      return "Clear";
    }
  }

  const rain = point.precipitation_mm ?? 0;
  const cloud = point.cloud_cover_pct ?? 0;
  if (rain >= RAIN_WINDOW_MIN_MM) {
    return "Rain";
  }
  if (cloud >= 80) {
    return "Cloudy";
  }
  if (cloud <= 25) {
    return "Clear";
  }
  return "Partly cloudy";
}

function conditionClass(label: string): string {
  return label.toLowerCase().replaceAll(" ", "-");
}

function freshnessStatus(
  generatedAt: string | null,
  language: LanguageMode,
  t: Translate
): { label: string; detail: string; stale: boolean } {
  if (!generatedAt) {
    return {
      label: t("No update"),
      detail: t("forecast timestamp missing"),
      stale: true
    };
  }

  const age = Date.now() - new Date(generatedAt).getTime();
  return {
    label: formatRelativeAge(generatedAt, language),
    detail: age > STALE_FORECAST_MS ? t("stale forecast") : t("fresh forecast"),
    stale: age > STALE_FORECAST_MS
  };
}

function sourceLayerTone(layer: WeatherSourceLayer): string {
  return layer.status === "ready" ? "good" : "neutral";
}

function warningTone(warning: WeatherWarning): string {
  if (warning.severity === "red") {
    return "bad";
  }
  if (warning.severity === "orange" || warning.severity === "yellow") {
    return "warn";
  }
  return "neutral";
}

function stageTone(stage: Pick<WeatherDataStage | WeatherSourceRequest, "status">): string {
  if (stage.status === "ready" || stage.status === "fetched") {
    return "good";
  }
  if (stage.status === "empty" || stage.status === "missing") {
    return "warn";
  }
  return "neutral";
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${formatNumber(value, 0)}%`;
}

function defaultQuality(): WeatherQuality {
  return {
    point_count: 0,
    forecast_hours: 0,
    field_coverage_pct: 0,
    rain_window_count: 0,
    missing_fields: [],
    notes: []
  };
}

function endpointLabel(request: WeatherSourceRequest, t: Translate): string {
  if (!request.endpoint) {
    return t("endpoint not recorded");
  }

  try {
    const url = new URL(request.endpoint);
    const storedQuery = url.searchParams.get("storedquery_id");
    return storedQuery ? `${url.host} · ${storedQuery}` : url.host;
  } catch {
    return request.endpoint;
  }
}

function weatherSummaryText(
  summary: string | null | undefined,
  fallback: string | null | undefined,
  language: LanguageMode,
  t: Translate
): string {
  const value = summary ?? fallback ?? "Latest normalized weather signals.";
  if (language !== "zh") {
    return value;
  }

  const temperatureSummary = value.match(
    /^Temperature ranges from ([\d.-]+)C to ([\d.-]+)C in the next hours\. Peak wind reaches ([\d.-]+) m\/s with gusts up to ([\d.-]+) m\/s and cloud cover peaks at ([\d.-]+)%\.$/
  );
  if (temperatureSummary) {
    return `${t("Next-hours temperature")} ${temperatureSummary[1]} C ${t("to")} ${temperatureSummary[2]} C, ${t("peak wind reaches")} ${temperatureSummary[3]} m/s, ${t("gusts up to")} ${temperatureSummary[4]} m/s, ${t("cloud cover peaks at")} ${temperatureSummary[5]}%.`;
  }

  return t(value);
}

function weatherDetailText(detail: string, t: Translate): string {
  const fetched = detail.match(/^(\d+)\/(\d+) FMI layers fetched$/);
  if (fetched) {
    return `${fetched[1]}/${fetched[2]} ${t("FMI layers fetched")}`;
  }

  const chartItems = detail.match(/^(\d+) chart points, (\d+) rain windows, (\d+) warning items\.$/);
  if (chartItems) {
    return `${chartItems[1]} ${t("chart points")}, ${chartItems[2]} ${t("rain windows")}, ${chartItems[3]} ${t("warning items")}.`;
  }

  const warningItems = detail.match(/^(\d+) active warning item(s?) in the CAP feed\.$/);
  if (warningItems) {
    return `${warningItems[1]} ${t(Number(warningItems[1]) === 1 ? "active warning item" : "active warning items")} ${t("in the CAP feed")}.`;
  }

  return t(detail);
}

function weatherQualityNoteText(note: string, t: Translate): string {
  const missingSeries = note.match(/^Missing full series: (.+)\.$/);
  if (missingSeries) {
    return `${t("Missing full series")}: ${missingSeries[1]
      .split(", ")
      .map((field) => t(field))
      .join(", ")}.`;
  }

  return t(note);
}

function renderForecastRibbon(
  points: WeatherForecastPoint[],
  maxRain: number,
  maxWind: number,
  t: Translate,
  language: LanguageMode
) {
  if (points.length === 0) {
    return <p>{t("No hourly rows are available for the selected range.")}</p>;
  }

  const sampledPoints = points.length > 36 ? points.filter((_, index) => index % 2 === 0) : points;
  return (
    <div className="weather-ribbon-track" aria-label={t("Forecast condition ribbon")}>
      {sampledPoints.map((point) => {
        const label = conditionLabel(point);
        const rainPct = Math.min(100, ((point.precipitation_mm ?? 0) / maxRain) * 100);
        const windPct = Math.min(100, ((point.wind_speed_ms ?? 0) / maxWind) * 100);
        return (
          <div
            className={`weather-ribbon-cell weather-ribbon-${conditionClass(label)}`}
            key={point.timestamp}
            style={
              {
                "--rain": `${rainPct}%`,
                "--wind": `${windPct}%`
              } as CSSProperties
            }
            title={`${formatTableTime(point.timestamp, language)} · ${t(label)} · ${t("rain")} ${formatNumber(
              point.precipitation_mm
            )} mm · ${t("wind")} ${formatNumber(point.wind_speed_ms)} m/s`}
          >
            <span>{formatCompactTime(point.timestamp, language)}</span>
            <i aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

export function WeatherWorkspace({ category, weather, timeWindow }: WeatherWorkspaceProps) {
  const { language, t } = useI18n();

  if (!weather) {
    return (
      <section className="weather-empty" aria-label={t("Weather data unavailable")}>
        <span className="label-text">{t("Weather")}</span>
        <h2>{t("Forecast data is not available yet")}</h2>
        <p>{t("Hourly FMI forecast points have not arrived for the current platform window.")}</p>
      </section>
    );
  }

  const forecastPoints = weather.points ?? [];
  const rainWindows = weather.rain_windows ?? [];
  const current = latestPoint(forecastPoints);
  const visibleSelection = forecastPointsForWindow(forecastPoints, timeWindow, t, language);
  const visiblePoints = visibleSelection.points;
  const maxRain = maxValue(visiblePoints, (point) => point.precipitation_mm);
  const maxWind = maxValue(visiblePoints, (point) => point.wind_gust_ms ?? point.wind_speed_ms);
  const selectedWindowStart = visiblePoints[0]?.timestamp ?? timeWindow.startsAt ?? weather.valid_from;
  const selectedWindowEnd =
    visiblePoints[visiblePoints.length - 1]?.timestamp ?? timeWindow.endsAt ?? weather.valid_to;
  const relevantRainWindows = rainWindows.filter(
    (window) =>
      new Date(window.ends_at).getTime() >= new Date(selectedWindowStart ?? 0).getTime() &&
      new Date(window.starts_at).getTime() <= new Date(selectedWindowEnd ?? Date.now()).getTime()
  );
  const rainSummary = rainSummaryForWindows(relevantRainWindows, t, language);
  const outdoorWindow = bestOutdoorWindow(visiblePoints, t);
  const weatherSeries = buildWeatherSeries(visiblePoints, t, language);
  const freshness = freshnessStatus(weather.generated_at, language, t);
  const currentCondition = conditionLabel(current);
  const feelsLike = apparentTemperature(current);
  const currentWind = current?.wind_gust_ms ?? current?.wind_speed_ms;
  const warnings = weather.warnings ?? [];
  const sourceLayers = weather.source_layers ?? [];
  const sourceRequests = weather.source_requests ?? [];
  const dataPipeline = weather.data_pipeline ?? [];
  const quality = weather.quality ?? defaultQuality();
  const missingFields =
    quality.missing_fields.length > 0 ? quality.missing_fields : ["no full-series gaps"];

  return (
    <section className="weather-workspace" aria-label={t("Weather workspace")}>
      <div className={`weather-hero ${freshness.stale ? "weather-hero-stale" : ""}`}>
        <div>
          <span className="label-text">{weather.source_code} {t("weather")}</span>
          <h2>{weather.location ?? "Helsinki"} {t("forecast")}</h2>
          <p>{weatherSummaryText(weather.summary, category?.description, language, t)}</p>
        </div>
        <div className="weather-current">
          <span className={`weather-symbol weather-symbol-${conditionClass(currentCondition)}`}>
            <i aria-hidden="true" />
            {t(currentCondition)}
          </span>
          <strong>{formatNumber(current?.temperature_c)} C</strong>
          <small>
            {current ? formatTableTime(current.timestamp, language) : "n/a"} · {t("rain")}{" "}
            {formatNumber(current?.precipitation_mm)} mm · {t("wind")}{" "}
            {formatWind(currentWind, current?.wind_direction_deg)} · {weatherSignalText(current, t)}
          </small>
        </div>
      </div>

      {freshness.stale ? (
        <section className="weather-status-banner" aria-label={t("Weather data freshness")}>
          <strong>{t("Forecast may be stale")}</strong>
          <span>{t("Last generated")} {freshness.label}. {t("Treat timing-sensitive rain and wind details with care.")}</span>
        </section>
      ) : null}

      <div className="weather-kpi-grid">
        <article>
          <span>{rainSummary.label}</span>
          <strong>{rainSummary.value}</strong>
          <small>{rainSummary.detail}</small>
        </article>
        <article>
          <span>{t("Best outdoor window")}</span>
          <strong>
            {outdoorWindow
              ? formatTimeRange(outdoorWindow.starts_at, outdoorWindow.ends_at, t, language)
              : t("No clear window")}
          </strong>
          <small>
            {outdoorWindow
              ? `${outdoorWindow.hours} ${t("h")} · ${outdoorWindow.detail}`
              : t("Rain, gusts, or visibility limit this range")}
          </small>
        </article>
        <article>
          <span>{t("Comfort")}</span>
          <strong>{comfortLabel(current, t)}</strong>
          <small>
            {t("feels")} {formatNumber(feelsLike)} C · {t("humidity")} {formatNumber(current?.humidity_pct, 0)}%
          </small>
        </article>
        <article>
          <span>{t("Temperature range")}</span>
          <strong>{metricValue(weather, "temperature_range", t)}</strong>
          <small>{formatTimeRange(weather.valid_from, weather.valid_to, t, language)}</small>
        </article>
        <article>
          <span>{t("Wind")}</span>
          <strong>{firstMetricValue(weather, ["peak_gust", "peak_wind"], t)}</strong>
          <small>
            {t("avg peak")} {metricValue(weather, "peak_wind", t)}
            {windDirectionLabel(current?.wind_direction_deg)
              ? ` · ${windDirectionLabel(current?.wind_direction_deg)}`
              : ""}
          </small>
        </article>
        <article className={freshness.stale ? "weather-kpi-warn" : ""}>
          <span>{t("Updated")}</span>
          <strong>{freshness.label}</strong>
          <small>{freshness.detail} · {t("valid until")} {formatDateTime(weather.valid_to, language)}</small>
        </article>
      </div>

      <div className="weather-data-grid">
        <section className="weather-pipeline-panel" aria-label={t("Weather data pipeline")}>
          <header>
            <div>
              <span className="label-text">{t("Data pipeline")}</span>
              <h3>{t("Fetch, clean, visualize")}</h3>
            </div>
            <strong>{dataPipeline.filter((stage) => stage.status === "ready").length}/3</strong>
          </header>
          <div className="weather-stage-list">
            {dataPipeline.length > 0 ? (
              dataPipeline.map((stage) => (
                <article className={`weather-stage weather-stage-${stageTone(stage)}`} key={stage.key}>
                  <div>
                    <strong>{t(stage.label)}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <small>
                    {weatherDetailText(stage.detail, t)}
                    {stage.record_count !== null ? ` · ${t("records")} ${stage.record_count}` : ""}
                  </small>
                </article>
              ))
            ) : (
              <p>{t("No pipeline metadata was returned with this weather response.")}</p>
            )}
          </div>
        </section>

        <section className="weather-quality-panel" aria-label={t("Weather data quality")}>
          <header>
            <div>
              <span className="label-text">{t("Cleaned data")}</span>
              <h3>{quality.point_count} {t("hourly rows")}</h3>
            </div>
            <strong>{formatPercent(quality.field_coverage_pct)}</strong>
          </header>
          <div className="weather-quality-meter">
            <i style={{ "--quality": `${quality.field_coverage_pct}%` } as CSSProperties} />
          </div>
          <div className="weather-quality-grid">
            <span>{quality.forecast_hours} {t("h")} {t("horizon")}</span>
            <span>{quality.rain_window_count} {t("rain windows")}</span>
            <span>{missingFields.map((field) => t(field)).join(", ")}</span>
          </div>
          <div className="weather-quality-notes">
            {(quality.notes.length > 0 ? quality.notes : ["No quality notes returned."]).map((note) => (
              <small key={note}>{weatherQualityNoteText(note, t)}</small>
            ))}
          </div>
        </section>
      </div>

      <div className="weather-main-grid">
        <section className="weather-chart-panel" aria-label={t("Hourly weather signals")}>
          <header>
            <div>
              <span className="label-text">{t("Hourly signals")}</span>
              <h3>{t(timeWindow.label)} · {visiblePoints.length} {t("forecast points")}</h3>
            </div>
            <small>{visibleSelection.fallbackLabel ?? t(timeWindow.status)}</small>
          </header>
          <div className="weather-ribbon-panel">
            <div>
              <span className="label-text">{t("Visualization layer")}</span>
              <strong>{t("Condition, rain, and wind density")}</strong>
            </div>
            {renderForecastRibbon(visiblePoints, maxRain, maxWind, t, language)}
          </div>
          <div className="weather-chart-grid">
            {weatherSeries.map((series) => (
              <article className={`weather-chart-card weather-chart-card-${series.tone}`} key={series.key}>
                <span>{series.label}</span>
                {renderMiniChart(series, t)}
              </article>
            ))}
          </div>
        </section>

        <div className="weather-side-stack">
          <section className="weather-rain-panel" aria-label={t("Upcoming rain windows")}>
            <header>
              <span className="label-text">{t("Rain windows")}</span>
              <strong>{relevantRainWindows.length}</strong>
            </header>
            <div className="weather-rain-list">
              {relevantRainWindows.length > 0 ? (
                relevantRainWindows.map((window) => (
                  <article key={`${window.starts_at}-${window.ends_at}`}>
                    <div>
                      <strong>{formatTimeRange(window.starts_at, window.ends_at, t, language)}</strong>
                      <span>{window.hours} {t("h")}</span>
                    </div>
                    <small>
                      {t("peak")} {formatNumber(window.peak_precip_mm)} mm {t("at")}{" "}
                      {formatTableTime(window.peak_precip_at, language)} · {t("total")} {formatNumber(window.total_precip_mm)} mm
                    </small>
                  </article>
                ))
              ) : (
                <p>{t("No rain windows detected in this forecast range.")}</p>
              )}
            </div>
          </section>

          <section className="weather-source-panel" aria-label={t("Weather source layers")}>
            <header>
              <span className="label-text">{t("Source layers")}</span>
              <strong>{sourceLayers.filter((layer) => layer.status === "ready").length}</strong>
            </header>
            <div className="weather-source-list">
              {sourceLayers.length > 0 ? (
                sourceLayers.map((layer) => (
                  <article className={`weather-source-layer weather-source-layer-${sourceLayerTone(layer)}`} key={layer.key}>
                    <div>
                      <strong>{t(layer.label)}</strong>
                      <span>{t(layer.status.replaceAll("_", " "))}</span>
                    </div>
                    <small>{weatherDetailText(layer.detail, t)}</small>
                  </article>
                ))
              ) : (
                <p>{t("No source layer metadata was returned with this forecast.")}</p>
              )}
            </div>
            <div className="weather-request-list">
              <span className="label-text">{t("Acquisition requests")}</span>
              {sourceRequests.length > 0 ? (
                sourceRequests.map((request) => (
                  <article className={`weather-request weather-request-${stageTone(request)}`} key={request.key}>
                    <div>
                      <strong>{t(request.label)}</strong>
                      <span>{t(request.status)}</span>
                    </div>
                    <small>
                      {endpointLabel(request, t)}
                      {request.fetched_at ? ` · ${t("fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
                    </small>
                  </article>
                ))
              ) : (
                <p>{t("No acquisition request metadata was returned with this forecast.")}</p>
              )}
            </div>
            <div className="weather-warning-list">
              <span className="label-text">{t("Official warnings")}</span>
              {warnings.length > 0 ? (
                warnings.slice(0, 3).map((warning) => (
                  <article className={`weather-warning weather-warning-${warningTone(warning)}`} key={warning.link ?? warning.title}>
                    {warning.link ? (
                      <a href={warning.link}>{t(warning.title)}</a>
                    ) : (
                      <strong>{t(warning.title)}</strong>
                    )}
                    {warning.description ? <small>{t(warning.description)}</small> : null}
                  </article>
                ))
              ) : (
                <p>{t("No active warnings in the latest collected CAP feed.")}</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="weather-hour-table" aria-label={t("Hourly weather table")}>
        <header>
          <span className="label-text">{t("Hourly details")}</span>
          <strong>{visiblePoints.length} {t("rows")}</strong>
        </header>
        <div className="weather-table-scroll">
          <table className="weather-hour-table-grid">
            <thead>
              <tr>
                <th scope="col">{t("Time")}</th>
                <th scope="col">{t("Condition")}</th>
                <th scope="col">{t("Temp")}</th>
                <th scope="col">{t("Rain")}</th>
                <th scope="col">{t("Wind")}</th>
                <th scope="col">{t("Gust")}</th>
                <th scope="col">{t("Cloud")}</th>
                <th scope="col">{t("Comfort")}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((point) => {
                const label = conditionLabel(point);
                const gust = point.wind_gust_ms ?? point.wind_speed_ms;
                return (
                  <tr key={point.timestamp}>
                    <th scope="row">{formatTableTime(point.timestamp, language)}</th>
                    <td title={`${t("Weather symbol")} ${point.smart_symbol ?? point.weather_symbol ?? "n/a"}`}>
                      <span className={`weather-symbol weather-symbol-${conditionClass(label)}`}>
                        <i aria-hidden="true" />
                        {t(label)}
                      </span>
                    </td>
                    <td title={`${t("Temperature")} ${formatNumber(point.temperature_c)} C`}>
                      {formatNumber(point.temperature_c)} C
                    </td>
                    <td title={`${t("Rain")} ${formatNumber(point.precipitation_mm)} mm`}>
                      <div className="weather-hour-measure">
                        <div className="weather-hour-bar">
                          <i
                            style={
                              {
                                "--weather-bar": `${Math.min(
                                  100,
                                  ((point.precipitation_mm ?? 0) / maxRain) * 100
                                )}%`
                              } as CSSProperties
                            }
                          />
                        </div>
                        <span>{formatNumber(point.precipitation_mm)} mm</span>
                      </div>
                    </td>
                    <td title={`${t("Wind")} ${formatWind(point.wind_speed_ms, point.wind_direction_deg)}`}>
                      <div className="weather-hour-measure">
                        <div className="weather-hour-bar weather-hour-bar-wind">
                          <i
                            style={
                              {
                                "--weather-bar": `${Math.min(
                                  100,
                                  ((point.wind_speed_ms ?? 0) / maxWind) * 100
                                )}%`
                              } as CSSProperties
                            }
                        />
                      </div>
                        <span>{formatWind(point.wind_speed_ms, point.wind_direction_deg)}</span>
                      </div>
                    </td>
                    <td title={`${t("Gust")} ${formatNumber(gust)} m/s`}>{formatNumber(gust)} m/s</td>
                    <td title={`${t("Cloud cover")} ${formatNumber(point.cloud_cover_pct, 0)}%`}>
                      {formatNumber(point.cloud_cover_pct, 0)}%
                    </td>
                    <td title={`${t("Feels like")} ${formatNumber(apparentTemperature(point))} C`}>
                      {comfortLabel(point, t)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
