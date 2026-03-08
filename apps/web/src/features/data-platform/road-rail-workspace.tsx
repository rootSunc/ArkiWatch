"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  RoadRailCorridor,
  RoadRailCurrentResponse,
  RoadRailDataStage,
  RoadRailIncident,
  RoadRailSourceRequest
} from "./types";
import {
  IncidentTimelinePager,
  INCIDENT_TIMELINE_PAGE_SIZE,
  paginateTimelineItems,
} from "./incident-timeline-pager";
import { TrendChart, TrendChartPoint } from "./lazy-trend-chart";
import { eventAnchorId } from "./recent-events";

type RoadRailWorkspaceProps = {
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  roadRail: RoadRailCurrentResponse | null;
};

type RoadRailTone = "good" | "warn" | "bad" | "neutral";
type RoadRailIncidentFilter = "priority" | "active" | "road" | "rail" | "weather" | "all";
type RoadRailNetworkMetric = {
  key: string;
  label: string;
  detail: string;
  count: number;
  tone: RoadRailTone;
  width: number;
};
type RoadRailDetailValue = {
  id: string;
  label: string;
  meta: string | null;
};
type RoadRailDetailItem = {
  empty: string;
  icon: string;
  key: string;
  label: string;
  values: RoadRailDetailValue[];
};

type RoadRailTimelineBounds = {
  startsAt: number;
  endsAt: number;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const SEVERITY_LABELS = ["HIGH", "MEDIUM", "LOW", "INFO"];
const MIN_TIMELINE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_TIMELINE_WINDOW_MS = 60 * 60 * 1000;
const INCIDENT_FILTERS: Array<{ icon: string; key: RoadRailIncidentFilter; label: string }> = [
  { icon: "priority_high", key: "priority", label: "Priority" },
  { icon: "radio_button_checked", key: "active", label: "Active" },
  { icon: "traffic", key: "road", label: "Road" },
  { icon: "train", key: "rail", label: "Rail" },
  { icon: "thunderstorm", key: "weather", label: "Weather" },
  { icon: "view_list", key: "all", label: "All" }
];

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "missing";
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatCompactTime(value: string | null | undefined, language: LanguageMode, t: (value: string) => string): string {
  if (!value) {
    return t("not observed");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(new Date(value))
    .toUpperCase();
}

function formatTimelineBoundary(value: number, language: LanguageMode): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(new Date(value))
    .toUpperCase();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function statusTone(status: string): RoadRailTone {
  if (status === "ready" || status === "fetched") {
    return "good";
  }
  if (status === "empty" || status === "missing" || status === "planned" || status === "stale") {
    return "warn";
  }
  if (status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
}

function liveStatusTone(status: string | null | undefined): "ready" | "stale" | "empty" {
  if (status === "ready") {
    return "ready";
  }
  if (status === "stale") {
    return "stale";
  }
  return "empty";
}

function exactObservedLabel(value: string | null, language: LanguageMode, t: (value: string) => string): string {
  if (!value) {
    return t("not observed");
  }

  return `${formatTimestamp(value, "dateTime", language)} (${formatRelativeAge(value, language)})`;
}

function severityTone(severity: string): RoadRailTone {
  if (severity === "HIGH") {
    return "bad";
  }
  if (severity === "MEDIUM") {
    return "warn";
  }
  if (severity === "LOW") {
    return "good";
  }
  return "neutral";
}

function isHighSeverity(incident: RoadRailIncident): boolean {
  return incident.severity.toUpperCase() === "HIGH";
}

function isRoadIncident(incident: RoadRailIncident): boolean {
  return incident.event_type.startsWith("road_");
}

function isRailIncident(incident: RoadRailIncident): boolean {
  return incident.event_type.startsWith("rail_");
}

function isWeatherIncident(incident: RoadRailIncident): boolean {
  const searchableText = [
    incident.event_type,
    incident.message_type,
    incident.situation_type,
    incident.title,
    incident.description
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes("weather") || searchableText.includes("slippery") || searchableText.includes("icy");
}

function filterIncidents(incidents: RoadRailIncident[], filter: RoadRailIncidentFilter): RoadRailIncident[] {
  if (filter === "priority") {
    return incidents.filter((incident) => incident.active || isHighSeverity(incident));
  }
  if (filter === "active") {
    return incidents.filter((incident) => incident.active);
  }
  if (filter === "road") {
    return incidents.filter(isRoadIncident);
  }
  if (filter === "rail") {
    return incidents.filter(isRailIncident);
  }
  if (filter === "weather") {
    return incidents.filter(isWeatherIncident);
  }

  return incidents;
}

function filterEmptyMessage(filter: RoadRailIncidentFilter, t: (value: string) => string): string {
  if (filter === "priority") {
    return t("No priority road or rail incidents are active or upcoming.");
  }
  if (filter === "active") {
    return t("No road or rail incidents are active right now.");
  }
  if (filter === "road") {
    return t("No road incidents were normalized from the latest Digitraffic payload.");
  }
  if (filter === "rail") {
    return t("No rail incidents were normalized from the latest Digitraffic payload.");
  }
  if (filter === "weather") {
    return t("No weather-related road or rail incidents were normalized.");
  }

  return t("No road or rail events were normalized from the latest Digitraffic payload.");
}

function eventTypeLabel(value: string, language: LanguageMode): string {
  return translateEnumLabel(language, value.replace(/^road_/, "").replace(/^rail_/, ""));
}

function messageTypeLabel(value: string | null, language: LanguageMode, t: (value: string) => string): string {
  return value ? translateEnumLabel(language, value) : t("message type unavailable");
}

function metricValue(roadRail: RoadRailCurrentResponse, key: string): string {
  const metric = roadRail.metrics.find((item) => item.key === key);
  return metric ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "0";
}

function severityDistribution(incidents: RoadRailIncident[]) {
  const max = Math.max(
    1,
    ...SEVERITY_LABELS.map(
      (severity) => incidents.filter((incident) => incident.severity === severity).length
    )
  );
  return SEVERITY_LABELS.map((severity) => {
    const count = incidents.filter((incident) => incident.severity === severity).length;
    return {
      count,
      severity,
      width: Math.max(8, (count / max) * 100)
    };
  });
}

function sourceRequestHost(endpoint: string | null, t: (value: string) => string): string {
  if (!endpoint) {
    return t("endpoint not recorded");
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function stageProgress(stage: RoadRailDataStage): number {
  if (stage.status === "ready") {
    return 100;
  }
  if (stage.status === "empty" || stage.status === "missing" || stage.status === "planned") {
    return 24;
  }
  return 55;
}

function activeConditionTone(roadRail: RoadRailCurrentResponse): RoadRailTone {
  if (roadRail.incidents.some((incident) => incident.active && incident.severity === "HIGH")) {
    return "bad";
  }
  if (roadRail.quality.active_event_count > 0) {
    return "warn";
  }
  return "good";
}

function highestSeverityLabel(incidents: RoadRailIncident[]): string {
  return SEVERITY_LABELS.find((severity) => incidents.some((incident) => incident.severity.toUpperCase() === severity)) ?? "NONE";
}

function nextActiveEndLabel(activeIncidents: RoadRailIncident[], language: LanguageMode, t: (value: string) => string): string {
  if (activeIncidents.length === 0) {
    return t("no active window");
  }

  const nextEndingIncident = [...activeIncidents].sort(
    (left, right) => new Date(left.ends_at).getTime() - new Date(right.ends_at).getTime()
  )[0];

  return `${t("until")} ${formatCompactTime(nextEndingIncident.ends_at, language, t)}`;
}

function roadRailRiskState(activeIncidents: RoadRailIncident[], allIncidents: RoadRailIncident[], t: (value: string) => string) {
  const highActive = activeIncidents.filter(isHighSeverity).length;
  const weatherActive = activeIncidents.filter(isWeatherIncident).length;
  const highUpcoming = allIncidents.filter((incident) => !incident.active && isHighSeverity(incident)).length;

  if (highActive > 0) {
    return {
      detail: `${highActive} high-severity incident${highActive === 1 ? "" : "s"} active across the Digitraffic feed.`,
      icon: "warning",
      title: t("High impact active")
    };
  }

  if (weatherActive > 0) {
    return {
      detail: `${weatherActive} weather-linked incident${weatherActive === 1 ? "" : "s"} may affect road conditions or timing.`,
      icon: "thunderstorm",
      title: t("Weather risk active")
    };
  }

  if (activeIncidents.length > 0) {
    return {
      detail: `${activeIncidents.length} active incident${activeIncidents.length === 1 ? "" : "s"} may affect corridor choice or timing.`,
      icon: "traffic",
      title: t("Corridor events active")
    };
  }

  if (highUpcoming > 0) {
    return {
      detail: `${highUpcoming} high-severity incident${highUpcoming === 1 ? "" : "s"} are scheduled or pending in the feed.`,
      icon: "schedule",
      title: t("High impact upcoming")
    };
  }

  return {
    detail: allIncidents.length > 0 ? t("No active incidents right now; monitor upcoming feed items.") : t("No active road or rail incidents in the latest Digitraffic feed."),
    icon: "check_circle",
    title: t("Network clear")
  };
}

function networkCompositionRows(
  roadRail: RoadRailCurrentResponse,
  t: (value: string) => string
): RoadRailNetworkMetric[] {
  const rows: Array<Omit<RoadRailNetworkMetric, "width">> = [
    {
      key: "road",
      label: t("Road events"),
      detail: t("normalized road events"),
      count: roadRail.quality.road_event_count,
      tone: "warn"
    },
    {
      key: "rail",
      label: t("Rail events"),
      detail: t("normalized rail events"),
      count: roadRail.quality.rail_event_count,
      tone: "good"
    },
    {
      key: "weather",
      label: t("Weather Risk"),
      detail: t("weather-related events"),
      count: roadRail.quality.weather_risk_count,
      tone: "bad"
    },
    {
      key: "corridors",
      label: t("Corridors"),
      detail: t("grouped locations"),
      count: roadRail.quality.corridor_count,
      tone: "neutral"
    }
  ];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return rows.map((row) => ({
    ...row,
    width: row.count > 0 ? Math.max(8, (row.count / maxCount) * 100) : 0
  }));
}

function incidentTimelineBounds(incidents: RoadRailIncident[], nowMs: number): RoadRailTimelineBounds | null {
  if (incidents.length === 0) {
    return null;
  }

  const times = incidents.flatMap((incident) => {
    const parsedStart = new Date(incident.starts_at).getTime();
    const parsedEnd = new Date(incident.ends_at).getTime();
    const startsAt = Number.isFinite(parsedStart) ? parsedStart : nowMs;
    const endsAt = Number.isFinite(parsedEnd)
      ? Math.max(startsAt + MIN_TIMELINE_WINDOW_MS, parsedEnd)
      : startsAt + DEFAULT_TIMELINE_WINDOW_MS;

    return [startsAt, endsAt];
  });

  const startsAt = Math.min(nowMs, ...times);
  const endsAt = Math.max(nowMs + DEFAULT_TIMELINE_WINDOW_MS, ...times);

  if (endsAt <= startsAt) {
    return {
      startsAt: nowMs,
      endsAt: nowMs + DEFAULT_TIMELINE_WINDOW_MS
    };
  }

  return { startsAt, endsAt };
}

function timelinePercent(value: number, bounds: RoadRailTimelineBounds): number {
  return clampPercent(((value - bounds.startsAt) / (bounds.endsAt - bounds.startsAt)) * 100);
}

function incidentWindowProgress(incident: RoadRailIncident, nowTimestamp: number): number {
  const startsAt = new Date(incident.starts_at).getTime();
  const endsAt = new Date(incident.ends_at).getTime();

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return incident.active ? 100 : 8;
  }

  if (nowTimestamp < startsAt) {
    return 8;
  }
  if (nowTimestamp >= endsAt) {
    return 100;
  }

  return Math.max(8, Math.min(100, ((nowTimestamp - startsAt) / (endsAt - startsAt)) * 100));
}

function locationLabel(incident: RoadRailIncident, t: (value: string) => string): string {
  return incident.location_description || incident.location_ref.replaceAll("-", " ") || t("location unavailable");
}

function scopePreview(incident: RoadRailIncident, t: (value: string) => string): string {
  if (incident.feature_names.length > 0) {
    return `${t("features")} ${incident.feature_names.slice(0, 3).join(", ")}${incident.feature_names.length > 3 ? " +" : ""}`;
  }

  return locationLabel(incident, t);
}

function bboxLabel(bbox: number[] | null, t: (value: string) => string): string {
  if (!bbox || bbox.length !== 4) {
    return t("bbox unavailable");
  }

  return bbox.map((value) => value.toFixed(2)).join(" / ");
}

function detailLocationItems(incident: RoadRailIncident, t: (value: string) => string): RoadRailDetailItem[] {
  return [
    {
      key: "location",
      label: t("Affected location"),
      icon: "pin_drop",
      values: [
        {
          id: incident.location_ref,
          label: locationLabel(incident, t),
          meta: incident.location_ref.replaceAll("-", " ")
        }
      ],
      empty: t("No location attached")
    },
    {
      key: "features",
      label: t("Road features"),
      icon: "route",
      values: incident.feature_names.map((feature) => ({
        id: feature,
        label: feature,
        meta: incident.location_description
      })),
      empty: t("No feature names attached")
    },
    {
      key: "geometry",
      label: t("Geometry"),
      icon: "polyline",
      values: incident.geometry_bbox
        ? [
            {
              id: "bbox",
              label: "BBox",
              meta: bboxLabel(incident.geometry_bbox, t)
            }
          ]
        : [],
      empty: t("No geometry attached")
    }
  ];
}

function renderCorridor(corridor: RoadRailCorridor, t: (value: string) => string, maxEventCount: number) {
  const tone = severityTone(corridor.severity);
  const totalWidth = corridor.event_count > 0 ? Math.max(8, (corridor.event_count / maxEventCount) * 100) : 0;
  const activeWidth = corridor.event_count > 0 ? clampPercent((corridor.active_event_count / corridor.event_count) * 100) : 0;
  const weatherWidth = corridor.event_count > 0 ? clampPercent((corridor.weather_risk_count / corridor.event_count) * 100) : 0;

  return (
    <article className={`road-rail-corridor road-rail-corridor-${tone}`} key={corridor.key}>
      <div>
        <strong>{corridor.label}</strong>
        <span>{t(corridor.severity)}</span>
      </div>
      <p>{corridor.latest_title}</p>
      <span className={`road-rail-corridor-load road-rail-corridor-load-${tone}`} aria-hidden="true">
        <span style={{ width: `${totalWidth}%` }}>
          <i style={{ width: `${activeWidth}%` }} />
          <em style={{ width: `${weatherWidth}%` }} />
        </span>
      </span>
      <div className="road-rail-corridor-meta">
        <span>{corridor.active_event_count} {t("active")}</span>
        <span>{corridor.event_count} {t("total")}</span>
        <span>{corridor.weather_risk_count} {t("weather")}</span>
      </div>
    </article>
  );
}

function formatHistoryDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: HELSINKI_TIME_ZONE
  })
    .format(parsed)
    .toUpperCase();
}

function roadRailHistoryPoints(
  history: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[],
  t: (value: string) => string
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    return [
      {
        label: formatHistoryDate(snapshot.date),
        value: data.quality.normalized_event_count,
        detail: `${data.quality.raw_message_count} ${t("raw")} · ${data.quality.weather_risk_count} ${t("weather")}`
      }
    ];
  });
}

function RoadRailIncidentStatusBadge({
  incident,
  language,
  t
}: {
  incident: RoadRailIncident;
  language: LanguageMode;
  t: (value: string) => string;
}) {
  return (
    <span className={incident.active ? "road-rail-incident-status road-rail-incident-status-active" : "road-rail-incident-status"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {incident.active ? "radio_button_checked" : "schedule"}
      </span>
      <span>{incident.active ? t("ACTIVE NOW") : formatCompactTime(incident.starts_at, language, t)}</span>
    </span>
  );
}

function RoadRailIncidentLiveLayer({
  incident,
  language,
  nowTimestamp,
  t
}: {
  incident: RoadRailIncident;
  language: LanguageMode;
  nowTimestamp: number;
  t: (value: string) => string;
}) {
  const progress = incidentWindowProgress(incident, nowTimestamp);

  return (
    <section
      className={incident.active ? "road-rail-incident-live-layer road-rail-incident-live-layer-active" : "road-rail-incident-live-layer"}
      aria-label={t("Incident status")}
    >
      <div className="road-rail-incident-live-copy">
        <RoadRailIncidentStatusBadge incident={incident} language={language} t={t} />
        <div>
          <strong>{incident.active ? t("In effect") : t("Scheduled")}</strong>
          <span>
            {incident.active
              ? `${t("until")} ${formatCompactTime(incident.ends_at, language, t)}`
              : `${t("Starts")} ${formatCompactTime(incident.starts_at, language, t)}`}
          </span>
        </div>
      </div>
      <span className="road-rail-incident-live-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className="road-rail-incident-live-facts">
        <div>
          <dt>{t("Window")}</dt>
          <dd>{formatCompactTime(incident.starts_at, language, t)} - {formatCompactTime(incident.ends_at, language, t)}</dd>
        </div>
        <div>
          <dt>{t("Location")}</dt>
          <dd>{locationLabel(incident, t)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function RoadRailWorkspace({
  category,
  highlightedEventId,
  history,
  roadRail,
}: RoadRailWorkspaceProps) {
  const { language, t } = useI18n();
  const [incidentFilter, setIncidentFilter] = useState<RoadRailIncidentFilter>("priority");
  const [incidentPage, setIncidentPage] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const timelineIncidents = useMemo(() => roadRail?.incidents ?? [], [roadRail?.incidents]);
  const filteredIncidents = useMemo(
    () => filterIncidents(timelineIncidents, incidentFilter),
    [incidentFilter, timelineIncidents]
  );

  useEffect(() => {
    setIncidentPage(0);
    setSelectedIncidentId(null);
  }, [incidentFilter, roadRail?.checked_at, timelineIncidents.length]);

  useEffect(() => {
    if (!highlightedEventId || timelineIncidents.length === 0) {
      return;
    }

    const incidentIndex = timelineIncidents.findIndex((incident) => incident.id === highlightedEventId);
    if (incidentIndex < 0) {
      return;
    }

    if (incidentFilter !== "all") {
      setIncidentFilter("all");
      return;
    }

    setIncidentPage(Math.floor(incidentIndex / INCIDENT_TIMELINE_PAGE_SIZE));
    setSelectedIncidentId(highlightedEventId);
  }, [highlightedEventId, incidentFilter, timelineIncidents]);

  if (!roadRail) {
    return (
      <section className="road-rail-detail-empty" aria-label={t("Road and rail data unavailable")}>
        <span>{t("Road & Rail")}</span>
        <h2>{t("Digitraffic road and rail signals are not available yet")}</h2>
        <p>{t("Traffic message data has not arrived for the current platform window.")}</p>
      </section>
    );
  }

  const activeTone = activeConditionTone(roadRail);
  const activeIncidents = roadRail.incidents.filter((incident) => incident.active);
  const checkedAt = new Date(roadRail.checked_at).getTime();
  const observedAt = new Date(roadRail.observed_at ?? "").getTime();
  const nowTimestamp = Number.isFinite(checkedAt) ? checkedAt : Number.isFinite(observedAt) ? observedAt : Date.now();
  const riskState = roadRailRiskState(activeIncidents, roadRail.incidents, t);
  const {
    currentPage: currentIncidentPage,
    pageCount: incidentPageCount,
    startIndex: incidentStartIndex,
    items: pagedIncidents,
  } = paginateTimelineItems(filteredIncidents, incidentPage, INCIDENT_TIMELINE_PAGE_SIZE);
  const selectedIncident = (selectedIncidentId
    ? pagedIncidents.find((incident) => incident.id === selectedIncidentId)
    : null) ?? pagedIncidents[0] ?? null;
  const topIncidents = timelineIncidents.slice(0, 5);
  const topCorridors = roadRail.corridors.slice(0, 5);
  const maxCorridorEvents = Math.max(1, ...topCorridors.map((corridor) => corridor.event_count));
  const severityRows = severityDistribution(roadRail.incidents);
  const networkRows = networkCompositionRows(roadRail, t);
  const historyPoints = roadRailHistoryPoints(history, t);
  const timebandIncidents = pagedIncidents;
  const timelineBounds = incidentTimelineBounds(timebandIncidents, nowTimestamp);
  const readyPipelineCount = roadRail.data_pipeline.filter((stage) => stage.status === "ready").length;
  const fetchedSourceCount = roadRail.source_requests.filter((request) => request.status === "fetched").length;
  const focusCorridor = topCorridors[0]?.label ?? t("No corridor focus");
  const roadRailSummaryMetrics = [
    ["raw_messages", "Raw Messages"],
    ["active_events", "Active Now"],
    ["road_disruptions", "Road Events"],
    ["road_weather", "Weather Risk"],
    ["corridors", "Corridors"],
    ["rail_events", "Rail Events"]
  ];
  const liveTone = liveStatusTone(roadRail.status);

  return (
    <section className="road-rail-detail-page" aria-label={t("Road and rail detail")}>
      <div className="road-rail-detail-header">
        <div>
          <h2>{t("Road & Rail Operations")}</h2>
          <div className={`road-rail-live-status road-rail-live-status-${liveTone}`}>
            <span aria-hidden="true" />
            <strong>{roadRail.status === "ready" ? t("Digitraffic Active") : t("Feed Delayed")}</strong>
          </div>
        </div>
        <div>
          {roadRail.source_code.toUpperCase()} /{" "}
          {exactObservedLabel(roadRail.observed_at, language, t)}
        </div>
      </div>

      <section className={`road-rail-glass-panel road-rail-command-panel road-rail-command-panel-${activeTone}`} aria-label={t("Road and rail condition")}>
        <div className="road-rail-command-status">
          <span className="material-symbols-outlined road-rail-condition-icon" aria-hidden="true">
            {riskState.icon}
          </span>
          <div>
            <div className="road-rail-card-kicker">
              <span>{t("Current Road & Rail Risk")}</span>
              <time>{exactObservedLabel(roadRail.observed_at, language, t)}</time>
            </div>
            <strong>{roadRail.quality.active_event_count}</strong>
            <p>
              <span>{riskState.title}</span>
              {riskState.detail}
            </p>
          </div>
        </div>

        <div className="road-rail-command-facts">
          <div>
            <span>{t("Highest Severity")}</span>
            <strong>{t(highestSeverityLabel(roadRail.incidents))}</strong>
          </div>
          <div>
            <span>{t("Next Clear")}</span>
            <strong>{nextActiveEndLabel(activeIncidents, language, t)}</strong>
          </div>
          <div>
            <span>{t("Corridor Focus")}</span>
            <strong>{focusCorridor}</strong>
          </div>
          <div>
            <span>{t("Coverage")}</span>
            <strong>{formatNumber(roadRail.quality.field_coverage_pct)}%</strong>
          </div>
        </div>
      </section>

      <section className="road-rail-summary-strip" aria-label={t("Road and rail summary metrics")}>
        {roadRailSummaryMetrics.map(([key, label]) => (
          <article className="road-rail-glass-panel" key={key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key,
                label,
                t,
              })}
            >
              {t(label)}
            </DataLabelWithHelp>
            <strong>{metricValue(roadRail, key)}</strong>
          </article>
        ))}
      </section>

      <section className="road-rail-main-grid" aria-label={t("Road and rail analytics")}>
        <article className="road-rail-glass-panel road-rail-incident-panel">
          <header>
            <div>
              <span>{t("Incident Timeline")}</span>
              <h3>{t("Active and upcoming road events")}</h3>
            </div>
            <strong>{filteredIncidents.length} {t("rows")}</strong>
          </header>
          <div className="road-rail-incident-toolbar">
            <div className="road-rail-incident-filters" aria-label={t("Road and rail incident filters")}>
              {INCIDENT_FILTERS.map((filter) => (
                <button
                  aria-pressed={incidentFilter === filter.key}
                  className={incidentFilter === filter.key ? "road-rail-filter-chip road-rail-filter-chip-active" : "road-rail-filter-chip"}
                  key={filter.key}
                  onClick={() => setIncidentFilter(filter.key)}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {filter.icon}
                  </span>
                  <span>{t(filter.label)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="road-rail-incident-layout">
            <div className="road-rail-incident-list-column">
              {timelineBounds ? (
                <div className="road-rail-timeband-panel" aria-label={t("Incident time windows")}>
                  <header>
                    <span>{t("Time Windows")}</span>
                    <span>
                      {formatTimelineBoundary(timelineBounds.startsAt, language)} -{" "}
                      {formatTimelineBoundary(timelineBounds.endsAt, language)}
                    </span>
                  </header>
                  <div>
                    {timebandIncidents.map((incident) => {
                      const parsedStart = new Date(incident.starts_at).getTime();
                      const parsedEnd = new Date(incident.ends_at).getTime();
                      const startsAt = Number.isFinite(parsedStart) ? parsedStart : timelineBounds.startsAt;
                      const endsAt = Number.isFinite(parsedEnd)
                        ? Math.max(startsAt + MIN_TIMELINE_WINDOW_MS, parsedEnd)
                        : startsAt + DEFAULT_TIMELINE_WINDOW_MS;
                      const left = timelinePercent(startsAt, timelineBounds);
                      const right = timelinePercent(endsAt, timelineBounds);
                      const width = Math.max(3, right - left);
                      const bandStyle = {
                        "--timeband-left": `${left}%`,
                        "--timeband-width": `${width}%`
                      } as CSSProperties;

                      return (
                        <article
                          className={`road-rail-timeband-row road-rail-timeband-row-${severityTone(incident.severity)}`}
                          key={incident.id}
                        >
                          <RoadRailIncidentStatusBadge incident={incident} language={language} t={t} />
                          <i aria-hidden="true">
                            <span style={bandStyle} />
                          </i>
                          <strong>{locationLabel(incident, t)}</strong>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="road-rail-incident-list">
                {pagedIncidents.length > 0 ? (
                  pagedIncidents.map((incident) => (
                    <button
                      aria-pressed={selectedIncident?.id === incident.id}
                      className={`road-rail-incident road-rail-incident-card road-rail-incident-${severityTone(incident.severity)}${selectedIncident?.id === incident.id ? " road-rail-incident-selected" : ""}`}
                      id={eventAnchorId(incident.id)}
                      key={incident.id}
                      onClick={() => setSelectedIncidentId(incident.id)}
                      type="button"
                    >
                      <span className="road-rail-incident-dot" aria-hidden="true" />
                      <div className="road-rail-incident-main">
                        <div>
                          <div className="road-rail-incident-time-row">
                            <RoadRailIncidentStatusBadge incident={incident} language={language} t={t} />
                            <span>{t(incident.severity)}</span>
                          </div>
                          <strong>{incident.title}</strong>
                          <p>{incident.description}</p>
                          <small className="road-rail-incident-scope-preview">{scopePreview(incident, t)}</small>
                        </div>
                        <em>{eventTypeLabel(incident.event_type, language)}</em>
                      </div>
                      <span className="road-rail-incident-window" aria-hidden="true">
                        <span style={{ width: `${incidentWindowProgress(incident, nowTimestamp)}%` }} />
                      </span>
                      <div className="road-rail-incident-meta">
                        <span>{messageTypeLabel(incident.message_type, language, t)}</span>
                        <span>{locationLabel(incident, t)}</span>
                        <span>{t("until")} {formatCompactTime(incident.ends_at, language, t)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>{filterEmptyMessage(incidentFilter, t)}</p>
                )}
              </div>
              <IncidentTimelinePager
                currentPage={currentIncidentPage}
                onPageChange={setIncidentPage}
                pageCount={incidentPageCount}
                startIndex={incidentStartIndex}
                totalCount={filteredIncidents.length}
                visibleCount={pagedIncidents.length}
              />
            </div>
            <aside className="road-rail-incident-inspector" aria-label={t("Incident details")}>
              {selectedIncident ? (
                <section className={`road-rail-incident-detail road-rail-incident-detail-${severityTone(selectedIncident.severity)}`}>
                  <header>
                    <div>
                      <RoadRailIncidentStatusBadge incident={selectedIncident} language={language} t={t} />
                      <strong>{selectedIncident.title}</strong>
                    </div>
                    <em>{t(selectedIncident.severity)}</em>
                  </header>
                  <p>{selectedIncident.description}</p>
                  <RoadRailIncidentLiveLayer incident={selectedIncident} language={language} nowTimestamp={nowTimestamp} t={t} />
                  <div className="road-rail-incident-detail-meta">
                    <div>
                      <span>{t("Type")}</span>
                      <strong>{eventTypeLabel(selectedIncident.event_type, language)}</strong>
                    </div>
                    <div>
                      <span>{t("Message")}</span>
                      <strong>{messageTypeLabel(selectedIncident.message_type, language, t)}</strong>
                    </div>
                    <div>
                      <span>{t("Situation")}</span>
                      <strong>{selectedIncident.situation_type ? translateEnumLabel(language, selectedIncident.situation_type) : t("situation unavailable")}</strong>
                    </div>
                  </div>
                  <div className="road-rail-incident-detail-scope">
                    {detailLocationItems(selectedIncident, t).map((item) => (
                      <section className="road-rail-scope-group" key={item.key}>
                        <header className="road-rail-scope-group-header">
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                          {item.values.length > 0 ? (
                            <span className="road-rail-scope-group-count" aria-hidden="true">
                              {item.values.length}
                            </span>
                          ) : null}
                        </header>
                        <ul className="road-rail-scope-list">
                          {item.values.length > 0 ? (
                            item.values.map((value) => (
                              <li className="road-rail-scope-item" key={value.id} title={value.meta ?? value.id}>
                                <p className="road-rail-scope-item-label">{value.label}</p>
                                {value.meta ? <p className="road-rail-scope-item-meta">{value.meta}</p> : null}
                              </li>
                            ))
                          ) : (
                            <li className="road-rail-scope-empty">{item.empty}</li>
                          )}
                        </ul>
                      </section>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="road-rail-incident-detail road-rail-incident-detail-empty">
                  <header>
                    <div>
                      <span>{t("Incident details")}</span>
                      <strong>{t("No selected event")}</strong>
                    </div>
                  </header>
                  <p>{filterEmptyMessage(incidentFilter, t)}</p>
                </section>
              )}
            </aside>
          </div>
        </article>
      </section>

      <section className="road-rail-insight-grid" aria-label={t("Road and rail condition")}>
        <article className="road-rail-glass-panel road-rail-severity-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "severity_mix",
                label: "Severity Mix",
                t,
              })}
            >
              {t("Severity Mix")}
            </DataLabelWithHelp>
            <strong>{roadRail.incidents.length}</strong>
          </header>
          <div className="road-rail-severity-bars">
            {severityRows.map((row) => (
              <div className={`road-rail-severity-row road-rail-severity-row-${severityTone(row.severity)}`} key={row.severity}>
                <span>{t(row.severity)}</span>
                <i aria-hidden="true">
                  <span style={{ width: `${row.width}%` }} />
                </i>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="road-rail-glass-panel road-rail-network-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "alert_scope",
                label: "Network Scope",
                t,
              })}
            >
              {t("Network Scope")}
            </DataLabelWithHelp>
            <strong>{roadRail.quality.field_coverage_pct.toFixed(0)}%</strong>
          </header>
          <div className="road-rail-network-grid">
            <article>
              <span>{t("Raw messages")}</span>
              <strong>{roadRail.quality.raw_message_count}</strong>
              <small>{t("traffic message features")}</small>
            </article>
            <article>
              <span>{t("Corridors")}</span>
              <strong>{roadRail.quality.corridor_count}</strong>
              <small>{t("grouped locations")}</small>
            </article>
            <article>
              <span>{t("Road events")}</span>
              <strong>{roadRail.quality.road_event_count}</strong>
              <small>{t("normalized events")}</small>
            </article>
            <article>
              <span>{t("Rail events")}</span>
              <strong>{roadRail.quality.rail_event_count}</strong>
              <small>{t("normalized events")}</small>
            </article>
          </div>
          <div className="road-rail-network-bars" aria-label={t("Network composition")}>
            {networkRows.map((row) => (
              <article className={`road-rail-network-bar road-rail-network-bar-${row.tone}`} key={row.key}>
                <span>{row.label}</span>
                <i aria-hidden="true">
                  <span style={{ width: `${row.width}%` }} />
                </i>
                <strong>{row.count}</strong>
                <em>{row.detail}</em>
              </article>
            ))}
          </div>
          <section className="road-rail-corridor-panel" aria-label={t("Corridors")}>
            <header>
              <span>{t("Corridors")}</span>
              <strong>{topCorridors.length}</strong>
            </header>
            <div>
              {topCorridors.length > 0 ? (
                topCorridors.map((corridor) => renderCorridor(corridor, t, maxCorridorEvents))
              ) : (
                <p>{t("No corridor groups are active in this window.")}</p>
              )}
            </div>
          </section>
        </article>
      </section>

      <TrendChart
        className="road-rail-glass-panel"
        emptyMessage={t("No daily road and rail history is available.")}
        eyebrow={`${historyPoints.length}D ${t("HISTORY")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={t("Daily Road and Rail Event Trend")}
        tone={activeTone}
        unit={t("events")}
      />

      <section className={`road-rail-provider-status road-rail-provider-status-${liveTone}`} aria-label={t("Road and rail provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              traffic
            </span>
            Digitraffic Road Messages
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {t("Last Sync")}: {exactObservedLabel(roadRail.observed_at, language, t)}
          </span>
          <i aria-hidden="true" />
          <span className="road-rail-provider-coverage">
            BBox: {bboxLabel(topIncidents[0]?.geometry_bbox ?? topCorridors[0]?.geometry_bbox ?? null, t)}
          </span>
        </div>
      </section>

      <p className="road-rail-detail-freshness">
        {roadRail.summary ?? category?.description ?? t("Latest normalized Digitraffic road and rail signals.")}
      </p>

      <details className="road-rail-glass-panel road-rail-diagnostics-panel">
        <summary>
          <div>
            <span>{t("Diagnostics")}</span>
            <strong>{readyPipelineCount}/{roadRail.data_pipeline.length} {t("stages")} / {fetchedSourceCount}/{roadRail.source_requests.length} {t("sources")}</strong>
          </div>
          <span className="material-symbols-outlined" aria-hidden="true">
            expand_more
          </span>
        </summary>
        <div className="road-rail-diagnostics-body">
          <section className="road-rail-diagnostic-section road-rail-quality-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "data_quality",
                  label: "Data Quality",
                  t,
                })}
              >
                {t("Data Quality")}
              </DataLabelWithHelp>
              <strong>{formatNumber(roadRail.quality.field_coverage_pct)}%</strong>
            </header>
            <span className="road-rail-quality-meter" aria-hidden="true">
              <span style={{ width: `${roadRail.quality.field_coverage_pct}%` }} />
            </span>
            <div className="road-rail-quality-facts">
              <span>{roadRail.quality.raw_message_count} {t("raw messages")}</span>
              <span>{roadRail.quality.normalized_event_count} {t("events")}</span>
              <span>{roadRail.quality.missing_fields.length} {t("missing fields")}</span>
            </div>
            <p>
              {roadRail.quality.missing_fields.length > 0
                ? `${t("Missing fields")}: ${roadRail.quality.missing_fields.join(", ")}.`
                : t("All tracked raw message fields are present.")}
            </p>
            {roadRail.quality.notes.map((note) => (
              <small key={note}>{note}</small>
            ))}
          </section>

          <section className="road-rail-diagnostic-section road-rail-pipeline-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "pipeline",
                  label: "Pipeline",
                  t,
                })}
              >
                {t("Pipeline")}
              </DataLabelWithHelp>
              <strong>{readyPipelineCount}/{roadRail.data_pipeline.length}</strong>
            </header>
            <div>
              {roadRail.data_pipeline.map((stage) => (
                <article className={`road-rail-stage road-rail-stage-${statusTone(stage.status)}`} key={stage.key}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` - ${stage.record_count} ${t("records")}` : ""}
                  </p>
                  <span className="road-rail-stage-meter" aria-hidden="true">
                    <span style={{ width: `${stageProgress(stage)}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="road-rail-diagnostic-section road-rail-source-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "source_request",
                  label: "Source Requests",
                  t,
                })}
              >
                {t("Source Requests")}
              </DataLabelWithHelp>
              <strong>{fetchedSourceCount}/{roadRail.source_requests.length}</strong>
            </header>
            <div>
              {roadRail.source_requests.map((request: RoadRailSourceRequest) => (
                <article className={`road-rail-request road-rail-request-${statusTone(request.status)}`} key={request.key}>
                  <div>
                    <strong>{request.label}</strong>
                    <span>{t(request.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint, t)}
                    {request.fetched_at ? ` - ${t("fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
                  </p>
                  <small>
                    {request.message_count} {t("messages")} - {request.content_type ?? t("content type unavailable")}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </div>
      </details>
    </section>
  );
}
