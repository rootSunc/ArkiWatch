import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const sessionCookie = "arkiwatch_session=token-123";

describe("personal dashboard route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a session before proxying the dashboard", async () => {
    const response = await GET(new NextRequest("http://localhost/api/personal/dashboard"));

    expect(response.status).toBe(401);
  });

  it("returns a bounded proxy error when the backend stalls", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    const requestController = new AbortController();

    const request = new NextRequest("http://localhost/api/personal/dashboard", {
      headers: { cookie: sessionCookie },
      signal: requestController.signal,
    });
    const response = await GET(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Personal dashboard backend is unavailable.",
    });
    const backendSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    requestController.abort();
    expect(backendSignal.aborted).toBe(true);
  });

  it("redacts backend failure details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: "database password=legacy-secret" },
          { status: 500 },
        ),
      ),
    );

    const request = new NextRequest("http://localhost/api/personal/dashboard", {
      headers: { cookie: sessionCookie },
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Personal dashboard request failed.",
    });
  });

  it("rejects cross-site dashboard reads before contacting the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/personal/dashboard", {
      headers: {
        cookie: sessionCookie,
        origin: "https://evil.example",
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
