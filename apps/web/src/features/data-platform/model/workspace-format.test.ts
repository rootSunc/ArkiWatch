import { describe, expect, it } from "vitest";

import type { PlatformCategory } from "../types";
import { categoryMetric, categoryStatusTone, endpointHost, isPresent, metricDisplayValue } from "./workspace-format";

describe("categoryStatusTone", () => {
  it.each([
    ["healthy", "good"],
    ["connected", "good"],
    ["stale", "warn"],
    ["planned", "warn"],
    ["failing", "bad"],
    ["inactive", "bad"],
    ["unknown", "neutral"],
    [null, "neutral"],
  ])("maps %s to %s", (status, tone) => {
    expect(categoryStatusTone(status)).toBe(tone);
  });
});

describe("metricDisplayValue", () => {
  it("joins value and unit, or falls back to the missing label", () => {
    expect(metricDisplayValue({ value: "12", unit: "km" }, "missing")).toBe("12 km");
    expect(metricDisplayValue({ value: "12", unit: null }, "missing")).toBe("12");
    expect(metricDisplayValue(null, "missing")).toBe("missing");
  });

  it("translates the value when a data label is given", () => {
    expect(metricDisplayValue({ value: "ready", unit: null }, "missing", (value) => `<${value}>`)).toBe("<ready>");
  });
});

describe("endpointHost", () => {
  it("returns the host, the raw string for non-URLs, or the missing label", () => {
    expect(endpointHost("https://api.example.test/v1?x=1", "none")).toBe("api.example.test");
    expect(endpointHost("not a url", "none")).toBe("not a url");
    expect(endpointHost(null, "none")).toBe("none");
  });
});

describe("categoryMetric and isPresent", () => {
  it("finds summary metrics by key and filters missing ones", () => {
    const category = { summary_metrics: [{ key: "records", value: "4" }] } as unknown as PlatformCategory;
    const found = categoryMetric(category, "records");
    expect(found?.value).toBe("4");
    expect(categoryMetric(category, "absent")).toBeNull();
    expect([found, categoryMetric(category, "absent")].filter(isPresent)).toHaveLength(1);
  });
});
