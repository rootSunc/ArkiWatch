"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import { useI18n } from "./i18n";

type WorkspacePanelLoadingProps = {
  titleKey?: string;
};

export function WorkspacePanelLoading({ titleKey = "shell.loadingPanel" }: WorkspacePanelLoadingProps) {
  const { tKey } = useI18n();

  return (
    <div className="workspace-panel-loading" aria-busy="true" role="status">
      <div className="workspace-panel-loading-heading">
        <span
          aria-hidden="true"
          className="platform-skeleton-block workspace-panel-loading-kicker"
        />
        <h1 className="workspace-panel-loading-label">{tKey(titleKey)}</h1>
        <span
          aria-hidden="true"
          className="platform-skeleton-block workspace-panel-loading-summary"
        />
      </div>
      <div aria-hidden="true" className="workspace-panel-loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <span
            className="platform-skeleton-block workspace-panel-loading-tile"
            key={index}
          />
        ))}
      </div>
      <div aria-hidden="true" className="workspace-panel-loading-body">
        <span className="platform-skeleton-block workspace-panel-loading-block" />
        <span className="platform-skeleton-block workspace-panel-loading-block workspace-panel-loading-block-secondary" />
      </div>
    </div>
  );
}

function lazyNamedPanel<TProps>(
  loader: () => Promise<Record<string, ComponentType<TProps>>>,
  exportName: string,
  loadingTitleKey: string,
) {
  return dynamic(
    () =>
      loader().then((module) => ({
        default: module[exportName] as ComponentType<TProps>,
      })),
    {
      loading: () => <WorkspacePanelLoading titleKey={loadingTitleKey} />,
    },
  );
}

export const AirQualityWorkspace = lazyNamedPanel(
  () => import("./air-quality-workspace"),
  "AirQualityWorkspace",
  "airQuality.airQuality",
);
export const CityServicesWorkspace = lazyNamedPanel(
  () => import("./city-services-workspace"),
  "CityServicesWorkspace",
  "cityServices.dashboardTitle",
);
export const EnergyWorkspace = lazyNamedPanel(
  () => import("./energy-workspace"),
  "EnergyWorkspace",
  "energy.householdPriceAndGridLoad",
);
export const GeospatialWorkspace = lazyNamedPanel(
  () => import("./geospatial-workspace"),
  "GeospatialWorkspace",
  "geospatial.title",
);
export const LinkedEventsWorkspace = lazyNamedPanel(
  () => import("./linked-events-workspace"),
  "LinkedEventsWorkspace",
  "linkedEvents.publicEventsNearYou",
);
export const MobilityWorkspace = lazyNamedPanel(
  () => import("./mobility-workspace"),
  "MobilityWorkspace",
  "mobility.transitAndRoadSignals",
);
export const RegionalProfileWorkspace = lazyNamedPanel(
  () => import("./regional-profile-workspace"),
  "RegionalProfileWorkspace",
  "regionalProfile.dashboardTitle",
);
export const WaterSnowWorkspace = lazyNamedPanel(
  () => import("./water-snow-workspace"),
  "WaterSnowWorkspace",
  "waterSnow.hydrologyTitle",
);
export const WeatherDetailView = lazyNamedPanel(
  () => import("./weather-detail-view"),
  "WeatherDetailView",
  "weather.weatherWorkspace",
);
