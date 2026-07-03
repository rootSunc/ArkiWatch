import { afterEach, describe, expect, it, vi } from "vitest";

import {
  API_TIMEOUT_ERROR,
  apiFetchJson,
  apiTransportErrorMessage,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
  unwrapApiResult,
} from "@/lib/api-client";

describe("api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes API base URLs", () => {
    expect(normalizeApiBaseUrl("https://example.com/api/")).toBe("https://example.com/api");
    expect(normalizeApiBaseUrl(undefined)).toBe("http://127.0.0.1:8000/api");
  });

  it("prefers the server-rendered runtime API URL in the browser", () => {
    window.__ARKIWATCH_RUNTIME_CONFIG__ = {
      apiBaseUrl: "https://runtime.example/api/",
    };

    expect(resolveApiBaseUrl()).toBe("https://runtime.example/api");

    delete window.__ARKIWATCH_RUNTIME_CONFIG__;
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

  it("rethrows caller cancellation so query observers can stop cleanly", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("The request was cancelled.", "AbortError"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));

    await expect(
      apiFetchJson("/platform/overview", {
        baseUrl: "https://example.com/api",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps the timeout budget when a caller signal is supplied", async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiFetchJson("/platform/overview", {
      baseUrl: "https://example.com/api",
      signal: new AbortController().signal,
      timeoutMs: 10,
    });
    timeoutController.abort(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(pending).resolves.toMatchObject({
      data: null,
      error: API_TIMEOUT_ERROR,
      status: null,
    });
  });

  it("normalizes abort errors for optional personal requests too", () => {
    expect(
      apiTransportErrorMessage(
        new DOMException("The request was aborted.", "AbortError"),
        "fallback",
      ),
    ).toBe(API_TIMEOUT_ERROR);
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
