"use client";

import { WorkspaceConsole } from "../workspaces/workspace-console";
import type { EnergyPanelKey } from "./workspace-query-params";
import type { MobilityTabKey } from "../workspaces/mobility/mobility-workspace";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformHistoryResponse,
  PlatformOverviewResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "../types";
import type { WorkspaceRoute } from "./workspace-route";

export type { WorkspaceRoute } from "./workspace-route";
import {
  AirQualityWorkspace,
  CityServicesWorkspace,
  EnergyWorkspace,
  GeospatialWorkspace,
  LinkedEventsWorkspace,
  MobilityWorkspace,
  RegionalProfileWorkspace,
  WaterSnowWorkspace,
  WeatherDetailView,
} from "../workspaces/workspace-panels";

export type DataPlatformWorkspaceRouterProps = {
  airQuality: AirQualityCurrentResponse | null;
  city?: string;
  onAsk?: (question: string) => void;
  energy: EnergyCurrentResponse | null;
  highlightedEventId: string | null;
  history: PlatformHistoryResponse;
  householdEnergy: EnergyCurrentResponse | null;
  onEnergyPanelChange: (panel: EnergyPanelKey) => void;
  onMobilityTabChange: (tab: MobilityTabKey) => void;
  overview: PlatformOverviewResponse;
  roadRail: RoadRailCurrentResponse | null;
  roadRailCategory: PlatformCategory | null;
  route: WorkspaceRoute | null;
  selectedCategory: PlatformCategory | null;
  selectedEnergyTab: EnergyPanelKey;
  selectedMobilityTab: MobilityTabKey;
  transit: TransitCurrentResponse | null;
  transitCategory: PlatformCategory | null;
  weather: WeatherForecastResponse | null;
};

function LegacyWorkspaceRouter({
  airQuality,
  energy,
  highlightedEventId,
  history,
  householdEnergy,
  onEnergyPanelChange,
  onMobilityTabChange,
  overview,
  roadRail,
  roadRailCategory,
  route,
  selectedCategory,
  selectedEnergyTab,
  selectedMobilityTab,
  transit,
  transitCategory,
  weather,
}: DataPlatformWorkspaceRouterProps) {
  if (route === "weather") {
    return (
      <WeatherDetailView
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        history={history.weather}
        weather={weather}
      />
    );
  }

  if (route === "air") {
    return (
      <AirQualityWorkspace
        airQuality={airQuality}
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        history={history.airQuality}
      />
    );
  }

  if (route === "energy") {
    return (
      <EnergyWorkspace
        activePanel={selectedEnergyTab}
        category={selectedCategory}
        energy={energy}
        highlightedEventId={highlightedEventId}
        history={history.energy}
        householdEnergy={householdEnergy}
        householdHistory={history.householdEnergy}
        onPanelChange={onEnergyPanelChange}
      />
    );
  }

  if (route === "mobility") {
    return (
      <MobilityWorkspace
        activeTab={selectedMobilityTab}
        highlightedEventId={highlightedEventId}
        onTabChange={onMobilityTabChange}
        roadRail={roadRail}
        roadRailCategory={roadRailCategory}
        roadRailHistory={history.roadRail}
        transit={transit}
        transitCategory={transitCategory}
        transitHistory={history.transit}
      />
    );
  }

  if (route === "water") {
    return <WaterSnowWorkspace category={selectedCategory} timeScope={overview.time_scope} timezone={overview.time_scope?.timezone ?? overview.timezone} />;
  }

  if (route === "city_services") {
    return <CityServicesWorkspace category={selectedCategory} timeScope={overview.time_scope} timezone={overview.time_scope?.timezone ?? overview.timezone} />;
  }

  if (route === "linked_events") {
    return (
      <LinkedEventsWorkspace
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        checkedAt={overview.checked_at}
        timeScope={overview.time_scope}
      />
    );
  }

  if (route === "geospatial") {
    return <GeospatialWorkspace category={selectedCategory} timeScope={overview.time_scope} />;
  }

  if (route === "regional_profile") {
    return <RegionalProfileWorkspace category={selectedCategory} timeScope={overview.time_scope} />;
  }

  return null;
}

export function DataPlatformWorkspaceRouter(props: DataPlatformWorkspaceRouterProps) {
  return <WorkspaceConsole {...props}><LegacyWorkspaceRouter {...props} /></WorkspaceConsole>;
}
