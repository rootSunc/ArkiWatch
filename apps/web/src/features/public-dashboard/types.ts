export type SourceDataField = {
  key: string;
  label: string;
  value_type: string;
  description: string;
  required: boolean;
  unit: string | null;
};

export type SourceDatasetStructure = {
  dataset: string;
  label: string;
  shape: string;
  cadence: string;
  spatial_grain: string;
  temporal_field: string | null;
  primary_keys: string[];
  fields: SourceDataField[];
};

export type SourceNormalizedEventStructure = {
  event_type: string;
  description: string;
  location_type: string;
  validity_window: string;
  attributes: SourceDataField[];
};

export type DashboardSource = {
  id: string;
  source_code: string;
  source_name: string;
  auth_type: string;
  poll_interval_seconds: number;
  operational_status: string;
  stage?: string;
  categories?: string[];
  datasets?: string[];
  key_data_items?: string[];
  data_structures?: SourceDatasetStructure[];
  normalized_event_structures?: SourceNormalizedEventStructure[];
  license_label?: string | null;
  documentation_url?: string | null;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  records_ingested: number | null;
  error_message: string | null;
};

export type PublicAction = {
  id: string;
  scenario_key: string;
  title: string;
  body: string;
  severity: string;
  area_scope: string;
  freshness_state: string;
  valid_from: string;
  valid_to: string;
  evidence: string[];
};

export type ScenarioChannel = {
  scenario_key: string;
  title: string;
  description: string;
};

export type PublicScenarioSection = {
  key: string;
  title: string;
  description: string;
  status_label: string;
  area_scope: string;
  freshness_state: string;
  valid_from: string;
  valid_to: string;
  evidence: string[];
  source_codes: string[];
  recommendation: PublicAction;
};

export type PublicTimelineItem = {
  scenario_key: string;
  label: string;
  severity: string;
  starts_at: string;
  ends_at: string;
};

export type PublicDashboardResponse = {
  checked_at: string;
  app_name: string;
  timezone: string;
  coverage_area: string;
  top_actions: PublicAction[];
  scenario_channels: ScenarioChannel[];
  scenario_sections: PublicScenarioSection[];
  timeline: PublicTimelineItem[];
  broadcasts: PublicAction[];
  sources: DashboardSource[];
};
