import { describe, expect, it } from "vitest";

import { buildActionDataPoints, recommendationTone } from "./today-action-card-model";

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
