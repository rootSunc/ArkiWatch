import { describe, expect, it } from "vitest";

import { resolveMobilityTabForSignals } from "./scenario-navigation";

describe("resolveMobilityTabForSignals", () => {
  it("ignores empty mobility responses when choosing a tab", () => {
    expect(
      resolveMobilityTabForSignals({
        weather: null,
        airQuality: null,
        transit: { status: "empty", quality: { active_alert_count: 9 } } as never,
        roadRail: { status: "ready", quality: { active_event_count: 1 } } as never,
        householdEnergy: null,
        systemEnergy: null,
      }),
    ).toBe("traffic");

    expect(
      resolveMobilityTabForSignals({
        weather: null,
        airQuality: null,
        transit: { status: "empty", quality: { active_alert_count: 9 } } as never,
        roadRail: { status: "empty", quality: { active_event_count: 1 } } as never,
        householdEnergy: null,
        systemEnergy: null,
      }),
    ).toBe("transit");
  });
});
