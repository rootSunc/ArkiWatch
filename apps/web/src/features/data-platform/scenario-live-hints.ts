import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import type { LanguageMode } from "./i18n";
import { translateText } from "./i18n";
import {
  weatherSnapshotDetail,
  weatherSnapshotHeadline,
} from "./weather-snapshot-display";
import type {
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";

export type ScenarioLiveHint = {
  headline: string;
  detail: string;
  updatedAt: string | null;
  sources: string;
};

export type ScenarioLiveSignals = {
  weather: WeatherForecastResponse | null;
  airQuality: AirQualityCurrentResponse | null;
  transit: TransitCurrentResponse | null;
  roadRail: RoadRailCurrentResponse | null;
  householdEnergy: EnergyCurrentResponse | null;
  systemEnergy: EnergyCurrentResponse | null;
};

function scoreLabel(
  score: number,
  fallback: string | null | undefined,
  language: LanguageMode,
): string {
  const labels = ["n/a", "Good", "Fair", "Moderate", "Poor", "Very poor"];
  const label =
    labels[Math.min(Math.max(Math.round(score), 0), 5)] ?? fallback ?? "n/a";
  return translateText(language, label);
}

function formatEnergyWindow(
  window: EnergyCurrentResponse["current_window"],
): string | null {
  if (!window) {
    return null;
  }
  const unit = window.unit ? ` ${window.unit}` : "";
  return `${window.average_value.toFixed(2)}${unit}`;
}

export function buildScenarioLiveHint(
  scenarioKey: string,
  signals: ScenarioLiveSignals,
  language: LanguageMode,
): ScenarioLiveHint | null {
  const t = (value: string) => translateText(language, value);

  switch (scenarioKey) {
    case "outdoor": {
      const { weather } = signals;
      if (!weather) {
        return null;
      }
      return {
        headline: weatherSnapshotHeadline(weather, language),
        detail: weatherSnapshotDetail(weather, language),
        updatedAt: weather.generated_at ?? weather.checked_at,
        sources: "FMI",
      };
    }
    case "home_air": {
      const { airQuality } = signals;
      if (!airQuality) {
        return null;
      }
      const score = airQuality.worst_score;
      const headline =
        score !== null && score !== undefined
          ? `${scoreLabel(score, airQuality.worst_label, language)} (${Math.round(score)}/5)`
          : airQuality.summary ?? t("Air quality loaded");
      const reporting = airQuality.quality.reporting_station_count;
      const total = airQuality.quality.station_count;
      return {
        headline,
        detail:
          airQuality.worst_station && airQuality.worst_label
            ? `${airQuality.worst_station} · ${airQuality.worst_label}`
            : `${reporting}/${total} ${t("stations")}`,
        updatedAt: airQuality.observed_at ?? airQuality.checked_at,
        sources: "HSY",
      };
    }
    case "commute": {
      const { transit, roadRail } = signals;
      if (!transit && !roadRail) {
        return null;
      }
      const transitAlerts = transit?.quality.active_alert_count ?? 0;
      const roadEvents = roadRail?.quality.active_event_count ?? 0;
      const total = transitAlerts + roadEvents;
      const headline =
        total > 0
          ? `${total} ${t("active disruptions")}`
          : t("No active commute disruptions");
      const parts: string[] = [];
      if (transit) {
        parts.push(`${t("Transit")}: ${transitAlerts}`);
      }
      if (roadRail) {
        parts.push(`${t("Road & Rail")}: ${roadEvents}`);
      }
      return {
        headline,
        detail: parts.join(" · "),
        updatedAt:
          transit?.observed_at ??
          roadRail?.observed_at ??
          transit?.checked_at ??
          roadRail?.checked_at ??
          null,
        sources: "DIGITRANSIT · DIGITRAFFIC",
      };
    }
    case "energy": {
      const { householdEnergy, systemEnergy } = signals;
      const priceWindow = householdEnergy?.current_window;
      const systemWindow = systemEnergy?.current_window;
      if (!priceWindow && !systemWindow) {
        return null;
      }
      const priceLabel = formatEnergyWindow(priceWindow ?? null);
      const systemLabel = formatEnergyWindow(systemWindow ?? null);
      const headline = priceLabel
        ? `${t("Household")} ${priceLabel}`
        : systemLabel
          ? `${t("System")} ${systemLabel}`
          : t("Energy signals loaded");
      const details: string[] = [];
      if (priceLabel && systemLabel) {
        details.push(`${t("System")} ${systemLabel}`);
      } else if (householdEnergy?.summary) {
        details.push(householdEnergy.summary);
      } else if (systemEnergy?.summary) {
        details.push(systemEnergy.summary);
      }
      return {
        headline,
        detail: details.join(" · ") || t("Compare household prices with grid load"),
        updatedAt:
          householdEnergy?.observed_at ??
          systemEnergy?.observed_at ??
          householdEnergy?.checked_at ??
          systemEnergy?.checked_at ??
          null,
        sources: "PORSSISAHKO · FINGRID",
      };
    }
    default:
      return null;
  }
}

export function formatScenarioHintAge(
  updatedAt: string | null,
  language: LanguageMode,
  t: (value: string) => string,
): string | null {
  if (!updatedAt) {
    return null;
  }
  return `${t("Updated")} ${formatRelativeAge(updatedAt, language)} · ${formatTimestamp(updatedAt, "dateTime", language)}`;
}
