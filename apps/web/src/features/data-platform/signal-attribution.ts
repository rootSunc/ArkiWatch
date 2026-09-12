import type { LanguageMode } from "./i18n";
import { translateMessageKey } from "./i18n";
import { UNAVAILABLE_DATA_VALUE } from "./data-value";
import { scopedDataAge } from "./data-time-scope";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  PlatformTimeScope,
  WeatherForecastResponse,
} from "./types";

const MOBILITY_NAV_KEY = "mobility";

export type SignalAttribution = {
  sources: string;
  timeScope: PlatformTimeScope | null | undefined;
  updatedAt: string | null;
};

export function categorySignalAttribution(
  category: PlatformCategory,
  weather: WeatherForecastResponse | null,
  airQuality: AirQualityCurrentResponse | null,
  energy: EnergyCurrentResponse | null,
  householdEnergy: EnergyCurrentResponse | null,
  roadRail: RoadRailCurrentResponse | null,
  transit: TransitCurrentResponse | null,
): SignalAttribution {
  const codes =
    category.source_codes.length > 0
      ? category.source_codes
      : category.sources.map((s) => s.source_code);

  switch (category.key) {
    case "weather":
      return {
        sources: codes.join(" · ").toUpperCase() || "FMI",
        timeScope: weather?.time_scope,
        updatedAt:
          weather?.generated_at ??
          weather?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    case "air":
      return {
        sources: codes.join(" · ").toUpperCase() || "HSY",
        timeScope: airQuality?.time_scope,
        updatedAt:
          airQuality?.observed_at ??
          airQuality?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    case MOBILITY_NAV_KEY:
      return {
        sources: (codes.length > 0 ? codes : ["digitransit", "digitraffic"])
          .join(" · ")
          .toUpperCase(),
        timeScope: transit?.time_scope ?? roadRail?.time_scope,
        updatedAt:
          transit?.observed_at ??
          roadRail?.observed_at ??
          transit?.checked_at ??
          roadRail?.checked_at ??
          null,
      };
    case "energy":
      return {
        sources: (codes.length > 0 ? codes : ["porssisahko", "fingrid"])
          .join(" · ")
          .toUpperCase(),
        timeScope: householdEnergy?.time_scope ?? energy?.time_scope,
        updatedAt:
          householdEnergy?.observed_at ??
          energy?.observed_at ??
          householdEnergy?.checked_at ??
          energy?.checked_at ??
          null,
      };
    case "transit":
      return {
        sources: codes.join(" · ").toUpperCase() || "DIGITRANSIT",
        timeScope: transit?.time_scope,
        updatedAt:
          transit?.observed_at ??
          transit?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    case "traffic":
      return {
        sources: codes.join(" · ").toUpperCase() || "DIGITRAFFIC",
        timeScope: roadRail?.time_scope,
        updatedAt:
          roadRail?.observed_at ??
          roadRail?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    default:
      return {
        sources: codes.join(" · ").toUpperCase() || UNAVAILABLE_DATA_VALUE,
        timeScope: null,
        updatedAt: category.sources[0]?.last_run_finished_at ?? null,
      };
  }
}

export function formatSignalAttributionLine(
  attribution: SignalAttribution,
  language: LanguageMode,
): string {
  const age = scopedDataAge(
    attribution.updatedAt,
    attribution.timeScope,
    language,
    (key) => translateMessageKey(language, key),
    "shell.notCollected",
    attribution.timeScope?.timezone,
  );
  return `${attribution.sources} · ${age}`;
}
