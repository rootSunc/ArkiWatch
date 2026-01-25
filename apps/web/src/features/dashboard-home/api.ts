import { PersonalDashboardResponse } from "@/features/personal-assistant/types";
import { PublicDashboardResponse } from "@/features/public-dashboard/types";
import { appEnv } from "@/lib/env";


type DashboardFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  personalDashboard: PersonalDashboardResponse | null;
  personalError: string | null;
  publicDashboard: PublicDashboardResponse | null;
  publicError: string | null;
};


function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}


async function fetchJson<T>(url: URL): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      return { data: null, error: `Dashboard request failed with ${response.status}.` };
    }

    return { data: (await response.json()) as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Unknown fetch failure." };
  }
}


export async function fetchDashboardHome(): Promise<DashboardFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const publicUrl = new URL(`${apiBaseUrl}/public/dashboard`);
  const personalUrl = new URL(`${apiBaseUrl}/personal/dashboard`);

  if (appEnv.defaultUserId) {
    personalUrl.searchParams.set("user_id", appEnv.defaultUserId);
  }

  const [publicResult, personalResult] = await Promise.all([
    fetchJson<PublicDashboardResponse>(publicUrl),
    fetchJson<PersonalDashboardResponse>(personalUrl)
  ]);

  return {
    apiBaseUrl,
    defaultUserId: appEnv.defaultUserId,
    personalDashboard: personalResult.data,
    personalError: personalResult.error,
    publicDashboard: publicResult.data,
    publicError: publicResult.error
  };
}
