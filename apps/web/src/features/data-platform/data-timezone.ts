export const DEFAULT_DATA_TIME_ZONE = "Europe/Helsinki";

/**
 * Keep all public-data surfaces on the timezone declared by the payload.
 * Invalid deployment values fall back to Finland's default instead of
 * allowing a direct Intl.DateTimeFormat call to break a workspace.
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
