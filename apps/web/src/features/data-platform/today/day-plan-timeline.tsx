"use client";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import type { CrossDomainTimelineItem } from "../cross-domain-timeline";
import { localizedContent } from "../content-localization";
import { LanguageMode, useI18n } from "../i18n";
import type { PlatformEvent } from "../types";
import type { TodayRecommendationMode } from "./today-brief";

const CATEGORY_ICONS: Record<string, string> = {
  air: "air",
  energy: "bolt",
  events: "event",
  mobility: "commute",
  traffic: "traffic",
  transit: "directions_bus",
  weather: "cloud",
};

type DayPlanTimelineProps = {
  items: CrossDomainTimelineItem[];
  language: LanguageMode;
  disabled?: boolean;
  recommendationMode?: TodayRecommendationMode;
  onOpenEvent?: (event: PlatformEvent) => void;
  onOpenScenario?: (scenarioKey: string) => void;
};

function timelineDotClass(severity: string): string {
  switch (severity.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return "day-plan-dot-bad";
    case "MEDIUM":
      return "day-plan-dot-warn";
    case "LOW":
    case "INFO":
      return "day-plan-dot-good";
    default:
      return "day-plan-dot-neutral";
  }
}

export function DayPlanTimeline({
  items,
  language,
  disabled = false,
  recommendationMode = "live",
  onOpenEvent,
  onOpenScenario,
}: DayPlanTimelineProps) {
  const { tKey, enumLabel } = useI18n();
  const title =
    recommendationMode === "historical"
      ? tKey("shell.historicalEvidence")
      : recommendationMode === "out_of_scope"
        ? tKey("shell.localSignalMoments")
        : tKey("shell.todayPlan");
  const lead =
    recommendationMode === "historical"
      ? tKey("shell.historicalEvidenceLead")
      : recommendationMode === "out_of_scope"
        ? tKey("shell.localSignalsOnlyLead")
        : tKey("shell.todayPlanLead");

  return (
    <section className="day-plan-timeline" aria-label={title}>
      <header className="day-plan-timeline-header">
        <span className="today-section-kicker">{title}</span>
        <h3>{lead}</h3>
      </header>
      {items.length > 0 ? (
        <ol className="day-plan-timeline-list">
          {items.map((item) => {
            const tone = severityTone(item.severity);
            const icon = CATEGORY_ICONS[item.categoryKey] ?? "notifications";
            const categoryLabel =
              enumLabel(item.categoryKey);

            return (
              <li className={`day-plan-timeline-item day-plan-timeline-item-${tone}`} key={item.id}>
                <span className={`day-plan-dot ${timelineDotClass(item.severity)}`} aria-hidden="true" />
                <button
                  className="day-plan-timeline-button"
                  disabled={disabled}
                  onClick={() => {
                    if (item.kind === "event" && item.event) {
                      onOpenEvent?.(item.event);
                      return;
                    }
                    if (item.scenarioKey) {
                      onOpenScenario?.(item.scenarioKey);
                    }
                  }}
                  type="button"
                >
                  <span className="day-plan-timeline-top">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {icon}
                    </span>
                    <strong>{localizedContent(language, item.title, item.title_zh)}</strong>
                    <span className={`status-badge status-badge-${tone}`}>{categoryLabel}</span>
                  </span>
                  <span className="day-plan-timeline-detail">
                    {localizedContent(language, item.detail, item.detail_zh)}
                  </span>
                  <time>
                    {formatTimestamp(item.startsAt, "dateTime", language)} –{" "}
                    {formatTimestamp(item.endsAt, "dateTime", language)}
                  </time>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="day-plan-empty">
          {recommendationMode === "historical"
            ? tKey("shell.noHistoricalDecisionMoments")
            : recommendationMode === "out_of_scope"
              ? tKey("shell.noScopedDecisionMoments")
              : tKey("shell.noDecisionMoments")}
        </div>
      )}
    </section>
  );
}
