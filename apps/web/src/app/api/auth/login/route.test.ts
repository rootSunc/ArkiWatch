import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("auth login proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redacts backend failure details before returning them to the browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: "database password=legacy-secret" },
          { status: 500 },
        ),
      ),
    );

    const request = new NextRequest("https://app.example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ detail: "Login failed." });
    expect(JSON.stringify(body)).not.toContain("legacy-secret");
  });

  it("returns a bounded proxy error when the backend is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("https://app.example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Login backend is unavailable.",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects a malformed successful backend response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok" })));

    const request = new NextRequest("https://app.example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Login backend returned an invalid response.",
    });
  });
});
