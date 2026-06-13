"use client";

import type { EnergyPanelKey } from "./workspace-query-params";
import type { MobilityTabKey } from "./mobility-workspace";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  PlatformHistoryResponse,
  PlatformOverviewResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";
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
} from "./workspace-panels";

export type DataPlatformWorkspaceRouterProps = {
  airQuality: AirQualityCurrentResponse | null;
  energy: EnergyCurrentResponse | null;
  highlightedEventId: string | null;
  history: PlatformHistoryResponse;
  householdEnergy: EnergyCurrentResponse | null;
  isAirDetail: boolean;
  isCityServicesDetail: boolean;
  isEnergyDetail: boolean;
  isGeospatialDetail: boolean;
  isLinkedEventsDetail: boolean;
  isMobilityDetail: boolean;
  isRegionalProfileDetail: boolean;
  isWaterDetail: boolean;
  isWeatherDetail: boolean;
  onEnergyPanelChange: (panel: EnergyPanelKey) => void;
  onMobilityTabChange: (tab: MobilityTabKey) => void;
  overview: PlatformOverviewResponse;
  roadRail: RoadRailCurrentResponse | null;
  roadRailCategory: PlatformCategory | null;
  selectedCategory: PlatformCategory | null;
  selectedEnergyTab: EnergyPanelKey;
  selectedMobilityTab: MobilityTabKey;
  transit: TransitCurrentResponse | null;
  transitCategory: PlatformCategory | null;
  weather: WeatherForecastResponse | null;
};

export function DataPlatformWorkspaceRouter({
  airQuality,
  energy,
  highlightedEventId,
  history,
  householdEnergy,
  isAirDetail,
  isCityServicesDetail,
  isEnergyDetail,
  isGeospatialDetail,
  isLinkedEventsDetail,
  isMobilityDetail,
  isRegionalProfileDetail,
  isWaterDetail,
  isWeatherDetail,
  onEnergyPanelChange,
  onMobilityTabChange,
  overview,
  roadRail,
  roadRailCategory,
  selectedCategory,
  selectedEnergyTab,
  selectedMobilityTab,
  transit,
  transitCategory,
  weather,
}: DataPlatformWorkspaceRouterProps) {
  if (isWeatherDetail) {
    return (
      <WeatherDetailView
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        history={history.weather}
        weather={weather}
      />
    );
  }

  if (isAirDetail) {
    return (
      <AirQualityWorkspace
        airQuality={airQuality}
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        history={history.airQuality}
      />
    );
  }

  if (isEnergyDetail) {
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

  if (isMobilityDetail) {
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

  if (isWaterDetail) {
    return <WaterSnowWorkspace category={selectedCategory} timezone={overview.time_scope?.timezone ?? overview.timezone} />;
  }

  if (isCityServicesDetail) {
    return <CityServicesWorkspace category={selectedCategory} timezone={overview.time_scope?.timezone ?? overview.timezone} />;
  }

  if (isLinkedEventsDetail) {
    return (
      <LinkedEventsWorkspace
        category={selectedCategory}
        highlightedEventId={highlightedEventId}
        checkedAt={overview.checked_at}
        timeScope={overview.time_scope}
      />
    );
  }

  if (isGeospatialDetail) {
    return <GeospatialWorkspace category={selectedCategory} />;
  }

  if (isRegionalProfileDetail) {
    return <RegionalProfileWorkspace category={selectedCategory} />;
  }

  return null;
}
