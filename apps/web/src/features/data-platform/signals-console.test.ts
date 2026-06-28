import { describe, expect, it } from "vitest";

import { buildSignalSystemTiles } from "./signals-console";
import type { DashboardSource } from "./types";

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

function source(overrides: Partial<DashboardSource> = {}): DashboardSource {
  return {
    id: "source-fmi",
    source_code: "fmi",
    source_name: "FMI",
    auth_type: "NONE",
    poll_interval_seconds: 900,
    operational_status: "healthy",
    stage: "connected",
    last_run_status: "success",
    last_run_started_at: "2026-08-09T06:45:00Z",
    last_run_finished_at: "2026-08-09T06:46:00Z",
    records_ingested: 100,
    error_message: null,
    ...overrides,
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
      detail: "1 Active · 0 Empty · 1 Catalog",
    });
    expect(tiles[1]).toMatchObject({
      label: "Recent events",
      value: "0",
    });
  });

  it("does not count empty historical categories as active signals", () => {
    const tiles = buildSignalSystemTiles({
      overview: {
        checked_at: "2026-08-07T04:00:00Z",
        app_name: "ArkiWatch",
        timezone: "Europe/Helsinki",
        coverage_area: "Tampere / Pirkanmaa",
        health_status: "healthy",
        time_scope: {
          mode: "historical",
          date: "2026-08-07",
          timezone: "Europe/Helsinki",
          reference_time: "2026-08-07T15:00:00Z",
          window_start: "2026-08-06T21:00:00Z",
          window_end: "2026-08-07T15:00:00Z",
        },
        categories: [],
        recent_events: [],
        sources: [],
      },
      categories: [
        { ...category("weather"), status: "empty" },
        { ...category("air"), status: "empty" },
        category("city_services"),
      ],
      sources: [],
      recentEvents: [],
      language: "en",
    });

    expect(tiles[0]).toMatchObject({
      value: "3",
      detail: "0 captured · 2 Empty · 1 Catalog",
      tone: "neutral",
    });
  });

  it("keeps catalog-only sources out of live health ratios", () => {
    const tiles = buildSignalSystemTiles({
      overview: null,
      categories: [],
      sources: [
        source({
          id: "catalog-fmi",
          operational_status: "pending",
          records_ingested: null,
          last_run_status: null,
          last_run_started_at: null,
          last_run_finished_at: null,
        }),
      ],
      recentEvents: [],
      language: "en",
    });

    expect(tiles[2]).toMatchObject({
      value: "n/a",
      detail: "1 catalog-only",
      tone: "neutral",
    });
  });
});
