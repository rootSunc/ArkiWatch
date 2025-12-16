import { formatTimestamp, severityTone } from "@/features/shared/format";

import { PlatformEvent } from "./types";

type EventStreamProps = {
  events: PlatformEvent[];
};

export function EventStream({ events }: EventStreamProps) {
  return (
    <section className="event-stream" aria-label="Event stream">
      <div className="panel-heading">
        <div>
          <span className="label-text">Events</span>
          <h2>Latest data events</h2>
        </div>
        <span className="count-pill">{events.length}</span>
      </div>
      <div className="event-list">
        {events.length > 0 ? (
          events.map((event) => (
            <article className="event-row" key={event.id}>
              <div className={`event-dot event-dot-${severityTone(event.severity)}`} />
              <div>
                <div className="event-row-header">
                  <strong>{event.title}</strong>
                  <span>{event.category_key}</span>
                </div>
                <p>{event.body}</p>
                <footer>
                  <span>
                    {formatTimestamp(event.starts_at)} to {formatTimestamp(event.ends_at)}
                  </span>
                  <span>{event.source_codes.join(", ") || "derived"}</span>
                </footer>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-visual">No events in the current platform window.</div>
        )}
      </div>
    </section>
  );
}
