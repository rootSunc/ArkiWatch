import { useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";
import { useI18n } from "./i18n";
import { PlatformOverviewResponse } from "./types";

type SourceHealthStripProps = {
  overview: PlatformOverviewResponse;
};

export function SourceHealthStrip({ overview }: SourceHealthStripProps) {
  const { language, t, enumLabel } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSources = overview.sources.length > 0;

  return (
    <section
      className={
        isExpanded
          ? "source-health-panel source-health-panel-expanded"
          : "source-health-panel"
      }
      aria-label={t("Source health")}
    >
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
        {!hasSources ? (
          <article className="source-chip source-chip-unknown">
            <span>{t("sources")}</span>
            <strong>{t("unavailable")}</strong>
            <small>{t("No collector state")}</small>
          </article>
        ) : null}
      </div>
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
            expand_more
          </span>
        </button>
      ) : null}
    </section>
  );
}
