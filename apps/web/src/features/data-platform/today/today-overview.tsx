"use client";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
import type { PlatformEvent } from "../types";
import { DayPlanTimeline } from "./day-plan-timeline";
import { TodayActionCard } from "./today-action-card";
import type { TodayBrief } from "./today-brief";

export { SCENARIO_NAV_KEYS } from "../scenario-navigation";

type TodayOverviewProps = {
  todayBrief: TodayBrief | null;
  liveSignals: ScenarioLiveSignals;
  planItems: TodayBrief["planItems"];
  isHistorical: boolean;
  language: LanguageMode;
  onOpenSignals: () => void;
  onOpenScenario: (scenarioKey: string) => void;
  onOpenSummaryTile: (tileKey: string) => void;
  onOpenEvent?: (event: PlatformEvent) => void;
};

export function TodayOverview({
  todayBrief,
  liveSignals,
  planItems,
  isHistorical,
  language,
  onOpenSignals,
  onOpenScenario,
  onOpenSummaryTile,
  onOpenEvent,
}: TodayOverviewProps) {
  const { tKey } = useI18n();

  if (!todayBrief) {
    return (
      <section className="today-overview today-overview-empty" aria-label={tKey("shell.navToday")}>
        <span className="material-symbols-outlined" aria-hidden="true">
          cloud_off
        </span>
        <strong>{tKey("shell.scenarioOverviewUnavailable")}</strong>
        <p>{tKey("shell.publicRecommendationsCouldNotBeLoadedTryAgainOrOpenAllSignals")}</p>
        <button className="today-secondary-action" onClick={onOpenSignals} type="button">
          {tKey("shell.openAllSignals")}
        </button>
      </section>
    );
  }

  const focusAction = todayBrief.topActions[0] ?? null;
  const focusTone = focusAction ? severityTone(focusAction.severity) : "good";

  return (
    <section className="today-overview" aria-label={tKey("shell.scenarioOverview")}>
      <section className={`today-command today-command-${focusTone}`}>
        <div className="today-focus">
          <div className="today-eyebrow">
            <span>{tKey("shell.navToday")}</span>
            <span aria-hidden="true">·</span>
            <span>{todayBrief.coverageArea}</span>
          </div>
          <h2>{todayBrief.headline}</h2>
          <p>
            {focusAction?.body ?? tKey("shell.coreDailyScenariosClear")}
          </p>
          <div className="today-focus-footer">
            <span>
              <span className="material-symbols-outlined" aria-hidden="true">
                verified
              </span>
              {tKey("shell.dataChecked")}
              {todayBrief.checkedAt ? (
                <> · {formatTimestamp(todayBrief.checkedAt, "dateTime", language)}</>
              ) : null}
            </span>
            <div className="today-focus-actions">
              {focusAction ? (
                <button
                  className="today-primary-action"
                  onClick={() => onOpenScenario(focusAction.scenario_key)}
                  type="button"
                >
                  {tKey("shell.reviewAction")}
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              ) : null}
              <button className="today-secondary-action" onClick={onOpenSignals} type="button">
                {tKey("shell.openAllSignals")}
              </button>
            </div>
          </div>
        </div>

        <div className="today-glance" aria-label={tKey("shell.todayAtAGlance")}>
          <span className="today-glance-title">{tKey("shell.todayAtAGlance")}</span>
          <div className="today-glance-grid">
            {todayBrief.summaryTiles.map((tile) => (
              <button
                className={`today-glance-item today-glance-item-${tile.tone}`}
                key={tile.key}
                onClick={() => onOpenSummaryTile(tile.key)}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {tile.icon}
                </span>
                <span>
                  <small>{tile.label}</small>
                  <strong>{tile.value}</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {isHistorical ? (
        <div className="today-historical-banner" role="status">
          {tKey("shell.scenarioOverviewHistoricalNote")}
        </div>
      ) : null}

      <div className="today-content-grid">
        <DayPlanTimeline
          items={planItems}
          language={language}
          onOpenEvent={onOpenEvent}
          onOpenScenario={onOpenScenario}
        />

        <section className="today-decisions" aria-label={tKey("shell.dailyDecisions")}>
          <header>
            <div>
              <span className="today-section-kicker">{tKey("shell.dailyDecisions")}</span>
              <h3>{tKey("shell.dailyDecisionsLead")}</h3>
            </div>
          </header>
          <div className="today-action-grid">
            {todayBrief.scenarioSections.map((section) => (
              <TodayActionCard
                key={section.key}
                language={language}
                liveSignals={liveSignals}
                section={section}
                onOpen={() => onOpenScenario(section.key)}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
