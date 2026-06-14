import { describe, expect, it } from "vitest";

import { assistantJsonResponse } from "./response";

describe("assistant proxy response", () => {
  it("preserves retry guidance from a rate-limited backend", async () => {
    const backendResponse = new Response(JSON.stringify({ detail: "Too many requests." }), {
      headers: {
        "content-type": "application/json",
        "retry-after": "17",
      },
      status: 429,
    });

    const response = assistantJsonResponse(
      backendResponse,
      { detail: "Too many requests." },
      "Assistant service returned an empty response.",
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    await expect(response.json()).resolves.toEqual({ detail: "Too many requests." });
  });

  it("does not expose unrelated backend headers", () => {
    const backendResponse = new Response(null, {
      headers: {
        "set-cookie": "secret=should-not-forward",
        "x-internal-debug": "hidden",
      },
      status: 500,
    });

    const response = assistantJsonResponse(backendResponse, null, "Assistant failed.");

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-internal-debug")).toBeNull();
  });
});
