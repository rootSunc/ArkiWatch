"use client";

import { useMemo } from "react";

import type { LanguageMode } from "../language";
import { buildSignalSystemTiles } from "../overview/signals-console";
import { buildTodayBrief } from "../today/today-brief";
import { buildUserSummaryTiles } from "../overview/user-summary-stats";
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
  weather,
  airQuality,
  transit,
  roadRail,
  householdEnergy,
  systemEnergy,
  language,
  isHistorical,
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
        publicDashboard?.decision?.summary,
      ),
    [airQuality, householdEnergy, language, roadRail, systemEnergy, transit, weather, publicDashboard],
  );

  const crossDomainTimeline = useMemo(() => publicDashboard?.decision?.timeline ?? [], [publicDashboard]);
  const evaluationTime = Date.parse(publicDashboard?.decision?.evaluated_at ?? "") || 0;

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

  const todaySourceIssueCount = publicDashboard?.decision?.source_health.issues ?? 0;

  const signalSystemTiles = useMemo(
    () =>
      buildSignalSystemTiles({
        overview: visibleOverview,
        categories: displayCategories,
        sources,
        recentEvents,
        language,
        sourceHealth: publicDashboard?.decision?.source_health,
      }),
    [displayCategories, language, recentEvents, sources, visibleOverview, publicDashboard],
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
