import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import { localizedContent } from "../content-localization";
import type { LanguageMode } from "../i18n";
import { translateMessageKey } from "../i18n";
import type {
  PublicActionRead,
  PublicDashboardRead,
  PublicScenarioSectionRead,
} from "../types";
import type { UserSummaryTile } from "../user-summary-stats";

export type TodayRecommendationMode = "live" | "out_of_scope" | "historical";

export type TodayBrief = {
  checkedAt: string | null;
  coverageArea: string;
  timezone: string;
  recommendationCoverageArea: string | null;
  headline: string;
  recommendationMode: TodayRecommendationMode;
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
    return localizedContent(language, urgentAction.title, urgentAction.title_zh);
  }

  const activeTile = summaryTiles.find((tile) => tile.tone === "bad" || tile.tone === "warn");
  if (activeTile) {
    return `${activeTile.label}: ${activeTile.value}`;
  }

  return translateMessageKey(language, "shell.coreDailyScenariosClear");
}

function coverageRegion(value: string): string {
  const withoutDate = value.split(" · ", 1)[0] ?? value;
  const segments = withoutDate.split("/");
  return (segments[segments.length - 1] ?? withoutDate).trim().toLowerCase();
}

export function recommendationModeForToday({
  isHistorical = false,
  overviewCoverageArea,
  recommendationCoverageArea,
}: {
  isHistorical?: boolean;
  overviewCoverageArea?: string | null;
  recommendationCoverageArea?: string | null;
}): TodayRecommendationMode {
  if (isHistorical) {
    return "historical";
  }

  if (
    overviewCoverageArea &&
    recommendationCoverageArea &&
    coverageRegion(overviewCoverageArea) !== coverageRegion(recommendationCoverageArea)
  ) {
    return "out_of_scope";
  }

  return "live";
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
  overviewCoverageArea,
  isHistorical = false,
  summaryTiles,
  timelineItems,
  language,
}: {
  publicDashboard: PublicDashboardRead | null;
  overviewCoverageArea?: string | null;
  isHistorical?: boolean;
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
  const recommendationCoverageArea =
    overviewCoverageArea &&
    coverageRegion(overviewCoverageArea) !== coverageRegion(publicDashboard.coverage_area)
      ? publicDashboard.coverage_area
      : null;
  const recommendationMode = recommendationModeForToday({
    isHistorical,
    overviewCoverageArea,
    recommendationCoverageArea,
  });

  return {
    checkedAt: publicDashboard.checked_at,
    coverageArea: overviewCoverageArea ?? publicDashboard.coverage_area,
    timezone: publicDashboard.timezone,
    recommendationCoverageArea,
    headline:
      recommendationMode === "historical"
        ? translateMessageKey(language, "shell.historicalRecommendationsReadOnly")
        : recommendationMode === "out_of_scope"
          ? translateMessageKey(language, "shell.recommendationsUnavailableForScope")
          : buildHeadline(topActions, summaryTiles, language),
    recommendationMode,
    planItems: buildPlanItems(
      recommendationMode === "live" ? timelineItems : [],
    ),
    scenarioSections: publicDashboard.scenario_sections,
    summaryTiles,
    topActions: recommendationMode === "live" ? topActions : [],
  };
}
