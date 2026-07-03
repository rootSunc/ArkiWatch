import { requestSignalWithTimeout } from "./request-signal";
import { runtimeApiBaseUrl } from "./runtime-config";

export type ApiJsonResult<T> = {
  data: T | null;
  error: string | null;
  status: number | null;
};

/**
 * Convert the transport-level result into a query value.
 *
 * React Query only sees the resolved value from a query function. Returning a
 * nullable `data` field there would turn an HTTP/API failure into a successful
 * query with an empty UI, so every required platform read should use this
 * boundary before it enters the cache.
 */
export function unwrapApiResult<T>(result: ApiJsonResult<T>): T {
  if (result.error) {
    throw new Error(result.error);
  }

  if (result.data === null || result.data === undefined) {
    throw new Error("API response did not include data.");
  }

  return result.data;
}

export type ApiClientConfig = {
  baseUrl?: string;
  authToken?: string;
  cache?: RequestCache;
  /** Optional caller-owned signal, e.g. the signal supplied by TanStack Query. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

/** A slow upstream must fail visibly rather than leave the UI spinning forever. */
export const DEFAULT_API_TIMEOUT_MS = 8000;

export const API_TIMEOUT_ERROR =
  "Platform request timed out. The data source is not responding.";

export function apiTransportErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error as { name?: unknown };
    if (name === "TimeoutError" || name === "AbortError") {
      return API_TIMEOUT_ERROR;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

const MAX_API_ERROR_DETAIL_LENGTH = 240;

type ApiErrorPayload = {
  detail?: unknown;
  message?: unknown;
};

function errorDetail(payload: ApiErrorPayload | null): string | null {
  const detail = payload?.detail ?? payload?.message;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (typeof item === "object" && item !== null) {
          const record = item as { msg?: unknown; message?: unknown };
          const message = record.msg ?? record.message;
          return typeof message === "string" ? message.trim() : "";
        }

        return "";
      })
      .filter(Boolean);

    return messages.length > 0 ? messages.join("; ") : null;
  }

  return null;
}

async function apiErrorMessage(response: Response): Promise<string> {
  const fallback = `Platform request failed with ${response.status}.`;
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const detail = errorDetail(payload);

  if (!detail) {
    return fallback;
  }

  const boundedDetail = detail.slice(0, MAX_API_ERROR_DETAIL_LENGTH);
  return `${fallback} ${boundedDetail}`;
}

export function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const normalizedValue = (rawValue ?? DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

/**
 * Resolve the browser API URL from runtime configuration when available.
 * NEXT_PUBLIC_* values are build-time constants in Next.js, so production
 * containers inject this value from the server-rendered runtime config.
 */
export function resolveApiBaseUrl(): string {
  const runtimeValue = runtimeApiBaseUrl();
  const serverValue =
    typeof window === "undefined" ? process.env.API_INTERNAL_BASE_URL : undefined;
  return normalizeApiBaseUrl(
    runtimeValue ?? serverValue ?? process.env.NEXT_PUBLIC_API_BASE_URL,
  );
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
  const baseUrl = resolveApiBaseUrlFromConfig(config.baseUrl);
  const url = buildApiUrl(path, params, baseUrl);
  const signal = config.signal
    ? requestSignalWithTimeout(config.signal, config.timeoutMs ?? DEFAULT_API_TIMEOUT_MS)
    : AbortSignal.timeout(config.timeoutMs ?? DEFAULT_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: config.cache ?? "no-store",
      headers: config.authToken
        ? {
            Authorization: `Bearer ${config.authToken}`,
          }
        : undefined,
      signal,
    });

    if (!response.ok) {
      return {
        data: null,
        error: await apiErrorMessage(response),
        status: response.status,
      };
    }

    return { data: (await response.json()) as T, error: null, status: response.status };
  } catch (error) {
    // Let query cancellation reach TanStack Query instead of turning an
    // intentionally aborted request into a visible data-source error.
    if (config.signal?.aborted) {
      throw error;
    }

    return {
      data: null,
      error: apiTransportErrorMessage(error, "Unknown fetch failure."),
      status: null,
    };
  }
}

function resolveApiBaseUrlFromConfig(configuredValue: string | undefined): string {
  return configuredValue === undefined
    ? resolveApiBaseUrl()
    : normalizeApiBaseUrl(configuredValue);
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
