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
});
