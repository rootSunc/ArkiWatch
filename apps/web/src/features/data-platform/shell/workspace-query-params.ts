import type { MobilityTabKey } from "../workspaces/mobility/mobility-workspace";

export type EnergyPanelKey = "fingrid" | "porssisahko";

export const MOBILITY_TAB_QUERY_KEY = "mobilityTab";
export const ENERGY_TAB_QUERY_KEY = "energyTab";

export function resolveMobilityTabParam(
  value: string | null | undefined,
): MobilityTabKey {
  return value === "traffic" ? "traffic" : "transit";
}

export function resolveEnergyTabParam(
  value: string | null | undefined,
): EnergyPanelKey {
  return value === "fingrid" ? "fingrid" : "porssisahko";
}

export function defaultEnergyTabForScenario(): EnergyPanelKey {
  return "porssisahko";
}
