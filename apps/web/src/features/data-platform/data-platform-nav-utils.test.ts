import { describe, expect, it } from "vitest";

import {
  buildNavigationQueryParams,
  isCatalogCategoryKey,
  loadReadRecentEventIds,
  mobileNavigationItems,
  READ_RECENT_EVENTS_STORAGE_KEY,
  resolveNavKey,
} from "./data-platform-nav-utils";
import type { PlatformCategory } from "./types";

describe("isCatalogCategoryKey", () => {
  it("keeps reference catalog domains out of the core signal group", () => {
    expect(isCatalogCategoryKey("city_services")).toBe(true);
    expect(isCatalogCategoryKey("geospatial")).toBe(true);
    expect(isCatalogCategoryKey("regional_profile")).toBe(true);
  });

  it("keeps everyday signal domains in the primary group", () => {
    expect(isCatalogCategoryKey("weather")).toBe(false);
    expect(isCatalogCategoryKey("mobility")).toBe(false);
  });
});

describe("buildNavigationQueryParams", () => {
  const defaults = { mobilityTab: "transit" as const, energyTab: "porssisahko" as const };

  it("clears stale panel state when opening a category event", () => {
    const params = buildNavigationQueryParams(
      new URLSearchParams("city=helsinki&mobilityTab=traffic&energyTab=fingrid"),
      "weather",
      { eventId: "rain-1" },
      defaults,
    );

    expect(params.toString()).toBe("city=helsinki&view=weather&event=rain-1");
  });

  it("keeps only the mobility panel needed by a mobility event", () => {
    const params = buildNavigationQueryParams(
      new URLSearchParams("view=energy&energyTab=fingrid"),
      "mobility",
      { mobilityTab: "traffic", eventId: "traffic-1" },
      defaults,
    );

    expect(params.toString()).toBe(
      "view=mobility&mobilityTab=traffic&event=traffic-1",
    );
  });

  it("keeps a linkable view=today param while clearing deep-link state", () => {
    const params = buildNavigationQueryParams(
      new URLSearchParams("view=energy&energyTab=fingrid&event=old"),
      "today",
      {},
      defaults,
    );

    expect(params.toString()).toBe("view=today");
  });

  it("removes deep-link state when returning to the default data overview", () => {
    const params = buildNavigationQueryParams(
      new URLSearchParams("view=energy&energyTab=fingrid&event=old"),
      "overview",
      {},
      defaults,
    );

    expect(params.toString()).toBe("");
  });
});

describe("resolveNavKey", () => {
  it("defaults to the data overview when no view is requested", () => {
    expect(resolveNavKey(null, [])).toBe("overview");
  });

  it("preserves a mobility deep link while categories are still loading", () => {
    expect(resolveNavKey("mobility", [])).toBe("mobility");
  });

  it("preserves catalog deep links while categories are still loading", () => {
    expect(resolveNavKey("city_services", [])).toBe("city_services");
    expect(resolveNavKey("geospatial", [])).toBe("geospatial");
    expect(resolveNavKey("regional_profile", [])).toBe("regional_profile");
  });
});

describe("mobileNavigationItems", () => {
  it("keeps the persistent mobile switcher focused and availability-aware", () => {
    const categories = [
      { key: "weather" },
      { key: "transit" },
      { key: "air" },
    ] as PlatformCategory[];

    expect(mobileNavigationItems(categories).map((item) => item.key)).toEqual([
      "today",
      "overview",
      "weather",
      "mobility",
    ]);
  });

  it("does not expose unavailable category destinations", () => {
    expect(mobileNavigationItems([]).map((item) => item.key)).toEqual([
      "today",
      "overview",
    ]);
  });
});

describe("read event persistence", () => {
  it("bounds legacy local storage entries when loading them", () => {
    const ids = Array.from({ length: 450 }, (_, index) => `event-${index}`);
    window.localStorage.setItem(READ_RECENT_EVENTS_STORAGE_KEY, JSON.stringify(ids));

    const loaded = loadReadRecentEventIds();

    expect(loaded.size).toBe(400);
    expect(loaded.has("event-49")).toBe(false);
    expect(loaded.has("event-50")).toBe(true);
    expect(loaded.has("event-449")).toBe(true);
  });
});
