import type { LanguageMode } from "../i18n";
import { translateEnumLabel, translateMessageKey } from "../i18n";
import {
  buildScenarioLiveHint,
  formatScenarioHintAge,
  type ScenarioLiveSignals,
} from "../scenario-live-hints";
import { localizedContent } from "../content-localization";
import type { PublicScenarioSectionRead } from "../types";
import {
  isPlaceholderRecommendation,
  type TodayRecommendationMode,
} from "./today-brief";

export type TodayActionTone = "good" | "warn" | "bad" | "neutral";

export type TodayActionDataPoint = {
  label: string;
  value: string;
};

export type TodayActionCardView = {
  body: string;
  dataPoints: TodayActionDataPoint[];
  detail: string | null;
  icon: string;
  signalLabel: string | null;
  sources: string;
  title: string;
  tone: TodayActionTone;
};

type SignalMetric = {
  key: string;
  value: string;
  unit: string | null;
};

const SCENARIO_ICONS: Record<string, string> = {
  outdoor: "wb_sunny",
  commute: "commute",
  home_air: "air",
  energy: "bolt",
};

export function recommendationTone(severity: string, isPlaceholder: boolean): TodayActionTone {
  if (isPlaceholder) {
    return "neutral";
  }

  switch (severity.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return "bad";
    case "MEDIUM":
      return "warn";
    case "LOW":
    case "INFO":
      return "good";
    default:
      return "neutral";
  }
}

function findMetric(metrics: SignalMetric[] | undefined, key: string): SignalMetric | null {
  return metrics?.find((metric) => metric.key === key) ?? null;
}

function formatMetric(metric: SignalMetric | null, language: LanguageMode): string | null {
  if (!metric || metric.value.toLowerCase() === "n/a") {
    return null;
  }

  const value = metric.value.replace(
    /\s+to\s+/i,
    ` ${translateEnumLabel(language, "to")} `,
  );
  if (!metric.unit) {
    return value;
  }
  if (metric.unit.trim() === "C") {
    return `${value} °C`;
  }
  if (metric.unit.trim() === "%") {
    return `${value}%`;
  }
  return `${value} ${metric.unit.trim()}`;
}

function formatNumber(value: number | null | undefined, digits = 1): string | null {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : value.toFixed(digits);
}

function formatTime(value: string | null, language: LanguageMode): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function addPoint(
  points: TodayActionDataPoint[],
  label: string,
  value: string | null | undefined,
): void {
  if (value && points.length < 2) {
    points.push({ label, value });
  }
}

export function buildActionDataPoints(
  scenarioKey: string,
  signals: ScenarioLiveSignals,
  language: LanguageMode,
): TodayActionDataPoint[] {
  const t = (key: string) => translateMessageKey(language, key);
  const points: TodayActionDataPoint[] = [];

  if (scenarioKey === "outdoor" && signals.weather) {
    addPoint(points, t("shell.wind"), formatMetric(findMetric(signals.weather.metrics, "peak_wind"), language));
    addPoint(
      points,
      signals.weather.warnings.length > 0 ? t("shell.warnings") : t("shell.rainWindows"),
      String(
        signals.weather.warnings.length > 0
          ? signals.weather.warnings.length
          : signals.weather.quality.rain_window_count,
      ),
    );
  }

  if (scenarioKey === "home_air" && signals.airQuality) {
    const station =
      signals.airQuality.stations.find(
        (item) => item.station === signals.airQuality?.worst_station,
      ) ?? signals.airQuality.stations[0];
    addPoint(points, "PM2.5", formatNumber(station?.pm2_5) ? `${formatNumber(station?.pm2_5)} ug/m3` : null);
    addPoint(points, "NO2", formatNumber(station?.no2) ? `${formatNumber(station?.no2)} ug/m3` : null);
  }

  if (scenarioKey === "commute" && (signals.transit || signals.roadRail)) {
    addPoint(points, t("shell.navTransit"), String(signals.transit?.quality.active_alert_count ?? 0));
    addPoint(points, t("shell.navRoadRail"), String(signals.roadRail?.quality.active_event_count ?? 0));
  }

  if (scenarioKey === "energy") {
    const energy = signals.householdEnergy ?? signals.systemEnergy;
    const window = energy?.current_window;
    const startsAt = formatTime(window?.starts_at ?? null, language);
    const endsAt = formatTime(window?.ends_at ?? null, language);
    addPoint(points, t("shell.window"), startsAt && endsAt ? `${startsAt}–${endsAt}` : null);
    addPoint(
      points,
      t("shell.average"),
      window
        ? `${window.average_value.toFixed(2)}${window.unit ? ` ${window.unit}` : ""}`
        : null,
    );
  }

  return points;
}

export function buildTodayActionCardView(
  section: PublicScenarioSectionRead,
  signals: ScenarioLiveSignals,
  language: LanguageMode,
  recommendationMode: TodayRecommendationMode = "live",
): TodayActionCardView {
  const recommendation = section.recommendation;
  const isPlaceholder = isPlaceholderRecommendation(recommendation.id, recommendation.body);
  const liveHint = buildScenarioLiveHint(section.key, signals, language);
  const isScopeLimited = recommendationMode !== "live";
  const isSignalFallback = isScopeLimited ? Boolean(liveHint) : isPlaceholder && Boolean(liveHint);
  const limitedTitle =
    recommendationMode === "historical"
      ? translateMessageKey(language, "shell.historicalSignalOnly")
      : translateMessageKey(language, "shell.noScopedRecommendation");
  const limitedBody =
    recommendationMode === "historical"
      ? translateMessageKey(language, "shell.historicalDataDisclaimer")
      : translateMessageKey(language, "shell.openSignalWorkspaceForGuidance");

  return {
    body: isSignalFallback
      ? liveHint?.detail ?? localizedContent(language, section.description, section.description_zh)
      : isScopeLimited
        ? limitedBody
        : localizedContent(
            language,
            recommendation.body || section.description,
            recommendation.body
              ? recommendation.body_zh
              : section.description_zh,
          ),
    dataPoints: buildActionDataPoints(section.key, signals, language),
    detail: isSignalFallback
      ? formatScenarioHintAge(liveHint?.updatedAt ?? null, language)
      : isScopeLimited
        ? null
        : `${translateEnumLabel(language, recommendation.freshness_state)} · ${translateEnumLabel(
            language,
            recommendation.area_scope,
          )}`,
    icon: SCENARIO_ICONS[section.key] ?? "hub",
    signalLabel: isSignalFallback
      ? translateMessageKey(
          language,
          recommendationMode === "historical" ? "shell.historicalSignal" : "shell.liveSignal",
        )
      : null,
    sources: isSignalFallback
      ? liveHint?.sources ?? ""
      : isScopeLimited
        ? ""
        : section.source_codes.map((source) => source.toUpperCase()).join(" · "),
    title: isSignalFallback
      ? liveHint?.headline ?? localizedContent(language, section.status_label, section.status_label_zh)
      : isScopeLimited
        ? limitedTitle
        : localizedContent(language, section.status_label, section.status_label_zh),
    tone: isScopeLimited
      ? "neutral"
      : recommendationTone(recommendation.severity, isPlaceholder && !liveHint),
  };
}
