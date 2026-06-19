import type { DashboardTone } from "./data-platform-shell";
import type { LanguageMode } from "./i18n";
import { translateMessageKey } from "./i18n";
import { isCatalogCategoryKey } from "./data-platform-nav-utils";
import { healthySourceCount, isCatalogOnlySource, isSourceTrackedForHealth } from "./source-health";
import { isEmptyStatus } from "./platform-status";
import { isHistoricalTimeScope, scopedDataTimestamp } from "./data-time-scope";
import type {
  DashboardSource,
  PlatformCategory,
  PlatformEvent,
  PlatformOverviewResponse,
} from "./types";

export type SignalSystemTile = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: DashboardTone;
  icon: string;
  valueStyle?: "emphasis" | "body";
};

function severeEventCount(events: PlatformEvent[]): number {
  return events.filter((event) => ["HIGH", "CRITICAL"].includes(event.severity.toUpperCase())).length;
}

export function buildSignalSystemTiles({
  overview,
  categories,
  sources,
  recentEvents,
  language,
  timezone,
}: {
  overview: PlatformOverviewResponse | null;
  categories: PlatformCategory[];
  sources: DashboardSource[];
  recentEvents: PlatformEvent[];
  language: LanguageMode;
  timezone?: string;
}): SignalSystemTile[] {

  const trackedSources = sources.filter(isSourceTrackedForHealth);
  const catalogSourceCount = sources.filter(isCatalogOnlySource).length;
  const healthySources = healthySourceCount(sources);
  const issueSources = Math.max(0, trackedSources.length - healthySources);
  const severeEvents = severeEventCount(recentEvents);
  const catalogCategoryCount = categories.filter((category) =>
    isCatalogCategoryKey(category.key),
  ).length;
  const availableCoreCategories = categories.filter(
    (category) => !isCatalogCategoryKey(category.key) && !isEmptyStatus(category.status),
  ).length;
  const isHistorical = isHistoricalTimeScope(overview?.time_scope);

  return [
    {
      key: "signal_categories",
      label: translateMessageKey(language, "shell.signalCategories"),
      value: String(categories.length),
      detail: `${availableCoreCategories} ${translateMessageKey(language, isHistorical ? "shell.captured" : "shell.active")} · ${catalogCategoryCount} ${translateMessageKey(language, "shell.catalog")}`,
      tone: availableCoreCategories > 0 ? "good" : "neutral",
      icon: "hub",
      valueStyle: "emphasis",
    },
    {
      key: "recent_events",
      // The source list includes upcoming decision moments as well as events
      // that are active at the snapshot time. Say what the number actually
      // represents instead of implying every item is active right now.
      label: translateMessageKey(language, "shell.recentEvents"),
      value: String(recentEvents.length),
      detail:
        severeEvents > 0
          ? `${severeEvents} ${translateMessageKey(language, "shell.highSeverity")}`
          : translateMessageKey(language, "shell.normalizedEventStream"),
      tone: severeEvents > 0 ? "bad" : recentEvents.length > 0 ? "warn" : "good",
      icon: "notifications",
      valueStyle: "emphasis",
    },
    {
      key: "source_health",
      label: translateMessageKey(language, "shell.sourceHealth"),
      value: trackedSources.length > 0 ? `${healthySources}/${trackedSources.length}` : translateMessageKey(language, "shell.na"),
      detail:
        issueSources > 0
          ? `${issueSources} ${translateMessageKey(language, "shell.sourcesNeedAttention")}`
          : catalogSourceCount > 0
            ? `${catalogSourceCount} ${translateMessageKey(language, "shell.catalogOnlySources")}`
          : translateMessageKey(language, "shell.noSourceIssuesDetected"),
      tone: issueSources > 0 ? "warn" : trackedSources.length > 0 ? "good" : "neutral",
      icon: "database",
      valueStyle: "emphasis",
    },
    {
      key: "last_platform_check",
      label: translateMessageKey(language, "shell.lastPlatformCheck"),
      value: scopedDataTimestamp(
        overview?.checked_at ?? null,
        overview?.time_scope,
        language,
        (key) => translateMessageKey(language, key),
        "shell.notCollected",
        timezone ?? overview?.time_scope?.timezone ?? overview?.timezone,
      ),
      detail: overview?.coverage_area ?? translateMessageKey(language, "shell.regionalScope"),
      tone: overview ? "good" : "neutral",
      icon: "schedule",
      valueStyle: "body",
    },
  ];
}
