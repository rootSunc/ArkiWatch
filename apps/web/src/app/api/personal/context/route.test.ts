import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const sessionCookie = "arkiwatch_session=token-123";

describe("personal context route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a session before reading personal context", async () => {
    const response = await GET(new NextRequest("http://localhost/api/personal/context"));
    expect(response.status).toBe(401);
  });

  it("binds writes to the authenticated user instead of request input", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "current-user" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "saved-location" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/personal/context", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        resource: "locations",
        payload: { user_id: "other-user", label: "Home" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const forwardedRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(forwardedRequest.body))).toEqual({
      user_id: "current-user",
      label: "Home",
    });
  });

  it("aggregates all personal resources for the settings page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "current-user" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json([{ id: "location-1" }], { status: 200 }))
      .mockResolvedValueOnce(Response.json(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json([], { status: 200 }))
      .mockResolvedValueOnce(Response.json([], { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/personal/context", {
      headers: { cookie: sessionCookie },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      locations: [{ id: "location-1" }],
      preferences: null,
      commuteProfiles: [],
      channels: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("uses a scoped PUT when updating a saved location", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "current-user" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "location-1" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/personal/context", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        resource: "locations",
        payload: { id: "location-1", city: "Espoo" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const [url, forwardedRequest] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/user\/locations\/location-1$/);
    expect(forwardedRequest.method).toBe("PUT");
    expect(JSON.parse(String(forwardedRequest.body))).toEqual({
      user_id: "current-user",
      city: "Espoo",
    });
  });
});
