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
  label: string;
  icon: string;
}> = [
  {
    key: "porssisahko",
    label: "Household Prices",
    icon: "payments",
  },
  {
    key: "fingrid",
    label: "Fingrid System",
    icon: "electrical_services",
  },
];
export const ENERGY_PANEL_PROFILES: Record<EnergyPanelKey, EnergyPanelProfile> = {
  fingrid: {
    chartKind: "area-line",
    chartKindLabel: "Continuous system curve",
    pageClassName: "energy-detail-page-system",
    rangeLabel: "System value range",
    spreadLabel: "System spread",
    unitLabel: "Signal unit",
    valueColumnLabel: "Signal value",
    detailColumnLabel: "Ends",
    noUnitLabel: "raw value"
  },
  porssisahko: {
    chartKind: "hourly-bars",
    chartKindLabel: "Hourly cost bars",
    pageClassName: "energy-detail-page-price",
    rangeLabel: "Estimated cost range",
    spreadLabel: "Cost spread",
    unitLabel: "Displayed unit",
    valueColumnLabel: "Estimated cost",
    detailColumnLabel: "Spot price",
    noUnitLabel: "EUR"
  }
};