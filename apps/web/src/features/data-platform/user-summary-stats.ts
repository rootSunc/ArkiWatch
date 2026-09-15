import type { LanguageMode } from "./i18n";
import { translateDataLabel, translateMessageKey } from "./i18n";
import type {
  BriefingDecision,
  AirQualityCurrentResponse,
  EnergyCurrentResponse,
  RoadRailCurrentResponse,
  TransitCurrentResponse,
  WeatherForecastResponse,
} from "./types";
import {
  weatherSnapshotDetail,
  weatherSnapshotHeadline,
} from "./weather-snapshot-display";
import { isEmptyStatus } from "./platform-status";

export type UserSummaryTile = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "neutral";
  icon: string;
  valueStyle?: "emphasis" | "body";
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

export function buildUserSummaryTiles(
  signals: {
    weather: WeatherForecastResponse | null;
    airQuality: AirQualityCurrentResponse | null;
    transit: TransitCurrentResponse | null;
    roadRail: RoadRailCurrentResponse | null;
    householdEnergy: EnergyCurrentResponse | null;
    systemEnergy?: EnergyCurrentResponse | null;
  },
  language: LanguageMode,
  summary?: BriefingDecision["summary"],
): UserSummaryTile[] {
  const weather = signals.weather && !isEmptyStatus(signals.weather.status) ? signals.weather : null;
  const airQuality = signals.airQuality && !isEmptyStatus(signals.airQuality.status)
    ? signals.airQuality
    : null;


  const householdEnergy = signals.householdEnergy && !isEmptyStatus(signals.householdEnergy.status)
    ? signals.householdEnergy
    : null;
  const systemEnergy = signals.systemEnergy && !isEmptyStatus(signals.systemEnergy.status)
    ? signals.systemEnergy
    : null;

  const weatherValue = weather
    ? weatherSnapshotHeadline(weather, language)
    : translateMessageKey(language, "shell.na");
  const weatherDetail = weather
    ? weatherSnapshotDetail(weather, language)
    : translateMessageKey(language, "shell.noWeatherFeed");
  const weatherTone = summary?.tones.outdoor ?? "neutral";

  const airScore = airQuality?.worst_score;
  const airStation = airQuality?.stations.find(
    (station) => station.station === airQuality.worst_station,
  )?.label ?? airQuality?.worst_station;
  const airValue =
    airScore !== null && airScore !== undefined
      ? `${scoreLabel(airScore, airQuality?.worst_label, language)}`
      : translateMessageKey(language, "shell.na");
  const airTone = summary?.tones.air ?? "neutral";
  const transitAlerts = summary?.transit_alerts ?? 0;
  const roadEvents = summary?.road_events ?? 0;
  const commuteAvailable = summary?.commute_available ?? false;
  const commuteTotal = summary?.commute_total ?? 0;
  const commuteTone = summary?.tones.commute ?? "neutral";

  const priceWindow = householdEnergy?.current_window;
  const systemWindow = systemEnergy?.current_window;
  const energyValue = priceWindow
    ? `${priceWindow.average_value.toFixed(2)}${priceWindow.unit ? ` ${priceWindow.unit}` : ""}`
    : systemWindow
      ? `${systemWindow.average_value.toFixed(2)}${systemWindow.unit ? ` ${systemWindow.unit}` : ""}`
    : translateMessageKey(language, "shell.na");
  const energyTone = summary?.tones.energy ?? "neutral";

  return [
    {
      key: "outdoor",
      label: translateMessageKey(language, "shell.outdoor"),
      value: weatherValue,
      detail: weatherDetail,
      tone: weatherTone,
      icon: "wb_sunny",
      valueStyle: "emphasis",
    },
    {
      key: "air",
      label: translateMessageKey(language, "shell.homeAir"),
      value: airValue,
      detail: airStation ?? translateMessageKey(language, "shell.stationNetwork"),
      tone: airTone,
      icon: "air",
      valueStyle: "emphasis",
    },
    {
      key: "commute",
      label: translateMessageKey(language, "shell.commute"),
      value:
        !commuteAvailable
          ? translateMessageKey(language, "shell.na")
          : commuteTotal > 0
          ? `${commuteTotal} ${translateMessageKey(language, "shell.active")}`
          : translateMessageKey(language, "shell.allClear"),
      detail: commuteAvailable
        ? `${translateMessageKey(language, "shell.navTransit")} ${transitAlerts} · ${translateMessageKey(language, "shell.navRoadRail")} ${roadEvents}`
        : translateMessageKey(language, "shell.na"),
      tone: commuteTone,
      icon: "commute",
      valueStyle: "emphasis",
    },
    {
      key: "energy",
      label: translateMessageKey(language, "shell.navEnergy"),
      value: energyValue,
      detail: priceWindow
        ? translateMessageKey(language, "shell.currentHouseholdPriceWindow")
        : systemWindow
          ? translateMessageKey(language, "shell.currentSystemEnergyWindow")
        : translateMessageKey(language, "shell.noPriceWindow"),
      tone: energyTone,
      icon: "bolt",
      valueStyle: "emphasis",
    },
  ];
}
