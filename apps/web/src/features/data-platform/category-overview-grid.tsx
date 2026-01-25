import { categoryKeyDataItems, formatDataItemLabel } from "./category-metadata";
import { PlatformCategory, PlatformMetric } from "./types";

type CategoryOverviewGridProps = {
  categories: PlatformCategory[];
  onSelect: (key: string) => void;
};

function firstMetricValue(category: PlatformCategory, key: string): string {
  return category.summary_metrics.find((metric) => metric.key === key)?.value ?? "0";
}

function sourceLabel(category: PlatformCategory): string {
  return category.source_codes.length > 0 ? category.source_codes.join(", ") : "Catalog";
}

function metricValue(metric: PlatformMetric): string {
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function visibleMetrics(category: PlatformCategory): PlatformMetric[] {
  const priorityKeys = new Set([
    "active_events",
    "source_status",
    "records_ingested",
    "temperature_range",
    "rain_peak",
    "air_quality",
    "transit_disruptions",
    "low_energy_window"
  ]);
  const priorityMetrics = category.summary_metrics.filter((metric) => priorityKeys.has(metric.key));
  const fallbackMetrics = category.summary_metrics.filter((metric) => !priorityKeys.has(metric.key));

  return [...priorityMetrics, ...fallbackMetrics].slice(0, 4);
}

export function CategoryOverviewGrid({ categories, onSelect }: CategoryOverviewGridProps) {
  return (
    <section className="category-grid" aria-label="Category overview">
      {categories.map((category) => {
        const fields = categoryKeyDataItems(category);
        const metrics = visibleMetrics(category);

        return (
          <button
            className={`category-card category-card-${category.status}`}
            key={category.key}
            onClick={() => onSelect(category.key)}
            type="button"
          >
            <div className="category-card-header">
              <div>
                <span className="label-text">{sourceLabel(category)}</span>
                <h2>{category.title}</h2>
              </div>
              <div className="category-card-badges">
                <span className={`status-pill status-pill-${category.status}`}>
                  {category.status}
                </span>
                <span className="status-pill status-pill-neutral">
                  {category.priority ?? "P0"}
                </span>
              </div>
            </div>
            <p>{category.description}</p>
            {fields.length > 0 ? (
              <div className="category-card-fields" aria-label={`${category.title} key data items`}>
                {fields.slice(0, 6).map((field) => (
                  <span key={field}>{formatDataItemLabel(field)}</span>
                ))}
              </div>
            ) : null}
            <div className="category-metric-preview" aria-label={`${category.title} key metrics`}>
              {metrics.map((metric) => (
                <div className={`metric-preview metric-preview-${metric.tone}`} key={metric.key}>
                  <span>{metric.label}</span>
                  <strong>{metricValue(metric)}</strong>
                </div>
              ))}
            </div>
            <dl className="category-card-stats">
              <div>
                <dt>Key metrics</dt>
                <dd>{category.summary_metrics.length}</dd>
              </div>
              <div>
                <dt>Key fields</dt>
                <dd>{fields.length}</dd>
              </div>
              <div>
                <dt>Events</dt>
                <dd>{firstMetricValue(category, "active_events")}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{category.stage ?? "connected"}</dd>
              </div>
              <div>
                <dt>Sources</dt>
                <dd>{category.sources.length}</dd>
              </div>
            </dl>
          </button>
        );
      })}
    </section>
  );
}
