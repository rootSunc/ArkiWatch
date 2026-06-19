import { describe, expect, it } from "vitest";

import { buildUserSummaryTiles } from "./user-summary-stats";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";

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
});
