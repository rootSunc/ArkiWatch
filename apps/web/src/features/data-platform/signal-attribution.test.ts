import { describe, expect, it } from "vitest";

import { formatSignalAttributionLine } from "./signal-attribution";

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
