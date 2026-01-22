import { appEnv } from "@/lib/env";

import { filterPlatformOverviewForCurrentUser } from "./category-access";
import {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformHistoryApiResponse,
  PlatformHistoryResponse,
  PlatformOverviewResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse
} from "./types";
import { DEFAULT_CITY, normalizeCityValue } from "./city-scope";
import { normalizeSourceDateValue } from "./time-window";

export type PlatformFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  weather: WeatherForecastResponse | null;
  airQuality: AirQualityCurrentResponse | null;
  energy: EnergyCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  history: PlatformHistoryResponse;
  roadRail: RoadRailCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  error: string | null;
};

type PlatformFetchOptions = {
  authToken?: string;
  userId?: string;
};

const HISTORY_DAY_COUNT = 7;

function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

async function fetchJson<T>(
  url: URL,
  authToken?: string
): Promise<{ data: T | null; error: string | null; status: number | null }> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: authToken
        ? {
            Authorization: `Bearer ${authToken}`
          }
        : undefined
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Platform request failed with ${response.status}.`,
        status: response.status
      };
    }

    return { data: (await response.json()) as T, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown fetch failure.",
      status: null
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
    transit: []
  };
}

function normalizeHistoryResponse(
  history: PlatformHistoryApiResponse | null
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
    transit: history.transit
  };
}

export async function fetchPlatformHome(
  city: string | null = DEFAULT_CITY,
  date: string | null = null,
  options: PlatformFetchOptions = {}
): Promise<PlatformFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const selectedCity = normalizeCityValue(city);
  const selectedDate = normalizeSourceDateValue(date);
  const userId = options.userId ?? appEnv.defaultUserId;
  const overviewUrl = new URL(`${apiBaseUrl}/platform/overview`);
  const weatherUrl = new URL(`${apiBaseUrl}/weather/forecast`);
  const airQualityUrl = new URL(`${apiBaseUrl}/air-quality/current`);
  const energyUrl = new URL(`${apiBaseUrl}/energy/current`);
  const householdEnergyUrl = new URL(`${apiBaseUrl}/energy/current`);
  const roadRailUrl = new URL(`${apiBaseUrl}/traffic/current`);
  const transitUrl = new URL(`${apiBaseUrl}/transit/current`);
  const historyUrl = new URL(`${apiBaseUrl}/platform/history`);

  if (userId) {
    overviewUrl.searchParams.set("user_id", userId);
  }
  overviewUrl.searchParams.set("city", selectedCity);
  weatherUrl.searchParams.set("city", selectedCity);
  airQualityUrl.searchParams.set("city", selectedCity);
  historyUrl.searchParams.set("city", selectedCity);
  historyUrl.searchParams.set("days", String(HISTORY_DAY_COUNT));
  energyUrl.searchParams.set("source", "fingrid");
  householdEnergyUrl.searchParams.set("source", "porssisahko");
  transitUrl.searchParams.set("city", selectedCity);

  if (selectedDate) {
    const dateUrls = [overviewUrl, weatherUrl, airQualityUrl, energyUrl, householdEnergyUrl, roadRailUrl, transitUrl, historyUrl];
    for (const url of dateUrls) {
      url.searchParams.set("date", selectedDate);
    }
  }

  const [overviewResult, weatherResult, airQualityResult, energyResult, householdEnergyResult, roadRailResult, transitResult, historyResult] =
    await Promise.all([
      fetchJson<PlatformOverviewResponse>(overviewUrl, options.authToken),
      fetchJson<WeatherForecastResponse>(weatherUrl, options.authToken),
      fetchJson<AirQualityCurrentResponse>(airQualityUrl, options.authToken),
      fetchJson<EnergyCurrentResponse>(energyUrl, options.authToken),
      fetchJson<EnergyCurrentResponse>(householdEnergyUrl, options.authToken),
      fetchJson<RoadRailCurrentResponse>(roadRailUrl, options.authToken),
      fetchJson<TransitCurrentResponse>(transitUrl, options.authToken),
      fetchJson<PlatformHistoryApiResponse>(historyUrl, options.authToken)
    ]);

  return {
    apiBaseUrl,
    defaultUserId: userId,
    overview: filterPlatformOverviewForCurrentUser(overviewResult.data),
    weather: weatherResult.data,
    airQuality: airQualityResult.data,
    energy: energyResult.data,
    householdEnergy: householdEnergyResult.data,
    history: normalizeHistoryResponse(historyResult.data),
    roadRail: roadRailResult.data,
    transit: transitResult.data,
    error:
      overviewResult.error ??
      weatherResult.error ??
      airQualityResult.error ??
      energyResult.error ??
      householdEnergyResult.error ??
      roadRailResult.error ??
      transitResult.error ??
      historyResult.error
  };
}
