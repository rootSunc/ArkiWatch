"use client";

import { formatRelativeAge, severityTone } from "@/features/shared/format";

import { formatDataItemLabel } from "./category-metadata";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint,
  PlatformVisualizationTimelineItem
} from "./types";

type WaterSnowWorkspaceProps = {
  category: PlatformCategory | null;
};

type WaterTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

const SUMMARY_KEYS = [
  "catalog_stage",
  "source_status",
  "active_events",
  "records_ingested"
];

const FIELD_ICONS: Record<string, string> = {
  discharge: "waves",
  flood_warning: "flood",
  groundwater: "opacity",
  snow_water_equivalent: "cloudy_snowing",
  water_level: "water_drop"
};

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function formatMetricValue(metric: PanelMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("missing");
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function statusTone(status: string | null | undefined): WaterTone {
  if (status === "healthy" || status === "ready" || status === "fetched" || status === "connected") {
    return "good";
  }
  if (status === "pending" || status === "planned" || status === "stale" || status === "watch") {
    return "warn";
  }
  if (status === "alert" || status === "failing" || status === "failed" || status === "inactive") {
    return "bad";
  }
  return "neutral";
}

function metricTone(metric: PanelMetric | null): WaterTone {
  return metric ? (metric.tone as WaterTone) : "neutral";
}

function eventTone(event: Pick<PlatformEvent | PlatformVisualizationTimelineItem, "severity">): WaterTone {
  return severityTone(event.severity) as WaterTone;
}

function progressFromTone(tone: WaterTone): number {
  if (tone === "good") {
    return 84;
  }
  if (tone === "warn") {
    return 48;
  }
  if (tone === "bad") {
    return 18;
  }
  return 58;
}

function numericValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricProgress(metric: PanelMetric | null): number {
  if (!metric) {
    return 18;
  }

  const value = numericValue(metric.value);
  if (value === null) {
    return progressFromTone(metricTone(metric));
  }

  return Math.max(8, Math.min(100, value));
}

function relativeTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not observed");
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
    timeZone: "Europe/Helsinki"
  })
    .format(new Date(value))
    .toUpperCase();
}

function pollIntervalLabel(seconds: number | null | undefined, t: (value: string) => string): string {
  if (!seconds) {
    return t("cadence missing");
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }

  return `${Math.round(seconds / 3600)} h`;
}

function latestEvent(category: PlatformCategory): PlatformEvent | null {
  return (
    [...category.events]
      .sort((left, right) => new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime())
      .find((event) => event.category_key === "water") ?? null
  );
}

function timelineItems(category: PlatformCategory): PlatformVisualizationTimelineItem[] {
  const timeline = category.visualizations.find((item) => item.id === "water-event-timeline");
  return timeline?.data.items ?? [];
}

function severityPoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const severity = category.visualizations.find((item) => item.id === "water-severity-distribution");
  return severity?.data.points ?? [];
}

function sourceVolumePoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const volume = category.visualizations.find((item) => item.id === "water-source-volume");
  return volume?.data.points ?? [];
}

function catalogCoveragePoints(category: PlatformCategory): PlatformVisualizationPoint[] {
  const coverage = category.visualizations.find((item) => item.id === "water-catalog-coverage");
  return coverage?.data.points ?? [];
}

function pointWidth(point: PlatformVisualizationPoint, points: PlatformVisualizationPoint[]): number {
  const maxValue = Math.max(1, ...points.map((item) => item.value));
  return Math.max(8, Math.min(100, (point.value / maxValue) * 100));
}

function sourceStatusLabel(category: PlatformCategory, language: LanguageMode): string {
  const source = category.sources[0];
  return translateEnumLabel(language, source?.operational_status ?? category.status);
}

function sourceStageLabel(category: PlatformCategory, language: LanguageMode): string {
  const source = category.sources[0];
  return translateEnumLabel(language, source?.stage ?? category.stage ?? category.status);
}

function visibleSummaryMetrics(category: PlatformCategory): PanelMetric[] {
  const preferred = SUMMARY_KEYS.map((key) => metricByKey(category, key)).filter(isPlatformMetric);
  const fallback = category.summary_metrics.filter((metric) => !SUMMARY_KEYS.includes(metric.key));

  return [...preferred, ...fallback].slice(0, 5);
}

function fieldStateLabel(category: PlatformCategory, language: LanguageMode): string {
  if (category.stage === "connected") {
    return translateEnumLabel(language, "live");
  }
  if (category.stage === "planned") {
    return translateEnumLabel(language, "mapped");
  }
  return translateEnumLabel(language, category.stage ?? "catalog");
}

export function WaterSnowWorkspace({ category }: WaterSnowWorkspaceProps) {
  const { language, t } = useI18n();

  if (!category) {
    return (
      <section className="water-detail-empty" aria-label={t("Water and snow data unavailable")}>
        <span>{t("Water & Snow")}</span>
        <h2>{t("Hydrology signals are not available yet")}</h2>
        <p>{t("SYKE and Flood Centre source metadata has not arrived for the current platform view.")}</p>
      </section>
    );
  }

  const source = category.sources[0] ?? null;
  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const catalogStageMetric = metricByKey(category, "catalog_stage");
  const summaryMetrics = visibleSummaryMetrics(category);
  const keyDataItems = category.key_data_items ?? [];
  const datasets = source?.data_structures ?? [];
  const eventSchemas = source?.normalized_event_structures ?? [];
  const events = category.events;
  const latest = latestEvent(category);
  const timeline = timelineItems(category);
  const sourcePoints = sourceVolumePoints(category);
  const severityRows = severityPoints(category);
  const coverageRows = catalogCoveragePoints(category);
  const sourceRows =
    sourcePoints.length > 0
      ? sourcePoints
      : category.sources.map((item) => ({
          label: item.source_code,
          value: item.records_ingested ?? 0,
          tone: statusTone(item.operational_status),
          detail: item.operational_status
        }));
  const activeTone =
    events.some((event) => event.severity === "HIGH")
      ? "bad"
      : events.some((event) => event.severity === "MEDIUM")
        ? "warn"
        : statusTone(source?.stage ?? category.stage ?? category.status);
  const fieldState = fieldStateLabel(category, language);
  const providerName = source?.source_name ?? "Finnish Environment Institute";
  const datasetCount = source?.datasets?.length ?? datasets.length;
  const sourceUpdatedAt =
    source?.last_run_finished_at ??
    source?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    catalogStageMetric?.updated_at;
  const heroTitle =
    latest?.title ??
    (category.stage === "connected" ? t("Hydrology feed active") : t("Hydrology source mapped"));
  const heroDetail =
    latest?.body ??
    category.description ??
    t("Water level, discharge, groundwater, snow-water equivalent, and flood context are ready for ingestion.");
  const signalMetrics = [
    activeEventsMetric,
    sourceStatusMetric,
    recordsMetric,
    catalogStageMetric
  ].filter(isPlatformMetric);

  return (
    <section className="water-detail-page" aria-label={t("Water and snow detail")}>
      <div className="water-detail-header">
        <div>
          <h2>{t("Water & Snow Hydrology")}</h2>
          <div className="water-live-status">
            <span aria-hidden="true" />
            <strong>{sourceStatusLabel(category, language)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(", ").toUpperCase()} / {relativeTime(sourceUpdatedAt, language, t)}</div>
      </div>

      <section className="water-bento-grid" aria-label={t("Water and snow operating condition")}>
        <article className={`water-glass-panel water-hero water-hero-${activeTone}`}>
          <div className="water-card-kicker">
            <span>{t("Hydrology Signal State")}</span>
            <time>{sourceStageLabel(category, language)}</time>
          </div>
          <div className="water-current-cluster">
            <span className="material-symbols-outlined water-condition-icon" aria-hidden="true">
              {activeTone === "bad" ? "flood" : activeTone === "good" ? "water_drop" : "cloudy_snowing"}
            </span>
            <div>
              <strong>{heroTitle}</strong>
              <p>{heroDetail}</p>
            </div>
          </div>
          <div className="water-hero-footer">
            <div>
              <span>{t("Datasets")}</span>
              <strong>{datasetCount}</strong>
            </div>
            <div>
              <span>{t("Cadence")}</span>
              <strong>{pollIntervalLabel(source?.poll_interval_seconds, t)}</strong>
            </div>
          </div>
        </article>

        <article className="water-glass-panel water-coverage-panel">
          <header>
            <span>{t("Catalog Coverage")}</span>
            <strong>{coverageRows.length || 3}</strong>
          </header>
          <div className="water-coverage-list">
            {(coverageRows.length > 0
              ? coverageRows
              : [
                  { label: "Sources", value: category.source_codes.length, tone: "neutral" },
                  { label: "Datasets", value: datasetCount, tone: "neutral" },
                  { label: "Key fields", value: keyDataItems.length, tone: "neutral" }
                ]).map((point) => (
              <article className={`water-coverage-row water-coverage-row-${point.tone ?? "neutral"}`} key={point.label}>
                <div>
                  <strong>{t(point.label)}</strong>
                  <span>{point.value} {t("items")}</span>
                </div>
                <i aria-hidden="true">
                  <span style={{ width: `${pointWidth(point, coverageRows.length > 0 ? coverageRows : [point])}%` }} />
                </i>
              </article>
            ))}
          </div>
        </article>

        <article className="water-glass-panel water-field-panel">
          <header>
            <span>{t("Tracked Fields")}</span>
            <strong>{keyDataItems.length}</strong>
          </header>
          <div className="water-field-grid">
            {keyDataItems.map((field) => (
              <article key={field}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {FIELD_ICONS[field] ?? "dataset"}
                </span>
                <div>
                  <strong>{t(formatDataItemLabel(field))}</strong>
                  <small>{fieldState}</small>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="water-summary-strip" aria-label={t("Water and snow summary metrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`water-glass-panel water-summary-${metricTone(metric)}`} key={metric.key}>
            <span>{t(metric.label)}</span>
            <strong>{formatMetricValue(metric, t)}</strong>
          </article>
        ))}
      </section>

      <section className="water-main-grid" aria-label={t("Water and snow platform analytics")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{t("Hydrology Signal Stack")}</span>
              <h3>{t("Source schema, event readiness, and collection state")}</h3>
            </div>
            <strong>{signalMetrics.length} {t("metrics")}</strong>
          </header>

          <div className="water-schema-grid">
            {datasets.length > 0 ? (
              datasets.map((dataset) => (
                <article className="water-schema-card" key={dataset.dataset}>
                  <div>
                    <strong>{dataset.label}</strong>
                    <span>{dataset.shape.replaceAll("_", " ")}</span>
                  </div>
                  <p>{dataset.spatial_grain} · {dataset.cadence}</p>
                  <div className="water-schema-fields">
                    {dataset.fields.slice(0, 4).map((field) => (
                      <span key={field.key}>{field.label}</span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <article className="water-schema-card">
                  <div>
                    <strong>Hydrology schema</strong>
                  <span>{translateEnumLabel(language, category.stage ?? "planned")}</span>
                </div>
                <p>{t("Station, catchment, flood-context, and snow-water fields are mapped in the catalog.")}</p>
                <div className="water-schema-fields">
                  {keyDataItems.slice(0, 4).map((field) => (
                    <span key={field}>{t(formatDataItemLabel(field))}</span>
                  ))}
                </div>
              </article>
            )}
          </div>

          <div className="water-signal-list">
            {signalMetrics.map((metric) => (
              <article className={`water-signal water-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{metric.label}</strong>
                  <span>{formatMetricValue(metric, t)}</span>
                </div>
                <p>{metric.detail ?? t("This signal has not produced a platform metric yet.")}</p>
                <span className="water-signal-meter" aria-hidden="true">
                  <span style={{ width: `${metricProgress(metric)}%` }} />
                </span>
              </article>
            ))}
          </div>
        </article>

        <div className="water-side-grid">
          <article className="water-glass-panel water-source-panel">
            <header>
              <span>{t("SYKE Source")}</span>
              <strong>{sourceStageLabel(category, language)}</strong>
            </header>
            <div className="water-source-facts">
              <span>{datasetCount} {t("datasets")}</span>
              <span>{pollIntervalLabel(source?.poll_interval_seconds, t)} {t("poll")}</span>
              <span>{source?.license_label ?? t("Open data")}</span>
            </div>
            <p>{providerName}</p>
            {source?.documentation_url ? (
              <a href={source.documentation_url} rel="noreferrer" target="_blank">
                {t("Open data documentation")}
              </a>
            ) : null}
          </article>

          <article className="water-glass-panel water-volume-panel">
            <header>
              <span>{t("Collection Volume")}</span>
              <strong>{sourceRows.length}</strong>
            </header>
            <div>
              {sourceRows.map((point) => (
                <article className={`water-volume-row water-volume-row-${point.tone ?? "neutral"}`} key={point.label}>
                  <div>
                    <strong>{point.label}</strong>
                    <span>{point.detail ? translateEnumLabel(language, point.detail) : t("records")}</span>
                  </div>
                  <em>{point.value}</em>
                  <span className="water-volume-meter" aria-hidden="true">
                    <span style={{ width: `${pointWidth(point, sourceRows)}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </article>

          <article className="water-glass-panel water-event-panel">
            <header>
              <span>{t("Event Readiness")}</span>
              <strong>{events.length}</strong>
            </header>
            {timeline.length > 0 ? (
              <div className="water-event-list">
                {timeline.map((item) => (
                  <article className={`water-event water-event-${eventTone(item)}`} key={item.id}>
                    <span className="water-event-dot" aria-hidden="true" />
                    <div>
                      <time>{formatCompactTime(item.starts_at, language, t)}</time>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="water-severity-bars">
                {severityRows.map((row) => (
                  <article className={`water-severity-row water-severity-row-${row.tone ?? "neutral"}`} key={row.label}>
                    <span>{row.label}</span>
                    <i aria-hidden="true">
                      <span style={{ width: `${Math.max(8, Math.min(100, row.value * 25))}%` }} />
                    </i>
                    <strong>{row.value}</strong>
                  </article>
                ))}
                {eventSchemas.length > 0 ? (
                  <p>{eventSchemas.length} {t("normalized event schema(s) mapped for water guidance.")}</p>
                ) : (
                  <p>{t("Flood, drought, snow-load, and algae event types are reserved for the SYKE integration.")}</p>
                )}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="water-provider-status" aria-label={t("Water and snow provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {providerName}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {relativeTime(sourceUpdatedAt, language, t)}
          </span>
          <i aria-hidden="true" />
          <span className="water-provider-stage">{sourceStageLabel(category, language)}</span>
        </div>
      </section>

      <p className="water-detail-freshness">{category.description}</p>
    </section>
  );
}
