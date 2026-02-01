"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  formatTimestamp,
  severityTone,
  statusTone,
} from "@/features/shared/format";

import { categoryKeyDataItems } from "./category-metadata";
import { categoryVisibleToCurrentUser } from "./category-access";
import {
  categorySupportsCityScope,
  cityLabel,
  normalizeCityValue,
} from "./city-scope";
import { DataLabelWithHelp, dataHelpText } from "./data-help";
import {
  CityScopeSelector,
  DateScopeSelector,
  HistoricalWarningBanner,
  NotificationButton,
  PRIMARY_NAV_ITEMS,
  ThemeToggleButton,
  applyThemeMode,
  preferredThemeMode,
  saveCityValue,
  saveThemeMode,
  storedCityValue,
  storedThemeMode,
} from "./data-platform-shell";
import type { DashboardTone, NavItem, ThemeMode } from "./data-platform-shell";
import {
  I18nProvider,
  LanguageMode,
  LanguageSwitchButton,
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  translateDataLabel,
  translateEnumLabel,
  translateText,
} from "./i18n";
import {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformEvent,
  PlatformHistoryResponse,
  PlatformMetric,
  PlatformOverviewResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";
import {
  buildAirQualityRecentEvents,
  buildWeatherRecentEvents,
  curatedRecentEvents,
  eventAnchorId,
  eventNavigationId,
  eventTarget,
  recentEventDetails,
  RECENT_EVENT_LIMIT,
} from "./recent-events";
import { AirQualityWorkspace } from "./air-quality-workspace";
import { CityServicesWorkspace } from "./city-services-workspace";
import { EnergyWorkspace } from "./energy-workspace";
import { LinkedEventsWorkspace } from "./linked-events-workspace";
import { MobilityWorkspace } from "./mobility-workspace";
import type { MobilityTabKey } from "./mobility-workspace";
import { WeatherDetailView } from "./weather-detail-view";
import { WaterSnowWorkspace } from "./water-snow-workspace";
import { GeospatialWorkspace } from "./geospatial-workspace";
import { RegionalProfileWorkspace } from "./regional-profile-workspace";
import { SourceHealthStrip } from "./source-health-strip";
import { AssistantWidget } from "@/features/assistant-widget/assistant-widget";

type DataPlatformHomeProps = {
  airQuality: AirQualityCurrentResponse | null;
  apiBaseUrl: string;
  currentUserLabel: string;
  defaultUserId: string;
  initialCity: string;
  initialDate: string | null;
  initialView: string | null;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  history: PlatformHistoryResponse;
  overview: PlatformOverviewResponse | null;
  roadRail: RoadRailCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  weather: WeatherForecastResponse | null;
  error: string | null;
};

const CATEGORY_ICONS: Record<string, string> = {
  air: "air",
  city_services: "location_city",
  energy: "bolt",
  events: "event",
  geospatial: "map",
  mobility: "commute",
  regional_profile: "public",
  traffic: "traffic",
  transit: "directions_bus",
  water: "water_drop",
  weather: "cloud",
};

const STATUS_LABELS: Record<string, string> = {
  alert: "Alert",
  background: "Catalog",
  connected: "Active",
  failing: "Alert",
  healthy: "Healthy",
  inactive: "Inactive",
  pending: "Pending",
  planned: "Planned",
  stale: "Stale",
  watch: "Watch",
};

const BRAND_LOGO_SRC = "/brand/logo.png";
const NAV_QUERY_KEY = "view";
const MOBILITY_NAV_KEY = "mobility";
const MOBILITY_TAB_QUERY_KEY = "mobilityTab";
const EVENT_QUERY_KEY = "event";
const FALLBACK_NAV_KEY = "overview";
const READ_RECENT_EVENTS_STORAGE_KEY = "arkiwatch-read-recent-events-v1";

function currentSearchParams(
  fallbackParams: { toString: () => string },
): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams(fallbackParams.toString());
  }

  return new URLSearchParams(window.location.search);
}

function pathWithParams(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isMobilityCategoryKey(
  key: string | null | undefined,
): key is MobilityTabKey {
  return key === "transit" || key === "traffic";
}

function resolveMobilityTab(
  value: string | null | undefined,
): MobilityTabKey {
  return value === "traffic" ? "traffic" : "transit";
}

function mobilityAvailable(categories: PlatformCategory[]): boolean {
  return categories.some((category) => isMobilityCategoryKey(category.key));
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function mergeCategorySources(categories: PlatformCategory[]) {
  const sources = new Map<string, PlatformCategory["sources"][number]>();

  for (const category of categories) {
    for (const source of category.sources) {
      sources.set(source.id || source.source_code, source);
    }
  }

  return [...sources.values()];
}

function buildMobilityCategory(
  categories: PlatformCategory[],
  transit: TransitCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
): PlatformCategory | null {
  const mobilityCategories = categories.filter((category) =>
    isMobilityCategoryKey(category.key),
  );

  if (mobilityCategories.length === 0) {
    return null;
  }

  const activeTransitAlerts = transit?.quality.active_alert_count ?? 0;
  const activeRoadRailEvents = roadRail?.quality.active_event_count ?? 0;
  const activeEvents = activeTransitAlerts + activeRoadRailEvents;
  const sourceCodes = uniqueValues(
    mobilityCategories.flatMap((category) => category.source_codes),
  );
  const updatedAt =
    transit?.observed_at ??
    roadRail?.observed_at ??
    mobilityCategories
      .flatMap((category) => category.summary_metrics)
      .find((metric) => metric.updated_at)?.updated_at ??
    null;

  return {
    key: MOBILITY_NAV_KEY,
    title: "Mobility",
    description:
      "Transit service alerts and Digitraffic road and rail operations.",
    status: activeEvents > 0 ? "watch" : "connected",
    stage: "connected",
    priority: "P0",
    source_codes: sourceCodes,
    key_data_items: uniqueValues(
      mobilityCategories.flatMap((category) => categoryKeyDataItems(category)),
    ),
    summary_metrics: [
      {
        key: "active_events",
        label: "Active Events",
        value: String(activeEvents),
        tone: activeEvents > 0 ? "warn" : "good",
        unit: null,
        detail: null,
        updated_at: updatedAt,
        source_codes: sourceCodes,
      },
      {
        key: "transit_alerts",
        label: "Transit",
        value: String(activeTransitAlerts),
        tone: activeTransitAlerts > 0 ? "warn" : "good",
        unit: null,
        detail: null,
        updated_at: transit?.observed_at ?? null,
        source_codes: transit ? ["digitransit"] : [],
      },
      {
        key: "road_rail_events",
        label: "Road & Rail",
        value: String(activeRoadRailEvents),
        tone: activeRoadRailEvents > 0 ? "warn" : "good",
        unit: null,
        detail: null,
        updated_at: roadRail?.observed_at ?? null,
        source_codes: roadRail ? ["digitraffic"] : [],
      },
    ],
    visualizations: mobilityCategories.flatMap(
      (category) => category.visualizations,
    ),
    events: mobilityCategories.flatMap((category) => category.events),
    sources: mergeCategorySources(mobilityCategories),
  };
}

function mergeMobilityCategories(
  categories: PlatformCategory[],
  mobilityCategory: PlatformCategory | null,
): PlatformCategory[] {
  if (!mobilityCategory) {
    return categories;
  }

  const mergedCategories: PlatformCategory[] = [];
  let mobilityInserted = false;

  for (const category of categories) {
    if (isMobilityCategoryKey(category.key)) {
      if (!mobilityInserted) {
        mergedCategories.push(mobilityCategory);
        mobilityInserted = true;
      }
      continue;
    }

    mergedCategories.push(category);
  }

  return mobilityInserted
    ? mergedCategories
    : [...mergedCategories, mobilityCategory];
}

function statusLabel(
  category: PlatformCategory,
  language: LanguageMode,
): string {
  if (category.status in STATUS_LABELS) {
    return translateText(language, STATUS_LABELS[category.status]);
  }

  if (
    category.stage &&
    category.stage !== "connected" &&
    category.stage in STATUS_LABELS
  ) {
    return translateText(language, STATUS_LABELS[category.stage]);
  }

  return translateEnumLabel(language, category.status);
}

function categoryTone(category: PlatformCategory): DashboardTone {
  const tone = statusTone(category.status) as DashboardTone;
  if (tone !== "neutral") {
    return tone;
  }

  if (category.stage === "planned" || category.stage === "background") {
    return "neutral";
  }

  return "good";
}

function metricByKey(
  category: PlatformCategory,
  key: string,
): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function fallbackMetric(category: PlatformCategory): PlatformMetric | null {
  return (
    category.summary_metrics.find(
      (metric) =>
        ![
          "catalog_stage",
          "source_status",
          "active_events",
          "records_ingested",
        ].includes(metric.key),
    ) ??
    metricByKey(category, "records_ingested") ??
    metricByKey(category, "source_status")
  );
}

function numericPercent(value: string, fallback: number): number {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) {
    return fallback;
  }

  const numericValue = Number.parseFloat(match[0]);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(8, Math.min(100, numericValue));
}

function toneProgress(tone: DashboardTone): number {
  if (tone === "bad") {
    return 94;
  }
  if (tone === "warn") {
    return 42;
  }
  if (tone === "good") {
    return 78;
  }
  return 56;
}

function formatMetricValue(metric: PlatformMetric | null): string {
  if (!metric) {
    return "n/a";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function scoreLabel(
  score: number | null | undefined,
  fallback: string | null | undefined,
  language: LanguageMode,
): string {
  const labels = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];
  if (score === null || score === undefined) {
    return fallback ? translateText(language, fallback) : "n/a";
  }

  const label =
    labels[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "n/a";
  return translateText(language, label);
}

function displayTitle(
  category: PlatformCategory,
  language: LanguageMode,
): string {
  if (category.key === MOBILITY_NAV_KEY) {
    return translateText(language, "Mobility");
  }
  if (category.key === "air") {
    return translateText(language, "Air Quality");
  }
  if (category.key === "traffic") {
    return translateText(language, "Road & Rail");
  }
  if (category.key === "water") {
    return translateText(language, "Water & Snow");
  }
  if (category.key === "events") {
    return translateText(language, "Linked Events");
  }

  return translateText(language, category.title);
}

function matchesSearch(
  category: PlatformCategory,
  searchValue: string,
  language: LanguageMode,
): boolean {
  const query = searchValue.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    category.key,
    category.title,
    displayTitle(category, language),
    category.description,
    category.status,
    translateEnumLabel(language, category.status),
    category.stage ?? "",
    ...category.source_codes,
    ...categoryKeyDataItems(category),
    ...categoryKeyDataItems(category).map((item) =>
      translateDataLabel(language, item),
    ),
    ...category.summary_metrics.map(
      (metric) => `${metric.label} ${metric.value} ${metric.detail ?? ""}`,
    ),
    ...category.events.map((event) => `${event.title} ${event.body}`),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function eventMatchesSearch(
  event: PlatformEvent,
  searchValue: string,
  language: LanguageMode,
): boolean {
  const query = searchValue.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return `${event.title} ${event.body} ${event.category_key} ${event.severity} ${translateEnumLabel(language, event.severity)} ${event.source_codes.join(" ")}`
    .toLowerCase()
    .includes(query);
}

function signalReadout(
  category: PlatformCategory,
  weather: WeatherForecastResponse | null,
  airQuality: AirQualityCurrentResponse | null,
  energy: EnergyCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
  transit: TransitCurrentResponse | null,
  language: LanguageMode,
) {
  const tone = categoryTone(category);

  if (category.key === "weather") {
    const generatedAt =
      weather?.generated_at ??
      weather?.checked_at ??
      metricByKey(category, "source_status")?.updated_at;
    return {
      label: translateText(language, "Last Sync"),
      value: generatedAt
        ? formatTimestamp(generatedAt, "dateTime", language)
        : formatMetricValue(metricByKey(category, "source_status")),
      helpKey: "last_sync",
      progress: tone === "warn" ? 40 : toneProgress(tone),
      tone,
    };
  }

  if (category.key === "air") {
    const score = airQuality?.worst_score;
    return {
      label: translateText(language, "AQI Avg"),
      value:
        score === null || score === undefined
          ? formatMetricValue(fallbackMetric(category))
          : `${scoreLabel(score, airQuality?.worst_label, language)} (${Math.round(score)}/5)`,
      helpKey: "aqi_avg",
      progress:
        score === null || score === undefined
          ? toneProgress(tone)
          : Math.max(12, (score / 5) * 100),
      tone: score !== null && score !== undefined && score >= 4 ? "bad" : tone,
    };
  }

  if (category.key === MOBILITY_NAV_KEY) {
    const activeTransitAlerts = transit?.quality.active_alert_count ?? 0;
    const activeRoadRailEvents = roadRail?.quality.active_event_count ?? 0;
    const activeEvents = activeTransitAlerts + activeRoadRailEvents;
    const rawSignals =
      (transit?.quality.raw_alert_count ?? 0) +
      (roadRail?.quality.raw_message_count ?? 0);

    return {
      label: translateText(language, "Active Events"),
      value:
        rawSignals > 0 || activeEvents > 0
          ? `${activeEvents}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateText(language, "Nominal"),
      progress:
        rawSignals > 0
          ? Math.max(12, Math.min(100, (activeEvents / rawSignals) * 100))
          : category.events.length > 0
            ? Math.min(100, 28 + category.events.length * 14)
            : 85,
      tone: activeEvents > 0 ? "warn" : tone,
    };
  }

  if (category.key === "transit") {
    return {
      label: translateText(language, "Active Events"),
      value:
        transit?.quality.active_alert_count !== undefined
          ? `${transit.quality.active_alert_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateText(language, "Nominal"),
      helpKey: "active_events",
      progress:
        transit?.quality.raw_alert_count !== undefined
          ? Math.max(
              12,
              Math.min(
                100,
                (transit.quality.active_alert_count /
                  Math.max(1, transit.quality.raw_alert_count)) *
                  100,
              ),
            )
          : category.events.length > 0
            ? Math.min(100, 28 + category.events.length * 14)
            : 85,
      tone: transit && transit.quality.active_alert_count > 0 ? "warn" : tone,
    };
  }

  if (category.key === "traffic") {
    return {
      label: translateText(language, "Active Events"),
      value:
        roadRail?.quality.active_event_count !== undefined
          ? `${roadRail.quality.active_event_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateText(language, "Nominal"),
      helpKey: "active_events",
      progress:
        roadRail?.quality.raw_message_count !== undefined
          ? Math.max(
              12,
              Math.min(
                100,
                (roadRail.quality.active_event_count /
                  Math.max(1, roadRail.quality.raw_message_count)) *
                  100,
              ),
            )
          : category.events.length > 0
            ? Math.min(100, 28 + category.events.length * 14)
            : 85,
      tone: roadRail && roadRail.quality.active_event_count > 0 ? "warn" : tone,
    };
  }

  if (category.key === "energy") {
    const window = energy?.current_window;
    return {
      label: translateText(
        language,
        window?.unit?.includes("kWh") ? "Best Price" : "Best Window",
      ),
      value:
        window !== null && window !== undefined
          ? `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
          : formatMetricValue(metricByKey(category, "low_energy_window")),
      helpKey: window?.unit?.includes("kWh") ? "best_price" : "best_window",
      progress:
        energy?.quality.field_coverage_pct !== undefined
          ? Math.max(8, Math.min(100, energy.quality.field_coverage_pct))
          : toneProgress(tone),
      tone: window ? "good" : tone,
    };
  }

  if (category.key === "events") {
    const freeMetric = metricByKey(category, "free_events");
    return {
      label: translateText(language, "Upcoming Events"),
      value:
        category.events.length > 0
          ? `${category.events.length}`
          : formatMetricValue(metricByKey(category, "active_events")),
      helpKey: "upcoming_events",
      progress:
        category.events.length > 0
          ? Math.min(100, 22 + category.events.length * 10)
          : toneProgress(tone),
      tone: freeMetric && freeMetric.value !== "0" ? "good" : tone,
    };
  }

  const metric = fallbackMetric(category);
  return {
    label: metric?.label
      ? translateText(language, metric.label)
      : translateText(language, "Signal Level"),
    value: formatMetricValue(metric),
    helpKey: metric?.key ?? "signal_level",
    progress: metric
      ? numericPercent(metric.value, toneProgress(tone))
      : toneProgress(tone),
    tone,
  };
}

function categoryByKey(
  categories: PlatformCategory[],
  key: string | undefined,
): PlatformCategory | null {
  if (!key) {
    return null;
  }

  return categories.find((category) => category.key === key) ?? null;
}

function eventCategoryLabel(
  categories: PlatformCategory[],
  event: PlatformEvent,
  language: LanguageMode,
): string {
  return displayTitle(
    categories.find((category) => category.key === event.category_key) ?? {
      key: event.category_key,
      title: titleCase(event.category_key),
      description: "",
      status: "neutral",
      source_codes: [],
      summary_metrics: [],
      visualizations: [],
      events: [],
      sources: [],
    },
    language,
  );
}

function eventTimeLabel(
  categories: PlatformCategory[],
  event: PlatformEvent,
  language: LanguageMode,
  t: (value: string) => string,
): string {
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt = new Date(event.ends_at).getTime();
  const now = Date.now();
  const categoryLabel = eventCategoryLabel(categories, event, language);

  if (Number.isFinite(startsAt) && Number.isFinite(endsAt)) {
    if (startsAt <= now && endsAt >= now) {
      return `${t("Ongoing until")} ${formatTimestamp(event.ends_at, "dateTime", language)} - ${categoryLabel}`;
    }

    if (endsAt < now) {
      return `${t("Ended")} ${formatTimestamp(event.ends_at, "dateTime", language)} - ${categoryLabel}`;
    }
  }

  return `${formatTimestamp(event.starts_at, "dateTime", language)} - ${categoryLabel}`;
}

function eventSeverityRank(event: PlatformEvent): number {
  switch (event.severity.toUpperCase()) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

const NOTIFICATION_EVENT_TYPES = new Set([
  "air_quality_poor",
  "air_quality_status",
  "blue_green_algae",
  "cheap_energy_window",
  "drought_risk",
  "flood_warning",
  "rain_risk",
  "rail_delay",
  "road_disruption",
  "road_weather_risk",
  "service_closure",
  "snow_load",
  "transit_delay",
  "transit_disruption",
  "weather_outlook",
]);

function isNotificationEvent(event: PlatformEvent): boolean {
  return (
    NOTIFICATION_EVENT_TYPES.has(event.event_type) ||
    eventSeverityRank(event) > 0
  );
}

function pickPriorityEvent(events: PlatformEvent[]): PlatformEvent | null {
  return (
    [...events].sort((left, right) => {
      const severityDiff = eventSeverityRank(right) - eventSeverityRank(left);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      return (
        new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime()
      );
    })[0] ?? null
  );
}

function notificationToneForEvents(events: PlatformEvent[]): DashboardTone {
  if (events.some((event) => eventSeverityRank(event) >= 3)) {
    return "bad";
  }

  if (events.length > 0) {
    return "warn";
  }

  return "neutral";
}

function loadReadRecentEventIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const value = window.localStorage.getItem(READ_RECENT_EVENTS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function saveReadRecentEventIds(ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      READ_RECENT_EVENTS_STORAGE_KEY,
      JSON.stringify([...ids].slice(-400)),
    );
  } catch {
    // Notification read state is helpful, but navigation should still work without storage.
  }
}

function activeEventLabel(count: number, language: LanguageMode): string {
  return `${count} ${translateText(language, count === 1 ? "active event" : "active events")}`;
}

function attributeLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatAttributeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    const primitiveValues = value
      .map((item) => formatAttributeValue(item))
      .filter((item): item is string => Boolean(item));

    if (value.every((item) => typeof item !== "object" || item === null)) {
      const preview = primitiveValues.slice(0, 6).join(", ");
      return value.length > 6 ? `${preview} +${value.length - 6}` : preview;
    }

    const firstValue = primitiveValues[0];
    return firstValue
      ? `${value.length} records · ${firstValue}`
      : `${value.length} records`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, formatAttributeValue(item)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    if (entries.length === 0) {
      return null;
    }

    return entries
      .slice(0, 4)
      .map(([key, item]) => `${attributeLabel(key)}: ${item}`)
      .join("; ");
  }

  return String(value);
}

function eventAttributeRows(
  event: PlatformEvent,
): Array<{ label: string; value: string }> {
  return Object.entries(event.attributes ?? {})
    .map(([key, value]) => ({
      label: attributeLabel(key),
      value: formatAttributeValue(value),
    }))
    .filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function navItemAvailable(
  item: NavItem,
  categories: PlatformCategory[],
): boolean {
  if (item.key === MOBILITY_NAV_KEY) {
    return mobilityAvailable(categories);
  }

  if (!categoryVisibleToCurrentUser(item.categoryKey ?? item.key)) {
    return false;
  }

  if (!item.categoryKey) {
    return true;
  }

  return categories.some((category) => category.key === item.categoryKey);
}

function resolveNavKey(
  requestedKey: string | null,
  categories: PlatformCategory[],
): string {
  if (!requestedKey || requestedKey === FALLBACK_NAV_KEY) {
    return FALLBACK_NAV_KEY;
  }

  if (requestedKey === MOBILITY_NAV_KEY || isMobilityCategoryKey(requestedKey)) {
    return mobilityAvailable(categories) ? MOBILITY_NAV_KEY : FALLBACK_NAV_KEY;
  }

  if (!categoryVisibleToCurrentUser(requestedKey)) {
    return FALLBACK_NAV_KEY;
  }

  const primaryNavItem = PRIMARY_NAV_ITEMS.find(
    (item) => item.key === requestedKey,
  );
  if (primaryNavItem) {
    if (!categoryVisibleToCurrentUser(primaryNavItem.categoryKey)) {
      return FALLBACK_NAV_KEY;
    }

    return requestedKey;
  }

  return categories.some(
    (category) =>
      category.key === requestedKey && categoryVisibleToCurrentUser(category.key),
  )
    ? requestedKey
    : FALLBACK_NAV_KEY;
}

function platformSignalStats(
  categories: PlatformCategory[],
  overview: PlatformOverviewResponse | null,
) {
  const keyFields = categories.reduce(
    (total, category) => total + categoryKeyDataItems(category).length,
    0,
  );
  const activeEvents = categories.reduce(
    (total, category) => total + category.events.length,
    0,
  );

  return {
    dataStreams: categories.length,
    activeEvents,
    dataSources: overview?.sources.length ?? 0,
    keyFields,
  };
}

export function DataPlatformHome({
  airQuality,
  apiBaseUrl,
  currentUserLabel,
  defaultUserId,
  initialCity,
  initialDate,
  initialView,
  energy,
  householdEnergy,
  history,
  overview,
  roadRail,
  transit,
  weather,
  error,
}: DataPlatformHomeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialNavCategories = (overview?.categories ?? []).filter((category) =>
    categoryVisibleToCurrentUser(category.key),
  );
  const [selectedNavKey, setSelectedNavKey] = useState(() =>
    resolveNavKey(initialView ?? searchParams.get(NAV_QUERY_KEY), initialNavCategories),
  );
  const [selectedMobilityTab, setSelectedMobilityTab] = useState<MobilityTabKey>(
    () =>
      resolveMobilityTab(
        searchParams.get(MOBILITY_TAB_QUERY_KEY) ??
          searchParams.get(NAV_QUERY_KEY),
      ),
  );
  const [searchValue, setSearchValue] = useState("");
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [readRecentEventIds, setReadRecentEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("en");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSideNavHidden, setIsSideNavHidden] = useState(false);
  const [selectedCity, setSelectedCity] = useState(() =>
    normalizeCityValue(initialCity),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialDate ?? null,
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const hasMountedRef = useRef(false);
  const [isCityRefreshPending, startCityRefresh] = useTransition();
  const [isDateRefreshPending, startDateRefresh] = useTransition();
  const t = (value: string) => translateText(languageMode, value);
  const highlightedEventId = searchParams.get(EVENT_QUERY_KEY);
  const activeTimeScope =
    overview?.time_scope ??
    weather?.time_scope ??
    airQuality?.time_scope ??
    energy?.time_scope ??
    householdEnergy?.time_scope ??
    roadRail?.time_scope ??
    transit?.time_scope ??
    null;
  const historicalDate =
    activeTimeScope?.mode === "historical"
      ? activeTimeScope.date ?? selectedDate
      : selectedDate;
  const isHistorical = historicalDate !== null;

  const [isRefreshing, setIsRefreshing] = useState(false);

  async function triggerDataRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/sources/refresh`, {
        method: "POST"
      });
      if (response.ok) {
        router.refresh();
      } else {
        console.error("Failed to refresh data sources");
      }
    } catch (err) {
      console.error("Error refreshing data sources:", err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", {
      method: "POST",
    }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  const categories = useMemo(
    () =>
      (overview?.categories ?? []).filter((category) =>
        categoryVisibleToCurrentUser(category.key),
      ),
    [overview],
  );
  const transitCategory = useMemo(
    () => categoryByKey(categories, "transit"),
    [categories],
  );
  const roadRailCategory = useMemo(
    () => categoryByKey(categories, "traffic"),
    [categories],
  );
  const mobilityCategory = useMemo(
    () => buildMobilityCategory(categories, transit, roadRail),
    [categories, roadRail, transit],
  );
  const displayCategories = useMemo(
    () => mergeMobilityCategories(categories, mobilityCategory),
    [categories, mobilityCategory],
  );
  const recentEventCandidates = useMemo(
    () =>
      [
        ...buildWeatherRecentEvents(weather, { city: selectedCity }),
        ...buildAirQualityRecentEvents(airQuality),
        ...categories.flatMap((category) => category.events),
        ...(overview?.recent_events ?? []),
      ].filter((event) => categoryVisibleToCurrentUser(event.category_key)),
    [airQuality, categories, overview, selectedCity, weather],
  );
  const recentEvents = useMemo(
    () =>
      curatedRecentEvents(recentEventCandidates, RECENT_EVENT_LIMIT, {
        city: selectedCity,
      }),
    [recentEventCandidates, selectedCity],
  );
  const sources = useMemo(
    () =>
      (overview?.sources ?? []).filter((source) => {
        const sourceCategories = source.categories ?? [];
        return (
          sourceCategories.length === 0 ||
          sourceCategories.some(categoryVisibleToCurrentUser)
        );
      }),
    [overview],
  );
  const visibleOverview = useMemo(
    () =>
      overview
        ? {
            ...overview,
            categories: displayCategories,
            recent_events: recentEvents,
            sources,
          }
        : null,
    [displayCategories, overview, recentEvents, sources],
  );
  const updateNavQuery = useCallback(
    (
      nextNavKey: string,
      options: { mobilityTab?: MobilityTabKey } = {},
    ): void => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextNavKey === FALLBACK_NAV_KEY) {
        nextParams.delete(NAV_QUERY_KEY);
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
      } else if (nextNavKey === MOBILITY_NAV_KEY) {
        nextParams.set(NAV_QUERY_KEY, MOBILITY_NAV_KEY);
        nextParams.set(
          MOBILITY_TAB_QUERY_KEY,
          options.mobilityTab ?? selectedMobilityTab,
        );
      } else {
        nextParams.set(NAV_QUERY_KEY, nextNavKey);
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
      }
      nextParams.delete(EVENT_QUERY_KEY);

      const nextPath = nextParams.toString();
      router.replace(nextPath ? `${pathname}?${nextPath}` : pathname);
    },
    [pathname, router, searchParams, selectedMobilityTab],
  );
  const selectNav = useCallback(
    (nextNavKey: string): void => {
      const nextMobilityTab = isMobilityCategoryKey(nextNavKey)
        ? nextNavKey
        : selectedMobilityTab;
      const resolvedNavKey = resolveNavKey(nextNavKey, categories);
      if (resolvedNavKey === MOBILITY_NAV_KEY) {
        setSelectedMobilityTab(nextMobilityTab);
      }
      setSelectedNavKey(resolvedNavKey);
      updateNavQuery(resolvedNavKey, { mobilityTab: nextMobilityTab });
    },
    [categories, selectedMobilityTab, updateNavQuery],
  );
  const selectMobilityTab = useCallback(
    (nextMobilityTab: MobilityTabKey): void => {
      setSelectedMobilityTab(nextMobilityTab);
      setSelectedNavKey(MOBILITY_NAV_KEY);
      updateNavQuery(MOBILITY_NAV_KEY, { mobilityTab: nextMobilityTab });
    },
    [updateNavQuery],
  );
  const selectedCategory =
    selectedNavKey === FALLBACK_NAV_KEY
      ? null
      : categoryByKey(displayCategories, selectedNavKey);
  const signalStats = useMemo(
    () => platformSignalStats(displayCategories, visibleOverview),
    [displayCategories, visibleOverview],
  );
  const selectedCategories = selectedCategory ? [selectedCategory] : displayCategories;
  const visibleCategories = selectedCategories.filter((category) =>
    matchesSearch(category, searchValue, languageMode),
  );
  const visibleEvents = (
    selectedCategory
      ? curatedRecentEvents(selectedCategory.events, RECENT_EVENT_LIMIT, {
          city: selectedCity,
        })
      : recentEvents
  ).filter((event) => eventMatchesSearch(event, searchValue, languageMode));
  const unreadVisibleEvents = visibleEvents.filter(
    (event) => !readRecentEventIds.has(event.id),
  );
  const latestVisibleEvent = visibleEvents[0] ?? null;
  const latestUnreadEvent = unreadVisibleEvents[0] ?? latestVisibleEvent;
  const visibleNotificationEvents = visibleEvents.filter(isNotificationEvent);
  const latestEventTone = notificationToneForEvents(
    unreadVisibleEvents.length > 0 ? unreadVisibleEvents : visibleNotificationEvents,
  );
  const unreadRecentEvents = recentEvents.filter(
    (event) => !readRecentEventIds.has(event.id),
  );
  const recentNotificationCount = unreadRecentEvents.length;
  const recentNotificationTone = notificationToneForEvents(unreadRecentEvents);
  const eventById = useMemo(() => {
    const events = [
      ...recentEvents,
      ...displayCategories.flatMap((category) => category.events),
    ];
    return new Map(events.map((event) => [event.id, event]));
  }, [displayCategories, recentEvents]);
  const selectedEvent = selectedEventId
    ? (eventById.get(selectedEventId) ?? null)
    : null;
  const selectedEventRows = selectedEvent ? eventAttributeRows(selectedEvent) : [];
  const priorityVisibleEvent = pickPriorityEvent(visibleNotificationEvents);
  const overallScopeLabel = selectedCategory
    ? displayTitle(selectedCategory, languageMode)
    : t("Overall");
  const overallNotificationTitle =
    visibleNotificationEvents.length > 0
      ? `${overallScopeLabel} · ${activeEventLabel(
          visibleNotificationEvents.length,
          languageMode,
        )}`
      : `${overallScopeLabel} · ${t("No active notifications")}`;
  const overallNotificationBody = priorityVisibleEvent
    ? `${eventCategoryLabel(categories, priorityVisibleEvent, languageMode)} · ${priorityVisibleEvent.title}`
    : t("No active cross-signal notifications in this view.");
  const overallNotificationDetail =
    priorityVisibleEvent?.body ??
    t("Recent events remain available below for source-level inspection.");
  const isWeatherDetail = selectedCategory?.key === "weather";
  const isAirDetail = selectedCategory?.key === "air";
  const isEnergyDetail = selectedCategory?.key === "energy";
  const isMobilityDetail = selectedCategory?.key === MOBILITY_NAV_KEY;
  const isWaterDetail = selectedCategory?.key === "water";
  const isCityServicesDetail = selectedCategory?.key === "city_services";
  const isLinkedEventsDetail = selectedCategory?.key === "events";
  const isGeospatialDetail = selectedCategory?.key === "geospatial";
  const isRegionalProfileDetail = selectedCategory?.key === "regional_profile";
  const isDetailPage =
    isWeatherDetail ||
    isAirDetail ||
    isEnergyDetail ||
    isMobilityDetail ||
    isWaterDetail ||
    isCityServicesDetail ||
    isLinkedEventsDetail ||
    isGeospatialDetail ||
    isRegionalProfileDetail;
  const showsWorkspaceTopbar = isDetailPage || selectedNavKey === FALLBACK_NAV_KEY;

  function selectNavItem(item: NavItem): void {
    selectNav(item.categoryKey ?? item.key);
    setIsMobileMenuOpen(false);
  }

  function openRecentEventsPanel(): void {
    if (selectedNavKey === FALLBACK_NAV_KEY && isEventsExpanded) {
      setIsEventsExpanded(false);
    } else {
      selectNav(FALLBACK_NAV_KEY);
      setSearchValue("");
      setIsEventsExpanded(true);
    }
  }

  function markRecentEventRead(eventId: string): void {
    setReadRecentEventIds((currentIds) => {
      if (currentIds.has(eventId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      nextIds.add(eventId);
      saveReadRecentEventIds(nextIds);
      return nextIds;
    });
  }

  function openRecentEvent(event: PlatformEvent): void {
    const target = eventTarget(event);
    const nextParams = new URLSearchParams(searchParams.toString());
    markRecentEventRead(event.id);
    setSearchValue("");
    setIsEventsExpanded(false);

    if (target.navKey === FALLBACK_NAV_KEY) {
      nextParams.delete(NAV_QUERY_KEY);
      nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    } else {
      nextParams.set(NAV_QUERY_KEY, target.navKey);
      if (target.mobilityTab) {
        nextParams.set(MOBILITY_TAB_QUERY_KEY, target.mobilityTab);
        setSelectedMobilityTab(target.mobilityTab);
      } else {
        nextParams.delete(MOBILITY_TAB_QUERY_KEY);
      }
    }
    nextParams.set(EVENT_QUERY_KEY, eventNavigationId(event));
    setSelectedNavKey(target.navKey);

    const nextPath = nextParams.toString();
    router.replace(nextPath ? `${pathname}?${nextPath}` : pathname);
  }

  const replaceCityParam = useCallback(
    (nextCity: string): void => {
      const nextParams = currentSearchParams(searchParams);
      nextParams.set("city", nextCity);
      nextParams.delete(EVENT_QUERY_KEY);
      startCityRefresh(() => {
        router.replace(pathWithParams(pathname, nextParams));
      });
    },
    [pathname, router, searchParams, startCityRefresh],
  );

  const replaceDateParam = useCallback(
    (nextDate: string | null): void => {
      const nextParams = currentSearchParams(searchParams);
      if (nextDate) {
        nextParams.set("date", nextDate);
      } else {
        nextParams.delete("date");
      }
      nextParams.delete(EVENT_QUERY_KEY);
      startDateRefresh(() => {
        router.replace(pathWithParams(pathname, nextParams));
      });
    },
    [pathname, router, searchParams, startDateRefresh],
  );

  useEffect(() => {
    setReadRecentEventIds(loadReadRecentEventIds());
  }, []);

  useEffect(() => {
    const nextThemeMode = storedThemeMode() ?? preferredThemeMode();

    setThemeMode(nextThemeMode);
    applyThemeMode(nextThemeMode);
  }, []);

  useEffect(() => {
    const nextLanguageMode = storedLanguageMode() ?? preferredLanguageMode();

    setLanguageMode(nextLanguageMode);
    applyLanguageMode(nextLanguageMode);
  }, []);

  useEffect(() => {
    setSelectedCity(normalizeCityValue(initialCity));
  }, [initialCity]);

  useEffect(() => {
    setSelectedDate(initialDate ?? null);
  }, [initialDate]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const nextRequestedKey = searchParams.get(NAV_QUERY_KEY);
    const nextMobilityTab = resolveMobilityTab(
      searchParams.get(MOBILITY_TAB_QUERY_KEY) ?? nextRequestedKey,
    );
    const nextNavKey = resolveNavKey(nextRequestedKey, categories);
    if (nextNavKey === MOBILITY_NAV_KEY) {
      setSelectedMobilityTab(nextMobilityTab);
    }
    setSelectedNavKey((currentNavKey) =>
      currentNavKey === nextNavKey ? currentNavKey : nextNavKey,
    );
  }, [categories, searchParams]);

  useEffect(() => {
    if (searchParams.has("date") && selectedDate === null) {
      replaceDateParam(null);
    }
  }, [replaceDateParam, searchParams, selectedDate]);

  useEffect(() => {
    if (searchParams.has("city")) {
      saveCityValue(selectedCity);
      return;
    }

    const storedCity = storedCityValue();
    if (storedCity && storedCity !== selectedCity) {
      setSelectedCity(storedCity);
      replaceCityParam(storedCity);
    }
  }, [replaceCityParam, searchParams, selectedCity]);

  useEffect(() => {
    if (!highlightedEventId || !isDetailPage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const element = document.getElementById(eventAnchorId(highlightedEventId));
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("event-anchor-active");
      window.setTimeout(() => {
        element.classList.remove("event-anchor-active");
      }, 1800);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [highlightedEventId, isDetailPage, selectedMobilityTab, selectedNavKey]);

  function toggleThemeMode(): void {
    setThemeMode((currentThemeMode) => {
      const nextThemeMode = currentThemeMode === "dark" ? "light" : "dark";

      applyThemeMode(nextThemeMode);
      saveThemeMode(nextThemeMode);

      return nextThemeMode;
    });
  }

  function selectLanguageMode(nextLanguageMode: LanguageMode): void {
    setLanguageMode(nextLanguageMode);
    applyLanguageMode(nextLanguageMode);
    saveLanguageMode(nextLanguageMode);
  }

  function selectCity(nextCityValue: string): void {
    const nextCity = normalizeCityValue(nextCityValue);
    setSelectedCity(nextCity);
    saveCityValue(nextCity);
    replaceCityParam(nextCity);
  }

  function selectDate(nextDate: string | null): void {
    setSelectedDate(nextDate);
    replaceDateParam(nextDate);
  }

  const dashboardShellClassName = isSideNavHidden
    ? "dashboard-shell dashboard-shell-nav-hidden"
    : "dashboard-shell";
  const sideNavClassName = [
    isDetailPage
      ? "dashboard-side-nav detail-side-nav"
      : "dashboard-side-nav",
    isMobileMenuOpen ? "mobile-side-nav-open" : "",
    isSideNavHidden ? "dashboard-side-nav-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const restoreSideNavButton = isSideNavHidden ? (
    <button
      className="icon-button side-nav-restore-button"
      aria-label={t("Show navigation")}
      onClick={() => setIsSideNavHidden(false)}
      title={t("Show navigation")}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        keyboard_double_arrow_right
      </span>
    </button>
  ) : null;
  const themeActionLabel = t(
    themeMode === "light" ? "Switch to night theme" : "Switch to day theme",
  );

  return (
    <I18nProvider language={languageMode}>
      <div className={dashboardShellClassName}>
        <aside
          className={sideNavClassName}
          aria-label={t("Primary navigation")}
        >
          <div className="brand-panel">
            <div className="brand-icon" aria-hidden="true">
              <Image
                alt=""
                className="brand-logo-image"
                height={96}
                priority
                src={BRAND_LOGO_SRC}
                width={96}
              />
            </div>
            <div className="brand-copy">
              <h1 className="brand-title-main">ArkiWatch</h1>
              <p className="brand-title-subtitle">{t("Data Platform")}</p>
            </div>
            <button
              className="icon-button side-nav-collapse-button"
              aria-label={t("Hide navigation")}
              onClick={() => setIsSideNavHidden(true)}
              title={t("Hide navigation")}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                keyboard_double_arrow_left
              </span>
            </button>
          </div>

          <nav className="side-nav-list" aria-label={t("Signal navigation")}>
            {PRIMARY_NAV_ITEMS.filter((item) =>
              navItemAvailable(item, categories),
            ).map((item) => {
              const isActive =
                selectedNavKey === item.key ||
                selectedNavKey === item.categoryKey ||
                (item.key === "overview" && !selectedCategory);
              return (
                <button
                  className={isActive ? "nav-row nav-row-active" : "nav-row"}
                  key={item.key}
                  onClick={() => selectNavItem(item)}
                  title={t(item.label)}
                  type="button"
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </nav>

          <nav className="side-nav-footer" aria-label={t("System controls")}>
            <div className="side-nav-utility-group">
              <button
                className="nav-row side-nav-utility-row"
                aria-label={t("Settings")}
                title={t("Settings")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>
                <span>{t("Settings")}</span>
              </button>
              <button
                className="nav-row side-nav-utility-row"
                aria-label={themeActionLabel}
                onClick={toggleThemeMode}
                title={themeActionLabel}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {themeMode === "light" ? "dark_mode" : "light_mode"}
                </span>
                <span>{t("Theme mode")}</span>
              </button>
              <div
                className="nav-row side-nav-utility-row side-nav-user-row"
                aria-label={t("Signed in")}
                title={currentUserLabel}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  manage_accounts
                </span>
                <span>{currentUserLabel}</span>
              </div>
              <button
                className="nav-row side-nav-utility-row"
                aria-label={t("Sign out")}
                onClick={signOut}
                title={t("Sign out")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  logout
                </span>
                <span>{t("Sign out")}</span>
              </button>
            </div>
          </nav>
        </aside>
        {isMobileMenuOpen ? (
          <div
            className="mobile-side-nav-backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <div className="dashboard-app">
          <header className="mobile-dashboard-header">
            <div className="mobile-brand">
              <button
                className="icon-button"
                aria-label={t("Open navigation")}
                onClick={() => setIsMobileMenuOpen(true)}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  menu
                </span>
              </button>
              <span className="mobile-brand-mark" aria-hidden="true">
                <Image
                  alt=""
                  className="brand-logo-image"
                  height={96}
                  src={BRAND_LOGO_SRC}
                  width={96}
                />
              </span>
              <strong>ArkiWatch</strong>
            </div>
            <div className="top-actions">
              <div className="mobile-scope-switchers">
                <CityScopeSelector
                  city={selectedCity}
                  isPending={isCityRefreshPending}
                  language={languageMode}
                  onCityChange={selectCity}
                />
                <DateScopeSelector
                  date={selectedDate}
                  isPending={isDateRefreshPending}
                  language={languageMode}
                  onDateChange={selectDate}
                />
              </div>
              <div className="mobile-utility-actions">
                <LanguageSwitchButton
                  language={languageMode}
                  onLanguageChange={selectLanguageMode}
                />
                <ThemeToggleButton
                  language={languageMode}
                  themeMode={themeMode}
                  onToggle={toggleThemeMode}
                />
                {!isDetailPage && !isHistorical ? (
                  <button
                    className="icon-button theme-toggle-button refresh-button"
                    aria-label={t("Refresh data")}
                    disabled={isRefreshing}
                    onClick={triggerDataRefresh}
                    title={t("Refresh data")}
                    type="button"
                  >
                    <span
                      className={`material-symbols-outlined ${isRefreshing ? "spin-animation" : ""}`}
                      aria-hidden="true"
                    >
                      refresh
                    </span>
                  </button>
                ) : null}
                <NotificationButton
                  count={recentNotificationCount}
                  isActive={isEventsExpanded && !isDetailPage}
                  language={languageMode}
                  onClick={openRecentEventsPanel}
                  tone={recentNotificationTone}
                />
                <button
                  className="icon-button"
                  aria-label={t("Settings")}
                  type="button"
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    settings
                  </span>
                </button>
                <span
                  className="profile-avatar"
                  aria-label={t("Signed in")}
                  title={currentUserLabel}
                >
                  {currentUserLabel.slice(0, 2).toUpperCase()}
                </span>
                <button
                  className="icon-button"
                  aria-label={t("Sign out")}
                  onClick={signOut}
                  title={t("Sign out")}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    logout
                  </span>
                </button>
              </div>
            </div>
          </header>

          {showsWorkspaceTopbar ? (
            <header className="detail-topbar">
              <div className="detail-topbar-brand">
                {restoreSideNavButton}
                <span className="detail-topbar-mark" aria-hidden="true">
                  <Image
                    alt=""
                    className="brand-logo-image"
                    height={96}
                    src={BRAND_LOGO_SRC}
                    width={96}
                  />
                </span>
                <strong>ArkiWatch</strong>
              </div>
              {isDetailPage ? (
                <nav aria-label={t("Detail workspace navigation")}>
                  <button
                    onClick={() => selectNav(FALLBACK_NAV_KEY)}
                    type="button"
                  >
                    {t("Overview")}
                  </button>
                  <button className="active" type="button">
                    {t("Dashboard")}
                  </button>
                  <button type="button">{t("Analytics")}</button>
                </nav>
              ) : null}
              <div className="detail-topbar-actions">
                <CityScopeSelector
                  city={selectedCity}
                  isPending={isCityRefreshPending}
                  language={languageMode}
                  onCityChange={selectCity}
                />
                <DateScopeSelector
                  date={selectedDate}
                  isPending={isDateRefreshPending}
                  language={languageMode}
                  onDateChange={selectDate}
                />
                <LanguageSwitchButton
                  language={languageMode}
                  onLanguageChange={selectLanguageMode}
                />
                <NotificationButton
                  count={recentNotificationCount}
                  isActive={isEventsExpanded && !isDetailPage}
                  language={languageMode}
                  onClick={openRecentEventsPanel}
                  tone={recentNotificationTone}
                />
                <button
                  className="icon-button"
                  aria-label={t("Sign out")}
                  onClick={signOut}
                  title={t("Sign out")}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    logout
                  </span>
                </button>
              </div>
            </header>
          ) : null}

          <main
            className={
              isDetailPage
                ? "dashboard-content detail-content-shell"
                : "dashboard-content"
            }
          >
            {isHistorical && historicalDate ? (
              <HistoricalWarningBanner
                date={historicalDate}
                language={languageMode}
                onReturnToLive={() => selectDate(null)}
                timeScope={activeTimeScope}
              />
            ) : null}
            {!showsWorkspaceTopbar ? (
              <div className="desktop-dashboard-header">
                <div className="desktop-dashboard-heading">
                  {restoreSideNavButton}
                  <div className="desktop-dashboard-heading-copy">
                    <h2>
                      {selectedCategory
                        ? `${displayTitle(selectedCategory, languageMode)} ${t("Dashboard")}`
                        : t("Overview")}
                    </h2>
                    {selectedCategory ? (
                      <p>{selectedCategory.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="desktop-controls">
                  <label className="dashboard-search">
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      search
                    </span>
                    <input
                      onChange={(event) =>
                        setSearchValue(event.currentTarget.value)
                      }
                      placeholder={t("Search signals, events...")}
                      value={searchValue}
                    />
                  </label>
                  <CityScopeSelector
                    city={selectedCity}
                    isPending={isCityRefreshPending}
                    language={languageMode}
                    onCityChange={selectCity}
                  />
                  <DateScopeSelector
                    date={selectedDate}
                    isPending={isDateRefreshPending}
                    language={languageMode}
                    onDateChange={selectDate}
                  />
                  <LanguageSwitchButton
                    language={languageMode}
                    onLanguageChange={selectLanguageMode}
                  />
                  {!isHistorical ? (
                    <button
                      className="icon-button theme-toggle-button refresh-button"
                      aria-label={t("Refresh data")}
                      disabled={isRefreshing}
                      onClick={triggerDataRefresh}
                      title={t("Refresh data")}
                      type="button"
                    >
                      <span
                        className={`material-symbols-outlined ${isRefreshing ? "spin-animation" : ""}`}
                        aria-hidden="true"
                      >
                        refresh
                      </span>
                    </button>
                  ) : null}
                  <NotificationButton
                    count={recentNotificationCount}
                    isActive={isEventsExpanded && !isDetailPage}
                    language={languageMode}
                    onClick={openRecentEventsPanel}
                    tone={recentNotificationTone}
                  />
                  <button
                    className="icon-button"
                    aria-label={t("Sign out")}
                    onClick={signOut}
                    title={t("Sign out")}
                    type="button"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      logout
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {visibleOverview ? (
              isWeatherDetail ? (
                <WeatherDetailView
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  history={history.weather}
                  weather={weather}
                />
              ) : isAirDetail ? (
                <AirQualityWorkspace
                  airQuality={airQuality}
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  history={history.airQuality}
                />
              ) : isEnergyDetail ? (
                <EnergyWorkspace
                  category={selectedCategory}
                  energy={energy}
                  highlightedEventId={highlightedEventId}
                  history={history.energy}
                  householdEnergy={householdEnergy}
                  householdHistory={history.householdEnergy}
                />
              ) : isMobilityDetail ? (
                <MobilityWorkspace
                  activeTab={selectedMobilityTab}
                  highlightedEventId={highlightedEventId}
                  onTabChange={selectMobilityTab}
                  roadRail={roadRail}
                  roadRailCategory={roadRailCategory}
                  roadRailHistory={history.roadRail}
                  transit={transit}
                  transitCategory={transitCategory}
                  transitHistory={history.transit}
                />
              ) : isWaterDetail ? (
                <WaterSnowWorkspace category={selectedCategory} />
              ) : isCityServicesDetail ? (
                <CityServicesWorkspace category={selectedCategory} />
              ) : isLinkedEventsDetail ? (
                <LinkedEventsWorkspace
                  category={selectedCategory}
                  highlightedEventId={highlightedEventId}
                  checkedAt={visibleOverview.checked_at}
                  timeScope={visibleOverview.time_scope}
                />
              ) : isGeospatialDetail ? (
                <GeospatialWorkspace category={selectedCategory} />
              ) : isRegionalProfileDetail ? (
                <RegionalProfileWorkspace category={selectedCategory} />
              ) : (
                <>
                  <section
                    className="summary-grid"
                    aria-label={t("Platform summary")}
                  >
                    <article className="metric-tile metric-tile-live">
                      <div>
                        <DataLabelWithHelp
                          helpText={dataHelpText({
                            key: "live_data_streams",
                            label: "Live Data Streams",
                            t,
                          })}
                        >
                          {t("Live Data Streams")}
                        </DataLabelWithHelp>
                        <i aria-hidden="true" />
                      </div>
                      <strong>
                        {signalStats.dataStreams}
                        <small>{t("active")}</small>
                      </strong>
                    </article>
                    <article className="metric-tile">
                      <div>
                        <DataLabelWithHelp
                          helpText={dataHelpText({
                            key: "active_fields",
                            label: "Active Fields",
                            t,
                          })}
                        >
                          {t("Active Fields")}
                        </DataLabelWithHelp>
                        <span
                          className="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          data_array
                        </span>
                      </div>
                      <strong>
                        {signalStats.keyFields}
                        <small>{t("monitored")}</small>
                      </strong>
                    </article>
                    <article className="metric-tile metric-tile-events">
                      <div>
                        <DataLabelWithHelp
                          helpText={dataHelpText({
                            key: "active_events",
                            label: "Active Events",
                            t,
                          })}
                        >
                          {t("Active Events")}
                        </DataLabelWithHelp>
                        <i aria-hidden="true" />
                      </div>
                      <strong>
                        {signalStats.activeEvents}
                        <small>{t("unresolved")}</small>
                      </strong>
                    </article>
                    <article className="metric-tile">
                      <div>
                        <DataLabelWithHelp
                          helpText={dataHelpText({
                            key: "data_sources",
                            label: "Data Sources",
                            t,
                          })}
                        >
                          {t("Data Sources")}
                        </DataLabelWithHelp>
                        <span
                          className="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          hub
                        </span>
                      </div>
                      <strong>
                        {signalStats.dataSources}
                        <small>{t("connected")}</small>
                      </strong>
                    </article>
                  </section>

                  <SourceHealthStrip overview={visibleOverview} />

                  <div
                    className={
                      isEventsExpanded
                        ? "dashboard-main-grid"
                        : "dashboard-main-grid dashboard-main-grid-events-collapsed"
                    }
                  >
                    <section
                      className="signal-section"
                      aria-label={t("Signal status array")}
                    >
                      <h3>
                        <span
                          className="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          sensors
                        </span>
                        {t("Signal Status Array")}
                      </h3>

                      <div className="signal-grid">
                        {visibleCategories.length > 0 ? (
                          visibleCategories.map((category) => {
                            const readout = signalReadout(
                              category,
                              weather,
                              airQuality,
                              energy,
                              roadRail,
                              transit,
                              languageMode,
                            );
                            const tone = readout.tone;
                            const followsSelectedCity =
                              categorySupportsCityScope(category.key);
                            return (
                              <button
                                className={`signal-card signal-card-${tone}`}
                                key={category.key}
                                onClick={() => selectNav(category.key)}
                                type="button"
                              >
                                <span className="signal-card-top">
                                  <span className="signal-title">
                                    <span
                                      className="material-symbols-outlined"
                                      aria-hidden="true"
                                    >
                                      {CATEGORY_ICONS[category.key] ??
                                        "database"}
                                    </span>
                                    <strong>
                                      {displayTitle(category, languageMode)}
                                    </strong>
                                  </span>
                                  <span
                                    className={`status-badge status-badge-${tone}`}
                                  >
                                    {statusLabel(category, languageMode)}
                                  </span>
                                </span>
                                <span className="signal-card-bottom">
                                  <span className="signal-readout">
                                    <DataLabelWithHelp
                                      helpText={dataHelpText({
                                        key: readout.helpKey,
                                        label: readout.label,
                                        t,
                                      })}
                                    >
                                      {readout.label}
                                    </DataLabelWithHelp>
                                    <strong>{readout.value}</strong>
                                  </span>
                                  <span
                                    className={
                                      followsSelectedCity
                                        ? "signal-scope-chip signal-scope-chip-city"
                                        : "signal-scope-chip"
                                    }
                                  >
                                    <span
                                      className="material-symbols-outlined"
                                      aria-hidden="true"
                                    >
                                      {followsSelectedCity
                                        ? "location_on"
                                        : "public"}
                                    </span>
                                    <span>
                                      {followsSelectedCity
                                        ? cityLabel(selectedCity)
                                        : t("Regional scope")}
                                    </span>
                                  </span>
                                  <span
                                    className="signal-meter"
                                    aria-hidden="true"
                                  >
                                    <span
                                      style={{ width: `${readout.progress}%` }}
                                    />
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="dashboard-empty-state">
                            {t("No signal cards match the current search.")}
                          </div>
                        )}
                      </div>
                    </section>

                    {isEventsExpanded ? (
                      <aside
                        className="events-panel events-panel-expanded"
                        aria-label={t("Recent events")}
                      >
                        <header>
                          <button
                            aria-controls="recent-events-timeline"
                            aria-expanded={isEventsExpanded}
                            aria-label={t("Collapse recent events")}
                            className="events-panel-toggle"
                            onClick={() =>
                              setIsEventsExpanded((isExpanded) => !isExpanded)
                            }
                            type="button"
                          >
                            <span
                              className={`events-panel-icon events-panel-icon-${latestEventTone}`}
                              aria-hidden="true"
                            >
                              <span className="material-symbols-outlined">
                                notifications
                              </span>
                            </span>
                            <span className="events-panel-copy">
                              <span className="events-panel-title">
                                <span className="events-panel-heading">
                                  {t("Recent Events")}
                                </span>
                                <span className="events-count-badge">
                                  {unreadVisibleEvents.length}
                                </span>
                              </span>
                              <span className="events-panel-summary">
                                {latestUnreadEvent
                                  ? `${eventTimeLabel(categories, latestUnreadEvent, languageMode, t)} · ${latestUnreadEvent.title}`
                                  : t("No recent events match the current view.")}
                              </span>
                            </span>
                            <span
                              className="material-symbols-outlined events-panel-chevron"
                              aria-hidden="true"
                            >
                              expand_less
                            </span>
                          </button>
                        </header>
                        <div
                          className="event-timeline"
                          hidden={!isEventsExpanded}
                          id="recent-events-timeline"
                        >
                          <section
                            className={`overall-notification overall-notification-${latestEventTone}`}
                            aria-label={t("Overall notification")}
                            aria-live="polite"
                          >
                            <div className="overall-notification-main">
                              <span
                                className={`events-panel-icon events-panel-icon-${latestEventTone}`}
                                aria-hidden="true"
                              >
                                <span className="material-symbols-outlined">
                                  {visibleNotificationEvents.length > 0
                                    ? "notifications_active"
                                    : "notifications_off"}
                                </span>
                              </span>
                              <div className="overall-notification-copy">
                                <span className="overall-notification-kicker">
                                  {t("Overall notification")} ·{" "}
                                  {cityLabel(selectedCity)}
                                </span>
                                <strong>{overallNotificationTitle}</strong>
                                <p>{overallNotificationBody}</p>
                              </div>
                            </div>
                            <div className="overall-notification-meta">
                              <span>
                                {t("Updated")}{" "}
                                {formatTimestamp(
                                  visibleOverview.checked_at,
                                  "dateTime",
                                  languageMode,
                                )}
                              </span>
                              <span
                                className={`status-badge status-badge-${latestEventTone}`}
                              >
                                {visibleNotificationEvents.length > 0
                                  ? t("Needs attention")
                                  : t("Nominal")}
                              </span>
                            </div>
                            <p className="overall-notification-detail">
                              {overallNotificationDetail}
                            </p>
                          </section>
                          {selectedEvent ? (
                            <section
                              className="event-detail-panel"
                              aria-label={t("Event detail")}
                            >
                              <header className="event-detail-header">
                                <div>
                                  <span className="event-detail-kicker">
                                    {eventCategoryLabel(
                                      categories,
                                      selectedEvent,
                                      languageMode,
                                    )}{" "}
                                    · {attributeLabel(selectedEvent.event_type)}
                                  </span>
                                  <strong>{selectedEvent.title}</strong>
                                </div>
                                <button
                                  aria-label={t("Close event detail")}
                                  className="event-detail-close"
                                  onClick={() => setSelectedEventId(null)}
                                  title={t("Close event detail")}
                                  type="button"
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    aria-hidden="true"
                                  >
                                    close
                                  </span>
                                </button>
                                <button
                                  aria-label={t("Open workspace")}
                                  className="event-detail-close"
                                  onClick={() => openRecentEvent(selectedEvent)}
                                  title={t("Open workspace")}
                                  type="button"
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    aria-hidden="true"
                                  >
                                    open_in_new
                                  </span>
                                </button>
                              </header>
                              <p>{selectedEvent.body}</p>
                              <div className="event-detail-meta">
                                <span>
                                  {t("Validity")}:{" "}
                                  {formatTimestamp(
                                    selectedEvent.starts_at,
                                    "dateTime",
                                    languageMode,
                                  )}{" "}
                                  -{" "}
                                  {formatTimestamp(
                                    selectedEvent.ends_at,
                                    "dateTime",
                                    languageMode,
                                  )}
                                </span>
                                <span>
                                  {t("Sources")}:{" "}
                                  {selectedEvent.source_codes.join(", ") ||
                                    t("Derived")}
                                </span>
                              </div>
                              {selectedEvent.evidence.length > 0 ? (
                                <div className="event-detail-evidence">
                                  <span>{t("Evidence")}</span>
                                  <div className="event-tags">
                                    {selectedEvent.evidence.map((item) => (
                                      <span key={item}>{item}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <dl className="event-detail-attributes">
                                {selectedEventRows.length > 0 ? (
                                  selectedEventRows.map((row) => (
                                    <div key={row.label}>
                                      <dt>{row.label}</dt>
                                      <dd>{row.value}</dd>
                                    </div>
                                  ))
                                ) : (
                                  <div>
                                    <dt>{t("Details")}</dt>
                                    <dd>{t("No structured attributes")}</dd>
                                  </div>
                                )}
                              </dl>
                            </section>
                          ) : null}
                          {visibleEvents.length > 0 ? (
                            visibleEvents.map((event) => {
                              const tone = severityTone(
                                event.severity,
                              ) as DashboardTone;
                              const isRead = readRecentEventIds.has(event.id);
                              const isSelected = selectedEventId === event.id;
                              const details = recentEventDetails(
                                event,
                                languageMode,
                                t,
                              );
                              return (
                                <article
                                  className={[
                                    "timeline-item",
                                    `timeline-item-${tone}`,
                                    isSelected ? "timeline-item-selected" : null,
                                    isRead
                                      ? "timeline-item-read"
                                      : "timeline-item-unread",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  key={event.id}
                                >
                                  <span
                                    className={`timeline-dot timeline-dot-${tone}`}
                                    aria-hidden="true"
                                  />
                                  <button
                                    aria-expanded={isSelected}
                                    aria-label={`${t("Open event detail")}: ${event.title}`}
                                    className="timeline-item-content"
                                    onClick={() => {
                                      markRecentEventRead(event.id);
                                      setSelectedEventId(
                                        isSelected ? null : event.id,
                                      );
                                    }}
                                    type="button"
                                  >
                                    <time>
                                      {eventTimeLabel(
                                        categories,
                                        event,
                                        languageMode,
                                        t,
                                      )}
                                    </time>
                                    <span className="timeline-item-heading">
                                      <h4>{event.title}</h4>
                                      <span
                                        className={
                                          isRead
                                            ? "timeline-read-state timeline-read-state-read"
                                            : "timeline-read-state timeline-read-state-unread"
                                        }
                                      >
                                        {isRead ? t("Read") : t("Unread")}
                                      </span>
                                    </span>
                                    <p>{event.body}</p>
                                    {details.length > 0 ? (
                                      <div className="event-detail-chips">
                                        {details.map((detail) => (
                                          <span key={detail.key}>
                                            <strong>{detail.label}</strong>
                                            {detail.value}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <div className="event-tags">
                                      <span>{attributeLabel(event.event_type)}</span>
                                      {event.evidence[0] ? (
                                        <span>{event.evidence[0]}</span>
                                      ) : null}
                                    </div>
                                  </button>
                                </article>
                              );
                            })
                          ) : (
                            <div className="dashboard-empty-state">
                              {t("No recent events match the current view.")}
                            </div>
                          )}
                        </div>
                      </aside>
                    ) : null}
                  </div>
                </>
              )
            ) : (
              <section
                className="platform-error"
                aria-label={t("Platform unavailable")}
              >
                <span>{t("Platform unavailable")}</span>
                <h1>{t("Data platform could not load")}</h1>
                <p>{error ?? t("Unknown platform error.")}</p>
                <small>
                  {t("API endpoint")}: {apiBaseUrl}
                  {defaultUserId
                    ? ` · ${t("User context")}: ${defaultUserId}`
                    : ""}
                </small>
              </section>
            )}
          </main>

          {isDetailPage ? (
            <footer className="detail-footer">
              <span>ArkiWatch v1.2.0-8010/API</span>
              <div>
                <a href="/privacy">{t("Privacy Policy")}</a>
                <a href="/regional-settings">{t("Regional Settings")}</a>
                <a href="/api">{t("API Docs")}</a>
              </div>
            </footer>
          ) : (
            <footer className="mobile-dashboard-footer">
              <span>ArkiWatch v1.2.0-8010/API</span>
              <div>
                <a href="/privacy">{t("Privacy Policy")}</a>
                <a href="/api">{t("API Docs")}</a>
              </div>
            </footer>
          )}
          <AssistantWidget
            city={selectedCity}
            date={historicalDate}
            overview={overview}
            language={languageMode}
            userId={defaultUserId}
          />
        </div>
      </div>
    </I18nProvider>
  );
}
