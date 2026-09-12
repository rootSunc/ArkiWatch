import type { MobilityTabKey } from "./mobility-workspace";
import type { ScenarioLiveSignals } from "./scenario-live-hints";
import {
  defaultEnergyTabForScenario,
  type EnergyPanelKey,
} from "./workspace-query-params";
import { isEmptyStatus } from "./platform-status";

export const SCENARIO_NAV_KEYS: Record<string, string> = {
  outdoor: "weather",
  home_air: "air",
  commute: "mobility",
  energy: "energy",
};

const SUMMARY_TILE_NAV_KEYS: Record<string, string> = {
  outdoor: "weather",
  air: "air",
  commute: "mobility",
  energy: "energy",
};

export type ScenarioNavigationTarget = {
  navKey: string;
  mobilityTab?: MobilityTabKey;
  energyTab?: EnergyPanelKey;
};

export function resolveMobilityTabForSignals(
  signals: ScenarioLiveSignals,
): MobilityTabKey {
  const transit = signals.transit && !isEmptyStatus(signals.transit.status)
    ? signals.transit
    : null;
  const roadRail = signals.roadRail && !isEmptyStatus(signals.roadRail.status)
    ? signals.roadRail
    : null;
  const transitAlerts = transit?.quality.active_alert_count ?? 0;
  const roadEvents = roadRail?.quality.active_event_count ?? 0;
  return roadEvents > transitAlerts ? "traffic" : "transit";
}

export function resolveScenarioTarget(
  scenarioKey: string,
  signals?: ScenarioLiveSignals,
): ScenarioNavigationTarget | null {
  const navKey = SCENARIO_NAV_KEYS[scenarioKey];
  if (!navKey) {
    return null;
  }

  if (navKey === "mobility" && signals) {
    return {
      navKey,
      mobilityTab: resolveMobilityTabForSignals(signals),
    };
  }

  if (navKey === "energy") {
    return {
      navKey,
      energyTab: defaultEnergyTabForScenario(),
    };
  }

  return { navKey };
}

export function resolveSummaryTileTarget(
  tileKey: string,
  signals?: ScenarioLiveSignals,
): ScenarioNavigationTarget | null {
  const navKey = SUMMARY_TILE_NAV_KEYS[tileKey];
  if (!navKey) {
    return null;
  }

  if (navKey === "mobility" && signals) {
    return {
      navKey,
      mobilityTab: resolveMobilityTabForSignals(signals),
    };
  }

  if (navKey === "energy") {
    return {
      navKey,
      energyTab: defaultEnergyTabForScenario(),
    };
  }

  return { navKey };
}
