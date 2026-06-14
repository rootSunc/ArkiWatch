import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPersonalContext, savePersonalContext } from "./personal-context";

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
});
