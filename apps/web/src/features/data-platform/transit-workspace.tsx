import { formatRelativeAge } from "@/features/shared/format";

import {
  PlatformCategory,
  TransitAlert,
  TransitCurrentResponse,
  TransitDataStage,
  TransitSourceRequest
} from "./types";

type TransitWorkspaceProps = {
  category: PlatformCategory | null;
  transit: TransitCurrentResponse | null;
};

type TransitTone = "good" | "warn" | "bad" | "neutral";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const SEVERITY_LABELS = ["HIGH", "MEDIUM", "LOW", "INFO"];

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "missing";
  }

  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatCompactTime(value: string | null | undefined): string {
  if (!value) {
    return "not observed";
  }

  return new Intl.DateTimeFormat("en-GB", {
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

function eventTypeLabel(value: string): string {
  return value.replace(/^transit_/, "").replaceAll("_", " ");
}

function metricValue(transit: TransitCurrentResponse, key: string): string {
  const metric = transit.metrics.find((item) => item.key === key);
  return metric ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "0";
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

function sourceRequestHost(endpoint: string | null): string {
  if (!endpoint) {
    return "endpoint not recorded";
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function effectLabel(value: string | null): string {
  return value ? value.replaceAll("_", " ") : "effect unavailable";
}

function scopeLabel(alert: TransitAlert): string {
  const scopes = [];
  if (alert.route_ids.length > 0) {
    scopes.push(`${alert.route_ids.length} routes`);
  }
  if (alert.stop_ids.length > 0) {
    scopes.push(`${alert.stop_ids.length} stops`);
  }
  if (alert.trip_ids.length > 0) {
    scopes.push(`${alert.trip_ids.length} trips`);
  }

  return scopes.length > 0 ? scopes.join(" / ") : "network-wide";
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

function activeAlertTone(transit: TransitCurrentResponse): TransitTone {
  if (Number(metricValue(transit, "high_severity")) > 0) {
    return "bad";
  }
  if (transit.quality.active_alert_count > 0) {
    return "warn";
  }
  return "good";
}

export function TransitWorkspace({ category, transit }: TransitWorkspaceProps) {
  if (!transit) {
    return (
      <section className="transit-detail-empty" aria-label="Transit data unavailable">
        <span>Transit</span>
        <h2>Transit service alerts are not available yet</h2>
        <p>Digitransit/HSL service alert data has not arrived for the current platform window.</p>
      </section>
    );
  }

  const activeTone = activeAlertTone(transit);
  const activeAlerts = transit.alerts.filter((alert) => alert.active);
  const topAlerts = transit.alerts.slice(0, 8);
  const severityRows = severityDistribution(transit.alerts);

  return (
    <section className="transit-detail-page" aria-label="Transit detail">
      <div className="transit-detail-header">
        <div>
          <h2>Helsinki Transit Service Alerts</h2>
          <div className="transit-live-status">
            <span aria-hidden="true" />
            <strong>{transit.status === "ready" ? "HSL Feed Active" : "Feed Delayed"}</strong>
          </div>
        </div>
        <div>{transit.source_code.toUpperCase()} / {transit.observed_at ? formatRelativeAge(transit.observed_at) : "not observed"}</div>
      </div>

      <section className="transit-bento-grid" aria-label="Transit alert condition">
        <article className={`transit-glass-panel transit-hero transit-hero-${activeTone}`}>
          <div className="transit-card-kicker">
            <span>Current Alert Load</span>
            <time>{transit.observed_at ? formatRelativeAge(transit.observed_at) : "not observed"}</time>
          </div>
          <div className="transit-current-cluster">
            <span className="material-symbols-outlined transit-condition-icon" aria-hidden="true">
              {activeTone === "bad" ? "warning" : "directions_bus"}
            </span>
            <div>
              <strong>{transit.quality.active_alert_count}</strong>
              <p>{activeAlerts.length > 0 ? "Active alerts in HSL service feed" : "No active service alerts"}</p>
            </div>
          </div>
          <div className="transit-hero-footer">
            <div>
              <span>Disruptions</span>
              <strong>{metricValue(transit, "disruptions")}</strong>
            </div>
            <div>
              <span>Delays</span>
              <strong>{metricValue(transit, "delays")}</strong>
            </div>
          </div>
        </article>

        <article className="transit-glass-panel transit-severity-panel">
          <header>
            <span>Severity Mix</span>
            <strong>{transit.alerts.length}</strong>
          </header>
          <div className="transit-severity-bars">
            {severityRows.map((row) => (
              <div className={`transit-severity-row transit-severity-row-${severityTone(row.severity)}`} key={row.severity}>
                <span>{row.severity}</span>
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
            <span>Alert Scope</span>
            <strong>{transit.quality.field_coverage_pct.toFixed(0)}%</strong>
          </header>
          <div className="transit-scope-grid">
            <article>
              <span>Route scoped</span>
              <strong>{transit.quality.route_alert_count}</strong>
              <small>alerts include route ids</small>
            </article>
            <article>
              <span>Stop scoped</span>
              <strong>{transit.quality.stop_alert_count}</strong>
              <small>alerts include stop ids</small>
            </article>
            <article>
              <span>Raw decoded</span>
              <strong>{transit.quality.raw_alert_count}</strong>
              <small>GTFS-RT alert entities</small>
            </article>
            <article>
              <span>Normalized</span>
              <strong>{transit.quality.normalized_event_count}</strong>
              <small>stored event rows</small>
            </article>
          </div>
        </article>
      </section>

      <section className="transit-summary-strip" aria-label="Transit summary metrics">
        {[
          ["raw_alerts", "Raw Alerts"],
          ["active_alerts", "Active Now"],
          ["high_severity", "High Severity"],
          ["route_scoped", "Route Scoped"],
          ["stop_scoped", "Stop Scoped"]
        ].map(([key, label]) => (
          <article className="transit-glass-panel" key={key}>
            <span>{label}</span>
            <strong>{metricValue(transit, key)}</strong>
          </article>
        ))}
      </section>

      <section className="transit-main-grid" aria-label="Transit alert analytics">
        <article className="transit-glass-panel transit-alert-panel">
          <header>
            <div>
              <span>Alert Timeline</span>
              <h3>Active and upcoming service alerts</h3>
            </div>
            <strong>{topAlerts.length} rows</strong>
          </header>
          <div className="transit-alert-list">
            {topAlerts.length > 0 ? (
              topAlerts.map((alert) => (
                <article className={`transit-alert transit-alert-${severityTone(alert.severity)}`} key={alert.id}>
                  <span className="transit-alert-dot" aria-hidden="true" />
                  <div className="transit-alert-main">
                    <div>
                      <time>{alert.active ? "ACTIVE NOW" : formatCompactTime(alert.starts_at)}</time>
                      <strong>{alert.title}</strong>
                      <p>{alert.description}</p>
                    </div>
                    <em>{eventTypeLabel(alert.event_type)}</em>
                  </div>
                  <div className="transit-alert-meta">
                    <span>{effectLabel(alert.effect)}</span>
                    <span>{scopeLabel(alert)}</span>
                    <span>until {formatCompactTime(alert.ends_at)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p>No transit alerts were normalized from the latest HSL feed.</p>
            )}
          </div>
        </article>

        <div className="transit-side-grid">
          <article className="transit-glass-panel transit-quality-panel">
            <header>
              <span>Data Quality</span>
              <strong>{formatNumber(transit.quality.field_coverage_pct)}%</strong>
            </header>
            <span className="transit-quality-meter" aria-hidden="true">
              <span style={{ width: `${transit.quality.field_coverage_pct}%` }} />
            </span>
            <div className="transit-quality-facts">
              <span>{transit.quality.raw_alert_count} raw alerts</span>
              <span>{transit.quality.normalized_event_count} events</span>
              <span>{transit.quality.missing_fields.length} missing fields</span>
            </div>
            <p>
              {transit.quality.missing_fields.length > 0
                ? `Missing fields: ${transit.quality.missing_fields.join(", ")}.`
                : "All tracked raw alert fields are present."}
            </p>
            {transit.quality.notes.map((note) => (
              <small key={note}>{note}</small>
            ))}
          </article>

          <article className="transit-glass-panel transit-pipeline-panel">
            <header>
              <span>Pipeline</span>
              <strong>
                {transit.data_pipeline.filter((stage) => stage.status === "ready").length}/
                {transit.data_pipeline.length}
              </strong>
            </header>
            <div>
              {transit.data_pipeline.map((stage) => (
                <article className={`transit-stage transit-stage-${statusTone(stage.status)}`} key={stage.key}>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{stage.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>
                    {stage.detail}
                    {stage.record_count !== null ? ` · ${stage.record_count} records` : ""}
                  </p>
                  <span className="transit-stage-meter" aria-hidden="true">
                    <span style={{ width: `${stageProgress(stage)}%` }} />
                  </span>
                </article>
              ))}
            </div>
          </article>

          <article className="transit-glass-panel transit-source-panel">
            <header>
              <span>Source Request</span>
              <strong>{transit.source_requests.filter((request) => request.status === "fetched").length}/{transit.source_requests.length}</strong>
            </header>
            <div>
              {transit.source_requests.map((request: TransitSourceRequest) => (
                <article className={`transit-request transit-request-${statusTone(request.status)}`} key={request.key}>
                  <div>
                    <strong>{request.label}</strong>
                    <span>{request.status.replaceAll("_", " ")}</span>
                  </div>
                  <p>
                    {sourceRequestHost(request.endpoint)}
                    {request.fetched_at ? ` · fetched ${formatRelativeAge(request.fetched_at)}` : ""}
                  </p>
                  <small>{request.content_type ?? "content type unavailable"}</small>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="transit-provider-status" aria-label="Transit provider status">
        <div>
          <span aria-hidden="true" />
          <strong>Provider Status</strong>
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
            Last Sync: {transit.observed_at ? formatRelativeAge(transit.observed_at) : "not observed"}
          </span>
          <i aria-hidden="true" />
          <span className="transit-provider-coverage">Coverage: {formatNumber(transit.quality.field_coverage_pct)}%</span>
        </div>
      </section>

      <p className="transit-detail-freshness">
        {transit.summary ?? category?.description ?? "Latest normalized HSL transit service alert signals."}
      </p>
    </section>
  );
}
