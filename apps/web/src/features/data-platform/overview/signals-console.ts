import type { DashboardTone } from "../shell/data-platform-shell";
import type { LanguageMode } from "../i18n";
import { translateMessageKey } from "../i18n";
import { isCatalogCategoryKey } from "../shell/data-platform-nav-utils";
import { isEmptyStatus } from "../model/platform-status";
import { isHistoricalTimeScope } from "../model/data-time-scope";
import type {
  BriefingDecision,
  DashboardSource,
  PlatformCategory,
  PlatformEvent,
  PlatformOverviewResponse,
} from "../types";

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
  recentEvents,
  language,
  sourceHealth,
}: {
  overview: PlatformOverviewResponse | null;
  categories: PlatformCategory[];
  sources: DashboardSource[];
  recentEvents: PlatformEvent[];
  language: LanguageMode;
  sourceHealth?: BriefingDecision["source_health"];
}): SignalSystemTile[] {

  const trackedSourceCount = sourceHealth?.tracked ?? 0;
  const catalogSourceCount = sourceHealth?.catalog ?? 0;
  const healthySources = sourceHealth?.healthy ?? 0;
  const issueSources = sourceHealth?.issues ?? 0;
  const severeEvents = severeEventCount(recentEvents);
  const catalogCategoryCount = categories.filter((category) =>
    isCatalogCategoryKey(category.key),
  ).length;
  const availableCoreCategories = categories.filter(
    (category) => !isCatalogCategoryKey(category.key) && !isEmptyStatus(category.status),
  ).length;
  const unavailableCoreCategories = categories.filter(
    (category) => !isCatalogCategoryKey(category.key) && isEmptyStatus(category.status),
  ).length;
  const isHistorical = isHistoricalTimeScope(overview?.time_scope);

  return [
    {
      key: "signal_categories",
      label: translateMessageKey(language, "shell.signalCategories"),
      value: String(categories.length),
      detail: `${availableCoreCategories} ${translateMessageKey(language, isHistorical ? "shell.captured" : "shell.active")}, ${unavailableCoreCategories} ${translateMessageKey(language, "shell.empty")}, ${catalogCategoryCount} ${translateMessageKey(language, "shell.catalog")}`,
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
        tone: severeEvents > 0 ? "warn" : recentEvents.length > 0 ? "warn" : "good",
      icon: "notifications",
      valueStyle: "emphasis",
    },
    {
      key: "source_health",
      label: translateMessageKey(language, "shell.sourceHealth"),
      value: trackedSourceCount > 0 ? `${healthySources}/${trackedSourceCount}` : translateMessageKey(language, "shell.na"),
      detail:
        issueSources > 0
          ? `${issueSources} ${translateMessageKey(language, "shell.sourcesNeedAttention")}`
          : catalogSourceCount > 0
            ? `${catalogSourceCount} ${translateMessageKey(language, "shell.catalogOnlySources")}`
          : translateMessageKey(language, "shell.noSourceIssuesDetected"),
      tone: issueSources > 0 ? "warn" : trackedSourceCount > 0 ? "good" : "neutral",
      icon: "database",
      valueStyle: "emphasis",
    },
  ];
}
