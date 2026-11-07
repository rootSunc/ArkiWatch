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
  PlatformTimeScope,
} from "./types";
import { formatTimestamp } from "@/features/shared/format";

import { isHistoricalTimeScope, isStaticDemoTimeScope, scopedDataAge } from "./data-time-scope";
import { isEmptyStatus } from "./platform-status";

function copySeparator(language: LanguageMode): string {
  return language === "zh" ? "，" : ", ";
}

export type ScenarioLiveHint = {
  headline: string;
  detail: string;
  timeScope: PlatformTimeScope | null | undefined;
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
      if (!weather || isEmptyStatus(weather.status)) {
        return null;
      }
      return {
        headline: weatherSnapshotHeadline(weather, language),
        detail: weatherSnapshotDetail(weather, language),
        timeScope: weather.time_scope,
        updatedAt: weather.generated_at ?? weather.checked_at,
        sources: "FMI",
      };
    }
    case "home_air": {
      const { airQuality } = signals;
      if (!airQuality || isEmptyStatus(airQuality.status)) {
        return null;
      }
      const score = airQuality.worst_score;
      const worstStation = airQuality.stations.find(
        (station) => station.station === airQuality.worst_station,
      );
      const worstStationLabel = worstStation?.label ?? airQuality.worst_station;
      const headline =
        score !== null && score !== undefined
          ? `${scoreLabel(score, airQuality.worst_label, language)} (${Math.round(score)}/5)`
          : airQuality.summary ?? translateMessageKey(language, "shell.airQualityLoaded");
      const reporting = airQuality.quality.reporting_station_count;
      const total = airQuality.quality.station_count;
      const conditionLabel =
        score !== null && score !== undefined
          ? scoreLabel(score, airQuality.worst_label, language)
          : airQuality.worst_label
            ? translateDataLabel(language, airQuality.worst_label)
            : null;
      return {
        headline,
        detail:
          worstStationLabel && conditionLabel
            ? `${worstStationLabel}${copySeparator(language)}${conditionLabel}`
            : `${reporting}/${total} ${translateMessageKey(language, "shell.stations")}`,
        timeScope: airQuality.time_scope,
        updatedAt: airQuality.observed_at ?? airQuality.checked_at,
        sources: "HSY",
      };
    }
    case "commute": {
      const { transit, roadRail } = signals;
      const usableTransit = transit && !isEmptyStatus(transit.status) ? transit : null;
      const usableRoadRail = roadRail && !isEmptyStatus(roadRail.status) ? roadRail : null;
      if (!usableTransit && !usableRoadRail) {
        return null;
      }
      const transitAlerts = usableTransit?.quality.active_alert_count ?? 0;
      const roadEvents = usableRoadRail?.quality.active_event_count ?? 0;
      const total = transitAlerts + roadEvents;
      const headline =
        total > 0
          ? `${total} ${translateMessageKey(language, "shell.activeDisruptions")}`
          : translateMessageKey(language, "shell.noActiveCommuteDisruptions");
      const parts: string[] = [];
      if (usableTransit) {
        parts.push(`${translateMessageKey(language, "shell.navTransit")}: ${transitAlerts}`);
      }
      if (usableRoadRail) {
        parts.push(`${translateMessageKey(language, "shell.navRoadRail")}: ${roadEvents}`);
      }
      return {
        headline,
        detail: parts.join(copySeparator(language)),
        timeScope: usableTransit?.time_scope ?? usableRoadRail?.time_scope,
        updatedAt:
          usableTransit?.observed_at ??
          usableRoadRail?.observed_at ??
          usableTransit?.checked_at ??
          usableRoadRail?.checked_at ??
          null,
        sources: "DIGITRANSIT, DIGITRAFFIC",
      };
    }
    case "energy": {
      const { householdEnergy, systemEnergy } = signals;
      const usableHouseholdEnergy = householdEnergy && !isEmptyStatus(householdEnergy.status)
        ? householdEnergy
        : null;
      const usableSystemEnergy = systemEnergy && !isEmptyStatus(systemEnergy.status)
        ? systemEnergy
        : null;
      const priceWindow = usableHouseholdEnergy?.current_window;
      const systemWindow = usableSystemEnergy?.current_window;
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
      } else if (usableHouseholdEnergy?.summary) {
        details.push(usableHouseholdEnergy.summary);
      } else if (usableSystemEnergy?.summary) {
        details.push(usableSystemEnergy.summary);
      }
      return {
        headline,
        detail: details.join(copySeparator(language)) || translateMessageKey(language, "shell.compareHouseholdPricesWithGridLoad"),
        timeScope: usableHouseholdEnergy?.time_scope ?? usableSystemEnergy?.time_scope,
        updatedAt:
          usableHouseholdEnergy?.observed_at ??
          usableSystemEnergy?.observed_at ??
          usableHouseholdEnergy?.checked_at ??
          usableSystemEnergy?.checked_at ??
          null,
        sources: "PORSSISAHKO, FINGRID",
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
  timeScope?: PlatformTimeScope | null,
): string | null {
  if (!updatedAt) {
    return null;
  }
  const age = scopedDataAge(
    updatedAt,
    timeScope,
    language,
    (key) => translateMessageKey(language, key),
    "shell.notCollected",
    timeZone,
  );
  if (isHistoricalTimeScope(timeScope) || isStaticDemoTimeScope(timeScope)) {
    return `${translateMessageKey(language, "shell.updated")} ${age}`;
  }

  return `${translateMessageKey(language, "shell.updated")} ${age}${copySeparator(language)}${formatTimestamp(updatedAt, "dateTime", language, timeZone)}`;
}
