import type { components } from "@/lib/api-contract";

export type BriefingDecision = components["schemas"]["BriefingDecisionRead"];

export type PlatformKeyDataItem = components["schemas"]["PlatformKeyDataItemRead"];

export type PlatformTone = "good" | "warn" | "bad" | "neutral";

export type SourceDataField = components["schemas"]["DataFieldRead"];

export type SourceDatasetStructure = components["schemas"]["SourceDatasetStructureRead"];

export type SourceNormalizedEventStructure = components["schemas"]["SourceNormalizedEventStructureRead"];

export type DashboardSource = components["schemas"]["DashboardSourceRead"];

export type PlatformTimeScope = components["schemas"]["TimeScopeRead"] & { is_demo?: boolean };

export type PlatformMetric = components["schemas"]["PlatformMetricRead"];

export type PlatformEvent = components["schemas"]["PlatformEventRead"];

export type PlatformVisualizationPoint = components["schemas"]["PlatformVisualizationPointRead"];

export type PlatformVisualizationSeries = components["schemas"]["PlatformVisualizationSeriesRead"];

export type PlatformVisualizationTimelineItem = components["schemas"]["PlatformVisualizationTimelineItemRead"];

export type PlatformVisualizationData = components["schemas"]["PlatformVisualizationDataRead"];

export type PlatformVisualization = components["schemas"]["PlatformVisualizationRead"];

export type PlatformCategory = components["schemas"]["PlatformCategoryRead"];

export type PlatformOverviewResponse = Omit<components["schemas"]["PlatformOverviewRead"], "time_scope"> & {
  time_scope?: PlatformTimeScope | null;
  source_health?: BriefingDecision["source_health"];
};

export type WeatherForecastPoint = components["schemas"]["WeatherForecastPointRead"];

export type WeatherRainWindow = components["schemas"]["WeatherRainWindowRead"];

export type WeatherMetric = components["schemas"]["WeatherMetricRead"];

export type WeatherSourceLayer = components["schemas"]["WeatherSourceLayerRead"];

export type WeatherSourceRequest = components["schemas"]["WeatherSourceRequestRead"];

export type WeatherDataStage = components["schemas"]["WeatherDataStageRead"];

export type WeatherQuality = components["schemas"]["WeatherQualityRead"];

export type WeatherWarning = components["schemas"]["WeatherWarningRead"];

export type WeatherTimePreset = "day" | "next24h" | "next7d" | "custom";

export type WeatherTimeWindow = {
  preset: WeatherTimePreset;
  label: string;
  shortLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  isValid: boolean;
};

export type WeatherForecastResponse = components["schemas"]["WeatherForecastRead"];

export type AirQualityStation = components["schemas"]["AirQualityStationRead"];

export type AirQualityMetric = components["schemas"]["AirQualityMetricRead"];

export type AirQualitySourceRequest = components["schemas"]["AirQualitySourceRequestRead"];

export type AirQualityDataStage = components["schemas"]["AirQualityDataStageRead"];

export type AirQualityQuality = components["schemas"]["AirQualityQualityRead"];

export type AirQualityCurrentResponse = components["schemas"]["AirQualityCurrentRead"];

export type TransitAlert = components["schemas"]["TransitAlertRead"];

export type TransitMetric = components["schemas"]["TransitMetricRead"];

export type TransitSourceRequest = components["schemas"]["TransitSourceRequestRead"];

export type TransitDataStage = components["schemas"]["TransitDataStageRead"];

export type TransitQuality = components["schemas"]["TransitQualityRead"];

export type TransitCurrentResponse = components["schemas"]["TransitCurrentRead"];

export type RoadRailIncident = components["schemas"]["RoadRailIncidentRead"];

export type RoadRailCorridor = components["schemas"]["RoadRailCorridorRead"];

export type RoadRailMetric = components["schemas"]["RoadRailMetricRead"];

export type RoadRailSourceRequest = components["schemas"]["RoadRailSourceRequestRead"];

export type RoadRailDataStage = components["schemas"]["RoadRailDataStageRead"];

export type RoadRailQuality = components["schemas"]["RoadRailQualityRead"];

export type RoadRailCurrentResponse = components["schemas"]["RoadRailCurrentRead"];

export type EnergyPoint = components["schemas"]["EnergyPointRead"];

export type EnergyWindow = components["schemas"]["EnergyWindowRead"];

export type EnergyMetric = components["schemas"]["EnergyMetricRead"];

export type EnergySourceRequest = components["schemas"]["EnergySourceRequestRead"];

export type EnergyDataStage = components["schemas"]["EnergyDataStageRead"];

export type EnergyQuality = components["schemas"]["EnergyQualityRead"];

export type EnergyCurrentResponse = components["schemas"]["EnergyCurrentRead"];

export type PlatformHistoricalSnapshot<T> = {
  date: string;
  data: T | null;
  error: string | null;
};

export type PlatformHistoryResponse = {
  weather: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  airQuality: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
  energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  householdEnergy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  roadRail: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  transit: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
};

export type PlatformHistoryApiResponse = {
  weather: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  air_quality: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
  energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  household_energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  road_rail: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  transit: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
};

export type PlatformHistoryAvailabilityDay = components["schemas"]["PlatformHistoryAvailabilityDayRead"];

export type PlatformHistoryAvailabilityResponse = components["schemas"]["PlatformHistoryAvailabilityRead"];

export type PublicActionRead = components["schemas"]["PublicActionRead"] & { eligible?: boolean };

export type PublicScenarioSectionRead = Omit<components["schemas"]["PublicScenarioSectionRead"], "recommendation"> & { recommendation: PublicActionRead };

export type PublicTimelineItemRead = components["schemas"]["PublicTimelineItemRead"];

export type ScenarioChannelRead = components["schemas"]["ScenarioChannelRead"];

export type PublicDashboardRead = Omit<components["schemas"]["PublicDashboardRead"], "top_actions" | "scenario_sections" | "broadcasts"> & {
  signals?: components["schemas"]["PublicBriefingRead"]["signals"];
  decision?: BriefingDecision;
  top_actions: PublicActionRead[];
  scenario_sections: PublicScenarioSectionRead[];
  broadcasts: PublicActionRead[];
};
