"use client";

import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
import type { PublicScenarioSectionRead } from "../types";
import { buildTodayActionCardView } from "./today-action-card-model";

type TodayActionCardProps = {
  language: LanguageMode;
  liveSignals: ScenarioLiveSignals;
  onOpen: () => void;
  section: PublicScenarioSectionRead;
};

export function TodayActionCard({
  language,
  liveSignals,
  onOpen,
  section,
}: TodayActionCardProps) {
  const { tKey } = useI18n();
  const view = buildTodayActionCardView(section, liveSignals, language);

  return (
    <button
      className={`today-action-card today-action-card-${view.tone}`}
      onClick={onOpen}
      type="button"
    >
      <span className="today-action-card-icon material-symbols-outlined" aria-hidden="true">
        {view.icon}
      </span>
      <span className="today-action-card-content">
        <span className="today-action-card-label">
          {section.title}
          {view.isLiveFallback ? (
            <span className="today-action-card-live">{tKey("shell.liveSignal")}</span>
          ) : null}
        </span>
        <strong>{view.title}</strong>
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
        arrow_forward
      </span>
    </button>
  );
}
