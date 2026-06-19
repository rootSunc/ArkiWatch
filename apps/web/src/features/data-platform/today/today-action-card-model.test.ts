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

  it("keeps energy windows in the public dashboard timezone", () => {
    const points = buildActionDataPoints(
      "energy",
      {
        weather: null,
        airQuality: null,
        transit: null,
        roadRail: null,
        householdEnergy: {
          current_window: {
            starts_at: "2026-08-09T12:00:00Z",
            ends_at: "2026-08-09T13:00:00Z",
            average_value: 9.5,
            unit: "c/kWh",
          },
        } as never,
        systemEnergy: null,
      },
      "en",
      "Europe/Helsinki",
    );

    expect(points).toEqual([
      { label: "Window", value: "15:00–16:00" },
      { label: "Average", value: "9.50 c/kWh" },
    ]);
  });

  it("does not create action-card points from empty signal payloads", () => {
    const points = buildActionDataPoints(
      "commute",
      {
        weather: null,
        airQuality: null,
        transit: { status: "empty", quality: { active_alert_count: 4 } } as never,
        roadRail: { status: "empty", quality: { active_event_count: 7 } } as never,
        householdEnergy: null,
        systemEnergy: null,
      },
      "en",
    );

    expect(points).toEqual([]);
  });

  it("localizes air metrics and skips malformed numeric readings", () => {
    const points = buildActionDataPoints(
      "home_air",
      {
        weather: null,
        airQuality: {
          stations: [
            { station: "Kallio", pm2_5: 5.4, no2: Number.NaN },
          ],
          worst_station: "Kallio",
        } as never,
        transit: null,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "zh",
    );

    expect(points).toEqual([{ label: "PM2.5", value: "5.4 µg/m³" }]);
  });

  it("falls back safely when a deployment timezone is invalid", () => {
    const points = buildActionDataPoints(
      "energy",
      {
        weather: null,
        airQuality: null,
        transit: null,
        roadRail: null,
        householdEnergy: {
          current_window: {
            starts_at: "2026-08-09T12:00:00Z",
            ends_at: "2026-08-09T13:00:00Z",
            average_value: Number.NaN,
            unit: "c/kWh",
          },
        } as never,
        systemEnergy: null,
      },
      "en",
      "not/a-timezone",
    );

    expect(points).toEqual([{ label: "Window", value: "15:00–16:00" }]);
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
      "live",
      "Europe/Helsinki",
      Date.parse("2026-08-09T08:30:00Z"),
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

  it("does not present an expired recommendation as current guidance", () => {
    const view = buildTodayActionCardView(
      {
        key: "outdoor",
        title: "Outdoor conditions",
        description: "Weather signals.",
        status_label: "Carry rain gear",
        area_scope: "helsinki_uusimaa",
        freshness_state: "fresh",
        valid_from: "2026-08-09T07:00:00Z",
        valid_to: "2026-08-09T08:00:00Z",
        evidence: [],
        source_codes: ["fmi"],
        recommendation: {
          id: "expired-outdoor",
          scenario_key: "outdoor",
          title: "Carry rain gear",
          body: "Rain has already passed.",
          severity: "HIGH",
          area_scope: "helsinki_uusimaa",
          freshness_state: "fresh",
          valid_from: "2026-08-09T07:00:00Z",
          valid_to: "2026-08-09T08:00:00Z",
          evidence: [],
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
      "live",
      "Europe/Helsinki",
      Date.parse("2026-08-09T09:00:00Z"),
    );

    expect(view.title).toBe("No current recommendation");
    expect(view.body).toBe("Weather signals.");
    expect(view.detail).toBeNull();
    expect(view.tone).toBe("neutral");
  });

  it("keeps historical signal timestamps absolute", () => {
    const view = buildTodayActionCardView(
      {
        key: "commute",
        title: "Commute",
        description: "Transit signals.",
        status_label: "No recommendation",
        area_scope: "helsinki_uusimaa",
        freshness_state: "degraded",
        valid_from: "2026-05-31T08:00:00Z",
        valid_to: "2026-05-31T09:00:00Z",
        evidence: [],
        source_codes: ["digitransit"],
        recommendation: {
          id: "placeholder-commute",
          scenario_key: "commute",
          title: "No active commute recommendation",
          body: "No active regional recommendation yet.",
          severity: "INFO",
          area_scope: "helsinki_uusimaa",
          freshness_state: "degraded",
          valid_from: "2026-05-31T08:00:00Z",
          valid_to: "2026-05-31T09:00:00Z",
          evidence: [],
        },
      },
      {
        weather: null,
        airQuality: null,
        transit: {
          observed_at: "2026-05-31T08:30:00Z",
          time_scope: {
            mode: "historical",
            date: "2026-05-31",
            timezone: "Europe/Helsinki",
            reference_time: "2026-05-31T20:59:59Z",
            window_start: "2026-05-30T21:00:00Z",
            window_end: "2026-05-31T21:00:00Z",
          },
          quality: { active_alert_count: 2 },
        } as never,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "en",
      "historical",
      "Europe/Helsinki",
    );

    expect(view.signalLabel).toBe("Historical signal");
    expect(view.detail).toContain("31 May 2026");
    expect(view.detail).not.toContain("ago");
  });
});
