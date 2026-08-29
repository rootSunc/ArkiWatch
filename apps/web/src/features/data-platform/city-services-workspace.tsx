"use client";

import type { CSSProperties } from "react";

import { parseValidDate, severityTone } from "@/features/shared/format";

import { categoryKeyDataItemKeys } from "./category-metadata";
import { localizedContent } from "./content-localization";
import { localizedPlatformCopy } from "./platform-copy";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  PlatformTone
} from "./types";
import type { PlatformTimeScope } from "./types";
import { eventAnchorId } from "./recent-events";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";
import { isEmptyStatus } from "./platform-status";
import { hasObservedSourceRecords } from "./catalog-workspace-state";
import { isHistoricalTimeScope, scopedDataAge, scopedDataTimestamp, scopedReferenceTime } from "./data-time-scope";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "./workspace-ui";

type CityServicesWorkspaceProps = {
  category: PlatformCategory | null;
  timezone?: string;
  timeScope?: PlatformTimeScope | null;
};

type CityTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type ServiceField = {
  key: string;
  labelKey: string;
  ownerKey: string;
  detailKey: string;
};

const SUMMARY_KEYS = [
  "source_status",
  "catalog_stage",
  "records_ingested",
  "active_events"
];

const CITY_SERVICE_FIELDS: ServiceField[] = [
  {
    key: "service_location",
    labelKey: "serviceLocation",
    ownerKey: "serviceMap",
    detailKey: "serviceLocationDetail"
  },
  {
    key: "opening_hours",
    labelKey: "openingHours",
    ownerKey: "serviceMap",
    detailKey: "openingHoursDetail"
  },
  {
    key: "temporary_closure",
    labelKey: "temporaryClosures",
    ownerKey: "serviceMap",
    detailKey: "temporaryClosuresDetail"
  },
  {
    key: "accessibility",
    labelKey: "accessibility",
    ownerKey: "serviceMap",
    detailKey: "accessibilityDetail"
  }
];

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

function formatMetricValue(metric: PlatformMetric | null, tKey: (key: string) => string, dataLabel?: (value: string | null | undefined) => string): string {
  if (!metric) {
    return tKey("cityServices.missing");
  }

  return `${dataLabel ? dataLabel(metric.value) : metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCompactTime(
  value: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey("cityServices.notScheduled");
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return tKey("cityServices.notScheduled");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  })
    .format(parsedDate)
    .toUpperCase();
}

function toneFromStatus(status: string | null | undefined): CityTone {
  switch (status) {
    case "healthy":
    case "ready":
    case "connected":
    case "fetched":
      return "good";
    case "pending":
    case "planned":
    case "stale":
    case "watch":
      return "warn";
    case "alert":
    case "failed":
    case "failing":
    case "inactive":
      return "bad";
    default:
      return "neutral";
  }
}

function metricTone(metric: PlatformMetric | null): CityTone {
  return metric ? (metric.tone as CityTone) : "neutral";
}

function progressFromTone(tone: CityTone): number {
  if (tone === "good") {
    return 88;
  }
  if (tone === "warn") {
    return 54;
  }
  if (tone === "bad") {
    return 18;
  }
  return 42;
}

function sourceProgress(status: string | null | undefined): number {
  return progressFromTone(toneFromStatus(status));
}

function visibleSummaryMetrics(category: PlatformCategory): PlatformMetric[] {
  const preferred = SUMMARY_KEYS.map((key) => metricByKey(category, key)).filter(isPlatformMetric);
  const fallback = category.summary_metrics.filter((metric) => !SUMMARY_KEYS.includes(metric.key));

  return [...preferred, ...fallback].slice(0, 5);
}

function latestEvent(category: PlatformCategory): PlatformEvent | null {
  return [...category.events].sort(
    (left, right) => new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime()
  )[0] ?? null;
}

function totalDatasets(category: PlatformCategory): number {
  return category.sources.reduce((total, source) => total + (source.datasets?.length ?? 0), 0);
}

function totalRecords(category: PlatformCategory): number {
  return category.sources.reduce((total, source) => total + (source.records_ingested ?? 0), 0);
}

function latestSourceRun(category: PlatformCategory): string | null {
  const sourceRuns = category.sources
    .map((source) => source.last_run_finished_at ?? source.last_run_started_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

  return sourceRuns[0] ?? null;
}

function fieldStatus(category: PlatformCategory, field: ServiceField, language: LanguageMode): string {
  if (!categoryKeyDataItemKeys(category).includes(field.key)) {
    return translateEnumLabel(language, "Planned");
  }

  if (category.events.some((event) => event.body.toLowerCase().includes(field.key.replaceAll("_", " ")))) {
    return translateEnumLabel(language, "Live");
  }

  return translateEnumLabel(language, "Mapped");
}

function sourceDatasetLabel(datasets: string[] | undefined, tKey: (key: string) => string): string {
  if (!datasets || datasets.length === 0) {
    return tKey("cityServices.datasetCatalogPending");
  }

  return datasets.map((dataset) => dataset.replaceAll("_", " ")).join(", ");
}

function eventTypeLabel(value: string, language: LanguageMode): string {
  return translateEnumLabel(language, value);
}

export function CityServicesWorkspace({ category, timeScope, timezone: requestedTimezone }: CityServicesWorkspaceProps) {
  const { language, tKey, enumLabel, metricLabel, dataLabel } = useI18n();
  const timezone = resolveDataTimezone(requestedTimezone);
  const isHistorical = isHistoricalTimeScope(timeScope);

  if (!category || isEmptyStatus(category.status)) {
    return (
      <WorkspaceEmptyState
        className="city-detail-empty"
        description={tKey("cityServices.metadataMissing")}
        eyebrow={tKey("cityServices.title")}
        title={tKey("cityServices.signalsUnavailable")}
      />
    );
  }

  const summaryMetrics = visibleSummaryMetrics(category);
  const latest = latestEvent(category);
  const activeEventsMetric = metricByKey(category, "active_events");
  const recordsMetric = metricByKey(category, "records_ingested");
  const sourceStatusMetric = metricByKey(category, "source_status");
  const datasetCount = totalDatasets(category);
  const recordCount = totalRecords(category);
  const hasObservedRecords = hasObservedSourceRecords(category.sources);
  const fieldCount = category.key_data_items?.length ?? 0;
  const cityTone = latest ? (severityTone(latest.severity) as CityTone) : toneFromStatus(category.status);
  const latestRun = latestSourceRun(category);
  const readySources = category.sources.filter((source) => toneFromStatus(source.operational_status) === "good").length;
  const eventModels = category.sources.flatMap((source) =>
    (source.normalized_event_structures ?? []).map((model) => ({
      ...model,
      key: `${source.source_code}-${model.event_type}`
    }))
  );
  const visualizations = category.visualizations;

  const missingMetricLabel = tKey("cityServices.missing");
  const recordsDisplay =
    !hasObservedRecords
      ? tKey("cityServices.notCollected")
      : formatMetricValue(recordsMetric, tKey, dataLabel) !== missingMetricLabel
      ? formatMetricValue(recordsMetric, tKey, dataLabel)
      : formatNumber(recordCount);

  return (
    <section className="city-detail-page" aria-label={tKey("cityServices.detailAria")}>
      <WorkspaceEvidenceHeader
        className="city-detail-header catalog-detail-header"
        eyebrow={tKey("shell.dataCatalog")}
        fallbackKey="cityServices.notCollected"
        language={language}
        observedAt={isHistorical ? scopedReferenceTime(timeScope) : latestRun ?? latest?.starts_at}
        sourceLabel={category.source_codes.join(", ").toUpperCase()}
        status={isHistorical ? tKey("shell.historicalEvidence") : translateEnumLabel(language, category.status)}
        statusTone={cityTone}
        tKey={tKey}
        timeScope={timeScope}
        title={tKey("cityServices.dashboardTitle")}
        timezone={timezone}
      />

      <section className="city-bento-grid" aria-label={tKey("cityServices.operatingCondition")}>
        <article className={`city-glass-panel city-hero city-hero-${cityTone}`}>
          <div className="city-card-kicker">
            <span>{tKey("cityServices.serviceCoverage")}</span>
            <time>{scopedDataTimestamp(isHistorical ? scopedReferenceTime(timeScope) : latestRun ?? latest?.starts_at ?? null, timeScope, language, tKey, "cityServices.notCollected", timezone)}</time>
          </div>
          <div className="city-current-cluster">
            <span className="material-symbols-outlined city-condition-icon" aria-hidden="true">
              {latest ? "event_available" : "location_city"}
            </span>
            <div>
              <strong>{category.sources.length}</strong>
              <p>
                {latest?.body ?? tKey("cityServices.stagedContext")}
              </p>
            </div>
          </div>
          <div className="city-hero-footer">
            <div>
              <span>{tKey("cityServices.datasets")}</span>
              <strong>{datasetCount}</strong>
            </div>
            <div>
              <span>{tKey("cityServices.keyFields")}</span>
              <strong>{fieldCount}</strong>
            </div>
          </div>
        </article>

        <article className="city-glass-panel city-readiness-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "source_readiness",
                label: "Source Readiness",
                language,
              })}
            >
              {tKey("cityServices.sourceReadiness")}
            </DataLabelWithHelp>
            <strong>{readySources}/{category.sources.length}</strong>
          </header>
          <div className="city-readiness-stack">
            {category.sources.map((source) => {
              const tone = toneFromStatus(source.operational_status);
              return (
                <article className={`city-readiness-row city-readiness-row-${tone}`} key={source.id}>
                  <div>
                    <strong>{source.source_code}</strong>
                    <span>{translateEnumLabel(language, source.operational_status)}</span>
                  </div>
                  <span className="city-readiness-meter" aria-hidden="true">
                    <span style={{ width: `${sourceProgress(source.operational_status)}%` }} />
                  </span>
                </article>
              );
            })}
          </div>
        </article>

        <article className="city-glass-panel city-field-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "tracked_fields",
                label: "Service Model",
                language,
              })}
            >
              {tKey("cityServices.serviceModel")}
            </DataLabelWithHelp>
            <strong>{fieldCount}</strong>
          </header>
          <div className="city-field-grid">
            {CITY_SERVICE_FIELDS.map((field) => (
              <article key={field.key}>
                <span>{tKey(`cityServices.${field.labelKey}`)}</span>
                <strong>{fieldStatus(category, field, language)}</strong>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="city-summary-strip" aria-label={tKey("cityServices.summaryMetrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`city-glass-panel city-summary-${metricTone(metric)}`} key={metric.key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: metric.key,
                label: metric.label,
                detail: metric.detail,
                language,
              })}
            >
              {metricLabel(metric)}
            </DataLabelWithHelp>
            <strong>
              {metric.key === "records_ingested" && !hasObservedRecords
                ? tKey("cityServices.notCollected")
                : formatMetricValue(metric, tKey, dataLabel)}
            </strong>
          </article>
        ))}
      </section>

      <section className="city-main-grid" aria-label={tKey("cityServices.analytics")}>
        <article className="city-glass-panel city-service-panel">
          <header>
            <div>
              <span>{tKey("cityServices.serviceOperations")}</span>
              <h3>{tKey("cityServices.serviceOperationsLead")}</h3>
            </div>
            <strong>{category.events.length || category.sources.length} {tKey("cityServices.rows")}</strong>
          </header>

          <div className="city-service-list">
            {category.events.length > 0 ? (
              category.events.slice(0, 8).map((event) => {
                const tone = severityTone(event.severity) as CityTone;
                return (
	                  <article
	                    className={`city-service-row city-service-row-${tone}`}
	                    id={eventAnchorId(event.id)}
	                    key={event.id}
	                  >
                    <span className="city-service-dot" aria-hidden="true" />
                    <div className="city-service-main">
                      <div>
                        <time>{formatCompactTime(event.starts_at, language, tKey, timezone)}</time>
                        <strong>{localizedContent(language, event.title, event.title_zh)}</strong>
                        <p>{localizedContent(language, event.body, event.body_zh)}</p>
                      </div>
                      <em>{enumLabel(event.severity)}</em>
                    </div>
                    <div className="city-service-meta">
                      <span>{eventTypeLabel(event.category_key, language)}</span>
                      <span>{tKey("cityServices.until")} {formatCompactTime(event.ends_at, language, tKey, timezone)}</span>
                    </div>
                  </article>
                );
              })
            ) : (
              category.sources.map((source) => (
                <article
                  className={`city-service-row city-service-row-${toneFromStatus(source.operational_status)}`}
                  key={source.id}
                >
                  <span className="city-service-dot" aria-hidden="true" />
                  <div className="city-service-main">
                    <div>
                      <time>{translateEnumLabel(language, source.stage ?? "planned")}</time>
                      <strong>{source.source_name}</strong>
                      <p>{sourceDatasetLabel(source.datasets, tKey)}</p>
                    </div>
                    <em>{source.source_code}</em>
                  </div>
                  <div className="city-service-meta">
                    <span>{Math.round(source.poll_interval_seconds / 60)} min {tKey("cityServices.poll")}</span>
                    <span>
                      {source.records_ingested !== null
                        ? `${formatNumber(source.records_ingested)} ${tKey("cityServices.records")}`
                        : tKey("cityServices.notCollected")}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <div className="city-side-grid">
          <article className="city-glass-panel city-source-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "data_sources",
                  label: "Catalog Sources",
                  language,
                })}
              >
                {tKey("cityServices.catalogSources")}
              </DataLabelWithHelp>
              <strong>{category.sources.length}</strong>
            </header>
            <div className="city-source-stack">
              {category.sources.map((source) => (
                <article className={`city-source-row city-source-row-${toneFromStatus(source.operational_status)}`} key={source.id}>
                  <div>
                    <strong>{source.source_name}</strong>
                    <span>{source.source_code}</span>
                  </div>
                  <p>{source.license_label ? dataLabel(source.license_label) : tKey("cityServices.licenseUnavailable")}</p>
                  {source.documentation_url ? (
                    <a href={source.documentation_url} rel="noreferrer" target="_blank">
                      {tKey("cityServices.documentation")}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </article>

          <article className="city-glass-panel city-coverage-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "catalog_coverage",
                  label: "Coverage Lattice",
                  language,
                })}
              >
                {tKey("cityServices.coverageLattice")}
              </DataLabelWithHelp>
              <strong>{CITY_SERVICE_FIELDS.length}</strong>
            </header>
            <div className="city-coverage-grid">
              {CITY_SERVICE_FIELDS.map((field) => (
                <article key={field.key}>
                  <span>{tKey(`cityServices.${field.ownerKey}`)}</span>
                  <strong>{tKey(`cityServices.${field.labelKey}`)}</strong>
                  <p>{tKey(`cityServices.${field.detailKey}`)}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="city-glass-panel city-event-model-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "normalized_event",
                  label: "Event Model",
                  language,
                })}
              >
                {tKey("cityServices.eventModel")}
              </DataLabelWithHelp>
              <strong>{eventModels.length || visualizations.length}</strong>
            </header>
            <div>
              {(eventModels.length > 0
                ? eventModels.map((model) => ({
                    key: model.key,
                    title: eventTypeLabel(model.event_type, language),
                    detail: model.description,
                    status: model.validity_window
                  }))
                : visualizations.map((visualization) => ({
                    key: visualization.id,
                    title: visualization.title,
                    detail: visualization.description,
                    status: visualization.status
                  }))
              ).slice(0, 4).map((model) => (
                <article className={`city-model-row city-model-row-${toneFromStatus(model.status)}`} key={model.key}>
                  <div>
                    <strong>{model.title}</strong>
                    <span>{translateEnumLabel(language, model.status)}</span>
                  </div>
                  <p>{model.detail}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="city-visual-grid" aria-label={tKey("cityServices.visualizationsAria")}>
        {visualizations
          .filter((v) => v.type === "bar" || v.type === "gauge")
          .map((visualization) => {
            const points = visualization.data.points ?? [];
            const maxValue = Math.max(1, ...points.map((point) => point.value));
            return (
              <article className={`city-glass-panel city-visual-panel city-visual-panel-${visualization.status}`} key={visualization.id}>
              <header>
                <div>
                  <span>{visualization.type}</span>
                  <h3>{visualization.title}</h3>
                </div>
                <strong>{translateEnumLabel(language, visualization.status)}</strong>
              </header>
              <p>{visualization.description}</p>
              <div className="city-visual-bars">
                {points.length > 0 ? (
                  points.map((point) => (
                    <article className={`city-visual-row city-visual-row-${point.tone ?? "neutral"}`} key={point.label}>
                      <span>{point.label}</span>
                      <i aria-hidden="true">
                        <span
                          style={
                            {
                              "--city-visual-width": `${Math.max(8, (point.value / maxValue) * 100)}%`
                            } as CSSProperties
                          }
                        />
                      </i>
                      <strong>{formatNumber(point.value)}</strong>
                    </article>
                  ))
                ) : (
                  <p>{tKey("cityServices.noChartRows")}</p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="city-provider-status" aria-label={tKey("cityServices.providerStatusAria")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("cityServices.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              hub
            </span>
            {category.source_codes.join(" + ")}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("shell.lastSync")}: {scopedDataAge(isHistorical ? scopedReferenceTime(timeScope) : latestRun, timeScope, language, tKey, "cityServices.notCollected", timezone)}
          </span>
          <i aria-hidden="true" />
          <span className="city-provider-coverage">
            {tKey("cityServices.recordsLabel")}: {recordsDisplay}
          </span>
          <i aria-hidden="true" />
          <span>{tKey("cityServices.events")}: {formatMetricValue(activeEventsMetric, tKey, dataLabel)}</span>
          <i aria-hidden="true" />
          <span>{tKey("cityServices.sourceState")}: {sourceStatusMetric ? translateEnumLabel(language, sourceStatusMetric.value) : tKey("cityServices.missing")}</span>
        </div>
      </section>

      <p className="city-detail-freshness">
        {localizedPlatformCopy(category.description, language) ?? tKey("cityServices.signalsUnavailable")}
      </p>
    </section>
  );
}
