export type ScopedEventState = "active" | "upcoming" | "ended";

/** Compare event validity with the viewed snapshot, never the browser clock. */
export function eventStateAt(
  event: { starts_at: string; ends_at: string; state?: string },
  referenceAt: string,
): ScopedEventState | "unknown" {
  const reference = Date.parse(referenceAt);
  const start = Date.parse(event.starts_at);
  const end = Date.parse(event.ends_at);
  if (
    Number.isFinite(reference) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start
  ) {
    if (reference < start) return "upcoming";
    return reference < end ? "active" : "ended";
  }
  return ["active", "upcoming", "ended"].includes(event.state ?? "")
    ? (event.state as ScopedEventState)
    : "unknown";
}
