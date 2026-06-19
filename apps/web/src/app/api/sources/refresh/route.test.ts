import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("source refresh proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds the backend request and propagates client cancellation", async () => {
    const requestController = new AbortController();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/sources/refresh", {
      method: "POST",
      signal: requestController.signal,
    });
    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Source refresh backend is unavailable.",
    });
    const backendSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    requestController.abort();
    expect(backendSignal.aborted).toBe(true);
  });

  it("does not forward backend failure details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ detail: "scheduler secret=legacy-secret" }, { status: 500 }),
      ),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/sources/refresh", { method: "POST" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Source refresh request failed.",
    });
  });
});
