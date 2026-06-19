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
});
