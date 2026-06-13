import { describe, expect, it } from "vitest";

import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";

describe("resolveDataTimezone", () => {
  it("keeps a valid payload timezone", () => {
    expect(resolveDataTimezone("America/Toronto")).toBe("America/Toronto");
  });

  it("falls back for empty or invalid payload values", () => {
    expect(resolveDataTimezone("  ")).toBe(DEFAULT_DATA_TIME_ZONE);
    expect(resolveDataTimezone("not/a-timezone")).toBe(DEFAULT_DATA_TIME_ZONE);
    expect(resolveDataTimezone(null)).toBe(DEFAULT_DATA_TIME_ZONE);
  });
});
