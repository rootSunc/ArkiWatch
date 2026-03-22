import type {
  EnergyCurrentResponse,
  EnergyPoint,
  PlatformCategory,
  PlatformHistoricalSnapshot,
  PlatformTone,
} from "./types";
import type { EnergyPanelKey } from "./workspace-query-params";

export type EnergyWorkspaceProps = {
  activePanel?: EnergyPanelKey;
  category: PlatformCategory | null;
  energy: EnergyCurrentResponse | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  householdEnergy: EnergyCurrentResponse | null;
  householdHistory: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  onPanelChange?: (panel: EnergyPanelKey) => void;
};

export type EnergyTone = PlatformTone | "good" | "warn" | "bad" | "neutral";

export type PanelMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  tone?: string | null;
  detail?: string | null;
  updated_at?: string | null;
};

export type EnergyDisplayPoint = {
  raw: EnergyPoint;
  display: EnergyPoint;
};

export type EnergyPanelProfile = {
  chartKind: "area-line" | "hourly-bars";
  chartKindLabelKey: string;
  pageClassName: string;
  rangeLabelKey: string;
  spreadLabelKey: string;
  unitLabelKey: string;
  valueColumnLabelKey: string;
  detailColumnLabelKey: string;
  noUnitLabelKey: string;
};
