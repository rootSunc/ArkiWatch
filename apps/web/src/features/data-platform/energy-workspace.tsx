"use client";

import { useCallback, useEffect, useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  DashboardSource,
  EnergyCurrentResponse,
  EnergyMetric,
  EnergyPoint,
  PlatformCategory,
  PlatformEvent,
  PlatformHistoricalSnapshot,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint,
  PlatformVisualizationTimelineItem
} from "./types";
import { TrendChart, TrendChartPoint } from "./trend-chart";
import { eventAnchorId } from "./recent-events";

type EnergyWorkspaceProps = {
  activePanel?: EnergyPanelKey;
  category: PlatformCategory | null;
  energy: EnergyCurrentResponse | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  householdEnergy: EnergyCurrentResponse | null;
  householdHistory: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  onPanelChange?: (panel: EnergyPanelKey) => void;
};

type EnergyTone = PlatformTone | "good" | "warn" | "bad" | "neutral";
type EnergyPanelKey = "fingrid" | "porssisahko";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

type EnergyDisplayPoint = {
  raw: EnergyPoint;
  display: EnergyPoint;
};

type EnergyPanelProfile = {
  chartKind: "area-line" | "hourly-bars";
  chartKindLabel: string;
  pageClassName: string;
  rangeLabel: string;
  spreadLabel: string;
  unitLabel: string;
  valueColumnLabel: string;
  detailColumnLabel: string;
  noUnitLabel: string;
};

const PRICE_CHART_WIDTH = 720;
const PRICE_CHART_HEIGHT = 240;
const PRICE_CHART_PAD_LEFT = 65;
const PRICE_CHART_PAD_RIGHT = 25;
const PRICE_CHART_PAD_TOP = 25;
const PRICE_CHART_PAD_BOTTOM = 40;
const DEFAULT_HOUSEHOLD_PRICE_PROVIDER = "Fortum";
const ENERGY_PANEL_TABS: Array<{
  key: EnergyPanelKey;
  label: string;
  icon: string;
}> = [
  {
    key: "porssisahko",
    label: "Household Prices",
    icon: "payments",
  },
  {
    key: "fingrid",
    label: "Fingrid System",
    icon: "electrical_services",
  },
];
const ENERGY_PANEL_PROFILES: Record<EnergyPanelKey, EnergyPanelProfile> = {
  fingrid: {
    chartKind: "area-line",
    chartKindLabel: "Continuous system curve",
    pageClassName: "energy-detail-page-system",
    rangeLabel: "System value range",
    spreadLabel: "System spread",
    unitLabel: "Signal unit",
    valueColumnLabel: "Signal value",
    detailColumnLabel: "Ends",
    noUnitLabel: "raw value"
  },
  porssisahko: {
    chartKind: "hourly-bars",
    chartKindLabel: "Hourly cost bars",
    pageClassName: "energy-detail-page-price",
    rangeLabel: "Estimated cost range",
    spreadLabel: "Cost spread",
    unitLabel: "Displayed unit",
    valueColumnLabel: "Estimated cost",
    detailColumnLabel: "Spot price",
    noUnitLabel: "EUR"
  }
};

function formatMetricValue(metric: PanelMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("missing");
  }

  if (metric.unit?.toUpperCase() === "EUR") {
    return formatEstimatedCost(numericValue(metric.value), t);
  }
  if (metric.unit === "%") {
    return `${metric.value}%`;
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function displayMetricLabel(metric: PanelMetric | null, fallback: string): string {
  if (metric?.key === "estimated_cost") {
    return "Estimated cost";
  }
  if (metric?.key === "window_average" && isPriceUnit(metric.unit)) {
    return "Average spot price";
  }
  if (metric?.key === "minimum_value" && isPriceUnit(metric.unit)) {
    return "Cheapest spot price";
  }
  if (metric?.key === "maximum_value" && isPriceUnit(metric.unit)) {
    return "Peak spot price";
  }
  if (metric?.key === "relative_savings") {
    return "Below forecast average";
  }

  return metric?.label ?? fallback;
}

function formatCompactTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  if (!value) {
    return t("not scheduled");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Helsinki"
  })
    .format(new Date(value))
    .toUpperCase();
}

function relativeTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not observed");
}

function toneFromStatus(status: string): EnergyTone {
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

function toneFromSeverity(severity: string): EnergyTone {
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

function metricTone(metric: PanelMetric | null): EnergyTone {
  return metric ? (metric.tone as EnergyTone) : "neutral";
}

function progressFromTone(tone: EnergyTone): number {
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

function numericValue(value: string | null | undefined): number | null {
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

function metricProgress(metric: PanelMetric | null): number {
  if (!metric) {
    return 24;
  }

  const value = numericValue(metric.value);
  if (value === null) {
    return progressFromTone(metricTone(metric));
  }

  return Math.max(8, Math.min(100, value));
}

function energyMetricTone(metric: EnergyMetric): EnergyTone {
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

function latestEnergyEvent(category: PlatformCategory): PlatformEvent | null {
  return (
    [...category.events]
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
      .find((event) => event.category_key === "energy") ?? null
  );
}

function energyTimelineItems(category: PlatformCategory): PlatformVisualizationTimelineItem[] {
  const timeline = category.visualizations.find((item) => item.id === "energy-window-timeline");
  return timeline?.data.items ?? [];
}

function sourceVolumePoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const sourceVolume = category.visualizations.find((item) => item.id === "energy-source-volume");
  return sourceVolume?.data.points ?? [];
}

function severityPoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const severity = category.visualizations.find((item) => item.id === "energy-severity-distribution");
  return severity?.data.points ?? [];
}

function sourceByCode(category: PlatformCategory, sourceCode: EnergyPanelKey): DashboardSource | null {
  return category.sources.find((candidate) => candidate.source_code === sourceCode) ?? null;
}

function sourceStatusLabel(
  source: DashboardSource | null,
  fallbackStatus: string,
  language: LanguageMode
): string {
  return translateEnumLabel(language, source?.operational_status ?? fallbackStatus);
}

function sourceStatusMetric(source: DashboardSource | null, fallbackStatus: string): PanelMetric {
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

function sourceRecordsMetric(source: DashboardSource | null): PanelMetric {
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

function pollIntervalLabel(seconds: number | null | undefined, t: (value: string) => string): string {
  if (!seconds) {
    return t("cadence missing");
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }

  return `${Math.round(seconds / 3600)} h`;
}

function sourceProgress(point: PlatformVisualizationPoint): number {
  const max = Math.max(1, point.value);
  return Math.max(8, Math.min(100, (point.value / max) * 100));
}

function pointValueRange(points: EnergyPoint[]): { min: number; max: number } {
  const values = points.map((point) => point.value);
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function energyPointUnit(point: EnergyPoint | null, fallback: string | null | undefined): string | null {
  return point?.unit ?? fallback ?? null;
}

function formatValueWithUnit(value: number, unit: string | null | undefined): string {
  if (unit?.toUpperCase() === "EUR") {
    return formatEstimatedCost(value, (label) => label);
  }

  return `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function formatEnergyPointValue(point: EnergyPoint, fallbackUnit: string | null | undefined): string {
  const unit = energyPointUnit(point, fallbackUnit);
  return formatValueWithUnit(point.value, unit);
}

function formatEstimatedCost(value: number | null | undefined, t: (value: string) => string): string {
  if (value === null || value === undefined) {
    return t("cost n/a");
  }

  return `EUR ${value.toFixed(2)}`;
}

function isPriceUnit(unit: string | null | undefined): boolean {
  return unit !== null && unit !== undefined && unit.toLowerCase().includes("kwh");
}

function estimatedCostFromPrice(
  priceValue: number | null | undefined,
  unit: string | null | undefined,
  usageKwh: number | null | undefined
): number | null {
  if (priceValue === null || priceValue === undefined || usageKwh === null || usageKwh === undefined || !isPriceUnit(unit)) {
    return null;
  }

  return (priceValue * usageKwh) / 100;
}

function priceDisplayPoint(
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

function chartDisplayPoints(
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

function formatEnergyRange(
  range: { min: number; max: number },
  unit: string | null | undefined,
  t: (value: string) => string
): string {
  return `${formatValueWithUnit(range.min, unit)} ${t("to")} ${formatValueWithUnit(range.max, unit)}`;
}

function formatEnergySpread(range: { min: number; max: number }, unit: string | null | undefined): string {
  return formatValueWithUnit(range.max - range.min, unit);
}

function chartScale(points: EnergyPoint[], includeZero: boolean): { min: number; max: number } {
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

function chartY(value: number, min: number, max: number): number {
  if (max === min) {
    return PRICE_CHART_HEIGHT / 2;
  }

  const innerHeight = PRICE_CHART_HEIGHT - PRICE_CHART_PAD_TOP - PRICE_CHART_PAD_BOTTOM;
  return PRICE_CHART_PAD_TOP + (1 - (value - min) / (max - min)) * innerHeight;
}

function chartX(index: number, count: number): number {
  if (count <= 1) {
    return PRICE_CHART_PAD_LEFT;
  }

  const innerWidth = PRICE_CHART_WIDTH - PRICE_CHART_PAD_LEFT - PRICE_CHART_PAD_RIGHT;
  return PRICE_CHART_PAD_LEFT + (index / (count - 1)) * innerWidth;
}

function priceLinePath(points: EnergyPoint[], scale: { min: number; max: number }): string {
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

function priceAreaPath(points: EnergyPoint[], scale: { min: number; max: number }): string {
  if (points.length === 0) {
    return "";
  }

  const line = priceLinePath(points, scale);
  const baseline = PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM;
  return `${line} L${chartX(points.length - 1, points.length).toFixed(1)},${baseline} L${PRICE_CHART_PAD_LEFT},${baseline} Z`;
}

function isWindowPoint(point: EnergyPoint, startsAt: string | null | undefined, endsAt: string | null | undefined): boolean {
  if (!startsAt || !endsAt) {
    return false;
  }

  const pointStart = new Date(point.starts_at).getTime();
  const pointEnd = new Date(point.ends_at).getTime();
  return pointEnd > new Date(startsAt).getTime() && pointStart < new Date(endsAt).getTime();
}

function isNoActiveWindowLabel(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.startsWith("no active") || normalizedValue.includes("not available yet");
}

function formatHistoryDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Helsinki"
  })
    .format(parsed)
    .toUpperCase();
}

function averagePointValue(points: EnergyPoint[]): number | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function energyHistoryPoints(
  history: PlatformHistoricalSnapshot<EnergyCurrentResponse>[],
  t: (value: string) => string,
  showEstimatedCost: boolean
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
        ? `${t("range")} ${minimumValue.toFixed(historyFractionDigits)}-${maximumValue.toFixed(historyFractionDigits)}`
        : `${data.quality.point_count} ${t("points")}`;

    return [
      {
        label: formatHistoryDate(snapshot.date),
        value: averageValue,
        detail: data.current_window
          ? `${rangeDetail} · ${data.current_window.point_count} ${t("window points")}`
          : rangeDetail
      }
    ];
  });
}

function orderedEnergyMetrics(metrics: EnergyMetric[], isPricePanel: boolean): PanelMetric[] {
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

export function EnergyWorkspace({
  activePanel: controlledPanel,
  category,
  energy,
  highlightedEventId,
  history,
  householdEnergy,
  householdHistory,
  onPanelChange,
}: EnergyWorkspaceProps) {
  const { language, t } = useI18n();
  const [internalPanel, setInternalPanel] = useState<EnergyPanelKey>("porssisahko");
  const activePanel = controlledPanel ?? internalPanel;

  const setActivePanel = useCallback((nextPanel: EnergyPanelKey): void => {
    onPanelChange?.(nextPanel);
    if (controlledPanel === undefined) {
      setInternalPanel(nextPanel);
    }
  }, [controlledPanel, onPanelChange]);
  const [hoveredPoint, setHoveredPoint] = useState<{
    point: EnergyPoint;
    index: number;
    x: number;
    y: number;
    raw?: EnergyPoint;
  } | null>(null);

  useEffect(() => {
    if (highlightedEventId && category?.events.some((event) => event.id === highlightedEventId)) {
      setActivePanel("fingrid");
    }
  }, [category, highlightedEventId, setActivePanel]);

  if (!category) {
    return (
      <section className="energy-detail-empty" aria-label={t("Energy data unavailable")}>
        <span>{t("Energy")}</span>
        <h2>{t("Energy signals are not available yet")}</h2>
        <p>{t("Fingrid electricity-system metadata has not arrived for the current platform view.")}</p>
      </section>
    );
  }

  const isPricePanel = activePanel === "porssisahko";
  const activeProfile = ENERGY_PANEL_PROFILES[activePanel];
  const activeEnergy = isPricePanel ? householdEnergy : energy;
  const activeHistory = isPricePanel ? householdHistory : history;
  const activeSource = sourceByCode(category, activePanel);
  const priceProviderName = householdEnergy?.provider_name ?? DEFAULT_HOUSEHOLD_PRICE_PROVIDER;
  const activeStatus = activeSource?.operational_status ?? activeEnergy?.status ?? category.status;
  const lowWindowMetric = isPricePanel ? null : metricByKey(category, "low_energy_window");
  const recordsMetric = sourceRecordsMetric(activeSource);
  const sourceStateMetric = sourceStatusMetric(activeSource, activeStatus);
  const latestEvent = isPricePanel ? null : latestEnergyEvent(category);
  const highlightedCategoryEvent =
    (highlightedEventId
      ? category.events.find((event) => event.id === highlightedEventId)
      : null) ??
    latestEvent ??
    null;
  const timelineItems = isPricePanel ? [] : energyTimelineItems(category);
  const sourcePoints = sourceVolumePoints(category);
  const activeSourcePoints = sourcePoints.filter((point) => point.label === activePanel);
  const severityRows = severityPoints(category);
  const window = activeEnergy?.current_window ?? null;
  const activeTone = window ? toneFromSeverity(window.severity) : lowWindowMetric ? metricTone(lowWindowMetric) : toneFromStatus(activeStatus);
  const hasWindowEvidence =
    window !== null || latestEvent !== null || timelineItems.length > 0;
  const hasActiveWindow =
    window !== null ||
    lowWindowMetric !== null ||
    timelineItems.some((item) => !isNoActiveWindowLabel(item.label)) ||
    (latestEvent !== null && !isNoActiveWindowLabel(latestEvent.title));
  const startLabel = window
    ? formatCompactTime(window.starts_at, language, t)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.starts_at, language, t)
      : t("window pending");
  const endLabel = window
    ? formatCompactTime(window.ends_at, language, t)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.ends_at, language, t)
      : t("waiting for event");
  const householdWindowUsage = isPricePanel && window?.usage_kwh != null ? window.usage_kwh : null;
  const householdUsageMetric = householdWindowUsage !== null
    ? {
      key: "window_usage",
      label: "Window usage",
      value: `${householdWindowUsage.toFixed(2)}`,
      unit: "kWh",
      tone: "neutral",
      detail: null,
      updated_at: window?.starts_at ?? null
    }
    : null;
  const windowAveragePoint = window
    ? {
      starts_at: window.starts_at,
      ends_at: window.ends_at,
      value: window.average_value,
      unit: window.unit,
      estimated_cost_eur: window.estimated_cost_eur
    }
    : null;
  const windowAverageLabel = windowAveragePoint ? formatEnergyPointValue(windowAveragePoint, activeEnergy?.unit) : t("n/a");
  const signalMetrics: PanelMetric[] = activeEnergy?.metrics.length ? activeEnergy.metrics.map((metric) => ({
    ...metric,
    detail: null,
    tone: energyMetricTone(metric)
  })) : [lowWindowMetric, recordsMetric, sourceStateMetric].filter((metric): metric is PanelMetric => metric !== null);
  const heroValue = window
    ? isPricePanel
      ? formatEstimatedCost(window.estimated_cost_eur, t)
      : `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
    : lowWindowMetric
    ? formatMetricValue(lowWindowMetric, t)
    : hasActiveWindow
      ? t("Window detected")
      : t("No active window");
  const heroDetail =
    (isPricePanel && window
      ? activeEnergy?.summary ?? `${t("Average spot price")}: ${windowAverageLabel}.`
      : activeEnergy?.summary) ??
    lowWindowMetric?.detail ??
    latestEvent?.body ??
    (isPricePanel
      ? `${priceProviderName} ${t("price data has not produced a household price window for the current platform view.")}`
      : t("Fingrid data has not produced a low-value energy window for the current platform view."));
  const points = activeEnergy?.points ?? [];
  const sourceChartPoints = points.slice(0, 96);
  const chartPointPairs = chartDisplayPoints(sourceChartPoints, isPricePanel, activeEnergy?.unit, householdWindowUsage);
  const chartPoints = chartPointPairs.map((point) => point.display);
  const chartUnit = isPricePanel ? "EUR" : activeEnergy?.unit;
  const chartRange = chartPoints.length > 0 ? pointValueRange(chartPoints) : null;
  const chartVisualScale = chartPoints.length > 0 ? chartScale(chartPoints, isPricePanel) : null;
  const xTicks = chartPoints.length > 0 ? (() => {
    const tickCount = 6;
    const step = Math.max(1, Math.floor(chartPoints.length / (tickCount - 1)));
    const ticks: number[] = [];
    for (let i = 0; i < chartPoints.length; i += step) {
      ticks.push(i);
    }
    if (ticks[ticks.length - 1] !== chartPoints.length - 1) {
      ticks.push(chartPoints.length - 1);
    }
    return ticks;
  })() : [];

  const historyPoints = energyHistoryPoints(activeHistory, t, isPricePanel);
  const activeSourceLabel = sourceStatusLabel(activeSource, activeStatus, language);
  const activeTitle = isPricePanel ? `${priceProviderName} ${t("Household Energy Price")}` : t("Fingrid Energy Signals");
  const activeDataFeedName = activeSource?.source_name ?? (isPricePanel ? "Porssisahko.net" : "Fingrid");
  const activeSourceName = isPricePanel ? priceProviderName : activeDataFeedName;
  const sourceDisclosureName = isPricePanel ? activeDataFeedName : activeSourceName;
  const activeUnitLabel = isPricePanel ? "EUR" : activeEnergy?.unit ?? t(activeProfile.noUnitLabel);
  const datasetCount = activeSource?.datasets?.length ?? 0;
  const baseSummaryMetrics: PanelMetric[] = activeEnergy?.metrics.length
    ? orderedEnergyMetrics(activeEnergy.metrics, isPricePanel).slice(0, 5)
    : [lowWindowMetric, recordsMetric, sourceStateMetric, householdUsageMetric].filter((metric): metric is PanelMetric => metric !== null);
  const displaySummaryMetrics = householdUsageMetric
    ? [...baseSummaryMetrics, householdUsageMetric]
    : baseSummaryMetrics;
  const activeVolumePoints = activeSourcePoints.length > 0 ? activeSourcePoints : [{
    label: activePanel,
    value: activeSource?.records_ingested ?? 0,
    tone: toneFromStatus(activeStatus),
    detail: activeStatus
  }];

  return (
    <section className={`energy-detail-page ${activeProfile.pageClassName}`} aria-label={t("Energy detail")}>
      <nav className="energy-tab-list" aria-label={t("Energy workspace tabs")} role="tablist">
        {ENERGY_PANEL_TABS.map((tab) => {
          const tabLabel =
            tab.key === "porssisahko" ? `${priceProviderName} ${t("Prices")}` : t(tab.label);

          return (
            <button
              aria-label={tabLabel}
              aria-selected={activePanel === tab.key}
              className={activePanel === tab.key ? "energy-tab energy-tab-active" : "energy-tab"}
              key={tab.key}
              onClick={() => setActivePanel(tab.key)}
              role="tab"
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {tab.icon}
              </span>
              <span>{tabLabel}</span>
            </button>
          );
        })}
      </nav>

      <div className="energy-detail-header">
        <div>
          <h2>{activeTitle}</h2>
          <div className="energy-live-status">
            <span aria-hidden="true" />
            <strong>{activeSourceLabel}</strong>
          </div>
        </div>
        <div>{activeSourceName} / {relativeTime(activeEnergy?.observed_at ?? lowWindowMetric?.updated_at ?? activeSource?.last_run_finished_at, language, t)}</div>
      </div>

      <section
        className={`energy-glass-panel energy-command-panel energy-command-panel-${activeTone}`}
        id={
          highlightedCategoryEvent
            ? eventAnchorId(highlightedCategoryEvent.id)
            : undefined
        }
        aria-label={t("Energy operating condition")}
      >
        <div className="energy-command-status">
          <span className="material-symbols-outlined energy-condition-icon" aria-hidden="true">
            {hasActiveWindow ? "bolt" : "hourglass_empty"}
          </span>
          <div>
            <div className="energy-card-kicker">
              <span>{isPricePanel ? t("Flexible Use Start Window") : t("Low-value System Window")}</span>
              <time>{relativeTime(activeEnergy?.observed_at ?? lowWindowMetric?.updated_at ?? latestEvent?.starts_at, language, t)}</time>
            </div>
            <strong>{heroValue}</strong>
            <p>{heroDetail}</p>
          </div>
        </div>

        <div className="energy-command-facts">
          <div>
            <span>{t("Can start from")}</span>
            <strong>{startLabel}</strong>
          </div>
          <div>
            <span>{t("Ends")}</span>
            <strong>{endLabel}</strong>
          </div>
          <div>
            <span>{isPricePanel ? t("Average spot price") : t("Window State")}</span>
            <strong>{isPricePanel ? windowAverageLabel : hasActiveWindow ? t("Ready") : t("Pending")}</strong>
          </div>
          <div>
            <span>{isPricePanel ? t("Window usage") : t("System Source")}</span>
            <strong>{isPricePanel
              ? householdWindowUsage === null
                ? t("n/a")
                : `${householdWindowUsage.toFixed(2)} kWh`
              : sourceDisclosureName}
            </strong>
          </div>
        </div>
      </section>

      <section className="energy-summary-strip" aria-label={t("Energy summary metrics")}>
        {displaySummaryMetrics.map((metric) => (
          <article className={`energy-glass-panel energy-summary-${metricTone(metric)}`} key={metric.key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: metric.key,
                label: displayMetricLabel(metric, "Metric unavailable"),
                detail: "detail" in metric ? metric.detail : null,
                t,
              })}
            >
              {t(displayMetricLabel(metric, "Metric unavailable"))}
            </DataLabelWithHelp>
            <strong>{formatMetricValue(metric, t)}</strong>
          </article>
        ))}
      </section>

      <section className="energy-main-grid" aria-label={t("Energy platform analytics")}>
        <article className="energy-glass-panel energy-signal-panel">
          <header>
            <div>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: isPricePanel ? "best_price" : "best_window",
                  label: isPricePanel ? "Household Price Forecast" : "Fingrid System Timeseries",
                  t,
                })}
              >
                {isPricePanel ? t("Household Price Forecast") : t("Fingrid System Timeseries")}
              </DataLabelWithHelp>
              <h3>{isPricePanel
                ? t("Spot price by time and estimated flexible-use cost")
                : t("Configured Fingrid dataset by time and selected low-value window")}</h3>
            </div>
            <strong>{signalMetrics.length} {t("metrics")}</strong>
          </header>
          {chartPoints.length > 0 && chartRange && chartVisualScale ? (
            <div className="energy-price-chart" aria-label={isPricePanel ? t("Household electricity price forecast") : t("Fingrid electricity-system timeseries")}>
              <div className="energy-chart-context" aria-label={t("Energy chart context")}>
                <article>
                  <span>{t(activeProfile.rangeLabel)}</span>
                  <strong>{formatEnergyRange(chartRange, chartUnit, t)}</strong>
                </article>
                <article>
                  <span>{t(activeProfile.spreadLabel)}</span>
                  <strong>{formatEnergySpread(chartRange, chartUnit)}</strong>
                </article>
                <article>
                  <span>{t(activeProfile.unitLabel)}</span>
                  <strong>{activeUnitLabel}</strong>
                </article>
                <article>
                  <span>{t("Chart form")}</span>
                  <strong>{t(activeProfile.chartKindLabel)}</strong>
                </article>
              </div>
              <div className="energy-price-chart-head">
                <span>{t("Min")} {formatEnergyPointValue({ ...chartPoints[0], value: chartRange.min }, chartUnit)}</span>
                <strong>{t("Max")} {formatEnergyPointValue({ ...chartPoints[0], value: chartRange.max }, chartUnit)}</strong>
              </div>
              <svg
                aria-hidden="false"
                className="energy-price-line"
                focusable="false"
                viewBox={`0 0 ${PRICE_CHART_WIDTH} ${PRICE_CHART_HEIGHT}`}
              >
                {/* Y-axis Grid Lines & Text Labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const val = chartVisualScale.min + (chartVisualScale.max - chartVisualScale.min) * ratio;
                  const yVal = chartY(val, chartVisualScale.min, chartVisualScale.max);
                  return (
                    <g key={`y-axis-${ratio}`}>
                      <line
                        className="energy-price-grid-line"
                        x1={PRICE_CHART_PAD_LEFT}
                        x2={PRICE_CHART_WIDTH - PRICE_CHART_PAD_RIGHT}
                        y1={yVal}
                        y2={yVal}
                      />
                      <text
                        className="energy-price-axis-text"
                        fill="var(--on-surface-variant)"
                        fontFamily="var(--font-jetbrains-mono), monospace"
                        fontSize="9px"
                        textAnchor="end"
                        x={PRICE_CHART_PAD_LEFT - 8}
                        y={yVal + 3}
                      >
                        {formatEnergyPointValue({ ...chartPoints[0], value: val }, chartUnit)}
                      </text>
                    </g>
                  );
                })}

                {/* Zero Level Line */}
                {chartVisualScale.min < 0 && chartVisualScale.max > 0 ? (
                  <line
                    className="energy-price-zero-line"
                    x1={PRICE_CHART_PAD_LEFT}
                    x2={PRICE_CHART_WIDTH - PRICE_CHART_PAD_RIGHT}
                    y1={chartY(0, chartVisualScale.min, chartVisualScale.max)}
                    y2={chartY(0, chartVisualScale.min, chartVisualScale.max)}
                  />
                ) : null}

                {/* X-axis Grid Ticks & Time Labels */}
                {xTicks.map((index) => {
                  const point = chartPoints[index];
                  const xVal = chartX(index, chartPoints.length);
                  const yBaseline = PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM;

                  const date = new Date(point.starts_at);
                  const timeStr = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Europe/Helsinki"
                  }).format(date);

                  return (
                    <g key={`x-axis-${point.starts_at}`}>
                      <line
                        className="energy-price-grid-line"
                        strokeOpacity={0.25}
                        x1={xVal}
                        x2={xVal}
                        y1={PRICE_CHART_PAD_TOP}
                        y2={yBaseline}
                      />
                      <line
                        className="energy-price-axis-tick"
                        stroke="var(--outline-variant)"
                        strokeWidth={1}
                        x1={xVal}
                        x2={xVal}
                        y1={yBaseline}
                        y2={yBaseline + 5}
                      />
                      <text
                        className="energy-price-axis-text"
                        fill="var(--on-surface-variant)"
                        fontFamily="var(--font-jetbrains-mono), monospace"
                        fontSize="9px"
                        textAnchor="middle"
                        x={xVal}
                        y={yBaseline + 18}
                      >
                        {timeStr}
                      </text>
                    </g>
                  );
                })}

                {/* Solid Axis Lines */}
                <line
                  className="energy-price-axis-line"
                  stroke="var(--outline-variant)"
                  strokeWidth={1}
                  x1={PRICE_CHART_PAD_LEFT}
                  x2={PRICE_CHART_WIDTH - PRICE_CHART_PAD_RIGHT}
                  y1={PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM}
                  y2={PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM}
                />
                <line
                  className="energy-price-axis-line"
                  stroke="var(--outline-variant)"
                  strokeWidth={1}
                  x1={PRICE_CHART_PAD_LEFT}
                  x2={PRICE_CHART_PAD_LEFT}
                  y1={PRICE_CHART_PAD_TOP}
                  y2={PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM}
                />

                {/* Hover Line Indicator */}
                {hoveredPoint ? (
                  <line
                    className="energy-price-hover-line"
                    pointerEvents="none"
                    x1={hoveredPoint.x}
                    x2={hoveredPoint.x}
                    y1={PRICE_CHART_PAD_TOP}
                    y2={PRICE_CHART_HEIGHT - PRICE_CHART_PAD_BOTTOM}
                  />
                ) : null}

                {/* Main Data Render */}
                {activeProfile.chartKind === "hourly-bars" ? (
                  chartPoints.map((point, index) => {
                    const inWindow = isWindowPoint(point, window?.starts_at, window?.ends_at);
                    const innerWidth = PRICE_CHART_WIDTH - PRICE_CHART_PAD_LEFT - PRICE_CHART_PAD_RIGHT;
                    const slotWidth = innerWidth / Math.max(chartPoints.length, 1);
                    const barWidth = Math.max(3, slotWidth * 0.62);
                    const baseline = chartY(0, chartVisualScale.min, chartVisualScale.max);
                    const pointY = chartY(point.value, chartVisualScale.min, chartVisualScale.max);
                    const y = Math.min(pointY, baseline);
                    const height = Math.max(2, Math.abs(baseline - pointY));
                    const isHovered = hoveredPoint?.index === index;

                    return (
                      <rect
                        className={[
                          "energy-price-bar",
                          point.value < 0 ? "energy-price-bar-negative" : "",
                          inWindow ? "energy-price-bar-window" : "",
                          isHovered ? "energy-price-bar-hovered" : ""
                        ].filter(Boolean).join(" ")}
                        height={height}
                        key={point.starts_at}
                        rx="1.5"
                        width={barWidth}
                        x={chartX(index, chartPoints.length) - barWidth / 2}
                        y={y}
                      />
                    );
                  })
                ) : (
                  <>
                    <path className="energy-price-area" d={priceAreaPath(chartPoints, chartVisualScale)} />
                    <path className="energy-price-path" d={priceLinePath(chartPoints, chartVisualScale)} />
                    {chartPoints.map((point, index) => {
                      const inWindow = isWindowPoint(point, window?.starts_at, window?.ends_at);
                      const isHovered = hoveredPoint?.index === index;
                      return (
                        <circle
                          className={[
                            inWindow ? "energy-price-dot energy-price-dot-window" : "energy-price-dot",
                            isHovered ? "energy-price-dot-hovered" : ""
                          ].filter(Boolean).join(" ")}
                          cx={chartX(index, chartPoints.length)}
                          cy={chartY(point.value, chartVisualScale.min, chartVisualScale.max)}
                          key={point.starts_at}
                          r={isHovered ? 6 : (inWindow ? 4.5 : 2.6)}
                        />
                      );
                    })}
                  </>
                )}

                {chartPoints.map((point, index) => {
                  const innerWidth = PRICE_CHART_WIDTH - PRICE_CHART_PAD_LEFT - PRICE_CHART_PAD_RIGHT;
                  const slotWidth = innerWidth / Math.max(chartPoints.length, 1);
                  const pair = chartPointPairs[index];
                  const baseline = chartY(0, chartVisualScale.min, chartVisualScale.max);
                  const pointY = chartY(point.value, chartVisualScale.min, chartVisualScale.max);
                  const y = Math.min(pointY, baseline);

                  return (
                    <rect
                      key={`hit-${point.starts_at}`}
                      x={chartX(index, chartPoints.length) - slotWidth / 2}
                      y={PRICE_CHART_PAD_TOP}
                      width={slotWidth}
                      height={PRICE_CHART_HEIGHT - PRICE_CHART_PAD_TOP - PRICE_CHART_PAD_BOTTOM}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => {
                        setHoveredPoint({
                          point,
                          index,
                          x: chartX(index, chartPoints.length),
                          y: activeProfile.chartKind === "hourly-bars" ? y : pointY,
                          raw: pair?.raw
                        });
                      }}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  );
                })}
              </svg>

              {hoveredPoint && (
                <div
                  className="energy-price-tooltip"
                  style={{
                    position: "absolute",
                    left: `${(hoveredPoint.x / PRICE_CHART_WIDTH) * 100}%`,
                    top: `${(hoveredPoint.y / PRICE_CHART_HEIGHT) * 100}%`,
                    transform: "translate(-50%, -100%) translateY(-12px)",
                    pointerEvents: "none",
                    zIndex: 10,
                  }}
                >
                  <div className="energy-tooltip-content">
                    <div className="energy-tooltip-time">
                      {formatCompactTime(hoveredPoint.point.starts_at, language, t)}
                    </div>
                    <div className="energy-tooltip-value">
                      <strong>{formatEnergyPointValue(hoveredPoint.point, chartUnit)}</strong>
                    </div>
                    {hoveredPoint.raw && hoveredPoint.raw !== hoveredPoint.point && (
                      <div className="energy-tooltip-detail">
                        <span>{t("Spot price")}:</span>
                        <strong>{formatEnergyPointValue(hoveredPoint.raw, activeEnergy?.unit)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="energy-price-list">
                <article className="energy-price-row energy-price-row-heading" aria-hidden="true">
                  <span>{t("Starts")}</span>
                  <strong>{t(activeProfile.valueColumnLabel)}</strong>
                  <em>{t(activeProfile.detailColumnLabel)}</em>
                </article>
                {chartPointPairs.slice(0, 12).map(({ raw, display }) => {
                  const inWindow = isWindowPoint(display, window?.starts_at, window?.ends_at);
                  return (
                    <article className={inWindow ? "energy-price-row energy-price-row-window" : "energy-price-row"} key={display.starts_at}>
                      <span>{formatCompactTime(display.starts_at, language, t)}</span>
                      <strong>{formatEnergyPointValue(display, chartUnit)}</strong>
                      <em>{isPricePanel ? formatEnergyPointValue(raw, activeEnergy?.unit) : formatCompactTime(display.ends_at, language, t)}</em>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="energy-signal-list">
            {signalMetrics.map((metric) => (
              <article className={`energy-signal energy-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{t(displayMetricLabel(metric, "Metric unavailable"))}</strong>
                  <span>{formatMetricValue(metric, t)}</span>
                </div>
                <p>{metric.detail ?? t("This signal has not produced a platform metric yet.")}</p>
                <span className="energy-signal-meter" aria-hidden="true">
                  <span style={{ width: `${metricProgress(metric)}%` }} />
                </span>
              </article>
            ))}
          </div>
        </article>

        <div className="energy-side-grid">
          <article className="energy-glass-panel energy-source-panel">
            <header>
              <span>{isPricePanel ? t("Price Source") : t("System Source")}</span>
              <strong>{activeSourceLabel}</strong>
            </header>
            <div className="energy-source-facts">
              <article className="energy-stat-chip">
                <strong>{datasetCount || activeEnergy?.source_requests.length || 0}</strong>
                <span>{t("datasets")}</span>
              </article>
              <article className="energy-stat-chip">
                <strong>{pollIntervalLabel(activeSource?.poll_interval_seconds, t)}</strong>
                <span>{t("poll")}</span>
              </article>
              <article className="energy-stat-chip">
                <strong>{activeEnergy?.quality.point_count ?? formatMetricValue(recordsMetric, t)}</strong>
                <span>{t("points")}</span>
              </article>
            </div>
            <p>{activeSourceName} · {activeSource?.license_label ?? t("license unavailable")}</p>
            {activeSource?.error_message ? <p>{activeSource.error_message}</p> : null}
            {activeSource?.documentation_url ? (
              <a href={activeSource.documentation_url} rel="noreferrer" target="_blank">
                {t("Open data documentation")}
              </a>
            ) : null}
          </article>

          <article className="energy-glass-panel energy-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Collection Volume",
                  t,
                })}
              >
                {t("Collection Volume")}
              </DataLabelWithHelp>
              <strong>{activeVolumePoints.length}</strong>
            </header>
            <div>
              {activeVolumePoints.map((point) => (
                <article className={`energy-volume-row energy-volume-row-${point.tone ?? "neutral"}`} key={point.label}>
                  <div>
                    <strong>{point.label}</strong>
                    <span>{point.detail ? translateEnumLabel(language, point.detail) : t("records")}</span>
                  </div>
                  <em>{point.value}</em>
                  <span className="energy-volume-meter" aria-hidden="true">
                    <span style={{ width: `${sourceProgress(point)}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </article>

          <article className="energy-glass-panel energy-severity-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "data_quality",
                  label: "Data Quality",
                  t,
                })}
              >
                {t("Data Quality")}
              </DataLabelWithHelp>
              <strong>{activeEnergy ? `${activeEnergy.quality.field_coverage_pct.toFixed(0)}%` : severityRows.length}</strong>
            </header>
            {activeEnergy ? (
              <div className="energy-quality-facts">
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.point_count}</strong>
                  <span>{t("points")}</span>
                </article>
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.window_point_count}</strong>
                  <span>{t("window points")}</span>
                </article>
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.missing_fields.length}</strong>
                  <span>{t("missing fields")}</span>
                </article>
              </div>
            ) : (
              <div>
                {severityRows.map((row) => (
                <article className={`energy-severity-row energy-severity-row-${row.tone ?? "neutral"}`} key={row.label}>
                  <span>{row.label}</span>
                  <i aria-hidden="true">
                    <span style={{ width: `${Math.max(8, Math.min(100, row.value * 25))}%` }} />
                  </i>
                  <strong>{row.value}</strong>
                </article>
                ))}
              </div>
            )}
            {activeEnergy?.quality.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </article>
        </div>
      </section>

      <section className="energy-insight-grid" aria-label={t("Energy operating condition")}>
        <article className="energy-glass-panel energy-window-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "window_state",
                label: "Window State",
                t,
              })}
            >
              {t("Window State")}
            </DataLabelWithHelp>
            <strong>{hasActiveWindow ? t("Ready") : t("Pending")}</strong>
          </header>
          <div className="energy-window-stack">
            {(window
              ? [{
                  id: "energy-current-window",
                  label: window.unit?.includes("kWh")
                    ? t("Household flexible-use start window")
                    : window.source === "raw_preview"
                      ? t("Preview energy timing window")
                      : t("Detected energy timing window"),
                  detail: activeEnergy?.summary ?? t("Flexible electricity use window is ready."),
                  severity: window.severity,
                  starts_at: window.starts_at,
                  ends_at: window.ends_at
                }]
              : timelineItems.length > 0
                ? timelineItems
                : latestEvent
                  ? [latestEvent]
                  : []).map((item) => {
              const tone = toneFromSeverity(item.severity);
              return (
                <article className={`energy-window-row energy-window-row-${tone}`} key={item.id}>
                  <div>
                    <strong>{"label" in item ? item.label : item.title}</strong>
                    <span>{formatCompactTime(item.starts_at, language, t)} - {formatCompactTime(item.ends_at, language, t)}</span>
                  </div>
                  <p>{"detail" in item ? item.detail : item.body}</p>
                </article>
              );
            })}
            {!hasWindowEvidence ? (
              <p>{isPricePanel
                ? t("No household price window is available from the latest energy payload.")
                : t("No Fingrid energy window is available from the latest energy payload.")}</p>
            ) : null}
          </div>
        </article>
      </section>

      <TrendChart
        className="energy-glass-panel"
        emptyMessage={t("No daily energy history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={2}
        points={historyPoints}
        title={isPricePanel ? t("Daily Estimated Cost Trend") : t("Daily Average Energy Trend")}
        tone={activeTone}
        unit={isPricePanel ? "EUR" : activeEnergy?.unit}
      />

      <section className="energy-provider-status" aria-label={t("Energy provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {isPricePanel ? t("Price Source") : t("System Source")}: {sourceDisclosureName}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {relativeTime(activeEnergy?.observed_at ?? activeSource?.last_run_finished_at ?? lowWindowMetric?.updated_at, language, t)}
          </span>
          <i aria-hidden="true" />
          <span className="energy-provider-window">{hasActiveWindow ? t("Window detected") : t("Window pending")}</span>
        </div>
      </section>

      <p className="energy-detail-freshness">
        {category.description}
      </p>
    </section>
  );
}
