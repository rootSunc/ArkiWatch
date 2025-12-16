import { PlatformCategory } from "./types";

type CategoryOverviewGridProps = {
  categories: PlatformCategory[];
  onSelect: (key: string) => void;
};

function firstMetricValue(category: PlatformCategory, key: string): string {
  return category.summary_metrics.find((metric) => metric.key === key)?.value ?? "0";
}

export function CategoryOverviewGrid({ categories, onSelect }: CategoryOverviewGridProps) {
  return (
    <section className="category-grid" aria-label="Category overview">
      {categories.map((category) => (
        <button
          className={`category-card category-card-${category.status}`}
          key={category.key}
          onClick={() => onSelect(category.key)}
          type="button"
        >
          <div className="category-card-header">
            <div>
              <span className="label-text">{category.source_codes.join(", ")}</span>
              <h2>{category.title}</h2>
            </div>
            <span className={`status-pill status-pill-${category.status}`}>{category.status}</span>
          </div>
          <p>{category.description}</p>
          <dl className="category-card-stats">
            <div>
              <dt>Events</dt>
              <dd>{firstMetricValue(category, "active_events")}</dd>
            </div>
            <div>
              <dt>Ingest</dt>
              <dd>{firstMetricValue(category, "records_ingested")}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{category.sources.length}</dd>
            </div>
          </dl>
        </button>
      ))}
    </section>
  );
}
