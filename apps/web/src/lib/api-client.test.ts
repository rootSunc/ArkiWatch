import { afterEach, describe, expect, it, vi } from "vitest";

import {
  API_TIMEOUT_ERROR,
  apiFetchJson,
  normalizeApiBaseUrl,
  unwrapApiResult,
} from "@/lib/api-client";

describe("api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes API base URLs", () => {
    expect(normalizeApiBaseUrl("https://example.com/api/")).toBe("https://example.com/api");
    expect(normalizeApiBaseUrl(undefined)).toBe("http://127.0.0.1:8000/api");
  });

  it("builds query params and parses JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ok: true }, { status: 200 }),
      ),
    );

    const result = await apiFetchJson<{ ok: boolean }>(
      "/platform/overview",
      { baseUrl: "https://example.com/api" },
      { city: "helsinki", date: null },
    );

    expect(result.data).toEqual({ ok: true });
    expect(result.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://example.com/api/platform/overview?city=helsinki"),
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reports a timeout instead of hanging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    const result = await apiFetchJson(
      "/platform/overview",
      { baseUrl: "https://example.com/api", timeoutMs: 10 },
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe(API_TIMEOUT_ERROR);
    expect(result.status).toBeNull();
  });

  it("preserves bounded backend error details without losing the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { detail: [{ msg: "city is required" }, { msg: "date is invalid" }] },
          { status: 422 },
        ),
      ),
    );

    const result = await apiFetchJson(
      "/platform/overview",
      { baseUrl: "https://example.com/api" },
    );

    expect(result.status).toBe(422);
    expect(result.error).toBe(
      "Platform request failed with 422. city is required; date is invalid",
    );
  });

  it("falls back cleanly when a failed response has no readable detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream unavailable", { status: 503 })),
    );

    const result = await apiFetchJson(
      "/platform/overview",
      { baseUrl: "https://example.com/api" },
    );

    expect(result.error).toBe("Platform request failed with 503.");
  });

  it("bounds unexpectedly large backend details", async () => {
    const detail = "x".repeat(500);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail }, { status: 500 })),
    );

    const result = await apiFetchJson(
      "/platform/overview",
      { baseUrl: "https://example.com/api" },
    );

    expect(result.error).toBe(
      `Platform request failed with 500. ${detail.slice(0, 240)}`,
    );
  });

  it("does not let API errors become successful nullable query values", () => {
    expect(() =>
      unwrapApiResult({ data: null, error: "Platform is unavailable.", status: 503 }),
    ).toThrow("Platform is unavailable.");

    expect(() => unwrapApiResult({ data: null, error: null, status: 204 })).toThrow(
      "API response did not include data.",
    );
    expect(unwrapApiResult({ data: { ok: true }, error: null, status: 200 })).toEqual({ ok: true });
  });
});
