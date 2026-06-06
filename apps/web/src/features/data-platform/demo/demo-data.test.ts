import { describe, expect, it } from "vitest";

import {
  DEMO_SNAPSHOT_DATE,
  DEMO_SNAPSHOT_LABEL,
  demoFixtureForScope,
} from "./demo-data";

describe("demo fixture", () => {
  it("contains the product surfaces needed for a first-run tour", () => {
    const fixture = demoFixtureForScope();

    expect(DEMO_SNAPSHOT_LABEL).toContain("Static");
    expect(fixture.overview.coverage_area).toBe("Helsinki / Uusimaa");
    expect(fixture.overview.categories.map((category) => category.key)).toEqual(
      expect.arrayContaining(["weather", "air", "energy", "transit", "traffic"]),
    );
    expect(fixture.publicDashboard.scenario_sections).toHaveLength(4);
    expect(fixture.weather.points.length).toBeGreaterThan(0);
    expect(fixture.transit.quality.active_alert_count).toBe(1);
  });

  it("keeps city and historical scope explicit", () => {
    const fixture = demoFixtureForScope({ city: "espoo", date: DEMO_SNAPSHOT_DATE });

    expect(fixture.overview.coverage_area).toBe("Espoo / Uusimaa · 2026-08-08");
    expect(fixture.overview.time_scope?.mode).toBe("historical");
    expect(fixture.overview.time_scope?.date).toBe(DEMO_SNAPSHOT_DATE);
    expect(fixture.overview.time_scope?.window_start).toBe(
      "2026-08-07T21:00:00.000Z",
    );
    expect(fixture.overview.time_scope?.window_end).toBe(
      "2026-08-08T15:00:00.000Z",
    );
    expect(fixture.weather.location).toBe("Espoo");
    expect(fixture.historyAvailability.city).toBe("espoo");
  });

  it("does not label non-Uusimaa cities as Uusimaa", () => {
    const fixture = demoFixtureForScope({ city: "tampere" });

    expect(fixture.overview.coverage_area).toBe("Tampere / Pirkanmaa");
    expect(fixture.publicDashboard.coverage_area).toBe("Helsinki / Uusimaa");
  });
});
