"use client";

import { useMemo, useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { useI18n } from "./i18n";
import { TrendChart } from "./lazy-trend-chart";
import { eventAnchorId } from "./recent-events";
import type { WeatherSourceLayer } from "./types";
import {
  CHART_MODES,
  chartAxis,
  chartConfig,
  chartKindLabel,
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

export function WeatherDetailView({
  category,
  highlightedEventId,
  history,
  weather,
}: WeatherDetailViewProps) {
  const { language, t } = useI18n();
  const [chartMode, setChartMode] = useState<ChartMode>("temperature");
  const points = useMemo(() => forecastWindow(weather?.points ?? []), [weather]);
  const current = latestPoint(points.length > 0 ? points : weather?.points ?? []);
  const previous = pointThreeHoursEarlier(weather?.points ?? [], current);
  const nextTrendPoint = previous ? null : pointThreeHoursLater(weather?.points ?? [], current);
  const condition = conditionForPoint(current, t);
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
  const trendLabel = previous ? t("Trend 3H") : t("Next 3H");
  const timelineItems = buildTimelineItems(
    weather,
    category,
    language,
    t,
    highlightedEventId,
  );
  const activeChartConfig = chartConfig(chartMode);
  const chartData = chartPoints(points, chartMode, language);
  const secondaryChartData = activeChartConfig.pairedKey
    ? chartPoints(points, activeChartConfig.pairedKey, language)
    : [];
  const chartScaleValue = chartScale(activeChartConfig, chartData, secondaryChartData);
  const axis = chartAxis(chartScaleValue, activeChartConfig);
  const chartLabels = chartXAxisLabels(chartData);
  const sourceRequest = weather?.source_requests[0];
  const syncTime = weather?.generated_at ?? weather?.checked_at ?? sourceRequest?.fetched_at ?? null;
  const metricCards = currentMetricCards(current, language, t);
  const historyPoints = weatherHistoryPoints(history);

  if (!weather) {
    return (
      <section className="weather-detail-empty">
        <span>{t("Weather Detail")}</span>
        <h2>{t("Weather data is not available yet")}</h2>
        <p>{t("The FMI forecast endpoint did not return current weather data for this platform window.")}</p>
      </section>
    );
  }

  const liveTone = liveStatusTone(weather.status);
  const dataTime = current?.timestamp ?? weather.generated_at ?? weather.checked_at;

  return (
    <div className="weather-detail-page">
      <div className="weather-detail-header">
        <div>
          <h2>{displayRegion(weather.location, t)}</h2>
          <div className={`weather-live-status weather-live-status-${liveTone}`}>
            <span aria-hidden="true" />
            <strong>{weather.status === "stale" ? t("Sync Delayed") : t("Live Sync Active")}</strong>
          </div>
        </div>
        <div>{t("Data time")} {exactDataTime(dataTime, language, t)} / LAT 60.1699 N / LON 24.9384 E</div>
      </div>

      <section className="weather-bento-grid" aria-label={t("Weather conditions")}>
        <article className="weather-hero-card weather-glass-panel">
          <div className="weather-card-kicker">
            <span>{t("Current Condition")}</span>
            <time>{formatCompactTime(current?.timestamp ?? weather.checked_at, language)} EET</time>
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
              <span>{t("Feels Like")}</span>
              <strong>{formatDegree(feelsLike)}</strong>
            </div>
            {trend !== null ? (
              <div>
                <span>{trendLabel}</span>
                <strong className={trend < 0 ? "weather-trend-down" : "weather-trend-up"}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {trend < 0 ? "arrow_downward" : "arrow_upward"}
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
                    t,
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

      <section className="weather-summary-strip" aria-label={t("Weather summary metrics")}>
        {[
          ["temperature_range", "Thermal Range"],
          ["peak_wind", "Peak Wind"],
          ["peak_gust", "Peak Gust"],
          ["peak_precipitation", "Peak Rain"],
          ["total_precipitation", "Rain Total"],
          ["forecast_points", "Hourly Points"]
        ].flatMap(([key, label]) => {
          const value = metricByKey(weather, key);
          return value ? [{ key, label, value }] : [];
        }).map((item) => (
          <article className="weather-glass-panel" key={item.key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: item.key,
                label: item.label,
                t,
              })}
            >
              {t(item.label)}
            </DataLabelWithHelp>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <TrendChart
        className="weather-glass-panel"
        emptyMessage={t("No daily weather history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={1}
        points={historyPoints}
        title={t("Daily Average Temperature")}
        tone="primary"
        unit="C"
      />

      <section className="weather-lower-grid" aria-label={t("Weather forecast and events")}>
        <article className="weather-glass-panel weather-chart-panel">
          <header>
            <span>{weather.quality.forecast_hours}H {t("Forecast Trajectory")}</span>
            <strong>{chartReadout(chartData, chartMode, t, secondaryChartData)}</strong>
            <small className="weather-chart-kind">
              {t(chartKindLabel(activeChartConfig.kind))} · {t(activeChartConfig.description)}
            </small>
            <div className="weather-chart-toggle" aria-label={t("Forecast chart mode")}>
              {CHART_MODES.map((mode) => (
                <button
                  aria-label={`${t(mode.fullLabel)} · ${t(mode.description)}`}
                  className={chartMode === mode.key ? "active" : ""}
                  key={mode.key}
                  onClick={() => setChartMode(mode.key)}
                  title={`${t(mode.fullLabel)} · ${t(mode.description)}`}
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
            {renderForecastChart(chartData, secondaryChartData, activeChartConfig, t)}
            <div className="weather-chart-x-axis">
              {chartLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="weather-glass-panel weather-event-panel">
          <h3>{t("Event Timeline")}</h3>
          <div className="weather-event-list">
            {timelineItems.map((item) => (
              <article
                className={`weather-event-item weather-event-${item.tone}`}
                id={eventAnchorId(item.id)}
                key={item.id}
              >
                <span className="weather-event-dot" aria-hidden="true" />
                <time>{item.active ? t("ACTIVE NOW") : item.time}</time>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="weather-ops-grid" aria-label={t("Weather operations data")}>
        <article className="weather-glass-panel weather-rain-window-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "rain_windows",
                label: "Rain Windows",
                t,
              })}
            >
              {t("Rain Windows")}
            </DataLabelWithHelp>
            <strong>{weather.rain_windows.length}</strong>
          </header>
          <div>
            {weather.rain_windows.length > 0 ? (
              weather.rain_windows.map((window) => (
                <article key={`${window.starts_at}-${window.ends_at}`}>
                  <div>
                    <strong>{formatRainWindow(window, language, t)}</strong>
                    <span>{window.hours}h</span>
                  </div>
                  <p>
                    {t("Peak")} {formatNumber(window.peak_precip_mm, 1)} mm {t("at")}{" "}
                    {formatCompactTime(window.peak_precip_at, language)} · {t("total")}{" "}
                    {formatNumber(window.total_precip_mm, 1)} mm
                  </p>
                  <span className="weather-rain-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(10, (window.total_precip_mm / maxRainWindowTotal(weather.rain_windows)) * 100)}%` }} />
                  </span>
                </article>
              ))
            ) : (
              <p>{t("No rain windows in the current forecast horizon.")}</p>
            )}
          </div>
        </article>

        <article className="weather-glass-panel weather-quality-panel">
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
            <strong>{formatNumber(weather.quality.field_coverage_pct, 0)}%</strong>
          </header>
          <span className="weather-quality-meter" aria-hidden="true">
            <span style={{ width: `${weather.quality.field_coverage_pct}%` }} />
          </span>
          <div className="weather-quality-stats">
            <span>{weather.quality.point_count} {t("points")}</span>
            <span>{weather.quality.forecast_hours}h {t("horizon")}</span>
            <span>{weather.quality.rain_window_count} {t("rain windows")}</span>
          </div>
          <p>{fieldCoverageLabel(weather, t)}</p>
          {weather.quality.notes.map((note) => (
            <small key={note}>{note}</small>
          ))}
        </article>

        <article className="weather-glass-panel weather-pipeline-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "pipeline",
                label: "Pipeline",
                t,
              })}
            >
              {t("Pipeline")}
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
                    <strong>{stage.label}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${t("records")}` : ""}
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
                t,
              })}
            >
              {t("Source Layers")}
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
                    <strong>{layer.label}</strong>
                    <span>{t(layer.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>{layer.detail}</p>
                  <small>
                    {request ? `${sourceRequestHost(request.endpoint, t)} · ${request.content_type ?? t("unknown content")}` : t("request metadata unavailable")}
                  </small>
                </article>
              );
            })}
          </div>
        </article>
      </section>

      <section className={`weather-provider-status weather-provider-status-${liveTone}`} aria-label={t("Weather provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {weather.source_code.toUpperCase()} (Finnish Meteorological Institute)
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {exactDataTime(syncTime, language, t)}
          </span>
          <i aria-hidden="true" />
          <span className="weather-provider-latency">
            {t("Coverage")}: {metricValue(weather, "forecast_hours") !== "n/a" ? metricValue(weather, "forecast_hours") : `${weather.quality.field_coverage_pct}%`}
          </span>
        </div>
      </section>

      <p className="weather-detail-freshness">
        {t("Forecast feed checked")} {formatRelativeAge(weather.checked_at, language)}. {weather.summary ?? category?.description}
      </p>
    </div>
  );
}

