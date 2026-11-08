"use client";

import { CITY_OPTIONS, cityLabel } from "../../model/city-scope";
import { useI18n } from "../../i18n";
import {
  PlatformCategory,
  PlatformMetric
} from "../../types";
import type { PlatformTimeScope } from "../../types";
import { isEmptyStatus } from "../../model/platform-status";
import {
  isHistoricalEvidenceScope,
  scopedReferenceTime,
} from "../../model/data-time-scope";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "../workspace-ui";

type RegionalProfileWorkspaceProps = {
  category: PlatformCategory | null;
  timeScope?: PlatformTimeScope | null;
};

type ProfileTone = "good" | "warn" | "bad" | "neutral";

type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

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

export function RegionalProfileWorkspace({ category, timeScope }: RegionalProfileWorkspaceProps) {
  const { language, tKey, dataLabel } = useI18n();
  if (!category || isEmptyStatus(category.status)) {
    return (
      <WorkspaceEmptyState
        className="water-detail-empty"
        description={tKey("regionalProfile.metadataMissing")}
        eyebrow={tKey("regionalProfile.regionalContext")}
        headingLevel={1}
        title={tKey("regionalProfile.signalsUnavailable")}
      />
    );
  }

  const sourceStatusMetric = metricByKey(category, "source_status");

  const activeTone = statusTone(category.status);
  const historicalEvidence = isHistoricalEvidenceScope(category, timeScope);

  const sourceUpdatedAt =
    category.sources[0]?.last_run_finished_at ??
    category.sources[0]?.last_run_started_at ??
    sourceStatusMetric?.updated_at ??
    null;
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

      <section className="regional-indicators">
        <h2>{tKey("regionalProfile.cityIndicators")}</h2>
        <div
          aria-label={tKey("regionalProfile.cityIndicators")}
          aria-describedby="regional-profile-city-indicators-note"
          className="regional-table-wrapper"
          role="region"
          tabIndex={0}
        >
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
        <p className="geo-catalog-note" id="regional-profile-city-indicators-note">
          {tKey("regionalProfile.indicatorsEmpty")}
        </p>
        <p className="geo-catalog-note">{tKey("regionalProfile.catalogOnlyDetail")}</p>
      </section>

    </section>
  );
}
