"use client";

import { useState } from "react";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import type { CrossDomainTimelineItem } from "./cross-domain-timeline";
import { localizedContent } from "./content-localization";
import type { ScopedEventState } from "./event-time-state";
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
  collapsible?: boolean;
  defaultOpen?: boolean;
  historical?: boolean;
  items: CrossDomainTimelineItem[];
  language: LanguageMode;
  timezone?: string;
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
  collapsible = false,
  defaultOpen = false,
  historical = false,
  items,
  language,
  timezone,
  onOpenEvent,
  onOpenScenario,
}: CrossDomainTimelinePanelProps) {
  const { tKey, enumLabel } = useI18n();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (items.length === 0) {
    return null;
  }

  const title = tKey("shell.crossSignalTimeline");
  const lead = tKey("shell.crossSignalTimelineLead");
  const countLabel = tKey("shell.crossSignalTimelineCount").replace(
    "{count}",
    String(items.length),
  );

  const timelineItems = (
    <ol className="cross-domain-timeline-list">
      {items.map((item) => {
        const tone = severityTone(item.severity);
        const icon = CATEGORY_ICONS[item.categoryKey] ?? "notifications";
        const categoryLabel = enumLabel(item.categoryKey);
        const stateLabel = timelineStateLabel(item.state, historical, tKey);

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
                <strong>{localizedContent(language, item.title, item.title_zh)}</strong>
                <span className={`status-badge status-badge-${tone}`}>{categoryLabel}</span>
                <span className="cross-domain-timeline-state">{stateLabel}</span>
              </span>
              <span className="cross-domain-timeline-detail">
                {localizedContent(language, item.detail, item.detail_zh)}
              </span>
              <time>
                {formatTimestamp(item.startsAt, "dateTime", language, timezone)} -{" "}
                {formatTimestamp(item.endsAt, "dateTime", language, timezone)}
              </time>
            </button>
          </li>
        );
      })}
    </ol>
  );

  if (collapsible) {
    return (
      <details
        className="cross-domain-timeline cross-domain-timeline-collapsible"
        open={isOpen}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
      >
        <summary
          aria-label={tKey("shell.toggleCrossSignalTimeline")}
          className="cross-domain-timeline-summary"
        >
          <span className="cross-domain-timeline-summary-copy">
            <span className="material-symbols-outlined" aria-hidden="true">
              timeline
            </span>
            <span>
              <strong>{title}</strong>
              <small>{lead}</small>
            </span>
          </span>
          <span className="cross-domain-timeline-summary-meta">
            <span>{countLabel}</span>
            <span className="material-symbols-outlined" aria-hidden="true">
              expand_more
            </span>
          </span>
        </summary>
        <div className="cross-domain-timeline-body">{timelineItems}</div>
      </details>
    );
  }

  return (
    <section className="cross-domain-timeline" aria-label={title}>
      <header className="cross-domain-timeline-header">
        <h3>
          <span className="material-symbols-outlined" aria-hidden="true">
            timeline
          </span>
          {title}
        </h3>
        <p>{lead}</p>
      </header>
      {timelineItems}
    </section>
  );
}

function timelineStateLabel(
  state: ScopedEventState,
  historical: boolean,
  tKey: (key: string) => string,
): string {
  if (state === "active") {
    return tKey(historical ? "shell.timelineActiveAtSnapshot" : "shell.timelineActiveNow");
  }
  if (state === "upcoming") {
    return tKey(historical ? "shell.timelineUpcomingAtSnapshot" : "shell.timelineUpcoming");
  }
  return tKey(historical ? "shell.timelineEndedBeforeSnapshot" : "shell.timelineEnded");
}
