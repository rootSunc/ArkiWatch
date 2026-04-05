"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { formatRelativeAge, formatTimestamp } from "@/features/shared/format";

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

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
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
    return "missing";
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatCompactTime(value: string | null | undefined, language: LanguageMode, tKey: (key: string) => string): string {
  if (!value) {
    return tKey("transit.notObserved");
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

function liveStatusTone(status: string | null | undefined): "ready" | "stale" | "empty" {
  if (status === "ready") {
    return "ready";
  }
  if (status === "stale") {
    return "stale";
  }
  return "empty";
}

function exactObservedLabel(value: string | null, language: LanguageMode, tKey: (key: string) => string): string {
  if (!value) {
    return tKey("transit.notObserved");
  }

  return `${formatTimestamp(value, "dateTime", language)} (${formatRelativeAge(value, language)})`;
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

function eventTypeLabel(value: string): string {
  return value.replace(/^transit_/, "").replaceAll("_", " ");
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

function transitReferenceTimestamp(transit: TransitCurrentResponse): number {
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

function filterAlerts(alerts: TransitAlert[], filter: TransitAlertFilter): TransitAlert[] {
  if (filter === "priority") {
    return alerts.filter((alert) => alert.active || isHighSeverity(alert));
  }
  if (filter === "active") {
    return alerts.filter((alert) => alert.active);
  }
  if (filter === "upcoming") {
    return alerts.filter((alert) => !alert.active);
  }
  if (filter === "high") {
    return alerts.filter(isHighSeverity);
  }
  if (filter === "scoped") {
    return alerts.filter(isScopedAlert);
  }

  return alerts;
}

function filterEmptyMessage(filter: TransitAlertFilter, tKey: (key: string) => string): string {
  if (filter === "priority") {
    return tKey("transit.noPriorityTransitAlertsAreActiveOrUpcoming");
  }
  if (filter === "active") {
    return tKey("transit.noTransitAlertsAreActiveRightNow");
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

function nextActiveEndLabel(activeAlerts: TransitAlert[], language: LanguageMode, tKey: (key: string) => string): string {
  if (activeAlerts.length === 0) {
    return tKey("transit.noActiveWindow");
  }

  const nextEndingAlert = [...activeAlerts].sort(
    (left, right) => new Date(left.ends_at).getTime() - new Date(right.ends_at).getTime()
  )[0];

  return `${tKey("transit.until")} ${formatCompactTime(nextEndingAlert.ends_at, language, tKey)}`;
}

function transitRiskState(activeAlerts: TransitAlert[], allAlerts: TransitAlert[], tKey: (key: string) => string) {
  const highActive = activeAlerts.filter(isHighSeverity).length;
  const highUpcoming = allAlerts.filter((alert) => !alert.active && isHighSeverity(alert)).length;

  if (highActive > 0) {
    return {
      detail: `${highActive} high-severity alert${highActive === 1 ? "" : "s"} active now across the HSL feed.`,
      icon: "warning",
      title: tKey("transit.highImpactActive")
    };
  }

  if (activeAlerts.length > 0) {
    return {
      detail: `${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"} may affect route choice or timing.`,
      icon: "directions_bus",
      title: tKey("transit.serviceAlertsActive")
    };
  }

  if (highUpcoming > 0) {
    return {
      detail: `${highUpcoming} high-severity alert${highUpcoming === 1 ? "" : "s"} are scheduled or pending in the feed.`,
      icon: "schedule",
      title: tKey("transit.highImpactUpcoming")
    };
  }

  return {
    detail: allAlerts.length > 0 ? tKey("transit.noActiveAlertsRightNowMonitorUpcomingFeedItems") : tKey("transit.noActiveServiceAlertsInTheLatestHslFeed"),
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

function transitHistoryPoints(
  history: PlatformHistoricalSnapshot<TransitCurrentResponse>[]
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
        detail: `${data.quality.active_alert_count} active · ${data.quality.route_alert_count} route scoped`
      }
    ];
  });
}

function TransitAlertStatusBadge({
  alert,
  language,
  tKey,
}: {
  alert: TransitAlert;
  language: LanguageMode;
  tKey: (key: string) => string;
}) {
  return (
    <span className={alert.active ? "transit-alert-status transit-alert-status-active" : "transit-alert-status"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {alert.active ? "radio_button_checked" : "schedule"}
      </span>
      <span>{alert.active ? tKey("transit.activeNow") : formatCompactTime(alert.starts_at, language, tKey)}</span>
    </span>
  );
}

function TransitAlertLiveLayer({
  alert,
  language,
  nowTimestamp,
  tKey,
}: {
  alert: TransitAlert;
  language: LanguageMode;
  nowTimestamp: number;
  tKey: (key: string) => string;
}) {
  const progress = alertWindowProgress(alert, nowTimestamp);

  return (
    <section
      className={alert.active ? "transit-alert-live-layer transit-alert-live-layer-active" : "transit-alert-live-layer"}
      aria-label={tKey("transit.alertStatus")}
    >
      <div className="transit-alert-live-copy">
        <TransitAlertStatusBadge alert={alert} language={language} tKey={tKey} />
        <div>
          <strong>{alert.active ? tKey("transit.inEffect") : tKey("transit.scheduled")}</strong>
          <span>
            {alert.active
              ? `${tKey("transit.until")} ${formatCompactTime(alert.ends_at, language, tKey)}`
              : `${tKey("transit.starts")} ${formatCompactTime(alert.starts_at, language, tKey)}`}
          </span>
        </div>
      </div>
      <span className="transit-alert-live-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className="transit-alert-live-facts">
        <div>
          <dt>{tKey("transit.window")}</dt>
          <dd>{formatCompactTime(alert.starts_at, language, tKey)} - {formatCompactTime(alert.ends_at, language, tKey)}</dd>
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
  const activeAlerts = useMemo(() => transit?.alerts.filter((alert) => alert.active) ?? [], [transit]);
  const filteredAlerts = useMemo(
    () => filterAlerts(transit?.alerts ?? [], alertFilter),
    [alertFilter, transit]
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

  if (!transit) {
    return (
      <section className="transit-detail-empty" aria-label={tKey("transit.transitDataUnavailable")}>
        <span>{tKey("transit.transit")}</span>
        <h2>{tKey("transit.transitServiceAlertsAreNotAvailableYet")}</h2>
        <p>{tKey("transit.digitransitHslServiceAlertDataHasNotArrivedForTheCurrentPlatformWindow")}</p>
      </section>
    );
  }

  const nowTimestamp = transitReferenceTimestamp(transit);
  const activeTone = activeAlertTone(activeAlerts, transit.alerts);
  const riskState = transitRiskState(activeAlerts, transit.alerts, tKey);
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
  const historyPoints = transitHistoryPoints(history);
  const transitSummaryMetrics = [
    ["active_alerts", "activeNowSummary"],
    ["high_severity", "highSeverity"],
    ["disruptions", "disruptions"],
    ["delays", "delays"],
    ["route_scoped", "routeScopedSummary"],
    ["raw_alerts", "rawFeed"],
  ];
  const liveTone = liveStatusTone(transit.status);

  return (
    <section className="transit-detail-page" aria-label={tKey("transit.transitDetail")}>
      <div className="transit-detail-header">
        <div>
          <h2>{tKey("transit.helsinkiTransitServiceAlerts")}</h2>
          <div className={`transit-live-status transit-live-status-${liveTone}`}>
            <span aria-hidden="true" />
            <strong>{transit.status === "ready" ? tKey("transit.hslFeedActive") : tKey("transit.feedDelayed")}</strong>
          </div>
        </div>
        <div>{transit.source_code.toUpperCase()} / {exactObservedLabel(transit.observed_at, language, tKey)}</div>
      </div>

      <section className={`transit-glass-panel transit-command-panel transit-command-panel-${activeTone}`} aria-label={tKey("transit.transitAlertCondition")}>
        <div className="transit-command-status">
          <span className="material-symbols-outlined transit-condition-icon" aria-hidden="true">
            {riskState.icon}
          </span>
          <div>
            <div className="transit-card-kicker">
              <span>{tKey("transit.currentTransitRisk")}</span>
              <time>{exactObservedLabel(transit.observed_at, language, tKey)}</time>
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
            <strong>{nextActiveEndLabel(activeAlerts, language, tKey)}</strong>
          </div>
          <div>
            <span>{tKey("transit.scopedImpact")}</span>
            <strong>{metricValue(transit, "route_scoped")} {tKey("transit.routes2")} / {metricValue(transit, "stop_scoped")} {tKey("transit.stops2")}</strong>
          </div>
          <div>
            <span>{tKey("transit.coverage")}</span>
            <strong>{formatNumber(transit.quality.field_coverage_pct)}%</strong>
          </div>
        </div>
      </section>

      <section className="transit-summary-strip" aria-label={tKey("transit.transitSummaryMetrics")}>
        {transitSummaryMetrics.map(([key, labelKey]) => (
          <article className="transit-glass-panel" key={key}>
            <DataLabelWithHelp
              helpText={dataHelpText({
                key,
                label: tKey(`transit.${labelKey}`),
                language,
              })}
            >
              {tKey(`transit.${labelKey}`)}
            </DataLabelWithHelp>
            <strong>{metricValue(transit, key)}</strong>
          </article>
        ))}
      </section>

      <section className="transit-main-grid" aria-label={tKey("transit.transitAlertAnalytics")}>
        <article className="transit-glass-panel transit-alert-panel">
          <header>
            <div>
              <span>{tKey("transit.incidentTimeline")}</span>
              <h3>{tKey("transit.activeAndUpcomingServiceAlerts")}</h3>
            </div>
            <strong>{filteredAlerts.length} {tKey("transit.alerts")}</strong>
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
                  <span>{tKey(`transit.${filter.labelKey}`)}</span>
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
                          <TransitAlertStatusBadge alert={alert} language={language} tKey={tKey} />
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
                      <span className="transit-alert-dot" aria-hidden="true" />
                      <div className="transit-alert-main">
                        <div>
                          <div className="transit-alert-time-row">
                            <TransitAlertStatusBadge alert={alert} language={language} tKey={tKey} />
                            <span>{enumLabel(alert.severity)}</span>
                          </div>
                          <strong>{alert.title}</strong>
                          <p>{alert.description}</p>
                          <small className="transit-alert-scope-preview">{scopePreview(alert, tKey)}</small>
                        </div>
                        <em>{eventTypeLabel(alert.event_type)}</em>
                      </div>
                      <span className="transit-alert-window" aria-hidden="true">
                        <span style={{ width: `${alertWindowProgress(alert, nowTimestamp)}%` }} />
                      </span>
                      <div className="transit-alert-meta">
                        <span>{causeLabel(alert.cause, language, tKey)}</span>
                        <span>{effectLabel(alert.effect, language, tKey)}</span>
                        <span>{scopeLabel(alert, tKey)}</span>
                        <span>{tKey("transit.until")} {formatCompactTime(alert.ends_at, language, tKey)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>{filterEmptyMessage(alertFilter, tKey)}</p>
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
            </div>
            <aside className="transit-alert-inspector" aria-label={tKey("transit.incidentDetails")}>
              {selectedAlert ? (
                <section className={`transit-alert-detail transit-alert-detail-${severityTone(selectedAlert.severity)}`}>
                  <header>
                    <div>
                      <TransitAlertStatusBadge alert={selectedAlert} language={language} tKey={tKey} />
                      <strong>{selectedAlert.title}</strong>
                    </div>
                    <em>{enumLabel(selectedAlert.severity)}</em>
                  </header>
                  <p>{selectedAlert.description}</p>
                  <TransitAlertLiveLayer alert={selectedAlert} language={language} nowTimestamp={nowTimestamp} tKey={tKey} />
                  <div className="transit-alert-detail-meta">
                    <div>
                      <span>{tKey("transit.type")}</span>
                      <strong>{eventTypeLabel(selectedAlert.event_type)}</strong>
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
                  <p>{filterEmptyMessage(alertFilter, tKey)}</p>
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
            HSL GTFS-RT Service Alerts
          </span>
          <i aria-hidden="true" />
          <span>
            <span className="material-symbols-outlined" aria-hidden="true">
              sync
            </span>
            {tKey("transit.lastSync")}: {exactObservedLabel(transit.observed_at, language, tKey)}
          </span>
          <i aria-hidden="true" />
          <span className="transit-provider-coverage">{tKey("transit.coverage")}: {formatNumber(transit.quality.field_coverage_pct)}%</span>
        </div>
      </section>

      <p className="transit-detail-freshness">
        {transit.summary ?? category?.description ?? tKey("transit.latestNormalizedHslTransitServiceAlertSignals")}
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
                    <strong>{stage.label}</strong>
                    <span>{enumLabel(stage.status)}</span>
                  </div>
                  <p>
                    {stage.detail}
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
                    <strong>{request.label}</strong>
                    <span>{enumLabel(request.status)}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint, tKey)}
                    {request.fetched_at ? ` · ${tKey("transit.fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
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
                <p key={note}>{note}</p>
              ))}
            </div>
          </section>
        </div>
      </details>
    </section>
  );
}
