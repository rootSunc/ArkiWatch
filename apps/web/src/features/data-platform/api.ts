import { appEnv } from "@/lib/env";

import { PlatformOverviewResponse, WeatherForecastResponse } from "./types";

type PlatformFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  weather: WeatherForecastResponse | null;
  error: string | null;
};

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

export async function fetchPlatformHome(): Promise<PlatformFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const overviewUrl = new URL(`${apiBaseUrl}/platform/overview`);
  const weatherUrl = new URL(`${apiBaseUrl}/weather/forecast`);

  if (appEnv.defaultUserId) {
    overviewUrl.searchParams.set("user_id", appEnv.defaultUserId);
  }

  const [overviewResult, weatherResult] = await Promise.all([
    fetchJson<PlatformOverviewResponse>(overviewUrl),
    fetchJson<WeatherForecastResponse>(weatherUrl)
  ]);

  return {
    apiBaseUrl,
    defaultUserId: appEnv.defaultUserId,
    overview: overviewResult.data,
    weather: weatherResult.data,
    error: overviewResult.error ?? weatherResult.error
  };
}
