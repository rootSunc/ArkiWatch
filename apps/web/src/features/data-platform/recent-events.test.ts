import { describe, expect, it } from "vitest";

import { curatedRecentEvents } from "./recent-events";
import type { PlatformEvent } from "./types";

function event(startsAt: string, endsAt: string): PlatformEvent {
  return {
    id: "transit-delay",
    category_key: "transit",
    event_type: "transit_delay",
    title: "Transit delay",
    body: "A service alert is active.",
    severity: "HIGH",
    starts_at: startsAt,
    ends_at: endsAt,
    source_codes: ["digitransit"],
    evidence: ["Event type: transit_delay"],
  };
}

describe("curatedRecentEvents", () => {
  it("uses the source snapshot as the reference clock when provided", () => {
    const item = event("2026-08-09T05:00:00Z", "2026-08-09T08:00:00Z");

    expect(
      curatedRecentEvents([item], 6, { referenceAt: "2026-08-09T06:00:00Z" }),
    ).toEqual([item]);
    expect(
      curatedRecentEvents([item], 6, { referenceAt: "2026-08-10T06:00:00Z" }),
    ).toEqual([]);
  });

  it("falls back to the browser clock for live callers without a snapshot", () => {
    const item = event(
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    );

    expect(curatedRecentEvents([item])).toEqual([item]);
  });
});
