"use client";

import { useMemo, useState } from "react";

import { formatRelativeAge, severityTone } from "@/features/shared/format";

import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import { PlatformCategory, PlatformEvent, PlatformMetric, PlatformTone, PlatformVisualizationPoint } from "./types";

type LinkedEventsWorkspaceProps = {
  category: PlatformCategory | null;
};

type EventTone = PlatformTone | "good" | "warn" | "bad" | "neutral";
type EventFilter = "all" | "free" | "today" | "week";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const SUMMARY_KEYS = ["active_events", "event_places", "free_events", "event_keywords", "records_ingested"];

function attributeText(event: PlatformEvent | null, key: string): string | null {
  const value = event?.attributes?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attributeNumber(event: PlatformEvent | null, key: string): number | null {
  const value = event?.attributes?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function attributeBoolean(event: PlatformEvent | null, key: string): boolean {
  return event?.attributes?.[key] === true;
}

function attributeList(event: PlatformEvent | null, key: string): string[] {
  const value = event?.attributes?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
}

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function visibleSummaryMetrics(category: PlatformCategory): PlatformMetric[] {
  const preferred = SUMMARY_KEYS.map((key) => metricByKey(category, key)).filter(
    (metric): metric is PlatformMetric => metric !== null
  );
  const fallback = category.summary_metrics.filter((metric) => !SUMMARY_KEYS.includes(metric.key));
  return [...preferred, ...fallback].slice(0, 5);
}

function formatMetricValue(metric: PlatformMetric | null, t: (value: string) => string): string {
  if (!metric) {
    return t("missing");
  }
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: HELSINKI_TIME_ZONE,
    year: "numeric"
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatEventDateTime(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "short"
  }).format(new Date(value));
}

function formatEventDate(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "short"
  }).format(new Date(value));
}

function formatEventTime(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: HELSINKI_TIME_ZONE
  }).format(new Date(value));
}

function toneFromStatus(status: string | null | undefined): EventTone {
  switch (status) {
    case "healthy":
    case "ready":
    case "connected":
    case "fetched":
      return "good";
    case "pending":
    case "planned":
    case "stale":
    case "watch":
      return "warn";
    case "alert":
    case "failed":
    case "failing":
    case "inactive":
      return "bad";
    default:
      return "neutral";
  }
}

function metricTone(metric: PlatformMetric | null): EventTone {
  return metric ? (metric.tone as EventTone) : "neutral";
}

function sourceUpdatedAt(category: PlatformCategory): string | null {
  return category.sources
    .map((source) => source.last_run_finished_at ?? source.last_run_started_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function filterEvents(events: PlatformEvent[], filter: EventFilter): PlatformEvent[] {
  const now = new Date();
  const today = localDateKey(now);
  const weekLimit = now.getTime() + 7 * 24 * 60 * 60 * 1000;

  return events.filter((event) => {
    if (filter === "free") {
      return attributeBoolean(event, "is_free");
    }
    if (filter === "today") {
      return localDateKey(new Date(event.starts_at)) === today;
    }
    if (filter === "week") {
      const startsAt = new Date(event.starts_at).getTime();
      return startsAt >= now.getTime() && startsAt <= weekLimit;
    }
    return true;
  });
}

function eventPlace(event: PlatformEvent | null, t: (value: string) => string): string {
  return attributeText(event, "place_name") ?? t("Venue unavailable");
}

function eventCoordinate(event: PlatformEvent | null): string | null {
  const lat = attributeNumber(event, "latitude");
  const lon = attributeNumber(event, "longitude");
  if (lat === null || lon === null) {
    return null;
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function LinkedEventsWorkspace({ category }: LinkedEventsWorkspaceProps) {
  const { language, t } = useI18n();
  const [filter, setFilter] = useState<EventFilter>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [activeVenue, setActiveVenue] = useState<string | null>(null);

  const sortedEvents = useMemo(
    () => [...(category?.events ?? [])].sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()),
    [category]
  );

  const filteredEvents = useMemo(() => {
    let result = filterEvents(sortedEvents, filter);
    if (activeKeyword) {
      result = result.filter((event) => attributeList(event, "keywords").includes(activeKeyword));
    }
    if (activeVenue) {
      result = result.filter((event) => eventPlace(event, t) === activeVenue);
    }
    return result;
  }, [filter, sortedEvents, activeKeyword, activeVenue, t]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ?? filteredEvents[0] ?? sortedEvents[0] ?? null;

  const startDistribution = category?.visualizations?.find((item) => item.id === "linked-events-start-distribution");
  const startPoints = useMemo(() => startDistribution?.data?.points ?? [], [startDistribution]);

  const mappedEvents = useMemo(() => {
    return sortedEvents.filter((event) => {
      const lat = attributeNumber(event, "latitude");
      const lon = attributeNumber(event, "longitude");
      return lat !== null && lon !== null;
    });
  }, [sortedEvents]);

  const venueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedEvents.forEach((event) => {
      const place = eventPlace(event, t);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [sortedEvents, t]);

  const keywordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedEvents.forEach((event) => {
      const keywords = attributeList(event, "keywords");
      keywords.forEach((keyword) => {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [sortedEvents]);

  if (!category) {
    return (
      <section className="linked-events-empty" aria-label={t("Linked Events data unavailable")}>
        <span>{t("Helsinki Linked Events")}</span>
        <h2>{t("Linked Events feed is not available yet")}</h2>
        <p>{t("Event, place, and keyword records are missing from this platform view.")}</p>
      </section>
    );
  }

  const source = category.sources.find((item) => item.source_code === "linkedevents") ?? category.sources[0] ?? null;
  const sourceRun = sourceUpdatedAt(category);
  const summaryMetrics = visibleSummaryMetrics(category);
  const eventStatus = attributeText(selectedEvent, "event_status") ?? t("status unavailable");
  const infoUrl = attributeText(selectedEvent, "info_url");
  const provider = attributeText(selectedEvent, "provider") ?? t("provider unavailable");
  const selectedTone = selectedEvent ? (severityTone(selectedEvent.severity) as EventTone) : toneFromStatus(category.status);
  const dataStructure = source?.data_structures?.find((structure) => structure.dataset === "events") ?? source?.data_structures?.[0];
  const eventModel = source?.normalized_event_structures?.find((model) => model.event_type === "public_event");
  const filterOptions: Array<{ key: EventFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: sortedEvents.length },
    { key: "today", label: "Today", count: filterEvents(sortedEvents, "today").length },
    { key: "week", label: "7-day horizon", count: filterEvents(sortedEvents, "week").length },
    { key: "free", label: "Free events", count: filterEvents(sortedEvents, "free").length }
  ];

  function renderStartDistributionChart() {
    if (startPoints.length === 0) {
      return null;
    }

    const maxVal = Math.max(1, ...startPoints.map((p: PlatformVisualizationPoint) => p.value));

    return (
      <article className="linked-events-panel linked-events-distribution-panel">
        <header>
          <span>{t("Event start distribution")}</span>
          <strong>{startPoints.length} {t("Days")}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Upcoming Linked Events grouped by local event start day.")}
        </p>
        <div className="linked-events-chart-bars">
          {startPoints.map((point: PlatformVisualizationPoint) => {
            const heightPct = Math.max(12, (point.value / maxVal) * 100);
            const tone = point.tone ?? (point.value <= 3 ? "good" : "warn");
            return (
              <div key={point.label} className={`linked-events-chart-column linked-events-chart-column-${tone}`}>
                <div className="linked-events-chart-bar-container">
                  <span className="linked-events-chart-bar-value">{point.value}</span>
                  <div className="linked-events-chart-bar" style={{ height: `${heightPct}%` }} title={`${point.label}: ${point.value} ${t("events")}`} />
                </div>
                <span className="linked-events-chart-bar-label">{point.label}</span>
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderEventMap() {
    if (mappedEvents.length === 0) {
      return (
        <article className="linked-events-panel linked-events-map-panel">
          <header>
            <span>{t("Event Map Geometry")}</span>
            <strong>0</strong>
          </header>
          <div className="linked-events-map-empty">
            <p>{t("No event coordinates were returned in the latest Linked Events payload.")}</p>
          </div>
        </article>
      );
    }

    const latValues = mappedEvents.map((e) => attributeNumber(e, "latitude") as number);
    const lonValues = mappedEvents.map((e) => attributeNumber(e, "longitude") as number);
    const minLat = Math.min(...latValues);
    const maxLat = Math.max(...latValues);
    const minLon = Math.min(...lonValues);
    const maxLon = Math.max(...lonValues);
    const latRange = maxLat - minLat || 0.01;
    const lonRange = maxLon - minLon || 0.01;

    return (
      <article className="linked-events-panel linked-events-map-panel">
        <header>
          <span>{t("Event Map Geometry")}</span>
          <strong>{mappedEvents.length}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Geographical event distribution in the expansion area.")}
        </p>
        <div className="linked-events-map-frame">
          <svg aria-hidden="true" className="linked-events-map-svg" focusable="false" viewBox="0 0 100 100">
            {[25, 50, 75].map((position) => (
              <g key={position}>
                <line className="linked-events-map-grid-line" x1={position} x2={position} y1="4" y2="96" />
                <line className="linked-events-map-grid-line" x1="4" x2="96" y1={position} y2={position} />
              </g>
            ))}
            {mappedEvents.map((event) => {
              const lat = attributeNumber(event, "latitude") as number;
              const lon = attributeNumber(event, "longitude") as number;
              const x = 8 + ((lon - minLon) / lonRange) * 84;
              const y = 92 - ((lat - minLat) / latRange) * 84;
              const isSelected = event.id === selectedEvent?.id;
              const tone = severityTone(event.severity);
              const radius = isSelected ? 5.8 : 3.8;
              
              return (
                <circle
                  className={`linked-events-map-dot linked-events-map-dot-${tone} ${isSelected ? "linked-events-map-dot-selected" : ""}`}
                  cx={x}
                  cy={y}
                  key={event.id}
                  r={radius}
                  onClick={() => {
                    setSelectedEventId(event.id);
                    // Clear search filters that might hide the selected item from list view
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <title>
                    {event.title} · {eventPlace(event, t)}
                  </title>
                </circle>
              );
            })}
          </svg>
        </div>
        <div className="linked-events-map-meta">
          <span>{mappedEvents.length}/{sortedEvents.length} {t("mapped")}</span>
          <span>{minLat.toFixed(3)}-{maxLat.toFixed(3)} lat</span>
          <span>{minLon.toFixed(3)}-{maxLon.toFixed(3)} lon</span>
        </div>
      </article>
    );
  }

  function renderVenueDensityChart() {
    if (venueCounts.length === 0) {
      return null;
    }

    const maxCount = Math.max(1, ...venueCounts.map((v) => v[1]));

    return (
      <article className="linked-events-panel linked-events-venue-panel">
        <header>
          <span>{t("Venue Density")}</span>
          <strong>{venueCounts.length} {t("Venues")}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Top venues grouped by normalized event occurrence.")}
        </p>
        <div className="linked-events-venue-list">
          {venueCounts.map(([venue, count]) => {
            const widthPct = Math.max(8, (count / maxCount) * 100);
            const isFilterActive = activeVenue === venue;
            const tone = isFilterActive ? "good" : "neutral";

            return (
              <button
                key={venue}
                className={`linked-events-venue-row linked-events-venue-row-${tone} ${isFilterActive ? "active" : ""}`}
                onClick={() => setActiveVenue(isFilterActive ? null : venue)}
                type="button"
              >
                <div className="linked-events-venue-info">
                  <strong>{venue}</strong>
                  <span>{count} {t("events")}</span>
                </div>
                <i className="linked-events-venue-track" aria-hidden="true">
                  <span style={{ width: `${widthPct}%` }} />
                </i>
              </button>
            );
          })}
        </div>
      </article>
    );
  }

  function renderInteractiveKeywords() {
    if (keywordCounts.length === 0) {
      return null;
    }

    return (
      <article className="linked-events-panel linked-events-keyword-cloud-panel">
        <header>
          <span>{t("Popular Keywords")}</span>
          <strong>{keywordCounts.length}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Click keyword tags to dynamically filter upcoming events.")}
        </p>
        <div className="linked-events-keyword-cloud">
          {keywordCounts.map(([keyword, count]) => {
            const isFilterActive = activeKeyword === keyword;
            const tone = isFilterActive ? "good" : "neutral";
            return (
              <button
                key={keyword}
                className={`linked-events-keyword-tag linked-events-keyword-tag-${tone} ${isFilterActive ? "active" : ""}`}
                onClick={() => setActiveKeyword(isFilterActive ? null : keyword)}
                type="button"
              >
                <span>{keyword}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </article>
    );
  }

  return (
    <section className="linked-events-page" aria-label={t("Linked Events detail")}>
      <div className="linked-events-header">
        <div>
          <h2>{t("Helsinki Linked Events")}</h2>
          <div className="linked-events-live-status">
            <span aria-hidden="true" />
            <strong>{translateEnumLabel(language, category.status)}</strong>
          </div>
        </div>
        <div>{source?.source_code.toUpperCase() ?? "LINKEDEVENTS"} / {sourceRun ? formatRelativeAge(sourceRun, language) : t("not collected")}</div>
      </div>

      <section className="linked-events-command" aria-label={t("Linked Events operating condition")}>
        <article className={`linked-events-panel linked-events-hero linked-events-hero-${selectedTone}`}>
          <div className="linked-events-kicker">
            <span>{t("Next public event")}</span>
            <time>{selectedEvent ? formatEventDateTime(selectedEvent.starts_at, language) : t("not scheduled")}</time>
          </div>
          <div className="linked-events-focus">
            <span className="material-symbols-outlined linked-events-focus-icon" aria-hidden="true">
              event_available
            </span>
            <div>
              <strong>{selectedEvent?.title ?? t("No upcoming events")}</strong>
              <p>{selectedEvent?.body ?? t("Linked Events has not produced upcoming public-event rows yet.")}</p>
            </div>
          </div>
          <div className="linked-events-hero-footer">
            <div>
              <span>{t("Venue")}</span>
              <strong>{eventPlace(selectedEvent, t)}</strong>
            </div>
            <div>
              <span>{t("Ticketing")}</span>
              <strong>{attributeBoolean(selectedEvent, "is_free") ? t("Free") : t("Check source")}</strong>
            </div>
          </div>
        </article>

        <article className="linked-events-panel linked-events-filter-panel">
          <header>
            <span>{t("Event filters")}</span>
            <strong>{filteredEvents.length}</strong>
          </header>
          <div className="linked-events-filter-grid">
            {filterOptions.map((option) => (
              <button
                className={filter === option.key ? "linked-events-filter linked-events-filter-active" : "linked-events-filter"}
                key={option.key}
                onClick={() => {
                  setFilter(option.key);
                  // Reset keyword/venue filters when switching tab filters
                  setActiveKeyword(null);
                  setActiveVenue(null);
                }}
                type="button"
              >
                <span>{t(option.label)}</span>
                <strong>{option.count}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="linked-events-panel linked-events-source-panel">
          <header>
            <span>{t("Source state")}</span>
            <strong>{source ? translateEnumLabel(language, source.operational_status) : t("missing")}</strong>
          </header>
          <div className={`linked-events-source-row linked-events-source-row-${toneFromStatus(source?.operational_status)}`}>
            <div>
              <strong>{source?.source_name ?? t("Helsinki Linked Events")}</strong>
              <span>{source?.datasets?.join(", ") ?? t("dataset catalog pending")}</span>
            </div>
            {source?.documentation_url ? (
              <a href={source.documentation_url} rel="noreferrer" target="_blank">
                {t("Documentation")}
              </a>
            ) : null}
          </div>
        </article>

        {renderStartDistributionChart()}
        {renderEventMap()}
      </section>

      <section className="linked-events-summary-strip" aria-label={t("Linked Events summary metrics")}>
        {summaryMetrics.map((metric) => (
          <article className={`linked-events-panel linked-events-summary-${metricTone(metric)}`} key={metric.key}>
            <span>{t(metric.label)}</span>
            <strong>{formatMetricValue(metric, t)}</strong>
          </article>
        ))}
      </section>

      <section className="linked-events-main-grid" aria-label={t("Linked Events schedule and detail")}>
        <article className="linked-events-panel linked-events-timeline-panel">
          <header>
            <div>
              <span>{t("Event timeline")}</span>
              <h3>{t("Upcoming events by start time")}</h3>
            </div>
            <div className="linked-events-filter-status">
              {(activeKeyword || activeVenue) ? (
                <button
                  className="linked-events-clear-filters"
                  onClick={() => {
                    setActiveKeyword(null);
                    setActiveVenue(null);
                  }}
                  type="button"
                >
                  {t("Clear Filters")}
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", marginLeft: "4px" }}>close</span>
                </button>
              ) : (
                <strong>{filteredEvents.length} {t("rows")}</strong>
              )}
            </div>
          </header>

          <div className="linked-events-timeline-list">
            {filteredEvents.length > 0 ? (
              filteredEvents.slice(0, 16).map((event) => {
                const isSelected = event.id === selectedEvent?.id;
                const tone = severityTone(event.severity) as EventTone;
                const keywords = attributeList(event, "keywords").slice(0, 3);
                return (
                  <button
                    className={
                      isSelected
                        ? `linked-events-row linked-events-row-${tone} linked-events-row-selected`
                        : `linked-events-row linked-events-row-${tone}`
                    }
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    type="button"
                  >
                    <span className="linked-events-date-rail">
                      <strong>{formatEventTime(event.starts_at, language)}</strong>
                      <small>{formatEventDate(event.starts_at, language)}</small>
                    </span>
                    <span className="linked-events-row-main">
                      <strong>{event.title}</strong>
                      <span>{eventPlace(event, t)}</span>
                      {keywords.length > 0 ? (
                        <em>{keywords.join(" / ")}</em>
                      ) : null}
                    </span>
                    <span className="linked-events-row-meta">
                      {attributeBoolean(event, "is_free") ? t("Free") : t("Ticketed")}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="linked-events-empty-state">{t("No Linked Events match the current filter.")}</div>
            )}
          </div>
        </article>

        <aside className="linked-events-side-grid">
          <article className="linked-events-panel linked-events-inspector">
            <header>
              <span>{t("Selected event")}</span>
              <strong>{selectedEvent ? translateEnumLabel(language, selectedEvent.severity) : t("missing")}</strong>
            </header>
            <div className="linked-events-inspector-body">
              <h3>{selectedEvent?.title ?? t("No selected event")}</h3>
              <p>{selectedEvent?.body ?? t("Select an event row to inspect its location, keywords, and source fields.")}</p>
              <dl>
                <div>
                  <dt>{t("Starts")}</dt>
                  <dd>{selectedEvent ? formatEventDateTime(selectedEvent.starts_at, language) : t("not scheduled")}</dd>
                </div>
                <div>
                  <dt>{t("Ends")}</dt>
                  <dd>{selectedEvent ? formatEventDateTime(selectedEvent.ends_at, language) : t("not scheduled")}</dd>
                </div>
                <div>
                  <dt>{t("Venue")}</dt>
                  <dd>
                    {eventPlace(selectedEvent, t)}
                    {attributeText(selectedEvent, "place_name") && (
                      <button
                        className="linked-events-inspector-filter-btn"
                        onClick={() => {
                          const place = eventPlace(selectedEvent, t);
                          setActiveVenue(activeVenue === place ? null : place);
                        }}
                        title={t("Filter by this venue")}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>filter_list</span>
                      </button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("Coordinate")}</dt>
                  <dd>{eventCoordinate(selectedEvent) ?? t("coordinate unavailable")}</dd>
                </div>
                <div>
                  <dt>{t("Provider")}</dt>
                  <dd>{provider}</dd>
                </div>
                <div>
                  <dt>{t("Status")}</dt>
                  <dd>{translateEnumLabel(language, eventStatus)}</dd>
                </div>
              </dl>
              {infoUrl ? (
                <a className="linked-events-source-link" href={infoUrl} rel="noreferrer" target="_blank">
                  {t("Open source event")}
                </a>
              ) : null}
            </div>
          </article>

          {renderVenueDensityChart()}
          {renderInteractiveKeywords()}

          <article className="linked-events-panel linked-events-schema-panel">
            <header>
              <span>{t("Data structure")}</span>
              <strong>{dataStructure?.fields.length ?? 0}</strong>
            </header>
            <div className="linked-events-schema-list">
              {(dataStructure?.fields ?? []).slice(0, 6).map((field) => (
                <article key={field.key}>
                  <span>{field.value_type}</span>
                  <strong>{t(field.label)}</strong>
                  <p>{field.description}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="linked-events-panel linked-events-model-panel">
            <header>
              <span>{t("Normalized event")}</span>
              <strong>{eventModel ? eventModel.attributes.length : 0}</strong>
            </header>
            <p>{eventModel?.description ?? t("No normalized event structure is published for this source.")}</p>
            <div>
              {(eventModel?.attributes ?? []).slice(0, 7).map((field) => (
                <span key={field.key}>{field.key}</span>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </section>
  );
}
