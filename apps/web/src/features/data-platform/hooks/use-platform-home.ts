"use client";

import { keepPreviousData, useQueries } from "@tanstack/react-query";

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
  normalizeApiBaseUrl,
  platformKeys,
  type PlatformFetchResult,
  type PlatformQueryScope,
} from "../queries/platform-queries";
import {
  PLATFORM_QUERY_STALE_TIME_MS,
  platformDataNeedsForView,
} from "../queries/platform-data-needs";
import { appEnv } from "@/lib/env";
import { normalizeCityValue } from "../city-scope";
import { normalizeSourceDateValue } from "../time-window";

/**
 * Scope changes (city, date) mint a new query key. Without a placeholder the UI
 * would blank out and re-enter its loading state on every switch, so hold the
 * previous scope's data until the new one lands.
 */
const SCOPE_QUERY_OPTIONS = {
  staleTime: PLATFORM_QUERY_STALE_TIME_MS,
  placeholderData: keepPreviousData,
} as const;

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
  /** True while any query needed by the active view is still in flight. */
  isLoadingView: boolean;
  /** True while the rendered data still belongs to the previously selected scope. */
  isPreviousScope: boolean;
};

export function usePlatformHome(options: UsePlatformHomeOptions): PlatformHomeState {
  const city = normalizeCityValue(options.city);
  const date = normalizeSourceDateValue(options.date);
  const userId = options.userId ?? appEnv.defaultUserId;
  const normalizedScope: PlatformQueryScope = {
    city,
    date,
    userId,
    authToken: options.authToken,
  };
  const needs = platformDataNeedsForView(options.activeNavKey, {
    isHistorical: options.isHistorical,
    needsHistoryAvailability: options.needsHistoryAvailability,
  });

  const results = useQueries({
    queries: [
      {
        queryKey: platformKeys.overview(normalizedScope),
        queryFn: async () => (await fetchPlatformOverview(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
      },
      {
        queryKey: platformKeys.publicDashboard(normalizedScope),
        queryFn: async () => (await fetchPublicDashboard(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
      },
      {
        queryKey: platformKeys.weather(normalizedScope),
        queryFn: async () => (await fetchWeatherForecast(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.weather,
      },
      {
        queryKey: platformKeys.airQuality(normalizedScope),
        queryFn: async () => (await fetchAirQualityCurrent(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.air,
      },
      {
        queryKey: platformKeys.energy(normalizedScope),
        queryFn: async () => (await fetchEnergyCurrent(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.energy,
      },
      {
        queryKey: platformKeys.householdEnergy(normalizedScope),
        queryFn: async () => (await fetchHouseholdEnergyCurrent(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.householdEnergy,
      },
      {
        queryKey: platformKeys.roadRail(normalizedScope),
        queryFn: async () => (await fetchRoadRailCurrent(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.roadRail,
      },
      {
        queryKey: platformKeys.transit(normalizedScope),
        queryFn: async () => (await fetchTransitCurrent(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.transit,
      },
      {
        queryKey: platformKeys.history(normalizedScope),
        queryFn: async () => (await fetchPlatformHistory(normalizedScope)).data ?? emptyHistory(),
        ...SCOPE_QUERY_OPTIONS,
        enabled: needs.history,
      },
      {
        queryKey: platformKeys.historyAvailability(normalizedScope),
        queryFn: async () =>
          (await fetchPlatformHistoryAvailability(normalizedScope)).data,
        ...SCOPE_QUERY_OPTIONS,
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

  return {
    isPending: overviewQuery.isPending && overviewQuery.data == null,
    isLoadingView: activeResults.some((query) => query.isPending),
    isPreviousScope: activeResults.some((query) => query.isPlaceholderData),
    apiBaseUrl: normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    defaultUserId: userId,
    overview: overviewQuery.data ?? null,
    publicDashboard: publicDashboardQuery.data ?? null,
    weather: weatherQuery.data ?? null,
    airQuality: airQualityQuery.data ?? null,
    energy: energyQuery.data ?? null,
    householdEnergy: householdEnergyQuery.data ?? null,
    history: historyQuery.data ?? emptyHistory(),
    historyAvailability: historyAvailabilityQuery.data ?? null,
    roadRail: roadRailQuery.data ?? null,
    transit: transitQuery.data ?? null,
    error: queryErrors[0] ?? null,
  };
}
