import type { CSSProperties } from "react";

import { formatTimestamp } from "@/features/shared/format";

import {
  PlatformVisualization,
  PlatformVisualizationPoint,
  PlatformVisualizationTimelineItem
} from "./types";

type VisualizationPanelProps = {
  visualization: PlatformVisualization;
};

function maxPointValue(points: PlatformVisualizationPoint[]): number {
  return points.reduce((maxValue, point) => Math.max(maxValue, point.value), 1);
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
          <span>{point.label}</span>
          <div className="bar-track">
            <div
              className={`bar-fill bar-fill-${point.tone ?? "neutral"}`}
              style={{ "--bar-width": `${Math.max(6, (point.value / maxValue) * 100)}%` } as CSSProperties}
            />
          </div>
          <strong>
            {point.value}
            {unit && unit !== "mixed" ? <small>{unit}</small> : null}
          </strong>
        </div>
      ))}
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
          <div>
            <strong>{item.label}</strong>
            <span>
              {formatTimestamp(item.starts_at)} to {formatTimestamp(item.ends_at)}
            </span>
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
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ "--gauge-width": `${width}%` } as CSSProperties}
        />
      </div>
      <div className="gauge-meta">
        <strong>
          {value}
          <small>/{max}</small>
        </strong>
        <span>{visualization.data.label ?? visualization.unit ?? "score"}</span>
      </div>
    </div>
  );
}

function renderVisualizationBody(visualization: PlatformVisualization) {
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
        <span className={`status-pill status-pill-${visualization.status}`}>
          {visualization.status}
        </span>
      </header>
      <p>{visualization.description}</p>
      {renderVisualizationBody(visualization)}
      <footer>
        <span>{visualization.source_codes.join(", ") || "No source"}</span>
        <span>{formatTimestamp(visualization.updated_at)}</span>
      </footer>
    </article>
  );
}
