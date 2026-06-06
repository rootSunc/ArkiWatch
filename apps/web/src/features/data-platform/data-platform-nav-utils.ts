import { categoryVisibleToCurrentUser } from "./category-access";
import type { NavItem } from "./data-platform-shell";
import { PRIMARY_NAV_ITEMS } from "./data-platform-shell";
import { MOBILITY_NAV_KEY, isMobilityCategoryKey, mobilityAvailable } from "./data-platform-view-model";
import type { PlatformCategory } from "./types";

export const BRAND_LOGO_SRC = "/brand/logo-mark.png";
export const NAV_QUERY_KEY = "view";
export const EVENT_QUERY_KEY = "event";
export const TODAY_NAV_KEY = "today";
export const FALLBACK_NAV_KEY = "overview";
export const READ_RECENT_EVENTS_STORAGE_KEY = "arkiwatch-read-recent-events-v1";
export const CROSS_TIMELINE_LIMIT = 10;

// Keep this allowlist in the view-model layer so server evaluation never needs
// to call methods on values exported by the client-only shell module.
const CATALOG_CATEGORY_KEYS = new Set([
  "city_services",
  "geospatial",
  "regional_profile",
]);

export const CATEGORY_ICONS: Record<string, string> = {
  air: "air",
  city_services: "location_city",
  energy: "bolt",
  events: "event",
  geospatial: "map",
  mobility: "commute",
  regional_profile: "public",
  traffic: "traffic",
  transit: "directions_bus",
  water: "water_drop",
  weather: "cloud",
};

export function currentSearchParams(
  fallbackParams: { toString: () => string },
): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams(fallbackParams.toString());
  }

  return new URLSearchParams(window.location.search);
}

export function pathWithParams(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function categoryByKey(
  categories: PlatformCategory[],
  key: string | undefined,
): PlatformCategory | null {
  if (!key) {
    return null;
  }

  return categories.find((category) => category.key === key) ?? null;
}

export function isCatalogCategoryKey(categoryKey: string): boolean {
  return CATALOG_CATEGORY_KEYS.has(categoryKey);
}

export function loadReadRecentEventIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const value = window.localStorage.getItem(READ_RECENT_EVENTS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function profileInitials(label: string): string {
  const initials = label
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "DV";
}

export function saveReadRecentEventIds(ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      READ_RECENT_EVENTS_STORAGE_KEY,
      JSON.stringify([...ids].slice(-400)),
    );
  } catch {
    // Notification read state is helpful, but navigation should still work without storage.
  }
}

export function navItemAvailable(item: NavItem, categories: PlatformCategory[]): boolean {
  if (item.key === TODAY_NAV_KEY) {
    return true;
  }

  if (item.key === MOBILITY_NAV_KEY) {
    return mobilityAvailable(categories);
  }

  if (!item.categoryKey) {
    return true;
  }

  if (!categoryVisibleToCurrentUser(item.categoryKey)) {
    return false;
  }

  return categories.some((category) => category.key === item.categoryKey);
}

export function resolveNavKey(
  requestedKey: string | null,
  categories: PlatformCategory[],
): string {
  const normalized = requestedKey?.trim() || null;

  if (!normalized || normalized === TODAY_NAV_KEY) {
    return TODAY_NAV_KEY;
  }

  if (normalized === FALLBACK_NAV_KEY) {
    return FALLBACK_NAV_KEY;
  }

  if (normalized === MOBILITY_NAV_KEY || isMobilityCategoryKey(normalized)) {
    return mobilityAvailable(categories) ? MOBILITY_NAV_KEY : TODAY_NAV_KEY;
  }

  if (!categoryVisibleToCurrentUser(normalized)) {
    return TODAY_NAV_KEY;
  }

  const primaryNavItem = PRIMARY_NAV_ITEMS.find((item) => item.key === normalized);
  if (primaryNavItem) {
    if (
      primaryNavItem.categoryKey &&
      !categoryVisibleToCurrentUser(primaryNavItem.categoryKey)
    ) {
      return TODAY_NAV_KEY;
    }

    return normalized;
  }

  return categories.some(
    (category) => category.key === normalized && categoryVisibleToCurrentUser(category.key),
  )
    ? normalized
    : TODAY_NAV_KEY;
}
