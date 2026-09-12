import { MOBILITY_NAV_KEY } from "../data-platform-view-model";
import { FALLBACK_NAV_KEY, TODAY_NAV_KEY } from "../data-platform-nav-utils";

/** Matches the scheduler's five-minute cadence, so live cards track it. */
export const PLATFORM_QUERY_STALE_TIME_MS = 2 * 60 * 1000;
export const PLATFORM_QUERY_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function platformQueryRefreshOptions(isHistorical: boolean) {
  return {
    staleTime: PLATFORM_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchInterval: isHistorical ? false : PLATFORM_QUERY_REFETCH_INTERVAL_MS,
  } as const;
}

export type PlatformDataNeeds = {
  weather: boolean;
  air: boolean;
  energy: boolean;
  householdEnergy: boolean;
  roadRail: boolean;
  transit: boolean;
  history: boolean;
  historyAvailability: boolean;
};

export type PlatformDataNeedsOptions = {
  /** True when a historical date is selected. */
  isHistorical?: boolean;
  /** True when the date picker is open or availability is otherwise required. */
  needsHistoryAvailability?: boolean;
};

const DEMO_PLATFORM_DATA_NEEDS: PlatformDataNeeds = {
  weather: true,
  air: true,
  energy: true,
  householdEnergy: true,
  roadRail: true,
  transit: true,
  history: false,
  historyAvailability: false,
};

export function platformDataNeedsForDemo(
  navKey: string | null | undefined,
  options: PlatformDataNeedsOptions = {},
): PlatformDataNeeds {
  const needs = platformDataNeedsForView(navKey, options);

  return {
    ...DEMO_PLATFORM_DATA_NEEDS,
    history: needs.history,
    historyAvailability: needs.historyAvailability,
  };
}

function emptyNeeds(historyAvailability: boolean): PlatformDataNeeds {
  return {
    weather: false,
    air: false,
    energy: false,
    householdEnergy: false,
    roadRail: false,
    transit: false,
    history: false,
    historyAvailability,
  };
}

/**
 * Decide which platform queries to run for the active nav view.
 * Today/Overview stay on overview + public dashboard only unless historical.
 */
export function platformDataNeedsForView(
  navKey: string | null | undefined,
  options: PlatformDataNeedsOptions = {},
): PlatformDataNeeds {
  const key = (navKey ?? TODAY_NAV_KEY).trim() || TODAY_NAV_KEY;
  const isHistorical = Boolean(options.isHistorical);
  const needsHistoryAvailability =
    Boolean(options.needsHistoryAvailability) || isHistorical;

  if (isHistorical) {
    return {
      weather: true,
      air: true,
      energy: true,
      householdEnergy: true,
      roadRail: true,
      transit: true,
      history: true,
      historyAvailability: true,
    };
  }

  if (key === TODAY_NAV_KEY || key === FALLBACK_NAV_KEY) {
    return emptyNeeds(needsHistoryAvailability);
  }

  if (key === "weather") {
    return {
      ...emptyNeeds(needsHistoryAvailability),
      weather: true,
      history: true,
    };
  }

  if (key === "air") {
    return {
      ...emptyNeeds(needsHistoryAvailability),
      air: true,
      history: true,
    };
  }

  if (key === "energy") {
    return {
      ...emptyNeeds(needsHistoryAvailability),
      energy: true,
      householdEnergy: true,
      history: true,
    };
  }

  if (
    key === MOBILITY_NAV_KEY ||
    key === "transit" ||
    key === "traffic"
  ) {
    return {
      ...emptyNeeds(needsHistoryAvailability),
      roadRail: true,
      transit: true,
      history: true,
    };
  }

  return emptyNeeds(needsHistoryAvailability);
}
