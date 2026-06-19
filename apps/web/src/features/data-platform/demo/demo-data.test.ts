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

  it("keeps city services attached to the Service Map source", () => {
    const fixture = demoFixtureForScope();
    const cityServices = fixture.overview.categories.find(
      (category) => category.key === "city_services",
    );
    const linkedEvents = fixture.overview.categories.find(
      (category) => category.key === "events",
    );

    expect(cityServices?.source_codes).toEqual(["servicemap"]);
    expect(cityServices?.sources.map((source) => source.source_code)).toEqual(["servicemap"]);
    expect(linkedEvents?.source_codes).toEqual(["linkedevents"]);
    expect(
      fixture.overview.sources.find((source) => source.source_code === "servicemap")?.source_name,
    ).toBe("Helsinki Service Map");
    expect(cityServices?.status).toBe("empty");
    expect(linkedEvents?.status).toBe("empty");
    expect(fixture.overview.categories.find((category) => category.key === "water")?.status).toBe("empty");
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
    expect(fixture.publicDashboard.snapshot_date).toBe(DEMO_SNAPSHOT_DATE);
    expect(fixture.publicDashboard.snapshot_available).toBe(true);
    expect(fixture.weather.location).toBe("Espoo");
    expect(fixture.weather.status).toBe("empty");
    expect(fixture.history.weather).toEqual([]);
    expect(fixture.publicDashboard.checked_at).toBe("2026-08-08T04:00:00.000Z");
    expect(fixture.historyAvailability.city).toBe("espoo");
    expect(fixture.historyAvailability.days).toEqual([]);
  });

  it("does not label non-Uusimaa cities as Uusimaa", () => {
    const fixture = demoFixtureForScope({ city: "tampere" });

    expect(fixture.overview.coverage_area).toBe("Tampere / Pirkanmaa");
    expect(fixture.publicDashboard.coverage_area).toBe("Helsinki / Uusimaa");
  });

  it("does not relabel Helsinki observations for another city", () => {
    const fixture = demoFixtureForScope({ city: "tampere" });

    expect(fixture.weather.status).toBe("empty");
    expect(fixture.airQuality.status).toBe("empty");
    expect(fixture.energy.status).toBe("empty");
    expect(fixture.transit.status).toBe("empty");
    expect(fixture.roadRail.status).toBe("empty");
    expect(fixture.overview.recent_events).toEqual([]);
    expect(fixture.history.weather).toEqual([]);
    expect(fixture.historyAvailability.days).toEqual([]);
  });

  it("marks an unavailable demo history date instead of faking a snapshot", () => {
    const fixture = demoFixtureForScope({ date: "2026-08-07" });

    expect(fixture.publicDashboard.snapshot_date).toBe("2026-08-07");
    expect(fixture.publicDashboard.snapshot_available).toBe(false);
    expect(fixture.publicDashboard.top_actions).toEqual([]);
    expect(fixture.weather.status).toBe("empty");
    expect(fixture.history.weather).toEqual([]);
    expect(fixture.overview.categories.find((category) => category.key === "weather")?.status).toBe("empty");
    expect(fixture.overview.recent_events).toEqual([]);
  });

  it("keeps background catalog categories out of the live evidence state", () => {
    const fixture = demoFixtureForScope({ date: DEMO_SNAPSHOT_DATE });
    const geospatial = fixture.overview.categories.find((category) => category.key === "geospatial");
    const regionalProfile = fixture.overview.categories.find(
      (category) => category.key === "regional_profile",
    );

    expect(geospatial?.stage).toBe("background");
    expect(geospatial?.status).toBe("background");
    expect(regionalProfile?.stage).toBe("background");
    expect(regionalProfile?.status).toBe("background");
    expect(
      regionalProfile?.summary_metrics.find((metric) => metric.key === "catalog_stage")?.value,
    ).toBe("background");
  });
});
