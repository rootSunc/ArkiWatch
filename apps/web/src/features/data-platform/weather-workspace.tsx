import type { CSSProperties } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import {
  PlatformCategory,
  WeatherForecastPoint,
  WeatherForecastResponse,
  WeatherRainWindow,
  WeatherSourceLayer,
  WeatherWarning
} from "./types";

type WeatherWorkspaceProps = {
  category: PlatformCategory | null;
  weather: WeatherForecastResponse | null;
  timeRange: string;
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-GB", {
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

function formatTimeWithDay(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string | null | undefined, endsAt: string | null | undefined): string {
  if (!startsAt || !endsAt) {
    return "n/a";
  }

  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (localDateKey(starts) === localDateKey(ends)) {
    return `${formatCompactTime(startsAt)} to ${formatCompactTime(endsAt)}`;
  }

  return `${formatTimeWithDay(startsAt)} to ${formatTimeWithDay(endsAt)}`;
}

function formatTableTime(value: string): string {
  const date = new Date(value);
  if (localDateKey(date) === localDateKey(new Date())) {
    return formatCompactTime(value);
  }

  return formatTimeWithDay(value);
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

function forecastPointsForRange(points: WeatherForecastPoint[], timeRange: string): WeatherForecastPoint[] {
  const now = Date.now();
  const ordered = orderedPoints(points);
  const futurePoints = ordered.filter((point) => pointTime(point) >= now);
  const sourcePoints = futurePoints.length > 0 ? futurePoints : ordered;
  const currentDateKey = localDateKey(new Date(now));

  if (timeRange === "Today") {
    const todayPoints = sourcePoints.filter((point) => localDateKey(new Date(point.timestamp)) === currentDateKey);
    return todayPoints.length > 0 ? todayPoints : sourcePoints.slice(0, 18);
  }

  if (timeRange === "24h") {
    return sourcePoints.filter((point) => pointTime(point) < now + 24 * 60 * 60 * 1000).slice(0, 24);
  }

  if (timeRange === "7d") {
    return sourcePoints.filter((point) => pointTime(point) < now + 7 * 24 * 60 * 60 * 1000).slice(0, 168);
  }

  return sourcePoints;
}

function weatherSignalText(point: WeatherForecastPoint | null): string {
  if (!point) {
    return "Waiting for FMI forecast points";
  }

  const rain = point.precipitation_mm ?? 0;
  const wind = point.wind_speed_ms ?? 0;
  const gust = point.wind_gust_ms ?? wind;
  const visibility = point.visibility_m;
  const cloud = point.cloud_cover_pct ?? 0;
  if (rain >= 1) {
    return "Rain gear useful";
  }
  if (gust >= OUTDOOR_MAX_GUST_MS || wind >= OUTDOOR_MAX_WIND_MS) {
    return "Windy window";
  }
  if (visibility !== null && visibility < OUTDOOR_MIN_VISIBILITY_M) {
    return "Low visibility";
  }
  if (cloud <= 35) {
    return "Brighter spell";
  }
  return "Ordinary outdoor conditions";
}

function maxValue(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null
): number {
  return Math.max(1, ...points.map((point) => selector(point) ?? 0));
}

function metricValue(weather: WeatherForecastResponse, key: string): string {
  const metric = weather.metrics.find((item) => item.key === key);
  if (!metric) {
    return "n/a";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function firstMetricValue(weather: WeatherForecastResponse, keys: string[]): string {
  for (const key of keys) {
    const value = metricValue(weather, key);
    if (!value.startsWith("n/a")) {
      return value;
    }
  }

  return "n/a";
}

function seriesPoints(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null
): WeatherChartPoint[] {
  return points.flatMap((point) => {
    const value = selector(point);
    if (value === null) {
      return [];
    }

    return [
      {
        label: formatTableTime(point.timestamp),
        timestamp: point.timestamp,
        value
      }
    ];
  });
}

function buildWeatherSeries(points: WeatherForecastPoint[]): WeatherChartSeries[] {
  return [
    {
      key: "temperature",
      label: "Temperature",
      unit: "C",
      tone: "temperature",
      chart: "line",
      points: seriesPoints(points, (point) => point.temperature_c)
    },
    {
      key: "rain",
      label: "Rain",
      unit: "mm",
      tone: "rain",
      chart: "bar",
      floorZero: true,
      points: seriesPoints(points, (point) => point.precipitation_mm)
    },
    {
      key: "wind",
      label: "Wind",
      unit: "m/s",
      tone: "wind",
      chart: "line",
      floorZero: true,
      points: seriesPoints(points, (point) => point.wind_gust_ms ?? point.wind_speed_ms)
    },
    {
      key: "cloud",
      label: "Cloud",
      unit: "%",
      tone: "cloud",
      chart: "line",
      floorZero: true,
      maxOverride: 100,
      points: seriesPoints(points, (point) => point.cloud_cover_pct)
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

function seriesReadout(series: WeatherChartSeries): string {
  const values = series.points.map((point) => point.value);
  if (values.length === 0) {
    return "n/a";
  }

  if (series.key === "temperature") {
    return `${formatChartValue(series, Math.min(...values))} to ${formatChartValue(
      series,
      Math.max(...values)
    )}`;
  }

  return `peak ${formatChartValue(series, Math.max(...values))}`;
}

function renderMiniChart(series: WeatherChartSeries) {
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
        <strong>{seriesReadout(series)}</strong>
        <small>
          {first.label} to {last.label}
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
                <title>{`${series.label}: ${formatChartValue(series, point.value)} at ${point.label}`}</title>
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
                <title>{`${series.label}: ${formatChartValue(series, point.value)} at ${point.label}`}</title>
              </circle>
            ))}
          </>
        )}
      </svg>
    </>
  );
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function rainSummaryForWindows(windows: WeatherRainWindow[]): {
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
      label: "Rain now",
      value: `Until ${formatTableTime(currentWindow.ends_at)}`,
      detail: `ends in ${formatDuration(new Date(currentWindow.ends_at).getTime() - now)}`
    };
  }

  const nextWindow = windows
    .filter((window) => new Date(window.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  if (nextWindow) {
    return {
      label: "Next rain",
      value: formatTableTime(nextWindow.starts_at),
      detail: `starts in ${formatDuration(new Date(nextWindow.starts_at).getTime() - now)}, peak ${formatNumber(
        nextWindow.peak_precip_mm
      )} mm`
    };
  }

  return {
    label: "Rain",
    value: "No rain",
    detail: "No rain window in the selected forecast range"
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

function outdoorWindows(points: WeatherForecastPoint[]): WeatherWindow[] {
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
      detail: `${formatNumber(maxRain)} mm rain, ${formatNumber(maxWind)} m/s wind`
    };
  });
}

function bestOutdoorWindow(points: WeatherForecastPoint[]): WeatherWindow | null {
  const windows = outdoorWindows(points);
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

function comfortLabel(point: WeatherForecastPoint | null): string {
  if (!point) {
    return "n/a";
  }

  const feelsLike = apparentTemperature(point);
  const gust = point.wind_gust_ms ?? point.wind_speed_ms ?? 0;
  if (point.visibility_m !== null && point.visibility_m < OUTDOOR_MIN_VISIBILITY_M) {
    return "Low visibility";
  }
  if (gust >= OUTDOOR_MAX_GUST_MS) {
    return "Gusty";
  }
  if (feelsLike !== null && feelsLike <= 0) {
    return "Cold";
  }
  if (feelsLike !== null && feelsLike <= 10) {
    return "Cool";
  }
  if (feelsLike !== null && feelsLike >= 27) {
    return "Hot";
  }
  if ((point.humidity_pct ?? 0) >= 85) {
    return "Humid";
  }
  return "Comfortable";
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

function freshnessStatus(generatedAt: string | null): { label: string; detail: string; stale: boolean } {
  if (!generatedAt) {
    return {
      label: "No update",
      detail: "forecast timestamp missing",
      stale: true
    };
  }

  const age = Date.now() - new Date(generatedAt).getTime();
  return {
    label: formatRelativeAge(generatedAt),
    detail: age > STALE_FORECAST_MS ? "stale forecast" : "fresh forecast",
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

export function WeatherWorkspace({ category, weather, timeRange }: WeatherWorkspaceProps) {
  if (!weather || weather.status === "empty" || weather.points.length === 0) {
    return (
      <section className="weather-empty" aria-label="Weather data unavailable">
        <span className="label-text">Weather</span>
        <h2>Forecast data is not available yet</h2>
        <p>Hourly FMI forecast points have not arrived for the current platform window.</p>
      </section>
    );
  }

  const current = latestPoint(weather.points);
  const visiblePoints = forecastPointsForRange(weather.points, timeRange);
  const maxRain = maxValue(visiblePoints, (point) => point.precipitation_mm);
  const maxWind = maxValue(visiblePoints, (point) => point.wind_gust_ms ?? point.wind_speed_ms);
  const selectedWindowStart = visiblePoints[0]?.timestamp ?? weather.valid_from;
  const selectedWindowEnd = visiblePoints[visiblePoints.length - 1]?.timestamp ?? weather.valid_to;
  const relevantRainWindows = weather.rain_windows.filter(
    (window) =>
      new Date(window.ends_at).getTime() >= new Date(selectedWindowStart ?? 0).getTime() &&
      new Date(window.starts_at).getTime() <= new Date(selectedWindowEnd ?? Date.now()).getTime()
  );
  const rainSummary = rainSummaryForWindows(relevantRainWindows);
  const outdoorWindow = bestOutdoorWindow(visiblePoints);
  const weatherSeries = buildWeatherSeries(visiblePoints);
  const freshness = freshnessStatus(weather.generated_at);
  const currentCondition = conditionLabel(current);
  const feelsLike = apparentTemperature(current);
  const currentWind = current?.wind_gust_ms ?? current?.wind_speed_ms;
  const warnings = weather.warnings ?? [];
  const sourceLayers = weather.source_layers ?? [];

  return (
    <section className="weather-workspace" aria-label="Weather workspace">
      <div className={`weather-hero ${freshness.stale ? "weather-hero-stale" : ""}`}>
        <div>
          <span className="label-text">{weather.source_code} weather</span>
          <h2>{weather.location ?? "Helsinki"} forecast</h2>
          <p>{weather.summary ?? category?.description ?? "Latest normalized weather signals."}</p>
        </div>
        <div className="weather-current">
          <span className={`weather-symbol weather-symbol-${conditionClass(currentCondition)}`}>
            <i aria-hidden="true" />
            {currentCondition}
          </span>
          <strong>{formatNumber(current?.temperature_c)} C</strong>
          <small>
            {current ? formatTableTime(current.timestamp) : "n/a"} · rain{" "}
            {formatNumber(current?.precipitation_mm)} mm · wind{" "}
            {formatWind(currentWind, current?.wind_direction_deg)} · {weatherSignalText(current)}
          </small>
        </div>
      </div>

      {freshness.stale ? (
        <section className="weather-status-banner" aria-label="Weather data freshness">
          <strong>Forecast may be stale</strong>
          <span>Last generated {freshness.label}. Treat timing-sensitive rain and wind details with care.</span>
        </section>
      ) : null}

      <div className="weather-kpi-grid">
        <article>
          <span>{rainSummary.label}</span>
          <strong>{rainSummary.value}</strong>
          <small>{rainSummary.detail}</small>
        </article>
        <article>
          <span>Best outdoor window</span>
          <strong>{outdoorWindow ? formatTimeRange(outdoorWindow.starts_at, outdoorWindow.ends_at) : "No clear window"}</strong>
          <small>{outdoorWindow ? `${outdoorWindow.hours} h · ${outdoorWindow.detail}` : "Rain, gusts, or visibility limit this range"}</small>
        </article>
        <article>
          <span>Comfort</span>
          <strong>{comfortLabel(current)}</strong>
          <small>
            feels {formatNumber(feelsLike)} C · humidity {formatNumber(current?.humidity_pct, 0)}%
          </small>
        </article>
        <article>
          <span>Temperature range</span>
          <strong>{metricValue(weather, "temperature_range")}</strong>
          <small>{formatTimeRange(weather.valid_from, weather.valid_to)}</small>
        </article>
        <article>
          <span>Wind</span>
          <strong>{firstMetricValue(weather, ["peak_gust", "peak_wind"])}</strong>
          <small>
            avg peak {metricValue(weather, "peak_wind")}
            {windDirectionLabel(current?.wind_direction_deg)
              ? ` · ${windDirectionLabel(current?.wind_direction_deg)}`
              : ""}
          </small>
        </article>
        <article className={freshness.stale ? "weather-kpi-warn" : ""}>
          <span>Updated</span>
          <strong>{freshness.label}</strong>
          <small>{freshness.detail} · valid until {formatDateTime(weather.valid_to)}</small>
        </article>
      </div>

      <div className="weather-main-grid">
        <section className="weather-chart-panel" aria-label="Hourly weather signals">
          <header>
            <div>
              <span className="label-text">Hourly signals</span>
              <h3>{timeRange} · {visiblePoints.length} forecast points</h3>
            </div>
            <small>{formatTimeRange(selectedWindowStart, selectedWindowEnd)}</small>
          </header>
          <div className="weather-chart-grid">
            {weatherSeries.map((series) => (
              <article className={`weather-chart-card weather-chart-card-${series.tone}`} key={series.key}>
                <span>{series.label}</span>
                {renderMiniChart(series)}
              </article>
            ))}
          </div>
        </section>

        <div className="weather-side-stack">
          <section className="weather-rain-panel" aria-label="Upcoming rain windows">
            <header>
              <span className="label-text">Rain windows</span>
              <strong>{relevantRainWindows.length}</strong>
            </header>
            <div className="weather-rain-list">
              {relevantRainWindows.length > 0 ? (
                relevantRainWindows.map((window) => (
                  <article key={`${window.starts_at}-${window.ends_at}`}>
                    <div>
                      <strong>{formatTimeRange(window.starts_at, window.ends_at)}</strong>
                      <span>{window.hours} h</span>
                    </div>
                    <small>
                      peak {formatNumber(window.peak_precip_mm)} mm at{" "}
                      {formatTableTime(window.peak_precip_at)} · total {formatNumber(window.total_precip_mm)} mm
                    </small>
                  </article>
                ))
              ) : (
                <p>No rain windows detected in this forecast range.</p>
              )}
            </div>
          </section>

          <section className="weather-source-panel" aria-label="Weather source layers">
            <header>
              <span className="label-text">Source layers</span>
              <strong>{sourceLayers.filter((layer) => layer.status === "ready").length}</strong>
            </header>
            <div className="weather-source-list">
              {sourceLayers.length > 0 ? (
                sourceLayers.map((layer) => (
                  <article className={`weather-source-layer weather-source-layer-${sourceLayerTone(layer)}`} key={layer.key}>
                    <div>
                      <strong>{layer.label}</strong>
                      <span>{layer.status.replaceAll("_", " ")}</span>
                    </div>
                    <small>{layer.detail}</small>
                  </article>
                ))
              ) : (
                <p>No source layer metadata was returned with this forecast.</p>
              )}
            </div>
            <div className="weather-warning-list">
              <span className="label-text">Official warnings</span>
              {warnings.length > 0 ? (
                warnings.slice(0, 3).map((warning) => (
                  <article className={`weather-warning weather-warning-${warningTone(warning)}`} key={warning.link ?? warning.title}>
                    {warning.link ? (
                      <a href={warning.link}>{warning.title}</a>
                    ) : (
                      <strong>{warning.title}</strong>
                    )}
                    {warning.description ? <small>{warning.description}</small> : null}
                  </article>
                ))
              ) : (
                <p>No active warnings in the latest collected CAP feed.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="weather-hour-table" aria-label="Hourly weather table">
        <header>
          <span className="label-text">Hourly details</span>
          <strong>{visiblePoints.length} rows</strong>
        </header>
        <div className="weather-table-scroll">
          <table className="weather-hour-table-grid">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Condition</th>
                <th scope="col">Temp</th>
                <th scope="col">Rain</th>
                <th scope="col">Wind</th>
                <th scope="col">Gust</th>
                <th scope="col">Cloud</th>
                <th scope="col">Comfort</th>
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((point) => {
                const label = conditionLabel(point);
                const gust = point.wind_gust_ms ?? point.wind_speed_ms;
                return (
                  <tr key={point.timestamp}>
                    <th scope="row">{formatTableTime(point.timestamp)}</th>
                    <td title={`Weather symbol ${point.smart_symbol ?? point.weather_symbol ?? "n/a"}`}>
                      <span className={`weather-symbol weather-symbol-${conditionClass(label)}`}>
                        <i aria-hidden="true" />
                        {label}
                      </span>
                    </td>
                    <td title={`Temperature ${formatNumber(point.temperature_c)} C`}>
                      {formatNumber(point.temperature_c)} C
                    </td>
                    <td title={`Rain ${formatNumber(point.precipitation_mm)} mm`}>
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
                    <td title={`Wind ${formatWind(point.wind_speed_ms, point.wind_direction_deg)}`}>
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
                    <td title={`Gust ${formatNumber(gust)} m/s`}>{formatNumber(gust)} m/s</td>
                    <td title={`Cloud cover ${formatNumber(point.cloud_cover_pct, 0)}%`}>
                      {formatNumber(point.cloud_cover_pct, 0)}%
                    </td>
                    <td title={`Feels like ${formatNumber(apparentTemperature(point))} C`}>
                      {comfortLabel(point)}
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
