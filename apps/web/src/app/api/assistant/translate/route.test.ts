import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("assistant translation proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds a stalled translation backend request", async () => {
    const requestController = new AbortController();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/assistant/translate", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      signal: requestController.signal,
      body: JSON.stringify({ text: "hello" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Translation backend is unavailable.",
    });
    const backendSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(backendSignal).toEqual(expect.any(AbortSignal));

    requestController.abort();
    expect(backendSignal.aborted).toBe(true);
  });
});
