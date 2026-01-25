"use client";

import type { CSSProperties } from "react";

import { formatRelativeAge } from "@/features/shared/format";

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
import { TrendChart, TrendChartPoint } from "./trend-chart";

type RoadRailWorkspaceProps = {
  category: PlatformCategory | null;
  history: PlatformHistoricalSnapshot<RoadRailCurrentResponse>[];
  roadRail: RoadRailCurrentResponse | null;
};

type RoadRailTone = "good" | "warn" | "bad" | "neutral";
type RoadRailNetworkMetric = {
  key: string;
  label: string;
  detail: string;
  count: number;
  tone: RoadRailTone;
  width: number;
};

type RoadRailTimelineBounds = {
  startsAt: number;
  endsAt: number;
};

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const SEVERITY_LABELS = ["HIGH", "MEDIUM", "LOW", "INFO"];
const MIN_TIMELINE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_TIMELINE_WINDOW_MS = 60 * 60 * 1000;

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
  if (status === "empty" || status === "missing" || status === "planned") {
    return "warn";
  }
  if (status === "failed" || status === "error") {
    return "bad";
  }
  return "neutral";
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

function bboxLabel(bbox: number[] | null, t: (value: string) => string): string {
  if (!bbox || bbox.length !== 4) {
    return t("bbox unavailable");
  }

  return bbox.map((value) => value.toFixed(2)).join(" / ");
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

export function RoadRailWorkspace({ category, history, roadRail }: RoadRailWorkspaceProps) {
  const { language, t } = useI18n();

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
  const topIncidents = roadRail.incidents.slice(0, 8);
  const topCorridors = roadRail.corridors.slice(0, 5);
  const maxCorridorEvents = Math.max(1, ...topCorridors.map((corridor) => corridor.event_count));
  const severityRows = severityDistribution(roadRail.incidents);
  const networkRows = networkCompositionRows(roadRail, t);
  const historyPoints = roadRailHistoryPoints(history, t);
  const timebandIncidents = topIncidents.slice(0, 5);
  const timelineBounds = incidentTimelineBounds(timebandIncidents, Date.now());

  return (
    <section className="road-rail-detail-page" aria-label={t("Road and rail detail")}>
      <div className="road-rail-detail-header">
        <div>
          <h2>{t("Road & Rail Operations")}</h2>
          <div className="road-rail-live-status">
            <span aria-hidden="true" />
            <strong>{roadRail.status === "ready" ? t("Digitraffic Active") : t("Feed Delayed")}</strong>
          </div>
        </div>
        <div>
          {roadRail.source_code.toUpperCase()} /{" "}
          {roadRail.observed_at ? formatRelativeAge(roadRail.observed_at, language) : t("not observed")}
        </div>
      </div>

      <section className="road-rail-bento-grid" aria-label={t("Road and rail condition")}>
        <article className={`road-rail-glass-panel road-rail-hero road-rail-hero-${activeTone}`}>
          <div className="road-rail-card-kicker">
            <span>{t("Active Load")}</span>
            <time>{roadRail.observed_at ? formatRelativeAge(roadRail.observed_at, language) : t("not observed")}</time>
          </div>
          <div className="road-rail-current-cluster">
            <span className="material-symbols-outlined road-rail-condition-icon" aria-hidden="true">
              {activeTone === "bad" ? "warning" : "traffic"}
            </span>
            <div>
              <strong>{roadRail.quality.active_event_count}</strong>
              <p>{activeIncidents.length > 0 ? t("Active corridor events") : t("No active road events")}</p>
            </div>
          </div>
          <div className="road-rail-hero-footer">
            <div>
              <span>{t("Road")}</span>
              <strong>{metricValue(roadRail, "road_disruptions")}</strong>
            </div>
            <div>
              <span>{t("Rail")}</span>
              <strong>{metricValue(roadRail, "rail_events")}</strong>
            </div>
            <div>
              <span>{t("Weather")}</span>
              <strong>{metricValue(roadRail, "road_weather")}</strong>
            </div>
          </div>
        </article>

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
        </article>
      </section>

      <section className="road-rail-summary-strip" aria-label={t("Road and rail summary metrics")}>
        {[
          ["raw_messages", "Raw Messages"],
          ["active_events", "Active Now"],
          ["road_disruptions", "Road Events"],
          ["road_weather", "Weather Risk"],
          ["corridors", "Corridors"],
          ["rail_events", "Rail Events"]
        ].map(([key, label]) => (
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

      <TrendChart
        className="road-rail-glass-panel"
        emptyMessage={t("No daily road and rail history is available.")}
        eyebrow={`${historyPoints.length}D ${t("History")}`}
        maximumFractionDigits={0}
        points={historyPoints}
        title={t("Daily Road and Rail Event Trend")}
        tone={activeTone}
        unit={t("events")}
      />

      <section className="road-rail-main-grid" aria-label={t("Road and rail analytics")}>
        <article className="road-rail-glass-panel road-rail-incident-panel">
          <header>
            <div>
              <span>{t("Incident Timeline")}</span>
              <h3>{t("Active and upcoming road events")}</h3>
            </div>
            <strong>{topIncidents.length} {t("rows")}</strong>
          </header>
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
                      <span>{incident.active ? t("ACTIVE NOW") : formatCompactTime(incident.starts_at, language, t)}</span>
                      <i aria-hidden="true">
                        <span style={bandStyle} />
                      </i>
                      <strong>{incident.location_ref.replaceAll("-", " ")}</strong>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="road-rail-incident-list">
            {topIncidents.length > 0 ? (
              topIncidents.map((incident) => (
                <article className={`road-rail-incident road-rail-incident-${severityTone(incident.severity)}`} key={incident.id}>
                  <span className="road-rail-incident-dot" aria-hidden="true" />
                  <div className="road-rail-incident-main">
                    <div>
                      <time>{incident.active ? t("ACTIVE NOW") : formatCompactTime(incident.starts_at, language, t)}</time>
                      <strong>{incident.title}</strong>
                      <p>{incident.description}</p>
                    </div>
                    <em>{eventTypeLabel(incident.event_type, language)}</em>
                  </div>
                  <div className="road-rail-incident-meta">
                    <span>{messageTypeLabel(incident.message_type, language, t)}</span>
                    <span>{incident.location_ref.replaceAll("-", " ")}</span>
                    <span>{t("until")} {formatCompactTime(incident.ends_at, language, t)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p>{t("No road or rail events were normalized from the latest Digitraffic payload.")}</p>
            )}
          </div>
        </article>

        <div className="road-rail-side-grid">
          <article className="road-rail-glass-panel road-rail-corridor-panel">
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
          </article>

          <article className="road-rail-glass-panel road-rail-quality-panel">
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
          </article>

          <article className="road-rail-glass-panel road-rail-pipeline-panel">
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
              <strong>
                {roadRail.data_pipeline.filter((stage) => stage.status === "ready").length}/
                {roadRail.data_pipeline.length}
              </strong>
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
          </article>

          <article className="road-rail-glass-panel road-rail-source-panel">
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
              <strong>
                {roadRail.source_requests.filter((request) => request.status === "fetched").length}/
                {roadRail.source_requests.length}
              </strong>
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
          </article>
        </div>
      </section>

      <section className="road-rail-provider-status" aria-label={t("Road and rail provider status")}>
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
            {t("Last Sync")}: {roadRail.observed_at ? formatRelativeAge(roadRail.observed_at, language) : t("not observed")}
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
    </section>
  );
}
