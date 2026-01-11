"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { formatTimestamp, severityTone, statusTone } from "@/features/shared/format";

import { categoryKeyDataItems } from "./category-metadata";
import {
  CITY_OPTIONS,
  CITY_STORAGE_KEY,
  categorySupportsCityScope,
  cityLabel,
  normalizeCityValue
} from "./city-scope";
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
  translateText
} from "./i18n";
import {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformEvent,
  PlatformHistoryResponse,
  PlatformMetric,
  PlatformOverviewResponse,
  PlatformTone,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse
} from "./types";
import { AirQualityWorkspace } from "./air-quality-workspace";
import { CityServicesWorkspace } from "./city-services-workspace";
import { EnergyWorkspace } from "./energy-workspace";
import { RoadRailWorkspace } from "./road-rail-workspace";
import { TransitWorkspace } from "./transit-workspace";
import { WeatherDetailView } from "./weather-detail-view";
import { WaterSnowWorkspace } from "./water-snow-workspace";

type DataPlatformHomeProps = {
  airQuality: AirQualityCurrentResponse | null;
  apiBaseUrl: string;
  defaultUserId: string;
  initialCity: string;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  history: PlatformHistoryResponse;
  overview: PlatformOverviewResponse | null;
  roadRail: RoadRailCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  weather: WeatherForecastResponse | null;
  error: string | null;
};

type DashboardTone = PlatformTone | "warn" | "bad" | "good" | "neutral";

type ThemeMode = "dark" | "light";

type NavItem = {
  key: string;
  label: string;
  icon: string;
  categoryKey?: string;
};

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: "dashboard" },
  { key: "weather", label: "Weather", icon: "cloud", categoryKey: "weather" },
  { key: "air", label: "Air Quality", icon: "air", categoryKey: "air" },
  { key: "energy", label: "Energy", icon: "bolt", categoryKey: "energy" },
  { key: "transit", label: "Transit", icon: "directions_bus", categoryKey: "transit" },
  { key: "traffic", label: "Road and Rail", icon: "traffic", categoryKey: "traffic" },
  { key: "water", label: "Water and Snow", icon: "water_drop", categoryKey: "water" },
  { key: "city_services", label: "City Services", icon: "location_city", categoryKey: "city_services" }
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { key: "geospatial", label: "Regional Context", icon: "map", categoryKey: "geospatial" },
  { key: "system", label: "System Version", icon: "info" }
];

const CATEGORY_ICONS: Record<string, string> = {
  air: "air",
  city_services: "location_city",
  energy: "bolt",
  geospatial: "map",
  regional_profile: "public",
  traffic: "traffic",
  transit: "directions_bus",
  water: "water_drop",
  weather: "cloud"
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
  watch: "Watch"
};

const THEME_STORAGE_KEY = "arkiwatch-theme";

function NotificationButton({
  count,
  isActive,
  language,
  onClick,
  tone
}: {
  count: number;
  isActive: boolean;
  language: LanguageMode;
  onClick: () => void;
  tone: DashboardTone;
}) {
  const displayCount = count > 99 ? "99+" : String(count);
  const hasNotifications = count > 0;
  const label = translateText(
    language,
    hasNotifications ? "Open overall notifications" : "Open notifications"
  );

  return (
    <button
      className={`icon-button notification-button notification-button-${tone}${
        isActive ? " notification-button-active" : ""
      }`}
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {hasNotifications ? "notifications_active" : "notifications"}
      </span>
      {hasNotifications ? <span className="notification-badge">{displayCount}</span> : null}
    </button>
  );
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

function preferredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function storedThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

function saveThemeMode(themeMode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Theme switching should continue even when persistent storage is unavailable.
  }
}

function applyThemeMode(themeMode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeMode;
  document.documentElement.classList.toggle("dark", themeMode === "dark");
  document.documentElement.classList.toggle("light", themeMode === "light");
}

function ThemeToggleButton({
  language,
  themeMode,
  onToggle
}: {
  language: LanguageMode;
  themeMode: ThemeMode;
  onToggle: () => void;
}) {
  const isLightTheme = themeMode === "light";
  const label = translateText(language, isLightTheme ? "Switch to night theme" : "Switch to day theme");

  return (
    <button
      className="icon-button theme-toggle-button"
      aria-label={label}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {isLightTheme ? "dark_mode" : "light_mode"}
      </span>
    </button>
  );
}

function storedCityValue(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CITY_STORAGE_KEY);
    return value ? normalizeCityValue(value) : null;
  } catch {
    return null;
  }
}

function saveCityValue(city: string): void {
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, city);
  } catch {
    // City switching should still work when persistent storage is unavailable.
  }
}

function CityScopeSelector({
  city,
  isPending,
  language,
  onCityChange
}: {
  city: string;
  isPending: boolean;
  language: LanguageMode;
  onCityChange: (city: string) => void;
}) {
  const label = translateText(language, "Current city");

  return (
    <label className={isPending ? "city-scope-control city-scope-control-pending" : "city-scope-control"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        location_on
      </span>
      <span className="city-scope-label">{label}</span>
      <select
        aria-label={label}
        disabled={isPending}
        onChange={(event) => onCityChange(event.currentTarget.value)}
        value={city}
      >
        {CITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined city-scope-chevron" aria-hidden="true">
        expand_more
      </span>
    </label>
  );
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusLabel(category: PlatformCategory, language: LanguageMode): string {
  if (category.status in STATUS_LABELS) {
    return translateText(language, STATUS_LABELS[category.status]);
  }

  if (category.stage && category.stage !== "connected" && category.stage in STATUS_LABELS) {
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

function metricByKey(category: PlatformCategory, key: string): PlatformMetric | null {
  return category.summary_metrics.find((metric) => metric.key === key) ?? null;
}

function fallbackMetric(category: PlatformCategory): PlatformMetric | null {
  return (
    category.summary_metrics.find(
      (metric) =>
        !["catalog_stage", "source_status", "active_events", "records_ingested"].includes(metric.key)
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

function scoreLabel(score: number | null | undefined, fallback: string | null | undefined, language: LanguageMode): string {
  const labels = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];
  if (score === null || score === undefined) {
    return fallback ? translateText(language, fallback) : "n/a";
  }

  const label = labels[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "n/a";
  return translateText(language, label);
}

function displayTitle(category: PlatformCategory, language: LanguageMode): string {
  if (category.key === "air") {
    return translateText(language, "Air Quality");
  }
  if (category.key === "traffic") {
    return translateText(language, "Road & Rail");
  }
  if (category.key === "water") {
    return translateText(language, "Water & Snow");
  }

  return translateText(language, category.title);
}

function matchesSearch(category: PlatformCategory, searchValue: string, language: LanguageMode): boolean {
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
    ...categoryKeyDataItems(category).map((item) => translateDataLabel(language, item)),
    ...category.summary_metrics.map((metric) => `${metric.label} ${metric.value} ${metric.detail ?? ""}`),
    ...category.events.map((event) => `${event.title} ${event.body}`)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function eventMatchesSearch(event: PlatformEvent, searchValue: string, language: LanguageMode): boolean {
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
  language: LanguageMode
) {
  const tone = categoryTone(category);

  if (category.key === "weather") {
    const generatedAt = weather?.generated_at ?? weather?.checked_at ?? metricByKey(category, "source_status")?.updated_at;
    return {
      label: translateText(language, "Last Sync"),
      value: generatedAt ? formatTimestamp(generatedAt, "dateTime", language) : formatMetricValue(metricByKey(category, "source_status")),
      progress: tone === "warn" ? 40 : toneProgress(tone),
      tone
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
      progress: score === null || score === undefined ? toneProgress(tone) : Math.max(12, (score / 5) * 100),
      tone: score !== null && score !== undefined && score >= 4 ? "bad" : tone
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
      progress:
        transit?.quality.raw_alert_count !== undefined
          ? Math.max(12, Math.min(100, (transit.quality.active_alert_count / Math.max(1, transit.quality.raw_alert_count)) * 100))
          : category.events.length > 0
            ? Math.min(100, 28 + category.events.length * 14)
            : 85,
      tone: transit && transit.quality.active_alert_count > 0 ? "warn" : tone
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
      progress:
        roadRail?.quality.raw_message_count !== undefined
          ? Math.max(
              12,
              Math.min(
                100,
                (roadRail.quality.active_event_count /
                  Math.max(1, roadRail.quality.raw_message_count)) *
                  100
              )
            )
          : category.events.length > 0
            ? Math.min(100, 28 + category.events.length * 14)
            : 85,
      tone: roadRail && roadRail.quality.active_event_count > 0 ? "warn" : tone
    };
  }

  if (category.key === "energy") {
    const window = energy?.current_window;
    return {
      label: translateText(language, window?.unit?.includes("kWh") ? "Best Price" : "Best Window"),
      value:
        window !== null && window !== undefined
          ? `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
          : formatMetricValue(metricByKey(category, "low_energy_window")),
      progress:
        energy?.quality.field_coverage_pct !== undefined
          ? Math.max(8, Math.min(100, energy.quality.field_coverage_pct))
          : toneProgress(tone),
      tone: window ? "good" : tone
    };
  }

  const metric = fallbackMetric(category);
  return {
    label: metric?.label ? translateText(language, metric.label) : translateText(language, "Signal Level"),
    value: formatMetricValue(metric),
    progress: metric ? numericPercent(metric.value, toneProgress(tone)) : toneProgress(tone),
    tone
  };
}

function categoryByKey(categories: PlatformCategory[], key: string | undefined): PlatformCategory | null {
  if (!key) {
    return null;
  }

  return categories.find((category) => category.key === key) ?? null;
}

function eventCategoryLabel(categories: PlatformCategory[], event: PlatformEvent, language: LanguageMode): string {
  return displayTitle(categories.find((category) => category.key === event.category_key) ?? {
    key: event.category_key,
    title: titleCase(event.category_key),
    description: "",
    status: "neutral",
    source_codes: [],
    summary_metrics: [],
    visualizations: [],
    events: [],
    sources: []
  }, language);
}

function eventTimeLabel(categories: PlatformCategory[], event: PlatformEvent, language: LanguageMode): string {
  return `${formatTimestamp(event.starts_at, "dateTime", language)} - ${eventCategoryLabel(categories, event, language)}`;
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

function pickPriorityEvent(events: PlatformEvent[]): PlatformEvent | null {
  return [...events].sort((left, right) => {
    const severityDiff = eventSeverityRank(right) - eventSeverityRank(left);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime();
  })[0] ?? null;
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

function activeEventLabel(count: number, language: LanguageMode): string {
  return `${count} ${translateText(language, count === 1 ? "active event" : "active events")}`;
}

function navItemAvailable(item: NavItem, categories: PlatformCategory[]): boolean {
  if (!item.categoryKey) {
    return true;
  }

  return categories.some((category) => category.key === item.categoryKey);
}

function platformSignalStats(categories: PlatformCategory[], overview: PlatformOverviewResponse | null) {
  const keyFields = categories.reduce(
    (total, category) => total + categoryKeyDataItems(category).length,
    0
  );
  const activeEvents = categories.reduce((total, category) => total + category.events.length, 0);

  return {
    dataStreams: categories.length,
    activeEvents,
    dataSources: overview?.sources.length ?? 0,
    keyFields
  };
}

export function DataPlatformHome({
  airQuality,
  apiBaseUrl,
  defaultUserId,
  initialCity,
  energy,
  householdEnergy,
  history,
  overview,
  roadRail,
  transit,
  weather,
  error
}: DataPlatformHomeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNavKey, setSelectedNavKey] = useState("overview");
  const [searchValue, setSearchValue] = useState("");
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("en");
  const [selectedCity, setSelectedCity] = useState(() => normalizeCityValue(initialCity));
  const [isCityRefreshPending, startCityRefresh] = useTransition();
  const t = (value: string) => translateText(languageMode, value);

  const categories = useMemo(() => overview?.categories ?? [], [overview]);
  const selectedCategory =
    selectedNavKey === "overview"
      ? null
      : categoryByKey(categories, selectedNavKey) ??
        categoryByKey(categories, SECONDARY_NAV_ITEMS.find((item) => item.key === selectedNavKey)?.categoryKey);
  const signalStats = useMemo(() => platformSignalStats(categories, overview), [categories, overview]);
  const selectedCategories = selectedCategory ? [selectedCategory] : categories;
  const visibleCategories = selectedCategories.filter((category) => matchesSearch(category, searchValue, languageMode));
  const visibleEvents = (selectedCategory ? selectedCategory.events : overview?.recent_events ?? [])
    .filter((event) => eventMatchesSearch(event, searchValue, languageMode))
    .sort((left, right) => new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime())
    .slice(0, 12);
  const latestVisibleEvent = visibleEvents[0] ?? null;
  const latestEventTone = notificationToneForEvents(visibleEvents);
  const overallNotificationEvents = overview?.recent_events ?? [];
  const overallNotificationCount = overallNotificationEvents.length;
  const overallNotificationTone = notificationToneForEvents(overallNotificationEvents);
  const priorityVisibleEvent = pickPriorityEvent(visibleEvents);
  const overallScopeLabel = selectedCategory ? displayTitle(selectedCategory, languageMode) : t("Overall");
  const overallNotificationTitle =
    visibleEvents.length > 0
      ? `${overallScopeLabel} · ${activeEventLabel(visibleEvents.length, languageMode)}`
      : `${overallScopeLabel} · ${t("No active events")}`;
  const overallNotificationBody = priorityVisibleEvent
    ? `${eventCategoryLabel(categories, priorityVisibleEvent, languageMode)} · ${priorityVisibleEvent.title}`
    : t("No active cross-signal notifications in this view.");
  const overallNotificationDetail =
    priorityVisibleEvent?.body ?? t("Signal cards are nominal for the current view.");
  const isWeatherDetail = selectedCategory?.key === "weather";
  const isAirDetail = selectedCategory?.key === "air";
  const isEnergyDetail = selectedCategory?.key === "energy";
  const isTransitDetail = selectedCategory?.key === "transit";
  const isRoadRailDetail = selectedCategory?.key === "traffic";
  const isWaterDetail = selectedCategory?.key === "water";
  const isCityServicesDetail = selectedCategory?.key === "city_services";
  const isDetailPage =
    isWeatherDetail ||
    isAirDetail ||
    isEnergyDetail ||
    isTransitDetail ||
    isRoadRailDetail ||
    isWaterDetail ||
    isCityServicesDetail;

  function selectNavItem(item: NavItem): void {
    setSelectedNavKey(item.categoryKey ?? item.key);
  }

  function openOverallNotifications(): void {
    setSelectedNavKey("overview");
    setSearchValue("");
    setIsEventsExpanded(true);
  }

  const replaceCityParam = useCallback((nextCity: string): void => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("city", nextCity);
    startCityRefresh(() => {
      router.replace(`${pathname}?${nextParams.toString()}`);
    });
  }, [pathname, router, searchParams, startCityRefresh]);

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

  return (
    <I18nProvider language={languageMode}>
    <div className="dashboard-shell">
      <aside
        className={isDetailPage ? "dashboard-side-nav detail-side-nav" : "dashboard-side-nav"}
        aria-label={t("Primary navigation")}
      >
        <div className="brand-panel">
          <div className="brand-icon" aria-hidden="true">
            <span className="material-symbols-outlined">
              {isDetailPage ? "monitor_heart" : "monitoring"}
            </span>
          </div>
          <div>
            <h1>{t("Data Platform")}</h1>
            <p>{t("Operational Monitoring")}</p>
          </div>
        </div>

        <nav className="side-nav-list" aria-label={t("Signal navigation")}>
          {PRIMARY_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)).map((item) => {
            const isActive =
              selectedNavKey === item.key ||
              selectedNavKey === item.categoryKey ||
              (item.key === "overview" && !selectedCategory);
            return (
              <button
                className={isActive ? "nav-row nav-row-active" : "nav-row"}
                key={item.key}
                onClick={() => selectNavItem(item)}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <nav className="side-nav-footer" aria-label={t("Secondary navigation")}>
          {SECONDARY_NAV_ITEMS.filter((item) => navItemAvailable(item, categories)).map((item) => (
            <button
              className={selectedNavKey === (item.categoryKey ?? item.key) ? "nav-row nav-row-active" : "nav-row"}
              key={item.key}
              onClick={() => selectNavItem(item)}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span>{t(item.label)}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="dashboard-app">
        <header className="mobile-dashboard-header">
          <div className="mobile-brand">
            <button className="icon-button" aria-label={t("Open navigation")} type="button">
              <span className="material-symbols-outlined" aria-hidden="true">
                menu
              </span>
            </button>
            <strong>ArkiWatch</strong>
          </div>
          <div className="top-actions">
            <CityScopeSelector
              city={selectedCity}
              isPending={isCityRefreshPending}
              language={languageMode}
              onCityChange={selectCity}
            />
            <LanguageSwitchButton language={languageMode} onLanguageChange={selectLanguageMode} />
            <ThemeToggleButton language={languageMode} themeMode={themeMode} onToggle={toggleThemeMode} />
            <NotificationButton
              count={overallNotificationCount}
              isActive={isEventsExpanded && !isDetailPage}
              language={languageMode}
              onClick={openOverallNotifications}
              tone={overallNotificationTone}
            />
            <button className="icon-button" aria-label={t("Settings")} type="button">
              <span className="material-symbols-outlined" aria-hidden="true">
                settings
              </span>
            </button>
            <span className="profile-avatar" aria-label={t("User profile")}>
              AW
            </span>
          </div>
        </header>

        {isDetailPage ? (
          <header className="detail-topbar">
            <div className="detail-topbar-brand">
              <strong>ArkiWatch</strong>
            </div>
            <nav aria-label={t("Detail workspace navigation")}>
              <button onClick={() => setSelectedNavKey("overview")} type="button">
                {t("Overview")}
              </button>
              <button className="active" type="button">
                {t("Dashboard")}
              </button>
              <button type="button">{t("Analytics")}</button>
            </nav>
            <div className="detail-topbar-actions">
              <CityScopeSelector
                city={selectedCity}
                isPending={isCityRefreshPending}
                language={languageMode}
                onCityChange={selectCity}
              />
              <LanguageSwitchButton language={languageMode} onLanguageChange={selectLanguageMode} />
              <ThemeToggleButton language={languageMode} themeMode={themeMode} onToggle={toggleThemeMode} />
              <NotificationButton
                count={overallNotificationCount}
                isActive={isEventsExpanded && !isDetailPage}
                language={languageMode}
                onClick={openOverallNotifications}
                tone={overallNotificationTone}
              />
              <button className="icon-button" aria-label={t("Settings")} type="button">
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>
              </button>
              <span className="profile-avatar" aria-label={t("User profile")}>
                AW
              </span>
            </div>
          </header>
        ) : null}

        <main className={isDetailPage ? "dashboard-content detail-content-shell" : "dashboard-content"}>
          {!isDetailPage ? (
          <div className="desktop-dashboard-header">
            <div>
              <h2>{selectedCategory ? `${displayTitle(selectedCategory, languageMode)} ${t("Dashboard")}` : t("Overview Dashboard")}</h2>
              <p>
                {selectedCategory
                  ? selectedCategory.description
                  : t("Real-time system telemetry and signal status.")}
              </p>
            </div>
            <div className="desktop-controls">
              <label className="dashboard-search">
                <span className="material-symbols-outlined" aria-hidden="true">
                  search
                </span>
                <input
                  onChange={(event) => setSearchValue(event.currentTarget.value)}
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
              <LanguageSwitchButton language={languageMode} onLanguageChange={selectLanguageMode} />
              <ThemeToggleButton language={languageMode} themeMode={themeMode} onToggle={toggleThemeMode} />
              <NotificationButton
                count={overallNotificationCount}
                isActive={isEventsExpanded && !isDetailPage}
                language={languageMode}
                onClick={openOverallNotifications}
                tone={overallNotificationTone}
              />
              <span className="profile-avatar" aria-label={t("User profile")}>
                AW
              </span>
            </div>
          </div>
          ) : null}

          {overview ? (
            isWeatherDetail ? (
              <WeatherDetailView category={selectedCategory} history={history.weather} weather={weather} />
            ) : isAirDetail ? (
              <AirQualityWorkspace airQuality={airQuality} category={selectedCategory} history={history.airQuality} />
            ) : isEnergyDetail ? (
              <EnergyWorkspace
                category={selectedCategory}
                energy={energy}
                history={history.energy}
                householdEnergy={householdEnergy}
                householdHistory={history.householdEnergy}
              />
            ) : isTransitDetail ? (
              <TransitWorkspace category={selectedCategory} history={history.transit} transit={transit} />
            ) : isRoadRailDetail ? (
              <RoadRailWorkspace category={selectedCategory} history={history.roadRail} roadRail={roadRail} />
            ) : isWaterDetail ? (
              <WaterSnowWorkspace category={selectedCategory} />
            ) : isCityServicesDetail ? (
              <CityServicesWorkspace category={selectedCategory} />
            ) : (
            <>
              <section className="summary-grid" aria-label={t("Platform summary")}>
                <article className="metric-tile metric-tile-live">
                  <div>
                    <span>{t("Live Data Streams")}</span>
                    <i aria-hidden="true" />
                  </div>
                  <strong>
                    {signalStats.dataStreams}
                    <small>{t("active")}</small>
                  </strong>
                </article>
                <article className="metric-tile">
                  <div>
                    <span>{t("Active Fields")}</span>
                    <span className="material-symbols-outlined" aria-hidden="true">
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
                    <span>{t("Active Events")}</span>
                    <i aria-hidden="true" />
                  </div>
                  <strong>
                    {signalStats.activeEvents}
                    <small>{t("unresolved")}</small>
                  </strong>
                </article>
                <article className="metric-tile">
                  <div>
                    <span>{t("Data Sources")}</span>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      hub
                    </span>
                  </div>
                  <strong>
                    {signalStats.dataSources}
                    <small>{t("connected")}</small>
                  </strong>
                </article>
              </section>

              <div
                className={
                  isEventsExpanded
                    ? "dashboard-main-grid"
                    : "dashboard-main-grid dashboard-main-grid-events-collapsed"
                }
              >
                <section className="signal-section" aria-label={t("Signal status array")}>
                  <h3>
                    <span className="material-symbols-outlined" aria-hidden="true">
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
                          languageMode
                        );
                        const tone = readout.tone;
                        const followsSelectedCity = categorySupportsCityScope(category.key);
                        return (
                          <button
                            className={`signal-card signal-card-${tone}`}
                            key={category.key}
                            onClick={() => setSelectedNavKey(category.key)}
                            type="button"
                          >
                            <span className="signal-card-top">
                              <span className="signal-title">
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  {CATEGORY_ICONS[category.key] ?? "database"}
                                </span>
                                <strong>{displayTitle(category, languageMode)}</strong>
                              </span>
                              <span className={`status-badge status-badge-${tone}`}>{statusLabel(category, languageMode)}</span>
                            </span>
                            <span className="signal-card-bottom">
                              <span className="signal-readout">
                                <span>{readout.label}</span>
                                <strong>{readout.value}</strong>
                              </span>
                              <span
                                className={
                                  followsSelectedCity
                                    ? "signal-scope-chip signal-scope-chip-city"
                                    : "signal-scope-chip"
                                }
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  {followsSelectedCity ? "location_on" : "public"}
                                </span>
                                <span>
                                  {followsSelectedCity ? cityLabel(selectedCity) : t("Regional scope")}
                                </span>
                              </span>
                              <span className="signal-meter" aria-hidden="true">
                                <span style={{ width: `${readout.progress}%` }} />
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="dashboard-empty-state">{t("No signal cards match the current search.")}</div>
                    )}
                  </div>
                </section>

                <aside
                  className={isEventsExpanded ? "events-panel events-panel-expanded" : "events-panel events-panel-collapsed"}
                  aria-label={t("Recent events")}
                >
                  <header>
                    <button
                      aria-controls="recent-events-timeline"
                      aria-expanded={isEventsExpanded}
                      aria-label={isEventsExpanded ? t("Collapse recent events") : t("Expand recent events")}
                      className="events-panel-toggle"
                      onClick={() => setIsEventsExpanded((isExpanded) => !isExpanded)}
                      type="button"
                    >
                      <span className={`events-panel-icon events-panel-icon-${latestEventTone}`} aria-hidden="true">
                        <span className="material-symbols-outlined">notifications</span>
                      </span>
                      <span className="events-panel-copy">
                        <span className="events-panel-title">
                          <span className="events-panel-heading">{t("Recent Events")}</span>
                          <span className="events-count-badge">{visibleEvents.length}</span>
                        </span>
                        <span className="events-panel-summary">
                          {latestVisibleEvent
                            ? `${eventTimeLabel(categories, latestVisibleEvent, languageMode)} · ${latestVisibleEvent.title}`
                            : t("No recent events match the current view.")}
                        </span>
                      </span>
                      <span className="material-symbols-outlined events-panel-chevron" aria-hidden="true">
                        expand_more
                      </span>
                    </button>
                  </header>
                  <div className="event-timeline" hidden={!isEventsExpanded} id="recent-events-timeline">
                    <section
                      className={`overall-notification overall-notification-${latestEventTone}`}
                      aria-label={t("Overall notification")}
                      aria-live="polite"
                    >
                      <div className="overall-notification-main">
                        <span className={`events-panel-icon events-panel-icon-${latestEventTone}`} aria-hidden="true">
                          <span className="material-symbols-outlined">
                            {visibleEvents.length > 0 ? "notifications_active" : "notifications_off"}
                          </span>
                        </span>
                        <div className="overall-notification-copy">
                          <span className="overall-notification-kicker">
                            {t("Overall notification")} · {cityLabel(selectedCity)}
                          </span>
                          <strong>{overallNotificationTitle}</strong>
                          <p>{overallNotificationBody}</p>
                        </div>
                      </div>
                      <div className="overall-notification-meta">
                        <span>
                          {t("Updated")} {formatTimestamp(overview.checked_at, "dateTime", languageMode)}
                        </span>
                        <span className={`status-badge status-badge-${latestEventTone}`}>
                          {visibleEvents.length > 0 ? t("Needs attention") : t("Nominal")}
                        </span>
                      </div>
                      <p className="overall-notification-detail">{overallNotificationDetail}</p>
                    </section>
                    {visibleEvents.length > 0 ? (
                      visibleEvents.map((event) => {
                        const tone = severityTone(event.severity) as DashboardTone;
                        return (
                          <article className="timeline-item" key={event.id}>
                            <span className={`timeline-dot timeline-dot-${tone}`} aria-hidden="true" />
                            <time>{eventTimeLabel(categories, event, languageMode)}</time>
                            <h4>{event.title}</h4>
                            <p>{event.body}</p>
                            {event.evidence.length > 0 ? (
                              <div className="event-tags">
                                <span>{event.evidence[0]}</span>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="dashboard-empty-state">{t("No recent events match the current view.")}</div>
                    )}
                  </div>
                </aside>
              </div>
            </>
            )
          ) : (
            <section className="platform-error" aria-label={t("Platform unavailable")}>
              <span>{t("Platform unavailable")}</span>
              <h1>{t("Data platform could not load")}</h1>
              <p>{error ?? t("Unknown platform error.")}</p>
              <small>
                {t("API endpoint")}: {apiBaseUrl}
                {defaultUserId ? ` · ${t("User context")}: ${defaultUserId}` : ""}
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
      </div>
    </div>
    </I18nProvider>
  );
}
