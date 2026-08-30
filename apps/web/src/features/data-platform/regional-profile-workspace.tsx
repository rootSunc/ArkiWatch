"use client";

import { CITY_OPTIONS, cityLabel } from "./city-scope";
import { categoryKeyDataItems } from "./category-metadata";
import { DataHelpIcon, DataLabelWithHelp, dataHelpText } from "./data-help";
import { localizedPlatformCopy } from "./platform-copy";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformMetric,
  PlatformTone,
  PlatformVisualizationPoint
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

type RegionalProfileWorkspaceProps = {
  category: PlatformCategory | null;
  timeScope?: PlatformTimeScope | null;
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

function formatMetricValue(metric: PanelMetric | null, tKey: (key: string) => string, dataLabel?: (value: string | null | undefined) => string): string {
  if (!metric) {
    return tKey("regionalProfile.catalog");
  }

  return `${dataLabel ? dataLabel(metric.value) : metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
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

function fieldStateLabel(category: PlatformCategory, language: LanguageMode): string {
  if (category.stage === "connected") {
    return translateEnumLabel(language, "live");
  }
  if (category.stage === "planned" || category.stage === "background") {
    return translateEnumLabel(language, "mapped");
  }
  return translateEnumLabel(language, category.stage ?? "catalog");
}

export function RegionalProfileWorkspace({ category, timeScope }: RegionalProfileWorkspaceProps) {
  const { language, tKey, dataLabel, dataItemLabel, metricLabel } = useI18n();
  if (!category || isEmptyStatus(category.status)) {
    return (
      <WorkspaceEmptyState
        className="water-detail-empty"
        description={tKey("regionalProfile.metadataMissing")}
        eyebrow={tKey("regionalProfile.regionalContext")}
        title={tKey("regionalProfile.signalsUnavailable")}
      />
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");
  const recordsMetric = metricByKey(category, "records_ingested");
  const activeEventsMetric = metricByKey(category, "active_events");
  const catalogStageMetric = metricByKey(category, "catalog_stage");
  const keyDataItems = categoryKeyDataItems(category);
  const datasets = category.sources.flatMap((s) => s.data_structures ?? []);
  const readySources = category.sources.filter((s) => statusTone(s.operational_status) === "good").length;
  const catalogOnly = isCatalogOnlyWorkspace(category);

  const activeTone = statusTone(category.status);
  const historicalEvidence = isHistoricalEvidenceScope(category, timeScope);
  const fieldState = historicalEvidence ? tKey("shell.historicalEvidence") : fieldStateLabel(category, language);
  const totalDatasetsCount = category.sources.reduce((total, s) => total + (s.datasets?.length ?? 0), 0);
  const totalRecordsCount = category.sources.reduce((total, s) => total + (s.records_ingested ?? 0), 0);
  const hasObservedRecords = hasObservedSourceRecords(category.sources);
  const datasetCount = totalDatasetsCount || datasets.length;
  const datasetCountLabel = datasetCount > 0 ? String(datasetCount) : tKey("regionalProfile.notObserved");

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    null;
  const sourceCadence = catalogOnly
    ? tKey("regionalProfile.syncNotConfigured")
    : pollIntervalLabel(
        Math.min(...category.sources.map((source) => source.poll_interval_seconds)),
        tKey,
      );
  const sourceLicense =
    [...new Set(category.sources.map((source) => source.license_label).filter(Boolean))].join(" · ") ||
    tKey("regionalProfile.licenseNotReported");
  const sourceRegisterLabel =
    category.sources.map((source) => source.source_name).join(" · ") ||
    tKey("regionalProfile.catalogOnlyDetail");

  const heroTitle = catalogOnly
    ? tKey("regionalProfile.catalogOnlyTitle")
    : tKey("regionalProfile.heroTitle");
  const heroDetail = catalogOnly
    ? tKey("regionalProfile.catalogOnlyDetail")
    : localizedPlatformCopy(category.description, language) ?? tKey("regionalProfile.registersMapped");

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
      countLabel: tKey("regionalProfile.sourceData")
    })) ??
    (catalogCoverageVis?.data?.points as PlatformVisualizationPoint[] | undefined)?.map((pt) => ({
      label: pt.label,
      value: pt.value,
      tone: pt.tone ?? "neutral",
      countLabel: tKey("regionalProfile.catalog")
    })) ??
    [];

  const cityComparisonRows: CityIndicatorRow[] = [];

  return (
    <section className="water-detail-page regional-profile-detail-page" aria-label={tKey("regionalProfile.detailAria")}>
      <WorkspaceEvidenceHeader
        className="water-detail-header catalog-detail-header"
        eyebrow={tKey("shell.dataCatalog")}
        fallbackKey="regionalProfile.notObserved"
        language={language}
        observedAt={historicalEvidence ? scopedReferenceTime(timeScope) : sourceUpdatedAt ?? scopedReferenceTime(timeScope)}
        sourceLabel={category.source_codes.length > 0 ? category.source_codes.join(" + ").toUpperCase() : tKey("regionalProfile.nationalIndicators")}
        status={
          historicalEvidence
            ? tKey("shell.historicalEvidence")
            : tKey("regionalProfile.slowMoving")
        }
        statusTone={activeTone}
        tKey={tKey}
        timeScope={timeScope}
        title={tKey("regionalProfile.dashboardTitle")}
      />

      <section className="regional-summary-strip" aria-label={tKey("regionalProfile.summaryMetrics")}>
        {([
          { key: "population", labelKey: "population", emptyDetailKey: "populationEmpty" },
          { key: "median_income", labelKey: "medianIncome", emptyDetailKey: "incomeEmpty" },
          { key: "employment_rate", labelKey: "employmentRate", emptyDetailKey: "employmentEmpty" },
          { key: "health_index", labelKey: "healthIndex", emptyDetailKey: "healthEmpty" },
        ] as const).map((tile) => {
          const metric = metricByKey(category, tile.key);
          const hasValue = Boolean(metric?.value);

          return (
            <article className={`regional-glass-panel${hasValue ? "" : " geo-tile-text"}`} key={tile.key}>
              <span>{tKey(`regionalProfile.${tile.labelKey}`)}</span>
              <strong>{hasValue ? formatMetricValue(metric, tKey, dataLabel) : tKey("regionalProfile.noValue")}</strong>
              <small>{hasValue && metric?.detail ? metric.detail : tKey(`regionalProfile.${tile.emptyDetailKey}`)}</small>
            </article>
          );
        })}
      </section>

      <section className="regional-indicators" aria-label={tKey("regionalProfile.cityIndicators")}>
        <h2>{tKey("regionalProfile.cityIndicators")}</h2>
        <div className="regional-table-wrapper">
          <table className="regional-table">
            <thead>
              <tr>
                <th>{tKey("regionalProfile.city")}</th>
                <th>{tKey("regionalProfile.population")}</th>
                <th>{tKey("regionalProfile.growth")}</th>
                <th>{tKey("regionalProfile.medianIncome")}</th>
                <th>{tKey("regionalProfile.employment")}</th>
                <th>{tKey("regionalProfile.healthIndex")}</th>
              </tr>
            </thead>
            <tbody>
              {CITY_OPTIONS.map((option) => (
                <tr key={option.value}>
                  <td>{cityLabel(option.value)}</td>
                  <td className="is-empty">{tKey("regionalProfile.noValue")}</td>
                  <td className="is-empty">{tKey("regionalProfile.noValue")}</td>
                  <td className="is-empty">{tKey("regionalProfile.noValue")}</td>
                  <td className="is-empty">{tKey("regionalProfile.noValue")}</td>
                  <td className="is-empty">{tKey("regionalProfile.noValue")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="geo-catalog-note">{tKey("regionalProfile.indicatorsEmpty")}</p>
      </section>

      <section className="water-bento-grid" aria-label={tKey("regionalProfile.operatingCondition")}>
        <article className={`water-glass-panel water-hero water-hero-${activeTone}`}>
          <div className="water-card-kicker">
            <span>{tKey("regionalProfile.contextState")}</span>
            <time>{historicalEvidence ? tKey("shell.historicalEvidence") : catalogOnly ? tKey("regionalProfile.catalog") : translateEnumLabel(language, category.stage ?? "background")}</time>
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
              <span>{tKey("regionalProfile.datasets")}</span>
                <strong>{datasetCountLabel}</strong>
            </div>
            <div>
              <span>{tKey("regionalProfile.ingestionSync")}</span>
              <strong>{sourceCadence}</strong>
            </div>
          </div>
        </article>

        {/* Demographics Age range card */}
        <article className="water-glass-panel water-coverage-panel">
          <header>
            <span>{tKey("regionalProfile.ageRangeDistribution")}</span>
            <strong>{tKey("regionalProfile.helsinkiRegion")}</strong>
          </header>
          <div className="water-coverage-list regional-coverage-list">
            {ageStructureBreakdown.map((row) => (
              <article className={`water-coverage-row water-coverage-row-${row.tone}`} key={row.label}>
                <div className="regional-coverage-row-meta">
                  <strong style={{ fontSize: "0.9rem" }}>{dataLabel(row.label)}</strong>
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
            <span>{tKey("regionalProfile.trackedFields")}</span>
            <strong>{keyDataItems.length}</strong>
          </header>
          <div className="water-field-grid regional-field-grid">
            {keyDataItems.map((field) => (
              <article key={field.key} className="regional-field-card">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {FIELD_ICONS[field.key] ?? "database"}
                </span>
                <div className="regional-field-card-text">
                  <strong>{dataItemLabel(field)}</strong>
                  <small>{fieldState}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="regional-source-status-box">
            <span>{tKey("regionalProfile.sourceState")}</span>
            <div className="regional-source-status-row">
              {category.sources.length > 0 ? category.sources.map((source) => (
                <span key={source.id}>{source.source_name}: {translateEnumLabel(language, source.operational_status)}</span>
              )) : <span>{tKey("regionalProfile.noConnectedSources")}</span>}
            </div>
          </div>
        </article>
      </section>

      <section className="water-summary-strip" aria-label={tKey("regionalProfile.summaryMetrics")}>
        {signalMetrics.map((metric) => (
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
                ? tKey("regionalProfile.notObserved")
                : formatMetricValue(metric, tKey, dataLabel)}
            </strong>
          </article>
        ))}
      </section>

      <section className="water-main-grid" aria-label={tKey("regionalProfile.comparativeAnalysis")}>
        <article className="water-glass-panel water-signal-panel">
          <header>
            <div>
              <span>{tKey("regionalProfile.comparativeMatrix")}</span>
              <h3>{tKey("regionalProfile.comparativeMatrixLead")}</h3>
            </div>
            <strong>{cityComparisonRows.length} {tKey("regionalProfile.cities")}</strong>
          </header>

          <div className="regional-table-wrapper">
            <table className="regional-table">
              <thead>
                <tr>
                  <th>{tKey("regionalProfile.city")}</th>
                  <th>{tKey("regionalProfile.population")}</th>
                  <th>{tKey("regionalProfile.growth")}</th>
                  <th>{tKey("regionalProfile.householdIncome")}</th>
                  <th>{tKey("regionalProfile.employmentRate")}</th>
                  <th>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {tKey("regionalProfile.morbidityScore")}
                      <DataHelpIcon text={tKey("regionalProfile.lowerIsHealthier")} />
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
                  <strong>{metricLabel(metric)}</strong>
                  <span>
                    {metric.key === "records_ingested" && !hasObservedRecords
                      ? tKey("regionalProfile.notObserved")
                      : formatMetricValue(metric, tKey, dataLabel)}
                  </span>
                </div>
                <p>{metric.detail ?? tKey("regionalProfile.signalMappedBackground")}</p>
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
              <span>{tKey("regionalProfile.title")}</span>
              <strong>{catalogOnly ? tKey("regionalProfile.notConfigured") : `${readySources}/${category.sources.length} ${tKey("regionalProfile.ready")}`}</strong>
            </header>
            <div className="water-source-facts">
              <span>{datasetCountLabel} {tKey("regionalProfile.datasetsLower")}</span>
              <span>{sourceCadence}</span>
              <span>{sourceLicense}</span>
            </div>
            <p>{catalogOnly ? tKey("regionalProfile.catalogOnlyDetail") : sourceRegisterLabel}</p>
            {!catalogOnly ? category.sources.filter((source) => source.documentation_url).map((source) => (
              <a href={source.documentation_url ?? undefined} key={source.id} rel="noreferrer" target="_blank">
                {source.source_name}
              </a>
            )) : null}
          </article>

          <article className="water-glass-panel water-volume-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "collection_volume",
                  label: "Indicators Table Volume",
                  language,
                })}
              >
                {tKey("regionalProfile.indicatorsTableVolume")}
              </DataLabelWithHelp>
              <strong>{catalogOnly ? tKey("regionalProfile.notConfigured") : category.sources.length}</strong>
            </header>
            <div>
              {category.sources.length > 0 ? category.sources.map((src) => (
                <article className={`water-volume-row water-volume-row-${statusTone(src.operational_status)}`} key={src.id}>
                  <div>
                    <strong>{src.source_code.toUpperCase()}</strong>
                    <span>{translateEnumLabel(language, src.operational_status)}</span>
                  </div>
                  <em>{src.records_ingested !== null ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(src.records_ingested) : translateEnumLabel(language, "mapped")}</em>
                  <span className="water-volume-meter" aria-hidden="true">
                    <span style={{ width: `${src.records_ingested ? Math.min(100, Math.max(12, (src.records_ingested / 200000) * 100)) : 0}%` }} />
                  </span>
                </article>
              )) : <span>{tKey("regionalProfile.noConnectedSources")}</span>}
            </div>
          </article>

        </div>
      </section>

      <section className="water-provider-status" aria-label={tKey("regionalProfile.providerStatusAria")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("regionalProfile.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              hub
            </span>
            {category.source_codes.length > 0 ? category.source_codes.join(" + ") : tKey("regionalProfile.catalog")}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("regionalProfile.ingestionSync")}: {sourceCadence}
          </span>
          <i aria-hidden="true" />
          <span className="water-provider-coverage">
            {tKey("regionalProfile.records")}: {totalRecordsCount ? new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-GB").format(totalRecordsCount) : catalogOnly ? tKey("regionalProfile.notObserved") : tKey("regionalProfile.planned")}
          </span>
        </div>
      </section>
    </section>
  );
}
