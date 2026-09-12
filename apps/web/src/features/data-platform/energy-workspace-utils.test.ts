import { describe, expect, it } from "vitest";

import {
  energyHighlightRows,
  householdChromeTiles,
  sourceRecordsMetric,
  systemChromeTiles,
  toneFromStatus,
} from "./energy-workspace-utils";

import type { EnergyCurrentResponse } from "./types";

type SourceRecordMetricInput = NonNullable<Parameters<typeof sourceRecordsMetric>[0]>;

function sourceWithRecords(records_ingested: number | null): SourceRecordMetricInput {
  return {
    records_ingested,
    operational_status: "pending",
    last_run_status: null,
    last_run_started_at: null,
    last_run_finished_at: null,
  };
}

describe("energy source metrics", () => {
  it("does not turn an unavailable source record count into zero", () => {
    expect(sourceRecordsMetric(null).value).toBe("n/a");
    expect(sourceRecordsMetric(sourceWithRecords(null)).value).toBe("n/a");
  });

  it("keeps an observed zero distinct from an unavailable count", () => {
    expect(sourceRecordsMetric(sourceWithRecords(0)).value).toBe("0");
  });

  it("surfaces partial energy data as a warning instead of neutral", () => {
    expect(toneFromStatus("partial")).toBe("warn");
    expect(toneFromStatus("PARTIAL")).toBe("warn");
  });
});

function householdFixture(): EnergyCurrentResponse {
  return {
    checked_at: "2026-08-09T07:00:00+03:00",
    status: "healthy",
    location: "Helsinki",
    source_code: "porssisahko",
    provider_name: "Fortum",
    observed_at: "2026-08-09T07:00:00+03:00",
    valid_from: null,
    valid_to: null,
    summary: null,
    unit: "c/kWh",
    current_window: {
      starts_at: "2026-08-09T12:00:00+03:00",
      ends_at: "2026-08-09T14:00:00+03:00",
      average_value: 7.8,
      minimum_value: 7.8,
      maximum_value: 14.2,
      unit: "c/kWh",
      point_count: 2,
      severity: "info",
      source: "demo",
      estimated_cost_eur: 0.16,
      usage_kwh: 2,
      threshold_value: null,
      horizon_average_value: null,
      savings_vs_average_pct: null,
      selection_strategy: null,
    },
    metrics: [],
    points: [
      {
        starts_at: "2026-08-09T07:00:00+03:00",
        ends_at: "2026-08-09T08:00:00+03:00",
        value: 9.6,
        unit: "c/kWh",
        estimated_cost_eur: 0.19,
      },
      {
        starts_at: "2026-08-09T12:00:00+03:00",
        ends_at: "2026-08-09T14:00:00+03:00",
        value: 7.8,
        unit: "c/kWh",
        estimated_cost_eur: 0.16,
      },
      {
        starts_at: "2026-08-09T17:00:00+03:00",
        ends_at: "2026-08-09T19:00:00+03:00",
        value: 14.2,
        unit: "c/kWh",
        estimated_cost_eur: 0.28,
      },
    ],
    source_requests: [],
    data_pipeline: [],
    quality: {
      point_count: 3,
      window_point_count: 2,
      field_coverage_pct: 100,
      minimum_value: 7.8,
      maximum_value: 14.2,
      average_value: 10.5,
      missing_fields: [],
      notes: [],
    },
  };
}

describe("energy chrome tiles", () => {
  const tKey = (key: string) => key.replace("energy.", "");

  it("maps household readings onto the four HTML tiles without inventing a wholesale spot", () => {
    const tiles = householdChromeTiles({
      energy: householdFixture(),
      fallbackProvider: "Fortum",
      noValue: "No value",
      referenceTime: "2026-08-09T07:00:00+03:00",
      tKey,
      timeZone: "Europe/Helsinki",
    });

    expect(tiles.map((tile) => tile.key)).toEqual([
      "best_price_today",
      "current_hour",
      "cost_spread",
      "provider",
    ]);
    expect(tiles[0]?.value).toBe("7.80");
    expect(tiles[1]?.value).toBe("9.60");
    expect(tiles[2]?.value).toBe("6.4");
    expect(tiles[3]?.value).toBe("Fortum");

    const rows = energyHighlightRows({
      energy: householdFixture(),
      noValue: "No value",
      referenceTime: "2026-08-09T07:00:00+03:00",
      tKey,
      timeZone: "Europe/Helsinki",
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.spot === "No value")).toBe(true);
  });

  it("keeps system tiles on observed load values", () => {
    const energy = householdFixture();
    energy.unit = "MW";
    energy.points = [
      {
        starts_at: "2026-08-09T00:00:00+03:00",
        ends_at: "2026-08-09T01:00:00+03:00",
        value: 7180,
        unit: "MW",
        estimated_cost_eur: null,
      },
      {
        starts_at: "2026-08-09T07:00:00+03:00",
        ends_at: "2026-08-09T08:00:00+03:00",
        value: 8420,
        unit: "MW",
        estimated_cost_eur: null,
      },
    ];
    energy.quality.minimum_value = 7180;
    energy.quality.maximum_value = 8420;

    const tiles = systemChromeTiles({
      energy,
      noValue: "No value",
      pollLabel: "3 min",
      tKey,
    });

    expect(tiles[0]?.value).toBe("8 420");
    expect(tiles[1]?.value).toBe("7 180\n8 420");
    expect(tiles[3]?.value).toBe("3 min");
  });
});
