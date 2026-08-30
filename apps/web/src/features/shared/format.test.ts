import { describe, expect, it } from "vitest";

import { formatRelativeAge, formatTimestamp, parseValidDate } from "./format";

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

describe("formatRelativeAge", () => {
  it("does not expose NaN for malformed timestamps", () => {
    expect(formatRelativeAge("not-a-timestamp", "en")).toBe("Not available");
    expect(formatRelativeAge("not-a-timestamp", "zh")).toBe("暂无数据");
  });
});
