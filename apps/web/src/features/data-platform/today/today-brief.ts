import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import type { LanguageMode } from "../i18n";
import { translateMessageKey } from "../i18n";
import type {
  PublicActionRead,
  PublicDashboardRead,
  PublicScenarioSectionRead,
} from "../types";
import type { UserSummaryTile } from "../user-summary-stats";

export type TodayBrief = {
  checkedAt: string | null;
  coverageArea: string;
  headline: string;
  planItems: CrossDomainTimelineItem[];
  scenarioSections: PublicScenarioSectionRead[];
  summaryTiles: UserSummaryTile[];
  topActions: PublicActionRead[];
};

export function isPlaceholderRecommendation(id: string, body: string): boolean {
  if (id.startsWith("placeholder-")) {
    return true;
  }
  return /data will appear here after|no active regional recommendation/i.test(body);
}

function severityRank(severity: string): number {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
    case "INFO":
      return 1;
    default:
      return 0;
  }
}

function buildHeadline(
  topActions: PublicActionRead[],
  summaryTiles: UserSummaryTile[],
  language: LanguageMode,
): string {
  const urgentAction = topActions.find((action) => severityRank(action.severity) >= 2);
  if (urgentAction) {
    return urgentAction.title;
  }

  const activeTile = summaryTiles.find((tile) => tile.tone === "bad" || tile.tone === "warn");
  if (activeTile) {
    return `${activeTile.label}: ${activeTile.value}`;
  }

  return translateMessageKey(language, "shell.coreDailyScenariosClear");
}

export function buildPlanItems(items: CrossDomainTimelineItem[]): CrossDomainTimelineItem[] {
  return items
    .filter(
      (item) =>
        !/^no active .+ recommendation/i.test(item.title) &&
        (item.kind === "scenario" || severityRank(item.severity) >= 2),
    )
    .sort((left, right) => {
      const severityDiff = severityRank(right.severity) - severityRank(left.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    })
    .slice(0, 3);
}

export function buildTodayBrief({
  publicDashboard,
  summaryTiles,
  timelineItems,
  language,
}: {
  publicDashboard: PublicDashboardRead | null;
  summaryTiles: UserSummaryTile[];
  timelineItems: CrossDomainTimelineItem[];
  language: LanguageMode;
}): TodayBrief | null {
  if (!publicDashboard) {
    return null;
  }

  const topActions = publicDashboard.top_actions.filter(
    (action) => !isPlaceholderRecommendation(action.id, action.body),
  );

  return {
    checkedAt: publicDashboard.checked_at,
    coverageArea: publicDashboard.coverage_area,
    headline: buildHeadline(topActions, summaryTiles, language),
    planItems: buildPlanItems(timelineItems),
    scenarioSections: publicDashboard.scenario_sections,
    summaryTiles,
    topActions,
  };
}
