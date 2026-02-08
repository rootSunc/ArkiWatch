import { useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";
import { useI18n } from "./i18n";
import { PlatformOverviewResponse } from "./types";

type SourceHealthStripProps = {
  overview: PlatformOverviewResponse;
  defaultExpanded?: boolean;
};

function healthySourceCount(sources: PlatformOverviewResponse["sources"]): number {
  return sources.filter((source) =>
    ["healthy", "ready", "connected", "fetched"].includes(source.operational_status),
  ).length;
}

export function SourceHealthStrip({
  overview,
  defaultExpanded = false,
}: SourceHealthStripProps) {
  const { language, t, enumLabel } = useI18n();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasSources = overview.sources.length > 0;
  const healthyCount = healthySourceCount(overview.sources);
  const issueCount = overview.sources.length - healthyCount;

  return (
    <section
      className={
        isExpanded
          ? "source-health-panel source-health-panel-expanded"
          : "source-health-panel"
      }
      aria-label={t("Source health")}
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
            {overview.sources.length} {t("data sources")}
            {" · "}
            {healthyCount} {t("healthy")}
            {issueCount > 0 ? ` · ${issueCount} ${t("need attention")}` : ""}
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
              className={`source-chip source-chip-${source.operational_status}`}
              key={source.id}
            >
              <span>{source.source_code}</span>
              <strong>{enumLabel(source.operational_status)}</strong>
              <small>
                {formatRelativeAge(
                  source.last_run_finished_at ?? source.last_run_started_at,
                  language,
                )}
              </small>
            </article>
          ))}
        </div>
      ) : null}

      {!hasSources ? (
        <article className="source-chip source-chip-unknown source-health-strip">
          <span>{t("sources")}</span>
          <strong>{t("unavailable")}</strong>
          <small>{t("No collector state")}</small>
        </article>
      ) : null}

      {hasSources ? (
        <button
          className="source-health-toggle"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded ? t("Collapse data sources") : t("Show all data sources")
          }
          onClick={() => setIsExpanded((current) => !current)}
          title={
            isExpanded ? t("Collapse data sources") : t("Show all data sources")
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
