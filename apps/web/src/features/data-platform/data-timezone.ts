export const DEFAULT_DATA_TIME_ZONE = "Europe/Helsinki";

/**
 * Every public-data surface reads the timezone the payload declares.
 * An invalid deployment value falls back to Finland's default rather than
 * letting a raw Intl.DateTimeFormat call throw inside a workspace.
 */
export function resolveDataTimezone(timezone?: string | null): string {
  const candidate = timezone?.trim();
  if (!candidate) {
    return DEFAULT_DATA_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_DATA_TIME_ZONE;
  }
}
