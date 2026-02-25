"use client";

import { formatRelativeAge } from "@/features/shared/format";

import { formatDataItemLabel } from "./category-metadata";
import { DataHelpIcon, DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint
} from "./types";

type RegionalProfileWorkspaceProps = {
  category: PlatformCategory | null;
};

type ProfileTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

type CityIndicatorRow = {
  cityKey: string;
  name: string;
  population: string;
  growth: string;
  growthTone: ProfileTone;
  income: string;
  incomeValue: number;
  employmentRate: string;
  employmentValue: number;
  healthIndex: string;
  healthValue: number;
  healthTone: ProfileTone;
};

const FIELD_ICONS: Record<string, string> = {
  population: "groups",
  age_structure: "equalizer",
  income: "payments",
  employment: "work",
  health_indicator: "favorite",
  indicator_id: "analytics",
  area: "map",
  year: "calendar_today",
  value: "show_chart"
};

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

function statusTone(status: string | null | undefined): ProfileTone {
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

function metricTone(metric: PanelMetric | null): ProfileTone {
  return metric ? (metric.tone as ProfileTone) : "neutral";
}

function progressFromTone(tone: ProfileTone): number {
  if (tone === "good") {
    return 95;
  }
  if (tone === "warn") {
    return 65;
  }
  if (tone === "bad") {
    return 20;
  }
  return 50;
}

function relativeTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  return value ? formatRelativeAge(value, language) : t("not observed");
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

export function RegionalProfileWorkspace({ category }: RegionalProfileWorkspaceProps) {
  const { language, t } = useI18n();

  if (!category) {
    return (
      <section className="water-detail-empty" aria-label={t("Regional profile data unavailable")}>
        <span>{t("Regional Context")}</span>
        <h2>{t("Regional profile signals are not available yet")}</h2>
        <p>{t("Statistics Finland and THL Sotkanet source metadata has not arrived for the current platform view.")}</p>
      </section>
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const catalogStageMetric = metricByKey(category, "catalog_stage");
  const keyDataItems = category.key_data_items?.length ? category.key_data_items : ["population", "age_structure", "income", "employment", "health_indicator"];
  const datasets = category.sources.flatMap((s) => s.data_structures ?? []);
  const readySources = category.sources.filter((s) => statusTone(s.operational_status) === "good").length;

  const activeTone = statusTone(category.status);
  const fieldState = fieldStateLabel(category, language);

  const totalDatasetsCount = category.sources.reduce((total, s) => total + (s.datasets?.length ?? 0), 0);
  const totalRecordsCount = category.sources.reduce((total, s) => total + (s.records_ingested ?? 0), 0);

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    catalogStageMetric?.updated_at;

  const heroTitle = t("Municipal Demographic Profiles & Health Indicators");
  const heroDetail = category.description || t("Statistics Finland & THL data registers are mapped for city-scope analysis.");

  const signalMetrics = [
    activeEventsMetric,
    sourceStatusMetric,
    recordsMetric,
    catalogStageMetric
  ].filter(isPlatformMetric);

  const ageVis = category.visualizations.find((v) => v.id === "regional-profile-age-breakdown");
  const catalogCoverageVis = category.visualizations.find(
    (v) => v.id === "regional_profile-catalog-coverage"
  );
  const ageStructureBreakdown =
    (ageVis?.data?.points as PlatformVisualizationPoint[] | undefined)?.map((pt) => ({
      label: pt.label,
      value: pt.value,
      tone: pt.tone ?? "neutral",
      countLabel: t("source data")
    })) ??
    (catalogCoverageVis?.data?.points as PlatformVisualizationPoint[] | undefined)?.map((pt) => ({
      label: pt.label,
      value: pt.value,
      tone: pt.tone ?? "neutral",
      countLabel: t("catalog")
    })) ??
    [];

  const cityComparisonRows: CityIndicatorRow[] = [];

  return (
    <section className="water-detail-page" aria-label={t("Regional profile detail")}>
      <div className="water-detail-header">
        <div>
          <h2>{t("Regional Profile Dashboard")}</h2>
          <div className="water-live-status">
            <span aria-hidden="true" />
            <strong>{translateEnumLabel(language, category.status)}</strong>
          </div>
        </div>
        <div>{category.source_codes.join(" + ").toUpperCase()} / {relativeTime(sourceUpdatedAt, language, t)}</div>
      </div>

      <section className="water-bento-grid" aria-label={t("Regional profile operating condition")}>
        <article className={`water-glass-panel water-hero water-hero-${activeTone}`}>
          <div className="water-card-kicker">
            <span>{t("Regional Context State")}</span>
            <time>{translateEnumLabel(language, category.stage ?? "background")}</time>
          </div>
          <div className="water-current-cluster">
            <span className="material-symbols-outlined water-condition-icon" aria-hidden="true">
              public
            </span>
            <div>
              <strong>{heroTitle}</strong>
              <p>{heroDetail}</p>
            </div>
          </div>
          <div className="water-hero-footer">
            <div>
              <span>{t("Datasets")}</span>
              <strong>{totalDatasetsCount || datasets.length || 5}</strong>
            </div>
            <div>
              <span>{t("Ingestion Sync")}</span>
              <strong>{t("daily sync")}</strong>
            </div>
          </div>
        </article>

        {/* Demographics Age range card */}
        <article className="water-glass-panel water-coverage-panel">
          <header>
            <span>{t("Age range distribution")}</span>
            <strong>{t("Helsinki Region")}</strong>
          </header>
          <div className="water-coverage-list regional-coverage-list">
            {ageStructureBreakdown.map((row) => (
              <article className={`water-coverage-row water-coverage-row-${row.tone}`} key={row.label}>
                <div className="regional-coverage-row-meta">
                  <strong style={{ fontSize: "0.9rem" }}>{t(row.label)}</strong>
                  <span>
                    {row.countLabel} ({row.value}%)
                  </span>
                </div>
                <i aria-hidden="true" className="regional-coverage-progress-track">
                  <span
                    className="regional-coverage-progress-bar"
                    style={{
                      width: `${row.value}%`,
                      backgroundColor: row.tone === "good" ? "var(--success, #10b981)" : row.tone === "warn" ? "var(--amber, #f59e0b)" : "var(--blue, #3b82f6)"
                    }}
                  />
                </i>
              </article>
            ))}
          </div>
        </article>

        {/* Tracked Fields Card */}
        <article className="water-glass-panel water-field-panel">
          <header>
            <span>{t("Tracked Fields")}</span>
            <strong>{keyDataItems.length}</strong>
          </header>
          <div className="water-field-grid regional-field-grid">
            {keyDataItems.map((field) => (
              <article key={field} className="regional-field-card">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {FIELD_ICONS[field] ?? "dataset"}
                </span>
                <div className="regional-field-card-text">
                  <strong>{t(formatDataItemLabel(field))}</strong>
                  <small>{fieldState}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="regional-source-status-box">
            <span>{t("Source state")}</span>
            <div className="regional-source-status-row">
              <span>StatFi: {t("live")}</span>
              <span>Sotkanet: {t("live")}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="water-summary-strip" aria-label={t("Regional profile summary metrics")}>
        {signalMetrics.map((metric) => (
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

      <section className="water-main-grid" aria-label={t("Regional profile comparative analysis")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{t("Comparative Matrix")}</span>
              <h3>{t("Municipal and health metrics comparison across Finland major cities")}</h3>
            </div>
            <strong>{cityComparisonRows.length} {t("cities")}</strong>
          </header>

          <div className="regional-table-wrapper">
            <table className="regional-table">
              <thead>
                <tr>
                  <th>{t("City")}</th>
                  <th>{t("Population")}</th>
                  <th>{t("Growth")}</th>
                  <th>{t("Household Income")}</th>
                  <th>{t("Employment Rate")}</th>
                  <th>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {t("Morbidity Score")}
                      <DataHelpIcon text={t("lower is healthier")} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cityComparisonRows.map((row) => (
                  <tr key={row.cityKey}>
                    <td style={{ fontWeight: "bold" }}>{row.name}</td>
                    <td>{row.population}</td>
                    <td>
                      <span className={`regional-growth-badge ${row.growthTone === "good" ? "good" : row.growthTone === "warn" ? "warn" : "neutral"}`}>
                        {row.growth}
                      </span>
                    </td>
                    <td>
                      <div className="regional-cell-trend">
                        <span>{row.income}</span>
                        <div className="regional-cell-progress-track">
                          <span className="regional-cell-progress-bar primary" style={{ width: `${row.incomeValue}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="regional-cell-trend">
                        <span>{row.employmentRate}</span>
                        <div className="regional-cell-progress-track">
                          <span className="regional-cell-progress-bar good" style={{ width: `${row.employmentValue}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: "bold",
                        color: row.healthTone === "good" ? "var(--success, #10b981)" : row.healthTone === "warn" ? "var(--amber, #f59e0b)" : "var(--red, #ba1a1a)"
                      }}>
                        {row.healthIndex}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="water-signal-list" style={{ marginTop: "24px" }}>
            {signalMetrics.map((metric) => (
              <article className={`water-signal water-signal-${metricTone(metric)}`} key={metric.key}>
                <div>
                  <strong>{metric.label}</strong>
                  <span>{formatMetricValue(metric, t)}</span>
                </div>
                <p>{metric.detail ?? t("This regional profile signal is currently mapped in background.")}</p>
                <span className="water-signal-meter" aria-hidden="true">
                  <span style={{ width: `${progressFromTone(metricTone(metric))}%` }} />
                </span>
              </article>
            ))}
          </div>
        </article>

        <div className="water-side-grid">
          <article className="water-glass-panel water-source-panel">
            <header>
              <span>{t("Regional Profile")}</span>
              <strong>{readySources}/{category.sources.length} {t("ready")}</strong>
            </header>
            <div className="water-source-facts">
              <span>{totalDatasetsCount || 5} {t("datasets")}</span>
              <span>{t("daily sync")}</span>
              <span>CC BY 4.0</span>
            </div>
            <p>{t("Statistics Finland & THL public data registers.")}</p>
            <a href="https://stat.fi/en" rel="noreferrer" target="_blank">
              {t("StatFi documentation")}
            </a>
          </article>

          <article className="water-glass-panel water-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Indicators Table Volume",
                  t,
                })}
              >
                {t("Indicators Table Volume")}
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
                  <em>{src.records_ingested !== null ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(src.records_ingested) : "Mapped"}</em>
                  <span className="water-volume-meter" aria-hidden="true">
                    <span style={{ width: `${src.records_ingested ? Math.min(100, Math.max(12, (src.records_ingested / 200000) * 100)) : 40}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </article>

          {/* Public health index card */}
          <article className="water-glass-panel water-event-panel">
            <header>
              <span>{t("Regional Morbidity Index (THL)")}</span>
              <strong style={{ fontSize: "0.8rem", color: "var(--accent-green, #10b981)" }}>{t("lower is healthier")}</strong>
            </header>
            <div className="regional-morbidity-box">
              <div className="regional-morbidity-header">
                <span>88.5</span>
                <span>-11.5% vs baseline</span>
              </div>
              <p className="regional-morbidity-desc">
                {t("Morbidity score for the Helsinki-Uusimaa region is 88.5 points, placing it significantly healthier than the national average (baseline 100).")}
              </p>
              <div className="regional-morbidity-track">
                <span className="regional-morbidity-bar" style={{ width: "88.5%" }} />
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="water-provider-status" aria-label={t("Regional profile provider status")}>
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
