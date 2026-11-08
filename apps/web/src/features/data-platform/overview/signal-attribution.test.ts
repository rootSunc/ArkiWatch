import { describe, expect, it } from "vitest";

import { demoFixtureForScope } from "../demo/demo-data";
import { categorySignalAttribution, formatSignalAttributionLine } from "./signal-attribution";

describe("signal attribution", () => {
  it("does not turn historical source timestamps into relative live ages", () => {
    const line = formatSignalAttributionLine(
      {
        sources: "FMI",
        timeScope: {
          mode: "historical",
          date: "2026-05-31",
          timezone: "Europe/Helsinki",
          reference_time: "2026-05-31T20:59:59Z",
          window_start: "2026-05-30T21:00:00Z",
          window_end: "2026-05-31T21:00:00Z",
        },
        updatedAt: "2026-05-31T08:00:00Z",
      },
      "en",
    );

    expect(line).toContain("31 May 2026");
    expect(line).not.toContain("ago");
  });
});

it("attributes the price reading to its provider rather than all Energy providers", () => {
  const { overview, energy, householdEnergy } = demoFixtureForScope();
  const category = overview.categories.find((c) => c.key === "energy")!;
  const attribution = categorySignalAttribution(category, null, null, energy, householdEnergy, null, null);
  expect(attribution.sources).toBe(householdEnergy.source_code.toUpperCase());
  expect(attribution.updatedAt).toBe(householdEnergy.observed_at);
});
