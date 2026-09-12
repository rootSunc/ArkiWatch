import { describe, expect, it } from "vitest";

import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import { demoFixtureForScope } from "../demo/demo-data";
import type { PublicDashboardRead } from "../types";
import {
  buildPlanItems,
  buildTodayBrief,
  isPlaceholderRecommendation,
  isRecommendationExpired,
  todayBriefEvaluationTime,
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
    state: "upcoming",
    scenarioKey: kind === "scenario" ? "outdoor" : undefined,
  };
}

const dashboard: PublicDashboardRead = {
  checked_at: "2026-08-09T08:00:00Z",
  snapshot_available: true,
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

  it("does not repeat a source event when a normalized scenario covers it", () => {
    const items = [
      {
        ...timelineItem("transit-event", "HIGH", "2026-08-09T08:00:00Z", "event"),
        categoryKey: "transit",
        endsAt: "2026-08-09T11:00:00Z",
      },
      {
        ...timelineItem("commute-scenario", "HIGH", "2026-08-09T08:00:00Z"),
        categoryKey: "mobility",
        scenarioKey: "commute",
        endsAt: "2026-08-09T11:00:00Z",
      },
    ];

    expect(buildPlanItems(items, Date.parse("2026-08-09T08:30:00Z")).map((item) => item.id)).toEqual([
      "commute-scenario",
    ]);
  });

  it("removes the primary recommendation scenario from the supporting plan", () => {
    const items = [
      { ...timelineItem("commute-scenario", "HIGH", "2026-08-09T08:00:00Z"), scenarioKey: "commute" },
      { ...timelineItem("outdoor-scenario", "MEDIUM", "2026-08-09T09:00:00Z"), scenarioKey: "outdoor" },
    ];

    expect(
      buildPlanItems(items, Date.parse("2026-08-09T08:30:00Z"), {
        excludeScenarioKey: "commute",
      }).map((item) => item.id),
    ).toEqual(["outdoor-scenario"]);
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
  it("keeps the static demo snapshot actionable without presenting it as live data", () => {
    const fixture = demoFixtureForScope();
    const brief = buildTodayBrief({
      publicDashboard: fixture.publicDashboard,
      overviewCoverageArea: fixture.overview.coverage_area,
      summaryTiles: [],
      timelineItems: [],
      language: "en",
      now: todayBriefEvaluationTime(true, fixture.overview.checked_at),
    });

    expect(brief?.recommendationMode).toBe("live");
    expect(brief?.topActions.length).toBeGreaterThan(0);
  });

  it("does not turn an unsupported demo city into a clear-looking brief", () => {
    const fixture = demoFixtureForScope({ city: "espoo" });
    const brief = buildTodayBrief({
      publicDashboard: fixture.publicDashboard,
      overviewCoverageArea: fixture.overview.coverage_area,
      summaryTiles: [],
      timelineItems: [],
      language: "en",
    });

    expect(brief?.hasScopedData).toBe(false);
    expect(brief?.headline).toBe("No signal data is available for this scope.");
    expect(brief?.topActions).toEqual([]);
  });

  it("uses the fixture clock only in demo mode", () => {
    const referenceAt = "2026-08-09T04:00:00.000Z";

    expect(todayBriefEvaluationTime(true, referenceAt, 0)).toBe(
      Date.parse(referenceAt),
    );
    expect(todayBriefEvaluationTime(false, referenceAt, 123)).toBe(123);
    expect(todayBriefEvaluationTime(true, "invalid", 456)).toBe(456);
  });

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

  it("hides live recommendations when the dated snapshot is stale", () => {
    const brief = buildTodayBrief({
      publicDashboard: {
        ...dashboard,
        snapshot_date: "2026-08-08",
        top_actions: [
          {
            id: "stale-action",
            scenario_key: "commute",
            title: "Leave earlier",
            body: "A regional transit alert is active.",
            severity: "HIGH",
            area_scope: "Helsinki",
            freshness_state: "fresh",
            valid_from: "2026-08-08T08:00:00Z",
            valid_to: "2026-08-08T09:00:00Z",
            evidence: ["DIGITRANSIT"],
          },
        ],
      },
      overviewCoverageArea: "Helsinki/Uusimaa",
      summaryTiles: [],
      timelineItems: [],
      language: "en",
      now: Date.parse("2026-08-11T08:00:00Z"),
    });

    expect(brief?.recommendationMode).toBe("stale");
    expect(brief?.topActions).toEqual([]);
    expect(brief?.planItems).toEqual([]);
    expect(brief?.headline).toBe("Public snapshot is stale");
  });

  it("does not present generation time when the historical public snapshot is missing", () => {
    const brief = buildTodayBrief({
      publicDashboard: {
        ...dashboard,
        snapshot_available: false,
        scenario_sections: [
          {
            key: "commute",
            title: "Commute",
            description: "Alerts for transit and road disruption windows.",
            status_label: "No active commute recommendation",
            area_scope: "helsinki_uusimaa",
            freshness_state: "degraded",
            valid_from: "2026-08-09T08:00:00Z",
            valid_to: "2026-08-09T08:00:00Z",
            evidence: [],
            source_codes: ["digitransit", "digitraffic"],
            recommendation: {
              id: "placeholder-commute",
              scenario_key: "commute",
              title: "No active commute recommendation",
              body: "Data will appear here after the public rule engine emits the first regional recommendation.",
              severity: "info",
              area_scope: "helsinki_uusimaa",
              freshness_state: "degraded",
              valid_from: "2026-08-09T08:00:00Z",
              valid_to: "2026-08-09T08:00:00Z",
              evidence: [],
            },
          },
        ],
        timeline: [
          {
            scenario_key: "commute",
            label: "No active commute recommendation",
            severity: "info",
            starts_at: "2026-08-09T08:00:00Z",
            ends_at: "2026-08-09T08:00:00Z",
          },
        ],
      },
      overviewCoverageArea: "Helsinki/Uusimaa",
      isHistorical: true,
      summaryTiles: [],
      timelineItems: [],
      language: "en",
    });

    expect(brief?.historicalSnapshotAvailable).toBe(false);
    expect(brief?.hasScopedData).toBe(false);
    expect(brief?.headline).toBe("No signal data is available for this scope.");
    expect(brief?.checkedAt).toBeNull();
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
