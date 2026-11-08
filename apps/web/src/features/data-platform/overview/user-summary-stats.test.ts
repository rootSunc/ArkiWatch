import { describe, expect, it } from "vitest";

import { buildUserSummaryTiles } from "./user-summary-stats";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

describe("buildUserSummaryTiles", () => {
  it("does not turn empty payloads into healthy-looking summary signals", () => {
    const tiles = buildUserSummaryTiles(
      {
        weather: { status: "empty" } as WeatherForecastResponse,
        airQuality: { status: "empty" } as AirQualityCurrentResponse,
        transit: { status: "empty" } as TransitCurrentResponse,
        roadRail: { status: "empty" } as RoadRailCurrentResponse,
        householdEnergy: { status: "empty" } as EnergyCurrentResponse,
        systemEnergy: { status: "empty" } as EnergyCurrentResponse,
      },
      "en",
    );

    expect(tiles.map((tile) => tile.value)).toEqual(["n/a", "n/a", "n/a", "n/a"]);
    expect(tiles.every((tile) => tile.tone === "neutral")).toBe(true);
  });

  it("uses the station display label for the air summary tile", () => {
    const tiles = buildUserSummaryTiles(
      {
        weather: null,
        airQuality: {
          status: "ready",
          worst_score: 1,
          worst_label: "Good",
          worst_station: "kallio",
          stations: [{ station: "kallio", label: "Kallio" }],
        } as never,
        transit: null,
        roadRail: null,
        householdEnergy: null,
        systemEnergy: null,
      },
      "zh",
    );

    expect(tiles.find((tile) => tile.key === "air")?.detail).toBe("Kallio");
  });
});
