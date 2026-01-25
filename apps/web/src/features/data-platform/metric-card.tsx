import { formatTimestamp } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { PlatformMetric } from "./types";

type MetricCardProps = {
  metric: PlatformMetric;
};

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${metric.tone}`}>
      <div>
        <DataLabelWithHelp
          className="label-text"
          helpText={dataHelpText({
            key: metric.key,
            label: metric.label,
            detail: metric.detail,
          })}
        >
          {metric.label}
        </DataLabelWithHelp>
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
