import { describe, expect, it } from "vitest";

import type { PlatformCategory } from "@/features/data-platform/types";

import { assistantCategoryLabel, firstAssistantCategoryLabel } from "./assistant-suggestions";

const weatherCategory: PlatformCategory = {
  key: "weather",
  title: "Weather",
  description: "Weather signals.",
  status: "healthy",
  stage: "active",
  priority: "primary",
  source_codes: ["fmi"],
  summary_metrics: [],
  visualizations: [],
  sources: [],
  events: [],
};

describe("assistant category suggestions", () => {
  it("uses the shared category label in the selected language", () => {
    expect(assistantCategoryLabel(weatherCategory, "en")).toBe("Weather");
    expect(assistantCategoryLabel(weatherCategory, "zh")).toBe("天气");
  });

  it("falls back to a localized weather label when overview data is missing", () => {
    expect(firstAssistantCategoryLabel(null, "en")).toBe("Weather");
    expect(firstAssistantCategoryLabel(null, "zh")).toBe("天气");
  });
});
