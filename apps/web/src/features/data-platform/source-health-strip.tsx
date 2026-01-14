import { formatRelativeAge } from "@/features/shared/format";
import { useI18n } from "./i18n";
import { PlatformOverviewResponse } from "./types";

type SourceHealthStripProps = {
  overview: PlatformOverviewResponse;
};

export function SourceHealthStrip({ overview }: SourceHealthStripProps) {
  const { language, t, enumLabel } = useI18n();

  return (
    <section className="source-health-strip" aria-label={t("Source health")}>
      {overview.sources.map((source) => (
        <article className={`source-chip source-chip-${source.operational_status}`} key={source.id}>
          <span>{source.source_code}</span>
          <strong>{enumLabel(source.operational_status)}</strong>
          <small>
            {formatRelativeAge(source.last_run_finished_at ?? source.last_run_started_at, language)}
          </small>
        </article>
      ))}
      {overview.sources.length === 0 ? (
        <article className="source-chip source-chip-unknown">
          <span>{t("sources")}</span>
          <strong>{t("unavailable")}</strong>
          <small>{t("No collector state")}</small>
        </article>
      ) : null}
    </section>
  );
}
