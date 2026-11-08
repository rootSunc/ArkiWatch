"use client";

import { formatTimestamp } from "@/features/shared/format";

import { localizedContent } from "../model/content-localization";
import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import type { ScenarioLiveSignals } from "../overview/scenario-live-hints";
import type { PublicScenarioSectionRead } from "../types";
import { buildTodayActionCardView } from "./today-action-card-model";
import type { TodayRecommendationMode } from "./today-brief";

type TodayActionCardProps = {
  language: LanguageMode;
  liveSignals: ScenarioLiveSignals;
  disabled?: boolean;
  now?: number;
  onAskAssistant: (question?: string) => void;
  onOpen: () => void;
  recommendationMode?: TodayRecommendationMode;
  section: PublicScenarioSectionRead;
  timezone?: string;
};

export function TodayActionCard({
  language,
  liveSignals,
  disabled = false,
  onAskAssistant,
  onOpen,
  recommendationMode = "live",
  section,
  timezone,
}: TodayActionCardProps) {
  const { enumLabel, tKey } = useI18n();
  const view = buildTodayActionCardView(
    section,
    liveSignals,
    language,
    recommendationMode,
    timezone,
    );
  const rowTitle = localizedContent(language, section.title, section.title_zh);
  const assistantQuestion = tKey("assistant.analyzeCategory").replace(
    "{category}",
    enumLabel(section.key),
  );
  const categoryLabel = enumLabel(section.key);
  const normalizeLabel = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase(language === "zh" ? "zh-CN" : "en-US");
  const accessibleTitle = normalizeLabel(categoryLabel) === normalizeLabel(rowTitle)
    ? rowTitle
    : `${categoryLabel}: ${rowTitle}`;
  const validFromLabel = formatTimestamp(section.valid_from, "time", language, timezone);

  return (
    <article
      className={`today-action-card today-action-card-${view.tone}`}
    >
      <button
        aria-label={`${accessibleTitle}, ${validFromLabel}. ${view.body}`}
        className="today-action-card-main"
        disabled={disabled}
        onClick={onOpen}
        type="button"
      >
        <span className="today-action-card-dot" aria-hidden="true" />
        <span className="today-action-card-title">{rowTitle}</span>
        <time className="today-action-card-time" dateTime={section.valid_from}>
          {validFromLabel}
        </time>
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
          <strong>{rowTitle}</strong>
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
          {view.detail || view.sources ? (
            <span className="today-action-card-meta">
              {view.detail ? <span>{view.detail}</span> : null}
              {view.sources ? <span>{view.sources}</span> : null}
            </span>
          ) : null}
        </span>
        <span className="today-action-card-arrow material-symbols-outlined" aria-hidden="true">
          chevron_right
        </span>
      </button>
      <button
        aria-label={tKey("assistant.askAboutCategory").replace("{category}", enumLabel(section.key))}
        className="today-action-card-assistant"
        disabled={disabled}
        onClick={() => onAskAssistant(assistantQuestion)}
        type="button"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          info
        </span>
        <span>{tKey("assistant.askAboutCategory").replace("{category}", enumLabel(section.key))}</span>
      </button>
    </article>
  );
}
