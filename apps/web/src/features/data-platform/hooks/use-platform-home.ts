"use client";

import { useQueries } from "@tanstack/react-query";

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

export function usePlatformHome(options: UsePlatformHomeOptions): PlatformFetchResult {
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
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      },
      {
        queryKey: platformKeys.publicDashboard(normalizedScope),
        queryFn: async () => (await fetchPublicDashboard(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      },
      {
        queryKey: platformKeys.weather(normalizedScope),
        queryFn: async () => (await fetchWeatherForecast(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.weather,
      },
      {
        queryKey: platformKeys.airQuality(normalizedScope),
        queryFn: async () => (await fetchAirQualityCurrent(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.air,
      },
      {
        queryKey: platformKeys.energy(normalizedScope),
        queryFn: async () => (await fetchEnergyCurrent(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.energy,
      },
      {
        queryKey: platformKeys.householdEnergy(normalizedScope),
        queryFn: async () => (await fetchHouseholdEnergyCurrent(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.householdEnergy,
      },
      {
        queryKey: platformKeys.roadRail(normalizedScope),
        queryFn: async () => (await fetchRoadRailCurrent(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.roadRail,
      },
      {
        queryKey: platformKeys.transit(normalizedScope),
        queryFn: async () => (await fetchTransitCurrent(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.transit,
      },
      {
        queryKey: platformKeys.history(normalizedScope),
        queryFn: async () => (await fetchPlatformHistory(normalizedScope)).data ?? emptyHistory(),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
        enabled: needs.history,
      },
      {
        queryKey: platformKeys.historyAvailability(normalizedScope),
        queryFn: async () =>
          (await fetchPlatformHistoryAvailability(normalizedScope)).data,
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
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
