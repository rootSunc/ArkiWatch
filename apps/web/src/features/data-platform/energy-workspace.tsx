"use client";

import { formatRelativeAge } from "@/features/shared/format";

import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
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

type EnergyWorkspaceProps = {
  category: PlatformCategory | null;
  energy: EnergyCurrentResponse | null;
  history: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
};

type EnergyTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

const PRICE_CHART_WIDTH = 720;
const PRICE_CHART_HEIGHT = 240;
const PRICE_CHART_PADDING = 30;

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

const SUMMARY_KEYS = ["low_energy_window", "active_events", "records_ingested", "source_status", "catalog_stage"];

function formatMetricValue(metric: PanelMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("missing");
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function displayMetricLabel(metric: PanelMetric | null, fallback: string): string {
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

function visibleSummaryMetrics(category: PlatformCategory, energy: EnergyCurrentResponse | null): PanelMetric[] {
  if (energy?.metrics.length) {
    return energy.metrics.map((metric) => ({ ...metric, tone: energyMetricTone(metric) })).slice(0, 5);
  }

  const preferred = SUMMARY_KEYS.map((key) => metricByKey(category, key)).filter(isPlatformMetric);
  const fallback = category.summary_metrics.filter((metric) => !SUMMARY_KEYS.includes(metric.key));

  return [...preferred, ...fallback].slice(0, 5);
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

function sourceStatusLabel(category: PlatformCategory, language: LanguageMode): string {
  const source = category.sources[0];
  return translateEnumLabel(language, source?.operational_status ?? category.status);
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

function formatEnergyPointValue(point: EnergyPoint, fallbackUnit: string | null | undefined): string {
  const unit = energyPointUnit(point, fallbackUnit);
  return `${point.value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function formatEstimatedCost(value: number | null | undefined, t: (value: string) => string): string {
  if (value === null || value === undefined) {
    return t("cost n/a");
  }

  return `EUR ${value.toFixed(2)}`;
}

function chartY(value: number, min: number, max: number): number {
  if (max === min) {
    return PRICE_CHART_HEIGHT / 2;
  }

  const innerHeight = PRICE_CHART_HEIGHT - PRICE_CHART_PADDING * 2;
  return PRICE_CHART_PADDING + (1 - (value - min) / (max - min)) * innerHeight;
}

function chartX(index: number, count: number): number {
  if (count <= 1) {
    return PRICE_CHART_PADDING;
  }

  const innerWidth = PRICE_CHART_WIDTH - PRICE_CHART_PADDING * 2;
  return PRICE_CHART_PADDING + (index / (count - 1)) * innerWidth;
}

function priceLinePath(points: EnergyPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const { min, max } = pointValueRange(points);
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chartX(index, points.length).toFixed(1)},${chartY(point.value, min, max).toFixed(1)}`;
    })
    .join(" ");
}

function priceAreaPath(points: EnergyPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const line = priceLinePath(points);
  const baseline = PRICE_CHART_HEIGHT - PRICE_CHART_PADDING;
  return `${line} L${chartX(points.length - 1, points.length).toFixed(1)},${baseline} L${PRICE_CHART_PADDING},${baseline} Z`;
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
  t: (value: string) => string
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    const averageValue = data.quality.average_value ?? averagePointValue(data.points);
    if (averageValue === null || !Number.isFinite(averageValue)) {
      return [];
    }

    const minimumValue =
      data.quality.minimum_value ?? (data.points.length > 0 ? pointValueRange(data.points).min : null);
    const maximumValue =
      data.quality.maximum_value ?? (data.points.length > 0 ? pointValueRange(data.points).max : null);
    const rangeDetail =
      minimumValue !== null && maximumValue !== null
        ? `${t("range")} ${minimumValue.toFixed(1)}-${maximumValue.toFixed(1)}`
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

export function EnergyWorkspace({ category, energy, history }: EnergyWorkspaceProps) {
  const { language, t } = useI18n();

  if (!category) {
    return (
      <section className="energy-detail-empty" aria-label={t("Energy data unavailable")}>
        <span>{t("Energy")}</span>
        <h2>{t("Energy signals are not available yet")}</h2>
        <p>{t("Fingrid electricity-system metadata has not arrived for the current platform view.")}</p>
      </section>
    );
  }

  const lowWindowMetric = metricByKey(category, "low_energy_window");
  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const source =
    category.sources.find((candidate) => candidate.source_code === energy?.source_code) ??
    category.sources[0] ??
    null;
  const latestEvent = latestEnergyEvent(category);
  const timelineItems = energyTimelineItems(category);
  const sourcePoints = sourceVolumePoints(category);
  const severityRows = severityPoints(category);
  const summaryMetrics = visibleSummaryMetrics(category, energy);
  const window = energy?.current_window ?? null;
  const activeTone = window ? toneFromSeverity(window.severity) : lowWindowMetric ? metricTone(lowWindowMetric) : toneFromStatus(category.status);
  const hasWindowEvidence = window !== null || latestEvent !== null || timelineItems.length > 0;
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
  const keyDataItems = category.key_data_items ?? [];
  const fieldCount = keyDataItems.length;
  const datasetCount = source?.datasets?.length ?? 0;
  const signalMetrics: PanelMetric[] = energy?.metrics.length ? energy.metrics.map((metric) => ({
    ...metric,
    detail: null,
    tone: energyMetricTone(metric)
  })) : [
    lowWindowMetric,
    activeEventsMetric,
    recordsMetric,
    sourceStatusMetric,
    metricByKey(category, "catalog_stage")
  ].filter(isPlatformMetric);
  const heroValue = window
    ? `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
    : lowWindowMetric
    ? formatMetricValue(lowWindowMetric, t)
    : hasActiveWindow
      ? t("Window detected")
      : t("No active window");
  const heroDetail =
    energy?.summary ??
    lowWindowMetric?.detail ??
    latestEvent?.body ??
    t("Fingrid data has not produced a low-value energy window for the current platform view.");
  const points = energy?.points ?? [];
  const chartPoints = points.slice(0, 96);
  const chartRange = chartPoints.length > 0 ? pointValueRange(chartPoints) : null;
  const chartLabels = chartPoints.length > 0
    ? [
        chartPoints[0],
        chartPoints[Math.floor(chartPoints.length / 2)],
        chartPoints[chartPoints.length - 1]
      ]
    : [];
  const historyPoints = energyHistoryPoints(history, t);

  return (
    <section className="energy-detail-page" aria-label={t("Energy detail")}>
      <div className="energy-detail-header">
        <div>
          <h2>{t("Household Energy Price")}</h2>
          <div className="energy-live-status">
            <span aria-hidden="true" />
            <strong>{sourceStatusLabel(category, language)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(", ").toUpperCase()} / {relativeTime(energy?.observed_at ?? lowWindowMetric?.updated_at ?? source?.last_run_finished_at, language, t)}</div>
      </div>

      <section className="energy-bento-grid" aria-label={t("Energy operating condition")}>
        <article className={`energy-glass-panel energy-hero energy-hero-${activeTone}`}>
          <div className="energy-card-kicker">
            <span>{t("Cheapest Flexible Use Window")}</span>
            <time>{relativeTime(energy?.observed_at ?? lowWindowMetric?.updated_at ?? latestEvent?.starts_at, language, t)}</time>
          </div>
          <div className="energy-current-cluster">
            <span className="material-symbols-outlined energy-condition-icon" aria-hidden="true">
              {hasActiveWindow ? "bolt" : "hourglass_empty"}
            </span>
            <div>
              <strong>{heroValue}</strong>
              <p>{heroDetail}</p>
            </div>
          </div>
          <div className="energy-hero-footer">
            <div>
              <span>{t("Starts")}</span>
              <strong>{startLabel}</strong>
            </div>
            <div>
              <span>{t("Ends")}</span>
              <strong>{endLabel}</strong>
            </div>
          </div>
        </article>

        <article className="energy-glass-panel energy-window-panel">
          <header>
            <span>{t("Window State")}</span>
            <strong>{hasActiveWindow ? t("Ready") : t("Pending")}</strong>
          </header>
          <div className="energy-window-stack">
            {(window
              ? [{
                  id: "energy-current-window",
                  label: window.unit?.includes("kWh")
                    ? t("Cheapest household price window")
                    : window.source === "raw_preview"
                      ? t("Preview energy timing window")
                      : t("Detected energy timing window"),
                  detail: energy?.summary ?? t("Flexible electricity use window is ready."),
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
            {!hasWindowEvidence ? <p>{t("No household price window is available from the latest energy payload.")}</p> : null}
          </div>
        </article>

        <article className="energy-glass-panel energy-field-panel">
          <header>
            <span>{t("Tracked Fields")}</span>
            <strong>{fieldCount}</strong>
          </header>
          <div className="energy-field-grid">
            {keyDataItems.map((field) => (
              <article key={field}>
                <span>{field.replaceAll("_", " ")}</span>
                <strong>{field === "low_value_window" && hasActiveWindow ? t("Live") : t("Mapped")}</strong>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="energy-summary-strip" aria-label={t("Energy summary metrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`energy-glass-panel energy-summary-${metricTone(metric)}`} key={metric.key}>
            <span>{t(metric.label)}</span>
            <strong>{formatMetricValue(metric, t)}</strong>
          </article>
        ))}
      </section>

      <TrendChart
        className="energy-glass-panel"
        emptyMessage={t("No daily energy history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={2}
        points={historyPoints}
        title={t("Daily Average Price Trend")}
        tone={activeTone}
        unit={energy?.unit}
      />

      <section className="energy-main-grid" aria-label={t("Energy platform analytics")}>
        <article className="energy-glass-panel energy-signal-panel">
          <header>
            <div>
              <span>{t("Household Price Forecast")}</span>
              <h3>{t("Spot price by time and estimated flexible-use cost")}</h3>
            </div>
            <strong>{signalMetrics.length} {t("metrics")}</strong>
          </header>
          {chartPoints.length > 0 && chartRange ? (
            <div className="energy-price-chart" aria-label={t("Household electricity price forecast")}>
              <div className="energy-price-chart-head">
                <span>{formatEnergyPointValue({ ...chartPoints[0], value: chartRange.min }, energy?.unit)}</span>
                <strong>{formatEnergyPointValue({ ...chartPoints[0], value: chartRange.max }, energy?.unit)}</strong>
              </div>
              <svg
                aria-hidden="true"
                className="energy-price-line"
                focusable="false"
                viewBox={`0 0 ${PRICE_CHART_WIDTH} ${PRICE_CHART_HEIGHT}`}
              >
                <line
                  className="energy-price-grid-line"
                  x1={PRICE_CHART_PADDING}
                  x2={PRICE_CHART_WIDTH - PRICE_CHART_PADDING}
                  y1={chartY(chartRange.max, chartRange.min, chartRange.max)}
                  y2={chartY(chartRange.max, chartRange.min, chartRange.max)}
                />
                <line
                  className="energy-price-grid-line"
                  x1={PRICE_CHART_PADDING}
                  x2={PRICE_CHART_WIDTH - PRICE_CHART_PADDING}
                  y1={chartY(chartRange.min, chartRange.min, chartRange.max)}
                  y2={chartY(chartRange.min, chartRange.min, chartRange.max)}
                />
                <path className="energy-price-area" d={priceAreaPath(chartPoints)} />
                <path className="energy-price-path" d={priceLinePath(chartPoints)} />
                {chartPoints.map((point, index) => {
                  const inWindow = isWindowPoint(point, window?.starts_at, window?.ends_at);
                  return (
                    <circle
                      className={inWindow ? "energy-price-dot energy-price-dot-window" : "energy-price-dot"}
                      cx={chartX(index, chartPoints.length)}
                      cy={chartY(point.value, chartRange.min, chartRange.max)}
                      key={point.starts_at}
                      r={inWindow ? 4.5 : 2.6}
                    />
                  );
                })}
              </svg>
              <div className="energy-price-axis" aria-hidden="true">
                {chartLabels.map((point) => (
                  <span key={point.starts_at}>{formatCompactTime(point.starts_at, language, t)}</span>
                ))}
              </div>
              <div className="energy-price-list">
                {chartPoints.slice(0, 12).map((point) => {
                  const inWindow = isWindowPoint(point, window?.starts_at, window?.ends_at);
                  return (
                    <article className={inWindow ? "energy-price-row energy-price-row-window" : "energy-price-row"} key={point.starts_at}>
                      <span>{formatCompactTime(point.starts_at, language, t)}</span>
                      <strong>{formatEnergyPointValue(point, energy?.unit)}</strong>
                      <em>{formatEstimatedCost(point.estimated_cost_eur, t)}</em>
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
              <span>{t("Price Source")}</span>
              <strong>{sourceStatusLabel(category, language)}</strong>
            </header>
            <div className="energy-source-facts">
              <span>{datasetCount || energy?.source_requests.length || 0} {t("datasets")}</span>
              <span>{pollIntervalLabel(source?.poll_interval_seconds, t)} {t("poll")}</span>
              <span>{energy?.quality.point_count ?? formatMetricValue(recordsMetric, t)} {t("points")}</span>
            </div>
            <p>{source?.source_name ?? "Porssisahko.net"} · {source?.license_label ?? t("license unavailable")}</p>
            {source?.documentation_url ? (
              <a href={source.documentation_url} rel="noreferrer" target="_blank">
                {t("Open data documentation")}
              </a>
            ) : null}
          </article>

          <article className="energy-glass-panel energy-volume-panel">
            <header>
              <span>{t("Collection Volume")}</span>
              <strong>{sourcePoints.length || category.sources.length}</strong>
            </header>
            <div>
              {(sourcePoints.length > 0 ? sourcePoints : category.sources.map((item) => ({
                label: item.source_code,
                value: item.records_ingested ?? 0,
                tone: toneFromStatus(item.operational_status),
                detail: item.operational_status
              }))).map((point) => (
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
              <span>{t("Data Quality")}</span>
              <strong>{energy ? `${energy.quality.field_coverage_pct.toFixed(0)}%` : category.events.length}</strong>
            </header>
            {energy ? (
              <div className="energy-quality-facts">
                <span>{energy.quality.point_count} {t("points")}</span>
                <span>{energy.quality.window_point_count} {t("window points")}</span>
                <span>{energy.quality.missing_fields.length} {t("missing fields")}</span>
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
            {energy?.quality.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </article>
        </div>
      </section>

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
            Porssisahko prices / Fingrid load
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {relativeTime(energy?.observed_at ?? source?.last_run_finished_at ?? lowWindowMetric?.updated_at, language, t)}
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
