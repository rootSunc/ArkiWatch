import { PublicDashboardResponse } from "@/features/home/types";


type DashboardFetchResult = {
  apiBaseUrl: string;
  dashboard: PublicDashboardResponse | null;
  error: string | null;
};


function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}


export async function fetchDashboard(): Promise<DashboardFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const url = new URL(`${apiBaseUrl}/dashboard`);

  try {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        apiBaseUrl,
        dashboard: null,
        error: `Dashboard request failed with ${response.status}.`
      };
    }

    const dashboard = (await response.json()) as PublicDashboardResponse;
    return { apiBaseUrl, dashboard, error: null };
  } catch (error) {
    return {
      apiBaseUrl,
      dashboard: null,
      error: error instanceof Error ? error.message : "Unknown dashboard fetch failure."
    };
  }
}
