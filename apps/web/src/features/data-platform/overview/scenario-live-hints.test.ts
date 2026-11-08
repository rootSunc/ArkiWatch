import { describe, expect, it } from "vitest";

import { buildScenarioLiveHint } from "./scenario-live-hints";

describe("buildScenarioLiveHint", () => {
  it("does not turn empty responses into live guidance", () => {
    const hint = buildScenarioLiveHint(
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

    expect(hint).toBeNull();
  });

  it("localizes the air-quality condition in the Chinese Today card", () => {
    const hint = buildScenarioLiveHint(
      "home_air",
      {
        weather: null,
        airQuality: {
          status: "ready",
          worst_score: 1,
          worst_label: "Good",
          worst_station: "kallio",
          stations: [{ station: "kallio", label: "Kallio" }],
          quality: { reporting_station_count: 2, station_count: 2 },
        } as never,
        transit: null,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "zh",
    );

    expect(hint?.detail).toBe("Kallio，良好");
  });
});
