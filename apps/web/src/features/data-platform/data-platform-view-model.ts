import { formatTimestamp, statusTone } from "@/features/shared/format";

import { categoryKeyDataItems } from "./category-metadata";
import type { DashboardTone } from "./data-platform-shell";
import {
  LanguageMode,
  translateDataLabel,
  translateEnumLabel,
  translateMessageKey,
  translateMetricLabel,
} from "./i18n";
import type { MobilityTabKey } from "./mobility-workspace";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";

export const MOBILITY_NAV_KEY = "mobility";

const STATUS_LABEL_KEYS: Record<string, string> = {
  alert: "statusAlert",
  background: "statusCatalog",
  connected: "statusActive",
  failing: "statusAlert",
  healthy: "statusHealthy",
  inactive: "statusInactive",
  pending: "statusPending",
  planned: "statusPlanned",
  stale: "statusStale",
  watch: "statusWatch",
};

const SCORE_LABEL_KEYS = ["na", "good", "fair", "moderate", "poor", "veryPoor"] as const;

const CATEGORY_TITLE_KEYS: Record<string, string> = {
  [MOBILITY_NAV_KEY]: "navMobility",
  air: "navAirQuality",
  traffic: "navRoadRail",
  water: "navWaterAndSnow",
  events: "navLinkedEvents",
};

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function isMobilityCategoryKey(
  key: string | null | undefined,
): key is MobilityTabKey {
  return key === "transit" || key === "traffic";
}

export function mobilityAvailable(categories: PlatformCategory[]): boolean {
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

export function buildMobilityCategory(
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
        label_key: "activeEvents",
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
        label_key: "transitAlerts",
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
        label_key: "roadRailEvents",
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

export function mergeMobilityCategories(
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

export function statusLabel(
  category: PlatformCategory,
  language: LanguageMode,
): string {
  if (category.status in STATUS_LABEL_KEYS) {
    return translateMessageKey(language, `shell.${STATUS_LABEL_KEYS[category.status]}`);
  }

  if (
    category.stage &&
    category.stage !== "connected" &&
    category.stage in STATUS_LABEL_KEYS
  ) {
    return translateMessageKey(language, `shell.${STATUS_LABEL_KEYS[category.stage]}`);
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
  if (score === null || score === undefined) {
    return fallback
      ? translateDataLabel(language, fallback)
      : translateMessageKey(language, "shell.na");
  }

  const key =
    SCORE_LABEL_KEYS[Math.min(Math.max(Math.round(score), 0), 5)] ?? "na";
  return translateMessageKey(language, `shell.${key}`);
}

export function displayTitle(
  category: PlatformCategory,
  language: LanguageMode,
): string {
  const labelKey = CATEGORY_TITLE_KEYS[category.key];
  if (labelKey) {
    return translateMessageKey(language, `shell.${labelKey}`);
  }

  return translateDataLabel(language, category.title);
}

export function matchesSearch(
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

export function eventMatchesSearch(
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

export function signalReadout(
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
      label: translateMessageKey(language, "shell.lastSync"),
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
      label: translateMessageKey(language, "shell.aqiAvg"),
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
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value:
        rawSignals > 0 || activeEvents > 0
          ? `${activeEvents}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
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
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value:
        transit?.quality.active_alert_count !== undefined
          ? `${transit.quality.active_alert_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
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
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value:
        roadRail?.quality.active_event_count !== undefined
          ? `${roadRail.quality.active_event_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
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
      label: translateMessageKey(
        language,
        window?.unit?.includes("kWh") ? "shell.bestPrice" : "shell.bestWindow",
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
      label: translateMessageKey(language, "shell.upcomingEvents"),
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
    label: metric
      ? translateMetricLabel(language, metric)
      : translateMessageKey(language, "shell.signalLevel"),
    value: formatMetricValue(metric),
    helpKey: metric?.key ?? "signal_level",
    progress: metric
      ? numericPercent(metric.value, toneProgress(tone))
      : toneProgress(tone),
    tone,
  };
}

export function eventCategoryLabel(
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
      stage: "planned",
      priority: "P0",
      source_codes: [],
      summary_metrics: [],
      visualizations: [],
      events: [],
      sources: [],
    },
    language,
  );
}

export function eventTimeLabel(
  categories: PlatformCategory[],
  event: PlatformEvent,
  language: LanguageMode,
): string {
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt = new Date(event.ends_at).getTime();
  const now = Date.now();
  const categoryLabel = eventCategoryLabel(categories, event, language);

  if (Number.isFinite(startsAt) && Number.isFinite(endsAt)) {
    if (startsAt <= now && endsAt >= now) {
      return `${translateMessageKey(language, "shell.ongoingUntil")} ${formatTimestamp(event.ends_at, "dateTime", language)} - ${categoryLabel}`;
    }

    if (endsAt < now) {
      return `${translateMessageKey(language, "shell.ended")} ${formatTimestamp(event.ends_at, "dateTime", language)} - ${categoryLabel}`;
    }
  }

  return `${formatTimestamp(event.starts_at, "dateTime", language)} - ${categoryLabel}`;
}

export function eventSeverityRank(event: PlatformEvent): number {
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

export function isNotificationEvent(event: PlatformEvent): boolean {
  return (
    NOTIFICATION_EVENT_TYPES.has(event.event_type) ||
    eventSeverityRank(event) > 0
  );
}

export function pickPriorityEvent(events: PlatformEvent[]): PlatformEvent | null {
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

export function notificationToneForEvents(
  events: PlatformEvent[],
): DashboardTone {
  if (events.some((event) => eventSeverityRank(event) >= 3)) {
    return "bad";
  }

  if (events.length > 0) {
    return "warn";
  }

  return "neutral";
}

export function activeEventLabel(
  count: number,
  language: LanguageMode,
): string {
  return `${count} ${translateMessageKey(language, count === 1 ? "shell.activeEvent" : "shell.activeEvents")}`;
}

export function attributeLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatAttributeValue(value: unknown): string | null {
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
      ? `${value.length} records - ${firstValue}`
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

export function eventAttributeRows(
  event: PlatformEvent,
): Array<{ label: string; value: string }> {
  return Object.entries(event.attributes ?? {})
    .map(([key, value]) => ({
      label: attributeLabel(key),
      value: formatAttributeValue(value),
    }))
    .filter((row): row is { label: string; value: string } =>
      Boolean(row.value),
    );
}
