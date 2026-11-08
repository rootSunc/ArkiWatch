import { WeatherTimePreset, WeatherTimeWindow } from "../types";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const MS_PER_HOUR = 60 * 60 * 1000;

function localDateInputValue(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: HELSINKI_TIME_ZONE
  }).format(value);
}

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function localDateTimeInputValue(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: HELSINKI_TIME_ZONE
  }).formatToParts(value);
  const year = datePart(parts, "year");
  const month = datePart(parts, "month");
  const day = datePart(parts, "day");
  const hour = datePart(parts, "hour").padStart(2, "0").replace(/^24$/, "00");
  const minute = datePart(parts, "minute");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function timeZoneOffsetMs(value: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: HELSINKI_TIME_ZONE
  }).formatToParts(value);
  const hour = Number(datePart(parts, "hour").replace(/^24$/, "00"));
  const zonedAsUtc = Date.UTC(
    Number(datePart(parts, "year")),
    Number(datePart(parts, "month")) - 1,
    Number(datePart(parts, "day")),
    hour,
    Number(datePart(parts, "minute")),
    Number(datePart(parts, "second"))
  );

  return zonedAsUtc - value.getTime();
}

function zonedDateTimeValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const utcGuess = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  );
  const firstPass = new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess));

  return new Date(utcGuess.getTime() - timeZoneOffsetMs(firstPass));
}

function shiftDateInputValue(value: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days, 12)));
}

function isCanonicalDateInputValue(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(parsedDate) === value;
}

function zonedDateStart(value: string): Date | null {
  return zonedDateTimeValue(`${value}T00:00`);
}

function zonedDateEnd(value: string): Date | null {
  const nextDate = shiftDateInputValue(value, 1);
  return nextDate ? zonedDateStart(nextDate) : null;
}

function formatWindowEndpoint(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  }).format(value);
}

function formatWindowRange(startsAt: Date, endsAt: Date): string {
  return `${formatWindowEndpoint(startsAt)} to ${formatWindowEndpoint(endsAt)}`;
}

export function defaultCustomWindowForDate(dateValue: string): { startsAt: string; endsAt: string } {
  const todayDate = localDateInputValue(new Date());
  const selectedStart = zonedDateStart(dateValue);
  const startsAt = dateValue === todayDate ? new Date() : selectedStart ?? new Date();
  const endsAt = new Date(startsAt.getTime() + 6 * MS_PER_HOUR);

  return {
    startsAt: localDateTimeInputValue(startsAt),
    endsAt: localDateTimeInputValue(endsAt)
  };
}

export function isValidSourceDate(dateValue: string): boolean {
  return isCanonicalDateInputValue(dateValue) && zonedDateStart(dateValue) !== null;
}

export function normalizeSourceDateValue(value: string | null | undefined): string | null {
  if (!value || !isValidSourceDate(value)) {
    return null;
  }

  const todayDate = localDateInputValue(new Date());
  if (value >= todayDate) {
    return null;
  }

  return value;
}

function invalidWeatherTimeWindow(preset: WeatherTimePreset, label: string): WeatherTimeWindow {
  return {
    preset,
    label,
    shortLabel: label,
    startsAt: null,
    endsAt: null,
    status: "Choose a valid time window",
    isValid: false
  };
}

export function buildWeatherTimeWindow(
  preset: WeatherTimePreset,
  selectedDate: string,
  customStart: string,
  customEnd: string
): WeatherTimeWindow {
  const todayDate = localDateInputValue(new Date());
  const selectedStart = zonedDateStart(selectedDate);
  const selectedEnd = zonedDateEnd(selectedDate);
  if (!selectedStart || !selectedEnd) {
    return invalidWeatherTimeWindow(preset, "Time window");
  }

  if (preset === "day") {
    const label = selectedDate === todayDate ? "Today" : "Selected day";
    return {
      preset,
      label,
      shortLabel: label,
      startsAt: selectedStart.toISOString(),
      endsAt: selectedEnd.toISOString(),
      status: formatWindowRange(selectedStart, selectedEnd),
      isValid: true
    };
  }

  if (preset === "custom") {
    const startsAt = zonedDateTimeValue(customStart);
    const endsAt = zonedDateTimeValue(customEnd);
    if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
      return invalidWeatherTimeWindow(preset, "Custom window");
    }

    return {
      preset,
      label: "Custom window",
      shortLabel: "Custom",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: formatWindowRange(startsAt, endsAt),
      isValid: true
    };
  }

  const startsAt = selectedDate === todayDate ? new Date() : selectedStart;
  const hours = preset === "next24h" ? 24 : 24 * 7;
  const endsAt = new Date(startsAt.getTime() + hours * MS_PER_HOUR);
  const label =
    preset === "next24h"
      ? selectedDate === todayDate
        ? "Next 24h"
        : "24h from source day"
      : selectedDate === todayDate
        ? "7-day horizon"
        : "7d from source day";

  return {
    preset,
    label,
    shortLabel: preset === "next24h" ? "24h" : "7d",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: formatWindowRange(startsAt, endsAt),
    isValid: true
  };
}
