import { beforeEach, describe, expect, it, vi } from "vitest";

describe("platform query scope forwarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards the selected date to the public dashboard endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ coverage_area: "Helsinki/Uusimaa" }, { status: 200 })),
    );

    const { fetchPublicDashboard } = await import("./platform-queries");
    await expect(
      fetchPublicDashboard({ city: "helsinki", date: "2026-04-11" }),
    ).resolves.toMatchObject({ status: 200, error: null });

    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/api/public/dashboard?date=2026-04-11"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps the public overview anonymous and viewer-independent", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ coverage_area: "Helsinki/Uusimaa" }, { status: 200 })),
    );

    const { fetchPlatformOverview, platformKeys } = await import("./platform-queries");
    await expect(
      fetchPlatformOverview({ city: "helsinki", date: null, userId: "private-user" }),
    ).resolves.toMatchObject({ status: 200, error: null });

    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/api/platform/overview?city=helsinki"),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(platformKeys.overview({ city: "helsinki", userId: "user-a" })).toEqual(
      platformKeys.overview({ city: "helsinki", userId: "user-b" }),
    );
  });

  it("forwards a caller cancellation signal to public reads", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const fetchMock = vi.fn(async () =>
      Response.json({ coverage_area: "Helsinki/Uusimaa" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const { fetchPlatformOverview } = await import("./platform-queries");
    await fetchPlatformOverview({ city: "helsinki", date: null }, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/api/platform/overview?city=helsinki"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const forwardedSignal = (
      fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    )[1].signal as AbortSignal;
    controller.abort();
    expect(forwardedSignal.aborted).toBe(true);
  });

  it("reuses regional query entries across city-scoped views", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    const { platformKeys } = await import("./platform-queries");
    const helsinkiScope = { city: "helsinki", date: "2026-04-11" };
    const tampereScope = { city: "tampere", date: "2026-04-11" };

    for (const key of ["publicDashboard", "energy", "householdEnergy", "roadRail"] as const) {
      expect(platformKeys[key](helsinkiScope)).toEqual(platformKeys[key](tampereScope));
    }

    expect(platformKeys.weather(helsinkiScope)).not.toEqual(platformKeys.weather(tampereScope));
    expect(platformKeys.transit(helsinkiScope)).not.toEqual(platformKeys.transit(tampereScope));
  });
});
