"use client";

import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
import type { PublicScenarioSectionRead } from "../types";
import { buildTodayActionCardView } from "./today-action-card-model";
import type { TodayRecommendationMode } from "./today-brief";

type TodayActionCardProps = {
  language: LanguageMode;
  liveSignals: ScenarioLiveSignals;
  disabled?: boolean;
  onOpen: () => void;
  recommendationMode?: TodayRecommendationMode;
  section: PublicScenarioSectionRead;
};

export function TodayActionCard({
  language,
  liveSignals,
  disabled = false,
  onOpen,
  recommendationMode = "live",
  section,
}: TodayActionCardProps) {
  const { enumLabel, tKey } = useI18n();
  const view = buildTodayActionCardView(section, liveSignals, language, recommendationMode);
  const localizedTitle = ["good", "good window", "needs attention", "watch"].includes(
    view.title.trim().toLowerCase(),
  )
    ? enumLabel(view.title)
    : view.title;

  return (
    <button
      className={`today-action-card today-action-card-${view.tone}`}
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <span className="today-action-card-icon material-symbols-outlined" aria-hidden="true">
        {view.icon}
      </span>
      <span className="today-action-card-content">
        <span className="today-action-card-label">
          {enumLabel(section.key)}
          {view.signalLabel ? (
            <span className="today-action-card-live">{view.signalLabel}</span>
          ) : null}
        </span>
        <strong>{localizedTitle}</strong>
        <span className="today-action-card-body">{view.body}</span>
        {view.dataPoints.length > 0 ? (
          <span className="today-action-card-data" aria-label={tKey("shell.todaySSnapshot")}>
            {view.dataPoints.map((point) => (
              <span key={`${section.key}-${point.label}`}>
                <small>{point.label}</small>
                <b>{point.value}</b>
              </span>
            ))}
          </span>
        ) : null}
        <span className="today-action-card-meta">
          <span>{view.detail}</span>
          <span>{view.sources}</span>
        </span>
      </span>
      <span className="today-action-card-arrow material-symbols-outlined" aria-hidden="true">
        chevron_right
      </span>
    </button>
  );
}
