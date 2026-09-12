"use client";

import { useState } from "react";

import { formatTimestamp } from "@/features/shared/format";

import { scopedDataAge } from "./data-time-scope";
import { useI18n } from "./i18n";
import {
  healthySourceCount,
  isCatalogOnlySource,
  isSourceTrackedForHealth,
  sourceHealthTone,
} from "./source-health";
import { PlatformOverviewResponse } from "./types";

type SourceHealthStripProps = {
  overview: PlatformOverviewResponse;
  defaultExpanded?: boolean;
};

export function SourceHealthStrip({
  overview,
  defaultExpanded = false,
}: SourceHealthStripProps) {
  const { language, tKey, enumLabel } = useI18n();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasSources = overview.sources.length > 0;
  const trackedSources = overview.sources.filter(isSourceTrackedForHealth);
  const healthyCount = healthySourceCount(overview.sources);
  const issueCount = trackedSources.length - healthyCount;
  const timezone = overview.time_scope?.timezone ?? overview.timezone;
  const lastProbe = formatTimestamp(overview.checked_at, "time", language, timezone);
  const lead = [
    `${trackedSources.length} ${tKey("shell.dataSources")}`,
    `${healthyCount} ${tKey("shell.healthyCount")}`,
    issueCount > 0 ? `${issueCount} ${tKey("shell.needAttentionShort")}` : null,
    overview.checked_at ? `${tKey("shell.lastProbe")} ${lastProbe}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      className={isExpanded ? "overview-sources overview-sources-open" : "overview-sources"}
      aria-label={tKey("shell.sourceHealth")}
    >
      <button
        aria-expanded={isExpanded}
        className="overview-disclosure"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <span className="overview-catalog-copy">
          <span className="material-symbols-outlined" aria-hidden="true">
            hub
          </span>
          <span>
            <strong>{tKey("shell.trackedSources")}</strong>
            <small>{hasSources ? lead : tKey("shell.noCollectorState")}</small>
          </span>
        </span>
        <span className="overview-catalog-meta">
          <span className="material-symbols-outlined" aria-hidden="true">
            {isExpanded ? "expand_less" : "expand_more"}
          </span>
        </span>
      </button>

      {isExpanded && hasSources ? (
        <div className="source-health-list">
          {overview.sources.map((source) => (
            <article
              aria-label={`${source.source_name} · ${isCatalogOnlySource(source) ? tKey("shell.catalogOnlySources") : enumLabel(source.operational_status)}`}
              className={`source-health-row source-health-row-${isCatalogOnlySource(source) ? "unknown" : sourceHealthTone(source.operational_status)}`}
              key={source.id}
            >
              <span className="source-health-row-code">{source.source_code}</span>
              <strong>
                {isCatalogOnlySource(source)
                  ? tKey("shell.catalogOnlySources")
                  : enumLabel(source.operational_status)}
              </strong>
              <small>
                {scopedDataAge(
                  source.last_run_finished_at ?? source.last_run_started_at,
                  overview.time_scope,
                  language,
                  tKey,
                  "shell.notCollected",
                  timezone,
                )}
              </small>
              {source.documentation_url ? (
                <a
                  aria-label={`${source.source_name} · ${tKey("shell.providerDocs")}`}
                  className="source-health-row-doc"
                  href={source.documentation_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {tKey("shell.providerDocs")}
                </a>
              ) : null}
              {source.error_message ? (
                <small className="source-health-row-error">{tKey("shell.collectionError")}</small>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
