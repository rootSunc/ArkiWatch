import type { PlatformOverviewResponse } from "./types";

const ADMIN_ONLY_CATEGORY_KEYS = new Set(["city_services", "geospatial"]);
// TODO: replace this with role-based admin access when user roles are wired.
const ADMIN_CATEGORY_ACCESS_ENABLED = false;

export function categoryVisibleToCurrentUser(
  categoryKey: string | null | undefined,
): boolean {
  if (!categoryKey) {
    return true;
  }

  return (
    ADMIN_CATEGORY_ACCESS_ENABLED || !ADMIN_ONLY_CATEGORY_KEYS.has(categoryKey)
  );
}

export function filterPlatformOverviewForCurrentUser(
  overview: PlatformOverviewResponse | null,
): PlatformOverviewResponse | null {
  if (!overview) {
    return null;
  }

  const categories = overview.categories.filter((category) =>
    categoryVisibleToCurrentUser(category.key),
  );
  const recentEvents = overview.recent_events.filter((event) =>
    categoryVisibleToCurrentUser(event.category_key),
  );
  const sources = overview.sources.filter((source) => {
    const sourceCategories = source.categories ?? [];
    return (
      sourceCategories.length === 0 ||
      sourceCategories.some(categoryVisibleToCurrentUser)
    );
  });

  return {
    ...overview,
    categories,
    recent_events: recentEvents,
    sources,
  };
}
