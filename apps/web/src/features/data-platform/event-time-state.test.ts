import { describe, expect, it } from "vitest";

import { scopedEventState } from "./event-time-state";

describe("scoped event state", () => {
  const referenceTimestamp = Date.parse("2026-05-31T12:00:00Z");

  it("keeps the API active flag authoritative", () => {
    expect(
      scopedEventState(true, "2026-05-31T15:00:00Z", referenceTimestamp),
    ).toBe("active");
  });

  it("distinguishes scheduled and ended evidence around the reference time", () => {
    expect(
      scopedEventState(false, "2026-05-31T13:00:00Z", referenceTimestamp),
    ).toBe("upcoming");
    expect(
      scopedEventState(false, "2026-05-31T09:00:00Z", referenceTimestamp),
    ).toBe("ended");
  });
});
