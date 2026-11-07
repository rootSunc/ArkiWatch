"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";

import { formatTimestamp, severityTone } from "@/features/shared/format";

import { cityLabel } from "./city-scope";
import { localizedContent } from "./content-localization";
import { scopedDataTimestamp } from "./data-time-scope";
import { useI18n } from "./i18n";
import { eventCategoryLabel, eventTimeLabel, eventTypeLabel, eventAttributeRows } from "./data-platform-view-model";
import type { PlatformCategory, PlatformEvent, PlatformTimeScope } from "./types";

export type RecentEventsPanelProps = {
  categories: PlatformCategory[];
  checkedAt: string;
  city: string;
  eventDetailCloseRef: Ref<HTMLButtonElement>;
  eventReferenceAt: string | null;
  isExpanded: boolean;
  onCloseEventDetail: () => void;
  onMarkEventRead: (eventId: string) => void;
  onOpenEvent: (event: PlatformEvent) => void;
  onSelectEvent: (event: PlatformEvent, trigger: HTMLButtonElement) => void;
  onToggleExpanded: () => void;
  platformTimezone: string;
  readRecentEventIds: Set<string>;
  selectedEvent: PlatformEvent | null;
  timeScope?: PlatformTimeScope | null;
  visibleEvents: PlatformEvent[];
};

/** A top-layer inbox shared by every workspace. The page keeps its route and scroll. */
export function RecentEventsPanel({
  categories, checkedAt, city, eventDetailCloseRef, eventReferenceAt, isExpanded,
  onCloseEventDetail, onMarkEventRead, onOpenEvent, onSelectEvent, onToggleExpanded,
  platformTimezone, readRecentEventIds, selectedEvent, timeScope, visibleEvents,
}: RecentEventsPanelProps) {
  const { language, tKey } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const lastSelectedId = useRef<string | null>(null);
  const listScroll = useRef(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unreadEvents = visibleEvents.filter((event) => !readRecentEventIds.has(event.id));
  const events = unreadOnly ? unreadEvents : visibleEvents;

  useEffect(() => {
    if (!isExpanded) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [isExpanded]);

  useEffect(() => {
    if (selectedEvent || !isExpanded || !lastSelectedId.current) return;
    const trigger = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-event-id]") ?? [])
      .find((button) => button.dataset.eventId === lastSelectedId.current);
    (trigger ?? filterRef.current)?.focus({ preventScroll: true });
    if (listRef.current) listRef.current.scrollTop = listScroll.current;
  }, [isExpanded, selectedEvent]);

  if (!isExpanded) return null;

  return createPortal(
    <dialog
      aria-labelledby="events-inbox-title"
      aria-modal="true"
      className="events-inbox events-panel-expanded"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (selectedEvent) onCloseEventDetail();
        else onToggleExpanded();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onToggleExpanded();
      }}
    >
      <div className="inbox-handle" aria-hidden="true" />
      <header className="inbox-header">
        <div>
          <span className="inbox-eyebrow">ArkiWatch · {cityLabel(city)}</span>
          <h2 id="events-inbox-title">{tKey("shell.recentEvents")}</h2>
        </div>
        <button className="inbox-icon-button" type="button" aria-label={tKey("shell.collapseRecentEvents")} onClick={onToggleExpanded}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div className="inbox-list-screen" hidden={Boolean(selectedEvent)}>
        <div className="inbox-filters" aria-label={tKey("shell.eventFilters")} role="group">
          <button ref={filterRef} type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>{tKey("shell.allEvents")} <span>{visibleEvents.length}</span></button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>{tKey("shell.unread")} <span>{unreadEvents.length}</span></button>
        </div>
        <p className="inbox-updated">{tKey("shell.updated")} {scopedDataTimestamp(checkedAt, timeScope, language, tKey, "shell.notCollected", platformTimezone)}</p>
        <div className="inbox-list" ref={listRef}>
          {events.length ? events.map((event) => {
            const isRead = readRecentEventIds.has(event.id);
            return (
              <article className={`inbox-item inbox-item-${severityTone(event.severity)}${isRead ? " inbox-item-read" : ""}`} key={event.id}>
                <button
                  className="timeline-item-content inbox-item-button"
                  data-event-id={event.id}
                  type="button"
                  aria-label={`${tKey("shell.openEventDetail")}: ${localizedContent(language, event.title, event.title_zh)}`}
                  onClick={(clickEvent) => {
                    lastSelectedId.current = event.id;
                    listScroll.current = listRef.current?.scrollTop ?? 0;
                    onMarkEventRead(event.id);
                    onSelectEvent(event, clickEvent.currentTarget);
                  }}
                >
                  <span className="inbox-item-meta"><time>{eventTimeLabel(categories, event, language, eventReferenceAt, platformTimezone)}</time><span className="inbox-read-state">{isRead ? tKey("shell.read") : tKey("shell.unread")}</span></span>
                  <span className="inbox-item-heading"><strong>{localizedContent(language, event.title, event.title_zh)}</strong><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></span>
                  <span className="inbox-item-preview">{localizedContent(language, event.body, event.body_zh)}</span>
                </button>
              </article>
            );
          }) : <div className="inbox-empty" role="status"><span className="material-symbols-outlined" aria-hidden="true">notifications</span><h3>{tKey(unreadOnly ? "shell.allCaughtUp" : "shell.noActiveNotifications")}</h3><p>{tKey(unreadOnly ? "shell.allCaughtUpDetail" : "shell.noRecentEventsMatchTheCurrentView")}</p></div>}
        </div>
      </div>

      {selectedEvent ? (
        <section className="event-detail-panel inbox-detail" aria-label={tKey("shell.eventDetail")}>
          <button className="inbox-back" type="button" aria-label={tKey("shell.backToEvents")} ref={eventDetailCloseRef} onClick={onCloseEventDetail}>
            <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>{tKey("shell.backToEvents")}
          </button>
          <div className="inbox-detail-scroll" key={selectedEvent.id}>
            <span className="inbox-eyebrow">{eventCategoryLabel(categories, selectedEvent, language)} · {eventTypeLabel(selectedEvent.event_type, language)}</span>
            <h3>{localizedContent(language, selectedEvent.title, selectedEvent.title_zh)}</h3>
            <p className="inbox-detail-body">{localizedContent(language, selectedEvent.body, selectedEvent.body_zh)}</p>
            <dl className="inbox-facts">
              <div><dt>{tKey("shell.validity")}</dt><dd>{formatTimestamp(selectedEvent.starts_at, "dateTime", language, platformTimezone)} — {formatTimestamp(selectedEvent.ends_at, "dateTime", language, platformTimezone)}</dd></div>
              {eventAttributeRows(selectedEvent, language).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
              <div><dt>{tKey("shell.sources")}</dt><dd>{selectedEvent.source_codes.join(", ") || tKey("shell.derived")}</dd></div>
            </dl>
            {selectedEvent.evidence.length > 0 ? <details className="inbox-evidence"><summary>{tKey("shell.evidence")} <span>{selectedEvent.evidence.length}</span></summary><ul>{selectedEvent.evidence.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
          </div>
          <footer className="inbox-detail-footer"><button type="button" onClick={() => onOpenEvent(selectedEvent)}>{tKey("shell.openWorkspace")}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button></footer>
        </section>
      ) : null}
    </dialog>, document.body,
  );
}
