import { describe, expect, it } from "vitest";
import { eventStateAt } from "./event-time-state";

const event = {
  starts_at: "2026-08-09T04:00:00Z",
  ends_at: "2026-08-09T06:00:00Z",
  state: "ended",
};
describe("event validity in the viewed snapshot", () => {
  it.each([
    ["2026-08-09T03:59:59Z", "upcoming"],
    ["2026-08-09T04:00:00Z", "active"],
    ["2026-08-09T05:59:59Z", "active"],
    ["2026-08-09T06:00:00Z", "ended"],
  ])(
    "uses %s rather than the browser clock or a stale stored state",
    (reference, expected) => {
      expect(eventStateAt(event, reference)).toBe(expected);
    },
  );
  it("does not turn missing or reversed time windows into open events", () => {
    expect(eventStateAt({ starts_at: "", ends_at: "" }, event.starts_at)).toBe(
      "unknown",
    );
    expect(
      eventStateAt(
        { starts_at: event.ends_at, ends_at: event.starts_at },
        event.starts_at,
      ),
    ).toBe("unknown");
  });
});
