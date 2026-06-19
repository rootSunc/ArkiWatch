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
      "Assistant service is temporarily unavailable.",
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    await expect(response.json()).resolves.toEqual({
      detail: "Assistant request limit reached. Please try again shortly.",
    });
  });

  it("does not expose backend failure details or unrelated headers", async () => {
    const backendResponse = new Response(
      JSON.stringify({ detail: "database password=legacy-secret" }),
      {
        headers: {
          "set-cookie": "secret=should-not-forward",
          "x-internal-debug": "hidden",
        },
        status: 500,
      },
    );

    const response = assistantJsonResponse(
      backendResponse,
      { detail: "database password=legacy-secret" },
      "Assistant service is temporarily unavailable.",
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-internal-debug")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      detail: "Assistant service is temporarily unavailable.",
    });
  });
});
