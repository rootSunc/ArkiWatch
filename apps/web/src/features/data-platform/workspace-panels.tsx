"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

function WorkspacePanelLoading() {
  return (
    <div className="workspace-panel-loading" aria-busy="true">
      <span className="workspace-panel-loading-label">…</span>
    </div>
  );
}

function lazyNamedPanel<TProps>(
  loader: () => Promise<Record<string, ComponentType<TProps>>>,
  exportName: string,
) {
  return dynamic(
    () =>
      loader().then((module) => ({
        default: module[exportName] as ComponentType<TProps>,
      })),
    {
      loading: () => <WorkspacePanelLoading />,
    },
  );
}

export const AirQualityWorkspace = lazyNamedPanel(
  () => import("./air-quality-workspace"),
  "AirQualityWorkspace",
);
export const CityServicesWorkspace = lazyNamedPanel(
  () => import("./city-services-workspace"),
  "CityServicesWorkspace",
);
export const EnergyWorkspace = lazyNamedPanel(
  () => import("./energy-workspace"),
  "EnergyWorkspace",
);
export const GeospatialWorkspace = lazyNamedPanel(
  () => import("./geospatial-workspace"),
  "GeospatialWorkspace",
);
export const LinkedEventsWorkspace = lazyNamedPanel(
  () => import("./linked-events-workspace"),
  "LinkedEventsWorkspace",
);
export const MobilityWorkspace = lazyNamedPanel(
  () => import("./mobility-workspace"),
  "MobilityWorkspace",
);
export const RegionalProfileWorkspace = lazyNamedPanel(
  () => import("./regional-profile-workspace"),
  "RegionalProfileWorkspace",
);
export const WaterSnowWorkspace = lazyNamedPanel(
  () => import("./water-snow-workspace"),
  "WaterSnowWorkspace",
);
export const WeatherDetailView = lazyNamedPanel(
  () => import("./weather-detail-view"),
  "WeatherDetailView",
);
