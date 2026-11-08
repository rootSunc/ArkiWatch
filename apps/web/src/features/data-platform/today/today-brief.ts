import type { CrossDomainTimelineItem } from "../overview/cross-domain-timeline";
import { localizedContent } from "../model/content-localization";
import type { LanguageMode } from "../i18n";
import { translateMessageKey } from "../i18n";
import type { PublicActionRead, PublicDashboardRead, PublicScenarioSectionRead } from "../types";
import type { UserSummaryTile } from "../overview/user-summary-stats";

export type TodayRecommendationMode = "live" | "out_of_scope" | "historical" | "stale";

export type TodayBrief = {
  checkedAt: string | null;
  coverageArea: string;
  hasScopedData: boolean;
  historicalSnapshotAvailable: boolean;
  timezone: string;
  recommendationCoverageArea: string | null;
  headline: string;
  recommendationMode: TodayRecommendationMode;
  planItems: CrossDomainTimelineItem[];
  scenarioSections: PublicScenarioSectionRead[];
  summaryTiles: UserSummaryTile[];
  topActions: PublicActionRead[];
};

// Presentation adapter: every eligibility, scope, ordering and expiry decision
// is supplied by Go. Missing decisions never become live recommendations.
export function buildTodayBrief({ publicDashboard, overviewCoverageArea, summaryTiles, language }: {
 publicDashboard: PublicDashboardRead | null;
 overviewCoverageArea?: string | null;
 isHistorical?: boolean;
 summaryTiles: UserSummaryTile[];
 timelineItems?: CrossDomainTimelineItem[];
 language: LanguageMode;
 now?: number;
}): TodayBrief | null {
 const decision = publicDashboard?.decision;
 if (!publicDashboard || !decision) return null;
 const mode = decision.recommendation_mode;
 const action = decision.top_actions.find((item) => item.id === decision.headline_action_id);
 const modeKeys = { historical: "shell.historicalRecommendationsReadOnly", out_of_scope: "shell.recommendationsUnavailableForScope", stale: "shell.staleRecommendations" } as const;
 const headline = !decision.has_scoped_data
   ? translateMessageKey(language, "shell.noSignalDataForScope")
   : mode !== "live" ? translateMessageKey(language, modeKeys[mode])
   : action ? localizedContent(language, action.title, action.title_zh)
   : translateMessageKey(language, "shell.noCurrentRecommendation");
 return {
  checkedAt: decision.historical_snapshot_available ? publicDashboard.checked_at : null,
  coverageArea: overviewCoverageArea ?? publicDashboard.coverage_area,
  hasScopedData: decision.has_scoped_data,
  historicalSnapshotAvailable: decision.historical_snapshot_available,
  timezone: publicDashboard.timezone,
  recommendationCoverageArea: mode === "out_of_scope" ? publicDashboard.coverage_area : null,
  headline, recommendationMode: mode,
  planItems: decision.plan_items,
  scenarioSections: publicDashboard.scenario_sections.map((section) => ({ ...section, recommendation: { ...section.recommendation, eligible: decision.action_eligibility[section.recommendation.id] === true } })),
  summaryTiles, topActions: decision.top_actions,
 };
}
