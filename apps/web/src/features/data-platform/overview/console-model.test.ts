import { describe, expect, it } from "vitest";
import { signalHistoryTrend, signalTrend } from "./console-model";
import type {
  EnergyCurrentResponse,
  PlatformCategory,
  WeatherForecastResponse,
} from "../types";
const category = {
  key: "weather",
  status: "healthy",
  visualizations: [],
} as unknown as PlatformCategory;
const weather = {
  source_code: "fmi",
  checked_at: "2026-08-09T04:00:00Z",
  points: [
    { timestamp: "2026-08-09T03:00:00Z", temperature_c: 13 },
    { timestamp: "2026-08-09T04:00:00Z", temperature_c: 16 },
    { timestamp: "2026-08-09T05:00:00Z", temperature_c: null },
    { timestamp: "2026-08-09T06:00:00Z", temperature_c: 18 },
  ],
} as WeatherForecastResponse;
describe("console trends", () => {
  it("uses finite provider samples in the selected time window", () => {
    expect(
      signalTrend(category, { weather }, "en", "Europe/Helsinki").map(
        (p) => p.value,
      ),
    ).toEqual([16, 18]);
  });
  it.each(["stale", "failed", "empty"])(
    "never draws a healthy-looking trend for %s data",
    (status) => {
      expect(
        signalTrend(
          { ...category, status },
          { weather },
          "en",
          "Europe/Helsinki",
        ),
      ).toEqual([]);
    },
  );
  it("never turns station comparisons into a time series", () => {
    const air = {
      ...category,
      key: "air",
      visualizations: [
        {
          type: "bar",
          data: {
            points: [
              { label: "Kallio", value: 1 },
              { label: "Mannerheimintie", value: 3 },
            ],
          },
        },
      ],
    } as unknown as PlatformCategory;
    expect(signalTrend(air, {}, "en", "Europe/Helsinki")).toEqual([]);
  });
});

it("uses all samples in 24 elapsed hours, including sub-quarter-hour data", () => {
  const start = Date.parse(weather.checked_at);
  const dense = {
    ...weather,
    points: Array.from({ length: 300 }, (_, i) => ({
      ...weather.points[0],
      timestamp: new Date(start + i * 5 * 60 * 1000).toISOString(),
      temperature_c: i,
    })),
  };
  const points = signalTrend(
    category,
    { weather: dense },
    "en",
    "Europe/Helsinki",
  );
  expect(points).toHaveLength(288);
  expect(points.at(-1)?.value).toBe(287);
});

it("uses the historical reference even when the snapshot was checked later", () => {
  const frozen = {
    ...weather,
    checked_at: "2026-10-01T00:00:00Z",
    time_scope: {
      mode: "historical",
      date: "2026-08-09",
      reference_time: weather.checked_at,
      timezone: "Europe/Helsinki",
      window_start: null,
      window_end: null,
    },
  };
  expect(
    signalTrend(category, { weather: frozen }, "en", "Europe/Helsinki").map(
      (p) => p.value,
    ),
  ).toEqual([16, 18]);
});

it("filters 7 and 30 days by calendar dates, preserving missing days and excluding future snapshots", () => {
  const snapshot = (date: string, value: number) => ({
    date,
    error: null,
    data: {
      ...weather,
      status: "ready",
      points: [
        {
          ...weather.points[0],
          timestamp: `${date}T04:00:00Z`,
          temperature_c: value,
        },
        {
          ...weather.points[0],
          timestamp: `${date}T05:00:00Z`,
          temperature_c: value + 2,
        },
        {
          ...weather.points[0],
          timestamp: "2026-09-01T04:00:00Z",
          temperature_c: 999,
        },
      ],
    },
  });
  const signals = {
    referenceAt: weather.checked_at,
    history: {
      weather: [
        snapshot("2026-07-01", 1),
        snapshot("2026-08-01", 10),
        snapshot("2026-08-08", 20),
        snapshot("2026-08-10", 30),
      ],
      airQuality: [],
      energy: [],
      householdEnergy: [],
      roadRail: [],
      transit: [],
    },
  };
  expect(signalHistoryTrend(category, signals, 7, "Europe/Helsinki")).toEqual([
    { label: "2026-08-08", value: 21, source: "FMI" },
  ]);
  expect(
    signalHistoryTrend(category, signals, 30, "Europe/Helsinki").map(
      (p) => p.label,
    ),
  ).toEqual(["2026-08-01", "2026-08-08"]);
});

it("keeps the selected energy provider and duration-weights daily values", () => {
  const price = {
    source_code: "prices",
    status: "ready",
    unit: "c/kWh",
    checked_at: weather.checked_at,
    points: [
      {
        starts_at: "2026-08-09T04:00:00Z",
        ends_at: "2026-08-09T05:00:00Z",
        value: 10,
      },
      {
        starts_at: "2026-08-09T05:00:00Z",
        ends_at: "2026-08-09T05:15:00Z",
        value: 30,
      },
    ],
  } as EnergyCurrentResponse;
  const grid = {
    ...price,
    source_code: "fingrid",
    unit: "MW",
    points: price.points.map((p) => ({ ...p, value: 500 })),
  };
  const energyCategory = { ...category, key: "energy" };
  const signals = {
    energy: grid,
    householdEnergy: price,
    history: {
      weather: [],
      airQuality: [],
      energy: [{ date: "2026-08-09", error: null, data: grid }],
      householdEnergy: [{ date: "2026-08-09", error: null, data: price }],
      roadRail: [],
      transit: [],
    },
  };
  expect(
    signalHistoryTrend(energyCategory, signals, 7, "Europe/Helsinki")[0]?.value,
  ).toBe(14);
  expect(
    signalTrend(
      energyCategory,
      { ...signals, energyPanel: "fingrid" },
      "en",
      "Europe/Helsinki",
    ).map((p) => p.value),
  ).toEqual([500, 500]);
  expect(
    signalHistoryTrend(
      energyCategory,
      { ...signals, energyPanel: "fingrid" },
      7,
      "Europe/Helsinki",
    )[0]?.source,
  ).toBe("FINGRID");
});
