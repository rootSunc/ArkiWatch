import type { EnergyPanelKey } from "./workspace-query-params";
import type { EnergyPanelProfile } from "./energy-workspace-types";

export const PRICE_CHART_WIDTH = 720;
export const PRICE_CHART_HEIGHT = 240;
export const PRICE_CHART_PAD_LEFT = 65;
export const PRICE_CHART_PAD_RIGHT = 25;
export const PRICE_CHART_PAD_TOP = 25;
export const PRICE_CHART_PAD_BOTTOM = 40;
export const DEFAULT_HOUSEHOLD_PRICE_PROVIDER = "Fortum";
export const ENERGY_PANEL_TABS: Array<{
  key: EnergyPanelKey;
  labelKey: string;
  icon: string;
}> = [
  {
    key: "porssisahko",
    labelKey: "householdPrices",
    icon: "payments",
  },
  {
    key: "fingrid",
    labelKey: "fingridSystem",
    icon: "electrical_services",
  },
];
export const ENERGY_PANEL_PROFILES: Record<EnergyPanelKey, EnergyPanelProfile> = {
  fingrid: {
    chartKind: "area-line",
    chartKindLabelKey: "continuousSystemCurve",
    pageClassName: "energy-detail-page-system",
    rangeLabelKey: "systemValueRange",
    spreadLabelKey: "systemSpread",
    unitLabelKey: "signalUnit",
    valueColumnLabelKey: "signalValue",
    detailColumnLabelKey: "ends",
    noUnitLabelKey: "rawValue",
  },
  porssisahko: {
    chartKind: "hourly-bars",
    chartKindLabelKey: "hourlyCostBars",
    pageClassName: "energy-detail-page-price",
    rangeLabelKey: "estimatedCostRange",
    spreadLabelKey: "costSpread",
    unitLabelKey: "displayedUnit",
    valueColumnLabelKey: "estimatedCost",
    detailColumnLabelKey: "spotPrice",
    noUnitLabelKey: "eur",
  },
};
