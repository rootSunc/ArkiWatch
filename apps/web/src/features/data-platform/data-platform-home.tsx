"use client";

import { useMemo, useState } from "react";

import { AssistantWidget } from "@/features/assistant-widget/assistant-widget";
import { formatTimestamp } from "@/features/shared/format";

import { CategoryNav } from "./category-nav";
import { CategoryOverviewGrid } from "./category-overview-grid";
import { EventStream } from "./event-stream";
import { MetricCard } from "./metric-card";
import { SourceHealthStrip } from "./source-health-strip";
import { PlatformCategory, PlatformOverviewResponse, PlatformVisualization } from "./types";
import { VisualizationPanel } from "./visualization-panel";

type DataPlatformHomeProps = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  error: string | null;
};

const TIME_RANGES = ["Today", "24h", "7d", "Custom"];

function statusText(status: string): string {
  return status.replaceAll("_", " ");
}

function matchesSearch(category: PlatformCategory, searchValue: string): boolean {
  const query = searchValue.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    category.key,
    category.title,
    category.description,
    ...category.source_codes,
    ...category.summary_metrics.map((metric) => `${metric.label} ${metric.value}`),
    ...category.events.map((event) => `${event.title} ${event.body}`)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function selectedVisualizations(
  selectedCategory: PlatformCategory | null,
  categories: PlatformCategory[]
): PlatformVisualization[] {
  if (selectedCategory) {
    return selectedCategory.visualizations;
  }

  return categories.flatMap((category) => category.visualizations.slice(0, 2));
}

export function DataPlatformHome({
  apiBaseUrl,
  defaultUserId,
  overview,
  error
}: DataPlatformHomeProps) {
  const [selectedKey, setSelectedKey] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");
  const [searchValue, setSearchValue] = useState("");

  const categories = useMemo(() => overview?.categories ?? [], [overview]);
  const selectedCategory = categories.find((category) => category.key === selectedKey) ?? null;
  const visibleCategories = useMemo(
    () => categories.filter((category) => matchesSearch(category, searchValue)),
    [categories, searchValue]
  );
  const activeCategories = visibleCategories.length > 0 ? visibleCategories : categories;
  const visualizations = selectedVisualizations(
    selectedCategory,
    activeCategories
  ).filter((visualization) =>
    `${visualization.title} ${visualization.description} ${visualization.source_codes.join(" ")}`
      .toLowerCase()
      .includes(searchValue.trim().toLowerCase())
  );
  const visibleEvents = (selectedCategory ? selectedCategory.events : overview?.recent_events ?? [])
    .filter((event) =>
      `${event.title} ${event.body} ${event.category_key} ${event.source_codes.join(" ")}`
        .toLowerCase()
        .includes(searchValue.trim().toLowerCase())
    )
    .slice(0, 12);

  return (
    <main className="platform-shell">
      <header className="platform-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <strong>ArkiWatch</strong>
            <span>Unified data platform</span>
          </div>
        </div>
        <div className="topbar-controls">
          <label className="search-box">
            <span>Search</span>
            <input
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="weather, air, transit, energy"
              value={searchValue}
            />
          </label>
          <div className="segmented-control" aria-label="Time range">
            {TIME_RANGES.map((range) => (
              <button
                className={timeRange === range ? "active" : ""}
                key={range}
                onClick={() => setTimeRange(range)}
                type="button"
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </header>

      {overview ? (
        <>
          <section className="platform-hero" aria-label="Platform summary">
            <div>
              <span className="label-text">Data platform</span>
              <h1>Multi-source operational data</h1>
              <p>
                Helsinki/Uusimaa weather, air quality, transit, and energy signals with source
                health, event timelines, and visualization blocks.
              </p>
            </div>
            <div className="hero-status-grid">
              <article>
                <span>Platform</span>
                <strong>{statusText(overview.health_status)}</strong>
              </article>
              <article>
                <span>Coverage</span>
                <strong>{overview.coverage_area}</strong>
              </article>
              <article>
                <span>Updated</span>
                <strong>{formatTimestamp(overview.checked_at)}</strong>
              </article>
              <article>
                <span>API</span>
                <strong>{apiBaseUrl.replace(/^https?:\/\//, "")}</strong>
              </article>
            </div>
          </section>

          <SourceHealthStrip overview={overview} />

          <div className="platform-layout">
            <CategoryNav
              categories={categories}
              onSelect={setSelectedKey}
              selectedKey={selectedKey}
            />
            <section className="platform-workspace">
              <div className="workspace-heading">
                <div>
                  <span className="label-text">
                    {selectedCategory ? selectedCategory.source_codes.join(", ") : "All sources"}
                  </span>
                  <h2>{selectedCategory ? selectedCategory.title : "Overview"}</h2>
                  <p>
                    {selectedCategory
                      ? selectedCategory.description
                      : "Weather, air quality, transit, and energy grouped by source, metric, event, and visualization."}
                  </p>
                </div>
                <div className="workspace-meta">
                  <span>{timeRange}</span>
                  <span>{defaultUserId ? "personal context" : "regional context"}</span>
                </div>
              </div>

              {selectedCategory ? (
                <section className="metric-grid" aria-label="Category metrics">
                  {selectedCategory.summary_metrics.map((metric) => (
                    <MetricCard key={metric.key} metric={metric} />
                  ))}
                </section>
              ) : (
                <CategoryOverviewGrid categories={activeCategories} onSelect={setSelectedKey} />
              )}

              <section className="visualization-grid" aria-label="Visualizations">
                {visualizations.length > 0 ? (
                  visualizations.map((visualization) => (
                    <VisualizationPanel key={visualization.id} visualization={visualization} />
                  ))
                ) : (
                  <div className="empty-visual">No visualizations match the current search.</div>
                )}
              </section>

              <EventStream events={visibleEvents} />
            </section>
          </div>
        </>
      ) : (
        <section className="platform-error">
          <span className="label-text">Platform unavailable</span>
          <h1>Data platform could not load</h1>
          <p>{error ?? "Unknown platform error."}</p>
        </section>
      )}

      <AssistantWidget overview={overview} />
    </main>
  );
}
