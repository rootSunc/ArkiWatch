import type { DashboardSource } from "./types";

type SourceHealthSource = Pick<DashboardSource, "operational_status"> &
  Partial<Pick<DashboardSource, "id" | "stage" | "records_ingested">>;

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

export function isCatalogOnlySource(source: SourceHealthSource): boolean {
  return source.id?.startsWith("catalog-") === true && source.records_ingested === null;
}

export function isSourceTrackedForHealth(source: SourceHealthSource): boolean {
  return !isCatalogOnlySource(source);
}

export function isSourceHealthy(source: SourceHealthSource): boolean {
  return sourceHealthTone(source.operational_status) === "healthy";
}

export function healthySourceCount(
  sources: SourceHealthSource[],
): number {
  return sources.filter(isSourceTrackedForHealth).filter(isSourceHealthy).length;
}

export function sourceIssueCount(
  sources: SourceHealthSource[],
): number {
  return sources.filter(isSourceTrackedForHealth).filter((source) => !isSourceHealthy(source)).length;
}

/**
 * Operational health belongs to the live pipeline. Historical views describe
 * evidence from a selected day, so pending catalog entries must not surface as
 * a present-day incident in the Today workspace.
 */
export function sourceIssueCountForScope(
  sources: SourceHealthSource[],
  isHistorical: boolean,
): number {
  return isHistorical ? 0 : sourceIssueCount(sources);
}
