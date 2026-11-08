import { beforeEach, describe, expect, it, vi } from "vitest";

describe("platform query scope forwarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requests the full advertised 30-day history window for the selected date", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ weather: [] }, { status: 200 })));
    const { fetchPlatformHistory } = await import("./platform-queries");
    await fetchPlatformHistory({ city: "helsinki", date: "2026-08-09" });
    expect(fetch).toHaveBeenCalledWith(new URL("http://127.0.0.1:8000/api/platform/history?city=helsinki&days=30&date=2026-08-09"), expect.objectContaining({ cache: "no-store" }));
  });

  it("requests a short air-only history for the observatory trend", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ air_quality: [] }, { status: 200 })));
    const { AIR_TREND_CATEGORY, AIR_TREND_DAY_COUNT, fetchPlatformHistory } = await import("./platform-queries");
    await fetchPlatformHistory(
      { city: "helsinki", date: null },
      undefined,
      { days: AIR_TREND_DAY_COUNT, categories: [AIR_TREND_CATEGORY] },
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/api/platform/history?city=helsinki&days=7&categories=air_quality"),
      expect.objectContaining({ cache: "no-store" }),
    );
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
      new URL("http://127.0.0.1:8000/api/public/briefing?city=helsinki&date=2026-04-11"),
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

    for (const key of ["energy", "householdEnergy", "roadRail"] as const) {
      expect(platformKeys[key](helsinkiScope)).toEqual(platformKeys[key](tampereScope));
    }

    expect(platformKeys.publicDashboard(helsinkiScope)).not.toEqual(platformKeys.publicDashboard(tampereScope));
    expect(platformKeys.weather(helsinkiScope)).not.toEqual(platformKeys.weather(tampereScope));
    expect(platformKeys.transit(helsinkiScope)).not.toEqual(platformKeys.transit(tampereScope));
  });
});
