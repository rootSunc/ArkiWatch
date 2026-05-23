import { beforeEach, describe, expect, it, vi } from "vitest";

describe("demo query adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not need an API server when demo mode is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const {
      fetchHouseholdEnergyCurrent,
      fetchPlatformOverview,
      fetchWeatherForecast,
    } = await import(
      "../queries/platform-queries"
    );
    const scope = { city: "helsinki", date: null };

    await expect(fetchPlatformOverview(scope)).resolves.toMatchObject({
      status: 200,
      error: null,
      data: { coverage_area: "Helsinki / Uusimaa" },
    });
    await expect(fetchWeatherForecast(scope)).resolves.toMatchObject({
      status: 200,
      error: null,
      data: { source_code: "fmi", points: expect.any(Array) },
    });
    await expect(fetchHouseholdEnergyCurrent(scope)).resolves.toMatchObject({
      status: 200,
      error: null,
      data: { source_code: "porssisahko", unit: "c/kWh" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
