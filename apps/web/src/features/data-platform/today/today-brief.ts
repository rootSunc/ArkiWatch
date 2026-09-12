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

export type TodayRecommendationMode = "live" | "out_of_scope" | "historical" | "stale";

const MAX_LIVE_SNAPSHOT_AGE_MS = 6 * 60 * 60 * 1000;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

/**
 * Keep the reproducible demo snapshot useful after the calendar moves on.
 * Live production data is evaluated against the browser clock, while demo
 * data is evaluated against its own checked-at instant and remains explicitly
 * labelled as static by the surrounding shell.
 */
export function todayBriefEvaluationTime(
  demoMode: boolean,
  referenceAt: string | null | undefined,
  now = Date.now(),
): number {
  if (!demoMode || !referenceAt) {
    return now;
  }

  const referenceTime = Date.parse(referenceAt);
  return Number.isFinite(referenceTime) ? referenceTime : now;
}

export function isPlaceholderRecommendation(id: string, body: string): boolean {
  if (id.startsWith("placeholder-")) {
    return true;
  }
  return /data will appear here after|no active regional recommendation/i.test(body);
}

export function isRecommendationExpired(
  recommendation: Pick<PublicActionRead, "valid_to">,
  now = Date.now(),
): boolean {
  const validTo = Date.parse(recommendation.valid_to);
  return !Number.isFinite(validTo) || validTo < now;
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

const EVENT_SCENARIO_KEYS: Record<string, string> = {
  air: "home_air",
  energy: "energy",
  traffic: "commute",
  transit: "commute",
  weather: "outdoor",
};

function scenarioKeyForTimelineItem(item: CrossDomainTimelineItem): string | null {
  return item.scenarioKey ?? EVENT_SCENARIO_KEYS[item.categoryKey] ?? null;
}

function timelineItemsOverlap(
  left: CrossDomainTimelineItem,
  right: CrossDomainTimelineItem,
): boolean {
  const leftStart = Date.parse(left.startsAt);
  const leftEnd = Date.parse(left.endsAt);
  const rightStart = Date.parse(right.startsAt);
  const rightEnd = Date.parse(right.endsAt);

  return [leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)
    && leftStart < rightEnd
    && rightStart < leftEnd;
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
  snapshotFresh = true,
}: {
  isHistorical?: boolean;
  overviewCoverageArea?: string | null;
  recommendationCoverageArea?: string | null;
  snapshotFresh?: boolean;
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

  if (!snapshotFresh) {
    return "stale";
  }

  return "live";
}

function isLiveSnapshotFresh(publicDashboard: PublicDashboardRead, now: number): boolean {
  if (!publicDashboard.snapshot_date) {
    return true;
  }

  const checkedAt = Date.parse(publicDashboard.checked_at);
  if (!Number.isFinite(checkedAt)) {
    return false;
  }

  const age = now - checkedAt;
  return age <= MAX_LIVE_SNAPSHOT_AGE_MS && age >= -ALLOWED_CLOCK_SKEW_MS;
}

export function buildPlanItems(
  items: CrossDomainTimelineItem[],
  now = Date.now(),
  options: { excludeScenarioKey?: string } = {},
): CrossDomainTimelineItem[] {
  const eligibleItems = items
    .filter(
      (item) =>
        Number.isFinite(Date.parse(item.endsAt)) && Date.parse(item.endsAt) >= now &&
        !/^no active .+ recommendation/i.test(item.title) &&
        (item.kind === "scenario" || severityRank(item.severity) >= 2),
    )
    .filter((item) => {
      if (!options.excludeScenarioKey) {
        return true;
      }

      return scenarioKeyForTimelineItem(item) !== options.excludeScenarioKey;
    });

  const scenarioItems = eligibleItems.filter((item) => item.kind === "scenario");

  return eligibleItems
    // A normalized scenario and its source event often describe the same
    // decision window. Keep the scenario in Today and retain the event in the
    // Data timeline, where source-level evidence can be inspected.
    .filter((item) => {
      if (item.kind !== "event") {
        return true;
      }

      const itemScenarioKey = scenarioKeyForTimelineItem(item);
      return !scenarioItems.some(
        (scenario) =>
          scenarioKeyForTimelineItem(scenario) === itemScenarioKey
          && timelineItemsOverlap(scenario, item),
      );
    })
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
  now = Date.now(),
}: {
  publicDashboard: PublicDashboardRead | null;
  overviewCoverageArea?: string | null;
  isHistorical?: boolean;
  summaryTiles: UserSummaryTile[];
  timelineItems: CrossDomainTimelineItem[];
  language: LanguageMode;
  now?: number;
}): TodayBrief | null {
  if (!publicDashboard) {
    return null;
  }

  const topActions = publicDashboard.top_actions.filter(
    (action) =>
      !isPlaceholderRecommendation(action.id, action.body) &&
      !isRecommendationExpired(action, now),
  );
  const historicalSnapshotAvailable =
    !isHistorical || publicDashboard.snapshot_available !== false;
  const hasScopedData =
    historicalSnapshotAvailable &&
    (publicDashboard.top_actions.length > 0 ||
      publicDashboard.scenario_sections.length > 0 ||
      timelineItems.length > 0 ||
      summaryTiles.some((tile) => tile.tone !== "neutral"));
  const recommendationCoverageArea =
    overviewCoverageArea &&
    coverageRegion(overviewCoverageArea) !== coverageRegion(publicDashboard.coverage_area)
      ? publicDashboard.coverage_area
      : null;
  const recommendationMode = recommendationModeForToday({
    isHistorical,
    overviewCoverageArea,
    recommendationCoverageArea,
    snapshotFresh: isHistorical || isLiveSnapshotFresh(publicDashboard, now),
  });
  return {
    checkedAt: historicalSnapshotAvailable ? publicDashboard.checked_at : null,
    coverageArea: overviewCoverageArea ?? publicDashboard.coverage_area,
    hasScopedData,
    historicalSnapshotAvailable,
    timezone: publicDashboard.timezone,
    recommendationCoverageArea,
    headline: !hasScopedData
      ? translateMessageKey(language, "shell.noSignalDataForScope")
      : recommendationMode === "historical"
        ? translateMessageKey(language, "shell.historicalRecommendationsReadOnly")
        : recommendationMode === "out_of_scope"
          ? translateMessageKey(language, "shell.recommendationsUnavailableForScope")
          : recommendationMode === "stale"
            ? translateMessageKey(language, "shell.staleRecommendations")
          : buildHeadline(topActions, summaryTiles, language),
    recommendationMode,
    planItems: buildPlanItems(
      recommendationMode === "live" ? timelineItems : [],
      now,
      { excludeScenarioKey: topActions[0]?.scenario_key },
    ),
    scenarioSections: publicDashboard.scenario_sections,
    summaryTiles,
    topActions: recommendationMode === "live" ? topActions : [],
  };
}
