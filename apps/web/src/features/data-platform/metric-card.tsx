import { formatTimestamp } from "@/features/shared/format";

import { PlatformMetric } from "./types";

type MetricCardProps = {
  metric: PlatformMetric;
};

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${metric.tone}`}>
      <div>
        <span className="label-text">{metric.label}</span>
        <strong>
          {metric.value}
          {metric.unit ? <small>{metric.unit}</small> : null}
        </strong>
      </div>
      {metric.detail ? <p>{metric.detail}</p> : null}
      <footer>
        <span>{metric.source_codes.join(", ") || "No source"}</span>
        <span>{formatTimestamp(metric.updated_at)}</span>
      </footer>
    </article>
  );
}
