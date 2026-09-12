"use client";

import { useMemo } from "react";

import { categoryVisibleToCurrentUser } from "../category-access";
import { categoryByKey } from "../data-platform-nav-utils";
import { buildMobilityCategory, mergeMobilityCategories } from "../data-platform-view-model";
import { scopedReferenceTime } from "../data-time-scope";
import {
  buildAirQualityRecentEvents,
  buildWeatherRecentEvents,
  curatedRecentEvents,
  RECENT_EVENT_LIMIT,
} from "../recent-events";
import type {
  AirQualityCurrentResponse,
  PlatformOverviewResponse,
  PlatformTimeScope,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";

type VisibleOverviewInput = {
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
  weather,
  airQuality,
  transit,
  roadRail,
  selectedCity,
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

  const recentEventCandidates = useMemo(
    () =>
      [
        ...buildWeatherRecentEvents(weather ?? null, { city: selectedCity }),
        ...buildAirQualityRecentEvents(airQuality ?? null),
        ...categories.flatMap((category) => category.events),
        ...(overview?.recent_events ?? []),
      ].filter((event) => categoryVisibleToCurrentUser(event.category_key)),
    [airQuality, categories, overview, selectedCity, weather],
  );

  const recentEvents = useMemo(
    () =>
      curatedRecentEvents(recentEventCandidates, RECENT_EVENT_LIMIT, {
        city: selectedCity,
        referenceAt: eventReferenceAt,
      }),
    [eventReferenceAt, recentEventCandidates, selectedCity],
  );

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
        ? { ...overview, categories: displayCategories, recent_events: recentEvents, sources }
        : null,
    [displayCategories, overview, recentEvents, sources],
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
