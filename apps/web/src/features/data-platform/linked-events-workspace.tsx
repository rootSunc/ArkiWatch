"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatRelativeAge, severityTone } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import { useEventDescriptionTranslation } from "./queries/translate-queries";
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
type EventTextLanguage = "auto" | "en" | "fi" | "sv" | "zh";
type EventDescriptionSource = {
  text: string;
  sourceLanguage: EventTextLanguage;
  shouldTranslate: boolean;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const DESCRIPTION_MAX_LENGTH = 520;

const EVENT_CATEGORY_DEFINITIONS: Array<{
  key: EventCategoryKey;
  labelKey: string;
  icon: string;
  patterns: string[];
}> = [
  { key: "all", labelKey: "allActivities", icon: "apps", patterns: [] },
  {
    key: "culture",
    labelKey: "culture",
    icon: "theater_comedy",
    patterns: ["art", "culture", "concert", "music", "museum", "dance", "theatre", "teatteri", "taide", "musiikki"],
  },
  {
    key: "family",
    labelKey: "family",
    icon: "family_restroom",
    patterns: ["children", "family", "kids", "child", "youth", "laps", "nuor", "perhe"],
  },
  {
    key: "learning",
    labelKey: "learning",
    icon: "school",
    patterns: ["course", "class", "workshop", "lecture", "training", "learning", "kurssi", "opastus"],
  },
  {
    key: "sports",
    labelKey: "sports",
    icon: "directions_run",
    patterns: ["sport", "exercise", "fitness", "liikunta", "run", "yoga", "swim", "football", "hockey"],
  },
  {
    key: "outdoors",
    labelKey: "outdoors",
    icon: "park",
    patterns: ["outdoor", "nature", "park", "garden", "retki", "luonto", "ulkoilu"],
  },
  {
    key: "library",
    labelKey: "library",
    icon: "local_library",
    patterns: ["library", "book", "reading", "helmet", "kirjasto", "lukeminen"],
  },
  { key: "other", labelKey: "other", icon: "more_horiz", patterns: [] },
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

function attributeTextRecord(event: PlatformEvent | null, key: string): Partial<Record<EventTextLanguage, string>> {
  const value = event?.attributes?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return (["en", "fi", "sv", "zh"] as const).reduce<Partial<Record<EventTextLanguage, string>>>(
    (result, language) => {
      const candidate = record[language];
      if (typeof candidate === "string" && candidate.trim()) {
        result[language] = candidate.trim();
      }
      return result;
    },
    {},
  );
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

function formatDuration(startsAt: string, endsAt: string, language: LanguageMode, tKey: (key: string) => string): string {
  const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return tKey("linkedEvents.durationUnavailable");
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  if (days > 30) {
    return tKey("linkedEvents.longRunning");
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

function eventPlace(event: PlatformEvent | null, tKey: (key: string) => string): string {
  return attributeText(event, "place_name") ?? tKey("linkedEvents.venueUnavailable");
}

function eventAddress(event: PlatformEvent | null, tKey: (key: string) => string): string {
  const address = attributeText(event, "address");
  const extra = attributeText(event, "location_extra_info");
  if (address && extra) {
    return `${address} · ${extra}`;
  }
  return address ?? extra ?? eventPlace(event, tKey);
}

function eventCoordinate(event: PlatformEvent | null): string | null {
  const lat = attributeNumber(event, "latitude");
  const lon = attributeNumber(event, "longitude");
  if (lat === null || lon === null) {
    return null;
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function containsChineseText(value: string): boolean {
  return Array.from(value).some((char) => char >= "\u4e00" && char <= "\u9fff");
}

function looksFinnishOrSwedish(value: string): boolean {
  const normalized = value.toLowerCase();
  return /[åäö]/i.test(value) || [
    " ja ",
    " sekä ",
    " joka ",
    " tämä ",
    " ovat ",
    " klo ",
    " kirjast",
    " laps",
    " nuor",
    " tervetulo",
    " ohjelma",
    " näyttely",
    " tapahtuma",
    " och ",
    " det ",
    " till ",
  ].some((hint) => normalized.includes(hint));
}

function descriptionNeedsTranslation(text: string, sourceLanguage: EventTextLanguage, language: LanguageMode): boolean {
  if (language === "zh") {
    return sourceLanguage !== "zh" && !containsChineseText(text);
  }
  if (sourceLanguage === "en") {
    return false;
  }
  if (sourceLanguage === "fi" || sourceLanguage === "sv" || sourceLanguage === "zh") {
    return true;
  }
  return looksFinnishOrSwedish(text);
}

function pickLocalizedText(
  values: Partial<Record<EventTextLanguage, string>>,
  language: LanguageMode,
): { text: string; sourceLanguage: EventTextLanguage } | null {
  const preferredLanguages: EventTextLanguage[] =
    language === "zh" ? ["zh", "en", "fi", "sv"] : ["en", "fi", "sv", "zh"];

  for (const sourceLanguage of preferredLanguages) {
    const text = values[sourceLanguage];
    if (text) {
      return { text, sourceLanguage };
    }
  }

  return null;
}

function eventDescriptionSource(
  event: PlatformEvent | null,
  language: LanguageMode,
  tKey: (key: string) => string,
): EventDescriptionSource {
  if (!event) {
    return {
      text: tKey("linkedEvents.selectAnActivityToInspectItsScheduleTicketsAddressAndSourceLinks"),
      sourceLanguage: language,
      shouldTranslate: false,
    };
  }

  for (const key of ["description_i18n", "short_description_i18n"]) {
    const localized = pickLocalizedText(attributeTextRecord(event, key), language);
    if (localized) {
      return {
        ...localized,
        shouldTranslate: descriptionNeedsTranslation(localized.text, localized.sourceLanguage, language),
      };
    }
  }

  const text =
    attributeText(event, "description") ??
    attributeText(event, "short_description") ??
    event.body ??
    tKey("linkedEvents.selectAnActivityToInspectItsScheduleTicketsAddressAndSourceLinks");
  const sourceLanguage: EventTextLanguage = containsChineseText(text)
    ? "zh"
    : looksFinnishOrSwedish(text)
      ? "fi"
      : "auto";

  return {
    text,
    sourceLanguage,
    shouldTranslate: descriptionNeedsTranslation(text, sourceLanguage, language),
  };
}

function truncateDescription(value: string): string {
  return value.length > DESCRIPTION_MAX_LENGTH ? `${value.slice(0, DESCRIPTION_MAX_LENGTH - 3).trim()}...` : value;
}

function eventTicketLabel(event: PlatformEvent | null, tKey: (key: string) => string): string {
  if (attributeBoolean(event, "is_free")) {
    return tKey("linkedEvents.free");
  }
  return attributeText(event, "ticket_label") ?? attributeText(event, "ticket_price") ?? tKey("linkedEvents.checkSource");
}

function eventActivityType(event: PlatformEvent | null, tKey: (key: string) => string): string {
  return attributeText(event, "activity_type") ?? attributeList(event, "keywords")[0] ?? tKey("linkedEvents.activity");
}

function eventStatusLabel(status: string | null, language: LanguageMode, tKey: (key: string) => string): string {
  if (!status) {
    return tKey("linkedEvents.statusUnavailable");
  }
  const normalized = status.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
  return translateEnumLabel(language, normalized);
}

function eventPrimaryTimeLabel(event: PlatformEvent | null, referenceDate: Date, language: LanguageMode, tKey: (key: string) => string): string {
  if (!event) {
    return tKey("linkedEvents.notScheduled");
  }
  return isEventOngoingAt(event, referenceDate)
    ? tKey("linkedEvents.ongoing")
    : formatEventDateTime(event.starts_at, language);
}

function eventRailTimeLabel(event: PlatformEvent, referenceDate: Date, language: LanguageMode, tKey: (key: string) => string): string {
  return isEventOngoingAt(event, referenceDate) ? tKey("linkedEvents.ongoing") : formatEventTime(event.starts_at, language);
}

function eventRailDateLabel(event: PlatformEvent, referenceDate: Date, language: LanguageMode, tKey: (key: string) => string): string {
  return isEventOngoingAt(event, referenceDate)
    ? `${tKey("linkedEvents.until")} ${formatEventMonthDay(event.ends_at, language)}`
    : formatEventDate(event.starts_at, language);
}

function searchableEventText(event: PlatformEvent): string {
  return [
    event.title,
    event.body,
    attributeText(event, "description"),
    attributeText(event, "short_description"),
    attributeText(event, "activity_type"),
    attributeText(event, "place_name"),
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

function eventConstraints(event: PlatformEvent | null, language: LanguageMode, tKey: (key: string) => string): string[] {
  const values = [
    attributeText(event, "age_limit") ? `${tKey("linkedEvents.age")}: ${attributeText(event, "age_limit")}` : null,
    ...attributeList(event, "audience").map((item) => `${tKey("linkedEvents.audience")}: ${item}`),
    ...attributeList(event, "languages").map((item) => `${tKey("linkedEvents.language")}: ${item}`),
  ].filter((item): item is string => Boolean(item));

  const status = attributeText(event, "event_status");
  if (status && status !== "EventScheduled") {
    values.unshift(`${tKey("linkedEvents.status")}: ${eventStatusLabel(status, language, tKey)}`);
  }
  return values.length > 0 ? values : [tKey("linkedEvents.noConstraintsPublished")];
}

function eventLinks(event: PlatformEvent | null, tKey: (key: string) => string): EventLink[] {
  const candidates: EventLink[] = [
    attributeText(event, "info_url") ? { label: tKey("linkedEvents.eventPage"), url: attributeText(event, "info_url") as string } : null,
    attributeText(event, "ticket_url") ? { label: tKey("linkedEvents.tickets"), url: attributeText(event, "ticket_url") as string } : null,
    attributeText(event, "registration_url") ? { label: tKey("linkedEvents.registration"), url: attributeText(event, "registration_url") as string } : null,
    ...attributeLinks(event, "external_links"),
    attributeText(event, "api_url") ? { label: tKey("linkedEvents.sourceRecord"), url: attributeText(event, "api_url") as string } : null,
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
  const { language, t, tKey, dataLabel } = useI18n();
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
      result = result.filter((event) => eventPlace(event, tKey) === activeVenue);
    }
    if (query) {
      result = result.filter((event) => searchableEventText(event).includes(query));
    }
    return result;
  }, [filter, sortedEvents, categoryFilter, activeKeyword, activeVenue, searchText, referenceDate, tKey]);

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
  const selectedDescriptionSource = useMemo(
    () => eventDescriptionSource(selectedEvent, language, tKey),
    [language, selectedEvent, tKey],
  );
  const { data: translatedSelectedDescription } = useEventDescriptionTranslation({
    eventId: selectedEvent?.id ?? null,
    language,
    text: selectedDescriptionSource.text,
    sourceLanguage: selectedDescriptionSource.sourceLanguage,
    shouldTranslate: selectedDescriptionSource.shouldTranslate,
    context: selectedEvent?.title,
  });

  const venueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedEvents.forEach((event) => {
      const place = eventPlace(event, tKey);
      counts.set(place, (counts.get(place) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [sortedEvents, tKey]);

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

  const placeLabel = useCallback((event: PlatformEvent) => eventPlace(event, tKey), [tKey]);

  const handleEventMapSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
  }, []);

  if (!category) {
    return (
      <section className="linked-events-empty" aria-label={tKey("linkedEvents.linkedEventsDataUnavailable")}>
        <span>{tKey("linkedEvents.linkedEvents")}</span>
        <h2>{tKey("linkedEvents.linkedEventsFeedIsNotAvailableYet")}</h2>
        <p>{tKey("linkedEvents.eventPlaceAndKeywordRecordsAreMissingFromThisPlatformView")}</p>
      </section>
    );
  }

  const source = category.sources.find((item) => item.source_code === "linkedevents") ?? category.sources[0] ?? null;
  const sourceRun = sourceUpdatedAt(category);
  const selectedTone = selectedEvent ? (severityTone(selectedEvent.severity) as EventTone) : toneFromStatus(category.status);
  const eventStatus = attributeText(selectedEvent, "event_status");
  const provider = attributeText(selectedEvent, "provider") ?? tKey("linkedEvents.providerUnavailable");
  const eventDetailLinks = eventLinks(selectedEvent, tKey);
  const selectedDescription = selectedEvent
    ? truncateDescription(translatedSelectedDescription ?? selectedDescriptionSource.text)
    : tKey("linkedEvents.noActivitiesAreAvailableForTheSelectedCityYetTheCitySpecificFeedMayNeedAFreshCollection");
  const filterOptions: Array<{ key: EventFilter; labelKey: string; count: number }> = [
    { key: "all", labelKey: "allFilter", count: sortedEvents.length },
    { key: "today", labelKey: "today", count: filterEvents(sortedEvents, "today", referenceDate).length },
    { key: "week", labelKey: "week7DayHorizon", count: filterEvents(sortedEvents, "week", referenceDate).length },
    { key: "free", labelKey: "freeEvents", count: filterEvents(sortedEvents, "free", referenceDate).length },
  ];

  function renderVenueDensityChart() {
    if (venueCounts.length === 0) {
      return null;
    }

    const maxCount = Math.max(1, ...venueCounts.map((venue) => venue[1]));

    return (
      <article className="linked-events-panel linked-events-venue-panel">
        <header>
          <span>{tKey("linkedEvents.topVenues")}</span>
          <strong>{venueCounts.length} {tKey("linkedEvents.venues")}</strong>
        </header>
        <p className="linked-events-chart-description">
          {tKey("linkedEvents.clickAVenueToNarrowTheActivityList")}
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
                  <span>{count} {tKey("linkedEvents.events")}</span>
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
          <span>{tKey("linkedEvents.activityTags")}</span>
          <strong>{keywordCounts.length}</strong>
        </header>
        <p className="linked-events-chart-description">
          {tKey("linkedEvents.clickATagToFilterUpcomingActivities")}
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
    <section className="linked-events-page" aria-label={tKey("linkedEvents.linkedEventsDetail")}>
      <div className="linked-events-header">
        <div>
          <h2>{category.title ? dataLabel(category.title) : tKey("linkedEvents.linkedEvents")}</h2>
          <div className="linked-events-live-status">
            <span aria-hidden="true" />
            <strong>{translateEnumLabel(language, category.status)}</strong>
          </div>
        </div>
        <div>{source?.source_code.toUpperCase() ?? "LINKEDEVENTS"} / {sourceRun ? formatRelativeAge(sourceRun, language) : tKey("linkedEvents.notCollected")}</div>
      </div>

      <section className="linked-events-command" aria-label={tKey("linkedEvents.linkedEventsOperatingCondition")}>
        <article className={`linked-events-panel linked-events-hero linked-events-hero-${selectedTone}`}>
          <div className="linked-events-kicker">
            <span>{tKey("linkedEvents.selectedActivity")}</span>
            <time>{eventPrimaryTimeLabel(selectedEvent, referenceDate, language, tKey)}</time>
          </div>
          <div className="linked-events-focus">
            <span className="material-symbols-outlined linked-events-focus-icon" aria-hidden="true">
              event_available
            </span>
            <div>
              <strong>{selectedEvent?.title ?? tKey("linkedEvents.noUpcomingActivities")}</strong>
              <p>{selectedDescription}</p>
            </div>
          </div>
          <div className="linked-events-hero-footer linked-events-hero-footer-four">
            <div>
              <span>{tKey("linkedEvents.venue")}</span>
              <strong>{eventPlace(selectedEvent, tKey)}</strong>
            </div>
            <div>
              <span>{tKey("linkedEvents.ticketing")}</span>
              <strong>{eventTicketLabel(selectedEvent, tKey)}</strong>
            </div>
            <div>
              <span>{tKey("linkedEvents.duration")}</span>
              <strong>{selectedEvent ? formatDuration(selectedEvent.starts_at, selectedEvent.ends_at, language, tKey) : tKey("linkedEvents.durationUnavailable")}</strong>
            </div>
            <div>
              <span>{tKey("linkedEvents.activityType")}</span>
              <strong>{eventActivityType(selectedEvent, tKey)}</strong>
            </div>
          </div>
        </article>

        <article className="linked-events-panel linked-events-filter-panel">
          <header>
            <span>{tKey("linkedEvents.browseActivities")}</span>
            <strong>{filteredEvents.length}</strong>
          </header>
          <label className="linked-events-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              aria-label={tKey("linkedEvents.searchActivities")}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder={tKey("linkedEvents.searchByActivityVenueOrKeyword")}
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
                <span>{tKey(`linkedEvents.${option.labelKey}`)}</span>
                <strong>{option.count}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="linked-events-panel linked-events-category-panel">
          <header>
            <span>{tKey("linkedEvents.activityCategories")}</span>
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
                  <span>{tKey(`linkedEvents.${definition.labelKey}`)}</span>
                  <strong>{categoryCounts.get(definition.key) ?? 0}</strong>
                </button>
              );
            })}
          </div>
        </article>

      </section>

      <section className="linked-events-main-grid" aria-label={tKey("linkedEvents.linkedEventsScheduleAndDetail")}>
        <article className="linked-events-panel linked-events-timeline-panel">
          <header>
            <div>
              <span>{tKey("linkedEvents.activityList")}</span>
              <h3>{tKey("linkedEvents.activitiesValidFromSelectedTime")}</h3>
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
                  {tKey("linkedEvents.clearFilters")}
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", marginLeft: "4px" }}>close</span>
                </button>
              ) : (
                <strong>{filteredEvents.length} {tKey("linkedEvents.activities")}</strong>
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
                      <strong>{eventRailTimeLabel(event, referenceDate, language, tKey)}</strong>
                      <small>{eventRailDateLabel(event, referenceDate, language, tKey)}</small>
                    </span>
                    <span className="linked-events-row-main">
                      <strong>{event.title}</strong>
                      <span>{eventAddress(event, tKey)}</span>
                      {keywords.length > 0 ? (
                        <em>{keywords.join(" / ")}</em>
                      ) : null}
                    </span>
                    <span className="linked-events-row-meta">
                      {eventTicketLabel(event, tKey)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="linked-events-empty-state">{tKey("linkedEvents.noActivitiesMatchTheCurrentFilters")}</div>
            )}
          </div>
        </article>

        <aside className="linked-events-side-grid">
          <article className="linked-events-panel linked-events-inspector">
            <header>
              <span>{tKey("linkedEvents.activityDetails")}</span>
              <strong>{selectedEvent ? translateEnumLabel(language, selectedEvent.severity) : tKey("linkedEvents.missing")}</strong>
            </header>
            <div className="linked-events-inspector-body">
              <h3>{selectedEvent?.title ?? tKey("linkedEvents.noSelectedEvent")}</h3>
              <div className="linked-events-detail-tags">
                <span>{eventActivityType(selectedEvent, tKey)}</span>
                <span>{eventTicketLabel(selectedEvent, tKey)}</span>
                <span>{eventStatusLabel(eventStatus, language, tKey)}</span>
              </div>
              <p className="linked-events-description">{selectedDescription}</p>
              <dl>
                <div>
                  <dt>{tKey("linkedEvents.starts")}</dt>
                  <dd>{selectedEvent ? formatEventDateTime(selectedEvent.starts_at, language) : tKey("linkedEvents.notScheduled")}</dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.ends")}</dt>
                  <dd>{selectedEvent ? formatEventDateTime(selectedEvent.ends_at, language) : tKey("linkedEvents.notScheduled")}</dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.duration")}</dt>
                  <dd>{selectedEvent ? formatDuration(selectedEvent.starts_at, selectedEvent.ends_at, language, tKey) : tKey("linkedEvents.durationUnavailable")}</dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.address")}</dt>
                  <dd>
                    {eventAddress(selectedEvent, tKey)}
                    {attributeText(selectedEvent, "place_name") && (
                      <button
                        className="linked-events-inspector-filter-btn"
                        onClick={() => {
                          const place = eventPlace(selectedEvent, tKey);
                          setActiveVenue(activeVenue === place ? null : place);
                        }}
                        title={tKey("linkedEvents.filterByThisVenue")}
                        type="button"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>filter_list</span>
                      </button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.ticketing")}</dt>
                  <dd>{eventTicketLabel(selectedEvent, tKey)}</dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.organizer")}</dt>
                  <dd>{provider}</dd>
                </div>
                <div>
                  <dt>{tKey("linkedEvents.coordinate")}</dt>
                  <dd>{eventCoordinate(selectedEvent) ?? tKey("linkedEvents.coordinateUnavailable")}</dd>
                </div>
              </dl>

              <section className="linked-events-detail-section">
                <span>{tKey("linkedEvents.constraints")}</span>
                <div className="linked-events-meta-list">
                  {eventConstraints(selectedEvent, language, tKey).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <section className="linked-events-detail-section">
                <span>{tKey("linkedEvents.links")}</span>
                {eventDetailLinks.length > 0 ? (
                  <div className="linked-events-link-stack">
                    {eventDetailLinks.map((link) => (
                      <a href={link.url} key={`${link.label}-${link.url}`} rel="noreferrer" target="_blank">
                        <span>{link.label}</span>
                        <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p>{tKey("linkedEvents.noEventLinksWerePublished")}</p>
                )}
              </section>
            </div>
          </article>

          <article className="linked-events-panel linked-events-map-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "event_map_geometry",
                  label: tKey("linkedEvents.eventMapGeometry"),
                  t
                })}
              >
                {tKey("linkedEvents.eventMapGeometry")}
              </DataLabelWithHelp>
              <strong>{mappedEventCount}</strong>
            </header>
            <p className="linked-events-chart-description">
              {tKey("linkedEvents.geographicalEventDistributionInTheExpansionArea")}
            </p>
            <LinkedEventsCoordinateMap
              events={sortedEvents}
              formatNumber={formatCoordinateNumber}
              onEventSelect={handleEventMapSelect}
              placeLabel={placeLabel}
              selectedEventId={selectedEvent?.id ?? null}
              t={t}
              tKey={tKey}
            />
          </article>

          {renderVenueDensityChart()}
          {renderInteractiveKeywords()}
        </aside>
      </section>
    </section>
  );
}
