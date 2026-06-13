import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./format";

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
});
