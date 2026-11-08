import { useState, type CSSProperties } from "react";

import { useI18n } from "./i18n";

type TrendTone = "primary" | "good" | "warn" | "bad" | "neutral";

export type TrendChartPoint = {
  label: string;
  value: number;
  detail?: string;
  source?: string;
  timestamp?: string;
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
  referenceAt?: string | null;
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
const CHART_LEFT = 44;
const CHART_RIGHT = 612;

function tooltipLeft(x: number): string {
  if (!Number.isFinite(x)) return "50%";
  const percent = (x / CHART_WIDTH) * 100;
  return `${Math.min(88, Math.max(12, percent))}%`;
}

function finitePoints(points: TrendChartPoint[]): TrendChartPoint[] {
  return points.filter((point) => Number.isFinite(point.value));
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
  }).format(value);
}

function formatValue(
  value: number,
  unit: string | null | undefined,
  maximumFractionDigits: number,
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

function pointTime(point: TrendChartPoint | undefined): number {
  return Date.parse(
    point?.timestamp ??
      (/^\d{4}-\d{2}-\d{2}$/.test(point?.label ?? "")
        ? `${point!.label}T00:00:00Z`
        : ""),
  );
}

function chartX(index: number, points: TrendChartPoint[]): number {
  if (points.length <= 1) return CHART_LEFT;
  const first = pointTime(points[0]),
    last = pointTime(points.at(-1));
  const elapsed =
    points.every((point) => Number.isFinite(pointTime(point))) && last > first
      ? (pointTime(points[index]) - first) / (last - first)
      : index / (points.length - 1);
  return CHART_LEFT + elapsed * (CHART_RIGHT - CHART_LEFT);
}

function chartY(value: number, min: number, max: number): number {
  return (
    CHART_BOTTOM - ((value - min) / (max - min)) * (CHART_BOTTOM - CHART_TOP)
  );
}

function linePath(points: TrendChartPoint[], min: number, max: number): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chartX(index, points).toFixed(1)},${chartY(point.value, min, max).toFixed(1)}`;
    })
    .join(" ");
}

function areaPath(points: TrendChartPoint[], min: number, max: number): string {
  if (points.length === 0) {
    return "";
  }

  const line = linePath(points, min, max);
  return `${line} L${chartX(points.length - 1, points).toFixed(1)},${CHART_BOTTOM} L${CHART_LEFT},${CHART_BOTTOM} Z`;
}

function tickLabels(points: TrendChartPoint[]): TrendChartPoint[] {
  if (points.length <= 3) {
    return points;
  }

  return [
    points[0],
    points[Math.floor(points.length / 2)],
    points[points.length - 1],
  ];
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
  referenceAt,
}: TrendChartProps) {
  const { tKey } = useI18n();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const resolvedEmptyMessage =
    emptyMessage ?? tKey("shell.noHistoricalChartData");
  const resolvedStatLabels = {
    latest: statLabels?.latest ?? tKey("shell.latest"),
    low: statLabels?.low ?? tKey("shell.low"),
    peak: statLabels?.peak ?? tKey("shell.peak"),
    unavailable: statLabels?.unavailable ?? tKey("shell.nA"),
  };
  const chartPoints = finitePoints(points);
  const latestPoint = chartPoints[chartPoints.length - 1] ?? null;
  const peakPoint = chartPoints.reduce<TrendChartPoint | null>(
    (current, point) =>
      current === null || point.value > current.value ? point : current,
    null,
  );
  const lowPoint = chartPoints.reduce<TrendChartPoint | null>(
    (current, point) =>
      current === null || point.value < current.value ? point : current,
    null,
  );
  const range = chartPoints.length > 0 ? valueRange(chartPoints) : null;
  const chartSummary =
    lowPoint && peakPoint
      ? lowPoint.value === peakPoint.value
        ? formatValue(lowPoint.value, unit, maximumFractionDigits)
        : `${formatValue(lowPoint.value, unit, maximumFractionDigits)} ${tKey("shell.to")} ${formatValue(peakPoint.value, unit, maximumFractionDigits)}`
      : resolvedEmptyMessage;
  const chartAriaLabel = `${title}: ${chartSummary}`;
  const reference = referenceAt ? Date.parse(referenceAt) : NaN;
  const firstTime = pointTime(chartPoints[0]);
  const lastTime = pointTime(chartPoints.at(-1));
  const nowX =
    Number.isFinite(reference) &&
    reference >= firstTime &&
    reference <= lastTime &&
    lastTime > firstTime
      ? CHART_LEFT +
        ((reference - firstTime) / (lastTime - firstTime)) *
          (CHART_RIGHT - CHART_LEFT)
      : null;
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
        {chartPoints.length >= 3 && range ? (
          <strong>
            {latestPoint
              ? formatValue(latestPoint.value, unit, maximumFractionDigits)
              : resolvedStatLabels.unavailable}
          </strong>
        ) : (
          <p className="trend-chart-insufficient" role="status">
            {tKey("shell.notEnoughHistory").replace(
              "{count}",
              String(chartPoints.length),
            )}
            {chartPoints.length === 0 ? (
              <small>{resolvedEmptyMessage}</small>
            ) : null}
          </p>
        )}
      </header>

      {chartPoints.length >= 3 && range ? (
        <div className="trend-chart-frame">
          <svg
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x =
                ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
              setHoveredIndex(
                chartPoints.reduce(
                  (nearest, _, index) =>
                    Math.abs(chartX(index, chartPoints) - x) <
                    Math.abs(chartX(nearest, chartPoints) - x)
                      ? index
                      : nearest,
                  0,
                ),
              );
            }}
            onMouseLeave={() => setHoveredIndex(null)}
            aria-label={chartAriaLabel}
            className="trend-chart-svg"
            focusable="false"
            role="img"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            {[CHART_TOP, (CHART_TOP + CHART_BOTTOM) / 2, CHART_BOTTOM].map(
              (yValue) => (
                <line
                  className="trend-chart-grid"
                  key={yValue}
                  x1={CHART_LEFT}
                  x2={CHART_RIGHT}
                  y1={yValue}
                  y2={yValue}
                />
              ),
            )}
            {hoveredIndex != null && chartPoints[hoveredIndex] ? (
              <line
                className="trend-crosshair"
                x1={chartX(hoveredIndex, chartPoints)}
                x2={chartX(hoveredIndex, chartPoints)}
                y1={CHART_TOP}
                y2={CHART_BOTTOM}
              />
            ) : null}
            {nowX != null ? (
              <g className="trend-now">
                <line
                  x1={nowX}
                  x2={nowX}
                  y1={CHART_TOP}
                  y2={CHART_BOTTOM}
                />
                <text
                  x={nowX}
                  y={12}
                  textAnchor={
                    nowX > CHART_RIGHT - 36
                      ? "end"
                      : nowX < CHART_LEFT + 36
                        ? "start"
                        : "middle"
                  }
                >
                  {tKey("shell.chartNow")}
                </text>
              </g>
            ) : null}
            <path
              className="trend-chart-area"
              d={areaPath(chartPoints, range.min, range.max)}
            />
            <path
              className="trend-chart-line"
              d={linePath(chartPoints, range.min, range.max)}
            />
            {chartPoints.map((point, index) => (
              <circle
                tabIndex={0}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
                className="trend-chart-dot"
                cx={chartX(index, chartPoints)}
                cy={chartY(point.value, range.min, range.max)}
                key={`${point.label}-${index}`}
                r={index === chartPoints.length - 1 ? 4 : 3}
              >
                <title>{[point.label, formatValue(point.value, unit, maximumFractionDigits), point.source, point.detail].filter(Boolean).join(" · ")}</title>
              </circle>
            ))}
            {[0, 1, 2, 3].map((i) => (
              <text
                className="trend-chart-y-label"
                key={i}
                x={CHART_LEFT - 4}
                y={CHART_TOP + (i / 3) * (CHART_BOTTOM - CHART_TOP)}
                textAnchor="end"
              >
                {formatNumber(
                  range.max - (i / 3) * (range.max - range.min),
                  maximumFractionDigits,
                )}
              </text>
            ))}
            {tickLabels(chartPoints).map((point, index, ticks) => (
              <text
                className="trend-chart-x-label"
                aria-hidden="true"
                key={`${point.label}-${index}`}
                x={chartX(chartPoints.indexOf(point), chartPoints)}
                y={205}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === ticks.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {point.label}
              </text>
            ))}
          </svg>
          {hoveredIndex != null && chartPoints[hoveredIndex] ? (
            <div
              className="trend-tooltip"
              role="status"
              style={{ left: tooltipLeft(chartX(hoveredIndex, chartPoints)) }}
            >
              <strong>
                {formatNumber(chartPoints[hoveredIndex].value, maximumFractionDigits)}
                {unit ? <small>{unit}</small> : null}
              </strong>
              <span>{chartPoints[hoveredIndex].label}</span>
              {chartPoints[hoveredIndex].source ? (
                <span>{chartPoints[hoveredIndex].source}</span>
              ) : null}
              {chartPoints[hoveredIndex].detail ? (
                <span>{chartPoints[hoveredIndex].detail}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {chartPoints.length >= 3 ? (
        <div className="trend-chart-stats">
          <span>
            {resolvedStatLabels.latest}
            <strong>
              {latestPoint
                ? formatValue(latestPoint.value, unit, maximumFractionDigits)
                : resolvedStatLabels.unavailable}
            </strong>
            {latestPoint?.detail ? <small>{latestPoint.detail}</small> : null}
          </span>
          <span>
            {resolvedStatLabels.low}
            <strong>
              {lowPoint
                ? formatValue(lowPoint.value, unit, maximumFractionDigits)
                : resolvedStatLabels.unavailable}
            </strong>
            {lowPoint?.detail ? <small>{lowPoint.detail}</small> : null}
          </span>
          <span>
            {resolvedStatLabels.peak}
            <strong>
              {peakPoint
                ? formatValue(peakPoint.value, unit, maximumFractionDigits)
                : resolvedStatLabels.unavailable}
            </strong>
            {peakPoint?.detail ? <small>{peakPoint.detail}</small> : null}
          </span>
        </div>
      ) : null}
    </article>
  );
}
