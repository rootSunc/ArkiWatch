import { formatRelativeAge } from "@/features/shared/format";

import { PlatformOverviewResponse } from "./types";

type SourceHealthStripProps = {
  overview: PlatformOverviewResponse;
};

export function SourceHealthStrip({ overview }: SourceHealthStripProps) {
  return (
    <section className="source-health-strip" aria-label="Source health">
      {overview.sources.map((source) => (
        <article className={`source-chip source-chip-${source.operational_status}`} key={source.id}>
          <span>{source.source_code}</span>
          <strong>{source.operational_status}</strong>
          <small>
            {formatRelativeAge(source.last_run_finished_at ?? source.last_run_started_at)}
          </small>
        </article>
      ))}
      {overview.sources.length === 0 ? (
        <article className="source-chip source-chip-unknown">
          <span>sources</span>
          <strong>unavailable</strong>
          <small>No collector state</small>
        </article>
      ) : null}
    </section>
  );
}
