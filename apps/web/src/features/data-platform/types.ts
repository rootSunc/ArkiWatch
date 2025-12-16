import { DashboardSource } from "@/features/public-dashboard/types";

export type PlatformTone = "good" | "warn" | "bad" | "neutral";

export type PlatformMetric = {
  key: string;
  label: string;
  value: string;
  tone: PlatformTone | string;
  unit: string | null;
  detail: string | null;
  updated_at: string | null;
  source_codes: string[];
};

export type PlatformEvent = {
  id: string;
  category_key: string;
  title: string;
  body: string;
  severity: string;
  starts_at: string;
  ends_at: string;
  source_codes: string[];
  evidence: string[];
};

export type PlatformVisualizationPoint = {
  label: string;
  value: number;
  tone?: PlatformTone | string;
  detail?: string;
};

export type PlatformVisualizationTimelineItem = {
  id: string;
  label: string;
  detail: string;
  severity: string;
  tone?: PlatformTone | string;
  starts_at: string;
  ends_at: string;
};

export type PlatformVisualizationData = {
  points?: PlatformVisualizationPoint[];
  items?: PlatformVisualizationTimelineItem[];
  value?: number;
  max?: number;
  label?: string | null;
};

export type PlatformVisualization = {
  id: string;
  title: string;
  type: "line" | "area" | "bar" | "heatmap" | "timeline" | "map" | "table" | "gauge" | string;
  description: string;
  status: string;
  unit: string | null;
  source_codes: string[];
  updated_at: string | null;
  data: PlatformVisualizationData;
};

export type PlatformCategory = {
  key: string;
  title: string;
  description: string;
  status: string;
  source_codes: string[];
  summary_metrics: PlatformMetric[];
  visualizations: PlatformVisualization[];
  events: PlatformEvent[];
  sources: DashboardSource[];
};

export type PlatformOverviewResponse = {
  checked_at: string;
  app_name: string;
  timezone: string;
  coverage_area: string;
  health_status: string;
  categories: PlatformCategory[];
  recent_events: PlatformEvent[];
  sources: DashboardSource[];
};
