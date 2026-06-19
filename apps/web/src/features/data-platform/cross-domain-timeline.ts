import type { PublicDashboardRead, PublicTimelineItemRead, PlatformEvent } from "./types";
import { scopedEventState, type ScopedEventState } from "./event-time-state";

export type CrossDomainTimelineItem = {
  id: string;
  kind: "event" | "scenario";
  title: string;
  title_zh?: string | null;
  detail: string;
  detail_zh?: string | null;
  severity: string;
  startsAt: string;
  endsAt: string;
  categoryKey: string;
  state: ScopedEventState;
  scenarioKey?: string;
  event?: PlatformEvent;
};

const SCENARIO_CATEGORY: Record<string, string> = {
  outdoor: "weather",
  home_air: "air",
  commute: "mobility",
  energy: "energy",
};

function timelineFromEvent(
  event: PlatformEvent,
  referenceTimestamp: number,
): CrossDomainTimelineItem {
  const startsAt = startsAtMs(event.starts_at);
  const endsAt = startsAtMs(event.ends_at);
  return {
    id: `event-${event.id}`,
    kind: "event",
    title: event.title,
    title_zh: event.title_zh,
    detail: event.body,
    detail_zh: event.body_zh,
    severity: event.severity,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    categoryKey: event.category_key,
    state: scopedEventState(
      Number.isFinite(startsAt) && Number.isFinite(endsAt) &&
        startsAt <= referenceTimestamp && endsAt >= referenceTimestamp,
      event.starts_at,
      referenceTimestamp,
    ),
    event,
  };
}

function timelineFromScenario(
  item: PublicTimelineItemRead,
  publicDashboard: PublicDashboardRead | null,
  referenceTimestamp: number,
): CrossDomainTimelineItem {
  const section = publicDashboard?.scenario_sections.find(
    (candidate) => candidate.key === item.scenario_key,
  );
  return {
    id: `scenario-${item.scenario_key}-${item.starts_at}`,
    kind: "scenario",
    title: item.label,
    title_zh: item.label_zh,
    detail: section?.description ?? item.scenario_key,
    detail_zh: section?.description_zh,
    severity: item.severity,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    categoryKey: SCENARIO_CATEGORY[item.scenario_key] ?? item.scenario_key,
    state: scopedEventState(
      startsAtMs(item.starts_at) <= referenceTimestamp &&
        startsAtMs(item.ends_at) >= referenceTimestamp,
      item.starts_at,
      referenceTimestamp,
    ),
    scenarioKey: item.scenario_key,
  };
}

function startsAtMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function buildCrossDomainTimeline(
  events: PlatformEvent[],
  publicDashboard: PublicDashboardRead | null,
  limit = 10,
  referenceAt?: string | null,
): CrossDomainTimelineItem[] {
  const parsedReference = referenceAt ? new Date(referenceAt).getTime() : Number.NaN;
  const referenceTimestamp = Number.isFinite(parsedReference) ? parsedReference : Date.now();
  const scenarioItems = (publicDashboard?.timeline ?? []).map((item) =>
    timelineFromScenario(item, publicDashboard, referenceTimestamp),
  );
  const eventItems = events.map((event) => timelineFromEvent(event, referenceTimestamp));
  const seen = new Set<string>();

  const merged = [...eventItems, ...scenarioItems].filter((item) => {
    const key = `${item.kind}:${item.title}:${item.startsAt}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return merged
    .sort((left, right) => {
      const stateRank: Record<ScopedEventState, number> = {
        active: 0,
        upcoming: 1,
        ended: 2,
      };
      const stateDifference = stateRank[left.state] - stateRank[right.state];
      if (stateDifference !== 0) {
        return stateDifference;
      }

      if (left.state === "ended" && right.state === "ended") {
        return startsAtMs(right.endsAt) - startsAtMs(left.endsAt);
      }
      return startsAtMs(left.startsAt) - startsAtMs(right.startsAt);
    })
    .slice(0, limit);
}
