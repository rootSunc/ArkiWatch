import type { LanguageMode } from "./i18n";
import { translateText } from "./i18n";
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
  const t = (value: string) => translateText(language, value);

  const weatherWarnings = signals.weather?.warnings.length ?? 0;
  const weatherValue = signals.weather
    ? weatherSnapshotHeadline(signals.weather, language)
    : t("n/a");
  const weatherDetail = signals.weather
    ? weatherSnapshotDetail(signals.weather, language)
    : t("No weather feed");
  const weatherTone: UserSummaryTile["tone"] =
    weatherWarnings > 0 ? "warn" : signals.weather ? "good" : "neutral";

  const airScore = signals.airQuality?.worst_score;
  const airValue =
    airScore !== null && airScore !== undefined
      ? `${scoreLabel(airScore, signals.airQuality?.worst_label, language)}`
      : t("n/a");
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
    : t("n/a");
  const energyTone: UserSummaryTile["tone"] = energyWindow ? "good" : "neutral";

  return [
    {
      key: "outdoor",
      label: t("Outdoor"),
      value: weatherValue,
      detail: weatherDetail,
      tone: weatherTone,
      icon: "wb_sunny",
      valueStyle: "emphasis",
    },
    {
      key: "air",
      label: t("Home air"),
      value: airValue,
      detail: signals.airQuality?.worst_station ?? t("Station network"),
      tone: airTone,
      icon: "air",
      valueStyle: "emphasis",
    },
    {
      key: "commute",
      label: t("Commute"),
      value:
        commuteTotal > 0
          ? `${commuteTotal} ${t("active")}`
          : t("All clear"),
      detail: `${t("Transit")} ${transitAlerts} · ${t("Road & Rail")} ${roadEvents}`,
      tone: commuteTone,
      icon: "commute",
      valueStyle: "emphasis",
    },
    {
      key: "energy",
      label: t("Energy"),
      value: energyValue,
      detail: priceWindow
        ? t("Current household price window")
        : systemWindow
          ? t("Current system energy window")
        : t("No price window"),
      tone: energyTone,
      icon: "bolt",
      valueStyle: "emphasis",
    },
  ];
}
