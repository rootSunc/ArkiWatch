import type { components } from "./api-contract";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformOverviewResponse,
  PublicDashboardRead,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse
} from "@/features/data-platform/types";

type ApiSchemas = components["schemas"];
type AssertAssignable<From, To extends From> = To;

export type PlatformOverviewContract = AssertAssignable<
  ApiSchemas["PlatformOverviewRead"],
  PlatformOverviewResponse
>;
export type PublicDashboardContract = AssertAssignable<
  ApiSchemas["PublicDashboardRead"],
  PublicDashboardRead
>;
export type WeatherContract = AssertAssignable<
  ApiSchemas["WeatherForecastRead"],
  WeatherForecastResponse
>;
export type AirQualityContract = AssertAssignable<
  ApiSchemas["AirQualityCurrentRead"],
  AirQualityCurrentResponse
>;
export type EnergyContract = AssertAssignable<ApiSchemas["EnergyCurrentRead"], EnergyCurrentResponse>;
export type RoadRailContract = AssertAssignable<
  ApiSchemas["RoadRailCurrentRead"],
  RoadRailCurrentResponse
>;
export type TransitContract = AssertAssignable<ApiSchemas["TransitCurrentRead"], TransitCurrentResponse>;
