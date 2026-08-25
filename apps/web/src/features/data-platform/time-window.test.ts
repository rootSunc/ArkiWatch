import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildWeatherTimeWindow,
  defaultCustomWindowForDate,
  isValidSourceDate,
  normalizeSourceDateValue
} from "./time-window";

// Pinned to a Helsinki winter date (EET, UTC+2, no DST) so every offset below
// is unambiguous and doesn't depend on knowing the current DST transition.
const PINNED_NOW = "2026-01-15T10:00:00.000Z";
const TODAY = "2026-01-15";
const PAST_DATE = "2026-01-10";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(PINNED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isValidSourceDate", () => {
  it("accepts a canonical YYYY-MM-DD date", () => {
    expect(isValidSourceDate("2026-01-10")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidSourceDate("2026-1-10")).toBe(false);
    expect(isValidSourceDate("not-a-date")).toBe(false);
    expect(isValidSourceDate("")).toBe(false);
  });

  it("rejects a calendar date that does not exist", () => {
    expect(isValidSourceDate("2026-02-30")).toBe(false);
  });
});

describe("normalizeSourceDateValue", () => {
  it("passes a strictly past date through unchanged", () => {
    expect(normalizeSourceDateValue(PAST_DATE)).toBe(PAST_DATE);
  });

  it("rejects null, undefined, and invalid input", () => {
    expect(normalizeSourceDateValue(null)).toBeNull();
    expect(normalizeSourceDateValue(undefined)).toBeNull();
    expect(normalizeSourceDateValue("not-a-date")).toBeNull();
  });

  it("rejects today and future dates", () => {
    expect(normalizeSourceDateValue(TODAY)).toBeNull();
    expect(normalizeSourceDateValue("2026-01-20")).toBeNull();
  });
});

describe("buildWeatherTimeWindow", () => {
  it("builds the full local day window for a past date, labeled 'Selected day'", () => {
    const window = buildWeatherTimeWindow("day", PAST_DATE, "", "");

    expect(window.isValid).toBe(true);
    expect(window.label).toBe("Selected day");
    expect(window.startsAt).toBe("2026-01-09T22:00:00.000Z");
    expect(window.endsAt).toBe("2026-01-10T22:00:00.000Z");
  });

  it("builds the full local day window for today, labeled 'Today'", () => {
    const window = buildWeatherTimeWindow("day", TODAY, "", "");

    expect(window.isValid).toBe(true);
    expect(window.label).toBe("Today");
    expect(window.startsAt).toBe("2026-01-14T22:00:00.000Z");
    expect(window.endsAt).toBe("2026-01-15T22:00:00.000Z");
  });

  it("anchors next24h to the start of a past selected day", () => {
    const window = buildWeatherTimeWindow("next24h", PAST_DATE, "", "");

    expect(window.label).toBe("24h from source day");
    expect(window.startsAt).toBe("2026-01-09T22:00:00.000Z");
    expect(window.endsAt).toBe("2026-01-10T22:00:00.000Z");
  });

  it("anchors next24h to now when the selected day is today", () => {
    const window = buildWeatherTimeWindow("next24h", TODAY, "", "");

    expect(window.label).toBe("Next 24h");
    expect(window.startsAt).toBe(PINNED_NOW);
    expect(window.endsAt).toBe("2026-01-16T10:00:00.000Z");
  });

  it("anchors next7d to now when the selected day is today", () => {
    const window = buildWeatherTimeWindow("next7d", TODAY, "", "");

    expect(window.label).toBe("7-day horizon");
    expect(window.startsAt).toBe(PINNED_NOW);
    expect(window.endsAt).toBe("2026-01-22T10:00:00.000Z");
  });

  it("builds a valid custom window from local Helsinki datetime inputs", () => {
    const window = buildWeatherTimeWindow("custom", PAST_DATE, "2026-01-10T08:00", "2026-01-10T14:00");

    expect(window.isValid).toBe(true);
    expect(window.startsAt).toBe("2026-01-10T06:00:00.000Z");
    expect(window.endsAt).toBe("2026-01-10T12:00:00.000Z");
    expect(window.status).toContain("to");
  });

  it("rejects a custom window that ends before or at its start", () => {
    const window = buildWeatherTimeWindow("custom", PAST_DATE, "2026-01-10T14:00", "2026-01-10T08:00");

    expect(window.isValid).toBe(false);
    expect(window.label).toBe("Custom window");
    expect(window.startsAt).toBeNull();
    expect(window.endsAt).toBeNull();
  });

  it("rejects an unparseable selected date regardless of preset", () => {
    const window = buildWeatherTimeWindow("day", "not-a-date", "", "");

    expect(window.isValid).toBe(false);
    expect(window.label).toBe("Time window");
  });
});

describe("defaultCustomWindowForDate", () => {
  it("anchors to now for today, spanning 6 hours in local time", () => {
    const window = defaultCustomWindowForDate(TODAY);

    expect(window.startsAt).toBe("2026-01-15T12:00");
    expect(window.endsAt).toBe("2026-01-15T18:00");
  });

  it("anchors to local midnight for a past date, spanning 6 hours", () => {
    const window = defaultCustomWindowForDate(PAST_DATE);

    expect(window.startsAt).toBe("2026-01-10T00:00");
    expect(window.endsAt).toBe("2026-01-10T06:00");
  });
});
