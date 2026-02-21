export const SESSION_COOKIE_NAME = "arkiwatch_session";

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
