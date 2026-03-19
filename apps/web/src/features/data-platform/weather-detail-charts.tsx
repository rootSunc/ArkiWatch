"use client";

import type { LanguageMode } from "./i18n";
import type { WeatherForecastPoint } from "./types";
import type {
  ChartMode,
  ForecastChartConfig,
  ForecastChartKind,
  ForecastChartPoint,
  ForecastChartScale,
} from "./weather-detail-types";
import { formatCompactTime, formatNumber, hasNumber } from "./weather-detail-utils";

const FORECAST_CHART_WIDTH = 1000;
const FORECAST_CHART_HEIGHT = 220;
const FORECAST_CHART_TOP = 18;
const FORECAST_CHART_BOTTOM = 190;
export const CHART_MODES: ForecastChartConfig[] = [
  {
    key: "temperature",
    label: "TMP",
    fullLabelKey: "temperature",
    unit: "°",
    tone: "primary",
    kind: "line",
    descriptionKey: "continuousThermalCurve"
  },
  {
    key: "precipitation",
    label: "PRCP",
    fullLabelKey: "precipitation",
    unit: " mm",
    tone: "rain",
    kind: "bar",
    descriptionKey: "hourlyRainVolume",
    floorZero: true
  },
  {
    key: "wind",
    label: "WIND",
    fullLabelKey: "windAndGust",
    unit: " m/s",
    tone: "wind",
    kind: "dual-line",
    descriptionKey: "sustainedWindWithGustOverlay",
    floorZero: true,
    pairedKey: "gust",
    pairedLabelKey: "gust"
  },
  {
    key: "gust",
    label: "GUST",
    fullLabelKey: "gustAndWind",
    unit: " m/s",
    tone: "wind",
    kind: "dual-line",
    descriptionKey: "gustPeaksAgainstSustainedWind",
    floorZero: true,
    pairedKey: "wind",
    pairedLabelKey: "wind"
  },
  {
    key: "cloud",
    label: "CLD",
    fullLabelKey: "cloudCover",
    unit: "%",
    tone: "cloud",
    kind: "band",
    descriptionKey: "percentCoverageBand",
    fixedMin: 0,
    fixedMax: 100
  },
  {
    key: "humidity",
    label: "RH",
    fullLabelKey: "humidity",
    unit: "%",
    tone: "humidity",
    kind: "band",
    descriptionKey: "relativeHumidityBand",
    fixedMin: 0,
    fixedMax: 100
  },
  {
    key: "dewPoint",
    label: "DEW",
    fullLabelKey: "dewPoint",
    unit: "°",
    tone: "humidity",
    kind: "line",
    descriptionKey: "moistureTemperatureCurve"
  },
  {
    key: "pressure",
    label: "HPA",
    fullLabelKey: "pressure",
    unit: " hPa",
    tone: "pressure",
    kind: "line",
    descriptionKey: "pressureTrendLine"
  },
  {
    key: "visibility",
    label: "VIS",
    fullLabelKey: "visibility",
    unit: " km",
    tone: "visibility",
    kind: "area",
    descriptionKey: "distanceEnvelope",
    floorZero: true
  }
];

export function chartConfig(mode: ChartMode): ForecastChartConfig {
  return CHART_MODES.find((item) => item.key === mode) ?? CHART_MODES[0];
}

export function chartValue(point: WeatherForecastPoint, mode: ChartMode): number | null {
  switch (mode) {
    case "temperature":
      return point.temperature_c;
    case "precipitation":
      return point.precipitation_mm;
    case "wind":
      return point.wind_speed_ms;
    case "gust":
      return point.wind_gust_ms;
    case "cloud":
      return point.cloud_cover_pct;
    case "humidity":
      return point.humidity_pct;
    case "dewPoint":
      return point.dew_point_c;
    case "pressure":
      return point.pressure_hpa;
    case "visibility":
      return hasNumber(point.visibility_m) ? point.visibility_m / 1000 : null;
    default:
      return null;
  }
}

export function chartPoints(
  points: WeatherForecastPoint[],
  mode: ChartMode,
  language: LanguageMode
): ForecastChartPoint[] {
  return points.flatMap((point, index) => {
    const value = chartValue(point, mode);
    if (value === null || value === undefined) {
      return [];
    }

    return [
      {
        label: formatCompactTime(point.timestamp, language),
        sourceCount: points.length,
        sourceIndex: index,
        timestamp: point.timestamp,
        value
      }
    ];
  });
}

export function chartScale(
  config: ForecastChartConfig,
  primaryPoints: ForecastChartPoint[],
  secondaryPoints: ForecastChartPoint[] = []
): ForecastChartScale {
  if (config.fixedMin !== undefined && config.fixedMax !== undefined) {
    return { min: config.fixedMin, max: config.fixedMax };
  }

  const values = [...primaryPoints, ...secondaryPoints].map((point) => point.value);
  if (values.length === 0) {
    return {
      min: config.fixedMin ?? 0,
      max: config.fixedMax ?? 1
    };
  }

  const rawMin = config.fixedMin ?? (config.floorZero ? 0 : Math.min(...values));
  const rawMax = config.fixedMax ?? Math.max(...values, config.floorZero ? 1 : values[0]);
  if (rawMax === rawMin) {
    const padding = rawMax === 0 ? 1 : Math.abs(rawMax) * 0.12;
    return {
      min: config.floorZero ? 0 : rawMin - padding,
      max: rawMax + padding
    };
  }

  const padding = config.fixedMax !== undefined ? 0 : Math.max((rawMax - rawMin) * 0.12, config.floorZero ? 0 : 0.5);
  return {
    min: config.floorZero ? 0 : rawMin - padding,
    max: rawMax + padding
  };
}

export function chartX(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }

  return (index / (count - 1)) * FORECAST_CHART_WIDTH;
}

export function chartPointX(point: ForecastChartPoint): number {
  return chartX(point.sourceIndex, point.sourceCount);
}

export function chartY(value: number, scale: ForecastChartScale): number {
  if (scale.max === scale.min) {
    return FORECAST_CHART_TOP + (FORECAST_CHART_BOTTOM - FORECAST_CHART_TOP) / 2;
  }

  return (
    FORECAST_CHART_BOTTOM -
    ((value - scale.min) / (scale.max - scale.min)) * (FORECAST_CHART_BOTTOM - FORECAST_CHART_TOP)
  );
}

export function chartLinePath(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = chartPointX(point);
      const y = chartY(point.value, scale);
      const command = index === 0 ? "M" : "L";
      return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function chartAreaPath(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  if (points.length === 0) {
    return "";
  }

  const linePath = chartLinePath(points, scale);
  return `${linePath} L${chartPointX(points[points.length - 1]).toFixed(1)},${FORECAST_CHART_BOTTOM} L${chartPointX(points[0]).toFixed(1)},${FORECAST_CHART_BOTTOM} Z`;
}

export function chartPolyline(points: ForecastChartPoint[], scale: ForecastChartScale): string {
  return points
    .map((point) => {
      const x = chartPointX(point);
      const y = chartY(point.value, scale);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function chartAxis(scale: ForecastChartScale, config: ForecastChartConfig): { top: string; middle: string; bottom: string } {
  const digits = ["pressure", "cloud", "humidity"].includes(config.key) ? 0 : 1;
  return {
    top: formatNumber(scale.max, digits),
    middle: formatNumber((scale.max + scale.min) / 2, digits),
    bottom: formatNumber(scale.min, digits)
  };
}

export function chartReadout(
  points: ForecastChartPoint[],
  mode: ChartMode,
  tKey: (key: string) => string,
  secondaryPoints: ForecastChartPoint[] = []
): string {
  if (points.length === 0) {
    return tKey("weather.noValues");
  }

  const config = chartConfig(mode);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const digits = ["cloud", "humidity", "pressure"].includes(mode) ? 0 : 1;
  if (config.kind === "bar") {
    const total = values.reduce((sum, value) => sum + value, 0);
    return `${tKey("weather.total")} ${formatNumber(total, 1)}${config.unit} / ${tKey("weather.peakLower")} ${formatNumber(max, 1)}${config.unit}`;
  }
  if (config.kind === "dual-line" && secondaryPoints.length > 0) {
    const secondaryMax = Math.max(...secondaryPoints.map((point) => point.value));
    return `${formatNumber(min, digits)}-${formatNumber(max, digits)}${config.unit} / ${config.pairedLabelKey ? tKey(`weather.${config.pairedLabelKey}`) : tKey("weather.overlay")} ${formatNumber(secondaryMax, digits)}${config.unit}`;
  }

  return `${formatNumber(min, digits)}${config.unit} to ${formatNumber(max, digits)}${config.unit}`;
}

export function chartKindLabelKey(kind: ForecastChartKind): string {
  if (kind === "bar") {
    return "barChart";
  }
  if (kind === "area") {
    return "areaChart";
  }
  if (kind === "band") {
    return "coverageBand";
  }
  if (kind === "dual-line") {
    return "dualLineChart";
  }

  return "lineChart";
}

export function chartXAxisLabels(points: ForecastChartPoint[]): string[] {
  if (points.length <= 5) {
    return points.map((point) => point.label);
  }

  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.min(points.length - 1, Math.round((points.length - 1) * ratio));
    return points[index].label;
  });
}

export function renderForecastChart(
  points: ForecastChartPoint[],
  secondaryPoints: ForecastChartPoint[],
  config: ForecastChartConfig,
  tKey: (key: string) => string
) {
  if (points.length === 0) {
    return <div className="weather-chart-empty">{tKey("weather.noForecastPointsAvailable")}</div>;
  }

  const scale = chartScale(config, points, secondaryPoints);
  const linePath = chartLinePath(points, scale);
  const areaPath = chartAreaPath(points, scale);
  const polyline = chartPolyline(points, scale);
  const secondaryLinePath = chartLinePath(secondaryPoints, scale);
  const sourceCount = points[0]?.sourceCount ?? points.length;
  const slotWidth = FORECAST_CHART_WIDTH / Math.max(sourceCount, 1);
  const barWidth = Math.max(8, slotWidth * 0.68);
  const firstX = chartPointX(points[0]);
  const lastX = chartPointX(points[points.length - 1]);

  return (
    <svg
      aria-hidden="true"
      className="weather-forecast-svg"
      preserveAspectRatio="none"
      viewBox={`0 0 ${FORECAST_CHART_WIDTH} ${FORECAST_CHART_HEIGHT}`}
    >
      {[FORECAST_CHART_TOP, (FORECAST_CHART_TOP + FORECAST_CHART_BOTTOM) / 2, FORECAST_CHART_BOTTOM].map((yValue) => (
        <line
          className="weather-chart-grid-line"
          key={yValue}
          x1="0"
          x2={FORECAST_CHART_WIDTH}
          y1={yValue}
          y2={yValue}
        />
      ))}
      {scale.min < 0 && scale.max > 0 ? (
        <line
          className="weather-chart-zero-line"
          x1="0"
          x2={FORECAST_CHART_WIDTH}
          y1={chartY(0, scale)}
          y2={chartY(0, scale)}
        />
      ) : null}

      {config.kind === "bar"
        ? points.map((point, index) => {
            const x = chartPointX(point) - barWidth / 2;
            const y = chartY(point.value, scale);
            return (
              <rect
                className="weather-chart-bar"
                height={Math.max(2, FORECAST_CHART_BOTTOM - y)}
                key={`${point.timestamp}-${index}`}
                rx="4"
                width={barWidth}
                x={Math.max(0, Math.min(FORECAST_CHART_WIDTH - barWidth, x))}
                y={y}
              >
                <title>{`${point.label}: ${formatNumber(point.value, 1)}${config.unit}`}</title>
              </rect>
            );
          })
        : null}

      {config.kind === "area" ? <path className="weather-chart-area" d={areaPath} /> : null}
      {config.kind === "band" ? <polygon className="weather-chart-band" points={`${polyline} ${lastX},${FORECAST_CHART_BOTTOM} ${firstX},${FORECAST_CHART_BOTTOM}`} /> : null}

      {config.kind !== "bar" ? <path className="weather-chart-line" d={linePath} /> : null}
      {config.kind === "dual-line" && secondaryLinePath ? (
        <path className="weather-chart-line-secondary" d={secondaryLinePath} />
      ) : null}

      {points.map((point, index) => (
        <circle
          className="weather-chart-point"
          cx={chartPointX(point)}
          cy={chartY(point.value, scale)}
          key={`${point.timestamp}-${index}`}
          r={index === points.length - 1 ? 4 : 2.4}
        >
          <title>{`${tKey(`weather.${config.fullLabelKey}`)}: ${formatNumber(point.value, 1)}${config.unit} at ${point.label}`}</title>
        </circle>
      ))}
      {config.kind === "dual-line"
        ? secondaryPoints.map((point, index) => (
            <circle
              className="weather-chart-point-secondary"
              cx={chartPointX(point)}
              cy={chartY(point.value, scale)}
              key={`${point.timestamp}-secondary-${index}`}
              r={index === secondaryPoints.length - 1 ? 3.4 : 2}
            >
              <title>{`${config.pairedLabelKey ? tKey(`weather.${config.pairedLabelKey}`) : tKey("weather.overlay")}: ${formatNumber(point.value, 1)}${config.unit} at ${point.label}`}</title>
            </circle>
          ))
        : null}
    </svg>
  );
}
