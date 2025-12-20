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
  timestamp?: string;
};

export type PlatformVisualizationSeries = {
  key: string;
  label: string;
  unit: string | null;
  tone?: PlatformTone | string;
  points: PlatformVisualizationPoint[];
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
  series?: PlatformVisualizationSeries[];
  items?: PlatformVisualizationTimelineItem[];
  value?: number;
  max?: number;
  label?: string | null;
  rain_windows?: Array<Record<string, unknown>>;
  point_count?: number;
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
  stage?: string;
  priority?: string;
  source_codes: string[];
  key_data_items?: string[];
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

export type WeatherForecastPoint = {
  timestamp: string;
  temperature_c: number | null;
  precipitation_mm: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  wind_direction_deg: number | null;
  cloud_cover_pct: number | null;
  humidity_pct: number | null;
  dew_point_c: number | null;
  pressure_hpa: number | null;
  visibility_m: number | null;
  weather_symbol: number | null;
  smart_symbol: number | null;
};

export type WeatherRainWindow = {
  starts_at: string;
  ends_at: string;
  peak_precip_mm: number;
  peak_precip_at: string;
  total_precip_mm: number;
  hours: number;
};

export type WeatherMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

export type WeatherSourceLayer = {
  key: string;
  label: string;
  status: string;
  detail: string;
  updated_at: string | null;
};

export type WeatherWarning = {
  title: string;
  description: string | null;
  link: string | null;
  published_at: string | null;
  severity: string | null;
};

export type WeatherForecastResponse = {
  checked_at: string;
  status: string;
  location: string | null;
  source_code: string;
  generated_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  summary: string | null;
  metrics: WeatherMetric[];
  points: WeatherForecastPoint[];
  rain_windows: WeatherRainWindow[];
  source_layers: WeatherSourceLayer[];
  warnings: WeatherWarning[];
};
