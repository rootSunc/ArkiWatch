import { describe, expect, it } from "vitest";

import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import type { PublicDashboardRead } from "../types";
import { buildPlanItems, buildTodayBrief, isPlaceholderRecommendation } from "./today-brief";

function timelineItem(
  id: string,
  severity: string,
  startsAt: string,
  kind: CrossDomainTimelineItem["kind"] = "scenario",
): CrossDomainTimelineItem {
  return {
    id,
    kind,
    title: id,
    detail: `${id} detail`,
    severity,
    startsAt,
    endsAt: "2026-08-09T12:00:00Z",
    categoryKey: "weather",
    scenarioKey: kind === "scenario" ? "outdoor" : undefined,
  };
}

const dashboard: PublicDashboardRead = {
  checked_at: "2026-08-09T08:00:00Z",
  app_name: "ArkiWatch",
  timezone: "Europe/Helsinki",
  coverage_area: "Helsinki/Uusimaa",
  top_actions: [],
  scenario_channels: [],
  scenario_sections: [],
  timeline: [],
  broadcasts: [],
  sources: [],
};

describe("buildPlanItems", () => {
  it("keeps the three most important decision moments", () => {
    const items = [
      timelineItem("low", "LOW", "2026-08-09T08:00:00Z"),
      timelineItem("high-later", "HIGH", "2026-08-09T10:00:00Z"),
      timelineItem("medium", "MEDIUM", "2026-08-09T07:00:00Z"),
      timelineItem("high-sooner", "HIGH", "2026-08-09T09:00:00Z"),
    ];

    expect(buildPlanItems(items).map((item) => item.id)).toEqual([
      "high-sooner",
      "high-later",
      "medium",
    ]);
  });

  it("drops informational events while retaining scenario entries", () => {
    const items = [
      timelineItem("event-info", "INFO", "2026-08-09T08:00:00Z", "event"),
      timelineItem("scenario-info", "INFO", "2026-08-09T09:00:00Z"),
    ];

    expect(buildPlanItems(items).map((item) => item.id)).toEqual(["scenario-info"]);
  });
});

describe("isPlaceholderRecommendation", () => {
  it("recognizes generated placeholder recommendations", () => {
    expect(isPlaceholderRecommendation("placeholder-energy", "Waiting for data")).toBe(true);
    expect(
      isPlaceholderRecommendation("energy", "No active regional recommendation is available."),
    ).toBe(true);
    expect(isPlaceholderRecommendation("energy", "Run the dishwasher after 22:00.")).toBe(false);
  });
});

describe("buildTodayBrief", () => {
  it("surfaces a regional scope warning when the selected area differs", () => {
    const brief = buildTodayBrief({
      publicDashboard: dashboard,
      overviewCoverageArea: "Tampere/Pirkanmaa",
      summaryTiles: [],
      timelineItems: [],
      language: "en",
    });

    expect(brief?.coverageArea).toBe("Tampere/Pirkanmaa");
    expect(brief?.recommendationCoverageArea).toBe("Helsinki/Uusimaa");
  });

  it("does not add a warning when both views share the same region", () => {
    const brief = buildTodayBrief({
      publicDashboard: dashboard,
      overviewCoverageArea: "Espoo/Uusimaa",
      summaryTiles: [],
      timelineItems: [],
      language: "en",
    });

    expect(brief?.recommendationCoverageArea).toBeNull();
  });
});
