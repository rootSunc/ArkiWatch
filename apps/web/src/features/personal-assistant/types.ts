import { DashboardSource } from "@/features/public-dashboard/types";

export type PersonalUser = {
  id: string;
  email: string | null;
  name: string | null;
  locale: string;
  timezone: string;
  default_location: string | null;
};

export type WorkflowStep = {
  key: string;
  title: string;
  status: string;
  detail: string;
};

export type TodayCard = {
  type: string;
  title: string;
  summary: string;
  severity: string;
  valid_to: string | null;
};

export type NotificationHistoryItem = {
  id: string;
  status: string;
  message: string;
  sent_at: string | null;
};

export type TodaySummary = {
  date: string;
  location: string | null;
  cards: TodayCard[];
  notifications: NotificationHistoryItem[];
};

export type Recommendation = {
  id: string;
  recommendation_type: string;
  priority: number;
  status: string;
  advice_title: string;
  advice_body: string;
  valid_from: string;
  valid_to: string;
  event_type: string;
  event_severity: string;
};

export type PersonalScenario = {
  key: string;
  title: string;
  description: string;
  readiness: string;
  readiness_detail: string;
  source_status: string;
  source_codes: string[];
  missing_env: string[];
  supports_recommendations: boolean;
  primary_card: TodayCard | null;
  recommendations: Recommendation[];
};

export type Notification = {
  id: string;
  recommendation_id: string;
  delivery_status: string;
  message_text: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type PersonalDashboardResponse = {
  checked_at: string;
  app_name: string;
  timezone: string;
  health_status: string;
  database: string;
  selection_mode: string;
  selection_error: string | null;
  current_user: PersonalUser | null;
  onboarding_completion_percent: number;
  workflow_steps: WorkflowStep[];
  scenario_sections: PersonalScenario[];
  today: TodaySummary | null;
  recommendations: Recommendation[];
  notifications: Notification[];
  sources: DashboardSource[];
};
