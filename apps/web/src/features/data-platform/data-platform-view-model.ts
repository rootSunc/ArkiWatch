import { formatTimestamp, statusTone } from "@/features/shared/format";

import { categoryKeyDataItems, mergeKeyDataItems } from "./category-metadata";
import { localizedContent } from "./content-localization";
import type { DashboardTone } from "./data-platform-shell";
import {
  LanguageMode,
  translateDataLabel,
  translateEnumLabel,
  translateKeyDataItemLabel,
  translateMessageKey,
  translateMetricLabel,
} from "./i18n";
import type { MobilityTabKey } from "./mobility-workspace";
import { isEmptyStatus } from "./platform-status";
import { weatherReferencePoint } from "./console-model";
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
  degraded: "statusDegraded",
  connected: "statusActive",
  empty: "empty",
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
  weather: "navWeather",
  air: "navAirQuality",
  [MOBILITY_NAV_KEY]: "navMobility",
  transit: "navTransit",
  energy: "navEnergy",
  traffic: "navRoadRail",
  water: "navWaterAndSnow",
  city_services: "navCityServices",
  events: "navLinkedEvents",
  geospatial: "navGeospatialBase",
  regional_profile: "navRegionalProfile",
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

  const usableTransit = transit && !isEmptyStatus(transit.status) ? transit : null;
  const usableRoadRail = roadRail && !isEmptyStatus(roadRail.status) ? roadRail : null;
  const activeTransitAlerts = usableTransit?.quality.active_alert_count ?? 0;
  const activeRoadRailEvents = usableRoadRail?.quality.active_event_count ?? 0;
  const activeEvents = activeTransitAlerts + activeRoadRailEvents;
  const allMobilityCategoriesEmpty = mobilityCategories.every((category) =>
    isEmptyStatus(category.status),
  );
  const sourceCodes = uniqueValues(
    mobilityCategories.flatMap((category) => category.source_codes),
  );
  const updatedAt =
    usableTransit?.observed_at ??
    usableRoadRail?.observed_at ??
    mobilityCategories
      .flatMap((category) => category.summary_metrics)
      .find((metric) => metric.updated_at)?.updated_at ??
    null;

  return {
    key: MOBILITY_NAV_KEY,
    title: "Mobility",
    description:
      "Transit service alerts and Digitraffic road and rail operations.",
    status: activeEvents > 0 ? "watch" : allMobilityCategoriesEmpty ? "empty" : "connected",
    stage: "connected",
    priority: "P0",
    source_codes: sourceCodes,
    key_data_items: mergeKeyDataItems(mobilityCategories),
    summary_metrics: allMobilityCategoriesEmpty
      ? []
      : [
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
            updated_at: usableTransit?.observed_at ?? null,
            source_codes: usableTransit ? ["digitransit"] : [],
          },
          {
            key: "road_rail_events",
            label: "Road & Rail",
            label_key: "roadRailEvents",
            value: String(activeRoadRailEvents),
            tone: activeRoadRailEvents > 0 ? "warn" : "good",
            unit: null,
            detail: null,
            updated_at: usableRoadRail?.observed_at ?? null,
            source_codes: usableRoadRail ? ["digitraffic"] : [],
          },
        ],
    visualizations: mobilityCategories.filter((category) => !isEmptyStatus(category.status)).flatMap(
      (category) => category.visualizations,
    ),
    events: mobilityCategories
      .filter((category) => !isEmptyStatus(category.status))
      .flatMap((category) => category.events),
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
  if (category.status === "empty") {
    return "neutral";
  }

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

function formatMetricValue(metric: PlatformMetric | null, language: LanguageMode): string {
  if (!metric) {
    return translateMessageKey(language, "shell.na");
  }

  if (metric.key === "records_ingested" && metric.value.trim().toLowerCase() === "n/a") {
    return translateMessageKey(language, "shell.notCollected");
  }

  return `${translateDataLabel(language, metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`;
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
    ...categoryKeyDataItems(category).map((item) => item.key),
    ...categoryKeyDataItems(category).map((item) => translateKeyDataItemLabel(language, item)),
    ...category.summary_metrics.map(
      (metric) =>
        [
          metric.key,
          metric.label,
          translateMetricLabel(language, metric),
          metric.value,
          metric.detail ?? "",
        ].join(" "),
    ),
    ...category.events.map((event) =>
      [
        localizedContent(language, event.title, event.title_zh),
        event.title,
        localizedContent(language, event.body, event.body_zh),
        event.body,
        event.event_type,
      ].join(" "),
    ),
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

  return [
    localizedContent(language, event.title, event.title_zh),
    event.title,
    localizedContent(language, event.body, event.body_zh),
    event.body,
    event.category_key,
    event.event_type,
    event.severity,
    translateEnumLabel(language, event.severity),
    event.source_codes.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function signalReadout(
  category: PlatformCategory,
  weather: WeatherForecastResponse | null,
  airQuality: AirQualityCurrentResponse | null,
  energy: EnergyCurrentResponse | null,
  householdEnergy: EnergyCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
  transit: TransitCurrentResponse | null,
  language: LanguageMode,
  timezone?: string,
) {
  const tone = categoryTone(category);
  const usableWeather = weather && !isEmptyStatus(weather.status) ? weather : null;
  const usableAirQuality = airQuality && !isEmptyStatus(airQuality.status) ? airQuality : null;
  const usableEnergy = energy && !isEmptyStatus(energy.status) ? energy : null;
  const usableHouseholdEnergy = householdEnergy && !isEmptyStatus(householdEnergy.status)
    ? householdEnergy
    : null;
  const usableRoadRail = roadRail && !isEmptyStatus(roadRail.status) ? roadRail : null;
  const usableTransit = transit && !isEmptyStatus(transit.status) ? transit : null;
  const categoryEmpty = isEmptyStatus(category.status);

  if (category.key === "weather") {
    const point = weatherReferencePoint(usableWeather);
    return {
      label: translateMessageKey(language, "weather.temperature"),
      value: !categoryEmpty && point ? `${point.temperature_c} °C` : translateMessageKey(language, "shell.na"),
      helpKey: "temperature", tone,
      detail: point ? formatTimestamp(point.timestamp, "dateTime", language, timezone) : undefined,
    };
  }

  if (category.key === "air") {
    const score = usableAirQuality?.worst_score;
    return {
      label: translateMessageKey(language, "airQuality.worstScore"),
      value:
        score === null || score === undefined
          ? categoryEmpty
            ? translateMessageKey(language, "shell.na")
            : formatMetricValue(fallbackMetric(category), language)
          : `${scoreLabel(score, usableAirQuality?.worst_label, language)} (${Math.round(score)}/5)`,
      helpKey: "aqi_avg",
      tone: score !== null && score !== undefined && score >= 4 ? "bad" : tone,
    };
  }

  if (category.key === MOBILITY_NAV_KEY) {
    const activeTransitAlerts = usableTransit?.quality.active_alert_count ?? 0;
    const activeRoadRailEvents = usableRoadRail?.quality.active_event_count ?? 0;
    const activeEvents = activeTransitAlerts + activeRoadRailEvents;
    const rawSignals =
      (transit?.quality.raw_alert_count ?? 0) +
      (roadRail?.quality.raw_message_count ?? 0);

    return {
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value: categoryEmpty
        ? translateMessageKey(language, "shell.na")
        : rawSignals > 0 || activeEvents > 0
          ? `${activeEvents}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
      tone: activeEvents > 0 ? "warn" : tone,
    };
  }

  if (category.key === "transit") {
    return {
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value: categoryEmpty
        ? translateMessageKey(language, "shell.na")
        : usableTransit?.quality.active_alert_count !== undefined
          ? `${usableTransit.quality.active_alert_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
      helpKey: "active_events",
      tone: usableTransit && usableTransit.quality.active_alert_count > 0 ? "warn" : tone,
    };
  }

  if (category.key === "traffic") {
    return {
      label: translateMessageKey(language, "shell.activeEventsLabel"),
      value: categoryEmpty
        ? translateMessageKey(language, "shell.na")
        : usableRoadRail?.quality.active_event_count !== undefined
          ? `${usableRoadRail.quality.active_event_count}`
          : category.events.length > 0
            ? `${category.events.length}`
            : translateMessageKey(language, "shell.nominal"),
      helpKey: "active_events",
      tone: usableRoadRail && usableRoadRail.quality.active_event_count > 0 ? "warn" : tone,
    };
  }

  if (category.key === "energy") {
    const householdWindow = usableHouseholdEnergy?.current_window;
    const systemWindow = usableEnergy?.current_window;
    const window = householdWindow ?? systemWindow;
    const isHouseholdPrice = Boolean(householdWindow);
    return {
      label: translateMessageKey(
        language,
        isHouseholdPrice ? "shell.bestPrice" : "shell.currentGridLoad",
      ),
      value: categoryEmpty
        ? translateMessageKey(language, "shell.na")
        : window !== null && window !== undefined
          ? `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
          : formatMetricValue(metricByKey(category, "low_energy_window"), language),
      helpKey: isHouseholdPrice ? "best_price" : "grid_load",
      tone: window ? "good" : tone,
    };
  }

  if (category.key === "events") {
    const freeMetric = metricByKey(category, "free_events");
    return {
      label: translateMessageKey(language, "shell.upcomingEvents"),
      value: categoryEmpty
        ? translateMessageKey(language, "shell.na")
        : category.events.length > 0
          ? `${category.events.length}`
          : formatMetricValue(metricByKey(category, "active_events"), language),
      helpKey: "upcoming_events",
      tone: freeMetric && freeMetric.value !== "0" ? "good" : tone,
    };
  }

  const metric = fallbackMetric(category);
  return {
    label: metric
      ? translateMetricLabel(language, metric)
      : translateMessageKey(language, "shell.signalLevel"),
    value: categoryEmpty ? translateMessageKey(language, "shell.na") : formatMetricValue(metric, language),
    helpKey: metric?.key ?? "signal_level",
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
  referenceAt?: string | null,
  timezone?: string,
): string {
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt = new Date(event.ends_at).getTime();
  const referenceTimestamp = referenceAt ? new Date(referenceAt).getTime() : Number.NaN;
  const now = Number.isFinite(referenceTimestamp) ? referenceTimestamp : Date.now();
  const categoryLabel = eventCategoryLabel(categories, event, language);

  if (Number.isFinite(startsAt) && Number.isFinite(endsAt)) {
    if (startsAt <= now && endsAt >= now) {
      return `${translateMessageKey(language, "shell.ongoingUntil")} ${formatTimestamp(event.ends_at, "dateTime", language, timezone)} - ${categoryLabel}`;
    }

    if (endsAt < now) {
      return `${translateMessageKey(language, "shell.ended")} ${formatTimestamp(event.ends_at, "dateTime", language, timezone)} - ${categoryLabel}`;
    }
  }

  return `${formatTimestamp(event.starts_at, "dateTime", language, timezone)} - ${categoryLabel}`;
}

function eventSeverityRank(event: PlatformEvent): number {
  switch (event.severity.toUpperCase()) {
    case "CRITICAL":
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

export function isNotificationEvent(event: PlatformEvent): boolean {
  return event.notification === true;
}

// Search/reading state can hide events locally. Choose the greatest server
// priority among those still visible without recomputing a business score.
export function pickPriorityEvent(events: PlatformEvent[]): PlatformEvent | null {
  return events.reduce<PlatformEvent | null>((best, event) =>
    best === null || (event.notification_priority ?? 0) > (best.notification_priority ?? 0) ? event : best, null);
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

export function recentEventLabel(
  count: number,
  language: LanguageMode,
): string {
  return `${count} ${translateMessageKey(language, count === 1 ? "shell.recentEvent" : "shell.recentEventsCount")}`;
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

export function formatAttributeValue(
  value: unknown,
  language: LanguageMode = "en",
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return language === "zh" ? (value ? "是" : "否") : value ? "Yes" : "No";
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
      .map((item) => formatAttributeValue(item, language))
      .filter((item): item is string => Boolean(item));

    if (value.every((item) => typeof item !== "object" || item === null)) {
      const preview = primitiveValues.slice(0, 6).join(", ");
      return value.length > 6 ? `${preview} +${value.length - 6}` : preview;
    }

    const firstValue = primitiveValues[0];
    return firstValue
      ? `${value.length} ${language === "zh" ? "条记录" : "records"} - ${firstValue}`
      : `${value.length} ${language === "zh" ? "条记录" : "records"}`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, formatAttributeValue(item, language)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    if (entries.length === 0) {
      return null;
    }

    return entries
      .slice(0, 4)
      .map(([key, item]) => `${localizedAttributeLabel(key, language)}: ${item}`)
      .join("; ");
  }

  return String(value);
}

function localizedAttributeLabel(key: string, language: LanguageMode): string {
  if (language === "en") {
    return attributeLabel(key);
  }

  return translateDataLabel(language, key) || attributeLabel(key);
}

export function eventTypeLabel(
  value: string | null | undefined,
  language: LanguageMode,
): string {
  if (!value?.trim()) {
    return translateMessageKey(language, "shell.missing");
  }

  return language === "en" ? attributeLabel(value) : translateDataLabel(language, value);
}

export function eventAttributeRows(
  event: PlatformEvent,
  language: LanguageMode = "en",
): Array<{ label: string; value: string }> {
  return Object.entries(event.attributes ?? {})
    .map(([key, value]) => ({
      label: localizedAttributeLabel(key, language),
      value: formatAttributeValue(value, language),
    }))
    .filter((row): row is { label: string; value: string } =>
      Boolean(row.value),
    );
}
