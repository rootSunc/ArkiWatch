import { describe, expect, it } from "vitest";

import {
  isHistoricalEvidenceScope,
  isHistoricalTimeScope,
  isStaticDemoTimeScope,
  scopedDataAge,
  scopedDataTimestamp,
  scopedReferenceTime,
  scopedStatusLabel,
} from "./data-time-scope";

const tKey = (key: string) => key;

describe("data time scope presentation", () => {
  const historical = {
    mode: "historical",
    date: "2026-05-31",
    timezone: "Europe/Helsinki",
    reference_time: "2026-05-31T20:59:59Z",
    window_start: "2026-05-30T21:00:00Z",
    window_end: "2026-05-31T21:00:00Z",
  } as const;

  it("recognizes explicit and date-only historical scopes", () => {
    expect(isHistoricalTimeScope(historical)).toBe(true);
    expect(
      isHistoricalTimeScope({ ...historical, mode: "live", date: "2026-05-31" }),
    ).toBe(true);
    expect(isHistoricalTimeScope({ ...historical, mode: "live", date: null })).toBe(false);
  });

  it("does not label static catalog categories as historical evidence", () => {
    expect(isHistoricalEvidenceScope({ stage: "connected" }, historical)).toBe(true);
    expect(isHistoricalEvidenceScope({ stage: "background" }, historical)).toBe(false);
    expect(isHistoricalEvidenceScope({ stage: "connected" }, null)).toBe(false);
  });

  it("keeps historical labels absolute", () => {
    const timestamp = "2026-05-31T09:00:00Z";
    const label = scopedDataTimestamp(
      timestamp,
      historical,
      "en",
      tKey,
      "fallback",
    );

    expect(label).toContain("31 May 2026");
    expect(label).not.toContain("ago");
    expect(scopedDataAge(timestamp, historical, "en", tKey, "fallback")).toContain(
      "31 May 2026",
    );
  });

  it("keeps static demo labels absolute without changing live semantics", () => {
    const demo = {
      mode: "live",
      is_demo: true,
      date: null,
      timezone: "Europe/Helsinki",
      reference_time: "2026-05-31T20:59:59Z",
      window_start: "2026-05-31T20:59:59Z",
      window_end: "2026-06-01T14:59:59Z",
    } as const;

    expect(isStaticDemoTimeScope(demo)).toBe(true);
    expect(isHistoricalTimeScope(demo)).toBe(false);
    expect(scopedDataAge("2026-05-31T09:00:00Z", demo, "en", tKey, "fallback")).toContain(
      "31 May 2026",
    );
    expect(
      scopedDataTimestamp("2026-05-31T09:00:00Z", demo, "en", tKey, "fallback"),
    ).not.toContain("ago");
  });

  it("uses historical evidence instead of live status wording", () => {
    expect(
      scopedStatusLabel("ready", historical, tKey, "live.ready", "live.stale"),
    ).toBe("shell.historicalEvidence");
    expect(
      scopedStatusLabel("empty", historical, tKey, "live.ready", "live.stale"),
    ).toBe("shell.empty");
  });

  it("does not call a static demo snapshot a live feed", () => {
    const demo = {
      mode: "live",
      is_demo: true,
      date: null,
      timezone: "Europe/Helsinki",
      reference_time: "2026-05-31T20:59:59Z",
      window_start: "2026-05-31T20:59:59Z",
      window_end: "2026-06-01T14:59:59Z",
    } as const;
    const demoLabel = (key: string) =>
      key === "shell.demoSnapshot" ? "Static demo snapshot" : key;

    expect(
      scopedStatusLabel("ready", demo, demoLabel, "live.ready", "live.stale"),
    ).toBe("Static demo snapshot");
  });

  it("uses the snapshot reference instead of the calendar window start", () => {
    expect(scopedReferenceTime(historical)).toBe("2026-05-31T20:59:59Z");
    expect(
      scopedReferenceTime({ ...historical, reference_time: "" }, "checked-at"),
    ).toBe("2026-05-31T21:00:00Z");
    expect(
      scopedReferenceTime({ ...historical, reference_time: "", window_end: null }, "checked-at"),
    ).toBe("2026-05-30T21:00:00Z");
    expect(
      scopedReferenceTime({ ...historical, mode: "live", date: null, reference_time: "" }, "checked-at"),
    ).toBe("checked-at");
  });
});
