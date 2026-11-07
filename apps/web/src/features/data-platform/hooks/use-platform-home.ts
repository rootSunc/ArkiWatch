"use client";

import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { resolveApiBaseUrl, unwrapApiResult } from "@/lib/api-client";

import {
  fetchAirQualityCurrent,
  fetchEnergyCurrent,
  fetchHouseholdEnergyCurrent,
  fetchPlatformHistory,
  fetchPlatformHistoryAvailability,
  fetchPlatformOverview,
  fetchPublicDashboard,
  fetchRoadRailCurrent,
  fetchTransitCurrent,
  fetchWeatherForecast,
  platformKeys,
  type PlatformFetchResult,
  type PlatformQueryScope,
} from "../queries/platform-queries";
import {
  platformDataNeedsForDemo,
  platformDataNeedsForView,
  platformQueryRefreshOptions,
} from "../queries/platform-data-needs";
import { briefingCacheRemaining } from "../queries/briefing-cache";
import type { PublicDashboardRead } from "../types";
import { appEnv } from "@/lib/env";
import { normalizeCityValue } from "../city-scope";
import { normalizeSourceDateValue } from "../time-window";

/**
 * Scope changes (city, date) mint a new query key. Without a placeholder the UI
 * would blank out and re-enter its loading state on every switch, so hold the
 * previous scope's data until the new one lands.
 */
function emptyHistory(): PlatformFetchResult["history"] {
  return {
    weather: [],
    airQuality: [],
    energy: [],
    householdEnergy: [],
    roadRail: [],
    transit: [],
  };
}

export type UsePlatformHomeOptions = PlatformQueryScope & {
  activeNavKey?: string | null;
  isHistorical?: boolean;
  needsHistoryAvailability?: boolean;
};

export type PlatformHomeState = PlatformFetchResult & {
  /** True until the overview lands, i.e. before the shell has anything to render. */
  isPending: boolean;
  failedSignalKeys: string[];
  staleSignalKeys: string[];
  /** True while any query needed by the active view has not produced data yet. */
  isLoadingView: boolean;
  /** True while the rendered data still belongs to the previously selected scope. */
  isPreviousScope: boolean;
  /** Refetch the currently active platform queries after a transient failure. */
  retry: () => Promise<void>;
};

export function usePlatformHome(
  options: UsePlatformHomeOptions,
): PlatformHomeState {
  const city = normalizeCityValue(options.city);
  const date = normalizeSourceDateValue(options.date);
  const userId = options.userId ?? appEnv.defaultUserId;
  const normalizedScope: PlatformQueryScope = {
    city,
    date,
    userId,
    authToken: options.authToken,
  };
  const needs = appEnv.demoMode
    ? platformDataNeedsForDemo(options.activeNavKey, {
        isHistorical: options.isHistorical,
        needsHistoryAvailability: options.needsHistoryAvailability,
      })
    : platformDataNeedsForView(options.activeNavKey, {
        isHistorical: options.isHistorical,
        needsHistoryAvailability: options.needsHistoryAvailability,
      });
  const isHistoricalScope = Boolean(options.isHistorical ?? date);
  const queryOptions = {
    ...platformQueryRefreshOptions(isHistoricalScope),
    placeholderData: keepPreviousData,
  } as const;

  const results = useQueries({
    queries: [
      {
        queryKey: platformKeys.overview(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchPlatformOverview(normalizedScope, signal)),
        ...queryOptions,
      },
      {
        queryKey: platformKeys.publicDashboard(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchPublicDashboard(normalizedScope, signal)),
        ...queryOptions,
        refetchInterval: (query: {
          state: { data: unknown; dataUpdatedAt: number };
        }) =>
          appEnv.demoMode || isHistoricalScope
            ? false
            : Math.max(
                1000,
                briefingCacheRemaining(
                  query.state.data as PublicDashboardRead | undefined,
                  query.state.dataUpdatedAt,
                ) || 300000,
              ),
      },
      {
        queryKey: platformKeys.weather(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchWeatherForecast(normalizedScope, signal)),
        ...queryOptions,
        enabled: needs.weather,
      },
      {
        queryKey: platformKeys.airQuality(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(
            await fetchAirQualityCurrent(normalizedScope, signal),
          ),
        ...queryOptions,
        enabled: needs.air,
      },
      {
        queryKey: platformKeys.energy(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchEnergyCurrent(normalizedScope, signal)),
        ...queryOptions,
        enabled: needs.energy,
      },
      {
        queryKey: platformKeys.householdEnergy(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(
            await fetchHouseholdEnergyCurrent(normalizedScope, signal),
          ),
        ...queryOptions,
        enabled: needs.householdEnergy,
      },
      {
        queryKey: platformKeys.roadRail(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchRoadRailCurrent(normalizedScope, signal)),
        ...queryOptions,
        enabled: needs.roadRail,
      },
      {
        queryKey: platformKeys.transit(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchTransitCurrent(normalizedScope, signal)),
        ...queryOptions,
        enabled: needs.transit,
      },
      {
        queryKey: platformKeys.history(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchPlatformHistory(normalizedScope, signal)),
        ...queryOptions,
        enabled: needs.history,
      },
      {
        queryKey: platformKeys.historyAvailability(normalizedScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(
            await fetchPlatformHistoryAvailability(normalizedScope, signal),
          ),
        ...queryOptions,
        enabled: needs.historyAvailability,
      },
    ],
  });

  const [
    overviewQuery,
    publicDashboardQuery,
    weatherQuery,
    airQualityQuery,
    energyQuery,
    householdEnergyQuery,
    roadRailQuery,
    transitQuery,
    historyQuery,
    historyAvailabilityQuery,
  ] = results;

  const activeResults = [
    overviewQuery,
    publicDashboardQuery,
    needs.weather ? weatherQuery : null,
    needs.air ? airQualityQuery : null,
    needs.energy ? energyQuery : null,
    needs.householdEnergy ? householdEnergyQuery : null,
    needs.roadRail ? roadRailQuery : null,
    needs.transit ? transitQuery : null,
    needs.history ? historyQuery : null,
    needs.historyAvailability ? historyAvailabilityQuery : null,
  ].filter((query): query is NonNullable<typeof query> => query !== null);

  const queryErrors = activeResults
    .map((query) => (query.error instanceof Error ? query.error.message : null))
    .filter((message): message is string => Boolean(message));

  const retry = async (): Promise<void> => {
    await Promise.all(activeResults.map((query) => query.refetch()));
  };

  const briefingExpired =
    !appEnv.demoMode &&
    !isHistoricalScope &&
    publicDashboardQuery.data != null &&
    briefingCacheRemaining(
      publicDashboardQuery.data,
      publicDashboardQuery.dataUpdatedAt,
    ) === 0;
  const validBriefing =
    publicDashboardQuery.isError ||
    publicDashboardQuery.isPlaceholderData ||
    briefingExpired
      ? null
      : (publicDashboardQuery.data ?? null);
  const fallbackFailed = publicDashboardQuery.isError;
  return {
    staleSignalKeys: briefingExpired
      ? [
          !needs.weather ? "weather" : null,
          !needs.air ? "air" : null,
          !needs.energy && !needs.householdEnergy ? "energy" : null,
          !needs.transit && !needs.roadRail ? "mobility" : null,
        ].filter((key): key is string => key !== null)
      : [],
    failedSignalKeys: [
      (needs.weather && weatherQuery.isError) ||
      (!needs.weather && fallbackFailed)
        ? "weather"
        : null,
      (needs.air && airQualityQuery.isError) || (!needs.air && fallbackFailed)
        ? "air"
        : null,
      (needs.energy && energyQuery.isError) ||
      (needs.householdEnergy && householdEnergyQuery.isError) ||
      (!needs.energy && !needs.householdEnergy && fallbackFailed)
        ? "energy"
        : null,
      (needs.roadRail && roadRailQuery.isError) ||
      (needs.transit && transitQuery.isError) ||
      (!needs.roadRail && !needs.transit && fallbackFailed)
        ? "mobility"
        : null,
    ].filter((key): key is string => key !== null),
    isPending: overviewQuery.isPending && overviewQuery.data == null,
    // Background refreshes intentionally do not enter the blocking/loading
    // state. This keeps retry actions and focus restoration usable while the
    // five-minute live cadence updates data in place.
    isLoadingView: activeResults.some((query) => query.isPending),
    isPreviousScope: activeResults.some((query) => query.isPlaceholderData),
    retry,
    apiBaseUrl: resolveApiBaseUrl(),
    defaultUserId: userId,
    overview: overviewQuery.data ?? null,
    publicDashboard: validBriefing,
    weather:
      (needs.weather ? weatherQuery.data : null) ??
      validBriefing?.signals?.weather ??
      null,
    airQuality:
      (needs.air ? airQualityQuery.data : null) ??
      validBriefing?.signals?.airQuality ??
      null,
    energy:
      (needs.energy ? energyQuery.data : null) ??
      validBriefing?.signals?.energy ??
      null,
    householdEnergy:
      (needs.householdEnergy ? householdEnergyQuery.data : null) ??
      validBriefing?.signals?.householdEnergy ??
      null,
    history: historyQuery.data ?? emptyHistory(),
    historyAvailability: historyAvailabilityQuery.data ?? null,
    roadRail:
      (needs.roadRail ? roadRailQuery.data : null) ??
      validBriefing?.signals?.roadRail ??
      null,
    transit:
      (needs.transit ? transitQuery.data : null) ??
      validBriefing?.signals?.transit ??
      null,
    error: queryErrors[0] ?? null,
  };
}
