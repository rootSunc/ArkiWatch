"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { formatTimestamp } from "@/features/shared/format";
import { MaterialIcon } from "@/features/shared/material-icon";

import {
  CITY_OPTIONS,
  CITY_STORAGE_KEY,
  cityLabel,
  normalizeCityValue,
} from "./city-scope";
import { translateMessageKey } from "./i18n";
import type { LanguageMode } from "./i18n";
import type {
  PlatformHistoryAvailabilityDay,
  PlatformTimeScope,
  PlatformTone,
} from "./types";

export type DashboardTone = PlatformTone | "warn" | "bad" | "good" | "neutral";

export type ThemeMode = "dark" | "light";

export type NavItem = {
  key: string;
  labelKey: string;
  icon: string;
  categoryKey?: string;
};

export type WorkspaceMode = "today" | "data";

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { key: "overview", labelKey: "navSignals", icon: "hub" },
  { key: "today", labelKey: "navToday", icon: "calendar_today" },
  { key: "weather", labelKey: "navWeather", icon: "cloud", categoryKey: "weather" },
  { key: "air", labelKey: "navAirQuality", icon: "air", categoryKey: "air" },
  { key: "energy", labelKey: "navEnergy", icon: "bolt", categoryKey: "energy" },
  { key: "mobility", labelKey: "navMobility", icon: "commute" },
  {
    key: "water",
    labelKey: "navWaterAndSnow",
    icon: "water_drop",
    categoryKey: "water",
  },
  {
    key: "events",
    labelKey: "navLinkedEvents",
    icon: "event",
    categoryKey: "events",
  },
];

export const CATALOG_NAV_ITEMS: NavItem[] = [
  {
    key: "city_services",
    labelKey: "navCityServices",
    icon: "location_city",
    categoryKey: "city_services",
  },
  {
    key: "geospatial",
    labelKey: "navGeospatialBase",
    icon: "map",
    categoryKey: "geospatial",
  },
  {
    key: "regional_profile",
    labelKey: "navRegionalProfile",
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
  const label = translateMessageKey(
    language,
    hasNotifications ? "shell.openRecentEventsWithCount" : "shell.openNotifications",
  ).replace("{count}", displayCount);

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
        notifications
      </span>
      {hasNotifications ? (
        <span aria-hidden="true" className="notification-badge">{displayCount}</span>
      ) : null}
    </button>
  );
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function preferredThemeMode(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
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

export function RefreshDataButton({
  isRefreshing,
  language,
  onRefresh,
}: {
  isRefreshing: boolean;
  language: LanguageMode;
  onRefresh: () => void;
}) {
  const label = translateMessageKey(language, "shell.refreshData");

  return (
    <button
      className="icon-button theme-toggle-button refresh-button"
      aria-label={label}
      aria-busy={isRefreshing}
      disabled={isRefreshing}
      onClick={onRefresh}
      title={label}
      type="button"
    >
      <span
        className={`material-symbols-outlined ${isRefreshing ? "spin-animation" : ""}`}
        aria-hidden="true"
      >
        refresh
      </span>
    </button>
  );
}

export function RefreshErrorBanner({
  error,
  language,
  onDismiss,
}: {
  error: string;
  language: LanguageMode;
  onDismiss: () => void;
}) {
  const normalizedError = error.trim().toLowerCase();
  const detailKey = normalizedError.includes("not configured") || normalizedError.includes("scheduler")
    ? "shell.refreshSchedulerUnavailable"
    : normalizedError.includes("timed out") || normalizedError.includes("timeout")
      ? "shell.refreshTimedOut"
      : "shell.refreshFailedDetail";

  return (
    <div className="refresh-error-banner" role="alert">
      <MaterialIcon name="sync_problem" />
      <span className="refresh-error-banner-copy">
        <strong>{translateMessageKey(language, "shell.refreshFailed")}</strong>
        <small>
          {translateMessageKey(language, detailKey)}
        </small>
      </span>
      <button
        aria-label={translateMessageKey(language, "shell.dismissRefreshError")}
        className="refresh-error-banner-dismiss"
        onClick={onDismiss}
        title={translateMessageKey(language, "shell.dismissRefreshError")}
        type="button"
      >
        <MaterialIcon name="close" />
      </button>
    </div>
  );
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
  const label = translateMessageKey(
    language,
    isLightTheme ? "shell.switchToNightTheme" : "shell.switchToDayTheme",
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
  const label = translateMessageKey(language, "shell.city");
  const selectedCityLabel = cityLabel(city);

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
      <span className="city-scope-copy" aria-hidden="true">
        <span className="city-scope-label">{label}</span>
        <span className="city-scope-value">{selectedCityLabel}</span>
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
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(parsedDate);
}

const WEEKDAY_SAMPLE_START = Date.UTC(2024, 0, 1);

export function buildWeekdayLabels(language: LanguageMode): string[] {
  const formatter = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "UTC",
    weekday: "narrow",
  });

  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(WEEKDAY_SAMPLE_START + index * 24 * 60 * 60 * 1000)),
  );
}

type CalendarCell = {
  dateValue: string;
  dayNumber: number;
  isCurrentMonth: boolean;
};

function dateValue(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKeyFromDateValue(value: string): string {
  return value.slice(0, 7);
}

function availableHistoryDates(
  availability: PlatformHistoryAvailabilityDay[],
): string[] {
  return availability
    .filter((day) => day.has_data)
    .map((day) => day.date)
    .sort();
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const nextMonth = new Date(Date.UTC(year, month - 1 + offset, 1));
  return dateValue(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1).slice(0, 7);
}

function formatMonthLabel(monthKey: string, language: LanguageMode): string {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildCalendarCells(monthKey: string): CalendarCell[] {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const mondayStartOffset = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - mondayStartOffset));

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart);
    cellDate.setUTCDate(gridStart.getUTCDate() + index);
    const cellMonth = cellDate.getUTCMonth() + 1;

    return {
      dateValue: dateValue(
        cellDate.getUTCFullYear(),
        cellMonth,
        cellDate.getUTCDate(),
      ),
      dayNumber: cellDate.getUTCDate(),
      isCurrentMonth: cellMonth === month,
    };
  });
}

export function DateScopeSelector({
  availability = [],
  date,
  isDemo = false,
  isPending,
  language,
  onCalendarOpen,
  onDateChange,
}: {
  availability?: PlatformHistoryAvailabilityDay[];
  date: string | null;
  isDemo?: boolean;
  isPending: boolean;
  language: LanguageMode;
  onCalendarOpen?: () => void;
  onDateChange: (date: string | null) => void;
}) {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const dateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreDateTriggerFocusRef = useRef(false);
  const calendarId = `arkiwatch-date-calendar-${useId().replace(/:/g, "")}`;
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarAvailabilitySyncedRef = useRef(false);
  const label = translateMessageKey(language, "shell.selectedDate");
  const todayStr = todayDateValue();
  const displayValue = date ?? todayStr;
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthKeyFromDateValue(displayValue),
  );
  const isHistorical = date !== null;
  const statusLabel = translateMessageKey(
    language,
    isHistorical ? "shell.historyMode" : isDemo ? "shell.demoSnapshot" : "shell.liveMode",
  );
  const valueLabel = isHistorical
    ? formatDateScopeValue(displayValue, language)
    : translateMessageKey(language, "shell.navToday");
  const compactValueLabel = isHistorical
    ? formatDateScopeValue(displayValue, language, false)
    : valueLabel;
  const inputLabel = `${label}: ${valueLabel}`;
  const controlClassName = [
    "date-scope-control",
    isHistorical ? "date-scope-control-historical" : "date-scope-control-live",
    isCalendarOpen ? "date-scope-control-calendar-open" : "",
    isPending ? "date-scope-control-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const availabilityByDate = useMemo(
    () => new Map(availability.map((day) => [day.date, day])),
    [availability],
  );
  const availableDates = useMemo(
    () => availableHistoryDates(availability),
    [availability],
  );
  const latestAvailableDateValue = availableDates[availableDates.length - 1] ?? null;
  const weekdayLabels = useMemo(() => buildWeekdayLabels(language), [language]);
  const calendarCells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth]);
  const earliestAvailabilityMonth = availableDates[0]
    ? monthKeyFromDateValue(availableDates[0])
    : null;
  const todayMonth = monthKeyFromDateValue(todayStr);
  const previousMonth = addMonths(visibleMonth, -1);
  const nextMonth = addMonths(visibleMonth, 1);
  const canGoPrevious =
    earliestAvailabilityMonth === null || previousMonth >= earliestAvailabilityMonth;
  const canGoNext = nextMonth <= todayMonth;

  const closeCalendar = useCallback(() => {
    restoreDateTriggerFocusRef.current = true;
    setIsCalendarOpen(false);
  }, []);

  useEffect(() => {
    if (isCalendarOpen || !restoreDateTriggerFocusRef.current) {
      return;
    }

    restoreDateTriggerFocusRef.current = false;
    window.requestAnimationFrame(() => dateTriggerRef.current?.focus());
  }, [date, isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const calendar = calendarRef.current;
      if (!calendar) {
        return;
      }

      // Focus enters the calendar only from outside it. That leaves the month
      // buttons focused while paging, and still recovers focus when a month
      // change unmounts the cell that held it.
      if (calendar.contains(document.activeElement)) {
        return;
      }

      const target =
        calendar.querySelector<HTMLButtonElement>(
          ".date-calendar-day[aria-current='date']:not([disabled])",
        ) ??
        calendar.querySelector<HTMLButtonElement>(
          ".date-calendar-day:not(.date-calendar-day-adjacent):not([disabled])",
        ) ??
        calendar.querySelector<HTMLButtonElement>("button:not([disabled])");
      target?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isCalendarOpen, visibleMonth]);

  useEffect(() => {
    setVisibleMonth(monthKeyFromDateValue(displayValue));
  }, [displayValue]);

  useEffect(() => {
    if (
      !isCalendarOpen ||
      isHistorical ||
      calendarAvailabilitySyncedRef.current ||
      !latestAvailableDateValue
    ) {
      return;
    }

    calendarAvailabilitySyncedRef.current = true;
    const latestMonth = monthKeyFromDateValue(latestAvailableDateValue);
    if (visibleMonth === todayMonth && latestMonth !== todayMonth) {
      setVisibleMonth(latestMonth);
    }
  }, [
    isCalendarOpen,
    isHistorical,
    latestAvailableDateValue,
    todayMonth,
    visibleMonth,
  ]);

  useEffect(() => {
    if (!isCalendarOpen) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        controlRef.current &&
        event.target instanceof Node &&
        !controlRef.current.contains(event.target)
      ) {
        setIsCalendarOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCalendar();
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeCalendar, isCalendarOpen]);

  const selectCalendarDate = (value: string) => {
    if (isPending || value > todayStr) {
      return;
    }

    onDateChange(value === todayStr ? null : value);
    closeCalendar();
  };

  return (
    <div
      className={controlClassName}
      ref={controlRef}
      aria-busy={isPending || undefined}
    >
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
      </span>
      <button
        className="date-scope-trigger"
        type="button"
        aria-label={inputLabel}
        aria-controls={calendarId}
        aria-expanded={isCalendarOpen}
        aria-haspopup="dialog"
        disabled={isPending}
        ref={dateTriggerRef}
        onClick={() => {
          const nextOpen = !isCalendarOpen;
          if (nextOpen) {
            calendarAvailabilitySyncedRef.current = false;
            setVisibleMonth(
              monthKeyFromDateValue(
                date ? displayValue : latestAvailableDateValue ?? displayValue,
              ),
            );
          }
          setIsCalendarOpen(nextOpen);
          if (nextOpen) {
            onCalendarOpen?.();
          }
        }}
        title={inputLabel}
      />
      {date ? (
        <button
          className="date-scope-clear"
          aria-label={translateMessageKey(language, "shell.returnToLive")}
          disabled={isPending}
          onClick={(event) => {
            event.preventDefault();
            onDateChange(null);
            closeCalendar();
          }}
          title={translateMessageKey(language, "shell.returnToLive")}
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
      <div
        hidden={!isCalendarOpen}
        className="date-calendar-popover"
        id={calendarId}
        role="dialog"
        aria-label={translateMessageKey(language, "shell.availableHistoricalData")}
        ref={calendarRef}
      >
        <div className="date-calendar-header">
          <strong>{formatMonthLabel(visibleMonth, language)}</strong>
          <div className="date-calendar-nav">
            <button
              aria-label={translateMessageKey(language, "shell.previousMonth")}
              disabled={!canGoPrevious}
              onClick={() => setVisibleMonth(previousMonth)}
              title={translateMessageKey(language, "shell.previousMonth")}
              type="button"
            >
              <MaterialIcon name="keyboard_arrow_left" />
            </button>
            <button
              aria-label={translateMessageKey(language, "shell.nextMonth")}
              disabled={!canGoNext}
              onClick={() => setVisibleMonth(nextMonth)}
              title={translateMessageKey(language, "shell.nextMonth")}
              type="button"
            >
              <MaterialIcon name="keyboard_arrow_right" />
            </button>
          </div>
        </div>
        <div className="date-calendar-weekdays" aria-hidden="true">
          {weekdayLabels.map((weekday, index) => (
            <span key={`${weekday}-${index}`}>{weekday}</span>
          ))}
        </div>
        <div className="date-calendar-grid">
          {calendarCells.map((cell) => {
            const availabilityDay = availabilityByDate.get(cell.dateValue);
            const hasData = Boolean(availabilityDay?.has_data);
            const isFuture = cell.dateValue > todayStr;
            const isSelected = cell.dateValue === displayValue;
            const cellLabel = hasData
              ? `${formatDateScopeValue(cell.dateValue, language)}: ${
                  availabilityDay?.record_count ?? 0
                } ${translateMessageKey(language, "shell.records")}`
              : `${formatDateScopeValue(cell.dateValue, language)}: ${translateMessageKey(
                  language,
                  "shell.noHistoricalData",
                )}`;

            return (
              <button
                key={cell.dateValue}
                className={[
                  "date-calendar-day",
                  cell.isCurrentMonth ? "" : "date-calendar-day-adjacent",
                  hasData ? "date-calendar-day-has-data" : "",
                  isSelected ? "date-calendar-day-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={cellLabel}
                aria-current={isSelected ? "date" : undefined}
                disabled={isFuture || isPending}
                onClick={() => selectCalendarDate(cell.dateValue)}
                title={cellLabel}
                type="button"
              >
                <span>{cell.dayNumber}</span>
                {hasData ? (
                  <span className="date-calendar-data-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="date-calendar-actions">
          <button
            onClick={() => {
              onDateChange(null);
              closeCalendar();
            }}
            type="button"
          >
            {translateMessageKey(language, "shell.clearDate")}
          </button>
          <button
            onClick={() => {
              onDateChange(null);
              setVisibleMonth(monthKeyFromDateValue(todayStr));
              closeCalendar();
            }}
            type="button"
          >
            {translateMessageKey(language, "shell.navToday")}
          </button>
        </div>
      </div>
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
  const formattedDate = formatDateScopeValue(date, language);
  const windowLabel =
    timeScope?.window_start && timeScope.window_end
      ? `${formatTimestamp(timeScope.window_start, "dateTime", language, timeScope.timezone)} - ${formatTimestamp(
          timeScope.window_end,
          "dateTime",
          language,
          timeScope.timezone,
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
          {translateMessageKey(language, "shell.viewingHistoricalDashboardFor")} {formattedDate}
        </strong>
        <span>
          {windowLabel ??
            translateMessageKey(
              language,
              "shell.historicalDataDisclaimer",
            )}
        </span>
      </span>
      <button
        className="historical-banner-action"
        onClick={onReturnToLive}
        type="button"
      >
        <span className="historical-banner-arrow" aria-hidden="true">
          →
        </span>
        {translateMessageKey(language, "shell.returnToLive")}
      </button>
    </div>
  );
}
