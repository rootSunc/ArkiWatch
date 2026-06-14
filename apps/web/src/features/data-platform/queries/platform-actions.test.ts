import { describe, expect, it } from "vitest";

import { readPlatformActionError } from "./platform-actions";

describe("platform action errors", () => {
  it("preserves backend detail so refresh failures are actionable", async () => {
    const error = await readPlatformActionError(
      Response.json({ detail: "Scheduler is temporarily unavailable." }, { status: 503 }),
      "Fallback error",
    );

    expect(error.message).toBe("Scheduler is temporarily unavailable.");
  });

  it("falls back when the backend returns a non-JSON error", async () => {
    const error = await readPlatformActionError(
      new Response("upstream unavailable", { status: 502 }),
      "Fallback error",
    );

    expect(error.message).toBe("Fallback error");
  });
});
