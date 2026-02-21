import { formatTimestamp } from "@/features/shared/format";

import type { DashboardTone } from "./data-platform-shell";
import type { LanguageMode } from "./i18n";
import { translateText } from "./i18n";
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
  const t = (value: string) => translateText(language, value);
  const healthySources = sources.filter(sourceIsHealthy).length;
  const issueSources = Math.max(0, sources.length - healthySources);
  const severeEvents = severeEventCount(recentEvents);
  const connectedCategories = categories.filter(
    (category) => category.stage === "connected" || category.status === "connected",
  ).length;

  return [
    {
      key: "signal_categories",
      label: t("Signal categories"),
      value: String(categories.length),
      detail: `${connectedCategories} ${t("active")} · ${Math.max(0, categories.length - connectedCategories)} ${t("catalog")}`,
      tone: categories.length > 0 ? "good" : "neutral",
      icon: "hub",
      valueStyle: "emphasis",
    },
    {
      key: "active_events",
      label: t("Active events"),
      value: String(recentEvents.length),
      detail:
        severeEvents > 0
          ? `${severeEvents} ${t("high severity")}`
          : t("Normalized event stream"),
      tone: severeEvents > 0 ? "bad" : recentEvents.length > 0 ? "warn" : "good",
      icon: "notifications",
      valueStyle: "emphasis",
    },
    {
      key: "source_health",
      label: t("Source health"),
      value: sources.length > 0 ? `${healthySources}/${sources.length}` : t("n/a"),
      detail:
        issueSources > 0
          ? `${issueSources} ${t("sources need attention")}`
          : t("No source issues detected"),
      tone: issueSources > 0 ? "warn" : sources.length > 0 ? "good" : "neutral",
      icon: "database",
      valueStyle: "emphasis",
    },
    {
      key: "last_platform_check",
      label: t("Last platform check"),
      value: formatTimestamp(overview?.checked_at ?? null, "dateTime", language),
      detail: overview?.coverage_area ?? t("Regional scope"),
      tone: overview ? "good" : "neutral",
      icon: "schedule",
      valueStyle: "body",
    },
  ];
}
