"use client";

import type { SourceDatasetStructure } from "@/features/public-dashboard/types";
import { formatRelativeAge } from "@/features/shared/format";

import { formatDataItemLabel } from "./category-metadata";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint
} from "./types";

type GeospatialWorkspaceProps = {
  category: PlatformCategory | null;
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

const FIELD_SIGNAL_COLUMNS: Array<{ key: GeoFieldSignalKey; label: string }> = [
  { key: "vector", label: "Vector" },
  { key: "raster", label: "Raster" },
  { key: "attribute", label: "Attribute" },
  { key: "index", label: "Index" },
  { key: "model", label: "Model" }
];

function isPlatformMetric(metric: PlatformMetric | null): metric is PlatformMetric {
  return metric !== null;
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function formatMetricValue(metric: PanelMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("catalog");
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
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

function relativeTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not observed");
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

export function GeospatialWorkspace({ category }: GeospatialWorkspaceProps) {
  const { language, t } = useI18n();

  if (!category) {
    return (
      <section className="water-detail-empty" aria-label={t("Geospatial data unavailable")}>
        <span>{t("Regional Context")}</span>
        <h2>{t("Geospatial signals are not available yet")}</h2>
        <p>{t("NLS and Helsinki city geodata source metadata has not arrived for the current platform view.")}</p>
      </section>
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const catalogStageMetric = metricByKey(category, "catalog_stage");
  const summaryMetrics = visibleSummaryMetrics(category);
  const keyDataItems = category.key_data_items?.length ? category.key_data_items : ["address", "building", "district", "parcel", "geometry"];
  const datasets = category.sources.flatMap((s) => s.data_structures ?? []);
  const readySources = category.sources.filter((s) => statusTone(s.operational_status) === "good").length;
  
  const shapeRows = schemaShapeRows(datasets, language);
  const activeTone = statusTone(category.status);
  const fieldState = fieldStateLabel(category, language);

  const totalDatasetsCount = category.sources.reduce((total, s) => total + (s.datasets?.length ?? 0), 0);
  const totalRecordsCount = category.sources.reduce((total, s) => total + (s.records_ingested ?? 0), 0);

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    catalogStageMetric?.updated_at;

  const heroTitle = t("Topographic & Planning layers ready");
  const heroDetail = category.description || t("National Land Survey and Helsinki geodata layers are mapped for city-scope analysis.");

  const signalMetrics = [
    activeEventsMetric,
    sourceStatusMetric,
    recordsMetric,
    catalogStageMetric
  ].filter(isPlatformMetric);

  // High premium visual mock metrics for geospatial density maps
  const densityVis = category.visualizations.find((v) => v.id === "geospatial-feature-density");
  const topographicDensityPoints: PlatformVisualizationPoint[] = (densityVis?.data?.points as PlatformVisualizationPoint[]) ?? [
    { label: "Building Footprints", value: 384102, tone: "good" },
    { label: "Addresses Lattice", value: 195420, tone: "good" },
    { label: "Cadastral Parcels", value: 124801, tone: "neutral" },
    { label: "Districts & Sub-districts", value: 890, tone: "good" },
    { label: "Detailed Planning Polygons", value: 5802, tone: "warn" }
  ];

  const maxDensityValue = Math.max(1, ...topographicDensityPoints.map((item) => item.value));

  return (
    <section className="water-detail-page" aria-label={t("Geospatial detail")}>
      <div className="water-detail-header">
        <div>
          <h2>{t("Geospatial Base")}</h2>
          <div className="water-live-status">
            <span aria-hidden="true" />
            <strong>{translateEnumLabel(language, category.status)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(" + ").toUpperCase()} / {relativeTime(sourceUpdatedAt, language, t)}</div>
      </div>

      <section className="water-bento-grid" aria-label={t("Geospatial operating condition")}>
        <article className={`water-glass-panel water-hero water-hero-${activeTone}`}>
          <div className="water-card-kicker">
            <span>{t("Regional Context State")}</span>
            <time>{translateEnumLabel(language, category.stage ?? "background")}</time>
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
              <span>{t("Datasets")}</span>
              <strong>{totalDatasetsCount || datasets.length || 9}</strong>
            </div>
            <div>
              <span>{t("Ingestion Sync")}</span>
              <strong>{t("daily")}</strong>
            </div>
          </div>
        </article>

        <article className="water-glass-panel water-coverage-panel">
          <header>
            <span>{t("Source Readiness")}</span>
            <strong>{readySources}/{category.sources.length}</strong>
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

          <div className="water-field-lattice" aria-label={t("Geospatial field lattice")}>
            <div className="water-field-lattice-head">
              <span>{t("Feature")}</span>
              {FIELD_SIGNAL_COLUMNS.map((column) => (
                <span key={column.key}>{t(column.label)}</span>
              ))}
            </div>
            {keyDataItems.map((field) => {
              const activeSignals = fieldSignalKeys(field);

              return (
                <div className="water-field-lattice-row geo-field-lattice-row" key={field}>
                  <strong>{t(formatDataItemLabel(field))}</strong>
                  {FIELD_SIGNAL_COLUMNS.map((column) => (
                    <i
                      aria-label={`${t(formatDataItemLabel(field))} ${t(column.label)}`}
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

      <section className="water-summary-strip" aria-label={t("Geospatial summary metrics")}>
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

      <section className="water-main-grid" aria-label={t("Geospatial platform analytics")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{t("Geospatial Layer Composition")}</span>
              <h3>{t("OGC Features, WFS Layers, and topographic records")}</h3>
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
              category.sources.map((src) => (
                <article className="water-schema-card" key={src.id}>
                  <div>
                    <strong>{src.source_name} Layers</strong>
                    <span>{translateEnumLabel(language, src.stage ?? "planned")}</span>
                  </div>
                  <p>{src.source_code === "nls" ? t("Topographic, address, and parcel spatial boundaries.") : t("Detailed buildings, district profiles, planning zones, and nature maps.")}</p>
                  <div className="water-schema-fields">
                    {src.datasets?.map((ds) => (
                      <span key={ds}>{t(ds)}</span>
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
                  <strong>{metric.label}</strong>
                  <span>{formatMetricValue(metric, t)}</span>
                </div>
                <p>{metric.detail ?? t("This geospatial signal is currently mapped in background.")}</p>
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
              <span>{t("Regional Profile")}</span>
              <strong>{translateEnumLabel(language, category.stage ?? "background")}</strong>
            </header>
            <div className="water-source-facts">
              <span>{totalDatasetsCount || 9} {t("datasets")}</span>
              <span>{t("daily sync")}</span>
              <span>CC BY 4.0</span>
            </div>
            <p>{t("National Land Survey & Helsinki public data registers.")}</p>
            <a href="https://www.maanmittauslaitos.fi/en" rel="noreferrer" target="_blank">
              {t("NLS documentation")}
            </a>
          </article>

          <article className="water-glass-panel water-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Ingested Layers Volume",
                  t,
                })}
              >
                {t("Ingested Layers Volume")}
              </DataLabelWithHelp>
              <strong>{category.sources.length}</strong>
            </header>
            <div>
              {category.sources.map((src) => (
                <article className={`water-volume-row water-volume-row-${statusTone(src.operational_status)}`} key={src.id}>
                  <div>
                    <strong>{src.source_code.toUpperCase()}</strong>
                    <span>{translateEnumLabel(language, src.operational_status)}</span>
                  </div>
                  <em>{src.records_ingested !== null ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(src.records_ingested) : "Planned"}</em>
                  <span className="water-volume-meter" aria-hidden="true">
                    <span style={{ width: `${src.records_ingested ? Math.min(100, Math.max(12, (src.records_ingested / 500000) * 100)) : 24}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </article>

          {/* Premium mockup topographic density metric panel */}
          <article className="water-glass-panel water-event-panel">
            <header>
              <span>{t("Topographical Feature Density")}</span>
              <strong>{topographicDensityPoints.length}</strong>
            </header>
            <div className="water-guidance-grid" aria-label={t("Topographic density layers")} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
              {topographicDensityPoints.map((row) => (
                <article className={`water-guidance-row water-guidance-row-${row.tone} geo-density-row`} key={row.label}>
                  <div className="geo-density-row-header">
                    <strong>{t(row.label)}</strong>
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

      <section className="water-provider-status" aria-label={t("Geospatial provider status")}>
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
            {t("Ingestion Sync")}: {t("daily")}
          </span>
          <i aria-hidden="true" />
          <span className="water-provider-coverage">
            {t("Records")}: {totalRecordsCount ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(totalRecordsCount) : t("planned")}
          </span>
        </div>
      </section>
    </section>
  );
}
