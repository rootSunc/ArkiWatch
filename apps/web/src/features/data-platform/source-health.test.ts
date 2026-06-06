import { describe, expect, it } from "vitest";

import { healthySourceCount, isSourceHealthy, sourceHealthTone } from "./source-health";

describe("source health presentation", () => {
  it("normalizes API statuses to stable design-system tones", () => {
    expect(sourceHealthTone("healthy")).toBe("healthy");
    expect(sourceHealthTone("ready")).toBe("healthy");
    expect(sourceHealthTone("pending")).toBe("watch");
    expect(sourceHealthTone("stale")).toBe("watch");
    expect(sourceHealthTone("inactive")).toBe("failing");
    expect(sourceHealthTone("failed")).toBe("failing");
    expect(sourceHealthTone("new_backend_status")).toBe("unknown");
  });

  it("uses the same health rule for source counts and individual sources", () => {
    const sources = [
      { operational_status: "healthy" },
      { operational_status: "connected" },
      { operational_status: "stale" },
      { operational_status: "inactive" },
    ];

    expect(healthySourceCount(sources)).toBe(2);
    expect(isSourceHealthy(sources[0])).toBe(true);
    expect(isSourceHealthy(sources[2])).toBe(false);
  });
});
