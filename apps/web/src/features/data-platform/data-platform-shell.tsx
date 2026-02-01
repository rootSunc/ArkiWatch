"use client";

import { formatTimestamp } from "@/features/shared/format";

import {
  CITY_OPTIONS,
  CITY_STORAGE_KEY,
  normalizeCityValue,
} from "./city-scope";
import { translateText } from "./i18n";
import type { LanguageMode } from "./i18n";
import type { PlatformTimeScope, PlatformTone } from "./types";

export type DashboardTone = PlatformTone | "warn" | "bad" | "good" | "neutral";

export type ThemeMode = "dark" | "light";

export type NavItem = {
  key: string;
  label: string;
  icon: string;
  categoryKey?: string;
};

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: "dashboard" },
  { key: "weather", label: "Weather", icon: "cloud", categoryKey: "weather" },
  { key: "air", label: "Air Quality", icon: "air", categoryKey: "air" },
  { key: "energy", label: "Energy", icon: "bolt", categoryKey: "energy" },
  { key: "mobility", label: "Mobility", icon: "commute" },
  {
    key: "water",
    label: "Water and Snow",
    icon: "water_drop",
    categoryKey: "water",
  },
  {
    key: "city_services",
    label: "City Services",
    icon: "location_city",
    categoryKey: "city_services",
  },
  {
    key: "events",
    label: "Linked Events",
    icon: "event",
    categoryKey: "events",
  },
  {
    key: "geospatial",
    label: "Geospatial Base",
    icon: "map",
    categoryKey: "geospatial",
  },
  {
    key: "regional_profile",
    label: "Regional Profile",
    icon: "public",
    categoryKey: "regional_profile",
  },
];

const THEME_STORAGE_KEY = "arkiwatch-theme";

export function NotificationButton({
  count,
  isActive,
  language,
  onClick,
  tone,
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
    hasNotifications ? "Open recent events" : "Open notifications",
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
      {hasNotifications ? (
        <span className="notification-badge">{displayCount}</span>
      ) : null}
    </button>
  );
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function preferredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function storedThemeMode(): ThemeMode | null {
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

export function saveThemeMode(themeMode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Theme switching should continue even when persistent storage is unavailable.
  }
}

export function applyThemeMode(themeMode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeMode;
  document.documentElement.classList.toggle("dark", themeMode === "dark");
  document.documentElement.classList.toggle("light", themeMode === "light");
}

export function ThemeToggleButton({
  language,
  themeMode,
  onToggle,
}: {
  language: LanguageMode;
  themeMode: ThemeMode;
  onToggle: () => void;
}) {
  const isLightTheme = themeMode === "light";
  const label = translateText(
    language,
    isLightTheme ? "Switch to night theme" : "Switch to day theme",
  );

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

export function storedCityValue(): string | null {
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

export function saveCityValue(city: string): void {
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, city);
  } catch {
    // City switching should still work when persistent storage is unavailable.
  }
}

export function CityScopeSelector({
  city,
  isPending,
  language,
  onCityChange,
}: {
  city: string;
  isPending: boolean;
  language: LanguageMode;
  onCityChange: (city: string) => void;
}) {
  const label = translateText(language, "City");

  return (
    <label
      className={
        isPending
          ? "city-scope-control city-scope-control-pending"
          : "city-scope-control"
      }
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        location_on
      </span>
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
      <span
        className="material-symbols-outlined city-scope-chevron"
        aria-hidden="true"
      >
        expand_more
      </span>
    </label>
  );
}

function todayDateValue(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Helsinki",
  }).format(new Date());
}

function formatDateScopeValue(
  value: string,
  language: LanguageMode,
  includeYear = true,
): string {
  const parsedDate = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(parsedDate);
}

export function DateScopeSelector({
  date,
  isPending,
  language,
  onDateChange,
}: {
  date: string | null;
  isPending: boolean;
  language: LanguageMode;
  onDateChange: (date: string | null) => void;
}) {
  const label = translateText(language, "Selected date");
  const todayStr = todayDateValue();
  const displayValue = date ?? todayStr;
  const isHistorical = date !== null;
  const statusLabel = translateText(language, isHistorical ? "History" : "Live");
  const valueLabel = isHistorical
    ? formatDateScopeValue(displayValue, language)
    : translateText(language, "Today");
  const compactValueLabel = isHistorical
    ? formatDateScopeValue(displayValue, language, false)
    : valueLabel;
  const inputLabel = `${label}: ${valueLabel}`;
  const controlClassName = [
    "date-scope-control",
    isHistorical ? "date-scope-control-historical" : "date-scope-control-live",
    isPending ? "date-scope-control-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={controlClassName} aria-busy={isPending || undefined}>
      <span
        className="material-symbols-outlined date-scope-icon"
        aria-hidden="true"
      >
        calendar_today
      </span>
      <span className="date-scope-picker">
        <span className="date-scope-status">{statusLabel}</span>
        <span className="date-scope-value date-scope-value-full">
          {valueLabel}
        </span>
        <span className="date-scope-value date-scope-value-short">
          {compactValueLabel}
        </span>
        <input
          type="date"
          aria-label={inputLabel}
          disabled={isPending}
          max={todayStr}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (!value || value === todayStr) {
              onDateChange(null);
            } else {
              onDateChange(value);
            }
          }}
          title={inputLabel}
          value={displayValue}
        />
      </span>
      {date ? (
        <button
          className="date-scope-clear"
          aria-label={translateText(language, "Return to Live")}
          disabled={isPending}
          onClick={(event) => {
            event.preventDefault();
            onDateChange(null);
          }}
          title={translateText(language, "Return to Live")}
          type="button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      ) : (
        <span
          className="material-symbols-outlined date-scope-chevron"
          aria-hidden="true"
        >
          expand_more
        </span>
      )}
    </div>
  );
}

export function HistoricalWarningBanner({
  date,
  language,
  onReturnToLive,
  timeScope,
}: {
  date: string;
  language: LanguageMode;
  onReturnToLive: () => void;
  timeScope: PlatformTimeScope | null;
}) {
  const windowLabel =
    timeScope?.window_start && timeScope.window_end
      ? `${formatTimestamp(timeScope.window_start, "dateTime", language)} - ${formatTimestamp(
          timeScope.window_end,
          "dateTime",
          language,
        )}`
      : null;

  return (
    <div className="historical-banner" role="alert">
      <span
        className="material-symbols-outlined historical-banner-icon"
        aria-hidden="true"
      >
        history
      </span>
      <span className="historical-banner-text">
        <strong>
          {translateText(language, "Viewing historical dashboard for")} {date}
        </strong>
        <span>
          {windowLabel ??
            translateText(
              language,
              "Data may not reflect the current real-time state.",
            )}
        </span>
      </span>
      <button
        className="historical-banner-action"
        onClick={onReturnToLive}
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          trending_flat
        </span>
        {translateText(language, "Return to Live")}
      </button>
    </div>
  );
}
