import { formatRelativeAge } from "@/features/shared/format";

import type { LanguageMode } from "./i18n";
import { translateText } from "./i18n";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  PlatformCategory,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";

const MOBILITY_NAV_KEY = "mobility";

export type SignalAttribution = {
  sources: string;
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
        updatedAt:
          weather?.generated_at ??
          weather?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    case "air":
      return {
        sources: codes.join(" · ").toUpperCase() || "HSY",
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
        updatedAt:
          transit?.observed_at ??
          transit?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    case "traffic":
      return {
        sources: codes.join(" · ").toUpperCase() || "DIGITRAFFIC",
        updatedAt:
          roadRail?.observed_at ??
          roadRail?.checked_at ??
          category.sources[0]?.last_run_finished_at ??
          null,
      };
    default:
      return {
        sources: codes.join(" · ").toUpperCase() || "—",
        updatedAt: category.sources[0]?.last_run_finished_at ?? null,
      };
  }
}

export function formatSignalAttributionLine(
  attribution: SignalAttribution,
  language: LanguageMode,
): string {
  const t = (value: string) => translateText(language, value);
  const age = attribution.updatedAt
    ? formatRelativeAge(attribution.updatedAt, language)
    : t("not collected");
  return `${attribution.sources} · ${age}`;
}
