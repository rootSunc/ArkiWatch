import { DashboardSource } from "@/features/public-dashboard/types";

export type PlatformTone = "good" | "warn" | "bad" | "neutral";

export type PlatformTimeScope = {
  mode: "live" | "historical" | string;
  date: string | null;
  timezone: string;
  window_start: string | null;
  window_end: string | null;
};

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
  attributes?: Record<string, unknown>;
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
  time_scope?: PlatformTimeScope | null;
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

export type WeatherSourceRequest = {
  key: string;
  label: string;
  status: string;
  endpoint: string | null;
  content_type: string | null;
  fetched_at: string | null;
};

export type WeatherDataStage = {
  key: string;
  label: string;
  status: string;
  detail: string;
  record_count: number | null;
  updated_at: string | null;
};

export type WeatherQuality = {
  point_count: number;
  forecast_hours: number;
  field_coverage_pct: number;
  rain_window_count: number;
  missing_fields: string[];
  notes: string[];
};

export type WeatherWarning = {
  title: string;
  description: string | null;
  link: string | null;
  published_at: string | null;
  severity: string | null;
};

export type WeatherTimePreset = "day" | "next24h" | "next7d" | "custom";

export type WeatherTimeWindow = {
  preset: WeatherTimePreset;
  label: string;
  shortLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  isValid: boolean;
};

export type WeatherForecastResponse = {
  checked_at: string;
  time_scope?: PlatformTimeScope | null;
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
  source_requests: WeatherSourceRequest[];
  data_pipeline: WeatherDataStage[];
  quality: WeatherQuality;
  warnings: WeatherWarning[];
};

export type AirQualityStation = {
  station: string;
  label: string;
  score: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  lat: number | null;
  lon: number | null;
};

export type AirQualityMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

export type AirQualitySourceRequest = {
  key: string;
  label: string;
  status: string;
  endpoint: string | null;
  content_type: string | null;
  fetched_at: string | null;
};

export type AirQualityDataStage = {
  key: string;
  label: string;
  status: string;
  detail: string;
  record_count: number | null;
  updated_at: string | null;
};

export type AirQualityQuality = {
  station_count: number;
  reporting_station_count: number;
  field_coverage_pct: number;
  missing_fields: string[];
  notes: string[];
};

export type AirQualityCurrentResponse = {
  checked_at: string;
  time_scope?: PlatformTimeScope | null;
  status: string;
  location: string | null;
  source_code: string;
  observed_at: string | null;
  valid_to: string | null;
  summary: string | null;
  worst_station: string | null;
  worst_label: string | null;
  worst_score: number | null;
  metrics: AirQualityMetric[];
  stations: AirQualityStation[];
  source_requests: AirQualitySourceRequest[];
  data_pipeline: AirQualityDataStage[];
  quality: AirQualityQuality;
};

export type TransitAlert = {
  id: string;
  title: string;
  description: string;
  severity: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  cause: string | null;
  effect: string | null;
  route_ids: string[];
  stop_ids: string[];
  trip_ids: string[];
};

export type TransitMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

export type TransitSourceRequest = {
  key: string;
  label: string;
  status: string;
  endpoint: string | null;
  content_type: string | null;
  fetched_at: string | null;
};

export type TransitDataStage = {
  key: string;
  label: string;
  status: string;
  detail: string;
  record_count: number | null;
  updated_at: string | null;
};

export type TransitQuality = {
  raw_alert_count: number;
  normalized_event_count: number;
  active_alert_count: number;
  route_alert_count: number;
  stop_alert_count: number;
  field_coverage_pct: number;
  missing_fields: string[];
  notes: string[];
};

export type TransitCurrentResponse = {
  checked_at: string;
  time_scope?: PlatformTimeScope | null;
  status: string;
  location: string | null;
  source_code: string;
  observed_at: string | null;
  summary: string | null;
  metrics: TransitMetric[];
  alerts: TransitAlert[];
  source_requests: TransitSourceRequest[];
  data_pipeline: TransitDataStage[];
  quality: TransitQuality;
};

export type RoadRailIncident = {
  id: string;
  title: string;
  description: string;
  severity: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  location_ref: string;
  message_type: string | null;
  situation_type: string | null;
  location_description: string | null;
  feature_names: string[];
  geometry_bbox: number[] | null;
};

export type RoadRailCorridor = {
  key: string;
  label: string;
  event_count: number;
  active_event_count: number;
  weather_risk_count: number;
  severity: string;
  latest_title: string;
  latest_valid_to: string;
  geometry_bbox: number[] | null;
};

export type RoadRailMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

export type RoadRailSourceRequest = {
  key: string;
  label: string;
  status: string;
  endpoint: string | null;
  content_type: string | null;
  fetched_at: string | null;
  message_count: number;
};

export type RoadRailDataStage = {
  key: string;
  label: string;
  status: string;
  detail: string;
  record_count: number | null;
  updated_at: string | null;
};

export type RoadRailQuality = {
  raw_message_count: number;
  normalized_event_count: number;
  active_event_count: number;
  road_event_count: number;
  rail_event_count: number;
  weather_risk_count: number;
  corridor_count: number;
  field_coverage_pct: number;
  missing_fields: string[];
  notes: string[];
};

export type RoadRailCurrentResponse = {
  checked_at: string;
  time_scope?: PlatformTimeScope | null;
  status: string;
  location: string | null;
  source_code: string;
  observed_at: string | null;
  summary: string | null;
  metrics: RoadRailMetric[];
  incidents: RoadRailIncident[];
  corridors: RoadRailCorridor[];
  source_requests: RoadRailSourceRequest[];
  data_pipeline: RoadRailDataStage[];
  quality: RoadRailQuality;
};

export type EnergyPoint = {
  starts_at: string;
  ends_at: string;
  value: number;
  unit: string | null;
  estimated_cost_eur: number | null;
};

export type EnergyWindow = {
  starts_at: string;
  ends_at: string;
  average_value: number;
  minimum_value: number;
  maximum_value: number;
  unit: string | null;
  point_count: number;
  severity: string;
  source: string;
  estimated_cost_eur: number | null;
  usage_kwh: number | null;
};

export type EnergyMetric = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

export type EnergySourceRequest = {
  key: string;
  label: string;
  status: string;
  endpoint: string | null;
  content_type: string | null;
  fetched_at: string | null;
};

export type EnergyDataStage = {
  key: string;
  label: string;
  status: string;
  detail: string;
  record_count: number | null;
  updated_at: string | null;
};

export type EnergyQuality = {
  point_count: number;
  window_point_count: number;
  field_coverage_pct: number;
  minimum_value: number | null;
  maximum_value: number | null;
  average_value: number | null;
  missing_fields: string[];
  notes: string[];
};

export type EnergyCurrentResponse = {
  checked_at: string;
  time_scope?: PlatformTimeScope | null;
  status: string;
  location: string | null;
  source_code: string;
  observed_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  summary: string | null;
  unit: string | null;
  current_window: EnergyWindow | null;
  metrics: EnergyMetric[];
  points: EnergyPoint[];
  source_requests: EnergySourceRequest[];
  data_pipeline: EnergyDataStage[];
  quality: EnergyQuality;
};

export type PlatformHistoricalSnapshot<T> = {
  date: string;
  data: T | null;
  error: string | null;
};

export type PlatformHistoryResponse = {
  weather: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  airQuality: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
  energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  householdEnergy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  roadRail: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  transit: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
};

export type PlatformHistoryApiResponse = {
  weather: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  air_quality: PlatformHistoricalSnapshot<AirQualityCurrentResponse>[];
  energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  household_energy: PlatformHistoricalSnapshot<EnergyCurrentResponse>[];
  road_rail: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  transit: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
};
