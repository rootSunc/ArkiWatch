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

export function usePlatformHome(scope: PlatformQueryScope): PlatformFetchResult {
  const city = normalizeCityValue(scope.city);
  const date = normalizeSourceDateValue(scope.date);
  const userId = scope.userId ?? appEnv.defaultUserId;
  const normalizedScope: PlatformQueryScope = { city, date, userId, authToken: scope.authToken };

  const results = useQueries({
    queries: [
      {
        queryKey: platformKeys.overview(normalizedScope),
        queryFn: async () => (await fetchPlatformOverview(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.publicDashboard(normalizedScope),
        queryFn: async () => (await fetchPublicDashboard(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.weather(normalizedScope),
        queryFn: async () => (await fetchWeatherForecast(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.airQuality(normalizedScope),
        queryFn: async () => (await fetchAirQualityCurrent(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.energy(normalizedScope),
        queryFn: async () => (await fetchEnergyCurrent(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.householdEnergy(normalizedScope),
        queryFn: async () => (await fetchHouseholdEnergyCurrent(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.roadRail(normalizedScope),
        queryFn: async () => (await fetchRoadRailCurrent(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.transit(normalizedScope),
        queryFn: async () => (await fetchTransitCurrent(normalizedScope)).data,
      },
      {
        queryKey: platformKeys.history(normalizedScope),
        queryFn: async () => (await fetchPlatformHistory(normalizedScope)).data ?? emptyHistory(),
      },
      {
        queryKey: platformKeys.historyAvailability(normalizedScope),
        queryFn: async () =>
          (await fetchPlatformHistoryAvailability(normalizedScope)).data,
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

  const queryErrors = results
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
