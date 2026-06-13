import { formatTimestamp } from "@/features/shared/format";

import type { DashboardTone } from "./data-platform-shell";
import type { LanguageMode } from "./i18n";
import { translateMessageKey } from "./i18n";
import { isCatalogCategoryKey } from "./data-platform-nav-utils";
import { healthySourceCount } from "./source-health";
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

  const healthySources = healthySourceCount(sources);
  const issueSources = Math.max(0, sources.length - healthySources);
  const severeEvents = severeEventCount(recentEvents);
  const catalogCategoryCount = categories.filter((category) =>
    isCatalogCategoryKey(category.key),
  ).length;
  const connectedCoreCategories = categories.filter(
    (category) =>
      !isCatalogCategoryKey(category.key) &&
      (category.stage === "connected" || category.status === "connected"),
  ).length;

  return [
    {
      key: "signal_categories",
      label: translateMessageKey(language, "shell.signalCategories"),
      value: String(categories.length),
      detail: `${connectedCoreCategories} ${translateMessageKey(language, "shell.active")} · ${catalogCategoryCount} ${translateMessageKey(language, "shell.catalog")}`,
      tone: categories.length > 0 ? "good" : "neutral",
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
      value: sources.length > 0 ? `${healthySources}/${sources.length}` : translateMessageKey(language, "shell.na"),
      detail:
        issueSources > 0
          ? `${issueSources} ${translateMessageKey(language, "shell.sourcesNeedAttention")}`
          : translateMessageKey(language, "shell.noSourceIssuesDetected"),
      tone: issueSources > 0 ? "warn" : sources.length > 0 ? "good" : "neutral",
      icon: "database",
      valueStyle: "emphasis",
    },
    {
      key: "last_platform_check",
      label: translateMessageKey(language, "shell.lastPlatformCheck"),
      value: formatTimestamp(overview?.checked_at ?? null, "dateTime", language, timezone),
      detail: overview?.coverage_area ?? translateMessageKey(language, "shell.regionalScope"),
      tone: overview ? "good" : "neutral",
      icon: "schedule",
      valueStyle: "body",
    },
  ];
}
