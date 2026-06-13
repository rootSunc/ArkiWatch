import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import type { LanguageMode } from "./i18n";
import { translateDataLabel, translateMessageKey } from "./i18n";
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

const SCORE_LABEL_KEYS = ["na", "good", "fair", "moderate", "poor", "veryPoor"] as const;

function scoreLabel(
  score: number,
  fallback: string | null | undefined,
  language: LanguageMode,
): string {
  if (score === null || score === undefined) {
    return fallback
      ? translateDataLabel(language, fallback)
      : translateMessageKey(language, "shell.na");
  }

  const key = SCORE_LABEL_KEYS[Math.min(Math.max(Math.round(score), 0), 5)] ?? "na";
  return translateMessageKey(language, `shell.${key}`);
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
          : airQuality.summary ?? translateMessageKey(language, "shell.airQualityLoaded");
      const reporting = airQuality.quality.reporting_station_count;
      const total = airQuality.quality.station_count;
      return {
        headline,
        detail:
          airQuality.worst_station && airQuality.worst_label
            ? `${airQuality.worst_station} · ${airQuality.worst_label}`
            : `${reporting}/${total} ${translateMessageKey(language, "shell.stations")}`,
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
          ? `${total} ${translateMessageKey(language, "shell.activeDisruptions")}`
          : translateMessageKey(language, "shell.noActiveCommuteDisruptions");
      const parts: string[] = [];
      if (transit) {
        parts.push(`${translateMessageKey(language, "shell.navTransit")}: ${transitAlerts}`);
      }
      if (roadRail) {
        parts.push(`${translateMessageKey(language, "shell.navRoadRail")}: ${roadEvents}`);
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
        ? `${translateMessageKey(language, "shell.household")} ${priceLabel}`
        : systemLabel
          ? `${translateMessageKey(language, "shell.system")} ${systemLabel}`
          : translateMessageKey(language, "shell.energySignalsLoaded");
      const details: string[] = [];
      if (priceLabel && systemLabel) {
        details.push(`${translateMessageKey(language, "shell.system")} ${systemLabel}`);
      } else if (householdEnergy?.summary) {
        details.push(householdEnergy.summary);
      } else if (systemEnergy?.summary) {
        details.push(systemEnergy.summary);
      }
      return {
        headline,
        detail: details.join(" · ") || translateMessageKey(language, "shell.compareHouseholdPricesWithGridLoad"),
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
  timeZone?: string,
): string | null {
  if (!updatedAt) {
    return null;
  }
  return `${translateMessageKey(language, "shell.updated")} ${formatRelativeAge(updatedAt, language)} · ${formatTimestamp(updatedAt, "dateTime", language, timeZone)}`;
}
