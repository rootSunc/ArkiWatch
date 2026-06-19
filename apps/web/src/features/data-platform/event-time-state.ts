export type ScopedEventState = "active" | "upcoming" | "ended";

/**
 * Classify an event against the response's reference time rather than the
 * browser's current clock. Historical responses are evaluated at the selected
 * snapshot boundary, while live responses use the server observation time.
 */
export function scopedEventState(
  active: boolean,
  startsAt: string | null | undefined,
  referenceTimestamp: number,
): ScopedEventState {
  if (active) {
    return "active";
  }

  const startTimestamp = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (Number.isFinite(startTimestamp) && startTimestamp > referenceTimestamp) {
    return "upcoming";
  }

  return "ended";
}
