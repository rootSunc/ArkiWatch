"use client";

import { formatTimestamp } from "@/features/shared/format";

import { LanguageMode, translateEnumLabel, translateMessageKey, useI18n } from "./i18n";
import {
  buildScenarioLiveHint,
  formatScenarioHintAge,
  type ScenarioLiveSignals,
} from "./scenario-live-hints";
import { DayPlanTimeline } from "./day-plan-timeline";
import type { TodayBrief } from "./today-brief";
import { isPlaceholderRecommendation } from "./today-brief";
import type { PlatformEvent, PublicScenarioSectionRead } from "./types";

export { SCENARIO_NAV_KEYS } from "./scenario-navigation";

const SCENARIO_ICONS: Record<string, string> = {
  outdoor: "wb_sunny",
  commute: "commute",
  home_air: "air",
  energy: "bolt",
};

type ScenarioOverviewProps = {
  todayBrief: TodayBrief | null;
  liveSignals: ScenarioLiveSignals;
  planItems: TodayBrief["planItems"];
  isHistorical: boolean;
  language: LanguageMode;
  onOpenSignals: () => void;
  onOpenScenario: (scenarioKey: string) => void;
  onOpenSummaryTile: (tileKey: string) => void;
  onOpenEvent?: (event: PlatformEvent) => void;
  onOpenTopAction?: (scenarioKey: string) => void;
};

type SignalMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

type ScenarioDataPoint = {
  label: string;
  value: string;
};

function cardToneClass(severity: string, isPlaceholder: boolean): string {
  if (isPlaceholder) {
    return "scenario-card-neutral";
  }
  switch (severity.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return "scenario-card-bad";
    case "MEDIUM":
      return "scenario-card-warn";
    case "LOW":
    case "INFO":
      return "scenario-card-good";
    default:
      return "scenario-card-neutral";
  }
}

function findMetric(metrics: SignalMetric[] | undefined, key: string): SignalMetric | null {
  return metrics?.find((metric) => metric.key === key) ?? null;
}

function formatMetricValue(metric: SignalMetric | null, language: LanguageMode): string | null {
  if (!metric || metric.value.toLowerCase() === "n/a") {
    return null;
  }

  const value = metric.value.replace(/\s+to\s+/i, ` ${translateEnumLabel(language, "to")} `);
  if (!metric.unit) {
    return value;
  }

  const unit = metric.unit.trim();
  if (unit === "C") {
    return `${value} °C`;
  }
  if (unit === "%") {
    return `${value}%`;
  }
  return `${value} ${unit}`;
}

function formatShortTime(value: string | null, language: LanguageMode): string | null {
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

function formatNumberValue(value: number | null | undefined, digits = 1): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(digits);
}

function formatPollutantValue(value: number | null | undefined): string | null {
  const formatted = formatNumberValue(value, 1);
  return formatted ? `${formatted} ug/m3` : null;
}

function formatEnergyValue(
  value: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const formatted = formatNumberValue(value, 2);
  if (!formatted) {
    return null;
  }
  return unit ? `${formatted} ${unit}` : formatted;
}

function appendDataPoint(
  points: ScenarioDataPoint[],
  label: string,
  value: string | null | undefined,
): void {
  if (!value) {
    return;
  }
  points.push({ label, value });
}

function buildScenarioDataPoints(
  scenarioKey: string,
  signals: ScenarioLiveSignals,
  language: LanguageMode,
): ScenarioDataPoint[] {
  const shell = (key: string) => translateMessageKey(language, key);
  const points: ScenarioDataPoint[] = [];

  switch (scenarioKey) {
    case "outdoor": {
      const { weather } = signals;
      if (!weather) {
        return points;
      }
      appendDataPoint(points, shell("shell.wind"), formatMetricValue(findMetric(weather.metrics, "peak_wind"), language));
      appendDataPoint(points, shell("shell.gust"), formatMetricValue(findMetric(weather.metrics, "peak_gust"), language));
      appendDataPoint(
        points,
        weather.warnings.length > 0 ? shell("shell.warnings") : shell("shell.rainWindows"),
        weather.warnings.length > 0
          ? String(weather.warnings.length)
          : String(weather.quality.rain_window_count),
      );
      appendDataPoint(points, shell("shell.humidity"), formatMetricValue(findMetric(weather.metrics, "humidity"), language));
      break;
    }
    case "home_air": {
      const { airQuality } = signals;
      if (!airQuality) {
        return points;
      }
      const referenceStation =
        airQuality.stations.find((station) => station.station === airQuality.worst_station) ??
        airQuality.stations.find((station) => station.score === airQuality.worst_score) ??
        airQuality.stations[0];
      appendDataPoint(
        points,
        shell("shell.stations"),
        `${airQuality.quality.reporting_station_count}/${airQuality.quality.station_count}`,
      );
      appendDataPoint(points, shell("shell.coverage"), `${airQuality.quality.field_coverage_pct.toFixed(0)}%`);
      appendDataPoint(points, "PM2.5", formatPollutantValue(referenceStation?.pm2_5));
      appendDataPoint(points, "NO2", formatPollutantValue(referenceStation?.no2));
      break;
    }
    case "commute": {
      const { transit, roadRail } = signals;
      if (!transit && !roadRail) {
        return points;
      }
      appendDataPoint(points, shell("shell.navTransit"), String(transit?.quality.active_alert_count ?? 0));
      appendDataPoint(points, shell("shell.navRoadRail"), String(roadRail?.quality.active_event_count ?? 0));
      appendDataPoint(points, shell("shell.weatherRisk"), String(roadRail?.quality.weather_risk_count ?? 0));
      appendDataPoint(points, shell("shell.corridors"), String(roadRail?.quality.corridor_count ?? 0));
      break;
    }
    case "energy": {
      const activeEnergy = signals.householdEnergy?.current_window
        ? signals.householdEnergy
        : signals.householdEnergy ?? signals.systemEnergy;
      const window = activeEnergy?.current_window;
      const unit = window?.unit ?? activeEnergy?.unit ?? null;
      const startsAt = formatShortTime(window?.starts_at ?? null, language);
      const endsAt = formatShortTime(window?.ends_at ?? null, language);
      appendDataPoint(points, shell("shell.window"), startsAt && endsAt ? `${startsAt}-${endsAt}` : null);
      appendDataPoint(points, shell("shell.average"), formatEnergyValue(window?.average_value, unit));
      appendDataPoint(points, shell("shell.low"), formatEnergyValue(window?.minimum_value, unit));
      appendDataPoint(
        points,
        shell("shell.cost"),
        window?.estimated_cost_eur !== null && window?.estimated_cost_eur !== undefined
          ? `${window.estimated_cost_eur.toFixed(2)} EUR`
          : null,
      );
      if (!window && activeEnergy) {
        appendDataPoint(points, shell("shell.points"), String(activeEnergy.quality.point_count));
        appendDataPoint(points, shell("shell.low"), formatEnergyValue(activeEnergy.quality.minimum_value, unit));
        appendDataPoint(points, shell("shell.peak"), formatEnergyValue(activeEnergy.quality.maximum_value, unit));
        appendDataPoint(points, shell("shell.coverage"), `${activeEnergy.quality.field_coverage_pct.toFixed(0)}%`);
      }
      break;
    }
    default:
      break;
  }

  return points.slice(0, 4);
}

function ScenarioCard({
  section,
  liveSignals,
  language,
  onOpen,
  tKey,
}: {
  section: PublicScenarioSectionRead;
  liveSignals: ScenarioLiveSignals;
  language: LanguageMode;
  onOpen: () => void;
  tKey: (key: string) => string;
}) {
  const rec = section.recommendation;
  const placeholder = isPlaceholderRecommendation(rec.id, rec.body);
  const liveHint = buildScenarioLiveHint(section.key, liveSignals, language);
  const toneClass = cardToneClass(rec.severity, placeholder && !liveHint);
  const icon = SCENARIO_ICONS[section.key] ?? "insights";
  const title = placeholder && liveHint ? liveHint.headline : section.status_label;
  const body =
    placeholder && liveHint
      ? liveHint.detail
      : rec.body || section.description;
  const sourcesLabel =
    placeholder && liveHint ? liveHint.sources : section.source_codes.map((c) => c.toUpperCase()).join(" · ");
  const updatedLine = formatScenarioHintAge(
    placeholder && liveHint ? liveHint.updatedAt : rec.valid_from,
    language,
  );
  const dataPoints = buildScenarioDataPoints(section.key, liveSignals, language);

  return (
    <button className={`scenario-card ${toneClass}`} onClick={onOpen} type="button">
      <div className="scenario-card-kicker">
        <span>{section.title}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      </div>
      {placeholder && liveHint ? (
        <span className="scenario-card-live-badge">{tKey("shell.liveSignal")}</span>
      ) : null}
      <h3 className="scenario-card-title">{title}</h3>
      <p className="scenario-card-body">{body}</p>
      {dataPoints.length > 0 ? (
        <dl className="scenario-card-data-grid">
          {dataPoints.map((point) => (
            <div key={`${section.key}-${point.label}`}>
              <dt>{point.label}</dt>
              <dd>{point.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="scenario-card-meta">
        {placeholder && liveHint ? (
          updatedLine ? <span>{updatedLine}</span> : null
        ) : (
          <>
            <span>
              {tKey("shell.valid")}{" "}
              {formatTimestamp(rec.valid_from, "dateTime", language)} –{" "}
              {formatTimestamp(rec.valid_to, "dateTime", language)}
            </span>
            <span>
              {translateEnumLabel(language, rec.freshness_state)}{" · "}
              {translateEnumLabel(language, rec.area_scope)}
            </span>
          </>
        )}
      </div>
      <div className="scenario-card-sources">
        {tKey("shell.sources")}: {sourcesLabel}
      </div>
      <span className="scenario-card-cta">{tKey("shell.viewDetails")} →</span>
    </button>
  );
}

export function ScenarioOverview({
  todayBrief,
  liveSignals,
  planItems,
  isHistorical,
  language,
  onOpenSignals,
  onOpenScenario,
  onOpenSummaryTile,
  onOpenEvent,
  onOpenTopAction,
}: ScenarioOverviewProps) {
  const { tKey } = useI18n();

  if (!todayBrief) {
    return (
      <section className="scenario-overview-page" aria-label={tKey("shell.navToday")}>
        <div className="scenario-empty">
          <strong>{tKey("shell.scenarioOverviewUnavailable")}</strong>
          <p>{tKey("shell.publicRecommendationsCouldNotBeLoadedTryAgainOrOpenAllSignals")}</p>
          <div className="scenario-overview-actions" style={{ marginTop: "0.75rem", justifyContent: "center" }}>
            <button onClick={onOpenSignals} type="button">
              {tKey("shell.openAllSignals")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const sections = todayBrief.scenarioSections;
  const topActions = todayBrief.topActions;

  return (
    <section className="scenario-overview-page" aria-label={tKey("shell.scenarioOverview")}>
      <header className="scenario-overview-header">
        <div>
          <h2>{tKey("shell.navToday")}</h2>
          <strong className="scenario-overview-headline">{todayBrief.headline}</strong>
          <p>
            {tKey("shell.scenarioOverviewLead")}{" "}
            <strong>{todayBrief.coverageArea}</strong>
            {todayBrief.checkedAt ? (
              <>
                {" "}
                · {tKey("shell.updated")}{" "}
                {formatTimestamp(todayBrief.checkedAt, "dateTime", language)}
              </>
            ) : null}
          </p>
        </div>
        <div className="scenario-overview-actions">
          <button onClick={onOpenSignals} type="button">
            {tKey("shell.openAllSignals")}
          </button>
        </div>
      </header>

      {isHistorical ? (
        <div className="scenario-historical-banner" role="status">
          {tKey("shell.scenarioOverviewHistoricalNote")}
        </div>
      ) : null}

      <section
        className="summary-grid summary-grid-user today-brief-summary"
        aria-label={tKey("shell.todaySSnapshot")}
      >
        {todayBrief.summaryTiles.map((tile) => (
          <button
            className={`metric-tile metric-tile-${tile.tone} metric-tile-link`}
            key={tile.key}
            onClick={() => onOpenSummaryTile(tile.key)}
            type="button"
          >
            <div>
              <span>{tile.label}</span>
              <span className="material-symbols-outlined" aria-hidden="true">
                {tile.icon}
              </span>
            </div>
            <strong
              className={
                tile.valueStyle === "emphasis"
                  ? "metric-tile-value-emphasis"
                  : "metric-tile-value-body"
              }
            >
              {tile.value}
            </strong>
            <small className="metric-tile-detail">{tile.detail}</small>
          </button>
        ))}
      </section>

      <DayPlanTimeline
        items={planItems}
        language={language}
        onOpenEvent={onOpenEvent}
        onOpenScenario={onOpenScenario}
      />

      {topActions.length > 0 ? (
        <section className="scenario-top-actions" aria-label={tKey("shell.topActions")}>
          {topActions.slice(0, 3).map((action) => (
            <button
              className={`scenario-top-action scenario-top-action-${action.severity.toLowerCase()}`}
              key={action.id}
              onClick={() => onOpenTopAction?.(action.scenario_key)}
              type="button"
            >
              <strong>{action.title}</strong>
              <p>{action.body}</p>
              <span className="scenario-card-cta">{tKey("shell.viewDetails")} →</span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="scenario-card-grid">
        {sections.map((section) => (
          <ScenarioCard
            key={section.key}
            language={language}
            liveSignals={liveSignals}
            section={section}
            tKey={tKey}
            onOpen={() => onOpenScenario(section.key)}
          />
        ))}
      </div>
    </section>
  );
}
