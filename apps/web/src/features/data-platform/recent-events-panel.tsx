"use client";

import type { Ref } from "react";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import { cityLabel } from "./city-scope";
import { localizedContent } from "./content-localization";
import { scopedDataTimestamp } from "./data-time-scope";
import { useI18n } from "./i18n";
import {
  eventCategoryLabel,
  eventTimeLabel,
  eventTypeLabel,
} from "./data-platform-view-model";
import { eventAttributeRows } from "./data-platform-view-model";
import {
  recentEventDetails,
  type RecentEventDetail,
} from "./recent-events";
import type { DashboardTone } from "./data-platform-shell";
import type {
  PlatformCategory,
  PlatformEvent,
  PlatformTimeScope,
} from "./types";

type OverallNotification = {
  body: string;
  detail: string;
  title: string;
};

export type RecentEventsPanelProps = {
  categories: PlatformCategory[];
  checkedAt: string;
  city: string;
  eventDetailCloseRef: Ref<HTMLButtonElement>;
  eventReferenceAt: string | null;
  isExpanded: boolean;
  latestEventTone: DashboardTone;
  latestUnreadEvent: PlatformEvent | null;
  onCloseEventDetail: () => void;
  onMarkEventRead: (eventId: string) => void;
  onOpenEvent: (event: PlatformEvent) => void;
  onSelectEvent: (event: PlatformEvent, trigger: HTMLButtonElement) => void;
  onToggleExpanded: () => void;
  platformTimezone: string;
  readRecentEventIds: Set<string>;
  selectedEvent: PlatformEvent | null;
  selectedEventId: string | null;
  timeScope?: PlatformTimeScope | null;
  unreadVisibleEvents: PlatformEvent[];
  visibleEvents: PlatformEvent[];
  visibleNotificationEvents: PlatformEvent[];
  overallNotification: OverallNotification;
};

/**
 * Source-level event inspection for the Data workspace. All scope, routing,
 * and read-state decisions stay in the page controller; this component owns
 * the dense event timeline and its detail disclosure markup.
 */
export function RecentEventsPanel({
  categories,
  checkedAt,
  city,
  eventDetailCloseRef,
  eventReferenceAt,
  isExpanded,
  latestEventTone,
  latestUnreadEvent,
  onCloseEventDetail,
  onMarkEventRead,
  onOpenEvent,
  onSelectEvent,
  onToggleExpanded,
  platformTimezone,
  readRecentEventIds,
  selectedEvent,
  selectedEventId,
  timeScope,
  unreadVisibleEvents,
  visibleEvents,
  visibleNotificationEvents,
  overallNotification,
}: RecentEventsPanelProps) {
  const { language, tKey } = useI18n();

  if (!isExpanded) {
    return null;
  }

  return (
    <aside
      className="events-panel events-panel-expanded"
      aria-label={tKey("shell.recentEvents")}
    >
      <header>
        <button
          aria-controls="recent-events-timeline"
          aria-expanded={isExpanded}
          aria-label={tKey("shell.collapseRecentEvents")}
          className="events-panel-toggle"
          onClick={onToggleExpanded}
          type="button"
        >
          <span
            className={`events-panel-icon events-panel-icon-${latestEventTone}`}
            aria-hidden="true"
          >
            <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
          </span>
          <span className="events-panel-copy">
            <span className="events-panel-title">
              <span className="events-panel-heading">
                {tKey("shell.recentEvents2")}
              </span>
              <span className="events-count-badge">{unreadVisibleEvents.length}</span>
            </span>
            <span className="events-panel-summary">
              {latestUnreadEvent
                ? `${eventTimeLabel(categories, latestUnreadEvent, language, eventReferenceAt, platformTimezone)} · ${localizedContent(
                    language,
                    latestUnreadEvent.title,
                    latestUnreadEvent.title_zh,
                  )}`
                : tKey("shell.noRecentEventsMatchTheCurrentView")}
            </span>
          </span>
          <span className="material-symbols-outlined events-panel-chevron" aria-hidden="true">
            expand_less
          </span>
        </button>
      </header>
      <div className="event-timeline" hidden={!isExpanded} id="recent-events-timeline">
        <section
          className={`overall-notification overall-notification-${latestEventTone}`}
          aria-label={tKey("shell.overallNotification")}
          aria-live="polite"
        >
          <div className="overall-notification-main">
            <span
              className={`events-panel-icon events-panel-icon-${latestEventTone}`}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
            </span>
            <div className="overall-notification-copy">
              <span className="overall-notification-kicker">
                {tKey("shell.overallNotification")} · {cityLabel(city)}
              </span>
              <strong>{overallNotification.title}</strong>
              <p>{overallNotification.body}</p>
            </div>
          </div>
          <div className="overall-notification-meta">
            <span>
              {tKey("shell.updated")} {scopedDataTimestamp(
                checkedAt,
                timeScope,
                language,
                tKey,
                "shell.notCollected",
                platformTimezone,
              )}
            </span>
            <span className={`status-badge status-badge-${latestEventTone}`}>
              {visibleNotificationEvents.length > 0
                ? tKey("shell.needsAttention")
                : tKey("shell.nominal")}
            </span>
          </div>
          <p className="overall-notification-detail">{overallNotification.detail}</p>
        </section>

        {selectedEvent ? (
          <section className="event-detail-panel" aria-label={tKey("shell.eventDetail")}>
            <header className="event-detail-header">
              <div>
                <span className="event-detail-kicker">
                  {eventCategoryLabel(categories, selectedEvent, language)} · {eventTypeLabel(selectedEvent.event_type, language)}
                </span>
                <strong>
                  {localizedContent(language, selectedEvent.title, selectedEvent.title_zh)}
                </strong>
              </div>
              <button
                aria-label={tKey("shell.closeEventDetail")}
                className="event-detail-close"
                ref={eventDetailCloseRef}
                onClick={onCloseEventDetail}
                title={tKey("shell.closeEventDetail")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
              <button
                aria-label={tKey("shell.openWorkspace")}
                className="event-detail-close"
                onClick={() => onOpenEvent(selectedEvent)}
                title={tKey("shell.openWorkspace")}
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
              </button>
            </header>
            <p>{localizedContent(language, selectedEvent.body, selectedEvent.body_zh)}</p>
            <div className="event-detail-meta">
              <span>
                {tKey("shell.validity")}: {formatTimestamp(selectedEvent.starts_at, "dateTime", language, platformTimezone)} - {formatTimestamp(selectedEvent.ends_at, "dateTime", language, platformTimezone)}
              </span>
              <span>
                {tKey("shell.sources")}: {selectedEvent.source_codes.join(", ") || tKey("shell.derived")}
              </span>
            </div>
            {selectedEvent.evidence.length > 0 ? (
              <div className="event-detail-evidence">
                <span>{tKey("shell.evidence")}</span>
                <div className="event-tags">
                  {selectedEvent.evidence.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
            ) : null}
            <dl className="event-detail-attributes">
              {eventAttributeRows(selectedEvent, language).length > 0 ? (
                eventAttributeRows(selectedEvent, language).map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt>{tKey("shell.details")}</dt>
                  <dd>{tKey("shell.noStructuredAttributes")}</dd>
                </div>
              )}
            </dl>
          </section>
        ) : null}

        {visibleEvents.length > 0 ? (
          visibleEvents.map((event) => {
            const tone = severityTone(event.severity) as DashboardTone;
            const isRead = readRecentEventIds.has(event.id);
            const isSelected = selectedEventId === event.id;
            const details: RecentEventDetail[] = recentEventDetails(
              event,
              language,
              tKey,
              platformTimezone,
            );

            return (
              <article
                className={[
                  "timeline-item",
                  `timeline-item-${tone}`,
                  isSelected ? "timeline-item-selected" : null,
                  isRead ? "timeline-item-read" : "timeline-item-unread",
                ].filter(Boolean).join(" ")}
                key={event.id}
              >
                <span className={`timeline-dot timeline-dot-${tone}`} aria-hidden="true" />
                <button
                  aria-expanded={isSelected}
                  aria-label={`${tKey("shell.openEventDetail")}: ${localizedContent(language, event.title, event.title_zh)}`}
                  className="timeline-item-content"
                  onClick={(clickEvent) => {
                    onMarkEventRead(event.id);
                    onSelectEvent(event, clickEvent.currentTarget);
                  }}
                  type="button"
                >
                  <time>{eventTimeLabel(categories, event, language, eventReferenceAt, platformTimezone)}</time>
                  <span className="timeline-item-heading">
                    <h4>{localizedContent(language, event.title, event.title_zh)}</h4>
                    <span className={isRead ? "timeline-read-state timeline-read-state-read" : "timeline-read-state timeline-read-state-unread"}>
                      {isRead ? tKey("shell.read") : tKey("shell.unread")}
                    </span>
                  </span>
                  <p>{localizedContent(language, event.body, event.body_zh)}</p>
                  {details.length > 0 ? (
                    <div className="event-detail-chips">
                      {details.map((detail) => (
                        <span key={detail.key}><strong>{detail.label}</strong>{detail.value}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="event-tags">
                    <span>{eventTypeLabel(event.event_type, language)}</span>
                    {event.evidence[0] ? <span>{event.evidence[0]}</span> : null}
                  </div>
                </button>
              </article>
            );
          })
        ) : (
          <div className="dashboard-empty-state">
            {tKey("shell.noRecentEventsMatchTheCurrentView")}
          </div>
        )}
      </div>
    </aside>
  );
}
