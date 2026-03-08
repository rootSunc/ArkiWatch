export type ApiJsonResult<T> = {
  data: T | null;
  error: string | null;
  status: number | null;
};

export type ApiClientConfig = {
  baseUrl?: string;
  authToken?: string;
  cache?: RequestCache;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

export function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const normalizedValue = (rawValue ?? DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

function buildApiUrl(
  path: string,
  params: Record<string, string | null | undefined> | undefined,
  baseUrl: string,
): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  return url;
}

export async function apiFetchJson<T>(
  path: string,
  config: ApiClientConfig = {},
  params?: Record<string, string | null | undefined>,
): Promise<ApiJsonResult<T>> {
  const baseUrl = normalizeApiBaseUrl(config.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL);
  const url = buildApiUrl(path, params, baseUrl);

  try {
    const response = await fetch(url, {
      cache: config.cache ?? "no-store",
      headers: config.authToken
        ? {
            Authorization: `Bearer ${config.authToken}`,
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

export function createApiClient(config: ApiClientConfig = {}) {
  return {
    get<T>(
      path: string,
      params?: Record<string, string | null | undefined>,
    ): Promise<ApiJsonResult<T>> {
      return apiFetchJson<T>(path, config, params);
    },
  };
}
