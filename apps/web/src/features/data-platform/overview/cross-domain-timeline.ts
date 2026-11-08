import type { PlatformEvent } from "../types";
import type { ScopedEventState } from "../model/event-time-state";

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
