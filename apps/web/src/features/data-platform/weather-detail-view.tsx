"use client";

import { useMemo, useState } from "react";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { cityCoordinates } from "./city-scope";
import { useI18n } from "./i18n";
import { TrendChart } from "./lazy-trend-chart";
import { eventAnchorId } from "./recent-events";
import { localizedPlatformCopy } from "./platform-copy";
import { isEmptyStatus } from "./platform-status";
import { resolveDataTimezone } from "./data-timezone";
import { isHistoricalTimeScope, scopedReferenceTime, scopedStatusLabel } from "./data-time-scope";
import type { WeatherSourceLayer } from "./types";
import {
  CHART_MODES,
  chartAxis,
  chartConfig,
  chartKindLabelKey,
  chartPoints,
  chartReadout,
  chartScale,
  chartXAxisLabels,
  renderForecastChart,
} from "./weather-detail-charts";
import type { ChartMode, WeatherDetailViewProps } from "./weather-detail-types";
import {
  apparentTemperature,
  buildTimelineItems,
  conditionForPoint,
  currentMetricCards,
  displayRegion,
  exactDataTime,
  fieldCoverageLabel,
  forecastWindow,
  formatCompactTime,
  formatDegree,
  formatTimeZoneName,
  formatNumber,
  formatRainWindow,
  latestPoint,
  liveStatusTone,
  maxRainWindowTotal,
  metricByKey,
  metricValue,
  pointThreeHoursEarlier,
  pointThreeHoursLater,
  sourceRequestHost,
  sourceTone,
  stageProgress,
  weatherHistoryPoints,
} from "./weather-detail-utils";
import { UNAVAILABLE_DATA_VALUE } from "./data-value";

function formatPercent(value: number | null | undefined, tKey: (key: string) => string): string {
  const formatted = formatNumber(value, 0);
  return formatted === UNAVAILABLE_DATA_VALUE ? tKey("shell.nA") : `${formatted}%`;
}

export function WeatherDetailView({
  category,
  highlightedEventId,
  history,
  weather,
}: WeatherDetailViewProps) {
  const { language, tKey, enumLabel } = useI18n();
  const [chartMode, setChartMode] = useState<ChartMode>("temperature");
  const dataTimezone = resolveDataTimezone(weather?.time_scope?.timezone);
  const coordinates = cityCoordinates(weather?.location);
  const isHistorical = isHistoricalTimeScope(weather?.time_scope);
  const referenceAt = scopedReferenceTime(weather?.time_scope, weather?.checked_at);
  const points = useMemo(
    () => forecastWindow(weather?.points ?? [], 50, referenceAt),
    [referenceAt, weather],
  );
  const current = latestPoint(
    points.length > 0 ? points : weather?.points ?? [],
    referenceAt,
  );
  const previous = pointThreeHoursEarlier(weather?.points ?? [], current);
  const nextTrendPoint = previous ? null : pointThreeHoursLater(weather?.points ?? [], current);
  const condition = conditionForPoint(current, tKey);
  const feelsLike = apparentTemperature(current);
  const trend =
    current?.temperature_c !== null &&
    current?.temperature_c !== undefined &&
    ((previous?.temperature_c !== null && previous?.temperature_c !== undefined) ||
      (nextTrendPoint?.temperature_c !== null && nextTrendPoint?.temperature_c !== undefined))
      ? previous?.temperature_c !== null && previous?.temperature_c !== undefined
        ? current.temperature_c - previous.temperature_c
        : (nextTrendPoint?.temperature_c ?? current.temperature_c) - current.temperature_c
      : null;
  const trendLabel = previous ? tKey("weather.trend3h") : tKey("weather.next3h");
  const trendArrow = trend === null ? null : trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
  const timelineItems = buildTimelineItems(
    weather,
    category,
    language,
    tKey,
    highlightedEventId,
    dataTimezone,
    referenceAt,
  );
  const activeChartConfig = chartConfig(chartMode);
  const chartData = chartPoints(points, chartMode, language, dataTimezone);
  const secondaryChartData = activeChartConfig.pairedKey
    ? chartPoints(points, activeChartConfig.pairedKey, language, dataTimezone)
    : [];
  const chartScaleValue = chartScale(activeChartConfig, chartData, secondaryChartData);
  const axis = chartAxis(chartScaleValue, activeChartConfig);
  const chartLabels = chartXAxisLabels(chartData);
  const sourceRequest = weather?.source_requests[0];
  const historicalReference = scopedReferenceTime(weather?.time_scope);
  const syncTime = isHistorical
    ? weather?.generated_at ?? sourceRequest?.fetched_at ?? historicalReference
    : weather?.generated_at ?? weather?.checked_at ?? sourceRequest?.fetched_at ?? null;
  const metricCards = currentMetricCards(current, language, tKey, dataTimezone);
  const historyPoints = weatherHistoryPoints(history, tKey, dataTimezone);

  if (!weather || isEmptyStatus(weather.status)) {
    return (
      <section className="weather-detail-empty">
        <span>{tKey("weather.weatherDetail")}</span>
        <h2>{tKey("weather.weatherDataIsNotAvailableYet")}</h2>
        <p>{tKey("weather.theFmiForecastEndpointDidNotReturnCurrentWeatherDataForThisPlatformWindow")}</p>
      </section>
    );
  }

  const liveTone = liveStatusTone(weather.status);
  const dataTime = current?.timestamp ?? weather.generated_at ?? (isHistorical ? historicalReference : weather.checked_at);

  return (
    <div className="weather-detail-page">
      <div className="weather-detail-header">
        <div>
          <h2>{displayRegion(weather.location, tKey)}</h2>
          <div className={`weather-live-status weather-live-status-${liveTone}`}>
            <span aria-hidden="true" />
            <strong>{scopedStatusLabel(
              weather.status,
              weather.time_scope,
              tKey,
              "weather.liveSyncActive",
              "weather.syncDelayed",
            )}</strong>
          </div>
        </div>
        <div>
          {tKey("weather.dataTime")} {exactDataTime(dataTime, language, tKey, dataTimezone, weather.time_scope)} / LAT {formatNumber(coordinates.latitude, 4)} N / LON {formatNumber(coordinates.longitude, 4)} E
        </div>
      </div>

      <section className="weather-bento-grid" aria-label={tKey("weather.weatherConditions")}>
        <article className="weather-hero-card weather-glass-panel">
          <div className="weather-card-kicker">
            <span>{tKey("weather.currentCondition")}</span>
            <time>
              {formatCompactTime(current?.timestamp ?? dataTime, language, dataTimezone)}{" "}
              {formatTimeZoneName(current?.timestamp ?? dataTime, language, dataTimezone)}
            </time>
          </div>
          <div className="weather-current-cluster">
            <span className="material-symbols-outlined weather-condition-icon" aria-hidden="true">
              {condition.icon}
            </span>
            <div>
              <strong>{formatDegree(current?.temperature_c)}</strong>
              <p>{condition.label}</p>
            </div>
          </div>
          <div className="weather-hero-footer">
            <div>
              <span>{tKey("weather.feelsLike")}</span>
              <strong>{formatDegree(feelsLike)}</strong>
            </div>
            {trend !== null ? (
              <div>
                <span>{trendLabel}</span>
                <strong
                  className={
                    trend < 0
                      ? "weather-trend-down"
                      : trend > 0
                        ? "weather-trend-up"
                        : "weather-trend-flat"
                  }
                >
                  <span className="weather-trend-symbol" aria-hidden="true">
                    {trendArrow}
                  </span>
                  {formatDegree(Math.abs(trend))}
                </strong>
              </div>
            ) : null}
          </div>
        </article>

        <div className="weather-detail-metrics">
          {metricCards.map((card) => (
            <article
              className={`weather-glass-panel weather-metric-box weather-metric-${card.tone}`}
              key={card.key}
            >
              <div className="weather-metric-label">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {card.icon}
                </span>
                <DataLabelWithHelp
                  helpText={dataHelpText({
                    key: card.key,
                    label: card.label,
                    detail: card.detail,
                    language,
                  })}
                >
                  {card.label}
                </DataLabelWithHelp>
              </div>
              <div>
                <strong>
                  {card.value}
                  <small>{card.unit}</small>
                </strong>
                <p>{card.detail}</p>
              </div>
              <span className="weather-progress" aria-hidden="true">
                <span style={{ width: `${card.progress}%` }} />
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="weather-summary-strip" aria-label={tKey("weather.weatherSummaryMetrics")}>
        {[
          ["temperature_range", "thermalRange"],
          ["peak_wind", "peakWind"],
          ["peak_gust", "peakGust"],
          ["peak_precipitation", "peakRain"],
          ["total_precipitation", "rainTotal"],
          ["forecast_points", "hourlyPoints"],
        ].flatMap(([key, labelKey]) => {
          const value = metricByKey(weather, key);
          return value ? [{ key, labelKey, value }] : [];
        }).map((item) => (
          <article className="weather-glass-panel" key={item.key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: item.key,
                label: tKey(`weather.${item.labelKey}`),
                language,
              })}
            >
              {tKey(`weather.${item.labelKey}`)}
            </DataLabelWithHelp>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <TrendChart
        className="weather-glass-panel"
        emptyMessage={tKey("weather.noDailyWeatherHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("weather.history")}`}
        maximumFractionDigits={1}
        points={historyPoints}
        title={tKey("weather.dailyAverageTemperature")}
        tone="primary"
        unit="C"
      />

      <section className="weather-lower-grid" aria-label={tKey("weather.weatherForecastAndEvents")}>
        <article className="weather-glass-panel weather-chart-panel">
          <header>
            <span>{weather.quality.forecast_hours}H {tKey("weather.forecastTrajectory")}</span>
            <strong>{chartReadout(chartData, chartMode, tKey, secondaryChartData)}</strong>
            <small className="weather-chart-kind">
              {tKey(`weather.${chartKindLabelKey(activeChartConfig.kind)}`)} · {tKey(`weather.${activeChartConfig.descriptionKey}`)}
            </small>
            <div className="weather-chart-toggle" aria-label={tKey("weather.forecastChartMode")}>
              {CHART_MODES.map((mode) => (
                <button
                  aria-label={`${tKey(`weather.${mode.fullLabelKey}`)} · ${tKey(`weather.${mode.descriptionKey}`)}`}
                  className={chartMode === mode.key ? "active" : ""}
                  key={mode.key}
                  onClick={() => setChartMode(mode.key)}
                  title={`${tKey(`weather.${mode.fullLabelKey}`)} · ${tKey(`weather.${mode.descriptionKey}`)}`}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </header>
          <div
            className={`weather-line-chart weather-forecast-chart weather-forecast-chart-${activeChartConfig.tone} weather-forecast-chart-${activeChartConfig.kind}`}
          >
            <span className="weather-axis weather-axis-top">
              {axis.top}
              {activeChartConfig.unit}
            </span>
            <span className="weather-axis weather-axis-mid">
              {axis.middle}
              {activeChartConfig.unit}
            </span>
            <span className="weather-axis weather-axis-bottom">
              {axis.bottom}
              {activeChartConfig.unit}
            </span>
            {renderForecastChart(chartData, secondaryChartData, activeChartConfig, tKey)}
            <div className="weather-chart-x-axis">
              {chartLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="weather-glass-panel weather-event-panel">
          <h3>{tKey("weather.eventTimeline")}</h3>
          <div className="weather-event-list">
            {timelineItems.map((item) => (
              <article
                className={`weather-event-item weather-event-${item.tone}`}
                id={eventAnchorId(item.id)}
                key={item.id}
              >
                <span className="weather-event-dot" aria-hidden="true" />
                <time>{item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="weather-ops-grid" aria-label={tKey("weather.weatherOperationsData")}>
        <article className="weather-glass-panel weather-rain-window-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "rain_windows",
                label: "Rain Windows",
                language,
              })}
            >
              {tKey("weather.rainWindows")}
            </DataLabelWithHelp>
            <strong>{weather.rain_windows.length}</strong>
          </header>
          <div>
            {weather.rain_windows.length > 0 ? (
              weather.rain_windows.map((window) => (
                <article key={`${window.starts_at}-${window.ends_at}`}>
                  <div>
                    <strong>{formatRainWindow(window, language, tKey, dataTimezone)}</strong>
                    <span>{window.hours}h</span>
                  </div>
                  <p>
                    {tKey("weather.peak")} {formatNumber(window.peak_precip_mm, 1)} mm {tKey("weather.at")}{" "}
                    {formatCompactTime(window.peak_precip_at, language, dataTimezone)} · {tKey("weather.total")}{" "}
                    {formatNumber(window.total_precip_mm, 1)} mm
                  </p>
                  <span className="weather-rain-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(10, (window.total_precip_mm / maxRainWindowTotal(weather.rain_windows)) * 100)}%` }} />
                  </span>
                </article>
              ))
            ) : (
              <p>{tKey("weather.noRainWindowsInTheCurrentForecastHorizon")}</p>
            )}
          </div>
        </article>

        <article className="weather-glass-panel weather-quality-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "data_quality",
                label: "Data Quality",
                language,
              })}
            >
              {tKey("weather.dataQuality")}
            </DataLabelWithHelp>
            <strong>{formatPercent(weather.quality.field_coverage_pct, tKey)}</strong>
          </header>
          <span className="weather-quality-meter" aria-hidden="true">
            <span style={{ width: `${weather.quality.field_coverage_pct}%` }} />
          </span>
          <div className="weather-quality-stats">
            <span>{weather.quality.point_count} {tKey("weather.points")}</span>
            <span>{weather.quality.forecast_hours}h {tKey("weather.horizon")}</span>
            <span>{weather.quality.rain_window_count} {tKey("weather.rainWindows2")}</span>
          </div>
          <p>{fieldCoverageLabel(weather, tKey)}</p>
          {weather.quality.notes.map((note) => (
            <small key={note}>{localizedPlatformCopy(note, language) ?? note}</small>
          ))}
        </article>

        <article className="weather-glass-panel weather-pipeline-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "pipeline",
                label: "Pipeline",
                language,
              })}
            >
              {tKey("weather.pipeline")}
            </DataLabelWithHelp>
            <strong>
              {weather.data_pipeline.filter((stage) => stage.status === "ready").length}/
              {weather.data_pipeline.length}
            </strong>
          </header>
          <div>
            {weather.data_pipeline.map((stage) => (
              <article className={`weather-pipeline-stage weather-pipeline-${sourceTone(stage.status)}`} key={stage.key}>
                <div>
                  <strong>{localizedPlatformCopy(stage.label, language) ?? stage.label}</strong>
                  <span>{enumLabel(stage.status)}</span>
                </div>
                <p>
                  {localizedPlatformCopy(stage.detail, language) ?? stage.detail}
                  {stage.record_count !== null ? ` · ${stage.record_count} ${tKey("weather.records")}` : ""}
                </p>
                <span className="weather-pipeline-meter" aria-hidden="true">
                  <span style={{ width: `${stageProgress(stage)}%` }} />
                </span>
              </article>
            ))}
          </div>
        </article>

        <article className="weather-glass-panel weather-source-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "source_layers",
                label: "Source Layers",
                language,
              })}
            >
              {tKey("weather.sourceLayers")}
            </DataLabelWithHelp>
            <strong>
              {weather.source_layers.filter((layer) => layer.status === "ready").length}/
              {weather.source_layers.length}
            </strong>
          </header>
          <div>
            {weather.source_layers.map((layer: WeatherSourceLayer) => {
              const request = weather.source_requests.find((item) => item.key === layer.key);
              return (
                <article className={`weather-source-layer weather-source-${sourceTone(layer.status)}`} key={layer.key}>
                  <div>
                    <strong>{localizedPlatformCopy(layer.label, language) ?? layer.label}</strong>
                    <span>{enumLabel(layer.status)}</span>
                  </div>
                  <p>{localizedPlatformCopy(layer.detail, language) ?? layer.detail}</p>
                  <small>
                    {request ? `${sourceRequestHost(request.endpoint, tKey)} · ${request.content_type ?? tKey("weather.unknownContent")}` : tKey("weather.requestMetadataUnavailable")}
                  </small>
                </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className={`weather-provider-status weather-provider-status-${liveTone}`} aria-label={tKey("weather.weatherProviderStatus")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("weather.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {localizedPlatformCopy("FMI (Finnish Meteorological Institute)", language)}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("weather.lastSync")}: {exactDataTime(syncTime, language, tKey, dataTimezone, weather.time_scope)}
          </span>
          <i aria-hidden="true" />
          <span className="weather-provider-latency">
            {tKey("weather.coverage")}: {metricByKey(weather, "forecast_hours")
              ? metricValue(weather, "forecast_hours")
              : `${weather.quality.field_coverage_pct}%`}
          </span>
        </div>
      </section>

      <p className="weather-detail-freshness">
        {isHistorical ? tKey("shell.historicalEvidenceAt") : tKey("weather.forecastFeedChecked")} {exactDataTime(syncTime, language, tKey, dataTimezone, weather.time_scope)}. {localizedPlatformCopy(weather.summary, language) ?? localizedPlatformCopy(category?.description, language) ?? ""}
      </p>
    </div>
  );
}
