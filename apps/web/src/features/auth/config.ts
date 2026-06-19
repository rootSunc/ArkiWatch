export const SESSION_COOKIE_NAME = "arkiwatch_session";
/** Keep server-side personal proxy calls from holding a request indefinitely. */
export const SERVER_API_TIMEOUT_MS = 8000;
/** AI streams need more time than ordinary reads, but must not hang forever. */
export const SERVER_ASSISTANT_TIMEOUT_MS = 45_000;

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  locale: string;
  timezone: string;
  status: string;
};

export type AuthSession = {
  token: string;
  user: SessionUser;
};

export function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

export function resolveServerApiBaseUrl(): string {
  return normalizeApiBaseUrl(
    process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
  );
}
