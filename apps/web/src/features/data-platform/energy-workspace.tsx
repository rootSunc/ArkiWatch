import { formatRelativeAge } from "@/features/shared/format";

import {
  EnergyCurrentResponse,
  EnergyMetric,
  EnergyPoint,
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint,
  PlatformVisualizationTimelineItem
} from "./types";

type EnergyWorkspaceProps = {
  category: PlatformCategory | null;
  energy: EnergyCurrentResponse | null;
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

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

const SUMMARY_KEYS = ["low_energy_window", "active_events", "records_ingested", "source_status", "catalog_stage"];

function formatMetricValue(metric: PanelMetric | null): string {
  if (!metric) {
    return "missing";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function displayMetricLabel(metric: PanelMetric | null, fallback: string): string {
  return metric?.label ?? fallback;
}

function formatCompactTime(value: string | null | undefined): string {
  if (!value) {
    return "not scheduled";
  }

  return new Intl.DateTimeFormat("en-GB", {
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

function relativeTime(value: string | null | undefined): string {
  return value ? formatRelativeAge(value) : "not observed";
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

function sourceStatusLabel(category: PlatformCategory): string {
  const source = category.sources[0];
  return source?.operational_status.replaceAll("_", " ") ?? category.status.replaceAll("_", " ");
}

function pollIntervalLabel(seconds: number | null | undefined): string {
  if (!seconds) {
    return "cadence missing";
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

function pointBarWidth(point: EnergyPoint, points: EnergyPoint[]): number {
  if (points.length === 0) {
    return 8;
  }

  const { min, max } = pointValueRange(points);
  if (max === min) {
    return 62;
  }

  return Math.max(8, Math.min(100, 14 + ((point.value - min) / (max - min)) * 86));
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

export function EnergyWorkspace({ category, energy }: EnergyWorkspaceProps) {
  if (!category) {
    return (
      <section className="energy-detail-empty" aria-label="Energy data unavailable">
        <span>Energy</span>
        <h2>Energy signals are not available yet</h2>
        <p>Fingrid electricity-system metadata has not arrived for the current platform view.</p>
      </section>
    );
  }

  const lowWindowMetric = metricByKey(category, "low_energy_window");
  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const source = category.sources[0] ?? null;
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
    ? formatCompactTime(window.starts_at)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.starts_at)
      : "window pending";
  const endLabel = window
    ? formatCompactTime(window.ends_at)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.ends_at)
      : "waiting for event";
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
    ? formatMetricValue(lowWindowMetric)
    : hasActiveWindow
      ? "Window detected"
      : "No active window";
  const heroDetail =
    energy?.summary ??
    lowWindowMetric?.detail ??
    latestEvent?.body ??
    "Fingrid data has not produced a low-value energy window for the current platform view.";
  const points = energy?.points ?? [];

  return (
    <section className="energy-detail-page" aria-label="Energy detail">
      <div className="energy-detail-header">
        <div>
          <h2>Fingrid Energy Timing</h2>
          <div className="energy-live-status">
            <span aria-hidden="true" />
            <strong>{sourceStatusLabel(category)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(", ").toUpperCase()} / {relativeTime(energy?.observed_at ?? lowWindowMetric?.updated_at ?? source?.last_run_finished_at)}</div>
      </div>

      <section className="energy-bento-grid" aria-label="Energy operating condition">
        <article className={`energy-glass-panel energy-hero energy-hero-${activeTone}`}>
          <div className="energy-card-kicker">
            <span>Flexible Use Window</span>
            <time>{relativeTime(energy?.observed_at ?? lowWindowMetric?.updated_at ?? latestEvent?.starts_at)}</time>
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
              <span>Starts</span>
              <strong>{startLabel}</strong>
            </div>
            <div>
              <span>Ends</span>
              <strong>{endLabel}</strong>
            </div>
          </div>
        </article>

        <article className="energy-glass-panel energy-window-panel">
          <header>
            <span>Window State</span>
            <strong>{hasActiveWindow ? "Ready" : "Pending"}</strong>
          </header>
          <div className="energy-window-stack">
            {(window
              ? [{
                  id: "energy-current-window",
                  label: window.source === "raw_preview" ? "Preview energy timing window" : "Detected energy timing window",
                  detail: energy?.summary ?? "Flexible electricity use window is ready.",
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
                    <span>{formatCompactTime(item.starts_at)} - {formatCompactTime(item.ends_at)}</span>
                  </div>
                  <p>{"detail" in item ? item.detail : item.body}</p>
                </article>
              );
            })}
            {!hasWindowEvidence ? <p>No normalized flexible-use event is available from the latest Fingrid payload.</p> : null}
          </div>
        </article>

        <article className="energy-glass-panel energy-field-panel">
          <header>
            <span>Tracked Fields</span>
            <strong>{fieldCount}</strong>
          </header>
          <div className="energy-field-grid">
            {keyDataItems.map((field) => (
              <article key={field}>
                <span>{field.replaceAll("_", " ")}</span>
                <strong>{field === "low_value_window" && hasActiveWindow ? "Live" : "Mapped"}</strong>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="energy-summary-strip" aria-label="Energy summary metrics">
        {summaryMetrics.map((metric) => (
          <article className={`energy-glass-panel energy-summary-${metricTone(metric)}`} key={metric.key}>
            <span>{metric.label}</span>
            <strong>{formatMetricValue(metric)}</strong>
          </article>
        ))}
      </section>

      <section className="energy-main-grid" aria-label="Energy platform analytics">
        <article className="energy-glass-panel energy-signal-panel">
          <header>
            <div>
              <span>Energy Signal Stack</span>
              <h3>Collection, normalization, and active window state</h3>
            </div>
            <strong>{signalMetrics.length} metrics</strong>
          </header>
          {points.length > 0 ? (
            <div className="energy-point-chart" aria-label="Energy point values">
              {points.slice(0, 18).map((point) => {
                const inWindow = isWindowPoint(point, window?.starts_at, window?.ends_at);
                return (
                  <article className={inWindow ? "energy-point-row energy-point-row-window" : "energy-point-row"} key={point.starts_at}>
                    <span>{formatCompactTime(point.starts_at)}</span>
                    <i aria-hidden="true">
                      <span style={{ width: `${pointBarWidth(point, points)}%` }} />
                    </i>
                    <strong>{point.value.toFixed(1)}</strong>
                  </article>
                );
              })}
            </div>
          ) : null}
          <div className="energy-signal-list">
            {signalMetrics.map((metric) => (
              <article className={`energy-signal energy-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{displayMetricLabel(metric, "Metric unavailable")}</strong>
                  <span>{formatMetricValue(metric)}</span>
                </div>
                <p>{metric.detail ?? "This signal has not produced a platform metric yet."}</p>
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
              <span>Fingrid Source</span>
              <strong>{source?.operational_status.replaceAll("_", " ") ?? "catalog"}</strong>
            </header>
            <div className="energy-source-facts">
              <span>{datasetCount || energy?.source_requests.length || 0} datasets</span>
              <span>{pollIntervalLabel(source?.poll_interval_seconds)} poll</span>
              <span>{energy?.quality.point_count ?? formatMetricValue(recordsMetric)} points</span>
            </div>
            <p>{source?.source_name ?? "Fingrid"} · {source?.license_label ?? "license unavailable"}</p>
            {source?.documentation_url ? (
              <a href={source.documentation_url} rel="noreferrer" target="_blank">
                Open data documentation
              </a>
            ) : null}
          </article>

          <article className="energy-glass-panel energy-volume-panel">
            <header>
              <span>Collection Volume</span>
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
                    <span>{point.detail ?? "records"}</span>
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
              <span>Data Quality</span>
              <strong>{energy ? `${energy.quality.field_coverage_pct.toFixed(0)}%` : category.events.length}</strong>
            </header>
            {energy ? (
              <div className="energy-quality-facts">
                <span>{energy.quality.point_count} points</span>
                <span>{energy.quality.window_point_count} window points</span>
                <span>{energy.quality.missing_fields.length} missing fields</span>
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

      <section className="energy-provider-status" aria-label="Energy provider status">
        <div>
          <span aria-hidden="true" />
          <strong>Provider Status</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            Fingrid Open Data
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            Last Sync: {relativeTime(energy?.observed_at ?? source?.last_run_finished_at ?? lowWindowMetric?.updated_at)}
          </span>
          <i aria-hidden="true" />
          <span className="energy-provider-window">{hasActiveWindow ? "Window detected" : "Window pending"}</span>
        </div>
      </section>

      <p className="energy-detail-freshness">
        {category.description}
      </p>
    </section>
  );
}
