import type { CSSProperties } from "react";

import { formatTimestamp } from "@/features/shared/format";

import {
  PlatformVisualization,
  PlatformVisualizationPoint,
  PlatformVisualizationSeries,
  PlatformVisualizationTimelineItem
} from "./types";

type VisualizationPanelProps = {
  visualization: PlatformVisualization;
};

function maxPointValue(points: PlatformVisualizationPoint[]): number {
  return points.reduce((maxValue, point) => Math.max(maxValue, Math.abs(point.value)), 1);
}

function displayUnit(unit: string | null): string {
  return unit && unit !== "mixed" ? unit : "";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value);
}

function formatValue(value: number, unit: string | null): string {
  const suffix = displayUnit(unit);
  return `${formatNumber(value)}${suffix ? ` ${suffix}` : ""}`;
}

function toneColor(tone: string | undefined, index: number): string {
  if (tone === "good") {
    return "var(--green)";
  }

  if (tone === "warn") {
    return "var(--amber)";
  }

  if (tone === "bad") {
    return "var(--red)";
  }

  return index % 2 === 0 ? "var(--blue)" : "var(--ink)";
}

function severityRank(value: string): number {
  switch (value.toUpperCase()) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

function highestSeverity(items: PlatformVisualizationTimelineItem[]): string {
  return items.reduce(
    (current, item) => (severityRank(item.severity) > severityRank(current) ? item.severity : current),
    "INFO"
  );
}

function renderSummaryStat(label: string, value: string, detail?: string) {
  return (
    <div className="visual-summary-stat" key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function renderVisualizationSummary(visualization: PlatformVisualization) {
  if (visualization.type === "line" || visualization.type === "area") {
    const series = visualization.data.series ?? [];
    const firstSeries = series.find((item) => item.points.length > 0);
    const firstPoint = firstSeries?.points[0];
    const lastPoint = firstSeries?.points[firstSeries.points.length - 1];
    return (
      <div className="visual-summary-grid">
        {renderSummaryStat("Series", String(series.length))}
        {renderSummaryStat(
          "Hourly points",
          String(visualization.data.point_count ?? firstSeries?.points.length ?? 0)
        )}
        {renderSummaryStat(
          "Window",
          `${formatTimestamp(firstPoint?.timestamp ?? null)} to ${formatTimestamp(
            lastPoint?.timestamp ?? null
          )}`
        )}
      </div>
    );
  }

  if (visualization.type === "timeline") {
    const items = visualization.data.items ?? [];
    return (
      <div className="visual-summary-grid">
        {renderSummaryStat("Windows", String(items.length))}
        {renderSummaryStat("Highest severity", highestSeverity(items).toLowerCase())}
        {renderSummaryStat("Next start", formatTimestamp(items[0]?.starts_at ?? null))}
      </div>
    );
  }

  if (visualization.type === "gauge") {
    const value = visualization.data.value ?? 0;
    const max = visualization.data.max ?? 100;
    return (
      <div className="visual-summary-grid">
        {renderSummaryStat("Current", formatValue(value, visualization.unit))}
        {renderSummaryStat("Scale", `0-${formatNumber(max)}`)}
        {renderSummaryStat("Signal", visualization.data.label ?? visualization.unit ?? "score")}
      </div>
    );
  }

  const points = visualization.data.points ?? [];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce<PlatformVisualizationPoint | null>(
    (current, point) => (current === null || point.value > current.value ? point : current),
    null
  );

  return (
    <div className="visual-summary-grid">
      {renderSummaryStat(
        visualization.unit === "mixed" ? "Signals" : "Total",
        visualization.unit === "mixed" ? String(points.length) : formatValue(total, visualization.unit)
      )}
      {renderSummaryStat(
        "Peak",
        peak ? formatValue(peak.value, visualization.unit) : "0",
        peak?.label
      )}
      {renderSummaryStat("Data points", String(points.length))}
    </div>
  );
}

function renderBarChart(points: PlatformVisualizationPoint[], unit: string | null) {
  const maxValue = maxPointValue(points);

  if (points.length === 0) {
    return <div className="empty-visual">No chart data in the current window.</div>;
  }

  return (
    <div className="bar-visual">
      {points.map((point) => (
        <div className="bar-row" key={point.label}>
          <div className="bar-label">
            <strong>{point.label}</strong>
            {point.detail ? <small>{point.detail}</small> : null}
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill bar-fill-${point.tone ?? "neutral"}`}
              style={
                { "--bar-width": `${Math.max(6, (Math.abs(point.value) / maxValue) * 100)}%` } as CSSProperties
              }
            />
          </div>
          <span className="bar-value">{formatValue(point.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

function seriesYValue(value: number, minValue: number, maxValue: number): number {
  const chartTop = 18;
  const chartHeight = 120;
  if (maxValue === minValue) {
    return chartTop + chartHeight / 2;
  }

  return chartTop + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
}

function seriesXValue(index: number, count: number): number {
  const chartLeft = 24;
  const chartWidth = 552;
  if (count <= 1) {
    return chartLeft;
  }

  return chartLeft + (index / (count - 1)) * chartWidth;
}

function renderLineChart(series: PlatformVisualizationSeries[]) {
  const visibleSeries = series.filter((item) => item.points.length > 0).slice(0, 4);
  const firstSeries = visibleSeries[0];

  if (!firstSeries) {
    return <div className="empty-visual">No hourly forecast data in the current window.</div>;
  }

  const tickCandidates = [
    firstSeries.points[0],
    firstSeries.points[Math.floor(firstSeries.points.length / 2)],
    firstSeries.points[firstSeries.points.length - 1]
  ].filter(Boolean);

  return (
    <div className="line-visual">
      <svg aria-hidden="true" className="line-chart" viewBox="0 0 600 170">
        <line className="line-chart-axis" x1="24" x2="576" y1="138" y2="138" />
        {[18, 58, 98, 138].map((yValue) => (
          <line
            className="line-chart-grid"
            key={yValue}
            x1="24"
            x2="576"
            y1={yValue}
            y2={yValue}
          />
        ))}
        {visibleSeries.map((item, seriesIndex) => {
          const values = item.points.map((point) => point.value);
          const minValue = Math.min(...values);
          const maxValue = Math.max(...values);
          const polylinePoints = item.points
            .map((point, pointIndex) => {
              const xValue = seriesXValue(pointIndex, item.points.length);
              const yValue = seriesYValue(point.value, minValue, maxValue);
              return `${xValue.toFixed(1)},${yValue.toFixed(1)}`;
            })
            .join(" ");

          return (
            <g key={item.key}>
              <polyline
                className="line-chart-series"
                points={polylinePoints}
                stroke={toneColor(item.tone, seriesIndex)}
              />
              {item.points.map((point, pointIndex) => (
                <circle
                  className="line-chart-point"
                  cx={seriesXValue(pointIndex, item.points.length)}
                  cy={seriesYValue(point.value, minValue, maxValue)}
                  fill={toneColor(item.tone, seriesIndex)}
                  key={`${item.key}-${point.timestamp ?? point.label}`}
                  r="2.6"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="line-chart-ticks">
        {tickCandidates.map((point) => (
          <span key={point.timestamp ?? point.label}>{point.label}</span>
        ))}
      </div>
      <div className="line-chart-legend">
        {visibleSeries.map((item, index) => {
          const latestPoint = item.points[item.points.length - 1];
          return (
            <span key={item.key}>
              <i style={{ background: toneColor(item.tone, index) }} />
              {item.label}: {formatValue(latestPoint.value, item.unit)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function renderTimeline(items: PlatformVisualizationTimelineItem[]) {
  if (items.length === 0) {
    return <div className="empty-visual">No events are active for this category.</div>;
  }

  return (
    <div className="timeline-visual">
      {items.map((item) => (
        <article className={`timeline-visual-item timeline-visual-item-${item.tone ?? "neutral"}`} key={item.id}>
          <span className="timeline-visual-marker" aria-hidden="true" />
          <div>
            <div className="timeline-visual-heading">
              <strong>{item.label}</strong>
              <span>{item.severity.toLowerCase()}</span>
            </div>
            <time>
              {formatTimestamp(item.starts_at)} to {formatTimestamp(item.ends_at)}
            </time>
          </div>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function renderGauge(visualization: PlatformVisualization) {
  const value = visualization.data.value ?? 0;
  const max = visualization.data.max ?? 100;
  const width = Math.max(4, Math.min(100, (value / max) * 100));

  return (
    <div className="gauge-visual">
      <div className="gauge-readout">
        <strong>{formatValue(value, visualization.unit)}</strong>
        <span>{visualization.data.label ?? visualization.unit ?? "score"}</span>
      </div>
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ "--gauge-width": `${width}%` } as CSSProperties}
        />
      </div>
      <div className="gauge-scale">
        <span>0</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}

function renderVisualizationBody(visualization: PlatformVisualization) {
  if (visualization.type === "line" || visualization.type === "area") {
    return renderLineChart(visualization.data.series ?? []);
  }

  if (visualization.type === "timeline") {
    return renderTimeline(visualization.data.items ?? []);
  }

  if (visualization.type === "gauge") {
    return renderGauge(visualization);
  }

  return renderBarChart(visualization.data.points ?? [], visualization.unit);
}

export function VisualizationPanel({ visualization }: VisualizationPanelProps) {
  return (
    <article className={`visualization-panel visualization-panel-${visualization.status}`}>
      <header>
        <div>
          <span className="label-text">{visualization.type}</span>
          <h3>{visualization.title}</h3>
        </div>
        <div className="visual-status-stack">
          <span className={`status-pill status-pill-${visualization.status}`}>
            {visualization.status}
          </span>
          <small>{formatTimestamp(visualization.updated_at)}</small>
        </div>
      </header>
      <p>{visualization.description}</p>
      {renderVisualizationSummary(visualization)}
      {renderVisualizationBody(visualization)}
      <footer>
        <span>{visualization.source_codes.join(", ") || "No source"}</span>
        <span>{visualization.unit ?? "mixed signal"}</span>
      </footer>
    </article>
  );
}
