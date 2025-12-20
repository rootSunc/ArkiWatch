"use client";

import { useMemo, useState } from "react";

import { AssistantWidget } from "@/features/assistant-widget/assistant-widget";

import { CategoryNav } from "./category-nav";
import { categoryKeyDataItems, formatDataItemLabel } from "./category-metadata";
import { CategoryOverviewGrid } from "./category-overview-grid";
import { EventStream } from "./event-stream";
import { MetricCard } from "./metric-card";
import { SourceHealthStrip } from "./source-health-strip";
import {
  PlatformCategory,
  PlatformOverviewResponse,
  PlatformVisualization,
  WeatherForecastResponse
} from "./types";
import { VisualizationPanel } from "./visualization-panel";
import { WeatherWorkspace } from "./weather-workspace";

type DataPlatformHomeProps = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  weather: WeatherForecastResponse | null;
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
    ...categoryKeyDataItems(category),
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

function platformSignalStats(categories: PlatformCategory[]) {
  const connected = categories.filter((category) => category.stage === "connected").length;
  const planned = categories.filter((category) => category.stage === "planned").length;
  const keyMetrics = categories.reduce(
    (total, category) => total + category.summary_metrics.length,
    0
  );
  const keyFields = categories.reduce(
    (total, category) => total + categoryKeyDataItems(category).length,
    0
  );
  const activeEvents = categories.reduce((total, category) => total + category.events.length, 0);

  return {
    connected,
    planned,
    keyMetrics,
    keyFields,
    activeEvents
  };
}

function sourceStatusText(category: PlatformCategory): string {
  return (
    category.summary_metrics
      .find((metric) => metric.key === "source_status")
      ?.value.toLowerCase() ?? category.status.replaceAll("_", " ")
  );
}

export function DataPlatformHome({
  apiBaseUrl,
  defaultUserId,
  overview,
  weather,
  error
}: DataPlatformHomeProps) {
  const [selectedKey, setSelectedKey] = useState("weather");
  const [timeRange, setTimeRange] = useState("24h");
  const [searchValue, setSearchValue] = useState("");

  const categories = useMemo(() => overview?.categories ?? [], [overview]);
  const signalStats = useMemo(() => platformSignalStats(categories), [categories]);
  const selectedCategory = categories.find((category) => category.key === selectedKey) ?? null;
  const isWeatherSelected = selectedCategory?.key === "weather";
  const selectedKeyDataItems = selectedCategory ? categoryKeyDataItems(selectedCategory) : [];
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
              placeholder="weather, water, transit, services"
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
              <h1>Operational data by signal type</h1>
              <p>
                Helsinki/Uusimaa source coverage, key fields, active events, and category-level
                metrics grouped so each data type shows what matters first.
              </p>
            </div>
            <div className="hero-status-grid">
              <article>
                <span>Data types</span>
                <strong>
                  {categories.length}
                  <small>{signalStats.connected} live</small>
                </strong>
              </article>
              <article>
                <span>Key metrics</span>
                <strong>
                  {signalStats.keyMetrics}
                  <small>{signalStats.keyFields} fields</small>
                </strong>
              </article>
              <article>
                <span>Active events</span>
                <strong>
                  {signalStats.activeEvents}
                  <small>{statusText(overview.health_status)}</small>
                </strong>
              </article>
              <article>
                <span>Sources</span>
                <strong>
                  {overview.sources.length}
                  <small>{signalStats.planned} planned areas</small>
                </strong>
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
                      : "Operational and background categories grouped by source, metric, event, and visualization."}
                  </p>
                </div>
                <div className="workspace-meta">
                  <span>{timeRange}</span>
                  <span>{defaultUserId ? "personal context" : "regional context"}</span>
                  {selectedCategory ? (
                    <span>{sourceStatusText(selectedCategory)}</span>
                  ) : (
                    <span>{apiBaseUrl.replace(/^https?:\/\//, "")}</span>
                  )}
                </div>
              </div>

              {isWeatherSelected ? (
                <WeatherWorkspace category={selectedCategory} weather={weather} timeRange={timeRange} />
              ) : selectedCategory ? (
                <>
                  <section className="category-focus-strip" aria-label="Selected category signals">
                    <article>
                      <span className="label-text">Key data items</span>
                      <div className="key-data-tags">
                        {selectedKeyDataItems.map((item) => (
                          <span key={item}>{formatDataItemLabel(item)}</span>
                        ))}
                      </div>
                    </article>
                    <article>
                      <span className="label-text">Metric coverage</span>
                      <strong>{selectedCategory.summary_metrics.length}</strong>
                      <p>Category indicators available for the current platform window.</p>
                    </article>
                    <article>
                      <span className="label-text">Sources</span>
                      <strong>{selectedCategory.sources.length}</strong>
                      <p>{selectedCategory.source_codes.join(", ") || "Catalog only"}</p>
                    </article>
                  </section>
                  <section className="metric-grid" aria-label="Category metrics">
                    {selectedCategory.summary_metrics.map((metric) => (
                      <MetricCard key={metric.key} metric={metric} />
                    ))}
                  </section>
                </>
              ) : (
                <CategoryOverviewGrid categories={activeCategories} onSelect={setSelectedKey} />
              )}

              {!isWeatherSelected ? (
                <>
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
                </>
              ) : null}
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
