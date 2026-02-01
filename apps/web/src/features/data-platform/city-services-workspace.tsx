"use client";

import type { CSSProperties } from "react";

import { formatRelativeAge, formatTimestamp, severityTone } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  PlatformTone
} from "./types";
import { eventAnchorId } from "./recent-events";

type CityServicesWorkspaceProps = {
  category: PlatformCategory | null;
};

type CityTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type ServiceField = {
  key: string;
  label: string;
  owner: string;
  detail: string;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";

const SUMMARY_KEYS = [
  "source_status",
  "catalog_stage",
  "records_ingested",
  "active_events"
];

const CITY_SERVICE_FIELDS: ServiceField[] = [
  {
    key: "service_location",
    label: "Service location",
    owner: "Service Map",
    detail: "Units, coordinates, and municipal service metadata"
  },
  {
    key: "opening_hours",
    label: "Opening hours",
    owner: "Service Map",
    detail: "Daily availability and exception schedules"
  },
  {
    key: "temporary_closure",
    label: "Temporary closures",
    owner: "Service Map",
    detail: "Closure windows and facility availability"
  },
  {
    key: "accessibility",
    label: "Accessibility",
    owner: "Service Map",
    detail: "Access attributes for service-unit matching"
  }
];

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

function formatMetricValue(metric: PlatformMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("missing");
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCompactTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  if (!value) {
    return t("not scheduled");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(new Date(value))
    .toUpperCase();
}

function relativeTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not collected");
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
  if (!category.key_data_items?.includes(field.key)) {
    return translateEnumLabel(language, "Planned");
  }

  if (category.events.some((event) => event.body.toLowerCase().includes(field.key.replaceAll("_", " ")))) {
    return translateEnumLabel(language, "Live");
  }

  return translateEnumLabel(language, "Mapped");
}

function sourceDatasetLabel(datasets: string[] | undefined, t: (value: string) => string): string {
  if (!datasets || datasets.length === 0) {
    return t("dataset catalog pending");
  }

  return datasets.map((dataset) => dataset.replaceAll("_", " ")).join(", ");
}

function eventTypeLabel(value: string, language: LanguageMode): string {
  return translateEnumLabel(language, value);
}

export function CityServicesWorkspace({ category }: CityServicesWorkspaceProps) {
  const { language, t } = useI18n();

  if (!category) {
    return (
      <section className="city-detail-empty" aria-label={t("City services data unavailable")}>
        <span>{t("City Services")}</span>
        <h2>{t("City service signals are not available yet")}</h2>
        <p>{t("Service Map and HRI metadata are not present in this platform view.")}</p>
      </section>
    );
  }

  const summaryMetrics = visibleSummaryMetrics(category);
  const latest = latestEvent(category);
  const activeEventsMetric = metricByKey(category, "active_events");
  const recordsMetric = metricByKey(category, "records_ingested");
  const sourceStatusMetric = metricByKey(category, "source_status");
  const datasetCount = totalDatasets(category);
  const recordCount = totalRecords(category);
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

  return (
    <section className="city-detail-page" aria-label={t("City services detail")}>
      <div className="city-detail-header">
        <div>
          <h2>{t("City Services Dashboard")}</h2>
          <div className="city-live-status">
            <span aria-hidden="true" />
            <strong>{translateEnumLabel(language, category.status)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(", ").toUpperCase()} / {relativeTime(latestRun ?? latest?.starts_at, language, t)}</div>
      </div>

      <section className="city-bento-grid" aria-label={t("City service operating condition")}>
        <article className={`city-glass-panel city-hero city-hero-${cityTone}`}>
          <div className="city-card-kicker">
            <span>{t("Service Coverage")}</span>
            <time>{formatTimestamp(latestRun ?? latest?.starts_at ?? null, "dateTime", language)}</time>
          </div>
          <div className="city-current-cluster">
            <span className="material-symbols-outlined city-condition-icon" aria-hidden="true">
              {latest ? "event_available" : "location_city"}
            </span>
            <div>
              <strong>{category.sources.length}</strong>
              <p>
                {latest?.body ??
                  t("Service Map and HRI are staged for public-service context.")}
              </p>
            </div>
          </div>
          <div className="city-hero-footer">
            <div>
              <span>{t("Datasets")}</span>
              <strong>{datasetCount}</strong>
            </div>
            <div>
              <span>{t("Key fields")}</span>
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
                t,
              })}
            >
              {t("Source Readiness")}
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
                t,
              })}
            >
              {t("Service Model")}
            </DataLabelWithHelp>
            <strong>{fieldCount}</strong>
          </header>
          <div className="city-field-grid">
            {CITY_SERVICE_FIELDS.map((field) => (
              <article key={field.key}>
                <span>{t(field.label)}</span>
                <strong>{fieldStatus(category, field, language)}</strong>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="city-summary-strip" aria-label={t("City service summary metrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`city-glass-panel city-summary-${metricTone(metric)}`} key={metric.key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: metric.key,
                label: metric.label,
                detail: metric.detail,
                t,
              })}
            >
              {t(metric.label)}
            </DataLabelWithHelp>
            <strong>{formatMetricValue(metric, t)}</strong>
          </article>
        ))}
      </section>

      <section className="city-main-grid" aria-label={t("City service analytics")}>
        <article className="city-glass-panel city-service-panel">
          <header>
            <div>
              <span>{t("Service Operations")}</span>
              <h3>{t("Public facilities and availability signals")}</h3>
            </div>
            <strong>{category.events.length || category.sources.length} {t("rows")}</strong>
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
                        <time>{formatCompactTime(event.starts_at, language, t)}</time>
                        <strong>{event.title}</strong>
                        <p>{event.body}</p>
                      </div>
                      <em>{t(event.severity.toUpperCase())}</em>
                    </div>
                    <div className="city-service-meta">
                      <span>{eventTypeLabel(event.category_key, language)}</span>
                      <span>{t("until")} {formatCompactTime(event.ends_at, language, t)}</span>
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
                      <p>{sourceDatasetLabel(source.datasets, t)}</p>
                    </div>
                    <em>{source.source_code}</em>
                  </div>
                  <div className="city-service-meta">
                    <span>{Math.round(source.poll_interval_seconds / 60)} min {t("poll")}</span>
                    <span>{source.records_ingested ?? 0} {t("records")}</span>
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
                  t,
                })}
              >
                {t("Catalog Sources")}
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
                  <p>{source.license_label ?? t("license unavailable")}</p>
                  {source.documentation_url ? (
                    <a href={source.documentation_url} rel="noreferrer" target="_blank">
                      {t("Documentation")}
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
                  t,
                })}
              >
                {t("Coverage Lattice")}
              </DataLabelWithHelp>
              <strong>{CITY_SERVICE_FIELDS.length}</strong>
            </header>
            <div className="city-coverage-grid">
              {CITY_SERVICE_FIELDS.map((field) => (
                <article key={field.key}>
                  <span>{t(field.owner)}</span>
                  <strong>{t(field.label)}</strong>
                  <p>{t(field.detail)}</p>
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
                  t,
                })}
              >
                {t("Event Model")}
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

      <section className="city-visual-grid" aria-label={t("City service data visualizations")}>
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
                  <p>{t("No chart rows have been produced for this city service signal.")}</p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="city-provider-status" aria-label={t("City service provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
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
            {t("Last Sync")}: {relativeTime(latestRun, language, t)}
          </span>
          <i aria-hidden="true" />
          <span className="city-provider-coverage">
            {t("Records")}: {formatMetricValue(recordsMetric, t) !== t("missing") ? formatMetricValue(recordsMetric, t) : formatNumber(recordCount)}
          </span>
          <i aria-hidden="true" />
          <span>{t("Events")}: {formatMetricValue(activeEventsMetric, t)}</span>
          <i aria-hidden="true" />
          <span>{t("Source state")}: {formatMetricValue(sourceStatusMetric, t)}</span>
        </div>
      </section>

      <p className="city-detail-freshness">{category.description}</p>
    </section>
  );
}
