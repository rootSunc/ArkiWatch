"use client";

import { useCallback, useEffect, useState } from "react";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { translateEnumLabel, useI18n } from "./i18n";
import { TrendChart } from "./lazy-trend-chart";
import { eventAnchorId } from "./recent-events";
import { localizedPlatformCopy } from "./platform-copy";
import {
  DEFAULT_HOUSEHOLD_PRICE_PROVIDER,
  ENERGY_PANEL_PROFILES,
  ENERGY_PANEL_TABS,
  PRICE_CHART_HEIGHT,
  PRICE_CHART_PAD_BOTTOM,
  PRICE_CHART_PAD_LEFT,
  PRICE_CHART_PAD_RIGHT,
  PRICE_CHART_PAD_TOP,
  PRICE_CHART_WIDTH,
} from "./energy-workspace-config";
import type { EnergyWorkspaceProps } from "./energy-workspace-types";
import type { EnergyPanelKey } from "./workspace-query-params";
import {
  chartDisplayPoints,
  chartScale,
  chartX,
  chartY,
  resolveMetricLabel,
  energyHighlightRows,
  energyHistoryPoints,
  energyMetricTone,
  energyTimelineItems,
  formatCompactTime,
  formatPriceNumber,
  formatEnergyPointValue,
  formatEnergyRange,
  formatEnergySpread,
  formatEstimatedCost,
  formatMetricValue,
  householdChromeTiles,
  isNoActiveWindowLabel,
  isWindowPoint,
  latestEnergyEvent,
  metricByKey,
  metricProgress,
  metricTone,
  pointValueRange,
  pollIntervalLabel,
  priceAreaPath,
  priceLinePath,
  severityPoints,
  sourceByCode,
  sourceProgress,
  sourceRecordsMetric,
  sourceStatusLabel,
  sourceStatusMetric,
  sourceVolumePoints,
  systemChromeTiles,
  toneFromSeverity,
  toneFromStatus,
} from "./energy-workspace-utils";
import type { EnergyPoint } from "./types";
import type { PanelMetric } from "./energy-workspace-types";
import { resolveDataTimezone } from "./data-timezone";
import { isHistoricalTimeScope, scopedDataAge, scopedReferenceTime } from "./data-time-scope";
import { isEmptyStatus } from "./platform-status";
import { hasObservedSourceRecords } from "./catalog-workspace-state";
import { handleTabListKeyDown } from "./tab-navigation";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "./workspace-ui";

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
  const { language, tKey, dataLabel } = useI18n();
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
      <WorkspaceEmptyState
        className="energy-detail-empty"
        description={tKey("energy.fingridElectricitySystemMetadataHasNotArrivedForTheCurrentPlatformView")}
        eyebrow={tKey("energy.energy")}
        title={tKey("energy.energySignalsAreNotAvailableYet")}
      />
    );
  }

  const isPricePanel = activePanel === "porssisahko";
  const activeProfile = ENERGY_PANEL_PROFILES[activePanel];
  const activeEnergy = isPricePanel ? householdEnergy : energy;
  const energyTabIdPrefix = "energy-workspace-tab";
  const energyPanelId = "energy-workspace-panel";

  if (!activeEnergy || isEmptyStatus(activeEnergy.status)) {
    return (
      <WorkspaceEmptyState
        className="energy-detail-empty"
        description={tKey("energy.fingridElectricitySystemMetadataHasNotArrivedForTheCurrentPlatformView")}
        eyebrow={tKey("energy.energy")}
        title={tKey("energy.energySignalsAreNotAvailableYet")}
      />
    );
  }

  const dataTimezone = resolveDataTimezone(activeEnergy?.time_scope?.timezone);
  const isHistorical = isHistoricalTimeScope(activeEnergy?.time_scope);
  const activeHistory = isPricePanel ? householdHistory : history;
  const activeSource = sourceByCode(category, activePanel);
  const hasObservedRecords = hasObservedSourceRecords(activeSource ? [activeSource] : []);
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
    ? formatCompactTime(window.starts_at, language, tKey, dataTimezone)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.starts_at, language, tKey, dataTimezone)
      : tKey("energy.windowPending2");
  const endLabel = window
    ? formatCompactTime(window.ends_at, language, tKey, dataTimezone)
    : hasActiveWindow && latestEvent
      ? formatCompactTime(latestEvent.ends_at, language, tKey, dataTimezone)
      : tKey("energy.waitingForEvent");
  const householdWindowUsage = isPricePanel && window?.usage_kwh != null ? window.usage_kwh : null;
  const windowAveragePoint = window
    ? {
      starts_at: window.starts_at,
      ends_at: window.ends_at,
      value: window.average_value,
      unit: window.unit,
      estimated_cost_eur: window.estimated_cost_eur
    }
    : null;
  const windowAverageLabel = windowAveragePoint ? formatEnergyPointValue(windowAveragePoint, activeEnergy?.unit) : tKey("energy.nA");
  const signalMetrics: PanelMetric[] = activeEnergy?.metrics.length ? activeEnergy.metrics.map((metric) => ({
    ...metric,
    detail: null,
    tone: energyMetricTone(metric)
  })) : [lowWindowMetric, recordsMetric, sourceStateMetric].filter((metric): metric is PanelMetric => metric !== null);
  const heroValue = window
    ? isPricePanel
      ? formatEstimatedCost(window.estimated_cost_eur, tKey)
      : `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
    : lowWindowMetric
    ? formatMetricValue(lowWindowMetric, tKey)
    : hasActiveWindow
      ? tKey("energy.windowDetected")
      : tKey("energy.noActiveWindow");
  const heroDetail =
    (isPricePanel && window
      ? localizedPlatformCopy(activeEnergy?.summary, language) ?? `${tKey("energy.averageSpotPrice")}: ${windowAverageLabel}.`
      : localizedPlatformCopy(activeEnergy?.summary, language)) ??
    lowWindowMetric?.detail ??
    latestEvent?.body ??
    (isPricePanel
      ? `${priceProviderName} ${tKey("energy.priceDataHasNotProducedAHouseholdPriceWindowForTheCurrentPlatformView")}`
      : tKey("energy.fingridDataHasNotProducedALowValueEnergyWindowForTheCurrentPlatformView"));
  const points = activeEnergy?.points ?? [];
  const sourceChartPoints = points.slice(0, 96);
  const chartPointPairs = isPricePanel
    ? sourceChartPoints.map((point) => ({ raw: point, display: point }))
    : chartDisplayPoints(sourceChartPoints, false, activeEnergy?.unit, householdWindowUsage);
  const chartPoints = chartPointPairs.map((point) => point.display);
  const chartUnit = activeEnergy?.unit;
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

  const historyPoints = energyHistoryPoints(activeHistory, tKey, isPricePanel, dataTimezone);
  const activeSourceLabel = isHistorical
    ? tKey("shell.historicalEvidence")
    : sourceStatusLabel(activeSource, activeStatus, language);
  const activeObservedAt = isHistorical
    ? activeEnergy?.observed_at ?? lowWindowMetric?.updated_at ?? latestEvent?.starts_at ?? scopedReferenceTime(activeEnergy?.time_scope)
    : activeEnergy?.observed_at ?? lowWindowMetric?.updated_at ?? activeSource?.last_run_finished_at ?? null;
  const activeDataFeedName = activeSource?.source_name ?? (isPricePanel ? "Porssisahko.net" : "Fingrid");
  const activeSourceName = isPricePanel ? priceProviderName : activeDataFeedName;
  const sourceDisclosureName = isPricePanel ? activeDataFeedName : activeSourceName;
  const activeUnitLabel = isPricePanel ? "EUR" : activeEnergy?.unit ?? tKey(`energy.${activeProfile.noUnitLabelKey}`);
  const datasetCount = activeSource?.datasets?.length ?? 0;
  const datasetCountLabel = datasetCount > 0 ? String(datasetCount) : tKey("energy.notObserved");
  const activeVolumePoints = activeSourcePoints.length > 0 ? activeSourcePoints : [{
    label: activePanel,
    value: activeSource?.records_ingested ?? 0,
    tone: toneFromStatus(activeStatus),
    detail: activeStatus
  }];
  const formatDisplayedMetric = (metric: PanelMetric | null): string =>
    metric?.key === "records_ingested" && !hasObservedRecords
      ? tKey("energy.notObserved")
      : formatMetricValue(metric, tKey);
  const chromeReference = scopedReferenceTime(activeEnergy?.time_scope, activeObservedAt);
  const chromeTiles = isPricePanel
    ? householdChromeTiles({
        energy: activeEnergy,
        fallbackProvider: DEFAULT_HOUSEHOLD_PRICE_PROVIDER,
        noValue: tKey("energy.noValue"),
        referenceTime: chromeReference,
        tKey,
        timeZone: dataTimezone,
      })
    : systemChromeTiles({
        energy: activeEnergy,
        noValue: tKey("energy.noValue"),
        pollLabel: pollIntervalLabel(activeSource?.poll_interval_seconds, tKey),
        tKey,
      });
  const highlightRows = isPricePanel
    ? energyHighlightRows({
        energy: activeEnergy,
        noValue: tKey("energy.noValue"),
        referenceTime: chromeReference,
        tKey,
        timeZone: dataTimezone,
      })
    : [];
  const chartDate = chromeReference
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: dataTimezone,
      }).format(new Date(chromeReference))
    : "";
  const chartTitle = isPricePanel
    ? tKey("energy.estimatedHouseholdCostOn").replace("{date}", chartDate)
    : tKey("energy.nationalGridLoad24h");
  const chartRangeLabel = chartRange
    ? `${formatPriceNumber(chartRange.min)} – ${formatPriceNumber(chartRange.max)} ${chartUnit ?? ""}`.trim()
    : isPricePanel
      ? tKey("energy.ckwhUnit")
      : (activeEnergy?.unit ?? "MW");
  const hourFooter = ["00", "06", "12", "18", "23"];

  return (
    <section className={`energy-detail-page ${activeProfile.pageClassName}`} aria-label={tKey("energy.energyDetail")}>
      <WorkspaceEvidenceHeader
        className="energy-detail-header"
        eyebrow={tKey("energy.energyWorkspace")}
        fallbackKey="energy.notObserved"
        language={language}
        observedAt={activeObservedAt}
        sourceLabel={tKey("energy.sourcePair")}
        status={tKey("energy.householdAndGridAreSeparate")}
        statusTone={activeTone}
        tKey={tKey}
        timeScope={activeEnergy?.time_scope}
        title={tKey("energy.householdPriceAndGridLoad")}
        timezone={dataTimezone}
      >
        <p>{sourceDisclosureName} · {activeSource?.license_label ? dataLabel(activeSource.license_label) : tKey("energy.licenseUnavailable")}</p>
      </WorkspaceEvidenceHeader>

      <nav className="energy-tab-list" aria-label={tKey("energy.energyWorkspaceTabs")} role="tablist">
        {ENERGY_PANEL_TABS.map((tab) => {
          const tabLabel = tKey(`energy.${tab.labelKey}`);

          return (
            <button
              aria-label={tabLabel}
              aria-selected={activePanel === tab.key}
              aria-controls={energyPanelId}
              className={activePanel === tab.key ? "energy-tab energy-tab-active" : "energy-tab"}
              id={`${energyTabIdPrefix}-${tab.key}`}
              key={tab.key}
              onClick={() => setActivePanel(tab.key)}
              onKeyDown={(event) =>
                handleTabListKeyDown(
                  event,
                  ENERGY_PANEL_TABS,
                  activePanel,
                  setActivePanel,
                  energyTabIdPrefix,
                )
              }
              role="tab"
              tabIndex={activePanel === tab.key ? 0 : -1}
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

      <div
        aria-labelledby={`${energyTabIdPrefix}-${activePanel}`}
        className="energy-workspace-panel"
        id={energyPanelId}
        role="tabpanel"
        tabIndex={0}
      >

      <section
        className={`energy-glass-panel energy-command-panel energy-command-panel-${activeTone}`}
        id={
          highlightedCategoryEvent
            ? eventAnchorId(highlightedCategoryEvent.id)
            : undefined
        }
        aria-label={tKey("energy.energyOperatingCondition")}
      >
        <div className="energy-command-status">
          <span className="material-symbols-outlined energy-condition-icon" aria-hidden="true">
            {hasActiveWindow ? "bolt" : "schedule"}
          </span>
          <div>
            <div className="energy-card-kicker">
              <span>{isPricePanel ? tKey("energy.flexibleUseStartWindow") : tKey("energy.lowValueSystemWindow")}</span>
              <time>{scopedDataAge(activeObservedAt, activeEnergy?.time_scope, language, tKey, "energy.notObserved", dataTimezone)}</time>
            </div>
            <strong>{heroValue}</strong>
            <p>{heroDetail}</p>
          </div>
        </div>

        <div className="energy-command-facts">
          <div>
            <span>{tKey("energy.canStartFrom")}</span>
            <strong>{startLabel}</strong>
          </div>
          <div>
            <span>{tKey("energy.ends")}</span>
            <strong>{endLabel}</strong>
          </div>
          <div>
            <span>{isPricePanel ? tKey("energy.averageSpotPrice") : tKey("energy.windowState")}</span>
            <strong>{isPricePanel ? windowAverageLabel : hasActiveWindow ? tKey("energy.ready") : tKey("energy.pending")}</strong>
          </div>
          <div>
            <span>{isPricePanel ? tKey("energy.windowUsage") : tKey("energy.systemSource")}</span>
            <strong>{isPricePanel
              ? householdWindowUsage === null
                ? tKey("energy.nA")
                : `${householdWindowUsage.toFixed(2)} kWh`
              : sourceDisclosureName}
            </strong>
          </div>
        </div>
      </section>

      <section className="energy-summary-strip" aria-label={tKey("energy.energySummaryMetrics")}>
        {chromeTiles.map((tile) => (
          <article
            className={`energy-glass-panel energy-summary-${tile.tone ?? "neutral"}${tile.compact ? " energy-summary-compact" : ""}`}
            key={tile.key}
          >
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.caption}</small>
          </article>
        ))}
      </section>

      <section className="energy-main-grid" aria-label={tKey("energy.energyPlatformAnalytics")}>
        <article className="energy-glass-panel energy-signal-panel">
          <header>
            <div>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: isPricePanel ? "best_price" : "best_window",
                  label: isPricePanel ? "Household Price Forecast" : "Fingrid System Timeseries",
                  language,
                })}
              >
                {isPricePanel ? tKey("energy.householdPriceForecast") : tKey("energy.fingridSystemTimeseries")}
              </DataLabelWithHelp>
              <h3>{isPricePanel
                ? tKey("energy.spotPriceByTimeAndEstimatedFlexibleUseCost")
                : tKey("energy.configuredFingridDatasetByTimeAndSelectedLowValueWindow")}</h3>
            </div>
            <strong>{signalMetrics.length} {tKey("energy.metrics")}</strong>
          </header>
          {chartPoints.length > 0 && chartRange && chartVisualScale ? (
            <div className="energy-price-chart" aria-label={isPricePanel ? tKey("energy.householdElectricityPriceForecast") : tKey("energy.fingridElectricitySystemTimeseries")}>
              <div className="energy-chart-heading">
                <div>
                  <span>{tKey(`energy.${activeProfile.chartKindLabelKey}`)}</span>
                  <h2>{chartTitle}</h2>
                </div>
                <em>{chartRangeLabel}</em>
              </div>
              <div className="energy-chart-context" aria-label={tKey("energy.energyChartContext")}>
                <article>
                  <span>{tKey(`energy.${activeProfile.rangeLabelKey}`)}</span>
                  <strong>{formatEnergyRange(chartRange, chartUnit, tKey)}</strong>
                </article>
                <article>
                  <span>{tKey(`energy.${activeProfile.spreadLabelKey}`)}</span>
                  <strong>{formatEnergySpread(chartRange, chartUnit)}</strong>
                </article>
                <article>
                  <span>{tKey(`energy.${activeProfile.unitLabelKey}`)}</span>
                  <strong>{activeUnitLabel}</strong>
                </article>
                <article>
                  <span>{tKey("energy.chartForm")}</span>
                  <strong>{tKey(`energy.${activeProfile.chartKindLabelKey}`)}</strong>
                </article>
              </div>
              <div className="energy-price-chart-head">
                <span>{tKey("energy.min")} {formatEnergyPointValue({ ...chartPoints[0], value: chartRange.min }, chartUnit)}</span>
                <strong>{tKey("energy.max")} {formatEnergyPointValue({ ...chartPoints[0], value: chartRange.max }, chartUnit)}</strong>
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
                    timeZone: dataTimezone
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
                      {formatCompactTime(hoveredPoint.point.starts_at, language, tKey, dataTimezone)}
                    </div>
                    <div className="energy-tooltip-value">
                      <strong>{formatEnergyPointValue(hoveredPoint.point, chartUnit)}</strong>
                    </div>
                    {hoveredPoint.raw && hoveredPoint.raw !== hoveredPoint.point && (
                      <div className="energy-tooltip-detail">
                        <span>{tKey("energy.spotPrice")}:</span>
                        <strong>{formatEnergyPointValue(hoveredPoint.raw, activeEnergy?.unit)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="energy-chart-hours" aria-hidden="true">
                {hourFooter.map((hour) => (
                  <span key={hour}>{hour}</span>
                ))}
              </div>
              {isPricePanel ? (
              <div className="energy-price-list">
                <article className="energy-price-row energy-price-row-heading" aria-hidden="true">
                  <span>{tKey("energy.windowColumn")}</span>
                  <strong>{tKey("energy.estimatedCost")}</strong>
                  <em>{tKey("energy.spotPrice")}</em>
                  <small>{tKey("energy.noteColumn")}</small>
                </article>
                {highlightRows.map((row) => (
                  <article className={`energy-price-row energy-price-row-${row.tone ?? "neutral"}`} key={row.key}>
                    <span>{row.window}</span>
                    <strong>{row.cost}</strong>
                    <em>{row.spot}</em>
                    <small>{row.note}</small>
                  </article>
                ))}
              </div>
              ) : (
                <p className="energy-disclaimer">{tKey("energy.gridLoadIsNational")}</p>
              )}
            </div>
          ) : null}
          <div className="energy-signal-list">
            {signalMetrics.map((metric) => (
              <article className={`energy-signal energy-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{resolveMetricLabel(metric, tKey, language)}</strong>
                  <span>{formatDisplayedMetric(metric)}</span>
                </div>
                <p>{metric.detail ?? tKey("energy.thisSignalHasNotProducedAPlatformMetricYet")}</p>
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
              <span>{isPricePanel ? tKey("energy.priceSource") : tKey("energy.systemSource")}</span>
              <strong>{activeSourceLabel}</strong>
            </header>
            <div className="energy-source-facts">
              <article className="energy-stat-chip">
                <strong>{datasetCountLabel}</strong>
                <span>{tKey("energy.datasets")}</span>
              </article>
              <article className="energy-stat-chip">
                <strong>{pollIntervalLabel(activeSource?.poll_interval_seconds, tKey)}</strong>
                <span>{tKey("energy.poll")}</span>
              </article>
              <article className="energy-stat-chip">
                <strong>{activeEnergy?.quality.point_count ?? formatDisplayedMetric(recordsMetric)}</strong>
                <span>{tKey("energy.points")}</span>
              </article>
            </div>
            <p>{activeSourceName} · {activeSource?.license_label ? dataLabel(activeSource.license_label) : tKey("energy.licenseUnavailable")}</p>
            {activeSource?.error_message ? <p>{tKey("shell.collectionError")}</p> : null}
            {activeSource?.documentation_url ? (
              <a href={activeSource.documentation_url} rel="noreferrer" target="_blank">
                {tKey("energy.openDataDocumentation")}
              </a>
            ) : null}
          </article>

          <article className="energy-glass-panel energy-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Collection Volume",
                  language,
                })}
              >
                {tKey("energy.collectionVolume")}
              </DataLabelWithHelp>
              <strong>{activeVolumePoints.length}</strong>
            </header>
            <div>
              {activeVolumePoints.map((point) => (
                <article className={`energy-volume-row energy-volume-row-${point.tone ?? "neutral"}`} key={point.label}>
                  <div>
                    <strong>{localizedPlatformCopy(point.label, language) ?? point.label}</strong>
                    <span>{point.detail ? localizedPlatformCopy(point.detail, language) ?? translateEnumLabel(language, point.detail) : tKey("energy.records2")}</span>
                  </div>
                  <em>{activeSourcePoints.length === 0 && !hasObservedRecords ? tKey("energy.notObserved") : point.value}</em>
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
                  language,
                })}
              >
                {tKey("energy.dataQuality")}
              </DataLabelWithHelp>
              <strong>{activeEnergy ? `${activeEnergy.quality.field_coverage_pct.toFixed(0)}%` : severityRows.length}</strong>
            </header>
            {activeEnergy ? (
              <div className="energy-quality-facts">
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.point_count}</strong>
                  <span>{tKey("energy.points")}</span>
                </article>
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.window_point_count}</strong>
                  <span>{tKey("energy.windowPoints")}</span>
                </article>
                <article className="energy-stat-chip">
                  <strong>{activeEnergy.quality.missing_fields.length}</strong>
                  <span>{tKey("energy.missingFields")}</span>
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
              <p key={note}>{localizedPlatformCopy(note, language) ?? note}</p>
            ))}
          </article>
        </div>
      </section>

      <section className="energy-insight-grid" aria-label={tKey("energy.energyOperatingCondition")}>
        <article className="energy-glass-panel energy-window-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "window_state",
                label: "Window State",
                language,
              })}
            >
              {tKey("energy.windowState")}
            </DataLabelWithHelp>
            <strong>{hasActiveWindow ? tKey("energy.ready") : tKey("energy.pending")}</strong>
          </header>
          <div className="energy-window-stack">
            {(window
              ? [{
                  id: "energy-current-window",
                  label: window.unit?.includes("kWh")
                    ? tKey("energy.householdFlexibleUseStartWindow")
                    : window.source === "raw_preview"
                      ? tKey("energy.previewEnergyTimingWindow")
                      : tKey("energy.detectedEnergyTimingWindow"),
                  detail: localizedPlatformCopy(activeEnergy?.summary, language) ?? tKey("energy.flexibleElectricityUseWindowIsReady"),
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
                    <span>{formatCompactTime(item.starts_at, language, tKey, dataTimezone)} - {formatCompactTime(item.ends_at, language, tKey, dataTimezone)}</span>
                  </div>
                  <p>{"detail" in item ? item.detail : item.body}</p>
                </article>
              );
            })}
            {!hasWindowEvidence ? (
              <p>{isPricePanel
                ? tKey("energy.noHouseholdPriceWindowIsAvailableFromTheLatestEnergyPayload")
                : tKey("energy.noFingridEnergyWindowIsAvailableFromTheLatestEnergyPayload")}</p>
            ) : null}
          </div>
        </article>
      </section>

      <TrendChart
        className="energy-glass-panel"
        emptyMessage={tKey("energy.noDailyEnergyHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("energy.history")}`}
        maximumFractionDigits={2}
        points={historyPoints}
        title={isPricePanel ? tKey("energy.dailyEstimatedCostTrend") : tKey("energy.dailyAverageEnergyTrend")}
        tone={activeTone}
        unit={isPricePanel ? "EUR" : activeEnergy?.unit}
      />

      <section className="energy-provider-status" aria-label={tKey("energy.energyProviderStatus")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("energy.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {isPricePanel ? tKey("energy.priceSource") : tKey("energy.systemSource")}: {sourceDisclosureName}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("energy.lastSync")}: {scopedDataAge(activeObservedAt, activeEnergy?.time_scope, language, tKey, "energy.notObserved", dataTimezone)}
          </span>
          <i aria-hidden="true" />
          <span className="energy-provider-window">{hasActiveWindow ? tKey("energy.windowDetected") : tKey("energy.windowPending")}</span>
        </div>
      </section>

      <p className="energy-detail-freshness">
        {localizedPlatformCopy(category.description, language) ?? tKey("energy.energyDetail")}
      </p>
      </div>
    </section>
  );
}
