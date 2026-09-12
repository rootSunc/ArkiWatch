import type { CSSProperties } from "react";

import { useI18n } from "./i18n";

type TrendTone = "primary" | "good" | "warn" | "bad" | "neutral";

export type TrendChartPoint = {
  label: string;
  value: number;
  detail?: string;
};

type TrendChartProps = {
  className?: string;
  eyebrow: string;
  title: string;
  points: TrendChartPoint[];
  unit?: string | null;
  tone?: TrendTone;
  maximumFractionDigits?: number;
  emptyMessage?: string;
  statLabels?: {
    latest?: string;
    low?: string;
    peak?: string;
    unavailable?: string;
  };
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_TOP = 20;
const CHART_BOTTOM = 178;
const CHART_LEFT = 28;
const CHART_RIGHT = 612;

function finitePoints(points: TrendChartPoint[]): TrendChartPoint[] {
  return points.filter((point) => Number.isFinite(point.value));
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

function formatValue(
  value: number,
  unit: string | null | undefined,
  maximumFractionDigits: number
): string {
  if (unit?.toUpperCase() === "EUR") {
    return `EUR ${formatNumber(value, maximumFractionDigits)}`;
  }

  const suffix = unit ? ` ${unit}` : "";
  return `${formatNumber(value, maximumFractionDigits)}${suffix}`;
}

function valueRange(points: TrendChartPoint[]): { min: number; max: number } {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.12);
    return { min: min - padding, max: max + padding };
  }

  const padding = (max - min) * 0.12;
  return { min: min - padding, max: max + padding };
}

function chartX(index: number, count: number): number {
  if (count <= 1) {
    return CHART_LEFT;
  }

  return CHART_LEFT + (index / (count - 1)) * (CHART_RIGHT - CHART_LEFT);
}

function chartY(value: number, min: number, max: number): number {
  return CHART_BOTTOM - ((value - min) / (max - min)) * (CHART_BOTTOM - CHART_TOP);
}

function linePath(points: TrendChartPoint[], min: number, max: number): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chartX(index, points.length).toFixed(1)},${chartY(point.value, min, max).toFixed(1)}`;
    })
    .join(" ");
}

function areaPath(points: TrendChartPoint[], min: number, max: number): string {
  if (points.length === 0) {
    return "";
  }

  const line = linePath(points, min, max);
  return `${line} L${chartX(points.length - 1, points.length).toFixed(1)},${CHART_BOTTOM} L${CHART_LEFT},${CHART_BOTTOM} Z`;
}

function tickLabels(points: TrendChartPoint[]): TrendChartPoint[] {
  if (points.length <= 3) {
    return points;
  }

  return [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
}

function toneColor(tone: TrendTone): string {
  if (tone === "good") {
    return "var(--green)";
  }
  if (tone === "warn") {
    return "var(--amber)";
  }
  if (tone === "bad") {
    return "var(--red)";
  }
  if (tone === "neutral") {
    return "var(--outline)";
  }

  return "var(--blue)";
}

export function TrendChart({
  className,
  eyebrow,
  title,
  points,
  unit = null,
  tone = "primary",
  maximumFractionDigits = 1,
  emptyMessage,
  statLabels,
}: TrendChartProps) {
  const { tKey } = useI18n();
  const resolvedEmptyMessage = emptyMessage ?? tKey("shell.noHistoricalChartData");
  const resolvedStatLabels = {
    latest: statLabels?.latest ?? tKey("shell.latest"),
    low: statLabels?.low ?? tKey("shell.low"),
    peak: statLabels?.peak ?? tKey("shell.peak"),
    unavailable: statLabels?.unavailable ?? tKey("shell.nA"),
  };
  const chartPoints = finitePoints(points);
  const latestPoint = chartPoints[chartPoints.length - 1] ?? null;
  const peakPoint = chartPoints.reduce<TrendChartPoint | null>(
    (current, point) => (current === null || point.value > current.value ? point : current),
    null
  );
  const lowPoint = chartPoints.reduce<TrendChartPoint | null>(
    (current, point) => (current === null || point.value < current.value ? point : current),
    null
  );
  const range = chartPoints.length > 0 ? valueRange(chartPoints) : null;
  const chartSummary =
    lowPoint && peakPoint
      ? lowPoint.value === peakPoint.value
        ? formatValue(lowPoint.value, unit, maximumFractionDigits)
        : `${formatValue(lowPoint.value, unit, maximumFractionDigits)} ${tKey("shell.to")} ${formatValue(peakPoint.value, unit, maximumFractionDigits)}`
      : resolvedEmptyMessage;
  const chartAriaLabel = `${title}: ${chartSummary}`;
  const isSinglePoint = chartPoints.length === 1;
  const rootClassName = [className, "trend-panel"].filter(Boolean).join(" ");

  return (
    <article
      className={rootClassName}
      style={{ "--trend-color": toneColor(tone) } as CSSProperties}
    >
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <strong>
          {latestPoint
            ? formatValue(latestPoint.value, unit, maximumFractionDigits)
            : resolvedStatLabels.unavailable}
        </strong>
      </header>

      {chartPoints.length > 0 && range ? (
        <div className={`trend-chart-frame${isSinglePoint ? " trend-chart-frame-single" : ""}`}>
          {isSinglePoint ? (
            <p className="trend-chart-single-note">{tKey("shell.singleSnapshotTrend")}</p>
          ) : null}
          <svg
            aria-label={chartAriaLabel}
            className="trend-chart-svg"
            focusable="false"
            role="img"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            {[CHART_TOP, (CHART_TOP + CHART_BOTTOM) / 2, CHART_BOTTOM].map((yValue) => (
              <line
                className="trend-chart-grid"
                key={yValue}
                x1={CHART_LEFT}
                x2={CHART_RIGHT}
                y1={yValue}
                y2={yValue}
              />
            ))}
            <path className="trend-chart-area" d={areaPath(chartPoints, range.min, range.max)} />
            <path className="trend-chart-line" d={linePath(chartPoints, range.min, range.max)} />
            {chartPoints.map((point, index) => (
              <circle
                className="trend-chart-dot"
                cx={chartX(index, chartPoints.length)}
                cy={chartY(point.value, range.min, range.max)}
                key={`${point.label}-${index}`}
                r={index === chartPoints.length - 1 ? 4 : 3}
              />
            ))}
          </svg>
          <div className="trend-chart-axis" aria-hidden="true">
            {tickLabels(chartPoints).map((point, index) => (
              <span key={`${point.label}-${index}`}>{point.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="trend-chart-empty">{resolvedEmptyMessage}</div>
      )}

      <div className="trend-chart-stats">
        <span>
          {resolvedStatLabels.latest}
          <strong>{latestPoint ? formatValue(latestPoint.value, unit, maximumFractionDigits) : resolvedStatLabels.unavailable}</strong>
          {latestPoint?.detail ? <small>{latestPoint.detail}</small> : null}
        </span>
        <span>
          {resolvedStatLabels.low}
          <strong>{lowPoint ? formatValue(lowPoint.value, unit, maximumFractionDigits) : resolvedStatLabels.unavailable}</strong>
          {lowPoint?.detail ? <small>{lowPoint.detail}</small> : null}
        </span>
        <span>
          {resolvedStatLabels.peak}
          <strong>{peakPoint ? formatValue(peakPoint.value, unit, maximumFractionDigits) : resolvedStatLabels.unavailable}</strong>
          {peakPoint?.detail ? <small>{peakPoint.detail}</small> : null}
        </span>
      </div>
    </article>
  );
}
