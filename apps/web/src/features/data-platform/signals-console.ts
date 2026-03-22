import { formatTimestamp } from "@/features/shared/format";

import type { DashboardTone } from "./data-platform-shell";
import type { LanguageMode } from "./i18n";
import { translateMessageKey } from "./i18n";
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

function sourceIsHealthy(source: DashboardSource): boolean {
  return ["healthy", "ready", "connected", "fetched"].includes(source.operational_status);
}

function severeEventCount(events: PlatformEvent[]): number {
  return events.filter((event) => ["HIGH", "CRITICAL"].includes(event.severity.toUpperCase())).length;
}

export function buildSignalSystemTiles({
  overview,
  categories,
  sources,
  recentEvents,
  language,
}: {
  overview: PlatformOverviewResponse | null;
  categories: PlatformCategory[];
  sources: DashboardSource[];
  recentEvents: PlatformEvent[];
  language: LanguageMode;
}): SignalSystemTile[] {

  const healthySources = sources.filter(sourceIsHealthy).length;
  const issueSources = Math.max(0, sources.length - healthySources);
  const severeEvents = severeEventCount(recentEvents);
  const connectedCategories = categories.filter(
    (category) => category.stage === "connected" || category.status === "connected",
  ).length;

  return [
    {
      key: "signal_categories",
      label: translateMessageKey(language, "shell.signalCategories"),
      value: String(categories.length),
      detail: `${connectedCategories} ${translateMessageKey(language, "shell.active")} · ${Math.max(0, categories.length - connectedCategories)} ${translateMessageKey(language, "shell.catalog")}`,
      tone: categories.length > 0 ? "good" : "neutral",
      icon: "hub",
      valueStyle: "emphasis",
    },
    {
      key: "active_events",
      label: translateMessageKey(language, "shell.activeEvents"),
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
      value: formatTimestamp(overview?.checked_at ?? null, "dateTime", language),
      detail: overview?.coverage_area ?? translateMessageKey(language, "shell.regionalScope"),
      tone: overview ? "good" : "neutral",
      icon: "schedule",
      valueStyle: "body",
    },
  ];
}
