"use client";

import { formatTimestamp, severityTone } from "@/features/shared/format";
import { MaterialIcon } from "@/features/shared/material-icon";

import { localizedContent } from "../content-localization";
import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import { platformErrorMessage } from "../platform-error";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
import type { PlatformEvent } from "../types";
import { DayPlanTimeline } from "./day-plan-timeline";
import { PersonalContextStrip } from "./personal-context-strip";
import { PersonalTodayCards } from "./personal-today-cards";
import { TodayActionCard } from "./today-action-card";
import type { TodayBrief } from "./today-brief";
import type { PersonalDashboardRead } from "../personal-dashboard";

export { SCENARIO_NAV_KEYS } from "../scenario-navigation";

type TodayOverviewProps = {
  todayBrief: TodayBrief | null;
  liveSignals: ScenarioLiveSignals;
  planItems: TodayBrief["planItems"];
  personalDashboard: PersonalDashboardRead | null;
  personalDashboardError?: string | null;
  isHistorical: boolean;
  now?: number;
  sourceIssueCount: number;
  isScopePending: boolean;
  language: LanguageMode;
  onOpenSignals: () => void;
  onOpenScenario: (scenarioKey: string) => void;
  onOpenSummaryTile: (tileKey: string) => void;
  onOpenAssistant: (question?: string) => void;
  onOpenSettings?: () => void;
  onOpenEvent?: (event: PlatformEvent) => void;
  onRetryPersonalDashboard?: () => void;
};

export function TodayOverview({
  todayBrief,
  liveSignals,
  planItems,
  personalDashboard,
  personalDashboardError,
  isHistorical,
  now,
  sourceIssueCount,
  isScopePending,
  language,
  onOpenSignals,
  onOpenScenario,
  onOpenSummaryTile,
  onOpenAssistant,
  onOpenSettings,
  onOpenEvent,
  onRetryPersonalDashboard,
}: TodayOverviewProps) {
  const { enumLabel, tKey } = useI18n();
  const localizedPersonalDashboardError = personalDashboardError
    ? platformErrorMessage(personalDashboardError, tKey)
    : null;

  if (!todayBrief) {
    return (
      <section className="today-overview today-overview-empty" aria-label={tKey("shell.navToday")}>
        <span className="material-symbols-outlined" aria-hidden="true">
          cloud
        </span>
        <h1>{tKey("shell.scenarioOverviewUnavailable")}</h1>
        <p>{tKey("shell.publicRecommendationsCouldNotBeLoadedTryAgainOrOpenAllSignals")}</p>
        <button className="today-secondary-action" onClick={onOpenSignals} type="button">
          {tKey("shell.openAllSignals")}
        </button>
      </section>
    );
  }

  if (!todayBrief.hasScopedData) {
    return (
      <section
        className="today-overview today-overview-empty"
        aria-label={tKey("shell.navToday")}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          database
        </span>
        <h1>{tKey("shell.noSignalDataForScope")}</h1>
        <p>{tKey("shell.noSignalDataForScopeDetail")}</p>
        <button className="today-secondary-action" onClick={onOpenSignals} type="button">
          {tKey("shell.openAllSignals")}
        </button>
      </section>
    );
  }

  const focusAction = todayBrief.topActions[0] ?? null;
  const isRecommendationLimited = todayBrief.recommendationMode !== "live";
  const showRecommendationLimitNotice =
    todayBrief.recommendationMode === "historical" ||
    todayBrief.recommendationMode === "out_of_scope";
  const focusTone = focusAction && !isRecommendationLimited
    ? severityTone(focusAction.severity)
    : "neutral";
  const limitedModeLabel =
    todayBrief.recommendationMode === "historical"
      ? tKey("shell.historicalRecommendationsReadOnly")
      : todayBrief.recommendationMode === "stale"
        ? tKey("shell.staleRecommendations")
        : tKey("shell.recommendationsUnavailableForScope");
  const limitedModeDetail =
    todayBrief.recommendationMode === "historical"
      ? tKey("shell.historicalRecommendationsReadOnlyDetail")
      : todayBrief.recommendationMode === "stale"
        ? tKey("shell.staleRecommendationsDetail")
        : tKey("shell.recommendationsUnavailableForScopeDetail");
  const focusAssistantQuestion = focusAction
    ? tKey("assistant.analyzeCategory").replace(
        "{category}",
        enumLabel(focusAction.scenario_key),
      )
    : null;

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
          <h1>{todayBrief.headline}</h1>
          <p>
            {focusAction
              ? localizedContent(language, focusAction.body, focusAction.body_zh)
              :
              (isRecommendationLimited
                ? limitedModeDetail
                : tKey("shell.noCurrentRecommendationDetail"))}
          </p>
          <div className="today-focus-footer">
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
              {focusAssistantQuestion ? (
                <button
                  className="today-assistant-action"
                  disabled={isScopePending}
                  onClick={() => onOpenAssistant(focusAssistantQuestion)}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    info
                  </span>
                  {tKey("assistant.askAboutCategory").replace(
                    "{category}",
                    enumLabel(focusAction?.scenario_key),
                  )}
                </button>
              ) : null}
            </div>
            <div className="today-provenance">
              <span>
                <span className="material-symbols-outlined" aria-hidden="true">
                  check_circle
                </span>
                {tKey(
                  todayBrief.recommendationMode === "historical"
                    ? todayBrief.historicalSnapshotAvailable
                      ? "shell.historicalSnapshotGenerated"
                      : "shell.historicalSnapshotUnavailable"
                    : todayBrief.recommendationMode === "stale"
                      ? "shell.staleSnapshot"
                      : "shell.dataChecked",
                )}
                {todayBrief.checkedAt ? (
                  <> · {formatTimestamp(todayBrief.checkedAt, "dateTime", language, todayBrief.timezone)}</>
                ) : null}
              </span>
              <span className="today-provenance-spacer" />
              <button className="today-provenance-link" onClick={onOpenSignals} type="button">
                {tKey("shell.openAllSignals")}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </div>

        <div className="today-glance" role="group" aria-label={tKey("shell.todayAtAGlance")}>
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

      {showRecommendationLimitNotice ? (
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

      {sourceIssueCount > 0 ? (
        <div className="today-source-warning" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <span className="today-source-warning-copy">
            <strong>
              {tKey("shell.todaySourceHealthWarning").replace(
                "{count}",
                String(sourceIssueCount),
              )}
            </strong>
            <span>{tKey("shell.todaySourceHealthWarningDetail")}</span>
          </span>
          <button
            className="today-source-warning-action"
            disabled={isScopePending}
            onClick={onOpenSignals}
            type="button"
          >
            {tKey("shell.openAllSignals")}
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>
      ) : null}

      {!isHistorical && personalDashboard ? (
        <>
          <PersonalContextStrip
            dashboard={personalDashboard}
            onOpenAssistant={onOpenAssistant}
            onOpenSettings={onOpenSettings}
          />
          <PersonalTodayCards
            dashboard={personalDashboard}
            disabled={isScopePending}
            language={language}
            onOpenAssistant={onOpenAssistant}
          />
        </>
      ) : null}

      {!isHistorical && personalDashboardError ? (
        <div className="today-personal-warning" role="alert">
          <MaterialIcon name="person_alert" />
          <span className="today-personal-warning-copy">
            <strong>{tKey("shell.personalContextUnavailable")}</strong>
            <span>{tKey("shell.personalContextUnavailableDetail")}</span>
            {localizedPersonalDashboardError ? (
              <small>{localizedPersonalDashboardError}</small>
            ) : null}
          </span>
          {onRetryPersonalDashboard ? (
            <button
              className="today-source-warning-action"
              disabled={isScopePending}
              onClick={onRetryPersonalDashboard}
              type="button"
            >
              {tKey("shell.personalContextRetry")}
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="today-content-grid">
        <DayPlanTimeline
          disabled={isScopePending}
          items={planItems}
          language={language}
          recommendationMode={todayBrief.recommendationMode}
          timezone={todayBrief.timezone}
          onOpenEvent={onOpenEvent}
          onOpenScenario={onOpenScenario}
        />

        {todayBrief.scenarioSections.length > 0 ? (
          <section
            className="today-decisions"
            aria-label={tKey(isRecommendationLimited ? "shell.localSignals" : "shell.dailyDecisions")}
          >
            <div className="today-decisions-summary">
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
            </div>
            <div className="today-action-grid">
              {todayBrief.scenarioSections.map((section) => (
                <TodayActionCard
                  disabled={isScopePending}
                  key={section.key}
                  language={language}
                  liveSignals={liveSignals}
                  now={now}
                  recommendationMode={todayBrief.recommendationMode}
                  section={section}
                  timezone={todayBrief.timezone}
                  onAskAssistant={onOpenAssistant}
                  onOpen={() => onOpenScenario(section.key)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
