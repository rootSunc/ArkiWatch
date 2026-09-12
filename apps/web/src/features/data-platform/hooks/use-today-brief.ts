"use client";

import { useMemo } from "react";

import { CROSS_TIMELINE_LIMIT } from "../data-platform-nav-utils";
import { buildCrossDomainTimeline } from "../cross-domain-timeline";
import type { LanguageMode } from "../language";
import { curatedRecentEvents } from "../recent-events";
import { buildSignalSystemTiles } from "../signals-console";
import { sourceIssueCountForScope } from "../source-health";
import { buildTodayBrief, todayBriefEvaluationTime } from "../today/today-brief";
import { buildUserSummaryTiles } from "../user-summary-stats";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformEvent,
  PlatformOverviewResponse,
  PublicDashboardRead,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

type TodayBriefInput = {
  publicDashboard: PublicDashboardRead | null | undefined;
  visibleOverview: PlatformOverviewResponse | null;
  displayCategories: PlatformCategory[];
  sources: PlatformOverviewResponse["sources"];
  recentEvents: PlatformEvent[];
  recentEventCandidates: PlatformEvent[];
  weather: WeatherForecastResponse | null | undefined;
  airQuality: AirQualityCurrentResponse | null | undefined;
  transit: TransitCurrentResponse | null | undefined;
  roadRail: RoadRailCurrentResponse | null | undefined;
  householdEnergy: EnergyCurrentResponse | null | undefined;
  systemEnergy: EnergyCurrentResponse | null | undefined;
  language: LanguageMode;
  selectedCity: string;
  eventReferenceAt: string | null;
  isHistorical: boolean;
  isDemo: boolean;
};

/**
 * The Today brief and the tiles it is assembled from.
 *
 * Today answers "what should I do next", so it reads across every signal at
 * once: the glance tiles, the cross-domain timeline, and the source health that
 * decides whether the brief can be trusted. Deriving them together keeps the
 * brief consistent with the tiles it cites.
 */
export function useTodayBrief({
  publicDashboard,
  visibleOverview,
  displayCategories,
  sources,
  recentEvents,
  recentEventCandidates,
  weather,
  airQuality,
  transit,
  roadRail,
  householdEnergy,
  systemEnergy,
  language,
  selectedCity,
  eventReferenceAt,
  isHistorical,
  isDemo,
}: TodayBriefInput) {
  const userSummaryTiles = useMemo(
    () =>
      buildUserSummaryTiles(
        {
          weather: weather ?? null,
          airQuality: airQuality ?? null,
          transit: transit ?? null,
          roadRail: roadRail ?? null,
          householdEnergy: householdEnergy ?? null,
          systemEnergy: systemEnergy ?? null,
        },
        language,
      ),
    [airQuality, householdEnergy, language, roadRail, systemEnergy, transit, weather],
  );

  const crossDomainTimeline = useMemo(
    () =>
      buildCrossDomainTimeline(
        curatedRecentEvents(recentEventCandidates, CROSS_TIMELINE_LIMIT, {
          city: selectedCity,
          referenceAt: eventReferenceAt,
        }),
        publicDashboard ?? null,
        CROSS_TIMELINE_LIMIT,
        eventReferenceAt,
      ),
    [eventReferenceAt, publicDashboard, recentEventCandidates, selectedCity],
  );

  // A demo snapshot is evaluated against its own checked-at instant, so the
  // fixture stays coherent after the calendar moves on.
  const evaluationTime = todayBriefEvaluationTime(isDemo, eventReferenceAt);

  const todayBrief = useMemo(
    () =>
      buildTodayBrief({
        publicDashboard: publicDashboard ?? null,
        overviewCoverageArea: visibleOverview?.coverage_area,
        isHistorical,
        summaryTiles: userSummaryTiles,
        timelineItems: crossDomainTimeline,
        language,
        now: evaluationTime,
      }),
    [
      crossDomainTimeline,
      evaluationTime,
      isHistorical,
      language,
      publicDashboard,
      userSummaryTiles,
      visibleOverview,
    ],
  );

  const todaySourceIssueCount = useMemo(
    () => sourceIssueCountForScope(visibleOverview?.sources ?? [], isHistorical),
    [isHistorical, visibleOverview],
  );

  const signalSystemTiles = useMemo(
    () =>
      buildSignalSystemTiles({
        overview: visibleOverview,
        categories: displayCategories,
        sources,
        recentEvents,
        language,
      }),
    [displayCategories, language, recentEvents, sources, visibleOverview],
  );

  return {
    evaluationTime,
    userSummaryTiles,
    crossDomainTimeline,
    todayBrief,
    todaySourceIssueCount,
    signalSystemTiles,
  };
}
