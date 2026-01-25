"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { formatRelativeAge } from "@/features/shared/format";

import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  TransitAlert,
  TransitCurrentResponse,
  TransitDataStage,
  TransitSourceRequest
} from "./types";
import { TrendChart, TrendChartPoint } from "./trend-chart";
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
const ALERTS_PER_PAGE = 8;
const HSL_STOP_DETAILS: Record<string, { address: string; code: string; name: string; zone: string }> = {
  "4180227": {
    address: "Martinkyläntie",
    code: "V1827",
    name: "Vantaankosken VPK",
    zone: "B"
  }
};
const ALERT_FILTERS: Array<{ icon: string; key: TransitAlertFilter; label: string }> = [
  { icon: "priority_high", key: "priority", label: "Priority" },
  { icon: "radio_button_checked", key: "active", label: "Active" },
  { icon: "schedule", key: "upcoming", label: "Upcoming" },
  { icon: "warning", key: "high", label: "High" },
  { icon: "route", key: "scoped", label: "Scoped" },
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

function clampPercent(value: number): number {
  return Math.max(6, Math.min(100, value));
}

function statusTone(status: string): TransitTone {
  if (status === "ready" || status === "fetched") {
    return "good";
  }
  if (status === "empty" || status === "missing" || status === "not_collected") {
    return "warn";
  }
  if (status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
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

function stopFacts(stopId: string, t: (value: string) => string): TransitScopeFact[] {
  const stop = HSL_STOP_DETAILS[stopId];
  if (!stop) {
    return [{ label: t("Stop ID"), value: stopId }];
  }

  return [
    { value: stop.address },
    { value: stop.code },
    { label: t("Zone"), value: stop.zone },
    { label: t("Stop ID"), value: stopId }
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

function transitScopeMetrics(alerts: TransitAlert[], t: (value: string) => string): TransitScopeMetric[] {
  const rows = [
    {
      key: "routes",
      label: t("Routes"),
      count: uniqueScopeCount(alerts, "route_ids"),
      detail: `${alerts.filter((alert) => alert.route_ids.length > 0).length} ${t("alerts")}`,
      tone: "warn" as TransitTone
    },
    {
      key: "stops",
      label: t("Stops"),
      count: uniqueScopeCount(alerts, "stop_ids"),
      detail: `${alerts.filter((alert) => alert.stop_ids.length > 0).length} ${t("alerts")}`,
      tone: "bad" as TransitTone
    },
    {
      key: "trips",
      label: t("Trips"),
      count: uniqueScopeCount(alerts, "trip_ids"),
      detail: `${alerts.filter((alert) => alert.trip_ids.length > 0).length} ${t("alerts")}`,
      tone: "good" as TransitTone
    },
    {
      key: "network",
      label: t("Network-wide"),
      count: alerts.filter((alert) => !isScopedAlert(alert)).length,
      detail: t("no ids attached"),
      tone: "neutral" as TransitTone
    }
  ];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return rows.map((row) => ({
    ...row,
    width: clampPercent((row.count / maxCount) * 100)
  }));
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

function effectLabel(value: string | null, language: LanguageMode, t: (value: string) => string): string {
  return value ? translateEnumLabel(language, value) : t("effect unavailable");
}

function causeLabel(value: string | null, language: LanguageMode, t: (value: string) => string): string {
  return value ? translateEnumLabel(language, value) : t("cause unavailable");
}

function scopeLabel(alert: TransitAlert, t: (value: string) => string): string {
  const scopes = [];
  if (alert.route_ids.length > 0) {
    scopes.push(`${alert.route_ids.length} ${t("routes")}`);
  }
  if (alert.stop_ids.length > 0) {
    scopes.push(`${alert.stop_ids.length} ${t("stops")}`);
  }
  if (alert.trip_ids.length > 0) {
    scopes.push(`${alert.trip_ids.length} ${t("trips")}`);
  }

  return scopes.length > 0 ? scopes.join(" / ") : t("network-wide");
}

function scopePreview(alert: TransitAlert, t: (value: string) => string): string {
  const scopes = [];
  if (alert.route_ids.length > 0) {
    scopes.push(`${t("routes")} ${alert.route_ids.slice(0, 4).join(", ")}${alert.route_ids.length > 4 ? " +" : ""}`);
  }
  if (alert.stop_ids.length > 0) {
    const stopNames = alert.stop_ids.slice(0, 3).map(stopLabel);
    scopes.push(`${t("stops")} ${stopNames.join(", ")}${alert.stop_ids.length > 3 ? " +" : ""}`);
  }
  if (alert.trip_ids.length > 0) {
    scopes.push(`${alert.trip_ids.length} ${t("trips")}`);
  }

  return scopes.length > 0 ? scopes.join(" / ") : t("network-wide alert");
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

function filterEmptyMessage(filter: TransitAlertFilter, t: (value: string) => string): string {
  if (filter === "priority") {
    return t("No priority transit alerts are active or upcoming.");
  }
  if (filter === "active") {
    return t("No transit alerts are active right now.");
  }
  if (filter === "upcoming") {
    return t("No upcoming transit alerts were normalized from the latest feed.");
  }
  if (filter === "high") {
    return t("No high-severity transit alerts were normalized from the latest feed.");
  }
  if (filter === "scoped") {
    return t("No route, stop, or trip-scoped transit alerts were normalized.");
  }

  return t("No transit alerts were normalized from the latest HSL feed.");
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

function nextActiveEndLabel(activeAlerts: TransitAlert[], language: LanguageMode, t: (value: string) => string): string {
  if (activeAlerts.length === 0) {
    return t("no active window");
  }

  const nextEndingAlert = [...activeAlerts].sort(
    (left, right) => new Date(left.ends_at).getTime() - new Date(right.ends_at).getTime()
  )[0];

  return `${t("until")} ${formatCompactTime(nextEndingAlert.ends_at, language, t)}`;
}

function transitRiskState(activeAlerts: TransitAlert[], allAlerts: TransitAlert[], t: (value: string) => string) {
  const highActive = activeAlerts.filter(isHighSeverity).length;
  const highUpcoming = allAlerts.filter((alert) => !alert.active && isHighSeverity(alert)).length;

  if (highActive > 0) {
    return {
      detail: `${highActive} high-severity alert${highActive === 1 ? "" : "s"} active now across the HSL feed.`,
      icon: "warning",
      title: t("High impact active")
    };
  }

  if (activeAlerts.length > 0) {
    return {
      detail: `${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"} may affect route choice or timing.`,
      icon: "directions_bus",
      title: t("Service alerts active")
    };
  }

  if (highUpcoming > 0) {
    return {
      detail: `${highUpcoming} high-severity alert${highUpcoming === 1 ? "" : "s"} are scheduled or pending in the feed.`,
      icon: "schedule",
      title: t("High impact upcoming")
    };
  }

  return {
    detail: allAlerts.length > 0 ? t("No active alerts right now; monitor upcoming feed items.") : t("No active service alerts in the latest HSL feed."),
    icon: "check_circle",
    title: t("Network clear")
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

function scopeSummary(alert: TransitAlert, t: (value: string) => string): string {
  const scopes = [
    alert.route_ids.length > 0 ? `${alert.route_ids.length} ${t("routes")}` : null,
    alert.stop_ids.length > 0 ? `${alert.stop_ids.length} ${t("stops")}` : null,
    alert.trip_ids.length > 0 ? `${alert.trip_ids.length} ${t("trips")}` : null
  ].filter((item): item is string => item !== null);

  return scopes.length > 0 ? scopes.join(" / ") : t("network-wide");
}

function detailScopeItems(alert: TransitAlert, t: (value: string) => string): TransitScopeDetailItem[] {
  return [
    {
      key: "routes",
      label: t("Routes affected"),
      icon: "route",
      values: alert.route_ids.map((routeId) => {
        const facts = [{ label: t("Route ID"), value: routeId }];
        return {
          id: routeId,
          label: routeId,
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: t("No routes attached")
    },
    {
      key: "stops",
      label: t("Stops affected"),
      icon: "pin_drop",
      values: alert.stop_ids.map((stopId) => {
        const facts = stopFacts(stopId, t);
        return {
          id: stopId,
          label: stopLabel(stopId),
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: t("No stops attached")
    },
    {
      key: "trips",
      label: t("Trips affected"),
      icon: "confirmation_number",
      values: alert.trip_ids.map((tripId) => {
        const facts = [{ label: t("Trip ID"), value: tripId }];
        return {
          id: tripId,
          label: tripId,
          facts,
          meta: scopeFactsLabel(facts)
        };
      }),
      empty: t("No trips attached")
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
  t
}: {
  alert: TransitAlert;
  language: LanguageMode;
  t: (value: string) => string;
}) {
  return (
    <span className={alert.active ? "transit-alert-status transit-alert-status-active" : "transit-alert-status"}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {alert.active ? "radio_button_checked" : "schedule"}
      </span>
      <span>{alert.active ? t("ACTIVE NOW") : formatCompactTime(alert.starts_at, language, t)}</span>
    </span>
  );
}

function TransitAlertLiveLayer({
  alert,
  language,
  nowTimestamp,
  t
}: {
  alert: TransitAlert;
  language: LanguageMode;
  nowTimestamp: number;
  t: (value: string) => string;
}) {
  const progress = alertWindowProgress(alert, nowTimestamp);

  return (
    <section
      className={alert.active ? "transit-alert-live-layer transit-alert-live-layer-active" : "transit-alert-live-layer"}
      aria-label={t("Alert status")}
    >
      <div className="transit-alert-live-copy">
        <TransitAlertStatusBadge alert={alert} language={language} t={t} />
        <div>
          <strong>{alert.active ? t("In effect") : t("Scheduled")}</strong>
          <span>
            {alert.active
              ? `${t("until")} ${formatCompactTime(alert.ends_at, language, t)}`
              : `${t("Starts")} ${formatCompactTime(alert.starts_at, language, t)}`}
          </span>
        </div>
      </div>
      <span className="transit-alert-live-meter" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
      <dl className="transit-alert-live-facts">
        <div>
          <dt>{t("Window")}</dt>
          <dd>{formatCompactTime(alert.starts_at, language, t)} - {formatCompactTime(alert.ends_at, language, t)}</dd>
        </div>
        <div>
          <dt>{t("Impact scope")}</dt>
          <dd>{scopeSummary(alert, t)}</dd>
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
  const { language, t } = useI18n();
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
      <section className="transit-detail-empty" aria-label={t("Transit data unavailable")}>
        <span>{t("Transit")}</span>
        <h2>{t("Transit service alerts are not available yet")}</h2>
        <p>{t("Digitransit/HSL service alert data has not arrived for the current platform window.")}</p>
      </section>
    );
  }

  const nowTimestamp = transitReferenceTimestamp(transit);
  const activeTone = activeAlertTone(activeAlerts, transit.alerts);
  const riskState = transitRiskState(activeAlerts, transit.alerts, t);
  const alertPageCount = Math.max(1, Math.ceil(filteredAlerts.length / ALERTS_PER_PAGE));
  const currentAlertPage = Math.min(alertPage, alertPageCount - 1);
  const pageStartIndex = currentAlertPage * ALERTS_PER_PAGE;
  const pagedAlerts = filteredAlerts.slice(pageStartIndex, pageStartIndex + ALERTS_PER_PAGE);
  const pageRangeLabel = filteredAlerts.length > 0
    ? `${pageStartIndex + 1}-${pageStartIndex + pagedAlerts.length}/${filteredAlerts.length}`
    : "0/0";
  const selectedAlert = (selectedAlertId
    ? pagedAlerts.find((alert) => alert.id === selectedAlertId)
    : null) ?? pagedAlerts[0] ?? null;
  const timebandAlerts = pagedAlerts;
  const timebandBounds = alertTimelineBounds(timebandAlerts, nowTimestamp);
  const severityRows = severityDistribution(transit.alerts);
  const scopeRows = transitScopeMetrics(transit.alerts, t);
  const readyPipelineCount = transit.data_pipeline.filter((stage) => stage.status === "ready").length;
  const fetchedSourceCount = transit.source_requests.filter((request) => request.status === "fetched").length;
  const historyPoints = transitHistoryPoints(history);

  return (
    <section className="transit-detail-page" aria-label={t("Transit detail")}>
      <div className="transit-detail-header">
        <div>
          <h2>{t("Helsinki Transit Service Alerts")}</h2>
          <div className="transit-live-status">
            <span aria-hidden="true" />
            <strong>{transit.status === "ready" ? t("HSL Feed Active") : t("Feed Delayed")}</strong>
          </div>
        </div>
        <div>{transit.source_code.toUpperCase()} / {transit.observed_at ? formatRelativeAge(transit.observed_at, language) : t("not observed")}</div>
      </div>

      <section className="transit-bento-grid" aria-label={t("Transit alert condition")}>
        <article className={`transit-glass-panel transit-hero transit-hero-${activeTone}`}>
          <div className="transit-card-kicker">
            <span>{t("Current Transit Risk")}</span>
            <time>{transit.observed_at ? formatRelativeAge(transit.observed_at, language) : t("not observed")}</time>
          </div>
          <div className="transit-current-cluster">
            <span className="material-symbols-outlined transit-condition-icon" aria-hidden="true">
              {riskState.icon}
            </span>
            <div>
              <span className="transit-risk-label">{riskState.title}</span>
              <strong>{transit.quality.active_alert_count}</strong>
              <p>{riskState.detail}</p>
            </div>
          </div>
          <div className="transit-hero-footer">
            <div>
              <span>{t("Highest Severity")}</span>
              <strong>{t(highestSeverityLabel(transit.alerts))}</strong>
            </div>
            <div>
              <span>{t("Next Clear")}</span>
              <strong>{nextActiveEndLabel(activeAlerts, language, t)}</strong>
            </div>
            <div>
              <span>{t("Scoped Impact")}</span>
              <strong>{metricValue(transit, "route_scoped")} {t("routes")} / {metricValue(transit, "stop_scoped")} {t("stops")}</strong>
            </div>
          </div>
        </article>

        <article className="transit-glass-panel transit-severity-panel">
          <header>
            <span>{t("Severity Mix")}</span>
            <strong>{transit.alerts.length}</strong>
          </header>
          <div className="transit-severity-bars">
            {severityRows.map((row) => (
              <div className={`transit-severity-row transit-severity-row-${severityTone(row.severity)}`} key={row.severity}>
                <span>{t(row.severity)}</span>
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
            <span>{t("Alert Scope")}</span>
            <strong>{transit.quality.field_coverage_pct.toFixed(0)}%</strong>
          </header>
          <div className="transit-scope-grid">
            <article>
              <span>{t("Route scoped")}</span>
              <strong>{transit.quality.route_alert_count}</strong>
              <small>{t("alerts include route ids")}</small>
            </article>
            <article>
              <span>{t("Stop scoped")}</span>
              <strong>{transit.quality.stop_alert_count}</strong>
              <small>{t("alerts include stop ids")}</small>
            </article>
            <article>
              <span>{t("Raw decoded")}</span>
              <strong>{transit.quality.raw_alert_count}</strong>
              <small>{t("GTFS-RT alert entities")}</small>
            </article>
            <article>
              <span>{t("Normalized")}</span>
              <strong>{transit.quality.normalized_event_count}</strong>
              <small>{t("stored event rows")}</small>
            </article>
          </div>
          <div className="transit-scope-bars" aria-label={t("Transit affected scope distribution")}>
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

      <section className="transit-summary-strip" aria-label={t("Transit summary metrics")}>
        {[
          ["active_alerts", "Active Now"],
          ["high_severity", "High Severity"],
          ["disruptions", "Disruptions"],
          ["delays", "Delays"],
          ["route_scoped", "Route Scoped"],
          ["raw_alerts", "Raw Feed"]
        ].map(([key, label]) => (
          <article className="transit-glass-panel" key={key}>
            <span>{t(label)}</span>
            <strong>{metricValue(transit, key)}</strong>
          </article>
        ))}
      </section>

      <section className="transit-main-grid" aria-label={t("Transit alert analytics")}>
        <article className="transit-glass-panel transit-alert-panel">
          <header>
            <div>
              <span>{t("Incident Timeline")}</span>
              <h3>{t("Active and upcoming service alerts")}</h3>
            </div>
            <strong>{pageRangeLabel}</strong>
          </header>
          <div className="transit-alert-toolbar">
            <div className="transit-alert-filters" aria-label={t("Transit alert filters")}>
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
                  <span>{t(filter.label)}</span>
                </button>
              ))}
            </div>
            <div className="transit-alert-pager" aria-label={t("Transit alert pagination")}>
              <span>
                {t("Page")} {filteredAlerts.length > 0 ? currentAlertPage + 1 : 0}/{filteredAlerts.length > 0 ? alertPageCount : 0}
              </span>
              <div>
                <button
                  aria-label={t("Previous alert page")}
                  disabled={currentAlertPage === 0}
                  onClick={() => setAlertPage((page) => Math.max(0, page - 1))}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    chevron_left
                  </span>
                </button>
                <button
                  aria-label={t("Next alert page")}
                  disabled={currentAlertPage >= alertPageCount - 1 || filteredAlerts.length === 0}
                  onClick={() => setAlertPage((page) => Math.min(alertPageCount - 1, page + 1))}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className="transit-alert-layout">
            <div className="transit-alert-list-column">
              {timebandAlerts.length > 0 && timebandBounds ? (
                <div className="transit-timeband-panel" aria-label={t("Transit alert time windows")}>
                  <header>
                    <span>{t("Time Windows")}</span>
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
                          <TransitAlertStatusBadge alert={alert} language={language} t={t} />
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
                          <strong>{scopeLabel(alert, t)}</strong>
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
                            <TransitAlertStatusBadge alert={alert} language={language} t={t} />
                            <span>{t(alert.severity)}</span>
                          </div>
                          <strong>{alert.title}</strong>
                          <p>{alert.description}</p>
                          <small className="transit-alert-scope-preview">{scopePreview(alert, t)}</small>
                        </div>
                        <em>{eventTypeLabel(alert.event_type)}</em>
                      </div>
                      <span className="transit-alert-window" aria-hidden="true">
                        <span style={{ width: `${alertWindowProgress(alert, nowTimestamp)}%` }} />
                      </span>
                      <div className="transit-alert-meta">
                        <span>{causeLabel(alert.cause, language, t)}</span>
                        <span>{effectLabel(alert.effect, language, t)}</span>
                        <span>{scopeLabel(alert, t)}</span>
                        <span>{t("until")} {formatCompactTime(alert.ends_at, language, t)}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>{filterEmptyMessage(alertFilter, t)}</p>
                )}
              </div>
            </div>
            <aside className="transit-alert-inspector" aria-label={t("Incident details")}>
              {selectedAlert ? (
                <section className={`transit-alert-detail transit-alert-detail-${severityTone(selectedAlert.severity)}`}>
                  <header>
                    <div>
                      <TransitAlertStatusBadge alert={selectedAlert} language={language} t={t} />
                      <strong>{selectedAlert.title}</strong>
                    </div>
                    <em>{t(selectedAlert.severity)}</em>
                  </header>
                  <p>{selectedAlert.description}</p>
                  <TransitAlertLiveLayer alert={selectedAlert} language={language} nowTimestamp={nowTimestamp} t={t} />
                  <div className="transit-alert-detail-meta">
                    <div>
                      <span>{t("Type")}</span>
                      <strong>{eventTypeLabel(selectedAlert.event_type)}</strong>
                    </div>
                    <div>
                      <span>{t("Cause")}</span>
                      <strong>{causeLabel(selectedAlert.cause, language, t)}</strong>
                    </div>
                    <div>
                      <span>{t("Effect")}</span>
                      <strong>{effectLabel(selectedAlert.effect, language, t)}</strong>
                    </div>
                  </div>
                  <div className="transit-alert-detail-scope">
                    {detailScopeItems(selectedAlert, t).map((item) => (
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
                      <span>{t("Incident details")}</span>
                      <strong>{t("No selected event")}</strong>
                    </div>
                  </header>
                  <p>{filterEmptyMessage(alertFilter, t)}</p>
                </section>
              )}
            </aside>
          </div>
        </article>
      </section>

      <TrendChart
        className="transit-glass-panel"
        emptyMessage={t("No daily transit alert history is available.")}
        eyebrow={`${historyPoints.length}D ${t("HISTORY")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={t("Daily Alert Event Trend")}
        tone={activeTone}
        unit={t("events")}
      />

      <section className="transit-provider-status" aria-label={t("Transit provider status")}>
        <div>
          <span aria-hidden="true" />
          <strong>{t("Provider Status")}</strong>
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
            {t("Last Sync")}: {transit.observed_at ? formatRelativeAge(transit.observed_at, language) : t("not observed")}
          </span>
          <i aria-hidden="true" />
          <span className="transit-provider-coverage">{t("Coverage")}: {formatNumber(transit.quality.field_coverage_pct)}%</span>
        </div>
      </section>

      <p className="transit-detail-freshness">
        {transit.summary ?? category?.description ?? t("Latest normalized HSL transit service alert signals.")}
      </p>

      <details className="transit-glass-panel transit-diagnostics-panel">
        <summary>
          <div>
            <span>{t("Diagnostics")}</span>
            <strong>{readyPipelineCount}/{transit.data_pipeline.length} {t("stages")} · {fetchedSourceCount}/{transit.source_requests.length} {t("sources")}</strong>
          </div>
          <span className="material-symbols-outlined" aria-hidden="true">
            expand_more
          </span>
        </summary>
        <div className="transit-diagnostics-body">
          <section className="transit-diagnostic-section transit-pipeline-panel">
            <header>
              <span>{t("Pipeline")}</span>
              <strong>{readyPipelineCount}/{transit.data_pipeline.length}</strong>
            </header>
            <div>
              {transit.data_pipeline.map((stage) => (
                <article className={`transit-stage transit-stage-${statusTone(stage.status)}`} key={stage.key}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{t(stage.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} ${t("records")}` : ""}
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
              <span>{t("Source Request")}</span>
              <strong>{fetchedSourceCount}/{transit.source_requests.length}</strong>
            </header>
            <div>
              {transit.source_requests.map((request: TransitSourceRequest) => (
                <article className={`transit-request transit-request-${statusTone(request.status)}`} key={request.key}>
                  <div>
                    <strong>{request.label}</strong>
                    <span>{t(request.status.replaceAll("_", " "))}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint, t)}
                    {request.fetched_at ? ` · ${t("fetched")} ${formatRelativeAge(request.fetched_at, language)}` : ""}
                  </p>
                  <small>{request.content_type ?? t("content type unavailable")}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="transit-diagnostic-section transit-quality-notes">
            <header>
              <span>{t("Quality Notes")}</span>
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
