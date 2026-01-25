"use client";

import type { CSSProperties } from "react";

import type { SourceDatasetStructure, SourceNormalizedEventStructure } from "@/features/public-dashboard/types";
import { formatRelativeAge, severityTone } from "@/features/shared/format";

import { formatDataItemLabel } from "./category-metadata";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
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
type WaterFieldSignalKey = "level" | "flow" | "ground" | "snow" | "risk";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

type WaterShapeRow = {
  key: string;
  label: string;
  count: number;
  tone: WaterTone;
  width: number;
};

type WaterGuidanceRow = {
  key: string;
  label: string;
  icon: string;
  tone: WaterTone;
  status: string;
  width: number;
};

type WaterTimelineBounds = {
  startsAt: number;
  endsAt: number;
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

const FIELD_SIGNAL_COLUMNS: Array<{ key: WaterFieldSignalKey; label: string }> = [
  { key: "level", label: "Level" },
  { key: "flow", label: "Flow" },
  { key: "ground", label: "Ground" },
  { key: "snow", label: "Snow" },
  { key: "risk", label: "Risk" }
];

const GUIDANCE_TYPES = [
  { key: "flood", label: "Flood guidance", icon: "flood" },
  { key: "drought", label: "Drought guidance", icon: "water_drop" },
  { key: "snow", label: "Snow-load guidance", icon: "cloudy_snowing" },
  { key: "algae", label: "Algae guidance", icon: "water" }
];

const MIN_TIMELINE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_TIMELINE_WINDOW_MS = 60 * 60 * 1000;

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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
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

function formatTimelineBoundary(value: number, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

function schemaShapeTone(shape: string): WaterTone {
  if (shape === "timeseries") {
    return "good";
  }
  if (shape === "event_stream") {
    return "warn";
  }
  if (shape === "service_directory") {
    return "neutral";
  }
  return "neutral";
}

function schemaShapeRows(datasets: SourceDatasetStructure[], language: LanguageMode): WaterShapeRow[] {
  const counts = datasets.reduce<Map<string, number>>((accumulator, dataset) => {
    accumulator.set(dataset.shape, (accumulator.get(dataset.shape) ?? 0) + 1);
    return accumulator;
  }, new Map<string, number>());
  const maxCount = Math.max(1, ...counts.values());

  return Array.from(counts.entries()).map(([shape, count]) => ({
    key: shape,
    label: translateEnumLabel(language, shape),
    count,
    tone: schemaShapeTone(shape),
    width: count > 0 ? Math.max(12, (count / maxCount) * 100) : 0
  }));
}

function fieldSignalKeys(field: string): WaterFieldSignalKey[] {
  if (field === "water_level") {
    return ["level", "risk"];
  }
  if (field === "discharge") {
    return ["flow", "risk"];
  }
  if (field === "groundwater") {
    return ["ground", "risk"];
  }
  if (field === "snow_water_equivalent") {
    return ["snow", "risk"];
  }
  if (field === "flood_warning") {
    return ["level", "flow", "risk"];
  }
  return ["risk"];
}

function guidanceRows(eventSchemas: SourceNormalizedEventStructure[], t: (value: string) => string): WaterGuidanceRow[] {
  return GUIDANCE_TYPES.map((guidance) => {
    const isMapped = eventSchemas.some((schema) => {
      const eventType = schema.event_type.toLowerCase();
      return eventType.includes(guidance.key) || schema.description.toLowerCase().includes(guidance.key);
    });

    return {
      key: guidance.key,
      label: t(guidance.label),
      icon: guidance.icon,
      tone: isMapped ? "good" : "neutral",
      status: isMapped ? t("mapped") : t("reserved"),
      width: isMapped ? 100 : 28
    };
  });
}

function timelineBounds(items: PlatformVisualizationTimelineItem[]): WaterTimelineBounds | null {
  if (items.length === 0) {
    return null;
  }

  const times = items.flatMap((item) => {
    const parsedStart = new Date(item.starts_at).getTime();
    const parsedEnd = new Date(item.ends_at).getTime();
    const startsAt = Number.isFinite(parsedStart) ? parsedStart : Date.now();
    const endsAt = Number.isFinite(parsedEnd)
      ? Math.max(startsAt + MIN_TIMELINE_WINDOW_MS, parsedEnd)
      : startsAt + DEFAULT_TIMELINE_WINDOW_MS;

    return [startsAt, endsAt];
  });
  const startsAt = Math.min(...times);
  const endsAt = Math.max(...times);

  if (endsAt <= startsAt) {
    return { startsAt, endsAt: startsAt + DEFAULT_TIMELINE_WINDOW_MS };
  }

  return { startsAt, endsAt };
}

function timelinePercent(value: number, bounds: WaterTimelineBounds): number {
  return clampPercent(((value - bounds.startsAt) / (bounds.endsAt - bounds.startsAt)) * 100);
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
  const shapeRows = schemaShapeRows(datasets, language);
  const waterTimelineBounds = timelineBounds(timeline);
  const waterGuidanceRows = guidanceRows(eventSchemas, t);
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
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "catalog_coverage",
                label: "Catalog Coverage",
                t,
              })}
            >
              {t("Catalog Coverage")}
            </DataLabelWithHelp>
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
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "tracked_fields",
                label: "Tracked Fields",
                t,
              })}
            >
              {t("Tracked Fields")}
            </DataLabelWithHelp>
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
          {keyDataItems.length > 0 ? (
            <div className="water-field-lattice" aria-label={t("Hydrology field matrix")}>
              <div className="water-field-lattice-head">
                <span>{t("Signal")}</span>
                {FIELD_SIGNAL_COLUMNS.map((column) => (
                  <span key={column.key}>{t(column.label)}</span>
                ))}
              </div>
              {keyDataItems.map((field) => {
                const activeSignals = fieldSignalKeys(field);

                return (
                  <div className="water-field-lattice-row" key={field}>
                    <strong>{t(formatDataItemLabel(field))}</strong>
                    {FIELD_SIGNAL_COLUMNS.map((column) => (
                      <i
                        aria-label={`${t(formatDataItemLabel(field))} ${t(column.label)}`}
                        className={activeSignals.includes(column.key) ? "active" : undefined}
                        key={column.key}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      </section>

      <section className="water-summary-strip" aria-label={t("Water and snow summary metrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`water-glass-panel water-summary-${metricTone(metric)}`} key={metric.key}>
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

      <section className="water-main-grid" aria-label={t("Water and snow platform analytics")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{t("Hydrology Signal Stack")}</span>
              <h3>{t("Source schema, event readiness, and collection state")}</h3>
            </div>
            <strong>{signalMetrics.length} {t("metrics")}</strong>
          </header>

          {shapeRows.length > 0 ? (
            <div className="water-schema-shape-bars" aria-label={t("Dataset shape distribution")}>
              {shapeRows.map((row) => (
                <article className={`water-schema-shape-row water-schema-shape-row-${row.tone}`} key={row.key}>
                  <span>{row.label}</span>
                  <i aria-hidden="true">
                    <span style={{ width: `${row.width}%` }} />
                  </i>
                  <strong>{row.count}</strong>
                </article>
              ))}
            </div>
          ) : null}

          <div className="water-schema-grid">
            {datasets.length > 0 ? (
              datasets.map((dataset) => {
                const requiredFieldCount = dataset.fields.filter((field) => field.required).length;
                const fieldTotal = Math.max(1, dataset.fields.length);

                return (
                  <article className="water-schema-card" key={dataset.dataset}>
                    <div>
                      <strong>{dataset.label}</strong>
                      <span>{translateEnumLabel(language, dataset.shape)}</span>
                    </div>
                    <p>{dataset.spatial_grain} · {dataset.cadence}</p>
                    <div className="water-schema-composition">
                      <span>
                        {requiredFieldCount}/{dataset.fields.length} {t("required fields")}
                      </span>
                      <i aria-hidden="true">
                        <span style={{ width: `${Math.max(8, (requiredFieldCount / fieldTotal) * 100)}%` }} />
                      </i>
                    </div>
                    <div className="water-schema-field-strip" aria-label={t("Field requirement lattice")}>
                      {dataset.fields.slice(0, 10).map((field) => (
                        <span
                          aria-label={`${field.label}: ${field.required ? t("required") : t("optional")}`}
                          className={field.required ? "required" : undefined}
                          key={field.key}
                          title={`${field.label}: ${field.required ? t("required") : t("optional")}`}
                        />
                      ))}
                    </div>
                    <div className="water-schema-fields">
                      {dataset.fields.slice(0, 4).map((field) => (
                        <span key={field.key}>{field.label}</span>
                      ))}
                    </div>
                  </article>
                );
              })
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
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Collection Volume",
                  t,
                })}
              >
                {t("Collection Volume")}
              </DataLabelWithHelp>
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
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "event_readiness",
                  label: "Event Readiness",
                  t,
                })}
              >
                {t("Event Readiness")}
              </DataLabelWithHelp>
              <strong>{events.length}</strong>
            </header>
            {timeline.length > 0 ? (
              <>
                {waterTimelineBounds ? (
                  <div className="water-timeband-panel" aria-label={t("Water guidance time windows")}>
                    <header>
                      <span>{t("Time Windows")}</span>
                      <span>
                        {formatTimelineBoundary(waterTimelineBounds.startsAt, language)} -{" "}
                        {formatTimelineBoundary(waterTimelineBounds.endsAt, language)}
                      </span>
                    </header>
                    <div>
                      {timeline.slice(0, 5).map((item) => {
                        const parsedStart = new Date(item.starts_at).getTime();
                        const parsedEnd = new Date(item.ends_at).getTime();
                        const startsAt = Number.isFinite(parsedStart) ? parsedStart : waterTimelineBounds.startsAt;
                        const endsAt = Number.isFinite(parsedEnd)
                          ? Math.max(startsAt + MIN_TIMELINE_WINDOW_MS, parsedEnd)
                          : startsAt + DEFAULT_TIMELINE_WINDOW_MS;
                        const left = timelinePercent(startsAt, waterTimelineBounds);
                        const right = timelinePercent(endsAt, waterTimelineBounds);
                        const bandStyle = {
                          "--timeband-left": `${left}%`,
                          "--timeband-width": `${Math.max(3, right - left)}%`
                        } as CSSProperties;

                        return (
                          <article className={`water-timeband-row water-timeband-row-${eventTone(item)}`} key={item.id}>
                            <span>{formatCompactTime(item.starts_at, language, t)}</span>
                            <i aria-hidden="true">
                              <span style={bandStyle} />
                            </i>
                            <strong>{item.label}</strong>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
              </>
            ) : (
              <div className="water-severity-bars">
                <div className="water-guidance-grid" aria-label={t("Guidance readiness")}>
                  {waterGuidanceRows.map((row) => (
                    <article className={`water-guidance-row water-guidance-row-${row.tone}`} key={row.key}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {row.icon}
                      </span>
                      <div>
                        <strong>{row.label}</strong>
                        <i aria-hidden="true">
                          <span style={{ width: `${row.width}%` }} />
                        </i>
                      </div>
                      <em>{row.status}</em>
                    </article>
                  ))}
                </div>
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
