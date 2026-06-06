import { describe, expect, it } from "vitest";

import {
  buildActionDataPoints,
  buildTodayActionCardView,
  recommendationTone,
} from "./today-action-card-model";

describe("recommendationTone", () => {
  it("maps recommendation severity to the shared visual vocabulary", () => {
    expect(recommendationTone("HIGH", false)).toBe("bad");
    expect(recommendationTone("MEDIUM", false)).toBe("warn");
    expect(recommendationTone("LOW", false)).toBe("good");
    expect(recommendationTone("HIGH", true)).toBe("neutral");
  });
});

describe("buildActionDataPoints", () => {
  it("returns at most two concise points for a decision card", () => {
    const points = buildActionDataPoints(
      "commute",
      {
        weather: null,
        airQuality: null,
        householdEnergy: null,
        systemEnergy: null,
        transit: {
          quality: { active_alert_count: 4 },
        } as never,
        roadRail: {
          quality: { active_event_count: 7 },
        } as never,
      },
      "en",
    );

    expect(points).toEqual([
      { label: "Transit", value: "4" },
      { label: "Road & Rail", value: "7" },
    ]);
  });
});

describe("buildTodayActionCardView", () => {
  it("localizes recommendation copy for the Chinese Today surface", () => {
    const view = buildTodayActionCardView(
      {
        key: "commute",
        title: "Commute",
        title_zh: "通勤",
        description: "Transit signals.",
        description_zh: "公共交通信号。",
        status_label: "Needs attention",
        status_label_zh: "需要留意",
        area_scope: "Helsinki",
        freshness_state: "fresh",
        valid_from: "2026-08-09T08:00:00Z",
        valid_to: "2026-08-09T09:00:00Z",
        evidence: ["DIGITRANSIT"],
        source_codes: ["digitransit"],
        recommendation: {
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
      },
      {
        weather: null,
        airQuality: null,
        transit: null,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "zh",
    );

    expect(view.title).toBe("需要留意");
    expect(view.body).toBe("早高峰期间有公共交通提醒。");
  });

  it("does not present an out-of-scope recommendation as advice", () => {
    const view = buildTodayActionCardView(
      {
        key: "commute",
        title: "Commute",
        description: "Transit signals.",
        status_label: "Leave earlier",
        area_scope: "helsinki_metro",
        freshness_state: "fresh",
        valid_from: "2026-08-09T08:00:00Z",
        valid_to: "2026-08-09T09:00:00Z",
        evidence: ["DIGITRANSIT"],
        source_codes: ["digitransit"],
        recommendation: {
          id: "regional-commute",
          scenario_key: "commute",
          title: "Leave earlier",
          body: "A Helsinki alert is active.",
          severity: "HIGH",
          area_scope: "helsinki_metro",
          freshness_state: "fresh",
          valid_from: "2026-08-09T08:00:00Z",
          valid_to: "2026-08-09T09:00:00Z",
          evidence: ["DIGITRANSIT"],
        },
      },
      {
        weather: null,
        airQuality: null,
        transit: null,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "en",
      "out_of_scope",
    );

    expect(view.title).toBe("No recommendation for this area");
    expect(view.body).toBe("Open a signal workspace to inspect the underlying data.");
    expect(view.tone).toBe("neutral");
    expect(view.sources).toBe("");
  });
});
