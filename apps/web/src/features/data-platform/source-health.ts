import type { DashboardSource } from "./types";

export type SourceHealthTone = "healthy" | "watch" | "failing" | "unknown";

/**
 * Source statuses are extensible API values. Keep the UI class names stable by
 * mapping operational states to the small set of visual tones supported by the
 * design system.
 */
export function sourceHealthTone(status: string | null | undefined): SourceHealthTone {
  switch (status?.toLowerCase()) {
    case "healthy":
    case "ready":
    case "connected":
    case "fetched":
      return "healthy";
    case "pending":
    case "stale":
    case "watch":
      return "watch";
    case "failing":
    case "failed":
    case "error":
    case "inactive":
    case "alert":
      return "failing";
    default:
      return "unknown";
  }
}

export function isSourceHealthy(source: Pick<DashboardSource, "operational_status">): boolean {
  return sourceHealthTone(source.operational_status) === "healthy";
}

export function healthySourceCount(
  sources: Array<Pick<DashboardSource, "operational_status">>,
): number {
  return sources.filter(isSourceHealthy).length;
}
