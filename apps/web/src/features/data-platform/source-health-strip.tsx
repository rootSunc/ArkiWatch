import { useState } from "react";

import { useI18n } from "./i18n";
import { healthySourceCount, isCatalogOnlySource, isSourceTrackedForHealth, sourceHealthTone } from "./source-health";
import { PlatformOverviewResponse } from "./types";
import { scopedDataAge } from "./data-time-scope";

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
  const catalogSourceCount = overview.sources.filter(isCatalogOnlySource).length;
  const healthyCount = healthySourceCount(overview.sources);
  const issueCount = trackedSources.length - healthyCount;

  return (
    <section
      className={
        isExpanded
          ? "source-health-panel source-health-panel-expanded"
          : "source-health-panel"
      }
      aria-label={tKey("shell.sourceHealth")}
    >
      {!isExpanded && hasSources ? (
        <button
          className="source-health-summary"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            hub
          </span>
          <span>
            {trackedSources.length} {tKey("shell.dataSources")}
            {" · "}
            {healthyCount} {tKey("shell.healthyCount")}
            {issueCount > 0 ? ` · ${issueCount} ${tKey("shell.needAttentionShort")}` : ""}
            {catalogSourceCount > 0 ? ` · ${catalogSourceCount} ${tKey("shell.catalogOnlySources")}` : ""}
          </span>
          <span className="material-symbols-outlined source-health-chevron" aria-hidden="true">
            expand_more
          </span>
        </button>
      ) : null}

      {isExpanded ? (
        <div className="source-health-strip">
          {overview.sources.map((source) => (
            <article
              aria-label={`${source.source_name} · ${isCatalogOnlySource(source) ? tKey("shell.catalogOnlySources") : enumLabel(source.operational_status)}`}
              className={`source-chip source-chip-${isCatalogOnlySource(source) ? "unknown" : sourceHealthTone(source.operational_status)}`}
              key={source.id}
            >
              <span className="source-chip-code">{source.source_code}</span>
              <strong>
                {isCatalogOnlySource(source)
                  ? tKey("shell.catalogOnlySources")
                  : enumLabel(source.operational_status)}
              </strong>
              <small className="source-chip-age">
                {scopedDataAge(
                  source.last_run_finished_at ?? source.last_run_started_at,
                  overview.time_scope,
                  language,
                  tKey,
                  "shell.notCollected",
                  overview.time_scope?.timezone ?? overview.timezone,
                )}
              </small>
              {source.records_ingested !== null ? (
                <small className="source-chip-records">
                  {source.records_ingested.toLocaleString(language === "zh" ? "zh-CN" : "en-US")} {tKey("shell.records")}
                </small>
              ) : null}
              {source.documentation_url ? (
                <a
                  aria-label={`${source.source_name} · ${tKey("shell.providerDocs")}`}
                  className="source-chip-doc"
                  href={source.documentation_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    open_in_new
                  </span>
                  <span className="source-chip-doc-label">{tKey("shell.providerDocs")}</span>
                </a>
              ) : null}
              {source.error_message ? (
                <small className="source-chip-error">{tKey("shell.collectionError")}</small>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {!hasSources ? (
        <article className="source-chip source-chip-unknown source-health-strip">
          <span>{tKey("shell.sources")}</span>
          <strong>{tKey("shell.unavailable")}</strong>
          <small>{tKey("shell.noCollectorState")}</small>
        </article>
      ) : null}

      {hasSources && isExpanded ? (
        <button
          className="source-health-toggle"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded ? tKey("shell.collapseDataSources") : tKey("shell.showAllDataSources")
          }
          onClick={() => setIsExpanded((current) => !current)}
          title={
            isExpanded ? tKey("shell.collapseDataSources") : tKey("shell.showAllDataSources")
          }
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {isExpanded ? "expand_less" : "expand_more"}
          </span>
        </button>
      ) : null}
    </section>
  );
}
