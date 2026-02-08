"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatRelativeAge, severityTone } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformEvent,
  PlatformTimeScope,
  PlatformTone,
} from "./types";
import { eventAnchorId } from "./recent-events";

const LinkedEventsCoordinateMap = dynamic(
  () => import("./linked-events-coordinate-map").then((module) => module.LinkedEventsCoordinateMap),
  {
    ssr: false,
    loading: () => (
      <div className="air-map-frame air-map-frame--loading" aria-busy="true">
        <span className="air-map-loading-label">…</span>
      </div>
    )
  }
);

function formatCoordinateNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

type LinkedEventsWorkspaceProps = {
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  checkedAt?: string | null;
  timeScope?: PlatformTimeScope | null;
};

type EventTone = PlatformTone | "good" | "warn" | "bad" | "neutral";
type EventFilter = "all" | "today" | "week" | "free";
type EventCategoryKey =
  | "all"
  | "culture"
  | "family"
  | "learning"
  | "sports"
  | "outdoors"
  | "library"
  | "other";

type EventLink = {
  label: string;
  url: string;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const DESCRIPTION_MAX_LENGTH = 520;

const EVENT_CATEGORY_DEFINITIONS: Array<{
  key: EventCategoryKey;
  label: string;
  icon: string;
  patterns: string[];
}> = [
  { key: "all", label: "All activities", icon: "apps", patterns: [] },
  {
    key: "culture",
    label: "Culture",
    icon: "theater_comedy",
    patterns: ["art", "culture", "concert", "music", "museum", "dance", "theatre", "teatteri", "taide", "musiikki"],
  },
  {
    key: "family",
    label: "Family",
    icon: "family_restroom",
    patterns: ["children", "family", "kids", "child", "youth", "laps", "nuor", "perhe"],
  },
  {
    key: "learning",
    label: "Learning",
    icon: "school",
    patterns: ["course", "class", "workshop", "lecture", "training", "learning", "kurssi", "opastus"],
  },
  {
    key: "sports",
    label: "Sports",
    icon: "directions_run",
    patterns: ["sport", "exercise", "fitness", "liikunta", "run", "yoga", "swim", "football", "hockey"],
  },
  {
    key: "outdoors",
    label: "Outdoors",
    icon: "park",
    patterns: ["outdoor", "nature", "park", "garden", "retki", "luonto", "ulkoilu"],
  },
  {
    key: "library",
    label: "Library",
    icon: "local_library",
    patterns: ["library", "book", "reading", "helmet", "kirjasto", "lukeminen"],
  },
  { key: "other", label: "Other", icon: "more_horiz", patterns: [] },
];

function attributeText(event: PlatformEvent | null, key: string): string | null {
  const value = event?.attributes?.[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
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
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function attributeLinks(event: PlatformEvent | null, key: string): EventLink[] {
  const value = event?.attributes?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ label: `Link ${index + 1}`, url: item.trim() }];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : `Link ${index + 1}`;
    return url ? [{ label, url }] : [];
  });
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: HELSINKI_TIME_ZONE,
    year: "numeric",
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
    weekday: "short",
  }).format(new Date(value));
}

function formatEventDate(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "short",
  }).format(new Date(value));
}

function formatEventTime(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: HELSINKI_TIME_ZONE,
  }).format(new Date(value));
}

function formatEventMonthDay(value: string, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE,
  }).format(new Date(value));
}

function formatDuration(startsAt: string, endsAt: string, language: LanguageMode, t: (value: string) => string): string {
  const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return t("Duration unavailable");
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  if (days > 30) {
    return t("Long-running");
  }
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (language === "zh") {
    return [
      days > 0 ? `${days} 天` : null,
      hours > 0 ? `${hours} 小时` : null,
      minutes > 0 && days === 0 ? `${minutes} 分钟` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    days > 0 ? `${days} d` : null,
    hours > 0 ? `${hours} h` : null,
    minutes > 0 && days === 0 ? `${minutes} min` : null,
  ]
    .filter(Boolean)
    .join(" ");
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

function sourceUpdatedAt(category: PlatformCategory): string | null {
  return category.sources
    .map((source) => source.last_run_finished_at ?? source.last_run_started_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function selectedReferenceDate(timeScope: PlatformTimeScope | null | undefined, checkedAt: string | null | undefined): Date {
  const rawValue = timeScope?.mode === "historical" && timeScope.window_start ? timeScope.window_start : checkedAt;
  const parsed = rawValue ? new Date(rawValue) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function eventStartsAt(event: PlatformEvent): number {
  return new Date(event.starts_at).getTime();
}

function eventEndsAt(event: PlatformEvent): number {
  return new Date(event.ends_at).getTime();
}

function isEventEffectiveFrom(event: PlatformEvent, referenceDate: Date): boolean {
  return eventEndsAt(event) >= referenceDate.getTime();
}

function isEventOngoingAt(event: PlatformEvent | null, referenceDate: Date): boolean {
  if (!event) {
    return false;
  }
  const referenceTime = referenceDate.getTime();
  return eventStartsAt(event) <= referenceTime && eventEndsAt(event) >= referenceTime;
}

function sortEventsBySelectedTime(events: PlatformEvent[], referenceDate: Date): PlatformEvent[] {
  const referenceTime = referenceDate.getTime();
  return [...events].sort((left, right) => {
    const leftStarts = eventStartsAt(left);
    const rightStarts = eventStartsAt(right);
    const leftUpcoming = leftStarts >= referenceTime;
    const rightUpcoming = rightStarts >= referenceTime;
    if (leftUpcoming !== rightUpcoming) {
      return leftUpcoming ? -1 : 1;
    }
    if (leftUpcoming && rightUpcoming) {
      return leftStarts - rightStarts;
    }
    return eventEndsAt(left) - eventEndsAt(right);
  });
}

function filterEvents(events: PlatformEvent[], filter: EventFilter, referenceDate: Date): PlatformEvent[] {
  const referenceTime = referenceDate.getTime();
  const selectedDay = localDateKey(referenceDate);
  const weekLimit = referenceTime + 7 * 24 * 60 * 60 * 1000;

  return events.filter((event) => {
    if (filter === "free") {
      return attributeBoolean(event, "is_free");
    }
    if (filter === "today") {
      return localDateKey(new Date(event.starts_at)) === selectedDay || isEventOngoingAt(event, referenceDate);
    }
    if (filter === "week") {
      const startsAt = eventStartsAt(event);
      return startsAt <= weekLimit || isEventOngoingAt(event, referenceDate);
    }
    return true;
  });
}

function eventPlace(event: PlatformEvent | null, t: (value: string) => string): string {
  return attributeText(event, "place_name") ?? t("Venue unavailable");
}

function eventAddress(event: PlatformEvent | null, t: (value: string) => string): string {
  const address = attributeText(event, "address");
  const extra = attributeText(event, "location_extra_info");
  if (address && extra) {
    return `${address} · ${extra}`;
  }
  return address ?? extra ?? eventPlace(event, t);
}

function eventCoordinate(event: PlatformEvent | null): string | null {
  const lat = attributeNumber(event, "latitude");
  const lon = attributeNumber(event, "longitude");
  if (lat === null || lon === null) {
    return null;
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function eventDescription(event: PlatformEvent | null, t: (value: string) => string): string {
  return (
    attributeText(event, "description") ??
    attributeText(event, "short_description") ??
    event?.body ??
    t("Select an activity to inspect its schedule, tickets, address, and source links.")
  );
}

function truncateDescription(value: string): string {
  return value.length > DESCRIPTION_MAX_LENGTH ? `${value.slice(0, DESCRIPTION_MAX_LENGTH - 3).trim()}...` : value;
}

function eventTicketLabel(event: PlatformEvent | null, t: (value: string) => string): string {
  if (attributeBoolean(event, "is_free")) {
    return t("Free");
  }
  return attributeText(event, "ticket_label") ?? attributeText(event, "ticket_price") ?? t("Check source");
}

function eventActivityType(event: PlatformEvent | null, t: (value: string) => string): string {
  return attributeText(event, "activity_type") ?? attributeList(event, "keywords")[0] ?? t("Activity");
}

function eventStatusLabel(status: string | null, language: LanguageMode, t: (value: string) => string): string {
  if (!status) {
    return t("status unavailable");
  }
  const normalized = status.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
  return translateEnumLabel(language, normalized);
}

function eventPrimaryTimeLabel(event: PlatformEvent | null, referenceDate: Date, language: LanguageMode, t: (value: string) => string): string {
  if (!event) {
    return t("not scheduled");
  }
  return isEventOngoingAt(event, referenceDate)
    ? t("Ongoing")
    : formatEventDateTime(event.starts_at, language);
}

function eventRailTimeLabel(event: PlatformEvent, referenceDate: Date, language: LanguageMode, t: (value: string) => string): string {
  return isEventOngoingAt(event, referenceDate) ? t("Ongoing") : formatEventTime(event.starts_at, language);
}

function eventRailDateLabel(event: PlatformEvent, referenceDate: Date, language: LanguageMode, t: (value: string) => string): string {
  return isEventOngoingAt(event, referenceDate)
    ? `${t("Until")} ${formatEventMonthDay(event.ends_at, language)}`
    : formatEventDate(event.starts_at, language);
}

function searchableEventText(event: PlatformEvent): string {
  return [
    event.title,
    event.body,
    attributeText(event, "description"),
    attributeText(event, "short_description"),
    attributeText(event, "activity_type"),
    eventPlace(event, (value) => value),
    ...attributeList(event, "keywords"),
    ...attributeList(event, "audience"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventCategoryKey(event: PlatformEvent): EventCategoryKey {
  const searchText = searchableEventText(event);
  for (const definition of EVENT_CATEGORY_DEFINITIONS) {
    if (definition.key === "all" || definition.key === "other") {
      continue;
    }
    if (definition.patterns.some((pattern) => searchText.includes(pattern))) {
      return definition.key;
    }
  }
  return "other";
}

function eventConstraints(event: PlatformEvent | null, language: LanguageMode, t: (value: string) => string): string[] {
  const values = [
    attributeText(event, "age_limit") ? `${t("Age")}: ${attributeText(event, "age_limit")}` : null,
    ...attributeList(event, "audience").map((item) => `${t("Audience")}: ${item}`),
    ...attributeList(event, "languages").map((item) => `${t("Language")}: ${item}`),
  ].filter((item): item is string => Boolean(item));

  const status = attributeText(event, "event_status");
  if (status && status !== "EventScheduled") {
    values.unshift(`${t("Status")}: ${eventStatusLabel(status, language, t)}`);
  }
  return values.length > 0 ? values : [t("No constraints published")];
}

function eventLinks(event: PlatformEvent | null, t: (value: string) => string): EventLink[] {
  const candidates: EventLink[] = [
    attributeText(event, "info_url") ? { label: t("Event page"), url: attributeText(event, "info_url") as string } : null,
    attributeText(event, "ticket_url") ? { label: t("Tickets"), url: attributeText(event, "ticket_url") as string } : null,
    attributeText(event, "registration_url") ? { label: t("Registration"), url: attributeText(event, "registration_url") as string } : null,
    ...attributeLinks(event, "external_links"),
    attributeText(event, "api_url") ? { label: t("Source record"), url: attributeText(event, "api_url") as string } : null,
  ].filter((item): item is EventLink => Boolean(item));

  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

export function LinkedEventsWorkspace({
  category,
  checkedAt,
  highlightedEventId,
  timeScope,
}: LinkedEventsWorkspaceProps) {
  const { language, t } = useI18n();
  const [filter, setFilter] = useState<EventFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<EventCategoryKey>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [activeVenue, setActiveVenue] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const referenceDate = useMemo(
    () => selectedReferenceDate(timeScope, checkedAt),
    [checkedAt, timeScope]
  );

  const sortedEvents = useMemo(
    () => sortEventsBySelectedTime((category?.events ?? []).filter((event) => isEventEffectiveFrom(event, referenceDate)), referenceDate),
    [category, referenceDate]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategoryKey, number>();
    EVENT_CATEGORY_DEFINITIONS.forEach((definition) => counts.set(definition.key, 0));
    sortedEvents.forEach((event) => {
      const key = eventCategoryKey(event);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      counts.set("all", (counts.get("all") ?? 0) + 1);
    });
    return counts;
  }, [sortedEvents]);

  const filteredEvents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    let result = filterEvents(sortedEvents, filter, referenceDate);
    if (categoryFilter !== "all") {
      result = result.filter((event) => eventCategoryKey(event) === categoryFilter);
    }
    if (activeKeyword) {
      result = result.filter((event) => attributeList(event, "keywords").includes(activeKeyword));
    }
    if (activeVenue) {
      result = result.filter((event) => eventPlace(event, t) === activeVenue);
    }
    if (query) {
      result = result.filter((event) => searchableEventText(event).includes(query));
    }
    return result;
  }, [filter, sortedEvents, categoryFilter, activeKeyword, activeVenue, searchText, referenceDate, t]);

  useEffect(() => {
    if (!highlightedEventId) {
      return;
    }

    const highlighted = sortedEvents.find((event) => event.id === highlightedEventId);
    if (!highlighted) {
      return;
    }

    setFilter("all");
    setActiveKeyword(null);
    setActiveVenue(null);
    setSelectedEventId(highlighted.id);
  }, [highlightedEventId, sortedEvents]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ?? filteredEvents[0] ?? sortedEvents[0] ?? null;

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
      .slice(0, 12);
  }, [sortedEvents]);

  const mappedEventCount = useMemo(
    () =>
      sortedEvents.filter((event) => {
        const lat = attributeNumber(event, "latitude");
        const lon = attributeNumber(event, "longitude");
        return lat !== null && lon !== null;
      }).length,
    [sortedEvents]
  );

  const placeLabel = useCallback((event: PlatformEvent) => eventPlace(event, t), [t]);

  const handleEventMapSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
  }, []);

  if (!category) {
    return (
      <section className="linked-events-empty" aria-label={t("Linked Events data unavailable")}>
        <span>{t("Linked Events")}</span>
        <h2>{t("Linked Events feed is not available yet")}</h2>
        <p>{t("Event, place, and keyword records are missing from this platform view.")}</p>
      </section>
    );
  }

  const source = category.sources.find((item) => item.source_code === "linkedevents") ?? category.sources[0] ?? null;
  const sourceRun = sourceUpdatedAt(category);
  const selectedTone = selectedEvent ? (severityTone(selectedEvent.severity) as EventTone) : toneFromStatus(category.status);
  const eventStatus = attributeText(selectedEvent, "event_status");
  const provider = attributeText(selectedEvent, "provider") ?? t("provider unavailable");
  const eventDetailLinks = eventLinks(selectedEvent, t);
  const selectedDescription = selectedEvent
    ? truncateDescription(eventDescription(selectedEvent, t))
    : t("No activities are available for the selected city yet. The city-specific feed may need a fresh collection.");
  const filterOptions: Array<{ key: EventFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: sortedEvents.length },
    { key: "today", label: "Today", count: filterEvents(sortedEvents, "today", referenceDate).length },
    { key: "week", label: "7-day horizon", count: filterEvents(sortedEvents, "week", referenceDate).length },
    { key: "free", label: "Free events", count: filterEvents(sortedEvents, "free", referenceDate).length },
  ];

  function renderVenueDensityChart() {
    if (venueCounts.length === 0) {
      return null;
    }

    const maxCount = Math.max(1, ...venueCounts.map((venue) => venue[1]));

    return (
      <article className="linked-events-panel linked-events-venue-panel">
        <header>
          <span>{t("Top venues")}</span>
          <strong>{venueCounts.length} {t("Venues")}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Click a venue to narrow the activity list.")}
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
          <span>{t("Activity tags")}</span>
          <strong>{keywordCounts.length}</strong>
        </header>
        <p className="linked-events-chart-description">
          {t("Click a tag to filter upcoming activities.")}
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
          <h2>{t(category.title || "Linked Events")}</h2>
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
            <span>{t("Selected activity")}</span>
            <time>{eventPrimaryTimeLabel(selectedEvent, referenceDate, language, t)}</time>
          </div>
          <div className="linked-events-focus">
            <span className="material-symbols-outlined linked-events-focus-icon" aria-hidden="true">
              event_available
            </span>
            <div>
              <strong>{selectedEvent?.title ?? t("No upcoming activities")}</strong>
              <p>{selectedDescription}</p>
            </div>
          </div>
          <div className="linked-events-hero-footer linked-events-hero-footer-four">
            <div>
              <span>{t("Venue")}</span>
              <strong>{eventPlace(selectedEvent, t)}</strong>
            </div>
            <div>
              <span>{t("Ticketing")}</span>
              <strong>{eventTicketLabel(selectedEvent, t)}</strong>
            </div>
            <div>
              <span>{t("Duration")}</span>
              <strong>{selectedEvent ? formatDuration(selectedEvent.starts_at, selectedEvent.ends_at, language, t) : t("Duration unavailable")}</strong>
            </div>
            <div>
              <span>{t("Activity type")}</span>
              <strong>{eventActivityType(selectedEvent, t)}</strong>
            </div>
          </div>
        </article>

        <article className="linked-events-panel linked-events-filter-panel">
          <header>
            <span>{t("Browse activities")}</span>
            <strong>{filteredEvents.length}</strong>
          </header>
          <label className="linked-events-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              aria-label={t("Search activities")}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder={t("Search by activity, venue, or keyword")}
              type="search"
              value={searchText}
            />
          </label>
          <div className="linked-events-filter-grid">
            {filterOptions.map((option) => (
              <button
                className={filter === option.key ? "linked-events-filter linked-events-filter-active" : "linked-events-filter"}
                key={option.key}
                onClick={() => {
                  setFilter(option.key);
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

        <article className="linked-events-panel linked-events-category-panel">
          <header>
            <span>{t("Activity categories")}</span>
            <strong>{categoryCounts.get("all") ?? 0}</strong>
          </header>
          <div className="linked-events-category-grid">
            {EVENT_CATEGORY_DEFINITIONS.map((definition) => {
              const isActive = categoryFilter === definition.key;
              return (
                <button
                  className={isActive ? "linked-events-category-chip active" : "linked-events-category-chip"}
                  key={definition.key}
                  onClick={() => setCategoryFilter(definition.key)}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{definition.icon}</span>
                  <span>{t(definition.label)}</span>
                  <strong>{categoryCounts.get(definition.key) ?? 0}</strong>
                </button>
              );
            })}
          </div>
        </article>

      </section>

      <section className="linked-events-main-grid" aria-label={t("Linked Events schedule and detail")}>
        <article className="linked-events-panel linked-events-timeline-panel">
          <header>
            <div>
              <span>{t("Activity list")}</span>
              <h3>{t("Activities valid from selected time")}</h3>
            </div>
            <div className="linked-events-filter-status">
              {activeKeyword || activeVenue || searchText || categoryFilter !== "all" ? (
                <button
                  className="linked-events-clear-filters"
                  onClick={() => {
                    setActiveKeyword(null);
                    setActiveVenue(null);
                    setCategoryFilter("all");
                    setSearchText("");
                  }}
                  type="button"
                >
                  {t("Clear Filters")}
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", marginLeft: "4px" }}>close</span>
                </button>
              ) : (
                <strong>{filteredEvents.length} {t("activities")}</strong>
              )}
            </div>
          </header>

          <div className="linked-events-timeline-list">
            {filteredEvents.length > 0 ? (
              filteredEvents.slice(0, 24).map((event) => {
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
	                    id={eventAnchorId(event.id)}
	                    key={event.id}
	                    onClick={() => setSelectedEventId(event.id)}
                    type="button"
                  >
                    <span className="linked-events-date-rail">
                      <strong>{eventRailTimeLabel(event, referenceDate, language, t)}</strong>
                      <small>{eventRailDateLabel(event, referenceDate, language, t)}</small>
                    </span>
                    <span className="linked-events-row-main">
                      <strong>{event.title}</strong>
                      <span>{eventAddress(event, t)}</span>
                      {keywords.length > 0 ? (
                        <em>{keywords.join(" / ")}</em>
                      ) : null}
                    </span>
                    <span className="linked-events-row-meta">
                      {eventTicketLabel(event, t)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="linked-events-empty-state">{t("No activities match the current filters.")}</div>
            )}
          </div>
        </article>

        <aside className="linked-events-side-grid">
          <article className="linked-events-panel linked-events-inspector">
            <header>
              <span>{t("Activity details")}</span>
              <strong>{selectedEvent ? translateEnumLabel(language, selectedEvent.severity) : t("missing")}</strong>
            </header>
            <div className="linked-events-inspector-body">
              <h3>{selectedEvent?.title ?? t("No selected event")}</h3>
              <div className="linked-events-detail-tags">
                <span>{eventActivityType(selectedEvent, t)}</span>
                <span>{eventTicketLabel(selectedEvent, t)}</span>
                <span>{eventStatusLabel(eventStatus, language, t)}</span>
              </div>
              <p className="linked-events-description">{selectedDescription}</p>
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
                  <dt>{t("Duration")}</dt>
                  <dd>{selectedEvent ? formatDuration(selectedEvent.starts_at, selectedEvent.ends_at, language, t) : t("Duration unavailable")}</dd>
                </div>
                <div>
                  <dt>{t("Address")}</dt>
                  <dd>
                    {eventAddress(selectedEvent, t)}
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
                  <dt>{t("Ticketing")}</dt>
                  <dd>{eventTicketLabel(selectedEvent, t)}</dd>
                </div>
                <div>
                  <dt>{t("Organizer")}</dt>
                  <dd>{provider}</dd>
                </div>
                <div>
                  <dt>{t("Coordinate")}</dt>
                  <dd>{eventCoordinate(selectedEvent) ?? t("coordinate unavailable")}</dd>
                </div>
              </dl>

              <section className="linked-events-detail-section">
                <span>{t("Constraints")}</span>
                <div className="linked-events-meta-list">
                  {eventConstraints(selectedEvent, language, t).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <section className="linked-events-detail-section">
                <span>{t("Links")}</span>
                {eventDetailLinks.length > 0 ? (
                  <div className="linked-events-link-stack">
                    {eventDetailLinks.map((link) => (
                      <a href={link.url} key={`${link.label}-${link.url}`} rel="noreferrer" target="_blank">
                        {link.label}
                        <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p>{t("No event links were published.")}</p>
                )}
              </section>
            </div>
          </article>

          <article className="linked-events-panel linked-events-map-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "event_map_geometry",
                  label: "Event Map Geometry",
                  t
                })}
              >
                {t("Event Map Geometry")}
              </DataLabelWithHelp>
              <strong>{mappedEventCount}</strong>
            </header>
            <p className="linked-events-chart-description">
              {t("Geographical event distribution in the expansion area.")}
            </p>
            <LinkedEventsCoordinateMap
              events={sortedEvents}
              formatNumber={formatCoordinateNumber}
              onEventSelect={handleEventMapSelect}
              placeLabel={placeLabel}
              selectedEventId={selectedEvent?.id ?? null}
              t={t}
            />
          </article>

          {renderVenueDensityChart()}
          {renderInteractiveKeywords()}
        </aside>
      </section>
    </section>
  );
}
