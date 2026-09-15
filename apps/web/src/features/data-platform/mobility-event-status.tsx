import type { LanguageMode } from "./i18n";
import { formatCompactDateTime } from "./workspace-datetime";

type Props = {
  event: { state?: string; starts_at: string; ends_at: string };
  namespace: "transit" | "roadRail";
  historical: boolean;
  language: LanguageMode;
  timeZone?: string;
  tKey: (key: string) => string;
};

export function MobilityEventStatus({ event, namespace, historical, language, timeZone, tKey }: Props) {
  const prefix = namespace === "transit" ? "transit-alert" : "road-rail-incident";
  const label = (key: string) => tKey(`${namespace}.${key}`);
  const state = (event.state ?? "ended");
  return (
    <span className={state === "active" ? `${prefix}-status ${prefix}-status-active` : `${prefix}-status`}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {state === "active" ? "radio_button_checked" : state === "upcoming" ? "schedule" : "history"}
      </span>
      <span>
        {state === "active"
          ? label(historical ? "activeAtSnapshot" : "activeNow")
          : state === "ended"
            ? label(historical ? "endedAtSnapshot" : "ended")
            : formatCompactDateTime(event.starts_at, language, label("notObserved"), timeZone)}
      </span>
    </span>
  );
}

export function MobilityEventLiveLayer({ event, namespace, historical, language, timeZone, tKey, progress, scopeLabel }: Props & { progress: number; scopeLabel: string }) {
  const prefix = namespace === "transit" ? "transit-alert" : "road-rail-incident";
  const label = (key: string) => tKey(`${namespace}.${key}`);
  const state = (event.state ?? "ended");

  return (
    <section
      className={state === "active" ? `${prefix}-live-layer ${prefix}-live-layer-active` : `${prefix}-live-layer`}
      aria-label={label(namespace === "transit" ? "alertStatus" : "incidentStatus")}
    >
      <div className={`${prefix}-live-copy`}>
        <MobilityEventStatus event={event} namespace={namespace} historical={historical} language={language} timeZone={timeZone} tKey={tKey} />
        <div>
          <strong>
            {state === "active"
              ? label(historical ? "inEffectAtSnapshot" : "inEffect")
              : state === "ended"
                ? label(historical ? "endedAtSnapshot" : "ended")
                : label("scheduled")}
          </strong>
          <span>
            {state === "active"
              ? `${label("until")} ${formatCompactDateTime(event.ends_at, language, label("notObserved"), timeZone)}`
              : state === "ended"
                ? `${label("endedAt")} ${formatCompactDateTime(event.ends_at, language, label("notObserved"), timeZone)}`
                : `${label("starts")} ${formatCompactDateTime(event.starts_at, language, label("notObserved"), timeZone)}`}
          </span>
        </div>
      </div>
      <span className={`${prefix}-live-meter`} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className={`${prefix}-live-facts`}>
        <div>
          <dt>{label("window")}</dt>
          <dd>{formatCompactDateTime(event.starts_at, language, label("notObserved"), timeZone)} - {formatCompactDateTime(event.ends_at, language, label("notObserved"), timeZone)}</dd>
        </div>
        <div>
          <dt>{label(namespace === "transit" ? "impactScope" : "location")}</dt>
          <dd>{scopeLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
