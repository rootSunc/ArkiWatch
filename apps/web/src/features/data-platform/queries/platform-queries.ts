import type { QueryClient } from "@tanstack/react-query";

import {
  createApiClient,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
  type ApiJsonResult,
  unwrapApiResult,
} from "@/lib/api-client";
import { appEnv } from "@/lib/env";

import { filterPlatformOverviewForCurrentUser } from "../category-access";
import { DEFAULT_CITY, normalizeCityValue } from "../city-scope";
import { normalizeSourceDateValue } from "../time-window";
import { demoFixtureForScope } from "../demo/demo-data";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformHistoryApiResponse,
  PlatformHistoryAvailabilityResponse,
  PlatformHistoryResponse,
  PlatformOverviewResponse,
  PublicDashboardRead,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";
import {
  PLATFORM_QUERY_STALE_TIME_MS,
  platformDataNeedsForDemo,
  platformDataNeedsForView,
  type PlatformDataNeedsOptions,
} from "./platform-data-needs";

export const HISTORY_DAY_COUNT = 7;
export const HISTORY_AVAILABILITY_DAY_COUNT = 90;
export {
  PLATFORM_QUERY_REFETCH_INTERVAL_MS,
  PLATFORM_QUERY_STALE_TIME_MS,
  platformDataNeedsForView,
} from "./platform-data-needs";

export type PlatformQueryScope = {
  city?: string | null;
  date?: string | null;
  userId?: string;
  authToken?: string;
};

export type PlatformFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  publicDashboard: PublicDashboardRead | null;
  weather: WeatherForecastResponse | null;
  airQuality: AirQualityCurrentResponse | null;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  history: PlatformHistoryResponse;
  historyAvailability: PlatformHistoryAvailabilityResponse | null;
  roadRail: RoadRailCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  error: string | null;
};

export const platformKeys = {
  all: ["platform"] as const,
  // These reads are public platform data. Keep the query key independent of
  // the signed-in viewer so anonymous and authenticated views share the same
  // cache entry instead of duplicating identical requests by user id.
  scope: (city: string, date: string | null) =>
    [...platformKeys.all, city, date] as const,
  // Regional endpoints do not accept a city parameter. Keep their cache
  // entries reusable when the user changes the city-scoped view.
  regional: (date: string | null) =>
    [...platformKeys.all, "regional", date] as const,
  overview: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "overview"] as const,
  publicDashboard: (scope: PlatformQueryScope) =>
    [...platformKeys.regional(normalizeSourceDateValue(scope.date)), "public-dashboard"] as const,
  weather: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "weather"] as const,
  airQuality: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "air-quality"] as const,
  energy: (scope: PlatformQueryScope) =>
    [...platformKeys.regional(normalizeSourceDateValue(scope.date)), "energy"] as const,
  householdEnergy: (scope: PlatformQueryScope) =>
    [...platformKeys.regional(normalizeSourceDateValue(scope.date)), "household-energy"] as const,
  roadRail: (scope: PlatformQueryScope) =>
    [...platformKeys.regional(normalizeSourceDateValue(scope.date)), "road-rail"] as const,
  transit: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "transit"] as const,
  history: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "history"] as const,
  historyAvailability: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
    ), "history-availability"] as const,
};

export { normalizeApiBaseUrl };

export function resolvePlatformScope(scope: PlatformQueryScope = {}) {
  const apiBaseUrl = resolveApiBaseUrl();
  const city = normalizeCityValue(scope.city ?? DEFAULT_CITY);
  const date = normalizeSourceDateValue(scope.date);
  const userId = scope.userId ?? appEnv.defaultUserId;

  return { apiBaseUrl, city, date, userId, authToken: scope.authToken };
}

function platformClient(
  scope: ReturnType<typeof resolvePlatformScope>,
  signal?: AbortSignal,
) {
  return createApiClient({
    baseUrl: scope.apiBaseUrl,
    authToken: scope.authToken,
    signal,
  });
}

function demoResult<T>(data: T): ApiJsonResult<T> {
  return { data, error: null, status: 200 };
}

function withOptionalDate(
  date: string | null,
  params: Record<string, string | null | undefined>,
): Record<string, string | null | undefined> {
  if (!date) {
    return params;
  }

  return { ...params, date };
}

function emptyHistory(): PlatformHistoryResponse {
  return {
    weather: [],
    airQuality: [],
    energy: [],
    householdEnergy: [],
    roadRail: [],
    transit: [],
  };
}

export function normalizeHistoryResponse(
  history: PlatformHistoryApiResponse | null,
): PlatformHistoryResponse {
  if (!history) {
    return emptyHistory();
  }

  return {
    weather: history.weather,
    airQuality: history.air_quality,
    energy: history.energy,
    householdEnergy: history.household_energy,
    roadRail: history.road_rail,
    transit: history.transit,
  };
}

export async function fetchPlatformOverview(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).overview);
  }

  const resolved = resolvePlatformScope(scope);
  const result = await platformClient(resolved, signal).get<PlatformOverviewResponse>(
    "/platform/overview",
    withOptionalDate(resolved.date, {
      city: resolved.city,
    }),
  );
  return {
    ...result,
    data: filterPlatformOverviewForCurrentUser(result.data),
  };
}

export async function fetchPublicDashboard(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).publicDashboard);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<PublicDashboardRead>(
    "/public/dashboard",
    withOptionalDate(resolved.date, {}),
  );
}

export async function fetchWeatherForecast(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).weather);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<WeatherForecastResponse>(
    "/weather/forecast",
    withOptionalDate(resolved.date, { city: resolved.city }),
  );
}

export async function fetchAirQualityCurrent(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).airQuality);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<AirQualityCurrentResponse>(
    "/air-quality/current",
    withOptionalDate(resolved.date, { city: resolved.city }),
  );
}

export async function fetchEnergyCurrent(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).energy);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<EnergyCurrentResponse>(
    "/energy/current",
    withOptionalDate(resolved.date, { source: "fingrid" }),
  );
}

export async function fetchHouseholdEnergyCurrent(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).householdEnergy);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<EnergyCurrentResponse>(
    "/energy/current",
    withOptionalDate(resolved.date, { source: "porssisahko" }),
  );
}

export async function fetchRoadRailCurrent(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).roadRail);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<RoadRailCurrentResponse>(
    "/traffic/current",
    withOptionalDate(resolved.date, {}),
  );
}

export async function fetchTransitCurrent(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).transit);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<TransitCurrentResponse>(
    "/transit/current",
    withOptionalDate(resolved.date, { city: resolved.city }),
  );
}

export async function fetchPlatformHistory(scope: PlatformQueryScope, signal?: AbortSignal) {
  if (appEnv.demoMode) {
    const result = demoResult(demoFixtureForScope(scope).history);
    return {
      ...result,
      data: normalizeHistoryResponse(result.data),
    };
  }

  const resolved = resolvePlatformScope(scope);
  const result = await platformClient(resolved, signal).get<PlatformHistoryApiResponse>(
    "/platform/history",
    withOptionalDate(resolved.date, {
      city: resolved.city,
      days: String(HISTORY_DAY_COUNT),
    }),
  );
  return {
    ...result,
    data: normalizeHistoryResponse(result.data),
  };
}

export async function fetchPlatformHistoryAvailability(
  scope: PlatformQueryScope,
  signal?: AbortSignal,
) {
  if (appEnv.demoMode) {
    return demoResult(demoFixtureForScope(scope).historyAvailability);
  }

  const resolved = resolvePlatformScope(scope);
  return platformClient(resolved, signal).get<PlatformHistoryAvailabilityResponse>(
    "/platform/history/availability",
    withOptionalDate(resolved.date, {
      city: resolved.city,
      days: String(HISTORY_AVAILABILITY_DAY_COUNT),
    }),
  );
}

export type PrefetchPlatformHomeOptions = PlatformQueryScope & {
  activeNavKey?: string | null;
} & PlatformDataNeedsOptions;

export async function fetchPlatformHome(
  city: string | null = DEFAULT_CITY,
  date: string | null = null,
  options: {
    authToken?: string;
    userId?: string;
    activeNavKey?: string | null;
    isHistorical?: boolean;
    needsHistoryAvailability?: boolean;
  } = {},
): Promise<PlatformFetchResult> {
  const scope: PlatformQueryScope = {
    city,
    date,
    authToken: options.authToken,
    userId: options.userId,
  };
  const resolved = resolvePlatformScope(scope);
  const needs = appEnv.demoMode
    ? platformDataNeedsForDemo(options.activeNavKey, {
        isHistorical: options.isHistorical ?? Boolean(resolved.date),
        needsHistoryAvailability: options.needsHistoryAvailability,
      })
    : platformDataNeedsForView(options.activeNavKey, {
        isHistorical: options.isHistorical ?? Boolean(resolved.date),
        needsHistoryAvailability: options.needsHistoryAvailability,
      });

  const [overviewResult, publicDashboardResult] = await Promise.all([
    fetchPlatformOverview(scope),
    fetchPublicDashboard(scope),
  ]);

  const [
    weatherResult,
    airQualityResult,
    energyResult,
    householdEnergyResult,
    roadRailResult,
    transitResult,
    historyResult,
    historyAvailabilityResult,
  ] = await Promise.all([
    needs.weather ? fetchWeatherForecast(scope) : Promise.resolve({ data: null, error: null }),
    needs.air ? fetchAirQualityCurrent(scope) : Promise.resolve({ data: null, error: null }),
    needs.energy ? fetchEnergyCurrent(scope) : Promise.resolve({ data: null, error: null }),
    needs.householdEnergy
      ? fetchHouseholdEnergyCurrent(scope)
      : Promise.resolve({ data: null, error: null }),
    needs.roadRail ? fetchRoadRailCurrent(scope) : Promise.resolve({ data: null, error: null }),
    needs.transit ? fetchTransitCurrent(scope) : Promise.resolve({ data: null, error: null }),
    needs.history ? fetchPlatformHistory(scope) : Promise.resolve({ data: null, error: null }),
    needs.historyAvailability
      ? fetchPlatformHistoryAvailability(scope)
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    apiBaseUrl: resolved.apiBaseUrl,
    defaultUserId: resolved.userId,
    overview: overviewResult.data,
    publicDashboard: publicDashboardResult.data,
    weather: weatherResult.data,
    airQuality: airQualityResult.data,
    energy: energyResult.data,
    householdEnergy: householdEnergyResult.data,
    history: historyResult.data ?? emptyHistory(),
    historyAvailability: historyAvailabilityResult.data,
    roadRail: roadRailResult.data,
    transit: transitResult.data,
    error:
      overviewResult.error ??
      publicDashboardResult.error ??
      weatherResult.error ??
      airQualityResult.error ??
      energyResult.error ??
      householdEnergyResult.error ??
      roadRailResult.error ??
      transitResult.error ??
      historyResult.error ??
      historyAvailabilityResult.error,
  };
}

export async function prefetchPlatformHome(
  queryClient: QueryClient,
  scope: PrefetchPlatformHomeOptions,
): Promise<PlatformFetchResult> {
  const resolved = resolvePlatformScope(scope);
  const needs = appEnv.demoMode
    ? platformDataNeedsForDemo(scope.activeNavKey, {
        isHistorical: scope.isHistorical ?? Boolean(resolved.date),
        needsHistoryAvailability: scope.needsHistoryAvailability,
      })
    : platformDataNeedsForView(scope.activeNavKey, {
        isHistorical: scope.isHistorical ?? Boolean(resolved.date),
        needsHistoryAvailability: scope.needsHistoryAvailability,
      });
  const queryScope: PlatformQueryScope = {
    city: scope.city,
    date: scope.date,
    userId: scope.userId,
    authToken: scope.authToken,
  };

  const tasks: Array<Promise<unknown>> = [
    queryClient.prefetchQuery({
      queryKey: platformKeys.overview(queryScope),
      queryFn: async ({ signal }) =>
        unwrapApiResult(await fetchPlatformOverview(queryScope, signal)),
      staleTime: PLATFORM_QUERY_STALE_TIME_MS,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.publicDashboard(queryScope),
      queryFn: async ({ signal }) =>
        unwrapApiResult(await fetchPublicDashboard(queryScope, signal)),
      staleTime: PLATFORM_QUERY_STALE_TIME_MS,
    }),
  ];

  if (needs.weather) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.weather(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchWeatherForecast(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.air) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.airQuality(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchAirQualityCurrent(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.energy) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.energy(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchEnergyCurrent(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.householdEnergy) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.householdEnergy(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchHouseholdEnergyCurrent(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.roadRail) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.roadRail(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchRoadRailCurrent(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.transit) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.transit(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchTransitCurrent(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.history) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.history(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchPlatformHistory(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }
  if (needs.historyAvailability) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: platformKeys.historyAvailability(queryScope),
        queryFn: async ({ signal }) =>
          unwrapApiResult(await fetchPlatformHistoryAvailability(queryScope, signal)),
        staleTime: PLATFORM_QUERY_STALE_TIME_MS,
      }),
    );
  }

  await Promise.all(tasks);

  return {
    apiBaseUrl: resolved.apiBaseUrl,
    defaultUserId: resolved.userId,
    overview: queryClient.getQueryData(platformKeys.overview(queryScope)) ?? null,
    publicDashboard: queryClient.getQueryData(platformKeys.publicDashboard(queryScope)) ?? null,
    weather: queryClient.getQueryData(platformKeys.weather(queryScope)) ?? null,
    airQuality: queryClient.getQueryData(platformKeys.airQuality(queryScope)) ?? null,
    energy: queryClient.getQueryData(platformKeys.energy(queryScope)) ?? null,
    householdEnergy: queryClient.getQueryData(platformKeys.householdEnergy(queryScope)) ?? null,
    history:
      queryClient.getQueryData<PlatformHistoryResponse>(platformKeys.history(queryScope)) ??
      emptyHistory(),
    historyAvailability:
      queryClient.getQueryData(platformKeys.historyAvailability(queryScope)) ?? null,
    roadRail: queryClient.getQueryData(platformKeys.roadRail(queryScope)) ?? null,
    transit: queryClient.getQueryData(platformKeys.transit(queryScope)) ?? null,
    error: null,
  };
}
