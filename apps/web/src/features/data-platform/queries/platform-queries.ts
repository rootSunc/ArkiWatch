import type { QueryClient } from "@tanstack/react-query";

import { appEnv } from "@/lib/env";

import { filterPlatformOverviewForCurrentUser } from "../category-access";
import { DEFAULT_CITY, normalizeCityValue } from "../city-scope";
import { normalizeSourceDateValue } from "../time-window";
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

export const HISTORY_DAY_COUNT = 7;
export const HISTORY_AVAILABILITY_DAY_COUNT = 90;

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
  scope: (city: string, date: string | null, userId: string) =>
    [...platformKeys.all, city, date, userId] as const,
  overview: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "overview"] as const,
  publicDashboard: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "public-dashboard"] as const,
  weather: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "weather"] as const,
  airQuality: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "air-quality"] as const,
  energy: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "energy"] as const,
  householdEnergy: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "household-energy"] as const,
  roadRail: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "road-rail"] as const,
  transit: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "transit"] as const,
  history: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "history"] as const,
  historyAvailability: (scope: PlatformQueryScope) =>
    [...platformKeys.scope(
      normalizeCityValue(scope.city),
      normalizeSourceDateValue(scope.date),
      scope.userId ?? appEnv.defaultUserId,
    ), "history-availability"] as const,
};

export function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

export function resolvePlatformScope(scope: PlatformQueryScope = {}) {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const city = normalizeCityValue(scope.city ?? DEFAULT_CITY);
  const date = normalizeSourceDateValue(scope.date);
  const userId = scope.userId ?? appEnv.defaultUserId;

  return { apiBaseUrl, city, date, userId, authToken: scope.authToken };
}

type FetchJsonResult<T> = {
  data: T | null;
  error: string | null;
  status: number | null;
};

export async function fetchJson<T>(
  url: URL,
  authToken?: string,
): Promise<FetchJsonResult<T>> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: authToken
        ? {
            Authorization: `Bearer ${authToken}`,
          }
        : undefined,
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Platform request failed with ${response.status}.`,
        status: response.status,
      };
    }

    return { data: (await response.json()) as T, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown fetch failure.",
      status: null,
    };
  }
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

function applyDateParam(urls: URL[], date: string | null): void {
  if (!date) {
    return;
  }

  for (const url of urls) {
    url.searchParams.set("date", date);
  }
}

function buildPlatformUrls(scope: ReturnType<typeof resolvePlatformScope>) {
  const { apiBaseUrl, city, date, userId } = scope;
  const overviewUrl = new URL(`${apiBaseUrl}/platform/overview`);
  const weatherUrl = new URL(`${apiBaseUrl}/weather/forecast`);
  const airQualityUrl = new URL(`${apiBaseUrl}/air-quality/current`);
  const energyUrl = new URL(`${apiBaseUrl}/energy/current`);
  const householdEnergyUrl = new URL(`${apiBaseUrl}/energy/current`);
  const roadRailUrl = new URL(`${apiBaseUrl}/traffic/current`);
  const transitUrl = new URL(`${apiBaseUrl}/transit/current`);
  const historyUrl = new URL(`${apiBaseUrl}/platform/history`);
  const historyAvailabilityUrl = new URL(`${apiBaseUrl}/platform/history/availability`);
  const publicDashboardUrl = new URL(`${apiBaseUrl}/public/dashboard`);

  if (userId) {
    overviewUrl.searchParams.set("user_id", userId);
  }
  overviewUrl.searchParams.set("city", city);
  weatherUrl.searchParams.set("city", city);
  airQualityUrl.searchParams.set("city", city);
  historyUrl.searchParams.set("city", city);
  historyUrl.searchParams.set("days", String(HISTORY_DAY_COUNT));
  historyAvailabilityUrl.searchParams.set("city", city);
  historyAvailabilityUrl.searchParams.set("days", String(HISTORY_AVAILABILITY_DAY_COUNT));
  energyUrl.searchParams.set("source", "fingrid");
  householdEnergyUrl.searchParams.set("source", "porssisahko");
  transitUrl.searchParams.set("city", city);

  applyDateParam(
    [
      overviewUrl,
      weatherUrl,
      airQualityUrl,
      energyUrl,
      householdEnergyUrl,
      roadRailUrl,
      transitUrl,
      historyUrl,
      historyAvailabilityUrl,
    ],
    date,
  );

  return {
    overviewUrl,
    weatherUrl,
    airQualityUrl,
    energyUrl,
    householdEnergyUrl,
    roadRailUrl,
    transitUrl,
    historyUrl,
    historyAvailabilityUrl,
    publicDashboardUrl,
  };
}

export async function fetchPlatformOverview(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { overviewUrl } = buildPlatformUrls(resolved);
  const result = await fetchJson<PlatformOverviewResponse>(
    overviewUrl,
    resolved.authToken,
  );
  return {
    ...result,
    data: filterPlatformOverviewForCurrentUser(result.data),
  };
}

export async function fetchPublicDashboard(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { publicDashboardUrl } = buildPlatformUrls(resolved);
  return fetchJson<PublicDashboardRead>(publicDashboardUrl, resolved.authToken);
}

export async function fetchWeatherForecast(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { weatherUrl } = buildPlatformUrls(resolved);
  return fetchJson<WeatherForecastResponse>(weatherUrl, resolved.authToken);
}

export async function fetchAirQualityCurrent(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { airQualityUrl } = buildPlatformUrls(resolved);
  return fetchJson<AirQualityCurrentResponse>(airQualityUrl, resolved.authToken);
}

export async function fetchEnergyCurrent(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { energyUrl } = buildPlatformUrls(resolved);
  return fetchJson<EnergyCurrentResponse>(energyUrl, resolved.authToken);
}

export async function fetchHouseholdEnergyCurrent(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { householdEnergyUrl } = buildPlatformUrls(resolved);
  return fetchJson<EnergyCurrentResponse>(householdEnergyUrl, resolved.authToken);
}

export async function fetchRoadRailCurrent(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { roadRailUrl } = buildPlatformUrls(resolved);
  return fetchJson<RoadRailCurrentResponse>(roadRailUrl, resolved.authToken);
}

export async function fetchTransitCurrent(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { transitUrl } = buildPlatformUrls(resolved);
  return fetchJson<TransitCurrentResponse>(transitUrl, resolved.authToken);
}

export async function fetchPlatformHistory(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { historyUrl } = buildPlatformUrls(resolved);
  const result = await fetchJson<PlatformHistoryApiResponse>(historyUrl, resolved.authToken);
  return {
    ...result,
    data: normalizeHistoryResponse(result.data),
  };
}

export async function fetchPlatformHistoryAvailability(scope: PlatformQueryScope) {
  const resolved = resolvePlatformScope(scope);
  const { historyAvailabilityUrl } = buildPlatformUrls(resolved);
  return fetchJson<PlatformHistoryAvailabilityResponse>(
    historyAvailabilityUrl,
    resolved.authToken,
  );
}

export async function fetchPlatformHome(
  city: string | null = DEFAULT_CITY,
  date: string | null = null,
  options: { authToken?: string; userId?: string } = {},
): Promise<PlatformFetchResult> {
  const scope: PlatformQueryScope = {
    city,
    date,
    authToken: options.authToken,
    userId: options.userId,
  };
  const resolved = resolvePlatformScope(scope);

  const [
    overviewResult,
    publicDashboardResult,
    weatherResult,
    airQualityResult,
    energyResult,
    householdEnergyResult,
    roadRailResult,
    transitResult,
    historyResult,
    historyAvailabilityResult,
  ] = await Promise.all([
    fetchPlatformOverview(scope),
    fetchPublicDashboard(scope),
    fetchWeatherForecast(scope),
    fetchAirQualityCurrent(scope),
    fetchEnergyCurrent(scope),
    fetchHouseholdEnergyCurrent(scope),
    fetchRoadRailCurrent(scope),
    fetchTransitCurrent(scope),
    fetchPlatformHistory(scope),
    fetchPlatformHistoryAvailability(scope),
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
  scope: PlatformQueryScope,
): Promise<PlatformFetchResult> {
  const resolved = resolvePlatformScope(scope);

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: platformKeys.overview(scope),
      queryFn: async () => (await fetchPlatformOverview(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.publicDashboard(scope),
      queryFn: async () => (await fetchPublicDashboard(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.weather(scope),
      queryFn: async () => (await fetchWeatherForecast(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.airQuality(scope),
      queryFn: async () => (await fetchAirQualityCurrent(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.energy(scope),
      queryFn: async () => (await fetchEnergyCurrent(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.householdEnergy(scope),
      queryFn: async () => (await fetchHouseholdEnergyCurrent(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.roadRail(scope),
      queryFn: async () => (await fetchRoadRailCurrent(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.transit(scope),
      queryFn: async () => (await fetchTransitCurrent(scope)).data,
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.history(scope),
      queryFn: async () => (await fetchPlatformHistory(scope)).data ?? emptyHistory(),
    }),
    queryClient.prefetchQuery({
      queryKey: platformKeys.historyAvailability(scope),
      queryFn: async () => (await fetchPlatformHistoryAvailability(scope)).data,
    }),
  ]);

  return {
    apiBaseUrl: resolved.apiBaseUrl,
    defaultUserId: resolved.userId,
    overview: queryClient.getQueryData(platformKeys.overview(scope)) ?? null,
    publicDashboard: queryClient.getQueryData(platformKeys.publicDashboard(scope)) ?? null,
    weather: queryClient.getQueryData(platformKeys.weather(scope)) ?? null,
    airQuality: queryClient.getQueryData(platformKeys.airQuality(scope)) ?? null,
    energy: queryClient.getQueryData(platformKeys.energy(scope)) ?? null,
    householdEnergy: queryClient.getQueryData(platformKeys.householdEnergy(scope)) ?? null,
    history:
      queryClient.getQueryData<PlatformHistoryResponse>(platformKeys.history(scope)) ??
      emptyHistory(),
    historyAvailability:
      queryClient.getQueryData(platformKeys.historyAvailability(scope)) ?? null,
    roadRail: queryClient.getQueryData(platformKeys.roadRail(scope)) ?? null,
    transit: queryClient.getQueryData(platformKeys.transit(scope)) ?? null,
    error: null,
  };
}
