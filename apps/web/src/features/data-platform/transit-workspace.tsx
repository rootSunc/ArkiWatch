"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { parseValidDate } from "@/features/shared/format";

import { DataLabelWithHelp, dataHelpText } from "./data-help";
import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  TransitAlert,
  TransitCurrentResponse,
  TransitDataStage,
  TransitSourceRequest
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

type TransitWorkspaceProps = {
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<TransitCurrentResponse>[];
  transit: TransitCurrentResponse | null;
};

type TransitTone = "good" | "warn" | "bad" | "neutral";
type TransitAlertFilter = "priority" | "active" | "upcoming" | "high" | "scoped" | "all";
type TransitScopeFact = {
  label?: string;
  value: string;
};

type TransitScopeValue = {
  id: string;
  label: string;
  meta: string | null;
  facts?: TransitScopeFact[];
};
type TransitScopeDetailItem = {
  empty: string;
  icon: string;
  key: string;
  label: string;
  values: TransitScopeValue[];
};
type TransitScopeMetric = {
  key: string;
  label: string;
  count: number;
  detail: string;
  tone: TransitTone;
  width: number;
};

const SEVERITY_LABELS = ["HIGH", "MEDIUM", "LOW", "INFO"];
const ALERTS_PER_PAGE = INCIDENT_TIMELINE_PAGE_SIZE;
const HSL_STOP_DETAILS: Record<string, { address: string; code: string; name: string; zone: string }> = {
  "4180227": {
    address: "Martinkyläntie",
    code: "V1827",
    name: "Vantaankosken VPK",
    zone: "B"
  }
};
const ALERT_FILTERS: Array<{ icon: string; key: TransitAlertFilter; labelKey: string }> = [
  { icon: "priority_high", key: "priority", labelKey: "priority" },
  { icon: "radio_button_checked", key: "active", labelKey: "active" },
  { icon: "schedule", key: "upcoming", labelKey: "upcoming" },
  { icon: "warning", key: "high", labelKey: "high" },
  { icon: "route", key: "scoped", labelKey: "scoped" },
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
    return tKey("transit.notObserved");
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return tKey("transit.notObserved");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone)
  })
    .format(parsedDate)
    .toUpperCase();
}

function formatClockTime(
  value: string | null | undefined,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (!value) {
    return tKey("transit.notObserved");
  }

  const parsedDate = parseValidDate(value);
  if (!parsedDate) {
    return tKey("transit.notObserved");
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveDataTimezone(timeZone),
  }).format(parsedDate);
}

function formatAlertWindow(
  alert: TransitAlert,
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  return `${formatClockTime(alert.starts_at, language, tKey, timeZone)} - ${formatClockTime(alert.ends_at, language, tKey, timeZone)}`;
}

function uniqueJoined(values: string[]): string {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.slice(0, 4).join(" · ") : UNAVAILABLE_DATA_VALUE;
}

function clampPercent(value: number): number {
  return Math.max(6, Math.min(100, value));
}

function statusTone(status: string): TransitTone {
  if (status === "ready" || status === "fetched") {
    return "good";
  }
  if (status === "empty" || status === "missing" || status === "not_collected" || status === "stale") {
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
  timeScope?: TransitCurrentResponse["time_scope"],
): string {
  return scopedDataTimestamp(
    value,
    timeScope,
    language,
    tKey,
    "transit.notObserved",
    timeZone,
  );
}

function severityTone(severity: string): TransitTone {
  if (severity.toUpperCase() === "HIGH") {
    return "bad";
  }
  if (severity.toUpperCase() === "MEDIUM") {
    return "warn";
  }
  if (severity.toUpperCase() === "LOW") {
    return "good";
  }
  return "neutral";
}

function eventTypeLabel(value: string, language: LanguageMode): string {
  return translateEnumLabel(language, value);
}

function stopLabel(stopId: string): string {
  return HSL_STOP_DETAILS[stopId]?.name ?? stopId;
}

function scopeFactsLabel(facts: TransitScopeFact[]): string {
  return facts
    .map((fact) => (fact.label ? `${fact.label} ${fact.value}` : fact.value))
    .join(" · ");
}

function stopFacts(stopId: string, tKey: (key: string) => string): TransitScopeFact[] {
  const stop = HSL_STOP_DETAILS[stopId];
  if (!stop) {
    return [{ label: tKey("transit.stopId"), value: stopId }];
  }

  return [
    { value: stop.address },
    { value: stop.code },
    { label: tKey("transit.zone"), value: stop.zone },
    { label: tKey("transit.stopId"), value: stopId }
  ];
}

function metricValue(transit: TransitCurrentResponse, key: string): string {
  const metric = transit.metrics.find((item) => item.key === key);
  return metric ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "0";
}

function localizedTransitSummary(
  transit: TransitCurrentResponse,
  historical: boolean,
  tKey: (key: string) => string,
): string {
  if (transit.quality.raw_alert_count === 0 && transit.quality.normalized_event_count === 0) {
    return tKey(
      historical
        ? "transit.noActiveServiceAlertsInSelectedSnapshot"
        : "transit.noActiveServiceAlertsInTheLatestHslFeed",
    );
  }

  return tKey(
    historical ? "transit.summaryDecodedAtSnapshot" : "transit.summaryDecoded",
  )
    .replace("{raw}", String(transit.quality.raw_alert_count))
    .replace("{active}", String(transit.quality.active_alert_count))
    .replace("{routes}", String(transit.quality.route_alert_count))
    .replace("{stops}", String(transit.quality.stop_alert_count));
}

function transitReferenceTimestamp(transit: TransitCurrentResponse): number {
  const scopedReference = new Date(transit.time_scope?.reference_time ?? "").getTime();
  if (Number.isFinite(scopedReference)) {
    return scopedReference;
  }

  const checkedAt = new Date(transit.checked_at).getTime();
  if (Number.isFinite(checkedAt)) {
    return checkedAt;
  }

  const observedAt = new Date(transit.observed_at ?? "").getTime();
  return Number.isFinite(observedAt) ? observedAt : 0;
}

function severityDistribution(alerts: TransitAlert[]) {
  const max = Math.max(1, ...SEVERITY_LABELS.map((severity) => alerts.filter((alert) => alert.severity === severity).length));
  return SEVERITY_LABELS.map((severity) => {
    const count = alerts.filter((alert) => alert.severity === severity).length;
    return {
      count,
      severity,
      width: Math.max(8, (count / max) * 100)
    };
  });
}

function uniqueScopeCount(alerts: TransitAlert[], field: "route_ids" | "stop_ids" | "trip_ids"): number {
  return new Set(alerts.flatMap((alert) => alert[field])).size;
}

function transitScopeMetrics(alerts: TransitAlert[], tKey: (key: string) => string): TransitScopeMetric[] {
  const rows = [
    {
      key: "routes",
      label: tKey("transit.routes"),
      count: uniqueScopeCount(alerts, "route_ids"),
      detail: `${alerts.filter((alert) => alert.route_ids.length > 0).length} ${tKey("transit.alerts")}`,
      tone: "warn" as TransitTone
    },
    {
      key: "stops",
      label: tKey("transit.stops"),
      count: uniqueScopeCount(alerts, "stop_ids"),
      detail: `${alerts.filter((alert) => alert.stop_ids.length > 0).length} ${tKey("transit.alerts")}`,
      tone: "bad" as TransitTone
    },
    {
      key: "trips",
      label: tKey("transit.trips"),
      count: uniqueScopeCount(alerts, "trip_ids"),
      detail: `${alerts.filter((alert) => alert.trip_ids.length > 0).length} ${tKey("transit.alerts")}`,
      tone: "good" as TransitTone
    },
    {
      key: "network",
      label: tKey("transit.networkWide"),
      count: alerts.filter((alert) => !isScopedAlert(alert)).length,
      detail: tKey("transit.noIdsAttached"),
      tone: "neutral" as TransitTone
    }
  ];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return rows.map((row) => ({
    ...row,
    width: clampPercent((row.count / maxCount) * 100)
  }));
}

function sourceRequestHost(endpoint: string | null, tKey: (key: string) => string): string {
  if (!endpoint) {
    return tKey("transit.endpointNotRecorded");
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function effectLabel(value: string | null, language: LanguageMode, tKey: (key: string) => string): string {
  return value ? translateEnumLabel(language, value) : tKey("transit.effectUnavailable");
}

function causeLabel(value: string | null, language: LanguageMode, tKey: (key: string) => string): string {
  return value ? translateEnumLabel(language, value) : tKey("transit.causeUnavailable");
}

function scopeLabel(alert: TransitAlert, tKey: (key: string) => string): string {
  const scopes = [];
  if (alert.route_ids.length > 0) {
    scopes.push(`${alert.route_ids.length} ${tKey("transit.routes2")}`);
  }
  if (alert.stop_ids.length > 0) {
    scopes.push(`${alert.stop_ids.length} ${tKey("transit.stops2")}`);
  }
  if (alert.trip_ids.length > 0) {
    scopes.push(`${alert.trip_ids.length} ${tKey("transit.trips2")}`);
  }

  return scopes.length > 0 ? scopes.join(" / ") : tKey("transit.networkWide2");
}

function scopePreview(alert: TransitAlert, tKey: (key: string) => string): string {
  const scopes = [];
  if (alert.route_ids.length > 0) {
    scopes.push(`${tKey("transit.routes2")} ${alert.route_ids.slice(0, 4).join(", ")}${alert.route_ids.length > 4 ? " +" : ""}`);
  }
  if (alert.stop_ids.length > 0) {
    const stopNames = alert.stop_ids.slice(0, 3).map(stopLabel);
    scopes.push(`${tKey("transit.stops2")} ${stopNames.join(", ")}${alert.stop_ids.length > 3 ? " +" : ""}`);
  }
  if (alert.trip_ids.length > 0) {
    scopes.push(`${alert.trip_ids.length} ${tKey("transit.trips2")}`);
  }

  return scopes.length > 0 ? scopes.join(" / ") : tKey("transit.networkWideAlert");
}

function stageProgress(stage: TransitDataStage): number {
  if (stage.status === "ready") {
    return 100;
  }
  if (stage.status === "empty" || stage.status === "missing") {
    return 20;
  }
  return 55;
}

function isHighSeverity(alert: TransitAlert): boolean {
  return alert.severity.toUpperCase() === "HIGH";
}

function isScopedAlert(alert: TransitAlert): boolean {
  return alert.route_ids.length > 0 || alert.stop_ids.length > 0 || alert.trip_ids.length > 0;
}

function filterAlerts(
  alerts: TransitAlert[],
  filter: TransitAlertFilter,
  referenceTimestamp = Date.now(),
): TransitAlert[] {
  if (filter === "priority") {
    return alerts.filter((alert) => alert.active || isHighSeverity(alert));
  }
  if (filter === "active") {
    return alerts.filter((alert) => alert.active);
  }
  if (filter === "upcoming") {
    return alerts.filter(
      (alert) => scopedEventState(alert.active, alert.starts_at, referenceTimestamp) === "upcoming",
    );
  }
  if (filter === "high") {
    return alerts.filter(isHighSeverity);
  }
  if (filter === "scoped") {
    return alerts.filter(isScopedAlert);
  }

  return alerts;
}

function filterEmptyMessage(
  filter: TransitAlertFilter,
  tKey: (key: string) => string,
  historical = false,
): string {
  if (filter === "priority") {
    return tKey(
      historical
        ? "transit.noPriorityTransitAlertsInSnapshotWindow"
        : "transit.noPriorityTransitAlertsAreActiveOrUpcoming",
    );
  }
  if (filter === "active") {
    return tKey(
      historical
        ? "transit.noTransitAlertsAtSnapshot"
        : "transit.noTransitAlertsAreActiveRightNow",
    );
  }
  if (filter === "upcoming") {
    return tKey("transit.noUpcomingTransitAlertsWereNormalizedFromTheLatestFeed");
  }
  if (filter === "high") {
    return tKey("transit.noHighSeverityTransitAlertsWereNormalizedFromTheLatestFeed");
  }
  if (filter === "scoped") {
    return tKey("transit.noRouteStopOrTripScopedTransitAlertsWereNormalized");
  }

  return tKey("transit.noTransitAlertsWereNormalizedFromTheLatestHslFeed");
}

function activeAlertTone(activeAlerts: TransitAlert[], allAlerts: TransitAlert[]): TransitTone {
  if (activeAlerts.some(isHighSeverity)) {
    return "bad";
  }
  if (activeAlerts.length > 0 || allAlerts.some(isHighSeverity)) {
    return "warn";
  }
  return "good";
}

function highestSeverityLabel(alerts: TransitAlert[]): string {
  return SEVERITY_LABELS.find((severity) => alerts.some((alert) => alert.severity.toUpperCase() === severity)) ?? "NONE";
}

function nextActiveEndLabel(
  activeAlerts: TransitAlert[],
  language: LanguageMode,
  tKey: (key: string) => string,
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  if (activeAlerts.length === 0) {
    return tKey("transit.noActiveWindow");
  }

  const nextEndingAlert = [...activeAlerts].sort(
    (left, right) => new Date(left.ends_at).getTime() - new Date(right.ends_at).getTime()
  )[0];

  return `${tKey("transit.until")} ${formatCompactTime(nextEndingAlert.ends_at, language, tKey, timeZone)}`;
}

function transitRiskState(
  activeAlerts: TransitAlert[],
  allAlerts: TransitAlert[],
  tKey: (key: string) => string,
  historical = false,
  referenceTimestamp = Date.now(),
) {
  const highActive = activeAlerts.filter(isHighSeverity).length;
  const highUpcoming = allAlerts.filter(
    (alert) =>
      scopedEventState(alert.active, alert.starts_at, referenceTimestamp) === "upcoming" &&
      isHighSeverity(alert),
  ).length;

  if (highActive > 0) {
    return {
      detail: tKey(
        historical
          ? "transit.highSeverityAlertsAtSnapshotDetail"
          : "transit.highSeverityAlertsActiveDetail",
      ).replace("{count}", String(highActive)),
      icon: "warning",
      title: tKey(historical ? "transit.highImpactAtSnapshot" : "transit.highImpactActive")
    };
  }

  if (activeAlerts.length > 0) {
    return {
      detail: tKey(
        historical
          ? "transit.activeAlertsAtSnapshotMayAffectTimingDetail"
          : "transit.activeAlertsMayAffectTimingDetail",
      ).replace("{count}", String(activeAlerts.length)),
      icon: "directions_bus",
      title: tKey(historical ? "transit.serviceAlertsAtSnapshot" : "transit.serviceAlertsActive")
    };
  }

  if (highUpcoming > 0) {
    return {
      detail: tKey("transit.highSeverityAlertsUpcomingDetail").replace("{count}", String(highUpcoming)),
      icon: "schedule",
      title: tKey("transit.highImpactUpcoming")
    };
  }

  return {
    detail: allAlerts.length > 0
      ? tKey(
          historical
            ? "transit.noAlertsAtSnapshotMonitorUpcomingFeedItems"
            : "transit.noActiveAlertsRightNowMonitorUpcomingFeedItems",
        )
      : tKey(
          historical
            ? "transit.noActiveServiceAlertsInSelectedSnapshot"
            : "transit.noActiveServiceAlertsInTheLatestHslFeed",
        ),
    icon: "check_circle",
    title: tKey("transit.networkClear")
  };
}

function alertWindowProgress(alert: TransitAlert, nowTimestamp: number): number {
  const startsAt = new Date(alert.starts_at).getTime();
  const endsAt = new Date(alert.ends_at).getTime();

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return alert.active ? 100 : 8;
  }

  if (nowTimestamp < startsAt) {
    return 8;
  }

  if (nowTimestamp >= endsAt) {
    return 100;
  }

  return clampPercent(((nowTimestamp - startsAt) / (endsAt - startsAt)) * 100);
}

function alertTimelineBounds(alerts: TransitAlert[], nowTimestamp: number): { startsAt: number; endsAt: number } | null {
  const timestamps = alerts.flatMap((alert) => {
    const startsAt = new Date(alert.starts_at).getTime();
    const endsAt = new Date(alert.ends_at).getTime();
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) ? [startsAt, endsAt] : [];
  });

  if (timestamps.length === 0) {
    return null;
  }

  return {
    startsAt: Math.min(nowTimestamp, ...timestamps),
    endsAt: Math.max(nowTimestamp + 60 * 60 * 1000, ...timestamps)
  };
}

function scopeSummary(alert: TransitAlert, tKey: (key: string) => string): string {
  const scopes = [
    alert.route_ids.length > 0 ? `${alert.route_ids.length} ${tKey("transit.routes2")}` : null,
    alert.stop_ids.length > 0 ? `${alert.stop_ids.length} ${tKey("transit.stops2")}` : null,
    alert.trip_ids.length > 0 ? `${alert.trip_ids.length} ${tKey("transit.trips2")}` : null
  ].filter((item): item is string => item !== null);

  return scopes.length > 0 ? scopes.join(" / ") : tKey("transit.networkWide2");
}

function detailScopeItems(alert: TransitAlert, tKey: (key: string) => string): TransitScopeDetailItem[] {
  return [
    {
      key: "routes",
      label: tKey("transit.routesAffected"),
      icon: "route",
      values: alert.route_ids.map((routeId) => {
        const facts = [{ label: tKey("transit.routeId"), value: routeId }];
        return {
          id: routeId,
          label: routeId,
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: tKey("transit.noRoutesAttached")
    },
    {
      key: "stops",
      label: tKey("transit.stopsAffected"),
      icon: "pin_drop",
      values: alert.stop_ids.map((stopId) => {
        const facts = stopFacts(stopId, tKey);
        return {
          id: stopId,
          label: stopLabel(stopId),
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: tKey("transit.noStopsAttached")
    },
    {
      key: "trips",
      label: tKey("transit.tripsAffected"),
      icon: "confirmation_number",
      values: alert.trip_ids.map((tripId) => {
        const facts = [{ label: tKey("transit.tripId"), value: tripId }];
        return {
          id: tripId,
          label: tripId,
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: tKey("transit.noTripsAttached")
    }
  ];
}

function timelinePercent(value: number, bounds: { startsAt: number; endsAt: number }): number {
  if (bounds.endsAt <= bounds.startsAt) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((value - bounds.startsAt) / (bounds.endsAt - bounds.startsAt)) * 100));
}

function formatHistoryDate(
  value: string,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: language === "zh" ? "numeric" : "2-digit",
    month: "short",
    timeZone: resolveDataTimezone(timeZone)
  }).format(parsed);
}

function transitHistoryPoints(
  history: PlatformHistoricalSnapshot<TransitCurrentResponse>[],
  tKey: (key: string) => string,
  language: LanguageMode = "en",
  timeZone = DEFAULT_DATA_TIME_ZONE,
): TrendChartPoint[] {
  return history.flatMap((snapshot) => {
    const data = snapshot.data;
    if (!data) {
      return [];
    }

    return [
      {
        label: formatHistoryDate(snapshot.date, language, timeZone),
        value: data.quality.normalized_event_count,
        detail: tKey("transit.historyPointDetailAtSnapshot")
          .replace("{active}", String(data.quality.active_alert_count))
          .replace("{routes}", String(data.quality.route_alert_count))
      }
    ];
  });
}

function TransitAlertStatusBadge({
  alert,
  historical,
  referenceTimestamp,
  language,
  timeZone,
  tKey,
}: {
  alert: TransitAlert;
  historical: boolean;
  referenceTimestamp: number;
  language: LanguageMode;
  timeZone?: string;
  tKey: (key: string) => string;
}) {
  const state = scopedEventState(alert.active, alert.starts_at, referenceTimestamp);
  return (
    <span className={state === "active" ? "transit-alert-status transit-alert-status-active" : "transit-alert-status"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {state === "active" ? "radio_button_checked" : state === "upcoming" ? "schedule" : "history"}
      </span>
      <span>
        {state === "active"
          ? tKey(historical ? "transit.activeAtSnapshot" : "transit.activeNow")
          : state === "ended"
            ? tKey(historical ? "transit.endedAtSnapshot" : "transit.ended")
            : formatCompactTime(alert.starts_at, language, tKey, timeZone)}
      </span>
    </span>
  );
}

function TransitAlertLiveLayer({
  alert,
  historical,
  referenceTimestamp,
  language,
  nowTimestamp,
  timeZone,
  tKey,
}: {
  alert: TransitAlert;
  historical: boolean;
  referenceTimestamp: number;
  language: LanguageMode;
  nowTimestamp: number;
  timeZone?: string;
  tKey: (key: string) => string;
}) {
  const progress = alertWindowProgress(alert, nowTimestamp);
  const state = scopedEventState(alert.active, alert.starts_at, referenceTimestamp);

  return (
    <section
      className={state === "active" ? "transit-alert-live-layer transit-alert-live-layer-active" : "transit-alert-live-layer"}
      aria-label={tKey("transit.alertStatus")}
    >
      <div className="transit-alert-live-copy">
        <TransitAlertStatusBadge alert={alert} historical={historical} referenceTimestamp={referenceTimestamp} language={language} timeZone={timeZone} tKey={tKey} />
        <div>
          <strong>
            {state === "active"
              ? tKey(historical ? "transit.inEffectAtSnapshot" : "transit.inEffect")
              : state === "ended"
                ? tKey(historical ? "transit.endedAtSnapshot" : "transit.ended")
                : tKey("transit.scheduled")}
          </strong>
          <span>
            {state === "active"
              ? `${tKey("transit.until")} ${formatCompactTime(alert.ends_at, language, tKey, timeZone)}`
              : state === "ended"
                ? `${tKey("transit.endedAt")} ${formatCompactTime(alert.ends_at, language, tKey, timeZone)}`
                : `${tKey("transit.starts")} ${formatCompactTime(alert.starts_at, language, tKey, timeZone)}`}
          </span>
        </div>
      </div>
      <span className="transit-alert-live-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className="transit-alert-live-facts">
        <div>
          <dt>{tKey("transit.window")}</dt>
          <dd>{formatCompactTime(alert.starts_at, language, tKey, timeZone)} - {formatCompactTime(alert.ends_at, language, tKey, timeZone)}</dd>
        </div>
        <div>
          <dt>{tKey("transit.impactScope")}</dt>
          <dd>{scopeSummary(alert, tKey)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function TransitWorkspace({
  category,
  highlightedEventId,
  history,
  transit,
}: TransitWorkspaceProps) {
  const { language, tKey, enumLabel } = useI18n();
  const [alertFilter, setAlertFilter] = useState<TransitAlertFilter>("priority");
  const [alertPage, setAlertPage] = useState(0);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const isHistorical = isHistoricalTimeScope(transit?.time_scope);
  const referenceTimestamp = transit ? transitReferenceTimestamp(transit) : 0;
  const activeAlerts = useMemo(() => transit?.alerts.filter((alert) => alert.active) ?? [], [transit]);
  const filteredAlerts = useMemo(
    () => filterAlerts(transit?.alerts ?? [], alertFilter, referenceTimestamp),
    [alertFilter, referenceTimestamp, transit]
  );

  useEffect(() => {
    setAlertPage(0);
    setSelectedAlertId(null);
  }, [alertFilter, transit?.checked_at, transit?.alerts.length]);

  useEffect(() => {
    if (!highlightedEventId || !transit) {
      return;
    }

    const alertIndex = transit.alerts.findIndex((alert) => alert.id === highlightedEventId);
    if (alertIndex < 0) {
      return;
    }

    if (alertFilter !== "all") {
      setAlertFilter("all");
      return;
    }

    setAlertPage(Math.floor(alertIndex / ALERTS_PER_PAGE));
    setSelectedAlertId(highlightedEventId);
  }, [alertFilter, highlightedEventId, transit]);

  if (!transit || isEmptyStatus(transit.status)) {
    return (
      <WorkspaceEmptyState
        className="transit-detail-empty"
        description={tKey("transit.digitransitHslServiceAlertDataHasNotArrivedForTheCurrentPlatformWindow")}
        eyebrow={tKey("transit.transit")}
        title={tKey("transit.transitServiceAlertsAreNotAvailableYet")}
      />
    );
  }

  const dataTimezone = resolveDataTimezone(transit.time_scope?.timezone);

  const nowTimestamp = referenceTimestamp;
  const activeTone = activeAlertTone(activeAlerts, transit.alerts);
  const riskState = transitRiskState(activeAlerts, transit.alerts, tKey, isHistorical, referenceTimestamp);
  const {
    currentPage: currentAlertPage,
    pageCount: alertPageCount,
    startIndex: pageStartIndex,
    items: pagedAlerts,
  } = paginateTimelineItems(filteredAlerts, alertPage, ALERTS_PER_PAGE);
  const selectedAlert = (selectedAlertId
    ? pagedAlerts.find((alert) => alert.id === selectedAlertId)
    : null) ?? pagedAlerts[0] ?? null;
  const timebandAlerts = pagedAlerts;
  const timebandBounds = alertTimelineBounds(timebandAlerts, nowTimestamp);
  const severityRows = severityDistribution(transit.alerts);
  const scopeRows = transitScopeMetrics(transit.alerts, tKey);
  const readyPipelineCount = transit.data_pipeline.filter((stage) => stage.status === "ready").length;
  const fetchedSourceCount = transit.source_requests.filter((request) => request.status === "fetched").length;
  const historyPoints = transitHistoryPoints(history, tKey, language, dataTimezone);
  const highSeverityCount = transit.alerts.filter((alert) => alert.severity.toUpperCase() === "HIGH").length;
  const upcomingAlerts = transit.alerts.filter(
    (alert) => scopedEventState(alert.active, alert.starts_at, referenceTimestamp) === "upcoming",
  );
  const routePreview = uniqueJoined(transit.alerts.flatMap((alert) => alert.route_ids));
  const stopPreview = uniqueJoined(transit.alerts.flatMap((alert) => alert.stop_ids));
  const upcomingStart = upcomingAlerts[0]
    ? tKey("transit.startsAtClock").replace(
        "{time}",
        formatClockTime(upcomingAlerts[0].starts_at, language, tKey, dataTimezone),
      )
    : UNAVAILABLE_DATA_VALUE;
  const liveTone = liveStatusTone(transit.status);

  return (
    <section className="transit-detail-page" aria-label={tKey("transit.transitDetail")}>
      <WorkspaceEvidenceHeader
        className="transit-detail-header"
        eyebrow={tKey("mobility.mobilityWorkspace")}
        fallbackKey="transit.notObserved"
        headingLevel={2}
        language={language}
        observedAt={transit.observed_at}
        sourceLabel={transit.source_code.toUpperCase()}
        status={scopedStatusLabel(
          transit.status,
          transit.time_scope,
          tKey,
          "transit.hslFeedActive",
          "transit.feedDelayed",
        )}
        statusTone={liveTone}
        tKey={tKey}
        timeScope={transit.time_scope}
        title={tKey("transit.helsinkiTransitServiceAlerts")}
        timezone={dataTimezone}
      />

      <section className={`transit-glass-panel transit-command-panel transit-command-panel-${activeTone}`} aria-label={tKey("transit.transitAlertCondition")}>
        <div className="transit-command-status">
          <span className="material-symbols-outlined transit-condition-icon" aria-hidden="true">
            {riskState.icon}
          </span>
          <div>
            <div className="transit-card-kicker">
              <span>{tKey(isHistorical ? "transit.transitRiskAtSnapshot" : "transit.currentTransitRisk")}</span>
              <time>{exactObservedLabel(transit.observed_at, language, tKey, dataTimezone, transit.time_scope)}</time>
            </div>
            <strong>{transit.quality.active_alert_count}</strong>
            <p>
              <span>{riskState.title}</span>
              {riskState.detail}
            </p>
          </div>
        </div>

        <div className="transit-command-facts">
          <div>
            <span>{tKey("transit.highestSeverity")}</span>
            <strong>{enumLabel(highestSeverityLabel(transit.alerts))}</strong>
          </div>
          <div>
            <span>{tKey("transit.nextClear")}</span>
            <strong>{nextActiveEndLabel(activeAlerts, language, tKey, dataTimezone)}</strong>
          </div>
          <div>
            <span>{tKey("transit.scopedImpact")}</span>
            <strong>{metricValue(transit, "route_scoped")} {tKey("transit.routes2")} / {metricValue(transit, "stop_scoped")} {tKey("transit.stops2")}</strong>
          </div>
          <div>
            <span>{tKey("transit.coverage")}</span>
            <strong>{formatPercent(transit.quality.field_coverage_pct, tKey)}</strong>
          </div>
        </div>
      </section>

      <section className="transit-summary-strip" aria-label={tKey("transit.transitSummaryMetrics")}>
        <article className="transit-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "active_alerts",
              label: tKey("transit.activeAlertsTitle"),
              language,
            })}
          >
            {tKey("transit.activeAlertsTitle")}
          </DataLabelWithHelp>
          <strong className={transit.quality.active_alert_count > 0 ? "is-watch" : undefined}>
            {transit.quality.active_alert_count}
          </strong>
          <small>{tKey("transit.highSeverityCount").replace("{count}", String(highSeverityCount))}</small>
        </article>
        <article className="transit-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "route_scoped",
              label: tKey("transit.routesAffected"),
              language,
            })}
          >
            {tKey("transit.routesAffected")}
          </DataLabelWithHelp>
          <strong>{transit.quality.route_alert_count}</strong>
          <small>{routePreview}</small>
        </article>
        <article className="transit-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "stop_scoped",
              label: tKey("transit.stopsInScope"),
              language,
            })}
          >
            {tKey("transit.stopsInScope")}
          </DataLabelWithHelp>
          <strong>{transit.quality.stop_alert_count}</strong>
          <small>{stopPreview}</small>
        </article>
        <article className="transit-glass-panel">
          <DataLabelWithHelp
            helpText={dataHelpText({
              key: "upcoming",
              label: tKey("transit.upcoming"),
              language,
            })}
          >
            {tKey("transit.upcoming")}
          </DataLabelWithHelp>
          <strong>{upcomingAlerts.length}</strong>
          <small>{upcomingStart}</small>
        </article>
      </section>

      <section className="transit-main-grid" aria-label={tKey("transit.transitAlertAnalytics")}>
        <article className="transit-glass-panel transit-alert-panel">
          <header>
            <div>
              <span>{tKey("transit.incidentTimeline")}</span>
              <h2>{tKey(isHistorical ? "transit.alertsInSnapshotWindow" : "transit.activeAndUpcomingServiceAlerts")}</h2>
            </div>
            <strong>{tKey("transit.priorityFirst")}</strong>
          </header>
          <div className="transit-alert-toolbar">
            <div className="transit-alert-filters" aria-label={tKey("transit.transitAlertFilters")}>
              {ALERT_FILTERS.map((filter) => (
                <button
                  aria-pressed={alertFilter === filter.key}
                  className={alertFilter === filter.key ? "transit-filter-chip transit-filter-chip-active" : "transit-filter-chip"}
                  key={filter.key}
                  onClick={() => setAlertFilter(filter.key)}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {filter.icon}
                  </span>
                  <span>{tKey(filter.key === "active" && isHistorical ? "transit.atSnapshot" : `transit.${filter.labelKey}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="transit-alert-layout">
            <div className="transit-alert-list-column">
              {timebandAlerts.length > 0 && timebandBounds ? (
                <div className="transit-timeband-panel" aria-label={tKey("transit.transitAlertTimeWindows")}>
                  <header>
                    <span>{tKey("transit.timeWindows")}</span>
                    <strong>{timebandAlerts.length}</strong>
                  </header>
                  <div className="transit-timeband-list">
                    {timebandAlerts.map((alert) => {
                      const startsAt = new Date(alert.starts_at).getTime();
                      const endsAt = new Date(alert.ends_at).getTime();
                      const left = timelinePercent(startsAt, timebandBounds);
                      const right = timelinePercent(endsAt, timebandBounds);
                      const width = Math.max(4, right - left);
                      return (
                        <article className={`transit-timeband-row transit-timeband-row-${severityTone(alert.severity)}`} key={alert.id}>
                          <TransitAlertStatusBadge alert={alert} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                          <i aria-hidden="true">
                            <span
                              style={
                                {
                                  "--timeband-left": `${left}%`,
                                  "--timeband-width": `${width}%`
                                } as CSSProperties
                              }
                            />
                          </i>
                          <strong>{scopeLabel(alert, tKey)}</strong>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="transit-alert-list">
                {pagedAlerts.length > 0 ? (
                  pagedAlerts.map((alert) => (
                    <button
                      aria-pressed={selectedAlert?.id === alert.id}
                      className={`transit-alert transit-alert-card transit-alert-${severityTone(alert.severity)}${selectedAlert?.id === alert.id ? " transit-alert-selected" : ""}`}
                      id={eventAnchorId(alert.id)}
                      key={alert.id}
                      onClick={() => setSelectedAlertId(alert.id)}
                      type="button"
                    >
                      <span className={`transit-alert-severity transit-alert-severity-${severityTone(alert.severity)}`}>
                        {enumLabel(alert.severity)}
                      </span>
                      <div className="transit-alert-main">
                        <strong>{localizedPlatformCopy(alert.title, language) ?? alert.title}</strong>
                        <p>{localizedPlatformCopy(alert.description, language) ?? alert.description}</p>
                        <small>
                          {transit.source_code.toUpperCase()} · {alert.id} · {formatClockTime(alert.starts_at, language, tKey, dataTimezone)}
                        </small>
                        <div className="sr-only">
                          <TransitAlertStatusBadge alert={alert} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                          <small className="transit-alert-scope-preview">{scopePreview(alert, tKey)}</small>
                          <em>{eventTypeLabel(alert.event_type, language)}</em>
                          <span>{causeLabel(alert.cause, language, tKey)}</span>
                          <span>{effectLabel(alert.effect, language, tKey)}</span>
                          <span>{scopeLabel(alert, tKey)}</span>
                        </div>
                      </div>
                      <span className="transit-alert-when">
                        {formatAlertWindow(alert, language, tKey, dataTimezone)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p>{filterEmptyMessage(alertFilter, tKey, isHistorical)}</p>
                )}
              </div>
              <IncidentTimelinePager
                currentPage={currentAlertPage}
                onPageChange={setAlertPage}
                pageCount={alertPageCount}
                startIndex={pageStartIndex}
                totalCount={filteredAlerts.length}
                visibleCount={pagedAlerts.length}
              />
              <p className="transit-alert-context">{tKey("transit.serviceAlertContext")}</p>
            </div>
            <aside className="transit-alert-inspector" aria-label={tKey("transit.incidentDetails")}>
              {selectedAlert ? (
                <section className={`transit-alert-detail transit-alert-detail-${severityTone(selectedAlert.severity)}`}>
                  <header>
                    <div>
                      <TransitAlertStatusBadge alert={selectedAlert} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} timeZone={dataTimezone} tKey={tKey} />
                      <strong>{localizedPlatformCopy(selectedAlert.title, language) ?? selectedAlert.title}</strong>
                    </div>
                    <em>{enumLabel(selectedAlert.severity)}</em>
                  </header>
                  <p>{localizedPlatformCopy(selectedAlert.description, language) ?? selectedAlert.description}</p>
                  <TransitAlertLiveLayer alert={selectedAlert} historical={isHistorical} referenceTimestamp={referenceTimestamp} language={language} nowTimestamp={nowTimestamp} timeZone={dataTimezone} tKey={tKey} />
                  <div className="transit-alert-detail-meta">
                    <div>
                      <span>{tKey("transit.type")}</span>
                      <strong>{eventTypeLabel(selectedAlert.event_type, language)}</strong>
                    </div>
                    <div>
                      <span>{tKey("transit.cause")}</span>
                      <strong>{causeLabel(selectedAlert.cause, language, tKey)}</strong>
                    </div>
                    <div>
                      <span>{tKey("transit.effect")}</span>
                      <strong>{effectLabel(selectedAlert.effect, language, tKey)}</strong>
                    </div>
                  </div>
                  <div className="transit-alert-detail-scope">
                    {detailScopeItems(selectedAlert, tKey).map((item) => (
                      <section key={item.key} className="transit-scope-group">
                        <header className="transit-scope-group-header">
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                          {item.values.length > 0 ? (
                            <span className="transit-scope-group-count" aria-hidden="true">
                              {item.values.length}
                            </span>
                          ) : null}
                        </header>
                        <ul className="transit-scope-list">
                          {item.values.length > 0 ? (
                            item.values.map((value) => (
                              <li key={value.id} className="transit-scope-item" title={value.meta ?? value.id}>
                                <p className="transit-scope-item-label">{value.label}</p>
                                {value.facts && value.facts.length > 0 ? (
                                  <div className="transit-scope-facts">
                                    {value.facts.map((fact, index) => (
                                      <span key={`${fact.label ?? "value"}-${fact.value}-${index}`}>
                                        {fact.label ? <em>{fact.label}</em> : null}
                                        {fact.value}
                                      </span>
                                    ))}
                                  </div>
                                ) : value.meta ? (
                                  <p className="transit-scope-item-meta">{value.meta}</p>
                                ) : null}
                              </li>
                            ))
                          ) : (
                            <li className="transit-scope-empty">{item.empty}</li>
                          )}
                        </ul>
                      </section>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="transit-alert-detail transit-alert-detail-empty">
                  <header>
                    <div>
                      <span>{tKey("transit.incidentDetails")}</span>
                      <strong>{tKey("transit.noSelectedEvent")}</strong>
                    </div>
                  </header>
                  <p>{filterEmptyMessage(alertFilter, tKey, isHistorical)}</p>
                </section>
              )}
            </aside>
          </div>
        </article>
      </section>

      <section className="transit-insight-grid" aria-label={tKey("transit.transitAlertCondition")}>
        <article className="transit-glass-panel transit-severity-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "severity_mix",
                label: "Severity Mix",
                language,
              })}
            >
              {tKey("transit.severityMix")}
            </DataLabelWithHelp>
            <strong>{transit.alerts.length}</strong>
          </header>
          <div className="transit-severity-bars">
            {severityRows.map((row) => (
              <div className={`transit-severity-row transit-severity-row-${severityTone(row.severity)}`} key={row.severity}>
                <span>{enumLabel(row.severity)}</span>
                <i aria-hidden="true">
                  <span style={{ width: `${row.width}%` }} />
                </i>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="transit-glass-panel transit-scope-panel">
          <header>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key: "alert_scope",
                label: "Alert Scope",
                language,
              })}
            >
              {tKey("transit.alertScope")}
            </DataLabelWithHelp>
            <strong>{transit.quality.field_coverage_pct.toFixed(0)}%</strong>
          </header>
          <div className="transit-scope-grid">
            <article>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "route_scoped",
                  label: "Route scoped",
                  language,
                })}
              >
                {tKey("transit.routeScoped")}
              </DataLabelWithHelp>
              <strong>{transit.quality.route_alert_count}</strong>
              <small>{tKey("transit.alertsIncludeRouteIds")}</small>
            </article>
            <article>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "stop_scoped",
                  label: "Stop scoped",
                  language,
                })}
              >
                {tKey("transit.stopScoped")}
              </DataLabelWithHelp>
              <strong>{transit.quality.stop_alert_count}</strong>
              <small>{tKey("transit.alertsIncludeStopIds")}</small>
            </article>
            <article>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "raw_decoded",
                  label: "Raw decoded",
                  language,
                })}
              >
                {tKey("transit.rawDecoded")}
              </DataLabelWithHelp>
              <strong>{transit.quality.raw_alert_count}</strong>
              <small>{tKey("transit.gtfsRtAlertEntities")}</small>
            </article>
            <article>
              <DataLabelWithHelp
                helpText={dataHelpText({
                  key: "normalized",
                  label: "Normalized",
                  language,
                })}
              >
                {tKey("transit.normalized")}
              </DataLabelWithHelp>
              <strong>{transit.quality.normalized_event_count}</strong>
              <small>{tKey("transit.storedEventRows")}</small>
            </article>
          </div>
          <div className="transit-scope-bars" aria-label={tKey("transit.transitAffectedScopeDistribution")}>
            {scopeRows.map((row) => (
              <article className={`transit-scope-bar transit-scope-bar-${row.tone}`} key={row.key}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.detail}</span>
                </div>
                <i aria-hidden="true">
                  <span style={{ width: `${row.width}%` }} />
                </i>
                <em>{row.count}</em>
              </article>
            ))}
          </div>
        </article>
      </section>

      <TrendChart
        className="transit-glass-panel"
        emptyMessage={tKey("transit.noDailyTransitAlertHistoryIsAvailable")}
        eyebrow={`${historyPoints.length}D ${tKey("transit.history")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={tKey("transit.dailyAlertEventTrend")}
        tone={activeTone}
        unit={tKey("transit.events")}
      />

      <section className={`transit-provider-status transit-provider-status-${liveTone}`} aria-label={tKey("transit.transitProviderStatus")}>
        <div>
          <span aria-hidden="true" />
          <strong>{tKey("transit.providerStatus")}</strong>
        </div>
        <div>
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              database
            </span>
            {localizedPlatformCopy("HSL GTFS-RT Service Alerts", language)}
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("transit.lastSync")}: {exactObservedLabel(transit.observed_at ?? scopedReferenceTime(transit.time_scope), language, tKey, dataTimezone, transit.time_scope)}
          </span>
          <i aria-hidden="true" />
          <span className="transit-provider-coverage">{tKey("transit.coverage")}: {formatPercent(transit.quality.field_coverage_pct, tKey)}</span>
        </div>
      </section>

      <p className="transit-detail-freshness">
        {localizedTransitSummary(transit, isHistorical, tKey) ?? localizedPlatformCopy(category?.description, language) ?? tKey("transit.latestNormalizedHslTransitServiceAlertSignals")}
      </p>

      <details className="transit-glass-panel transit-diagnostics-panel">
        <summary>
          <div>
            <span>{tKey("transit.diagnostics")}</span>
            <strong>{readyPipelineCount}/{transit.data_pipeline.length} {tKey("transit.stages")} · {fetchedSourceCount}/{transit.source_requests.length} {tKey("transit.sources")}</strong>
          </div>
          <span className="material-symbols-outlined" aria-hidden="true">
            expand_more
          </span>
        </summary>
        <div className="transit-diagnostics-body">
          <section className="transit-diagnostic-section transit-pipeline-panel">
            <header>
              <span>{tKey("transit.pipeline")}</span>
              <strong>{readyPipelineCount}/{transit.data_pipeline.length}</strong>
            </header>
            <div>
              {transit.data_pipeline.map((stage) => (
                <article className={`transit-stage transit-stage-${statusTone(stage.status)}`} key={stage.key}>
                  <div>
                    <strong>{localizedPlatformCopy(stage.label, language) ?? stage.label}</strong>
                    <span>{enumLabel(stage.status)}</span>
                  </div>
                  <p>
                    {localizedPlatformCopy(stage.detail, language) ?? stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${tKey("transit.records")}` : ""}
                  </p>
                  <span className="transit-stage-meter" aria-hidden="true">
                    <span style={{ width: `${stageProgress(stage)}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="transit-diagnostic-section transit-source-panel">
            <header>
              <span>{tKey("transit.sourceRequest")}</span>
              <strong>{fetchedSourceCount}/{transit.source_requests.length}</strong>
            </header>
            <div>
              {transit.source_requests.map((request: TransitSourceRequest) => (
                <article className={`transit-request transit-request-${statusTone(request.status)}`} key={request.key}>
                  <div>
                    <strong>{localizedPlatformCopy(request.label, language) ?? request.label}</strong>
                    <span>{enumLabel(request.status)}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint, tKey)}
                    {request.fetched_at ? ` · ${tKey("transit.fetched")} ${scopedDataAge(request.fetched_at, transit.time_scope, language, tKey, "transit.notObserved", dataTimezone)}` : ""}
                  </p>
                  <small>{request.content_type ?? tKey("transit.contentTypeUnavailable")}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="transit-diagnostic-section transit-quality-notes">
            <header>
              <span>{tKey("transit.qualityNotes")}</span>
              <strong>{transit.quality.notes.length}</strong>
            </header>
            <div>
              {transit.quality.notes.map((note) => (
                <p key={note}>{localizedPlatformCopy(note, language) ?? note}</p>
              ))}
            </div>
          </section>
        </div>
      </details>
    </section>
  );
}
