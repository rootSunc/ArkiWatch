import { describe, expect, it } from "vitest";

import {
  PLATFORM_QUERY_REFETCH_INTERVAL_MS,
  PLATFORM_QUERY_STALE_TIME_MS,
  platformDataNeedsForView,
  platformQueryRefreshOptions,
} from "./platform-data-needs";

describe("platformDataNeedsForView", () => {
  it("defines a bounded live refresh cadence", () => {
    expect(PLATFORM_QUERY_STALE_TIME_MS).toBe(2 * 60 * 1000);
    expect(PLATFORM_QUERY_REFETCH_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(platformQueryRefreshOptions(false)).toMatchObject({
      refetchOnWindowFocus: true,
      refetchInterval: PLATFORM_QUERY_REFETCH_INTERVAL_MS,
    });
    expect(platformQueryRefreshOptions(true)).toMatchObject({
      refetchOnWindowFocus: true,
      refetchInterval: false,
    });
  });

  it("loads saved history for Home while keeping the plan on core queries", () => {
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
    expect(platformDataNeedsForView("overview")).toEqual({
      weather: true, air: true, energy: true, householdEnergy: true,
      roadRail: true, transit: true, history: true, historyAvailability: false,
    });
    expect(platformDataNeedsForView(null)).toEqual(platformDataNeedsForView("overview"));
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
