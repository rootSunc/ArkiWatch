import { describe, expect, it } from "vitest";

import { formatCompactAge, formatReadingDelta, formatRelativeAge, formatScopedClock, formatTimestamp, parseValidDate } from "./format";

describe("parseValidDate", () => {
  it("returns null instead of an invalid Date for malformed values", () => {
    expect(parseValidDate("not-a-timestamp")).toBeNull();
    expect(parseValidDate(Number.NaN)).toBeNull();
  });

  it("does not mutate a valid Date input", () => {
    const input = new Date("2026-08-09T12:00:00Z");
    const parsed = parseValidDate(input);

    expect(parsed).not.toBe(input);
    expect(parsed?.toISOString()).toBe(input.toISOString());
  });
});

describe("formatTimestamp", () => {
  it("can render a timestamp in the platform timezone", () => {
    expect(
      formatTimestamp("2026-08-09T12:00:00Z", "dateTime", "en", "Europe/Helsinki"),
    ).toContain("15:00");
  });

  it("uses natural Chinese calendar day formatting", () => {
    expect(
      formatTimestamp("2026-08-09T12:00:00Z", "dateTime", "zh", "Europe/Helsinki"),
    ).toContain("8月9日");
    expect(
      formatTimestamp("2026-08-09T12:00:00Z", "dateTime", "zh", "Europe/Helsinki"),
    ).not.toContain("8月09日");
  });

  it("falls back to the runtime timezone when a configured timezone is invalid", () => {
    expect(
      formatTimestamp("2026-08-09T12:00:00Z", "dateTime", "en", "not/a-timezone"),
    ).toMatch(/\d{2}:\d{2}/);
  });

  it("returns a safe fallback for malformed timestamps", () => {
    expect(formatTimestamp("not-a-timestamp", "dateTime", "en")).toBe("Not available");
    expect(formatTimestamp("not-a-timestamp", "dateTime", "zh")).toBe("暂无数据");
  });

  it("can render a clock-only time in the platform timezone", () => {
    expect(formatTimestamp("2026-08-09T12:00:00Z", "time", "en", "Europe/Helsinki")).toBe(
      "15:00",
    );
  });
});

describe("formatScopedClock", () => {
  it("shows a clock on the scoped day and the date on any other day", () => {
    expect(
      formatScopedClock("2026-08-09T05:00:00Z", "2026-08-09T06:00:00Z", "en", "Europe/Helsinki"),
    ).toBe("08:00");
    expect(
      formatScopedClock("2026-08-08T05:00:00Z", "2026-08-09T06:00:00Z", "en", "Europe/Helsinki"),
    ).toContain("08 Aug");
  });
});

describe("formatCompactAge", () => {
  it("rounds an observation age to the design's compact unit", () => {
    const now = Date.parse("2026-08-09T10:00:00Z");
    expect(formatCompactAge("2026-08-09T07:00:00Z", now)).toBe("3h");
    expect(formatCompactAge("2026-08-09T09:40:00Z", now)).toBe("20m");
    expect(formatCompactAge("2026-08-06T10:00:00Z", now)).toBe("3d");
    expect(formatCompactAge(null, now)).toBeNull();
  });
});

describe("formatReadingDelta", () => {
  it("keeps a zero change flat and attaches the reading unit", () => {
    expect(formatReadingDelta(16, 17, "°C")).toBe("+1 °");
    expect(formatReadingDelta(72, 68, "%")).toBe("−4 pt");
    expect(formatReadingDelta(3.4, 3.4, "m/s")).toBe("±0 m/s");
    expect(formatReadingDelta(2, 2.25)).toBe("+0.3");
  });
});

describe("formatRelativeAge", () => {
  it("does not expose NaN for malformed timestamps", () => {
    expect(formatRelativeAge("not-a-timestamp", "en")).toBe("Not available");
    expect(formatRelativeAge("not-a-timestamp", "zh")).toBe("暂无数据");
  });
});
