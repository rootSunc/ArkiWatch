import { appEnv } from "@/lib/env";
import { PersonalDashboardResponse } from "@/features/personal-assistant/types";
import {
  DashboardSource,
  PublicAction,
  PublicDashboardResponse
} from "@/features/public-dashboard/types";

import {
  PlatformCategory,
  PlatformEvent,
  PlatformMetric,
  PlatformOverviewResponse,
  PlatformVisualization
} from "./types";

type PlatformFetchResult = {
  apiBaseUrl: string;
  defaultUserId: string;
  overview: PlatformOverviewResponse | null;
  error: string | null;
};

function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const fallbackValue = "http://127.0.0.1:8000/api";
  const normalizedValue = (rawValue ?? fallbackValue).trim() || fallbackValue;

  return normalizedValue.endsWith("/") ? normalizedValue.slice(0, -1) : normalizedValue;
}

async function fetchJson<T>(
  url: URL
): Promise<{ data: T | null; error: string | null; status: number | null }> {
  try {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Platform request failed with ${response.status}.`,
        status: response.status
      };
    }

    return { data: (await response.json()) as T, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown fetch failure.",
      status: null
    };
  }
}

const CATEGORY_CONFIG = {
  weather: {
    title: "Weather",
    description: "FMI forecast signals, rain windows, wind, and outdoor weather risk.",
    sourceCodes: ["fmi"],
    scenarioKeys: ["outdoor"]
  },
  air: {
    title: "Air quality",
    description: "HSY station observations, exposure level, and ventilation context.",
    sourceCodes: ["hsy"],
    scenarioKeys: ["home_air"]
  },
  transit: {
    title: "Transit",
    description: "Digitransit service alerts, delay windows, and route disruption events.",
    sourceCodes: ["digitransit"],
    scenarioKeys: ["commute"]
  },
  energy: {
    title: "Energy",
    description: "Fingrid energy windows for flexible electricity use and grid timing.",
    sourceCodes: ["fingrid"],
    scenarioKeys: ["energy"]
  }
} as const;

type CategoryKey = keyof typeof CATEGORY_CONFIG;

function sourceStatus(sources: DashboardSource[]): string {
  if (sources.length === 0) {
    return "unknown";
  }

  const statuses = new Set(sources.map((source) => source.operational_status));
  for (const status of ["failing", "stale", "pending", "inactive", "healthy"]) {
    if (statuses.has(status)) {
      return status;
    }
  }

  return "unknown";
}

function statusTone(status: string): string {
  if (status === "healthy" || status === "fresh") {
    return "good";
  }

  if (status === "stale" || status === "pending" || status === "degraded") {
    return "warn";
  }

  if (status === "failing" || status === "inactive") {
    return "bad";
  }

  return "neutral";
}

function severityTone(severity: string): string {
  if (severity === "HIGH" || severity === "high") {
    return "bad";
  }

  if (severity === "MEDIUM" || severity === "medium") {
    return "warn";
  }

  if (severity === "LOW" || severity === "low") {
    return "good";
  }

  return "neutral";
}

function severityScore(severity: string): number {
  switch (severity.toUpperCase()) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

function actionToEvent(action: PublicAction, categoryKey: CategoryKey): PlatformEvent {
  return {
    id: `fallback-${action.id}`,
    category_key: categoryKey,
    title: action.title,
    body: action.body,
    severity: action.severity,
    starts_at: action.valid_from,
    ends_at: action.valid_to,
    source_codes: [...CATEGORY_CONFIG[categoryKey].sourceCodes],
    evidence: action.evidence
  };
}

function buildMetric(
  metric: Omit<PlatformMetric, "unit" | "detail" | "updated_at"> &
    Partial<Pick<PlatformMetric, "unit" | "detail" | "updated_at">>
): PlatformMetric {
  return {
    unit: null,
    detail: null,
    updated_at: null,
    ...metric
  };
}

function severityDistribution(events: PlatformEvent[]) {
  const severities = ["INFO", "LOW", "MEDIUM", "HIGH"];
  return {
    points: severities.map((severity) => ({
      label: severity.toLowerCase(),
      value: events.filter((event) => event.severity.toUpperCase() === severity).length,
      tone: severityTone(severity)
    }))
  };
}

function timelineData(events: PlatformEvent[]) {
  return {
    items: events.slice(0, 8).map((event) => ({
      id: event.id,
      label: event.title,
      detail: event.body,
      severity: event.severity,
      tone: severityTone(event.severity),
      starts_at: event.starts_at,
      ends_at: event.ends_at
    }))
  };
}

function sourceVolumeData(sources: DashboardSource[]) {
  return {
    points: sources.map((source) => ({
      label: source.source_code,
      value: source.records_ingested ?? 0,
      tone: statusTone(source.operational_status),
      detail: source.operational_status
    }))
  };
}

function fallbackVisualizations(
  categoryKey: CategoryKey,
  sources: DashboardSource[],
  events: PlatformEvent[]
): PlatformVisualization[] {
  const sourceCodes = [...CATEGORY_CONFIG[categoryKey].sourceCodes];
  const updatedAt = events[0]?.starts_at ?? sources[0]?.last_run_finished_at ?? null;

  return [
    {
      id: `${categoryKey}-fallback-timeline`,
      title: "Event timeline",
      type: "timeline",
      description: "Derived from the existing public dashboard contract while platform API updates.",
      status: events.length > 0 ? "ready" : "empty",
      unit: null,
      source_codes: sourceCodes,
      updated_at: updatedAt,
      data: timelineData(events)
    },
    {
      id: `${categoryKey}-fallback-severity`,
      title: "Severity distribution",
      type: "bar",
      description: "Visible regional guidance grouped by severity.",
      status: events.length > 0 ? "ready" : "empty",
      unit: "events",
      source_codes: sourceCodes,
      updated_at: updatedAt,
      data: severityDistribution(events)
    },
    {
      id: `${categoryKey}-fallback-source-volume`,
      title: "Source collection volume",
      type: "bar",
      description: "Latest collector run volume for this category source.",
      status: sources.length > 0 ? "ready" : "empty",
      unit: "records",
      source_codes: sourceCodes,
      updated_at: sources[0]?.last_run_finished_at ?? sources[0]?.last_run_started_at ?? null,
      data: sourceVolumeData(sources)
    }
  ];
}

function fallbackCategoryStatus(sources: DashboardSource[], events: PlatformEvent[]): string {
  const maxSeverity = Math.max(...events.map((event) => severityScore(event.severity)), 0);
  if (maxSeverity >= 3) {
    return "alert";
  }
  if (maxSeverity >= 2) {
    return "watch";
  }
  return sourceStatus(sources);
}

function buildFallbackCategories(publicDashboard: PublicDashboardResponse): PlatformCategory[] {
  return (Object.keys(CATEGORY_CONFIG) as CategoryKey[]).map((categoryKey) => {
    const config = CATEGORY_CONFIG[categoryKey];
    const sourceCodes: string[] = [...config.sourceCodes];
    const scenarioKeys: string[] = [...config.scenarioKeys];
    const sources = publicDashboard.sources.filter((source) =>
      sourceCodes.includes(source.source_code)
    );
    const actions = [
      ...publicDashboard.top_actions,
      ...publicDashboard.scenario_sections.map((section) => section.recommendation),
      ...publicDashboard.broadcasts
    ].filter((action) => scenarioKeys.includes(action.scenario_key));
    const events = actions.map((action) => actionToEvent(action, categoryKey));
    const status = fallbackCategoryStatus(sources, events);
    const recordsIngested = sources.reduce(
      (total, source) => total + (source.records_ingested ?? 0),
      0
    );
    const updatedAt = sources[0]?.last_run_finished_at ?? sources[0]?.last_run_started_at ?? null;

    return {
      key: categoryKey,
      title: config.title,
      description: config.description,
      status,
      source_codes: sourceCodes,
      summary_metrics: [
        buildMetric({
          key: "source_status",
          label: "Source status",
          value: sourceStatus(sources).replaceAll("_", " "),
          tone: statusTone(sourceStatus(sources)),
          detail: "Fallback platform view from existing source health.",
          source_codes: sourceCodes,
          updated_at: updatedAt
        }),
        buildMetric({
          key: "active_events",
          label: "Active events",
          value: String(events.length),
          tone: severityTone(events[0]?.severity ?? "INFO"),
          detail: "Derived regional guidance events for this category.",
          source_codes: sourceCodes
        }),
        buildMetric({
          key: "records_ingested",
          label: "Latest ingest",
          value: String(recordsIngested),
          tone: statusTone(sourceStatus(sources)),
          unit: "records",
          detail: "Records from latest collector run metadata.",
          source_codes: sourceCodes,
          updated_at: updatedAt
        })
      ],
      visualizations: fallbackVisualizations(categoryKey, sources, events),
      events,
      sources
    };
  });
}

function buildFallbackOverview(
  publicDashboard: PublicDashboardResponse,
  personalDashboard: PersonalDashboardResponse | null
): PlatformOverviewResponse {
  const categories = buildFallbackCategories(publicDashboard);
  const statuses = new Set(categories.map((category) => category.status));
  const healthStatus = statuses.has("alert")
    ? "alert"
    : statuses.has("watch") || statuses.has("stale") || statuses.has("pending")
      ? "watch"
      : "healthy";

  return {
    checked_at: publicDashboard.checked_at,
    app_name: publicDashboard.app_name,
    timezone: personalDashboard?.timezone ?? publicDashboard.timezone,
    coverage_area: publicDashboard.coverage_area,
    health_status: healthStatus,
    categories,
    recent_events: categories.flatMap((category) => category.events).slice(0, 12),
    sources: publicDashboard.sources
  };
}

async function fetchFallbackPlatformOverview(
  apiBaseUrl: string
): Promise<{ data: PlatformOverviewResponse | null; error: string | null }> {
  const publicUrl = new URL(`${apiBaseUrl}/public/dashboard`);
  const personalUrl = new URL(`${apiBaseUrl}/personal/dashboard`);

  if (appEnv.defaultUserId) {
    personalUrl.searchParams.set("user_id", appEnv.defaultUserId);
  }

  const [publicResult, personalResult] = await Promise.all([
    fetchJson<PublicDashboardResponse>(publicUrl),
    fetchJson<PersonalDashboardResponse>(personalUrl)
  ]);

  if (!publicResult.data) {
    return {
      data: null,
      error: publicResult.error ?? "Platform and public dashboard requests failed."
    };
  }

  return {
    data: buildFallbackOverview(publicResult.data, personalResult.data),
    error: null
  };
}

export async function fetchPlatformHome(): Promise<PlatformFetchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  const overviewUrl = new URL(`${apiBaseUrl}/platform/overview`);

  if (appEnv.defaultUserId) {
    overviewUrl.searchParams.set("user_id", appEnv.defaultUserId);
  }

  const overviewResult = await fetchJson<PlatformOverviewResponse>(overviewUrl);
  if (!overviewResult.data && overviewResult.status === 404) {
    const fallbackResult = await fetchFallbackPlatformOverview(apiBaseUrl);
    return {
      apiBaseUrl,
      defaultUserId: appEnv.defaultUserId,
      overview: fallbackResult.data,
      error: fallbackResult.error
    };
  }

  return {
    apiBaseUrl,
    defaultUserId: appEnv.defaultUserId,
    overview: overviewResult.data,
    error: overviewResult.error
  };
}
