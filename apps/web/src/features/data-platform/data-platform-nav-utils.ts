import { categoryVisibleToCurrentUser } from "./category-access";
import type { NavItem } from "./data-platform-shell";
import { PRIMARY_NAV_ITEMS } from "./data-platform-shell";
import { MOBILITY_NAV_KEY, isMobilityCategoryKey, mobilityAvailable } from "./data-platform-view-model";
import type { MobilityTabKey } from "./mobility-workspace";
import {
  ENERGY_TAB_QUERY_KEY,
  MOBILITY_TAB_QUERY_KEY,
  type EnergyPanelKey,
} from "./workspace-query-params";
import type { PlatformCategory } from "./types";

export const BRAND_LOGO_SRC = "/brand/logo-mark.png";
export const NAV_QUERY_KEY = "view";
export const EVENT_QUERY_KEY = "event";
export const TODAY_NAV_KEY = "today";
export const FALLBACK_NAV_KEY = "overview";
export const READ_RECENT_EVENTS_STORAGE_KEY = "arkiwatch-read-recent-events-v1";
export const CROSS_TIMELINE_LIMIT = 10;

export type NavigationQueryOptions = {
  mobilityTab?: MobilityTabKey;
  energyTab?: EnergyPanelKey;
  eventId?: string;
};

export function buildNavigationQueryParams(
  currentParams: URLSearchParams,
  nextNavKey: string,
  options: NavigationQueryOptions,
  defaults: { mobilityTab: MobilityTabKey; energyTab: EnergyPanelKey },
): URLSearchParams {
  const nextParams = new URLSearchParams(currentParams.toString());

  if (nextNavKey === FALLBACK_NAV_KEY) {
    nextParams.delete(NAV_QUERY_KEY);
    nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    nextParams.delete(ENERGY_TAB_QUERY_KEY);
  } else if (nextNavKey === TODAY_NAV_KEY) {
    nextParams.set(NAV_QUERY_KEY, TODAY_NAV_KEY);
    nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    nextParams.delete(ENERGY_TAB_QUERY_KEY);
  } else if (nextNavKey === MOBILITY_NAV_KEY) {
    nextParams.set(NAV_QUERY_KEY, MOBILITY_NAV_KEY);
    nextParams.set(
      MOBILITY_TAB_QUERY_KEY,
      options.mobilityTab ?? defaults.mobilityTab,
    );
    nextParams.delete(ENERGY_TAB_QUERY_KEY);
  } else if (nextNavKey === "energy") {
    nextParams.set(NAV_QUERY_KEY, "energy");
    nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    nextParams.set(ENERGY_TAB_QUERY_KEY, options.energyTab ?? defaults.energyTab);
  } else {
    nextParams.set(NAV_QUERY_KEY, nextNavKey);
    nextParams.delete(MOBILITY_TAB_QUERY_KEY);
    nextParams.delete(ENERGY_TAB_QUERY_KEY);
  }

  if (nextNavKey !== "sources") nextParams.delete("source");

  if (options.eventId) {
    nextParams.set(EVENT_QUERY_KEY, options.eventId);
  } else {
    nextParams.delete(EVENT_QUERY_KEY);
  }

  return nextParams;
}

// Lives in the view-model layer: server evaluation must not reach into values
// exported by the client-only shell module.
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

/**
 * Route breadcrumb for the top bar (README §Breadcrumbs per route). Returns
 * message keys plus the nav key the clickable root should navigate to.
 */
export function breadcrumbForNav(navKey: string): {
  rootKey: string;
  leafKey: string;
  rootTarget: string;
} {
  if (navKey === TODAY_NAV_KEY) {
    return { rootKey: "shell.lifeAssistant", leafKey: "shell.navPlan", rootTarget: TODAY_NAV_KEY };
  }

  if (navKey === "sources") return { rootKey: "shell.navHome", leafKey: "shell.navSources", rootTarget: FALLBACK_NAV_KEY };

  const catalogLeafKeys: Record<string, string> = {
    city_services: "shell.navCityServices",
    geospatial: "shell.navGeospatialBase",
    regional_profile: "shell.navRegionalProfile",
  };
  if (catalogLeafKeys[navKey]) {
    return {
      rootKey: "shell.dataCatalog",
      leafKey: catalogLeafKeys[navKey],
      rootTarget: FALLBACK_NAV_KEY,
    };
  }

  const platformLeafKeys: Record<string, string> = {
    weather: "shell.navWeather",
    air: "shell.navAirQuality",
    energy: "shell.navEnergy",
    mobility: "shell.navMobility",
    transit: "shell.navMobility",
    traffic: "shell.navMobility",
    water: "shell.navWaterAndSnow",
    events: "shell.navLinkedEvents",
  };
  if (platformLeafKeys[navKey]) {
    return {
      rootKey: "shell.dataPlatformMode",
      leafKey: platformLeafKeys[navKey],
      rootTarget: FALLBACK_NAV_KEY,
    };
  }

  return {
    rootKey: "shell.dataPlatformMode",
    leafKey: "shell.navHome",
    rootTarget: FALLBACK_NAV_KEY,
  };
}

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
    const recentIds = Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
    return new Set(recentIds.slice(-400));
  } catch {
    return new Set();
  }
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

/**
 * The few destinations that work as a persistent, thumb-reachable task
 * switcher. The full navigation stays in the side drawer, driven by
 * PRIMARY_NAV_ITEMS.
 */
export function mobileNavigationItems(categories: PlatformCategory[], showPlan = false): NavItem[] {
  const mobileOrder = [FALLBACK_NAV_KEY, TODAY_NAV_KEY, "events"];
  return mobileOrder
    .map((key) => PRIMARY_NAV_ITEMS.find((item) => item.key === key))
    .filter((item): item is NavItem => item != null && navItemAvailable(item, categories) && (item.key !== TODAY_NAV_KEY || showPlan));
}

export function resolveNavKey(
  requestedKey: string | null,
  categories: PlatformCategory[],
): string {
  const normalized = requestedKey?.trim() || null;

  if (!normalized || normalized === FALLBACK_NAV_KEY) {
    return FALLBACK_NAV_KEY;
  }

  if (normalized === "sources") return "sources";

  if (normalized === TODAY_NAV_KEY) {
    return TODAY_NAV_KEY;
  }

  if (normalized === MOBILITY_NAV_KEY || isMobilityCategoryKey(normalized)) {
    // An empty category list is the loading state, not proof that mobility is
    // unavailable. Preserve deep links until the overview can validate them.
    return categories.length === 0 || mobilityAvailable(categories)
      ? MOBILITY_NAV_KEY
      : FALLBACK_NAV_KEY;
  }

  if (!categoryVisibleToCurrentUser(normalized)) {
    return FALLBACK_NAV_KEY;
  }

  if (categories.length === 0 && isCatalogCategoryKey(normalized)) {
    // The shell can render before the categories hydrate. A known catalog deep
    // link holds its destination through that window.
    return normalized;
  }

  const primaryNavItem = PRIMARY_NAV_ITEMS.find((item) => item.key === normalized);
  if (primaryNavItem) {
    if (
      primaryNavItem.categoryKey &&
      !categoryVisibleToCurrentUser(primaryNavItem.categoryKey)
    ) {
      return FALLBACK_NAV_KEY;
    }

    return normalized;
  }

  return categories.some(
    (category) => category.key === normalized && categoryVisibleToCurrentUser(category.key),
  )
    ? normalized
    : FALLBACK_NAV_KEY;
}
