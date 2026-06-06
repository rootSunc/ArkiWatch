import type { PublicDashboardRead, PublicTimelineItemRead, PlatformEvent } from "./types";

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
  scenarioKey?: string;
  event?: PlatformEvent;
};

const SCENARIO_CATEGORY: Record<string, string> = {
  outdoor: "weather",
  home_air: "air",
  commute: "mobility",
  energy: "energy",
};

function timelineFromEvent(event: PlatformEvent): CrossDomainTimelineItem {
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
    event,
  };
}

function timelineFromScenario(
  item: PublicTimelineItemRead,
  publicDashboard: PublicDashboardRead | null,
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
): CrossDomainTimelineItem[] {
  const scenarioItems = (publicDashboard?.timeline ?? []).map((item) =>
    timelineFromScenario(item, publicDashboard),
  );
  const eventItems = events.map(timelineFromEvent);
  const seen = new Set<string>();

  const merged = [...eventItems, ...scenarioItems].filter((item) => {
    const key = `${item.kind}:${item.title}:${item.startsAt}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const now = Date.now();

  return merged
    .sort((left, right) => {
      const leftActive =
        startsAtMs(left.startsAt) <= now && startsAtMs(left.endsAt) >= now;
      const rightActive =
        startsAtMs(right.startsAt) <= now && startsAtMs(right.endsAt) >= now;
      if (leftActive !== rightActive) {
        return leftActive ? -1 : 1;
      }
      return startsAtMs(left.startsAt) - startsAtMs(right.startsAt);
    })
    .slice(0, limit);
}
