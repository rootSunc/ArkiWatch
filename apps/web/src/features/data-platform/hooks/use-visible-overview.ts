"use client";

import { useMemo } from "react";

import { categoryVisibleToCurrentUser } from "../model/category-access";
import { categoryByKey } from "../shell/data-platform-nav-utils";
import { buildMobilityCategory, mergeMobilityCategories } from "../model/data-platform-view-model";
import { scopedReferenceTime } from "../model/data-time-scope";
import type {
  AirQualityCurrentResponse,
  BriefingDecision,
  PlatformOverviewResponse,
  PlatformTimeScope,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

type VisibleOverviewInput = {
  decision?: BriefingDecision;
  overview: PlatformOverviewResponse | null | undefined;
  weather: WeatherForecastResponse | null | undefined;
  airQuality: AirQualityCurrentResponse | null | undefined;
  transit: TransitCurrentResponse | null | undefined;
  roadRail: RoadRailCurrentResponse | null | undefined;
  selectedCity: string;
  activeTimeScope: PlatformTimeScope | null;
};

/**
 * The overview as the shell presents it, rather than as the API returns it.
 *
 * Three things separate the two: categories the current viewer may not see are
 * dropped, transit and traffic are merged into the single Mobility workspace
 * the navigation offers, and recent events are curated from several payloads
 * against the snapshot's own clock instead of the browser's.
 */
export function useVisibleOverview({
  overview,
  decision,
  transit,
  roadRail,
  activeTimeScope,
}: VisibleOverviewInput) {
  const categories = useMemo(
    () => (overview?.categories ?? []).filter((category) => categoryVisibleToCurrentUser(category.key)),
    [overview],
  );

  const transitCategory = useMemo(() => categoryByKey(categories, "transit"), [categories]);
  const roadRailCategory = useMemo(() => categoryByKey(categories, "traffic"), [categories]);

  const mobilityCategory = useMemo(
    () => buildMobilityCategory(categories, transit ?? null, roadRail ?? null),
    [categories, roadRail, transit],
  );
  const displayCategories = useMemo(
    () => mergeMobilityCategories(categories, mobilityCategory),
    [categories, mobilityCategory],
  );

  const eventReferenceAt = scopedReferenceTime(activeTimeScope, overview?.checked_at ?? null);

  const recentEvents = useMemo(() => decision?.recent_events ?? [], [decision]);
  const recentEventCandidates = recentEvents;

  const sources = useMemo(
    () =>
      (overview?.sources ?? []).filter((source) => {
        const sourceCategories = source.categories ?? [];
        return sourceCategories.length === 0 || sourceCategories.some(categoryVisibleToCurrentUser);
      }),
    [overview],
  );

  const visibleOverview = useMemo(
    () =>
      overview
        ? { ...overview, categories: displayCategories, recent_events: recentEvents, sources, source_health: decision?.source_health }
        : null,
    [displayCategories, overview, recentEvents, sources, decision],
  );

  return {
    categories,
    transitCategory,
    roadRailCategory,
    mobilityCategory,
    displayCategories,
    eventReferenceAt,
    recentEventCandidates,
    recentEvents,
    sources,
    visibleOverview,
  };
}
