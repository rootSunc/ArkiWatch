import type { LanguageMode } from "./i18n";
import { translateMessageKey } from "./i18n";
import type { WeatherForecastResponse } from "./types";

function findMetric(weather: WeatherForecastResponse, key: string) {
  return weather.metrics.find((metric) => metric.key === key);
}

function formatMetricValue(
  metric: { value: string; unit: string | null },
  language: LanguageMode,
): string {
  const value = metric.value.replace(/\s+to\s+/i, ` ${translateMessageKey(language, "shell.to")} `);
  if (!metric.unit) {
    return value;
  }
  const unit = metric.unit.trim();
  if (unit === "C") {
    return `${value} °C`;
  }
  return `${value} ${unit}`;
}

export function weatherSnapshotHeadline(
  weather: WeatherForecastResponse,
  language: LanguageMode,
): string {
  const range = findMetric(weather, "temperature_range");
  if (range) {
    return formatMetricValue(range, language);
  }

  const temp = findMetric(weather, "temperature");
  if (temp) {
    return formatMetricValue(temp, language);
  }

  const current = weather.points.find((point) => point.temperature_c !== null);
  if (current?.temperature_c !== null && current?.temperature_c !== undefined) {
    return `${current.temperature_c.toFixed(1)} °C`;
  }

  return translateMessageKey(language, "shell.weatherDataAvailable");
}

export function weatherSnapshotDetail(
  weather: WeatherForecastResponse,
  language: LanguageMode,
): string {
  const warningCount = weather.warnings.length;
  if (warningCount > 0) {
    return `${warningCount} ${translateMessageKey(language, "shell.warnings")}`;
  }

  const parts: string[] = [];
  const wind = findMetric(weather, "peak_wind");
  const gust = findMetric(weather, "peak_gust");
  if (wind) {
    parts.push(`${translateMessageKey(language, "shell.wind")} ${formatMetricValue(wind, language)}`);
  }
  if (gust) {
    parts.push(`${translateMessageKey(language, "shell.gust")} ${formatMetricValue(gust, language)}`);
  }

  const rainCount = weather.quality.rain_window_count;
  if (rainCount > 0) {
    parts.push(`${rainCount} ${translateMessageKey(language, "shell.rainWindows")}`);
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return `${weather.quality.forecast_hours}h ${translateMessageKey(language, "shell.forecast")}`;
}
