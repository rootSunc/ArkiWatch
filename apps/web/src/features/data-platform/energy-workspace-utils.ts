import { formatRelativeAge } from "@/features/shared/format";

import { translateEnumLabel, translateMetricLabel, type LanguageMode } from "./i18n";
import {
  PRICE_CHART_HEIGHT,
  PRICE_CHART_PAD_BOTTOM,
  PRICE_CHART_PAD_LEFT,
  PRICE_CHART_PAD_RIGHT,
  PRICE_CHART_PAD_TOP,
  PRICE_CHART_WIDTH,
} from "./energy-workspace-config";
import type { TrendChartPoint } from "./lazy-trend-chart";
import type {
  DashboardSource,
  EnergyCurrentResponse,
  EnergyMetric,
  EnergyPoint,
  PlatformCategory,
  PlatformEvent,
  PlatformHistoricalSnapshot,
  PlatformMetric,
  PlatformVisualizationPoint,
  PlatformVisualizationTimelineItem,
} from "./types";
import type { EnergyPanelKey } from "./workspace-query-params";
import type { EnergyDisplayPoint, EnergyTone, PanelMetric } from "./energy-workspace-types";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";

export function formatMetricValue(metric: PanelMetric | null, tKey: (key: string) => string): string {
  if (!metric) {
    return tKey("energy.missing");
  }

  if (metric.unit?.toUpperCase() === "EUR") {
    return formatEstimatedCost(numericValue(metric.value), tKey);
  }
  if (metric.unit === "%") {
    return `${metric.value}%`;
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

export function displayMetricLabelKey(metric: PanelMetric | null): string | null {
  if (metric?.key === "estimated_cost") {
    return "estimatedCost";
  }
  if (metric?.key === "window_average" && isPriceUnit(metric.unit)) {
    return "averageSpotPrice";
  }
  if (metric?.key === "minimum_value" && isPriceUnit(metric.unit)) {
    return "cheapestSpotPrice";
  }
  if (metric?.key === "maximum_value" && isPriceUnit(metric.unit)) {
    return "peakSpotPrice";
  }
  if (metric?.key === "relative_savings") {
    return "belowForecastAverage";
  }

  return null;
}

export function resolveMetricLabel(
  metric: PanelMetric | null,
  tKey: (key: string) => string,
  language: LanguageMode,
): string {
  const key = displayMetricLabelKey(metric);
  if (key) {
    return tKey(`energy.${key}`);
  }

  return metric ? translateMetricLabel(language, metric) : tKey("energy.metricUnavailable");
}

export function formatCompactTime(
  value: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey("energy.notScheduled");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(new Date(value))
    .toUpperCase();
}

export function relativeTime(value: string | null | undefined, language: LanguageMode, tKey: (key: string) => string): string {
  return value ? formatRelativeAge(value, language) : tKey("energy.notObserved");
}

export function toneFromStatus(status: string): EnergyTone {
  if (status === "healthy" || status === "ready" || status === "fetched" || status === "connected") {
    return "good";
  }
  if (status === "pending" || status === "stale" || status === "watch" || status === "planned") {
    return "warn";
  }
  if (status === "failing" || status === "inactive" || status === "alert" || status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
}

export function toneFromSeverity(severity: string): EnergyTone {
  if (severity === "HIGH") {
    return "bad";
  }
  if (severity === "MEDIUM") {
    return "warn";
  }
  if (severity === "LOW") {
    return "good";
  }
  return "neutral";
}

export function metricTone(metric: PanelMetric | null): EnergyTone {
  return metric ? (metric.tone as EnergyTone) : "neutral";
}

export function progressFromTone(tone: EnergyTone): number {
  if (tone === "good") {
    return 88;
  }
  if (tone === "warn") {
    return 48;
  }
  if (tone === "bad") {
    return 18;
  }
  return 60;
}

export function numericValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function metricProgress(metric: PanelMetric | null): number {
  if (!metric) {
    return 24;
  }

  const value = numericValue(metric.value);
  if (value === null) {
    return progressFromTone(metricTone(metric));
  }

  return Math.max(8, Math.min(100, value));
}

export function energyMetricTone(metric: EnergyMetric): EnergyTone {
  if (metric.value === "n/a") {
    return "neutral";
  }
  if (metric.key === "window_average") {
    return "good";
  }
  if (metric.key === "field_coverage" && numericValue(metric.value) !== null && numericValue(metric.value)! < 70) {
    return "warn";
  }
  return "neutral";
}

export function latestEnergyEvent(category: PlatformCategory): PlatformEvent | null {
  return (
    [...category.events]
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
      .find((event) => event.category_key === "energy") ?? null
  );
}

export function energyTimelineItems(category: PlatformCategory): PlatformVisualizationTimelineItem[] {
  const timeline = category.visualizations.find((item) => item.id === "energy-window-timeline");
  return timeline?.data.items ?? [];
}

export function sourceVolumePoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const sourceVolume = category.visualizations.find((item) => item.id === "energy-source-volume");
  return sourceVolume?.data.points ?? [];
}

export function severityPoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const severity = category.visualizations.find((item) => item.id === "energy-severity-distribution");
  return severity?.data.points ?? [];
}

export function sourceByCode(category: PlatformCategory, sourceCode: EnergyPanelKey): DashboardSource | null {
  return category.sources.find((candidate) => candidate.source_code === sourceCode) ?? null;
}

export function sourceStatusLabel(
  source: DashboardSource | null,
  fallbackStatus: string,
  language: LanguageMode
): string {
  return translateEnumLabel(language, source?.operational_status ?? fallbackStatus);
}

export function sourceStatusMetric(source: DashboardSource | null, fallbackStatus: string): PanelMetric {
  const status = source?.operational_status ?? fallbackStatus;
  return {
    key: "source_status",
    label: "Source state",
    value: status,
    unit: null,
    tone: toneFromStatus(status),
    detail: source?.error_message ?? null,
    updated_at: source?.last_run_finished_at ?? source?.last_run_started_at ?? null
  };
}

export function sourceRecordsMetric(source: DashboardSource | null): PanelMetric {
  return {
    key: "records_ingested",
    label: "Records",
    value: `${source?.records_ingested ?? 0}`,
    unit: null,
    tone: toneFromStatus(source?.operational_status ?? "unknown"),
    detail: source?.last_run_status ?? null,
    updated_at: source?.last_run_finished_at ?? source?.last_run_started_at ?? null
  };
}

export function pollIntervalLabel(seconds: number | null | undefined, tKey: (key: string) => string): string {
  if (!seconds) {
    return tKey("energy.cadenceMissing");
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }

  return `${Math.round(seconds / 3600)} h`;
}

export function sourceProgress(point: PlatformVisualizationPoint): number {
  const max = Math.max(1, point.value);
  return Math.max(8, Math.min(100, (point.value / max) * 100));
}

export function pointValueRange(points: EnergyPoint[]): { min: number; max: number } {
  const values = points.map((point) => point.value);
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

export function energyPointUnit(point: EnergyPoint | null, fallback: string | null | undefined): string | null {
  return point?.unit ?? fallback ?? null;
}

export function formatValueWithUnit(value: number, unit: string | null | undefined): string {
  if (unit?.toUpperCase() === "EUR") {
    return formatEstimatedCost(value, (label) => label);
  }

  return `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

export function formatEnergyPointValue(point: EnergyPoint, fallbackUnit: string | null | undefined): string {
  const unit = energyPointUnit(point, fallbackUnit);
  return formatValueWithUnit(point.value, unit);
}

export function formatEstimatedCost(value: number | null | undefined, tKey: (key: string) => string): string {
  if (value === null || value === undefined) {
    return tKey("energy.costNA");
  }

  return `EUR ${value.toFixed(2)}`;
}

export function isPriceUnit(unit: string | null | undefined): boolean {
  return unit !== null && unit !== undefined && unit.toLowerCase().includes("kwh");
}

export function estimatedCostFromPrice(
  priceValue: number | null | undefined,
  unit: string | null | undefined,
  usageKwh: number | null | undefined
): number | null {
  if (priceValue === null || priceValue === undefined || usageKwh === null || usageKwh === undefined || !isPriceUnit(unit)) {
    return null;
  }

  return (priceValue * usageKwh) / 100;
}

export function priceDisplayPoint(
  point: EnergyPoint,
  fallbackUnit: string | null | undefined,
  usageKwh: number | null | undefined
): EnergyDisplayPoint | null {
  const displayValue =
    point.estimated_cost_eur ?? estimatedCostFromPrice(point.value, energyPointUnit(point, fallbackUnit), usageKwh);

  if (displayValue === null || !Number.isFinite(displayValue)) {
    return null;
  }

  return {
    raw: point,
    display: {
      ...point,
      value: displayValue,
      unit: "EUR"
    }
  };
}

export function chartDisplayPoints(
  points: EnergyPoint[],
  isPricePanel: boolean,
  fallbackUnit: string | null | undefined,
  usageKwh: number | null | undefined
): EnergyDisplayPoint[] {
  if (!isPricePanel) {
    return points.map((point) => ({ raw: point, display: point }));
  }

  return points.flatMap((point) => {
    const displayPoint = priceDisplayPoint(point, fallbackUnit, usageKwh);
    return displayPoint ? [displayPoint] : [];
  });
}

export function formatEnergyRange(
  range: { min: number; max: number },
  unit: string | null | undefined,
  tKey: (key: string) => string
): string {
  return `${formatValueWithUnit(range.min, unit)} ${tKey("energy.to")} ${formatValueWithUnit(range.max, unit)}`;
}

export function formatEnergySpread(range: { min: number; max: number }, unit: string | null | undefined): string {
  return formatValueWithUnit(range.max - range.min, unit);
}

export function chartScale(points: EnergyPoint[], includeZero: boolean): { min: number; max: number } {
  if (points.length === 0) {
    return { min: 0, max: 1 };
  }

  const values = points.map((point) => point.value);
  const rawMin = includeZero ? Math.min(0, ...values) : Math.min(...values);
  const rawMax = includeZero ? Math.max(0, ...values) : Math.max(...values);
  if (rawMin === rawMax) {
    const padding = rawMax === 0 ? 1 : Math.abs(rawMax) * 0.12;
    return { min: rawMin - padding, max: rawMax + padding };
  }

  const padding = (rawMax - rawMin) * 0.08;
  return {
    min: includeZero ? Math.min(0, rawMin - padding) : rawMin - padding,
    max: includeZero ? Math.max(0, rawMax + padding) : rawMax + padding
  };
}

export function chartY(value: number, min: number, max: number): number {
  if (max === min) {
    return PRICE_CHART_HEIGHT / 2;
  }

  const innerHeight = PRICE_CHART_HEIGHT - PRICE_CHART_PAD_TOP - PRICE_CHART_PAD_BOTTOM;
  return PRICE_CHART_PAD_TOP + (1 - (value - min) / (max - min)) * innerHeight;
}

export function chartX(index: number, count: number): number {
  if (count <= 1) {
    return PRICE_CHART_PAD_LEFT;
  }

  const innerWidth = PRICE_CHART_WIDTH - PRICE_CHART_PAD_LEFT - PRICE_CHART_PAD_RIGHT;
  return PRICE_CHART_PAD_LEFT + (index / (count - 1)) * innerWidth;
}

export function priceLinePath(points: EnergyPoint[], scale: { min: number; max: number }): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chartX(index, points.length).toFixed(1)},${chartY(point.value, scale.min, scale.max).toFixed(1)}`;
    })
    .join(" ");
}

export function priceAreaPath(points: EnergyPoint[], scale: { min: number; max: number }): string {
  if (points.length === 0) {
    return "";
  }

  const line = priceLinePath(points, scale);
  const baseline = PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM;
  return `${line} L${chartX(points.length - 1, points.length).toFixed(1)},${baseline} L${PRICE_CHART_PAD_LEFT},${baseline} Z`;
}

export function isWindowPoint(point: EnergyPoint, startsAt: string | null | undefined, endsAt: string | null | undefined): boolean {
  if (!startsAt || !endsAt) {
    return false;
  }

  const pointStart = new Date(point.starts_at).getTime();
  const pointEnd = new Date(point.ends_at).getTime();
  return pointEnd > new Date(startsAt).getTime() && pointStart < new Date(endsAt).getTime();
}

export function isNoActiveWindowLabel(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.startsWith("no active") || normalizedValue.includes("not available yet");
}

export function formatHistoryDate(value: string, timeZone = DEFAULT_DATA_TIME_ZONE): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsed)
    .toUpperCase();
}

export function averagePointValue(points: EnergyPoint[]): number | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

export function energyHistoryPoints(
  history: PlatformHistoricalSnapshot<EnergyCurrentResponse>[],
  tKey: (key: string) => string,
  showEstimatedCost: boolean,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    const averageRawValue = data.quality.average_value ?? averagePointValue(data.points);
    const usageKwh = data.current_window?.usage_kwh ?? null;
    const averageValue = showEstimatedCost
      ? data.current_window?.estimated_cost_eur ?? estimatedCostFromPrice(averageRawValue, data.unit, usageKwh)
      : averageRawValue;
    if (averageValue === null || !Number.isFinite(averageValue)) {
      return [];
    }

    const minimumRawValue =
      data.quality.minimum_value ?? (data.points.length > 0 ? pointValueRange(data.points).min : null);
    const maximumRawValue =
      data.quality.maximum_value ?? (data.points.length > 0 ? pointValueRange(data.points).max : null);
    const minimumValue = showEstimatedCost
      ? estimatedCostFromPrice(minimumRawValue, data.unit, usageKwh)
      : minimumRawValue;
    const maximumValue = showEstimatedCost
      ? estimatedCostFromPrice(maximumRawValue, data.unit, usageKwh)
      : maximumRawValue;
    const historyFractionDigits = showEstimatedCost ? 2 : 1;
    const rangeDetail =
      minimumValue !== null && maximumValue !== null
        ? `${tKey("energy.range")} ${minimumValue.toFixed(historyFractionDigits)}-${maximumValue.toFixed(historyFractionDigits)}`
        : `${data.quality.point_count} ${tKey("energy.points")}`;

    return [
      {
        label: formatHistoryDate(snapshot.date, timeZone),
        value: averageValue,
        detail: data.current_window
          ? `${rangeDetail} · ${data.current_window.point_count} ${tKey("energy.windowPoints")}`
          : rangeDetail
      }
    ];
  });
}

export function orderedEnergyMetrics(metrics: EnergyMetric[], isPricePanel: boolean): PanelMetric[] {
  const priority = isPricePanel
    ? ["estimated_cost", "window_average", "relative_savings", "minimum_value", "maximum_value", "point_count"]
    : ["window_average", "relative_savings", "minimum_value", "maximum_value", "point_count"];

  return [...metrics]
    .sort((left, right) => {
      const leftIndex = priority.indexOf(left.key);
      const rightIndex = priority.indexOf(right.key);
      return (leftIndex === -1 ? priority.length : leftIndex) - (rightIndex === -1 ? priority.length : rightIndex);
    })
    .map((metric) => ({
      ...metric,
      tone: energyMetricTone(metric)
    }));
}
