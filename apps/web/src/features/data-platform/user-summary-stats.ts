import type { LanguageMode } from "./i18n";
import { translateDataLabel, translateMessageKey } from "./i18n";
import type {
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
): UserSummaryTile[] {

  const weatherWarnings = signals.weather?.warnings.length ?? 0;
  const weatherValue = signals.weather
    ? weatherSnapshotHeadline(signals.weather, language)
    : translateMessageKey(language, "shell.na");
  const weatherDetail = signals.weather
    ? weatherSnapshotDetail(signals.weather, language)
    : translateMessageKey(language, "shell.noWeatherFeed");
  const weatherTone: UserSummaryTile["tone"] =
    weatherWarnings > 0 ? "warn" : signals.weather ? "good" : "neutral";

  const airScore = signals.airQuality?.worst_score;
  const airValue =
    airScore !== null && airScore !== undefined
      ? `${scoreLabel(airScore, signals.airQuality?.worst_label, language)}`
      : translateMessageKey(language, "shell.na");
  const airTone: UserSummaryTile["tone"] =
    airScore !== null && airScore !== undefined && airScore >= 4
      ? "bad"
      : airScore !== null && airScore !== undefined && airScore >= 3
        ? "warn"
        : signals.airQuality
          ? "good"
          : "neutral";

  const transitAlerts = signals.transit?.quality.active_alert_count ?? 0;
  const roadEvents = signals.roadRail?.quality.active_event_count ?? 0;
  const commuteTotal = transitAlerts + roadEvents;
  const commuteTone: UserSummaryTile["tone"] =
    commuteTotal > 0 ? "warn" : signals.transit || signals.roadRail ? "good" : "neutral";

  const priceWindow = signals.householdEnergy?.current_window;
  const systemWindow = signals.systemEnergy?.current_window;
  const energyWindow = priceWindow ?? systemWindow;
  const energyValue = priceWindow
    ? `${priceWindow.average_value.toFixed(2)}${priceWindow.unit ? ` ${priceWindow.unit}` : ""}`
    : systemWindow
      ? `${systemWindow.average_value.toFixed(2)}${systemWindow.unit ? ` ${systemWindow.unit}` : ""}`
    : translateMessageKey(language, "shell.na");
  const energyTone: UserSummaryTile["tone"] = energyWindow ? "good" : "neutral";

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
      detail: signals.airQuality?.worst_station ?? translateMessageKey(language, "shell.stationNetwork"),
      tone: airTone,
      icon: "air",
      valueStyle: "emphasis",
    },
    {
      key: "commute",
      label: translateMessageKey(language, "shell.commute"),
      value:
        commuteTotal > 0
          ? `${commuteTotal} ${translateMessageKey(language, "shell.active")}`
          : translateMessageKey(language, "shell.allClear"),
      detail: `${translateMessageKey(language, "shell.navTransit")} ${transitAlerts} · ${translateMessageKey(language, "shell.navRoadRail")} ${roadEvents}`,
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
