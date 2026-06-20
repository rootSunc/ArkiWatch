"use client";

import { categoryKeyDataItems } from "./category-metadata";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { localizedPlatformCopy } from "./platform-copy";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint,
  SourceDatasetStructure
} from "./types";
import type { PlatformTimeScope } from "./types";
import { isEmptyStatus } from "./platform-status";
import { pollIntervalLabel } from "./energy-workspace-utils";
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
type GeoFieldSignalKey = "vector" | "raster" | "attribute" | "index" | "model";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

type GeoShapeRow = {
  key: string;
  label: string;
  count: number;
  tone: GeoTone;
  width: number;
};

const SUMMARY_KEYS = [
  "catalog_stage",
  "source_status",
  "records_ingested",
  "active_events"
];

const FIELD_ICONS: Record<string, string> = {
  address: "location_on",
  building: "domain",
  district: "map",
  parcel: "grid_on",
  geometry: "polyline",
  planning_area: "architecture",
  terrain_model: "terrain"
};

const FIELD_SIGNAL_COLUMNS: Array<{ key: GeoFieldSignalKey; labelKey: string }> = [
  { key: "vector", labelKey: "vector" },
  { key: "raster", labelKey: "raster" },
  { key: "attribute", labelKey: "attribute" },
  { key: "index", labelKey: "index" },
  { key: "model", labelKey: "model" }
];

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
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

function metricTone(metric: PanelMetric | null): GeoTone {
  return metric ? (metric.tone as GeoTone) : "neutral";
}

function progressFromTone(tone: GeoTone): number {
  if (tone === "good") {
    return 92;
  }
  if (tone === "warn") {
    return 62;
  }
  if (tone === "bad") {
    return 24;
  }
  return 48;
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
    return 36;
  }

  const value = numericValue(metric.value);
  if (value === null) {
    return progressFromTone(metricTone(metric));
  }

  return Math.max(12, Math.min(100, value));
}

function schemaShapeTone(shape: string): GeoTone {
  if (shape === "geospatial_layer" || shape === "feature_collection") {
    return "good";
  }
  if (shape === "catalog" || shape === "service_directory") {
    return "neutral";
  }
  return "warn";
}

function schemaShapeRows(datasets: SourceDatasetStructure[], language: LanguageMode): GeoShapeRow[] {
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
    width: count > 0 ? Math.max(16, (count / maxCount) * 100) : 0
  }));
}

function fieldSignalKeys(field: string): GeoFieldSignalKey[] {
  if (field === "geometry") {
    return ["vector", "model"];
  }
  if (field === "building") {
    return ["vector", "attribute", "model"];
  }
  if (field === "address") {
    return ["attribute", "index"];
  }
  if (field === "district") {
    return ["vector", "attribute"];
  }
  if (field === "parcel") {
    return ["vector", "attribute", "index"];
  }
  if (field === "planning_area") {
    return ["vector", "raster", "attribute"];
  }
  if (field === "terrain_model") {
    return ["raster", "model"];
  }
  return ["attribute"];
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
  if (category.stage === "planned" || category.stage === "background") {
    return translateEnumLabel(language, "mapped");
  }
  return translateEnumLabel(language, category.stage ?? "catalog");
}

export function GeospatialWorkspace({ category, timeScope }: GeospatialWorkspaceProps) {
  const { language, tKey, dataLabel, dataItemLabel, metricLabel } = useI18n();
  if (!category || isEmptyStatus(category.status)) {
    return (
      <WorkspaceEmptyState
        className="water-detail-empty"
        description={tKey("geospatial.metadataMissing")}
        eyebrow={tKey("geospatial.regionalContext")}
        title={tKey("geospatial.signalsUnavailable")}
      />
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const catalogStageMetric = metricByKey(category, "catalog_stage");
  const summaryMetrics = visibleSummaryMetrics(category);
  const keyDataItems = categoryKeyDataItems(category);
  const datasets = category.sources.flatMap((s) => s.data_structures ?? []);
  const readySources = category.sources.filter((s) => statusTone(s.operational_status) === "good").length;
  const catalogOnly = isCatalogOnlyWorkspace(category);
  
  const shapeRows = schemaShapeRows(datasets, language);
  const activeTone = statusTone(category.status);
  const historicalEvidence = isHistoricalEvidenceScope(category, timeScope);
  const fieldState = historicalEvidence ? tKey("shell.historicalEvidence") : fieldStateLabel(category, language);

  const totalDatasetsCount = category.sources.reduce((total, s) => total + (s.datasets?.length ?? 0), 0);
  const totalRecordsCount = category.sources.reduce((total, s) => total + (s.records_ingested ?? 0), 0);
  const hasObservedRecords = hasObservedSourceRecords(category.sources);
  const datasetCount = totalDatasetsCount || datasets.length;
  const datasetCountLabel = datasetCount > 0 ? String(datasetCount) : tKey("geospatial.notObserved");

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    null;
  const sourceCadence = catalogOnly
    ? tKey("geospatial.syncNotConfigured")
    : pollIntervalLabel(
        Math.min(...category.sources.map((source) => source.poll_interval_seconds)),
        tKey,
      );
  const sourceLicense =
    [...new Set(category.sources.map((source) => source.license_label).filter(Boolean))].join(" · ") ||
    tKey("geospatial.licenseNotReported");
  const sourceRegisterLabel =
    category.sources.map((source) => source.source_name).join(" · ") ||
    tKey("geospatial.catalogOnlyDetail");
  const sourceDocumentation = category.sources.filter((source) => source.documentation_url);

  const heroTitle = catalogOnly ? tKey("geospatial.catalogOnlyTitle") : tKey("geospatial.heroTitle");
  const heroDetail = catalogOnly
    ? tKey("geospatial.catalogOnlyDetail")
    : localizedPlatformCopy(category.description, language) ?? tKey("geospatial.layersMapped");

  const signalMetrics = [
    activeEventsMetric,
    sourceStatusMetric,
    recordsMetric,
    catalogStageMetric
  ].filter(isPlatformMetric);

  const densityVis = category.visualizations.find((v) => v.id === "geospatial-feature-density");
  const catalogCoverageVis = category.visualizations.find(
    (v) => v.id === "geospatial-catalog-coverage"
  );
  const topographicDensityPoints: PlatformVisualizationPoint[] = (
    (densityVis?.data?.points as PlatformVisualizationPoint[] | undefined) ??
    (catalogCoverageVis?.data?.points as PlatformVisualizationPoint[] | undefined) ??
    []
  );

  const maxDensityValue = Math.max(1, ...topographicDensityPoints.map((item) => item.value));

  return (
    <section className="water-detail-page" aria-label={tKey("geospatial.detailAria")}>
      <WorkspaceEvidenceHeader
        className="water-detail-header"
        fallbackKey="geospatial.notObserved"
        language={language}
        observedAt={historicalEvidence ? scopedReferenceTime(timeScope) : sourceUpdatedAt}
        sourceLabel={category.source_codes.length > 0 ? category.source_codes.join(" + ").toUpperCase() : tKey("geospatial.catalog")}
        status={historicalEvidence ? tKey("shell.historicalEvidence") : translateEnumLabel(language, category.status)}
        statusTone={activeTone}
        tKey={tKey}
        timeScope={historicalEvidence ? timeScope : null}
        title={tKey("geospatial.title")}
      />

      <section className="water-bento-grid" aria-label={tKey("geospatial.operatingCondition")}>
        <article className={`water-glass-panel water-hero water-hero-${activeTone}`}>
          <div className="water-card-kicker">
            <span>{tKey("geospatial.contextState")}</span>
            <time>{historicalEvidence ? tKey("shell.historicalEvidence") : catalogOnly ? tKey("geospatial.catalog") : translateEnumLabel(language, category.stage ?? "background")}</time>
          </div>
          <div className="water-current-cluster">
            <span className="material-symbols-outlined water-condition-icon" aria-hidden="true">
              map
            </span>
            <div>
              <strong>{heroTitle}</strong>
              <p>{heroDetail}</p>
            </div>
          </div>
          <div className="water-hero-footer">
            <div>
              <span>{tKey("geospatial.datasets")}</span>
              <strong>{datasetCountLabel}</strong>
            </div>
            <div>
              <span>{tKey("geospatial.ingestionSync")}</span>
              <strong>{sourceCadence}</strong>
            </div>
          </div>
        </article>

        <article className="water-glass-panel water-coverage-panel">
          <header>
            <span>{tKey("geospatial.sourceReadiness")}</span>
            <strong>{catalogOnly ? tKey("geospatial.notConfigured") : `${readySources}/${category.sources.length}`}</strong>
          </header>
          <div className="water-coverage-list">
            {category.sources.map((source) => {
              const tone = statusTone(source.operational_status);
              return (
                <article className={`water-coverage-row water-coverage-row-${tone}`} key={source.id}>
                  <div>
                    <strong>{source.source_name}</strong>
                    <span>{source.source_code.toUpperCase()} · {translateEnumLabel(language, source.operational_status)}</span>
                  </div>
                  <i aria-hidden="true">
                    <span style={{ width: `${progressFromTone(tone)}%` }} />
                  </i>
                </article>
              );
            })}
          </div>
        </article>

        <article className="water-glass-panel water-field-panel">
          <header>
            <span>{tKey("geospatial.trackedFields")}</span>
            <strong>{keyDataItems.length}</strong>
          </header>
          <div className="water-field-grid">
            {keyDataItems.map((field) => (
              <article key={field.key}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {FIELD_ICONS[field.key] ?? "database"}
                </span>
                <div>
                  <strong>{dataItemLabel(field)}</strong>
                  <small>{fieldState}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="water-field-lattice" aria-label={tKey("geospatial.fieldLattice")}>
            <div className="water-field-lattice-head">
              <span>{tKey("geospatial.feature")}</span>
              {FIELD_SIGNAL_COLUMNS.map((column) => (
                <span key={column.key}>{tKey(`geospatial.${column.labelKey}`)}</span>
              ))}
            </div>
            {keyDataItems.map((field) => {
              const activeSignals = fieldSignalKeys(field.key);

              return (
                <div className="water-field-lattice-row geo-field-lattice-row" key={field.key}>
                  <strong>{dataItemLabel(field)}</strong>
                  {FIELD_SIGNAL_COLUMNS.map((column) => (
                    <i
                      aria-label={`${dataItemLabel(field)} ${tKey(`geospatial.${column.labelKey}`)}`}
                      className={`geo-field-lattice-dot ${activeSignals.includes(column.key) ? "active" : ""}`}
                      key={column.key}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="water-summary-strip" aria-label={tKey("geospatial.summaryMetrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`water-glass-panel water-summary-${metricTone(metric)}`} key={metric.key}>
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
                ? tKey("geospatial.notObserved")
                : formatMetricValue(metric, tKey, dataLabel)}
            </strong>
          </article>
        ))}
      </section>

      <section className="water-main-grid" aria-label={tKey("geospatial.platformAnalytics")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{tKey("geospatial.layerComposition")}</span>
              <h3>{catalogOnly ? tKey("geospatial.catalogOnlyDetail") : tKey("geospatial.layerCompositionLead")}</h3>
            </div>
            <strong>{signalMetrics.length} {tKey("geospatial.metrics")}</strong>
          </header>

          {shapeRows.length > 0 ? (
            <div className="water-schema-shape-bars" aria-label={tKey("geospatial.datasetShapeDistribution")}>
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
                        {requiredFieldCount}/{dataset.fields.length} {tKey("geospatial.requiredFields")}
                      </span>
                      <i aria-hidden="true">
                        <span style={{ width: `${Math.max(8, (requiredFieldCount / fieldTotal) * 100)}%` }} />
                      </i>
                    </div>
                    <div className="water-schema-field-strip" aria-label={tKey("geospatial.fieldRequirementLattice")}>
                      {dataset.fields.slice(0, 10).map((field) => (
                        <span
                          aria-label={`${field.label}: ${field.required ? tKey("geospatial.required") : tKey("geospatial.optional")}`}
                          className={field.required ? "required" : undefined}
                          key={field.key}
                          title={`${field.label}: ${field.required ? tKey("geospatial.required") : tKey("geospatial.optional")}`}
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
              category.sources.map((src) => (
                <article className="water-schema-card" key={src.id}>
                  <div>
                    <strong>{src.source_name} Layers</strong>
                    <span>{translateEnumLabel(language, src.stage ?? "planned")}</span>
                  </div>
                  <p>{src.source_code === "nls" ? tKey("geospatial.nlsLayerDescription") : tKey("geospatial.helsinkiLayerDescription")}</p>
                  <div className="water-schema-fields">
                    {src.datasets?.map((ds) => (
                      <span key={ds}>{dataLabel(ds)}</span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="water-signal-list">
            {signalMetrics.map((metric) => (
              <article className={`water-signal water-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{metricLabel(metric)}</strong>
                  <span>
                    {metric.key === "records_ingested" && !hasObservedRecords
                      ? tKey("geospatial.notObserved")
                      : formatMetricValue(metric, tKey, dataLabel)}
                  </span>
                </div>
                <p>{metric.detail ?? tKey("geospatial.signalMappedBackground")}</p>
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
              <span>{tKey("geospatial.sourcePanelTitle")}</span>
                  <strong>{historicalEvidence ? tKey("shell.historicalEvidence") : translateEnumLabel(language, category.stage ?? "background")}</strong>
            </header>
            <div className="water-source-facts">
              <span>{datasetCountLabel} {tKey("geospatial.datasetsLower")}</span>
                  <span>{sourceCadence}</span>
                  <span>{sourceLicense}</span>
                </div>
            <p>{catalogOnly ? tKey("geospatial.catalogOnlyDetail") : sourceRegisterLabel}</p>
            {sourceDocumentation.map((source) => (
              <a href={source.documentation_url ?? undefined} key={source.id} rel="noreferrer" target="_blank">
                {source.source_name}
              </a>
            ))}
          </article>

          <article className="water-glass-panel water-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Ingested Layers Volume",
                  language,
                })}
              >
                {tKey("geospatial.ingestedLayersVolume")}
              </DataLabelWithHelp>
              <strong>{catalogOnly ? tKey("geospatial.notConfigured") : category.sources.length}</strong>
            </header>
            <div>
              {category.sources.length > 0 ? category.sources.map((src) => (
                <article className={`water-volume-row water-volume-row-${statusTone(src.operational_status)}`} key={src.id}>
                  <div>
                    <strong>{src.source_code.toUpperCase()}</strong>
                    <span>{translateEnumLabel(language, src.operational_status)}</span>
                  </div>
                  <em>{src.records_ingested !== null ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(src.records_ingested) : translateEnumLabel(language, "planned")}</em>
                  <span className="water-volume-meter" aria-hidden="true">
                    <span style={{ width: `${src.records_ingested ? Math.min(100, Math.max(12, (src.records_ingested / 500000) * 100)) : 0}%` }} />
                  </span>
                </article>
              )) : <span>{tKey("geospatial.noConnectedSources")}</span>}
            </div>
          </article>

          <article className="water-glass-panel water-event-panel">
            <header>
              <span>{tKey("geospatial.topographicFeatureDensity")}</span>
              <strong>{topographicDensityPoints.length}</strong>
            </header>
            <div className="water-guidance-grid" aria-label={tKey("geospatial.topographicDensityLayers")} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
              {topographicDensityPoints.map((row) => (
                <article className={`water-guidance-row water-guidance-row-${row.tone} geo-density-row`} key={row.label}>
                  <div className="geo-density-row-header">
                    <strong>{dataLabel(row.label)}</strong>
                    <span>{new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(row.value)}</span>
                  </div>
                  <div className="geo-density-progress-track">
                    <span
                      className={`geo-density-progress-bar ${row.tone === "good" ? "good" : row.tone === "warn" ? "warn" : "primary"}`}
                      style={{
                        width: `${(row.value / maxDensityValue) * 100}%`
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="water-provider-status" aria-label={tKey("geospatial.providerStatusAria")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("geospatial.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              hub
            </span>
            {category.source_codes.length > 0 ? category.source_codes.join(" + ") : tKey("geospatial.catalog")}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("geospatial.ingestionSync")}: {sourceCadence}
          </span>
          <i aria-hidden="true" />
          <span className="water-provider-coverage">
            {tKey("geospatial.records")}: {totalRecordsCount ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(totalRecordsCount) : catalogOnly ? tKey("geospatial.notObserved") : tKey("geospatial.planned")}
          </span>
        </div>
      </section>
    </section>
  );
}
