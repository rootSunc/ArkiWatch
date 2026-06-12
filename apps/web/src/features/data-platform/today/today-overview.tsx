"use client";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import { localizedContent } from "../content-localization";
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
  isScopePending: boolean;
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
  isScopePending,
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
          cloud
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
  const isRecommendationLimited = todayBrief.recommendationMode !== "live";
  const focusTone = focusAction && !isRecommendationLimited
    ? severityTone(focusAction.severity)
    : "neutral";
  const limitedModeLabel =
    todayBrief.recommendationMode === "historical"
      ? tKey("shell.historicalRecommendationsReadOnly")
      : tKey("shell.recommendationsUnavailableForScope");
  const limitedModeDetail =
    todayBrief.recommendationMode === "historical"
      ? tKey("shell.historicalRecommendationsReadOnlyDetail")
      : tKey("shell.recommendationsUnavailableForScopeDetail");

  return (
    <section
      className={`today-overview${isScopePending ? " today-overview-scope-pending" : ""}`}
      aria-busy={isScopePending}
      aria-label={tKey("shell.scenarioOverview")}
    >
      <section className={`today-command today-command-${focusTone}`}>
        <div className="today-focus">
          <div className="today-eyebrow">
            <span>{tKey("shell.navToday")}</span>
            <span aria-hidden="true">·</span>
            <span>{todayBrief.coverageArea}</span>
          </div>
          {todayBrief.recommendationCoverageArea ? (
            <p className="today-scope-note" role="note">
              {tKey("shell.publicRecommendationsScope")} {todayBrief.recommendationCoverageArea}
            </p>
          ) : null}
          <h2>{todayBrief.headline}</h2>
          <p>
            {focusAction
              ? localizedContent(language, focusAction.body, focusAction.body_zh)
              :
              (isRecommendationLimited
                ? limitedModeDetail
                : tKey("shell.coreDailyScenariosClear"))}
          </p>
          <div className="today-focus-footer">
            <span>
              <span className="material-symbols-outlined" aria-hidden="true">
                check_circle
              </span>
              {tKey(
                todayBrief.recommendationMode === "historical"
                  ? "shell.historicalSnapshotGenerated"
                  : "shell.dataChecked",
              )}
              {todayBrief.checkedAt ? (
                <> · {formatTimestamp(todayBrief.checkedAt, "dateTime", language)}</>
              ) : null}
            </span>
            <div className="today-focus-actions">
              {focusAction && !isRecommendationLimited ? (
                <button
                  className="today-primary-action"
                  onClick={() => onOpenScenario(focusAction.scenario_key)}
                  disabled={isScopePending}
                  type="button"
                >
                  {tKey("shell.reviewAction")}
                  <span className="material-symbols-outlined" aria-hidden="true">
                    chevron_right
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
                disabled={isScopePending}
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

      {isRecommendationLimited ? (
        <div className="today-recommendation-limit" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            info
          </span>
          <span>
            <strong>{limitedModeLabel}</strong>
            <span>{limitedModeDetail}</span>
          </span>
        </div>
      ) : null}

      <div className="today-content-grid">
        <DayPlanTimeline
          disabled={isScopePending}
          items={planItems}
          language={language}
          recommendationMode={todayBrief.recommendationMode}
          onOpenEvent={onOpenEvent}
          onOpenScenario={onOpenScenario}
        />

        {todayBrief.scenarioSections.length > 0 ? (
          <details
            className="today-decisions"
            aria-label={tKey(isRecommendationLimited ? "shell.localSignals" : "shell.dailyDecisions")}
          >
            <summary className="today-decisions-summary">
              <span className="today-decisions-summary-copy">
                <span className="today-section-kicker">
                  {tKey(isRecommendationLimited ? "shell.localSignals" : "shell.dailyDecisions")}
                </span>
                <span className="today-decisions-title">
                  {isRecommendationLimited
                    ? tKey("shell.localSignalsOnlyLead")
                    : tKey("shell.dailyDecisionsLead")}
                </span>
              </span>
              <span className="today-decisions-summary-meta">
                <span>{todayBrief.scenarioSections.length}</span>
                <span className="material-symbols-outlined" aria-hidden="true">
                  expand_more
                </span>
              </span>
            </summary>
            <div className="today-action-grid">
              {todayBrief.scenarioSections.map((section) => (
                <TodayActionCard
                  disabled={isScopePending}
                  key={section.key}
                  language={language}
                  liveSignals={liveSignals}
                  recommendationMode={todayBrief.recommendationMode}
                  section={section}
                  onOpen={() => onOpenScenario(section.key)}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
