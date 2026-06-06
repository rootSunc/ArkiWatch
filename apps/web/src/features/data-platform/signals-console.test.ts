import { describe, expect, it } from "vitest";

import { buildSignalSystemTiles } from "./signals-console";

function category(key: string, stage = "connected") {
  return {
    key,
    title: key,
    description: "",
    status: "connected",
    stage,
    priority: "P1",
    source_codes: [],
    summary_metrics: [],
    visualizations: [],
    events: [],
    sources: [],
  };
}

describe("buildSignalSystemTiles", () => {
  it("matches the category summary to the core/catalog split", () => {
    const tiles = buildSignalSystemTiles({
      overview: {
        checked_at: "2026-08-09T07:00:00Z",
        app_name: "ArkiWatch",
        timezone: "Europe/Helsinki",
        coverage_area: "Helsinki / Uusimaa",
        health_status: "healthy",
        categories: [],
        recent_events: [],
        sources: [],
      },
      categories: [category("weather"), category("city_services")],
      sources: [],
      recentEvents: [],
      language: "en",
    });

    expect(tiles[0]).toMatchObject({
      value: "2",
      detail: "1 Active · 1 Catalog",
    });
  });
});
