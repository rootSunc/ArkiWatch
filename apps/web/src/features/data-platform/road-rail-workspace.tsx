"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { parseValidDate } from "@/features/shared/format";

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
import { localizedPlatformCopy } from "./platform-copy";
import { isEmptyStatus, liveStatusTone } from "./platform-status";
import { UNAVAILABLE_DATA_VALUE } from "./data-value";
import { DEFAULT_DATA_TIME_ZONE, resolveDataTimezone } from "./data-timezone";
import { isHistoricalTimeScope, scopedDataAge, scopedDataTimestamp, scopedReferenceTime, scopedStatusLabel } from "./data-time-scope";
import { scopedEventState } from "./event-time-state";
import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "./workspace-ui";

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

const SEVERITY_LABELS = ["HIGH", "MEDIUM", "LOW", "INFO"];
const MIN_TIMELINE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_TIMELINE_WINDOW_MS = 60 * 60 * 1000;
const INCIDENT_FILTERS: Array<{ icon: string; key: RoadRailIncidentFilter; labelKey: string }> = [
  { icon: "priority_high", key: "priority", labelKey: "priority" },
  { icon: "radio_button_checked", key: "active", labelKey: "active" },
  { icon: "traffic", key: "road", labelKey: "road" },
  { icon: "train", key: "rail", labelKey: "rail" },
  { icon: "thunderstorm", key: "weather", labelKey: "weather" },
  { icon: "view_list", key: "all", labelKey: "all" }
];

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return UNAVAILABLE_DATA_VALUE;
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null | undefined, tKey: (key: string) => string): string {
  const formatted = formatNumber(value);
  return formatted === UNAVAILABLE_DATA_VALUE ? tKey("shell.nA") : `${formatted}%`;
}

function formatCompactTime(
  value: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey("roadRail.notObserved");
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return tKey("roadRail.notObserved");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsedDate)
    .toUpperCase();
}

function formatTimelineBoundary(value: number, language: LanguageMode, timeZone = DEFAULT_DATA_TIME_ZONE): string {
  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return UNAVAILABLE_DATA_VALUE;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  })
    .format(parsedDate)
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

function exactObservedLabel(
  value: string | null,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
  timeScope?: RoadRailCurrentResponse["time_scope"],
): string {
  return scopedDataTimestamp(
    value,
    timeScope,
    language,
    tKey,
    "roadRail.notObserved",
    timeZone,
  );
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

function filterIncidents(
  incidents: RoadRailIncident[],
  filter: RoadRailIncidentFilter,
): RoadRailIncident[] {
  if (filter === "active") {
    return incidents.filter((incident) => incident.active);
  }
  if (filter === "priority") {
    return incidents.filter((incident) => incident.active || isHighSeverity(incident));
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

function filterEmptyMessage(
  filter: RoadRailIncidentFilter,
  tKey: (key: string) => string,
  historical = false,
): string {
  if (filter === "priority") {
    return tKey(
      historical
        ? "roadRail.noPriorityIncidentsInSnapshotWindow"
        : "roadRail.noPriorityRoadOrRailIncidentsAreActiveOrUpcoming",
    );
  }
  if (filter === "active") {
    return tKey(
      historical
        ? "roadRail.noIncidentsAtSnapshot"
        : "roadRail.noRoadOrRailIncidentsAreActiveRightNow",
    );
  }
  if (filter === "road") {
    return tKey("roadRail.noRoadIncidentsWereNormalizedFromTheLatestDigitrafficPayload");
  }
  if (filter === "rail") {
    return tKey("roadRail.noRailIncidentsWereNormalizedFromTheLatestDigitrafficPayload");
  }
  if (filter === "weather") {
    return tKey("roadRail.noWeatherRelatedRoadOrRailIncidentsWereNormalized");
  }

  return tKey("roadRail.noRoadOrRailEventsWereNormalizedFromTheLatestDigitrafficPayload");
}

function eventTypeLabel(value: string, language: LanguageMode): string {
  return translateEnumLabel(language, value.replace(/^road_/, "").replace(/^rail_/, ""));
}

function messageTypeLabel(value: string | null, language: LanguageMode, tKey: (key: string) => string): string {
  return value ? translateEnumLabel(language, value) : tKey("roadRail.messageTypeUnavailable");
}

function metricValue(roadRail: RoadRailCurrentResponse, key: string): string {
  const metric = roadRail.metrics.find((item) => item.key === key);
  return metric ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "0";
}

function localizedRoadRailSummary(
  roadRail: RoadRailCurrentResponse,
  historical: boolean,
  tKey: (key: string) => string,
): string {
  if (roadRail.quality.raw_message_count === 0 && roadRail.quality.normalized_event_count === 0) {
    return tKey(
      historical
        ? "roadRail.noIncidentsInSelectedSnapshot"
        : "roadRail.noActiveRoadOrRailIncidentsInTheLatestDigitrafficFeed",
    );
  }

  return tKey(
    historical ? "roadRail.summaryDecodedAtSnapshot" : "roadRail.summaryDecoded",
  )
    .replace("{raw}", String(roadRail.quality.raw_message_count))
    .replace("{active}", String(roadRail.quality.active_event_count))
    .replace("{corridors}", String(roadRail.quality.corridor_count))
    .replace("{weather}", String(roadRail.quality.weather_risk_count));
}

function roadRailReferenceTimestamp(roadRail: RoadRailCurrentResponse): number {
  const scopedReference = new Date(roadRail.time_scope?.reference_time ?? "").getTime();
  if (Number.isFinite(scopedReference)) {
    return scopedReference;
  }

  const checkedAt = new Date(roadRail.checked_at).getTime();
  if (Number.isFinite(checkedAt)) {
    return checkedAt;
  }

  const observedAt = new Date(roadRail.observed_at ?? "").getTime();
  return Number.isFinite(observedAt) ? observedAt : 0;
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

function sourceRequestHost(endpoint: string | null, tKey: (key: string) => string): string {
  if (!endpoint) {
    return tKey("roadRail.endpointNotRecorded");
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

function nextActiveEndLabel(
  activeIncidents: RoadRailIncident[],
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (activeIncidents.length === 0) {
    return tKey("roadRail.noActiveWindow");
  }

  const nextEndingIncident = [...activeIncidents].sort(
    (left, right) => new Date(left.ends_at).getTime() - new Date(right.ends_at).getTime()
  )[0];

  return `${tKey("roadRail.until")} ${formatCompactTime(nextEndingIncident.ends_at, language, tKey, timeZone)}`;
}

function roadRailRiskState(
  activeIncidents: RoadRailIncident[],
  allIncidents: RoadRailIncident[],
  tKey: (key: string) => string,
  historical = false,
  referenceTimestamp = Date.now(),
) {
  const highActive = activeIncidents.filter(isHighSeverity).length;
  const weatherActive = activeIncidents.filter(isWeatherIncident).length;
  const highUpcoming = allIncidents.filter(
    (incident) =>
      scopedEventState(incident.active, incident.starts_at, referenceTimestamp) === "upcoming" &&
      isHighSeverity(incident),
  ).length;

  if (highActive > 0) {
    return {
      detail: tKey(
        historical
          ? "roadRail.highSeverityIncidentsAtSnapshotDetail"
          : "roadRail.highSeverityIncidentsActiveDetail",
      ).replace("{count}", String(highActive)),
      icon: "warning",
      title: tKey(historical ? "roadRail.highImpactAtSnapshot" : "roadRail.highImpactActive")
    };
  }

  if (weatherActive > 0) {
    return {
      detail: tKey(
        historical
          ? "roadRail.weatherIncidentsAtSnapshotMayAffectTimingDetail"
          : "roadRail.weatherIncidentsMayAffectTimingDetail",
      ).replace("{count}", String(weatherActive)),
      icon: "thunderstorm",
      title: tKey(historical ? "roadRail.weatherRiskAtSnapshot" : "roadRail.weatherRiskActive")
    };
  }

  if (activeIncidents.length > 0) {
    return {
      detail: tKey(
        historical
          ? "roadRail.incidentsAtSnapshotMayAffectTimingDetail"
          : "roadRail.activeIncidentsMayAffectTimingDetail",
      ).replace("{count}", String(activeIncidents.length)),
      icon: "traffic",
      title: tKey(historical ? "roadRail.corridorEventsAtSnapshot" : "roadRail.corridorEventsActive")
    };
  }

  if (highUpcoming > 0) {
    return {
      detail: tKey("roadRail.highSeverityIncidentsUpcomingDetail").replace("{count}", String(highUpcoming)),
      icon: "schedule",
      title: tKey("roadRail.highImpactUpcoming")
    };
  }

  return {
    detail: allIncidents.length > 0
      ? tKey(
          historical
            ? "roadRail.noIncidentsAtSnapshotMonitorUpcomingFeedItems"
            : "roadRail.noActiveIncidentsRightNowMonitorUpcomingFeedItems",
        )
      : tKey(
          historical
            ? "roadRail.noIncidentsInSelectedSnapshot"
            : "roadRail.noActiveRoadOrRailIncidentsInTheLatestDigitrafficFeed",
        ),
    icon: "check_circle",
    title: tKey("roadRail.networkClear")
  };
}

function networkCompositionRows(
  roadRail: RoadRailCurrentResponse,
  tKey: (key: string) => string
): RoadRailNetworkMetric[] {
  const rows: Array<Omit<RoadRailNetworkMetric, "width">> = [
    {
      key: "road",
      label: tKey("roadRail.roadEvents"),
      detail: tKey("roadRail.normalizedRoadEvents"),
      count: roadRail.quality.road_event_count,
      tone: "warn"
    },
    {
      key: "rail",
      label: tKey("roadRail.railEvents"),
      detail: tKey("roadRail.normalizedRailEvents"),
      count: roadRail.quality.rail_event_count,
      tone: "good"
    },
    {
      key: "weather",
      label: tKey("roadRail.weatherRisk"),
      detail: tKey("roadRail.weatherRelatedEvents"),
      count: roadRail.quality.weather_risk_count,
      tone: "bad"
    },
    {
      key: "corridors",
      label: tKey("roadRail.corridors"),
      detail: tKey("roadRail.groupedLocations"),
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

function locationLabel(incident: RoadRailIncident, tKey: (key: string) => string): string {
  return incident.location_description || incident.location_ref.replaceAll("-", " ") || tKey("roadRail.locationUnavailable");
}

function scopePreview(incident: RoadRailIncident, tKey: (key: string) => string): string {
  if (incident.feature_names.length > 0) {
    return `${tKey("roadRail.features")} ${incident.feature_names.slice(0, 3).join(", ")}${incident.feature_names.length > 3 ? " +" : ""}`;
  }

  return locationLabel(incident, tKey);
}

function bboxLabel(bbox: number[] | null, tKey: (key: string) => string): string {
  if (!bbox || bbox.length !== 4) {
    return tKey("roadRail.bboxUnavailable");
  }

  return bbox.map((value) => value.toFixed(2)).join(" / ");
}

function detailLocationItems(incident: RoadRailIncident, tKey: (key: string) => string): RoadRailDetailItem[] {
  return [
    {
      key: "location",
      label: tKey("roadRail.affectedLocation"),
      icon: "pin_drop",
      values: [
        {
          id: incident.location_ref,
          label: locationLabel(incident, tKey),
          meta: incident.location_ref.replaceAll("-", " ")
        }
      ],
      empty: tKey("roadRail.noLocationAttached")
    },
    {
      key: "features",
      label: tKey("roadRail.roadFeatures"),
      icon: "route",
      values: incident.feature_names.map((feature) => ({
        id: feature,
        label: feature,
        meta: incident.location_description
      })),
      empty: tKey("roadRail.noFeatureNamesAttached")
    },
    {
      key: "geometry",
      label: tKey("roadRail.geometry"),
      icon: "polyline",
      values: incident.geometry_bbox
        ? [
            {
              id: "bbox",
              label: "BBox",
              meta: bboxLabel(incident.geometry_bbox, tKey)
            }
          ]
        : [],
      empty: tKey("roadRail.noGeometryAttached")
    }
  ];
}

function renderCorridor(
  corridor: RoadRailCorridor,
  language: LanguageMode,
  tKey: (key: string) => string,
  enumLabel: (value: string | null | undefined) => string,
  maxEventCount: number,
) {
  const tone = severityTone(corridor.severity);
  const totalWidth = corridor.event_count > 0 ? Math.max(8, (corridor.event_count / maxEventCount) * 100) : 0;
  const activeWidth = corridor.event_count > 0 ? clampPercent((corridor.active_event_count / corridor.event_count) * 100) : 0;
  const weatherWidth = corridor.event_count > 0 ? clampPercent((corridor.weather_risk_count / corridor.event_count) * 100) : 0;

  return (
    <article className={`road-rail-corridor road-rail-corridor-${tone}`} key={corridor.key}>
      <div>
        <strong>{localizedPlatformCopy(corridor.label, language) ?? corridor.label}</strong>
        <span>{enumLabel(corridor.severity)}</span>
      </div>
      <p>{localizedPlatformCopy(corridor.latest_title, language) ?? corridor.latest_title}</p>
      <span className={`road-rail-corridor-load road-rail-corridor-load-${tone}`} aria-hidden="true">
        <span style={{ width: `${totalWidth}%` }}>
          <i style={{ width: `${activeWidth}%` }} />
          <em style={{ width: `${weatherWidth}%` }} />
        </span>
      </span>
      <div className="road-rail-corridor-meta">
        <span>{corridor.active_event_count} {tKey("roadRail.active")}</span>
        <span>{corridor.event_count} {tKey("roadRail.total")}</span>
        <span>{corridor.weather_risk_count} {tKey("roadRail.weather")}</span>
      </div>
    </article>
  );
}

function formatHistoryDate(value: string, timeZone = DEFAULT_DATA_TIME_ZONE): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsed)
    .toUpperCase();
}

function roadRailHistoryPoints(
  history: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[],
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    return [
      {
        label: formatHistoryDate(snapshot.date, timeZone),
        value: data.quality.normalized_event_count,
        detail: `${data.quality.raw_message_count} ${tKey("roadRail.raw")} · ${data.quality.weather_risk_count} ${tKey("roadRail.weather")}`
      }
    ];
  });
}

function RoadRailIncidentStatusBadge({
  incident,
  historical,
  referenceTimestamp,
  language,
  timeZone,
  tKey
}: {
  incident: RoadRailIncident;
  historical: boolean;
  referenceTimestamp: number;
  language: LanguageMode;
  timeZone?: string;
  tKey: (key: string) => string;
}) {
  const state = scopedEventState(incident.active, incident.starts_at, referenceTimestamp);
  return (
    <span className={state === "active" ? "road-rail-incident-status road-rail-incident-status-active" : "road-rail-incident-status"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {state === "active" ? "radio_button_checked" : state === "upcoming" ? "schedule" : "history"}
      </span>
      <span>
        {state === "active"
          ? tKey(historical ? "roadRail.activeAtSnapshot" : "roadRail.activeNow")
          : state === "ended"
            ? tKey(historical ? "roadRail.endedAtSnapshot" : "roadRail.ended")
            : formatCompactTime(incident.starts_at, language, tKey, timeZone)}
      </span>
    </span>
  );
}

function RoadRailIncidentLiveLayer({
  incident,
  historical,
  referenceTimestamp,
  language,
  nowTimestamp,
  timeZone,
  tKey
}: {
  incident: RoadRailIncident;
  historical: boolean;
  referenceTimestamp: number;
  language: LanguageMode;
  nowTimestamp: number;
  timeZone?: string;
  tKey: (key: string) => string;
}) {
  const progress = incidentWindowProgress(incident, nowTimestamp);
  const state = scopedEventState(incident.active, incident.starts_at, referenceTimestamp);

  return (
    <section
      className={state === "active" ? "road-rail-incident-live-layer road-rail-incident-live-layer-active" : "road-rail-incident-live-layer"}
      aria-label={tKey("roadRail.incidentStatus")}
    >
      <div className="road-rail-incident-live-copy">
        <RoadRailIncidentStatusBadge incident={incident} historical={historical} referenceTimestamp={referenceTimestamp} language={language} timeZone={timeZone} tKey={tKey} />
        <div>
          <strong>
            {state === "active"
              ? tKey(historical ? "roadRail.inEffectAtSnapshot" : "roadRail.inEffect")
              : state === "ended"
                ? tKey(historical ? "roadRail.endedAtSnapshot" : "roadRail.ended")
                : tKey("roadRail.scheduled")}
          </strong>
          <span>
            {state === "active"
              ? `${tKey("roadRail.until")} ${formatCompactTime(incident.ends_at, language, tKey, timeZone)}`
              : state === "ended"
                ? `${tKey("roadRail.endedAt")} ${formatCompactTime(incident.ends_at, language, tKey, timeZone)}`
                : `${tKey("roadRail.starts")} ${formatCompactTime(incident.starts_at, language, tKey, timeZone)}`}
          </span>
        </div>
      </div>
      <span className="road-rail-incident-live-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className="road-rail-incident-live-facts">
        <div>
          <dt>{tKey("roadRail.window")}</dt>
          <dd>{formatCompactTime(incident.starts_at, language, tKey, timeZone)} - {formatCompactTime(incident.ends_at, language, tKey, timeZone)}</dd>
        </div>
        <div>
          <dt>{tKey("roadRail.location")}</dt>
          <dd>{locationLabel(incident, tKey)}</dd>
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
  const { language, tKey, enumLabel } = useI18n();
  const [incidentFilter, setIncidentFilter] = useState<RoadRailIncidentFilter>("priority");
  const [incidentPage, setIncidentPage] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const isHistorical = isHistoricalTimeScope(roadRail?.time_scope);
  const referenceTimestamp = roadRail ? roadRailReferenceTimestamp(roadRail) : 0;
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

  if (!roadRail || isEmptyStatus(roadRail.status)) {
    return (
      <WorkspaceEmptyState
        className="road-rail-detail-empty"
        description={tKey("roadRail.trafficMessageDataHasNotArrivedForTheCurrentPlatformWindow")}
        eyebrow={tKey("roadRail.roadAndRail")}
        title={tKey("roadRail.digitrafficRoadAndRailSignalsAreNotAvailableYet")}
      />
    );
  }

  const activeTone = activeConditionTone(roadRail);
  const dataTimezone = resolveDataTimezone(roadRail.time_scope?.timezone);
  const activeIncidents = roadRail.incidents.filter((incident) => incident.active);
  const nowTimestamp = referenceTimestamp;
  const riskState = roadRailRiskState(activeIncidents, roadRail.incidents, tKey, isHistorical, referenceTimestamp);
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
  const networkRows = networkCompositionRows(roadRail, tKey);
  const historyPoints = roadRailHistoryPoints(history, tKey, dataTimezone);
  const timebandIncidents = pagedIncidents;
  const timelineBounds = incidentTimelineBounds(timebandIncidents, nowTimestamp);
  const readyPipelineCount = roadRail.data_pipeline.filter((stage) => stage.status === "ready").length;
  const fetchedSourceCount = roadRail.source_requests.filter((request) => request.status === "fetched").length;
  const focusCorridor = topCorridors[0]?.label ?? tKey("roadRail.noCorridorFocus");
  const roadRailSummaryMetrics = [
    ["raw_messages", "rawMessagesSummary"],
    ["active_events", isHistorical ? "activeAtSnapshotSummary" : "activeNowSummary"],
    ["road_disruptions", "roadEventsSummary"],
    ["road_weather", "weatherRiskSummary"],
    ["corridors", "corridors"],
    ["rail_events", "railEventsSummary"]
  ];
  const liveTone = liveStatusTone(roadRail.status);

  return (
    <section className="road-rail-detail-page" aria-label={tKey("roadRail.roadAndRailDetail")}>
      <WorkspaceEvidenceHeader
        className="road-rail-detail-header"
        fallbackKey="roadRail.notObserved"
        language={language}
        observedAt={roadRail.observed_at}
        sourceLabel={roadRail.source_code.toUpperCase()}
        status={scopedStatusLabel(
          roadRail.status,
          roadRail.time_scope,
          tKey,
          "roadRail.digitrafficActive",
          "roadRail.feedDelayed",
        )}
        statusTone={liveTone}
        tKey={tKey}
        timeScope={roadRail.time_scope}
        title={tKey("roadRail.roadAndRailOperations")}
        timezone={dataTimezone}
      />

      <section className={`road-rail-glass-panel road-rail-command-panel road-rail-command-panel-${activeTone}`} aria-label={tKey("roadRail.roadAndRailCondition")}>
        <div className="road-rail-command-status">
          <span className="material-symbols-outlined road-rail-condition-icon" aria-hidden="true">
            {riskState.icon}
          </span>
          <div>
            <div className="road-rail-card-kicker">
              <span>{tKey(isHistorical ? "roadRail.roadAndRailRiskAtSnapshot" : "roadRail.currentRoadAndRailRisk")}</span>
              <time>{exactObservedLabel(roadRail.observed_at, language, tKey, dataTimezone, roadRail.time_scope)}</time>
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
            <span>{tKey("roadRail.highestSeverity")}</span>
            <strong>{enumLabel(highestSeverityLabel(roadRail.incidents))}</strong>
          </div>
          <div>
            <span>{tKey("roadRail.nextClear")}</span>
            <strong>{nextActiveEndLabel(activeIncidents, language, tKey)}</strong>
          </div>
          <div>
            <span>{tKey("roadRail.corridorFocus")}</span>
            <strong>{focusCorridor}</strong>
          </div>
          <div>
            <span>{tKey("roadRail.coverage")}</span>
            <strong>{formatPercent(roadRail.quality.field_coverage_pct, tKey)}</strong>
          </div>
        </div>
      </section>

      <section className="road-rail-summary-strip" aria-label={tKey("roadRail.roadAndRailSummaryMetrics")}>
        {roadRailSummaryMetrics.map(([key, labelKey]) => (
          <article className="road-rail-glass-panel" key={key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key,
                label: tKey(`roadRail.${labelKey}`),
                language,
              })}
            >
              {tKey(`roadRail.${labelKey}`)}
            </DataLabelWithHelp>
            <strong>{metricValue(roadRail, key)}</strong>
          </article>
        ))}
      </section>

      <section className="road-rail-main-grid" aria-label={tKey("roadRail.roadAndRailAnalytics")}>
        <article className="road-rail-glass-panel road-rail-incident-panel">
          <header>
            <div>
              <span>{tKey("roadRail.incidentTimeline")}</span>
              <h3>{tKey(isHistorical ? "roadRail.eventsInSnapshotWindow" : "roadRail.activeAndUpcomingRoadEvents")}</h3>
            </div>
            <strong>{filteredIncidents.length} {tKey("roadRail.rows")}</strong>
          </header>
          <div className="road-rail-incident-toolbar">
            <div className="road-rail-incident-filters" aria-label={tKey("roadRail.roadAndRailIncidentFilters")}>
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
                  <span>{tKey(filter.key === "active" && isHistorical ? "roadRail.atSnapshot" : `roadRail.${filter.labelKey}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="road-rail-incident-layout">
            <div className="road-rail-incident-list-column">
              {timelineBounds ? (
                <div className="road-rail-timeband-panel" aria-label={tKey("roadRail.incidentTimeWindows")}>
                  <header>
                    <span>{tKey("roadRail.timeWindows")}</span>
                    <span>
                      {formatTimelineBoundary(timelineBounds.startsAt, language, dataTimezone)} -{" "}
                      {formatTimelineBoundary(timelineBounds.endsAt, language, dataTimezone)}
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
                          <RoadRailIncidentStatusBadge incident={incident} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                          <i aria-hidden="true">
                            <span style={bandStyle} />
                          </i>
                          <strong>{locationLabel(incident, tKey)}</strong>
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
                            <RoadRailIncidentStatusBadge incident={incident} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                            <span>{enumLabel(incident.severity)}</span>
                          </div>
                            <strong>{localizedPlatformCopy(incident.title, language) ?? incident.title}</strong>
                            <p>{localizedPlatformCopy(incident.description, language) ?? incident.description}</p>
                          <small className="road-rail-incident-scope-preview">{scopePreview(incident, tKey)}</small>
                        </div>
                        <em>{eventTypeLabel(incident.event_type, language)}</em>
                      </div>
                      <span className="road-rail-incident-window" aria-hidden="true">
                        <span style={{ width: `${incidentWindowProgress(incident, nowTimestamp)}%` }} />
                      </span>
                      <div className="road-rail-incident-meta">
                        <span>{messageTypeLabel(incident.message_type, language, tKey)}</span>
                        <span>{locationLabel(incident, tKey)}</span>
                        <span>{tKey("roadRail.until")} {formatCompactTime(incident.ends_at, language, tKey, dataTimezone)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>{filterEmptyMessage(incidentFilter, tKey, isHistorical)}</p>
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
            <aside className="road-rail-incident-inspector" aria-label={tKey("roadRail.incidentDetails")}>
              {selectedIncident ? (
                <section className={`road-rail-incident-detail road-rail-incident-detail-${severityTone(selectedIncident.severity)}`}>
                  <header>
                    <div>
                      <RoadRailIncidentStatusBadge incident={selectedIncident} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                      <strong>{localizedPlatformCopy(selectedIncident.title, language) ?? selectedIncident.title}</strong>
                    </div>
                    <em>{enumLabel(selectedIncident.severity)}</em>
                  </header>
                  <p>{localizedPlatformCopy(selectedIncident.description, language) ?? selectedIncident.description}</p>
                  <RoadRailIncidentLiveLayer incident={selectedIncident} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} nowTimestamp={nowTimestamp} timeZone={dataTimezone} tKey={tKey} />
                  <div className="road-rail-incident-detail-meta">
                    <div>
                      <span>{tKey("roadRail.type")}</span>
                      <strong>{eventTypeLabel(selectedIncident.event_type, language)}</strong>
                    </div>
                    <div>
                      <span>{tKey("roadRail.message")}</span>
                      <strong>{messageTypeLabel(selectedIncident.message_type, language, tKey)}</strong>
                    </div>
                    <div>
                      <span>{tKey("roadRail.situation")}</span>
                      <strong>{selectedIncident.situation_type ? translateEnumLabel(language, selectedIncident.situation_type) : tKey("roadRail.situationUnavailable")}</strong>
                    </div>
                  </div>
                  <div className="road-rail-incident-detail-scope">
                    {detailLocationItems(selectedIncident, tKey).map((item) => (
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
                      <span>{tKey("roadRail.incidentDetails")}</span>
                      <strong>{tKey("roadRail.noSelectedEvent")}</strong>
                    </div>
                  </header>
                  <p>{filterEmptyMessage(incidentFilter, tKey, isHistorical)}</p>
                </section>
              )}
            </aside>
          </div>
        </article>
      </section>

      <section className="road-rail-insight-grid" aria-label={tKey("roadRail.roadAndRailCondition")}>
        <article className="road-rail-glass-panel road-rail-severity-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "severity_mix",
                label: tKey("roadRail.severityMix"),
                language,
              })}
            >
              {tKey("roadRail.severityMix")}
            </DataLabelWithHelp>
            <strong>{roadRail.incidents.length}</strong>
          </header>
          <div className="road-rail-severity-bars">
            {severityRows.map((row) => (
              <div className={`road-rail-severity-row road-rail-severity-row-${severityTone(row.severity)}`} key={row.severity}>
                <span>{enumLabel(row.severity)}</span>
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
                label: tKey("roadRail.networkScope"),
                language,
              })}
            >
              {tKey("roadRail.networkScope")}
            </DataLabelWithHelp>
            <strong>{roadRail.quality.field_coverage_pct.toFixed(0)}%</strong>
          </header>
          <div className="road-rail-network-grid">
            <article>
              <span>{tKey("roadRail.rawMessages")}</span>
              <strong>{roadRail.quality.raw_message_count}</strong>
              <small>{tKey("roadRail.trafficMessageFeatures")}</small>
            </article>
            <article>
              <span>{tKey("roadRail.corridors")}</span>
              <strong>{roadRail.quality.corridor_count}</strong>
              <small>{tKey("roadRail.groupedLocations")}</small>
            </article>
            <article>
              <span>{tKey("roadRail.roadEvents")}</span>
              <strong>{roadRail.quality.road_event_count}</strong>
              <small>{tKey("roadRail.normalizedEvents")}</small>
            </article>
            <article>
              <span>{tKey("roadRail.railEvents")}</span>
              <strong>{roadRail.quality.rail_event_count}</strong>
              <small>{tKey("roadRail.normalizedEvents")}</small>
            </article>
          </div>
          <div className="road-rail-network-bars" aria-label={tKey("roadRail.networkComposition")}>
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
          <section className="road-rail-corridor-panel" aria-label={tKey("roadRail.corridors")}>
            <header>
              <span>{tKey("roadRail.corridors")}</span>
              <strong>{topCorridors.length}</strong>
            </header>
            <div>
              {topCorridors.length > 0 ? (
                topCorridors.map((corridor) => renderCorridor(corridor, language, tKey, enumLabel, maxCorridorEvents))
              ) : (
                <p>{tKey("roadRail.noCorridorGroupsAreActiveInThisWindow")}</p>
              )}
            </div>
          </section>
        </article>
      </section>

      <TrendChart
        className="road-rail-glass-panel"
        emptyMessage={tKey("roadRail.noDailyRoadAndRailHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("roadRail.history")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={tKey("roadRail.dailyRoadAndRailEventTrend")}
        tone={activeTone}
        unit={tKey("roadRail.events")}
      />

      <section className={`road-rail-provider-status road-rail-provider-status-${liveTone}`} aria-label={tKey("roadRail.roadAndRailProviderStatus")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("roadRail.providerStatus")}</strong>
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
            {tKey("roadRail.lastSync")}: {exactObservedLabel(roadRail.observed_at ?? scopedReferenceTime(roadRail.time_scope), language, tKey, dataTimezone, roadRail.time_scope)}
          </span>
          <i aria-hidden="true" />
          <span className="road-rail-provider-coverage">
            BBox: {bboxLabel(topIncidents[0]?.geometry_bbox ?? topCorridors[0]?.geometry_bbox ?? null, tKey)}
          </span>
        </div>
      </section>

      <p className="road-rail-detail-freshness">
        {localizedRoadRailSummary(roadRail, isHistorical, tKey) ?? localizedPlatformCopy(category?.description, language) ?? tKey("roadRail.latestNormalizedDigitrafficRoadAndRailSignals")}
      </p>

      <details className="road-rail-glass-panel road-rail-diagnostics-panel">
        <summary>
          <div>
            <span>{tKey("roadRail.diagnostics")}</span>
            <strong>{readyPipelineCount}/{roadRail.data_pipeline.length} {tKey("roadRail.stages")} / {fetchedSourceCount}/{roadRail.source_requests.length} {tKey("roadRail.sources")}</strong>
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
                  label: tKey("roadRail.dataQuality"),
                  language,
                })}
              >
                {tKey("roadRail.dataQuality")}
              </DataLabelWithHelp>
              <strong>{formatPercent(roadRail.quality.field_coverage_pct, tKey)}</strong>
            </header>
            <span className="road-rail-quality-meter" aria-hidden="true">
              <span style={{ width: `${roadRail.quality.field_coverage_pct}%` }} />
            </span>
            <div className="road-rail-quality-facts">
              <span>{roadRail.quality.raw_message_count} {tKey("roadRail.rawMessages2")}</span>
              <span>{roadRail.quality.normalized_event_count} {tKey("roadRail.events")}</span>
              <span>{roadRail.quality.missing_fields.length} {tKey("roadRail.missingFields")}</span>
            </div>
            <p>
              {roadRail.quality.missing_fields.length > 0
                ? `${tKey("roadRail.missingFields2")}: ${roadRail.quality.missing_fields.join(", ")}.`
                : tKey("roadRail.allTrackedRawMessageFieldsArePresent")}
            </p>
            {roadRail.quality.notes.map((note) => (
              <small key={note}>{localizedPlatformCopy(note, language) ?? note}</small>
            ))}
          </section>

          <section className="road-rail-diagnostic-section road-rail-pipeline-panel">
            <header>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "pipeline",
                  label: tKey("roadRail.pipeline"),
                  language,
                })}
              >
                {tKey("roadRail.pipeline")}
              </DataLabelWithHelp>
              <strong>{readyPipelineCount}/{roadRail.data_pipeline.length}</strong>
            </header>
            <div>
              {roadRail.data_pipeline.map((stage) => (
                <article className={`road-rail-stage road-rail-stage-${statusTone(stage.status)}`} key={stage.key}>
                  <div>
                    <strong>{localizedPlatformCopy(stage.label, language) ?? stage.label}</strong>
                    <span>{enumLabel(stage.status)}</span>
                  </div>
                  <p>
                    {localizedPlatformCopy(stage.detail, language) ?? stage.detail}
                    {stage.record_count !== null ? ` - ${stage.record_count} ${tKey("roadRail.records")}` : ""}
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
                  label: tKey("roadRail.sourceRequests"),
                  language,
                })}
              >
                {tKey("roadRail.sourceRequests")}
              </DataLabelWithHelp>
              <strong>{fetchedSourceCount}/{roadRail.source_requests.length}</strong>
            </header>
            <div>
              {roadRail.source_requests.map((request: RoadRailSourceRequest) => (
                <article className={`road-rail-request road-rail-request-${statusTone(request.status)}`} key={request.key}>
                  <div>
                    <strong>{localizedPlatformCopy(request.label, language) ?? request.label}</strong>
                    <span>{enumLabel(request.status)}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint, tKey)}
                    {request.fetched_at ? ` - ${tKey("roadRail.fetched")} ${scopedDataAge(request.fetched_at, roadRail.time_scope, language, tKey, "roadRail.notObserved", dataTimezone)}` : ""}
                  </p>
                  <small>
                    {request.message_count} {tKey("roadRail.messages")} - {request.content_type ?? tKey("roadRail.contentTypeUnavailable")}
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
