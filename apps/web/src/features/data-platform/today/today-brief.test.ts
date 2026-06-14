import { describe, expect, it } from "vitest";

import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import type { PublicDashboardRead } from "../types";
import {
  buildPlanItems,
  buildTodayBrief,
  isPlaceholderRecommendation,
  isRecommendationExpired,
} from "./today-brief";

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

    expect(buildPlanItems(items, Date.parse("2026-08-09T08:30:00Z")).map((item) => item.id)).toEqual([
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

    expect(buildPlanItems(items, Date.parse("2026-08-09T08:30:00Z")).map((item) => item.id)).toEqual([
      "scenario-info",
    ]);
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

describe("isRecommendationExpired", () => {
  it("treats invalid and ended validity windows as unavailable", () => {
    const now = Date.parse("2026-08-09T09:00:00Z");

    expect(isRecommendationExpired({ valid_to: "not-a-timestamp" }, now)).toBe(true);
    expect(isRecommendationExpired({ valid_to: "2026-08-09T08:59:00Z" }, now)).toBe(true);
    expect(isRecommendationExpired({ valid_to: "2026-08-09T09:00:00Z" }, now)).toBe(false);
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
    expect(brief?.recommendationMode).toBe("live");
  });

  it("hides regional recommendations outside their covered area", () => {
    const brief = buildTodayBrief({
      publicDashboard: {
        ...dashboard,
        coverage_area: "Helsinki/Uusimaa",
        top_actions: [
          {
            id: "commute-action",
            scenario_key: "commute",
            title: "Leave earlier",
            body: "A regional transit alert is active.",
            severity: "HIGH",
            area_scope: "helsinki_metro",
            freshness_state: "fresh",
            valid_from: "2026-08-09T08:00:00Z",
            valid_to: "2026-08-09T09:00:00Z",
            evidence: ["DIGITRANSIT"],
          },
        ],
        timeline: [
          {
            scenario_key: "outdoor",
            label: "Regional scenario",
            severity: "HIGH",
            starts_at: "2026-08-09T08:00:00Z",
            ends_at: "2026-08-09T09:00:00Z",
          },
        ],
      },
      overviewCoverageArea: "Tampere/Pirkanmaa",
      summaryTiles: [],
      timelineItems: [
        timelineItem("regional-scenario", "HIGH", "2026-08-09T08:00:00Z"),
        timelineItem("local-event", "HIGH", "2026-08-09T09:00:00Z", "event"),
      ],
      language: "en",
      now: Date.parse("2026-08-09T08:30:00Z"),
    });

    expect(brief?.recommendationMode).toBe("out_of_scope");
    expect(brief?.topActions).toEqual([]);
    expect(brief?.planItems).toEqual([]);
    expect(brief?.headline).toBe("Recommendations are not available for this area");
  });

  it("marks historical Today as evidence-only", () => {
    const brief = buildTodayBrief({
      publicDashboard: dashboard,
      overviewCoverageArea: "Helsinki/Uusimaa",
      isHistorical: true,
      summaryTiles: [],
      timelineItems: [timelineItem("historical-event", "HIGH", "2026-08-09T09:00:00Z")],
      language: "en",
    });

    expect(brief?.recommendationMode).toBe("historical");
    expect(brief?.topActions).toEqual([]);
    expect(brief?.planItems).toEqual([]);
    expect(brief?.headline).toBe("Historical view · recommendations are read-only");
  });

  it("localizes the urgent headline without mutating the API copy", () => {
    const brief = buildTodayBrief({
      publicDashboard: {
        ...dashboard,
        top_actions: [
          {
            id: "commute-action",
            scenario_key: "commute",
            title: "Leave a few minutes earlier",
            title_zh: "提前几分钟出发",
            body: "A regional transit alert is active.",
            body_zh: "早高峰期间有公共交通提醒。",
            severity: "HIGH",
            area_scope: "Helsinki",
            freshness_state: "fresh",
            valid_from: "2026-08-09T08:00:00Z",
            valid_to: "2026-08-09T09:00:00Z",
            evidence: ["DIGITRANSIT"],
          },
        ],
      },
      overviewCoverageArea: "Helsinki/Uusimaa",
      summaryTiles: [],
      timelineItems: [],
      language: "zh",
      now: Date.parse("2026-08-09T08:30:00Z"),
    });

    expect(brief?.headline).toBe("提前几分钟出发");
    expect(brief?.topActions[0]?.title).toBe("Leave a few minutes earlier");
  });

  it("does not turn an expired action into today's headline", () => {
    const brief = buildTodayBrief({
      publicDashboard: {
        ...dashboard,
        top_actions: [
          {
            id: "expired-action",
            scenario_key: "commute",
            title: "Leave earlier",
            body: "The morning alert has ended.",
            severity: "HIGH",
            area_scope: "Helsinki",
            freshness_state: "fresh",
            valid_from: "2026-08-09T07:00:00Z",
            valid_to: "2026-08-09T08:00:00Z",
            evidence: [],
          },
        ],
      },
      overviewCoverageArea: "Helsinki/Uusimaa",
      summaryTiles: [],
      timelineItems: [],
      language: "en",
      now: Date.parse("2026-08-09T09:00:00Z"),
    });

    expect(brief?.topActions).toEqual([]);
    expect(brief?.headline).toBe("Core daily scenarios are currently clear.");
  });
});
