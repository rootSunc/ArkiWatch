import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPersonalContext, savePersonalContext } from "./personal-context";
import { API_TIMEOUT_ERROR } from "@/lib/api-client";

describe("personal-context client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the aggregate context from the same-origin proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { locations: [], preferences: null, commuteProfiles: [], channels: [] },
          { status: 200 },
        ),
      ),
    );

    const result = await fetchPersonalContext();

    expect(result.error).toBeNull();
    expect(result.data?.locations).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/personal/context",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("preserves validation details when a personal update is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: [{ msg: "Latitude is invalid." }] }, { status: 422 }),
      ),
    );

    const result = await savePersonalContext("locations", {
      label: "Home",
      country_code: "FI",
      city: "Helsinki",
      district: null,
      lat: 60.1699,
      lon: 24.9384,
      is_default: true,
    });

    expect(result.data).toBeNull();
    expect(result.error).toBe("Latitude is invalid.");
    expect(result.status).toBe(422);
  });

  it("turns a stalled context request into a bounded timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The request timed out.", "TimeoutError");
      }),
    );

    const result = await fetchPersonalContext();

    expect(result.data).toBeNull();
    expect(result.error).toBe(API_TIMEOUT_ERROR);
    expect(result.status).toBeNull();
  });

  it("propagates caller cancellation while retaining a bounded signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () =>
      Response.json(
        { locations: [], preferences: null, commuteProfiles: [], channels: [] },
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPersonalContext(controller.signal);

    const forwardedSignal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .signal as AbortSignal;
    controller.abort();
    expect(forwardedSignal.aborted).toBe(true);
  });
});
