import { describe, expect, it } from "vitest";

import { buildSignalView } from "./signal-view";
import { translateMessageKey } from "./i18n";
import type { PlatformCategory, PlatformEvent } from "./types";

const tKey = (key: string) => translateMessageKey("en", key);

function event(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    id: "transit-delay",
    notification: true,
    notification_priority: 3000000000000,
    category_key: "transit",
    event_type: "transit_delay",
    title: "Transit delay",
    body: "A service alert is active.",
    severity: "HIGH",
    starts_at: "2026-08-09T05:00:00Z",
    ends_at: "2026-08-09T23:00:00Z",
    source_codes: ["digitransit"],
    evidence: [],
    ...overrides,
  };
}

function category(overrides: Partial<PlatformCategory> = {}): PlatformCategory {
  return {
    key: "transit",
    title: "Transit",
    description: "Public transport service alerts.",
    status: "healthy",
    stage: "connected",
    summary_metrics: [],
    events: [],
    sources: [],
    source_codes: [],
    ...overrides,
  } as PlatformCategory;
}

function view(overrides: Partial<Parameters<typeof buildSignalView>[0]> = {}) {
  return buildSignalView({
    selectedCategory: null,
    displayCategories: [category()],
    categories: [category()],
    recentEvents: [event()],
    searchValue: "",
    language: "en",
    readRecentEventIds: new Set<string>(),
    selectedCity: "helsinki",
    eventReferenceAt: "2026-08-09T06:00:00Z",
    tKey,
    ...overrides,
  });
}

describe("buildSignalView", () => {
  it("summarises the filtered set, not the whole catalogue", () => {
    const matching = view();
    expect(matching.visibleEvents).toHaveLength(1);
    expect(matching.overallNotificationTitle).toContain("Overall");
    expect(matching.overallNotificationBody).toContain("Transit delay");

    // A query that excludes every event must not leave the summary claiming one.
    const filtered = view({ searchValue: "nothing matches this" });
    expect(filtered.visibleEvents).toEqual([]);
    expect(filtered.overallNotificationTitle).toBe(
      `Overall, ${tKey("shell.noActiveNotifications")}`,
    );
    expect(filtered.overallNotificationBody).toBe(
      tKey("shell.noActiveCrossSignalNotificationsInThisView"),
    );
  });

  it("counts only unread events towards the notification badge", () => {
    expect(view().recentNotificationCount).toBe(1);
    expect(view({ readRecentEventIds: new Set(["transit-delay"]) }).recentNotificationCount).toBe(0);
  });

  it("separates catalog categories from the live ones", () => {
    const result = view({
      displayCategories: [
        category(),
        category({ key: "city_services", title: "City services" }),
        category({ key: "weather", title: "Weather", status: "empty" }),
      ],
    });

    expect(result.primaryVisibleCategories.map((item) => item.key)).toEqual(["transit", "weather"]);
    expect(result.catalogVisibleCategories.map((item) => item.key)).toEqual(["city_services"]);
  });

  it("scopes to a single workspace's own events when one is selected", () => {
    const scoped = category({ events: [event({ id: "scoped", title: "Scoped alert" })] });
    const result = view({ selectedCategory: scoped, categoryEvents: { [scoped.key]: scoped.events } });

    expect(result.visibleEvents.map((item) => item.id)).toEqual(["scoped"]);
    expect(result.overallNotificationTitle).toContain("Transit");
  });
});
