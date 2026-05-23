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
