import { describe, expect, it } from "vitest";

import { platformDataNeedsForView } from "./platform-data-needs";

describe("platformDataNeedsForView", () => {
  it("keeps today and overview on core queries only", () => {
    expect(platformDataNeedsForView("today")).toEqual({
      weather: false,
      air: false,
      energy: false,
      householdEnergy: false,
      roadRail: false,
      transit: false,
      history: false,
      historyAvailability: false,
    });
    expect(platformDataNeedsForView("overview").history).toBe(false);
  });

  it("enables domain and history queries for workspaces", () => {
    expect(platformDataNeedsForView("weather")).toMatchObject({
      weather: true,
      history: true,
      air: false,
    });
    expect(platformDataNeedsForView("energy")).toMatchObject({
      energy: true,
      householdEnergy: true,
      history: true,
    });
    expect(platformDataNeedsForView("mobility")).toMatchObject({
      roadRail: true,
      transit: true,
      history: true,
    });
  });

  it("loads full domain set when historical", () => {
    expect(platformDataNeedsForView("today", { isHistorical: true })).toMatchObject({
      weather: true,
      history: true,
      historyAvailability: true,
    });
  });

  it("can request history availability without historical mode", () => {
    expect(
      platformDataNeedsForView("today", { needsHistoryAvailability: true }).historyAvailability,
    ).toBe(true);
  });
});
