"use client";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import type { CrossDomainTimelineItem } from "./cross-domain-timeline";
import { LanguageMode, useI18n } from "./i18n";
import type { PlatformEvent } from "./types";

const CATEGORY_ICONS: Record<string, string> = {
  air: "air",
  energy: "bolt",
  events: "event",
  mobility: "commute",
  traffic: "traffic",
  transit: "directions_bus",
  weather: "cloud",
};

type CrossDomainTimelinePanelProps = {
  items: CrossDomainTimelineItem[];
  language: LanguageMode;
  onOpenEvent?: (event: PlatformEvent) => void;
  onOpenScenario?: (scenarioKey: string) => void;
};

function timelineDotClass(severity: string): string {
  switch (severity.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return "cross-timeline-dot-bad";
    case "MEDIUM":
      return "cross-timeline-dot-warn";
    case "LOW":
    case "INFO":
      return "cross-timeline-dot-good";
    default:
      return "cross-timeline-dot-neutral";
  }
}

export function CrossDomainTimelinePanel({
  items,
  language,
  onOpenEvent,
  onOpenScenario,
}: CrossDomainTimelinePanelProps) {
  const { tKey, enumLabel } = useI18n();

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="cross-domain-timeline" aria-label={tKey("shell.crossSignalTimeline")}>
      <header className="cross-domain-timeline-header">
        <h3>
          <span className="material-symbols-outlined" aria-hidden="true">
            timeline
          </span>
          {tKey("shell.crossSignalTimeline")}
        </h3>
        <p>{tKey("shell.crossSignalTimelineLead")}</p>
      </header>
      <ol className="cross-domain-timeline-list">
        {items.map((item) => {
          const tone = severityTone(item.severity);
          const icon = CATEGORY_ICONS[item.categoryKey] ?? "notifications";
          const categoryLabel =
            item.kind === "scenario"
              ? enumLabel(item.scenarioKey ?? item.categoryKey)
              : enumLabel(item.categoryKey);

          return (
            <li className={`cross-domain-timeline-item cross-domain-timeline-item-${tone}`} key={item.id}>
              <span className={`cross-timeline-dot ${timelineDotClass(item.severity)}`} aria-hidden="true" />
              <button
                className="cross-domain-timeline-button"
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
                <span className="cross-domain-timeline-top">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {icon}
                  </span>
                  <strong>{item.title}</strong>
                  <span className={`status-badge status-badge-${tone}`}>{categoryLabel}</span>
                </span>
                <span className="cross-domain-timeline-detail">{item.detail}</span>
                <time>
                  {formatTimestamp(item.startsAt, "dateTime", language)} –{" "}
                  {formatTimestamp(item.endsAt, "dateTime", language)}
                </time>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
