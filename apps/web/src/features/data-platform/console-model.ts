import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformHistoryResponse,
  PlatformTimeScope,
  WeatherForecastResponse,
} from "./types";
import type { TrendChartPoint } from "./trend-chart";
import { scopedReferenceTime } from "./data-time-scope";
import { formatTimestamp } from "@/features/shared/format";
import type { LanguageMode } from "./i18n";
import type { EnergyPanelKey } from "./workspace-query-params";

export type ConsoleSignals = {
  weather?: WeatherForecastResponse | null;
  airQuality?: AirQualityCurrentResponse | null;
  energy?: EnergyCurrentResponse | null;
  householdEnergy?: EnergyCurrentResponse | null;
  history?: PlatformHistoryResponse;
  timeScope?: PlatformTimeScope | null;
  referenceAt?: string;
  energyPanel?: EnergyPanelKey;
};

const unavailable = (status: string) =>
  ["stale", "failed", "error", "empty", "not_collected"].includes(status);
const DAY_MS = 24 * 60 * 60 * 1000;

export function weatherReferencePoint(
  weather: WeatherForecastResponse | null | undefined,
  referenceAt?: string,
) {
  const reference = Date.parse(
    referenceAt ??
      scopedReferenceTime(weather?.time_scope, weather?.checked_at) ??
      "",
  );
  if (!Number.isFinite(reference)) return null;
  return (
    weather?.points
      .filter(
        (point) =>
          point.temperature_c != null &&
          Number.isFinite(point.temperature_c) &&
          Number.isFinite(Date.parse(point.timestamp)),
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.timestamp) - reference) -
          Math.abs(Date.parse(b.timestamp) - reference),
      )[0] ?? null
  );
}

export function consoleEnergy(signals: ConsoleSignals) {
  return signals.energyPanel === "fingrid"
    ? signals.energy
    : signals.energyPanel === "porssisahko"
      ? signals.householdEnergy
      : (signals.householdEnergy ?? signals.energy);
}

function referenceFor(category: PlatformCategory, signals: ConsoleSignals) {
  const data =
    category.key === "weather"
      ? signals.weather
      : category.key === "energy"
        ? consoleEnergy(signals)
        : signals.airQuality;
  return (
    scopedReferenceTime(
      signals.timeScope ?? data?.time_scope,
      signals.referenceAt ?? data?.checked_at,
    ) ?? ""
  );
}

function dateAt(timestamp: string, timezone: string): string {
  const instant = new Date(timestamp);
  if (!Number.isFinite(instant.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"]
    .map((kind) => parts.find((part) => part.type === kind)?.value)
    .join("-");
}

/** Daily samples stay discrete: gaps and future snapshots are never filled. */
export function signalHistoryTrend(
  category: PlatformCategory,
  signals: ConsoleSignals,
  days: 7 | 30,
  timezone: string,
): TrendChartPoint[] {
  if (unavailable(category.status) || !signals.history) return [];
  const endDate =
    signals.timeScope?.date ??
    dateAt(referenceFor(category, signals), timezone);
  if (!endDate) return [];
  const firstDate = new Date(
    Date.parse(`${endDate}T00:00:00Z`) - (days - 1) * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  const history = signals.history;
  const samples: TrendChartPoint[] = [];
  const mean = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  if (category.key === "weather") {
    for (const snapshot of history.weather) {
      if (!snapshot.data || unavailable(snapshot.data.status)) continue;
      const value = mean(
        snapshot.data.points
          .filter(
            (p) =>
              dateAt(p.timestamp, timezone) === snapshot.date &&
              p.temperature_c != null &&
              Number.isFinite(p.temperature_c),
          )
          .map((p) => p.temperature_c!),
      );
      if (value != null)
        samples.push({
          label: snapshot.date,
          value,
          detail: snapshot.data.source_code.toUpperCase(),
        });
    }
  } else if (category.key === "energy") {
    const snapshots =
      signals.energyPanel === "fingrid"
        ? history.energy
        : history.householdEnergy;
    const current = consoleEnergy(signals);
    for (const snapshot of snapshots) {
      if (
        !snapshot.data ||
        unavailable(snapshot.data.status) ||
        (current &&
          (snapshot.data.source_code !== current.source_code ||
            snapshot.data.unit !== current.unit))
      )
        continue;
      // Integrate intervals so hourly and quarter-hourly schedules are comparable.
      let weighted = 0,
        duration = 0;
      for (const point of snapshot.data.points) {
        if (
          dateAt(point.starts_at, timezone) !== snapshot.date ||
          !Number.isFinite(point.value)
        )
          continue;
        const span = Date.parse(point.ends_at) - Date.parse(point.starts_at);
        if (!(span > 0)) continue;
        weighted += point.value * span;
        duration += span;
      }
      if (duration)
        samples.push({
          label: snapshot.date,
          value: weighted / duration,
          detail: snapshot.data.source_code.toUpperCase(),
        });
    }
  } else if (category.key === "air") {
    for (const snapshot of history.airQuality) {
      const value = snapshot.data?.worst_score;
      if (
        snapshot.data &&
        !unavailable(snapshot.data.status) &&
        value != null &&
        Number.isFinite(value)
      )
        samples.push({
          label: snapshot.date,
          value,
          detail: snapshot.data.source_code.toUpperCase(),
        });
    }
  } else if (category.key === "mobility") {
    for (const snapshot of history.transit) {
      const road = history.roadRail.find(
        (entry) => entry.date === snapshot.date,
      )?.data;
      if (
        snapshot.data &&
        road &&
        !unavailable(snapshot.data.status) &&
        !unavailable(road.status)
      )
        samples.push({
          label: snapshot.date,
          value:
            snapshot.data.quality.active_alert_count +
            road.quality.active_event_count,
          detail: "DIGITRANSIT, DIGITRAFFIC",
        });
    }
  }
  return samples
    .filter((point) => point.label >= firstDate && point.label <= endDate)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A 24-hour window is determined by timestamps, independent of sampling rate. */
export function signalTrend(
  category: PlatformCategory,
  signals: ConsoleSignals,
  language: LanguageMode,
  timezone: string,
): TrendChartPoint[] {
  if (unavailable(category.status)) return [];
  if (["air", "mobility"].includes(category.key))
    return signalHistoryTrend(category, signals, 7, timezone);
  const start = Date.parse(referenceFor(category, signals));
  const inWindow = (timestamp: string) =>
    Date.parse(timestamp) >= start && Date.parse(timestamp) < start + DAY_MS;
  if (category.key === "weather" && signals.weather) {
    return signals.weather.points
      .filter(
        (p) =>
          p.temperature_c != null &&
          Number.isFinite(p.temperature_c) &&
          inWindow(p.timestamp),
      )
      .map((p) => ({
        timestamp: p.timestamp,
        label: formatTimestamp(p.timestamp, "time", language, timezone),
        value: p.temperature_c!,
        detail: signals.weather!.source_code.toUpperCase(),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  if (category.key === "energy") {
    const energy = consoleEnergy(signals);
    if (!energy || unavailable(energy.status)) return [];
    return energy.points
      .filter((p) => Number.isFinite(p.value) && inWindow(p.starts_at))
      .map((p) => ({
        timestamp: p.starts_at,
        label: formatTimestamp(p.starts_at, "time", language, timezone),
        value: p.value,
        detail: energy.source_code.toUpperCase(),
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  const series = category.visualizations.find((v) =>
    ["line", "area", "timeseries", "time_series", "trend"].includes(v.type),
  );
  const points = series?.data.points ?? series?.data.series?.[0]?.points ?? [];
  return points
    .filter(
      (p) => p.timestamp && Number.isFinite(p.value) && inWindow(p.timestamp),
    )
    .map((p) => ({
      timestamp: p.timestamp!,
      label: formatTimestamp(p.timestamp!, "time", language, timezone),
      value: p.value,
      detail: p.detail,
    }));
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  // CSV cells beginning with spreadsheet formulas are exported as text.
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    return `"${(/^[=+@\t\r-]/.test(text) && typeof value !== "number" ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\uFEFF",
        [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
