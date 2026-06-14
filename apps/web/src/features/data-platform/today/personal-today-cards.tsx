"use client";

import { formatTimestamp } from "@/features/shared/format";

import type { LanguageMode } from "../i18n";
import { useI18n } from "../i18n";
import type { PersonalDashboardRead } from "../personal-dashboard";
import { localizedContent } from "../content-localization";

const CARD_ICONS: Record<string, string> = {
  air: "air",
  commute: "commute",
  energy: "bolt",
  summary: "lightbulb",
  weather: "cloud",
};

const CARD_LABEL_KEYS: Record<string, string> = {
  air: "shell.navAirQuality",
  commute: "shell.navMobility",
  energy: "shell.navEnergy",
  summary: "shell.personalTypeSummary",
  weather: "shell.navWeather",
};

function cardTone(severity: string): "good" | "warn" | "bad" | "neutral" {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
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

type PersonalTodayCardsProps = {
  dashboard: Pick<PersonalDashboardRead, "timezone" | "today">;
  disabled?: boolean;
  language: LanguageMode;
  onOpenAssistant: (question?: string) => void;
};

export function PersonalTodayCards({
  dashboard,
  disabled = false,
  language,
  onOpenAssistant,
}: PersonalTodayCardsProps) {
  const { tKey } = useI18n();
  const cards = dashboard.today?.cards ?? [];

  if (cards.length === 0) {
    return null;
  }

  const visibleCards = cards.slice(0, 3);
  const assistantPrompt = tKey("shell.personalRecommendationAssistantPrompt");

  return (
    <section
      aria-label={tKey("shell.personalRecommendations")}
      className="today-personal-recommendations"
    >
      <header className="today-personal-recommendations-header">
        <span className="today-section-kicker">
          {tKey("shell.personalRecommendations")}
        </span>
        <h3>{tKey("shell.personalRecommendationsLead")}</h3>
        <span className="today-personal-recommendations-count">
          {cards.length}
        </span>
      </header>
      <ol className="today-personal-recommendations-list">
        {visibleCards.map((card, index) => {
          const type = card.type.trim().toLowerCase();
          const tone = cardTone(card.severity);
          const typeLabel = CARD_LABEL_KEYS[type]
            ? tKey(CARD_LABEL_KEYS[type])
            : type || tKey("shell.personalTypeSummary");
          const validUntil = card.valid_to
            ? formatTimestamp(card.valid_to, "dateTime", language, dashboard.timezone)
            : null;
          const title = localizedContent(language, card.title, card.title_zh);
          const summary = localizedContent(language, card.summary, card.summary_zh);

          return (
            <li
              className={`today-personal-recommendation today-personal-recommendation-${tone}`}
              key={`${type}-${card.title}-${index}`}
            >
              <span className="today-personal-recommendation-icon material-symbols-outlined" aria-hidden="true">
                {CARD_ICONS[type] ?? "lightbulb"}
              </span>
              <span className="today-personal-recommendation-copy">
                <span className="today-personal-recommendation-type">{typeLabel}</span>
                <strong>{title}</strong>
                <span>{summary}</span>
                {validUntil ? (
                  <time>
                    {tKey("shell.personalRecommendationValidUntil").replace(
                      "{time}",
                      validUntil,
                    )}
                  </time>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <button
        className="today-secondary-action today-personal-recommendations-action"
        disabled={disabled}
        onClick={() => onOpenAssistant(assistantPrompt)}
        type="button"
      >
        {tKey("shell.personalAskAboutRecommendations")}
        <span className="material-symbols-outlined" aria-hidden="true">
          smart_toy
        </span>
      </button>
    </section>
  );
}
