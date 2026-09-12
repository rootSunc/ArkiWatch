"use client";

import { MaterialIcon } from "@/features/shared/material-icon";

import { translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformMetric,
  PlatformTone,
  SourceDatasetStructure
} from "./types";
import type { PlatformTimeScope } from "./types";
import { isEmptyStatus } from "./platform-status";
import { hasObservedSourceRecords, isCatalogOnlyWorkspace } from "./catalog-workspace-state";
import {
  isHistoricalEvidenceScope,
  scopedReferenceTime,
} from "./data-time-scope";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "./workspace-ui";

type GeospatialWorkspaceProps = {
  category: PlatformCategory | null;
  timeScope?: PlatformTimeScope | null;
};

type GeoTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

const GEO_SHAPE_KINDS = [
  { key: "vector", labelKey: "shapeVector" },
  { key: "raster", labelKey: "shapeRaster" },
  { key: "attribute", labelKey: "shapeAttribute" },
  { key: "index", labelKey: "shapeIndex" },
] as const;

const GEO_RESOLVED_BY = [
  { key: "air", icon: "air", labelKey: "resolvedAir", kindKey: "vector" },
  { key: "events", icon: "event", labelKey: "resolvedEvents", kindKey: "vector" },
  { key: "city", icon: "location_city", labelKey: "resolvedCity", kindKey: "attribute" },
  { key: "regional", icon: "public", labelKey: "resolvedRegional", kindKey: "vector" },
] as const;

const SHAPE_BUCKET: Record<string, (typeof GEO_SHAPE_KINDS)[number]["key"]> = {
  geospatial_layer: "vector",
  feature_collection: "vector",
  vector: "vector",
  raster: "raster",
  raster_tiles: "raster",
  attribute: "attribute",
  table: "attribute",
  catalog: "attribute",
  service_directory: "attribute",
  spatial_index: "index",
  index: "index",
};

function catalogShapeCounts(datasets: SourceDatasetStructure[]): Record<(typeof GEO_SHAPE_KINDS)[number]["key"], number> {
  const counts = { vector: 0, raster: 0, attribute: 0, index: 0 };

  for (const dataset of datasets) {
    const bucket = SHAPE_BUCKET[dataset.shape];
    if (bucket) {
      counts[bucket] += 1;
    }
  }

  return counts;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function formatMetricValue(metric: PanelMetric | null, tKey: (key: string) => string, dataLabel?: (value: string | null | undefined) => string): string {
  if (!metric) {
    return tKey("geospatial.catalog");
  }

  return `${dataLabel ? dataLabel(metric.value) : metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function statusTone(status: string | null | undefined): GeoTone {
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

export function GeospatialWorkspace({ category, timeScope }: GeospatialWorkspaceProps) {
  const { language, tKey, dataLabel } = useI18n();
  if (!category || isEmptyStatus(category.status)) {
    return (
      <WorkspaceEmptyState
        className="water-detail-empty"
        description={tKey("geospatial.metadataMissing")}
        eyebrow={tKey("geospatial.regionalContext")}
        headingLevel={1}
        title={tKey("geospatial.signalsUnavailable")}
      />
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const datasets = category.sources.flatMap((s) => s.data_structures ?? []);
  const catalogOnly = isCatalogOnlyWorkspace(category);
  const shapeCounts = catalogShapeCounts(datasets);
  const shapeMax = Math.max(1, ...Object.values(shapeCounts));
  const activeTone = statusTone(category.status);
  const historicalEvidence = isHistoricalEvidenceScope(category, timeScope);
  const hasObservedRecords = hasObservedSourceRecords(category.sources);

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    null;
  return (
    <section className="water-detail-page geospatial-detail-page" aria-label={tKey("geospatial.detailAria")}>
      <WorkspaceEvidenceHeader
        className="water-detail-header catalog-detail-header"
        eyebrow={tKey("shell.dataCatalog")}
        fallbackKey="geospatial.notObserved"
        language={language}
        observedAt={historicalEvidence ? scopedReferenceTime(timeScope) : sourceUpdatedAt ?? scopedReferenceTime(timeScope)}
        sourceLabel={category.source_codes.length > 0 ? category.source_codes.join(" + ").toUpperCase() : tKey("geospatial.catalogOnlyLabel")}
        status={
          historicalEvidence
            ? tKey("shell.historicalEvidence")
            : tKey("geospatial.referenceGeometry")
        }
        statusTone={activeTone}
        tKey={tKey}
        timeScope={timeScope}
        title={tKey("geospatial.title")}
      />

      <section className="geo-summary-strip" aria-label={tKey("geospatial.summaryMetrics")}>
        <article className="geo-glass-panel geo-tile-text">
          <span>{tKey("geospatial.catalogStage")}</span>
          <strong>{catalogOnly ? tKey("geospatial.referenceStage") : translateEnumLabel(language, category.stage ?? "background")}</strong>
          <small>{tKey("geospatial.noLiveObservations")}</small>
        </article>
        <article className="geo-glass-panel geo-tile-text">
          <span>{tKey("geospatial.sourceStatus")}</span>
          <strong>
            {sourceStatusMetric
              ? formatMetricValue(sourceStatusMetric, tKey, dataLabel)
              : tKey("geospatial.noValue")}
          </strong>
          <small>{sourceStatusMetric?.detail ?? tKey("geospatial.sourceNotConfigured")}</small>
        </article>
        <article className="geo-glass-panel">
          <span>{tKey("geospatial.recordsIngested")}</span>
          <strong>
            {hasObservedRecords
              ? formatMetricValue(recordsMetric, tKey, dataLabel)
              : tKey("geospatial.noValue")}
          </strong>
          <small>{tKey("geospatial.noGeometryRows")}</small>
        </article>
        <article className="geo-glass-panel">
          <span>{tKey("geospatial.activeEvents")}</span>
          <strong>
            {activeEventsMetric
              ? formatMetricValue(activeEventsMetric, tKey, dataLabel)
              : String(category.events.length)}
          </strong>
          <small>{tKey("geospatial.referenceEmitsNone")}</small>
        </article>
      </section>

      <section className="geo-catalog-grid" aria-label={tKey("geospatial.platformAnalytics")}>
        <div>
          <h2>{tKey("geospatial.datasetShape")}</h2>
          <div className="geo-shape-list">
            {GEO_SHAPE_KINDS.map((kind) => {
              const count = shapeCounts[kind.key];
              const width = count > 0 ? Math.max(16, (count / shapeMax) * 100) : 0;

              return (
                <div className="geo-shape-row" key={kind.key}>
                  <span>{tKey(`geospatial.${kind.labelKey}`)}</span>
                  <i className={`geo-shape-bar${count === 0 ? " is-empty" : ""}`} aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </i>
                  <strong className="geo-shape-count">{count}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h2>{tKey("geospatial.resolvedBy")}</h2>
          <div className="geo-resolved-list">
            {GEO_RESOLVED_BY.map((row) => (
              <div className="geo-resolved-row" key={row.key}>
                <MaterialIcon name={row.icon} />
                <span className="geo-resolved-label">{tKey(`geospatial.${row.labelKey}`)}</span>
                <span className="geo-resolved-kind">{tKey(`geospatial.${row.kindKey}`)}</span>
              </div>
            ))}
          </div>
          <p className="geo-catalog-note">{catalogOnly ? tKey("geospatial.catalogOnlyDetail") : tKey("geospatial.catalogNeverClaimsLive")}</p>
        </div>
      </section>

    </section>
  );
}
