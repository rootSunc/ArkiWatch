import { DashboardSource } from "@/features/public-dashboard/types";
import { formatRelativeAge, formatTimestamp, statusTone } from "@/features/shared/format";

export function SourceCard({ source }: { source: DashboardSource }) {
  const lastRun = source.last_run_finished_at
    ? `${formatTimestamp(source.last_run_finished_at)} (${formatRelativeAge(
        source.last_run_finished_at
      )})`
    : "Never";

  return (
    <article className="source-card">
      <div className="source-header">
        <div>
          <h3>{source.source_name}</h3>
          <span className="meta-text">
            {source.source_code} · every {Math.round(source.poll_interval_seconds / 60)} min
          </span>
        </div>
        <span className={`pill pill-${statusTone(source.operational_status)}`}>
          {source.operational_status}
        </span>
      </div>
      <dl className="source-details">
        <div>
          <dt>Last run</dt>
          <dd>{lastRun}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{source.last_run_status ?? "No runs"}</dd>
        </div>
        <div>
          <dt>Records</dt>
          <dd>{source.records_ingested ?? 0}</dd>
        </div>
      </dl>
      {source.error_message ? <p className="error-text">{source.error_message}</p> : null}
    </article>
  );
}
