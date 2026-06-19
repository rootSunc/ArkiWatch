import type { DashboardSource, PlatformCategory } from "./types";

const NON_CONNECTED_STATUSES = new Set(["inactive", "pending", "unknown"]);

export function isConnectedWorkspaceSource(source: Pick<DashboardSource, "stage" | "operational_status">): boolean {
  return source.stage === "connected" && !NON_CONNECTED_STATUSES.has(source.operational_status.toLowerCase());
}

export function isCatalogOnlyWorkspace(category: Pick<PlatformCategory, "stage" | "sources">): boolean {
  if (category.stage !== "background" && category.stage !== "planned") {
    return false;
  }

  return !category.sources.some(isConnectedWorkspaceSource);
}

export function hasObservedSourceRecords(
  sources: Array<Pick<DashboardSource, "records_ingested">>,
): boolean {
  return sources.some((source) => source.records_ingested !== null);
}
