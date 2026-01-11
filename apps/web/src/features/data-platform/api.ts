import { appEnv } from "@/lib/env";

import {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformHistoricalSnapshot,
  PlatformHistoryResponse,
  PlatformOverviewResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse
} from "./types";

type PlatformFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  weather: WeatherForecastResponse | null;
  airQuality: AirQualityCurrentResponse | null;
  energy: EnergyCurrentResponse | null;
  history: PlatformHistoryResponse;
  roadRail: RoadRailCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  error: string | null;
};

const HISTORY_DAY_COUNT = 7;
const PLATFORM_TIME_ZONE = "Europe/Helsinki";

function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

async function fetchJson<T>(
  url: URL
): Promise<{ data: T | null; error: string | null; status: number | null }> {
  try {
    const response = await fetch(url, {
      cache: "no-store"
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

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function recentHistoryDates(dayCount = HISTORY_DAY_COUNT): string[] {
  const today = new Date();
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (dayCount - index - 1));
    return localDateKey(date);
  });
}

async function fetchHistory<T>(
  apiBaseUrl: string,
  path: string,
  dates: string[]
): Promise<Array<PlatformHistoricalSnapshot<T>>> {
  const snapshots = await Promise.all(
    dates.map(async (date) => {
      const url = new URL(`${apiBaseUrl}${path}`);
      url.searchParams.set("date", date);
      const result = await fetchJson<T>(url);

      return {
        date,
        data: result.data,
        error: result.error
      };
    })
  );

  return snapshots;
}

export async function fetchPlatformHome(): Promise<PlatformFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const overviewUrl = new URL(`${apiBaseUrl}/platform/overview`);
  const weatherUrl = new URL(`${apiBaseUrl}/weather/forecast`);
  const airQualityUrl = new URL(`${apiBaseUrl}/air-quality/current`);
  const energyUrl = new URL(`${apiBaseUrl}/energy/current`);
  const roadRailUrl = new URL(`${apiBaseUrl}/traffic/current`);
  const transitUrl = new URL(`${apiBaseUrl}/transit/current`);

  if (appEnv.defaultUserId) {
    overviewUrl.searchParams.set("user_id", appEnv.defaultUserId);
  }

  const [overviewResult, weatherResult, airQualityResult, energyResult, roadRailResult, transitResult] =
    await Promise.all([
      fetchJson<PlatformOverviewResponse>(overviewUrl),
      fetchJson<WeatherForecastResponse>(weatherUrl),
      fetchJson<AirQualityCurrentResponse>(airQualityUrl),
      fetchJson<EnergyCurrentResponse>(energyUrl),
      fetchJson<RoadRailCurrentResponse>(roadRailUrl),
      fetchJson<TransitCurrentResponse>(transitUrl)
    ]);
  const historyDates = recentHistoryDates();
  const [weatherHistory, airQualityHistory, energyHistory, roadRailHistory, transitHistory] =
    await Promise.all([
      fetchHistory<WeatherForecastResponse>(apiBaseUrl, "/weather/forecast", historyDates),
      fetchHistory<AirQualityCurrentResponse>(apiBaseUrl, "/air-quality/current", historyDates),
      fetchHistory<EnergyCurrentResponse>(apiBaseUrl, "/energy/current", historyDates),
      fetchHistory<RoadRailCurrentResponse>(apiBaseUrl, "/traffic/current", historyDates),
      fetchHistory<TransitCurrentResponse>(apiBaseUrl, "/transit/current", historyDates)
    ]);

  return {
    apiBaseUrl,
    defaultUserId: appEnv.defaultUserId,
    overview: overviewResult.data,
    weather: weatherResult.data,
    airQuality: airQualityResult.data,
    energy: energyResult.data,
    history: {
      weather: weatherHistory,
      airQuality: airQualityHistory,
      energy: energyHistory,
      roadRail: roadRailHistory,
      transit: transitHistory
    },
    roadRail: roadRailResult.data,
    transit: transitResult.data,
    error:
      overviewResult.error ??
      weatherResult.error ??
      airQualityResult.error ??
      energyResult.error ??
      roadRailResult.error ??
      transitResult.error
  };
}
