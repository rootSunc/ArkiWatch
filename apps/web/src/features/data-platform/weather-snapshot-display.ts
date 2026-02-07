import type { LanguageMode } from "./i18n";
import { translateText } from "./i18n";
import type { WeatherForecastResponse } from "./types";

function findMetric(weather: WeatherForecastResponse, key: string) {
  return weather.metrics.find((metric) => metric.key === key);
}

function formatMetricValue(
  metric: { value: string; unit: string | null },
  language: LanguageMode,
): string {
  const t = (value: string) => translateText(language, value);
  const value = metric.value.replace(/\s+to\s+/i, ` ${t("to")} `);
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
  const t = (value: string) => translateText(language, value);
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

  return t("Weather data available");
}

export function weatherSnapshotDetail(
  weather: WeatherForecastResponse,
  language: LanguageMode,
): string {
  const t = (value: string) => translateText(language, value);
  const warningCount = weather.warnings.length;
  if (warningCount > 0) {
    return `${warningCount} ${t("warnings")}`;
  }

  const parts: string[] = [];
  const wind = findMetric(weather, "peak_wind");
  const gust = findMetric(weather, "peak_gust");
  if (wind) {
    parts.push(`${t("Wind")} ${formatMetricValue(wind, language)}`);
  }
  if (gust) {
    parts.push(`${t("Gust")} ${formatMetricValue(gust, language)}`);
  }

  const rainCount = weather.quality.rain_window_count;
  if (rainCount > 0) {
    parts.push(`${rainCount} ${t("rain windows")}`);
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return `${weather.quality.forecast_hours}h ${t("forecast")}`;
}
