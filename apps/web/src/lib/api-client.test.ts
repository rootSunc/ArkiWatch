import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetchJson, normalizeApiBaseUrl } from "@/lib/api-client";

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
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
