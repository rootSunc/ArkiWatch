import {
  DashboardSource,
  PublicAction,
  PublicDashboardResponse,
  PublicScenarioSection,
  PublicTimelineItem,
  ScenarioChannel
} from "@/features/home/types";

type HomePageProps = {
  apiBaseUrl: string;
  dashboard: PublicDashboardResponse | null;
  error: string | null;
};

function formatTimestamp(value: string | null, mode: "dateTime" | "date" = "dateTime"): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(mode === "dateTime"
      ? {
          hour: "2-digit",
          minute: "2-digit"
        }
      : {})
  }).format(new Date(value));
}

function formatRelativeAge(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const diffInMinutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diffInMinutes < 1) {
    return "just now";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} h ago`;
  }

  return `${Math.round(diffInHours / 24)} d ago`;
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function statusTone(status: string): string {
  switch (status) {
    case "healthy":
    case "fresh":
    case "SENT":
      return "good";
    case "pending":
    case "stale":
      return "warn";
    case "degraded":
    case "failing":
    case "FAILED":
      return "bad";
    default:
      return "neutral";
  }
}

function cardTone(severity: string): string {
  switch (severity) {
    case "high":
    case "HIGH":
      return "bad";
    case "medium":
    case "MEDIUM":
      return "warn";
    case "low":
    case "LOW":
      return "good";
    default:
      return "neutral";
  }
}

function renderTopAction(action: PublicAction) {
  return (
    <article className="action-card" key={action.id}>
      <div className="list-card-header">
        <strong>{action.title}</strong>
        <span className={`pill pill-${cardTone(action.severity)}`}>{action.scenario_key}</span>
      </div>
      <p>{action.body}</p>
      <span className="meta-text">
        {formatLabel(action.area_scope)} · until {formatTimestamp(action.valid_to)}
      </span>
    </article>
  );
}

function renderScenarioChannel(channel: ScenarioChannel) {
  return (
    <article className="channel-card" key={channel.scenario_key}>
      <div className="list-card-header">
        <strong>{channel.title}</strong>
        <span className="pill pill-neutral">{channel.scenario_key}</span>
      </div>
      <p>{channel.description}</p>
      <button className="channel-button" type="button">
        Subscribe
      </button>
    </article>
  );
}

function renderScenario(section: PublicScenarioSection) {
  return (
    <article className="scenario-card" key={section.key}>
      <div className="scenario-header">
        <div>
          <span className="scenario-key">{section.key}</span>
          <h3>{section.title}</h3>
          <p className="scenario-description">{section.description}</p>
        </div>
        <span className={`pill pill-${statusTone(section.freshness_state)}`}>{section.status_label}</span>
      </div>
      <p>{section.recommendation.body}</p>
      <span className="meta-text">
        {formatLabel(section.area_scope)} · {formatTimestamp(section.valid_from)} to {formatTimestamp(section.valid_to)}
      </span>
      <ul className="evidence-list">
        {section.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function renderTimelineItem(item: PublicTimelineItem) {
  return (
    <article className="timeline-item" key={`${item.scenario_key}-${item.starts_at}`}>
      <strong>{item.label}</strong>
      <span className={`pill pill-${cardTone(item.severity)}`}>{item.scenario_key}</span>
      <p className="meta-text">
        {formatTimestamp(item.starts_at)} to {formatTimestamp(item.ends_at)}
      </p>
    </article>
  );
}

function renderSource(source: DashboardSource) {
  return (
    <article className="source-card" key={source.id}>
      <div className="source-header">
        <div>
          <h3>{source.source_name}</h3>
          <span className="meta-text">
            {source.source_code} · every {Math.round(source.poll_interval_seconds / 60)} min
          </span>
        </div>
        <span className={`pill pill-${statusTone(source.operational_status)}`}>{source.operational_status}</span>
      </div>
      <p>
        Last run:{" "}
        {source.last_run_finished_at
          ? `${formatTimestamp(source.last_run_finished_at)} (${formatRelativeAge(source.last_run_finished_at)})`
          : "Never"}
      </p>
      <p>
        Status: {source.last_run_status ?? "no runs"} · Records: {source.records_ingested ?? 0}
      </p>
      {source.error_message ? <p className="error-text">{source.error_message}</p> : null}
    </article>
  );
}

export function HomePage({ apiBaseUrl, dashboard, error }: HomePageProps) {
  if (!dashboard) {
    return (
      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">ArkiWatch public dashboard</span>
            <h1>Regional guidance is unavailable.</h1>
            <p>
              The web app could not reach the public dashboard endpoint, so there is no live Helsinki/Uusimaa payload
              to render yet.
            </p>
          </div>
          <div className="hero-actions">
            <div className="inline-alert inline-alert-bad">
              <strong>Dashboard unavailable</strong>
              <p>{error ?? "Unknown dashboard error."}</p>
            </div>
            <div className="control-panel">
              <span className="field-label">Dashboard API</span>
              <code>{apiBaseUrl}/dashboard</code>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const sourceCounts = {
    healthy: dashboard.sources.filter((source) => source.operational_status === "healthy").length,
    watch: dashboard.sources.filter((source) => source.operational_status !== "healthy").length
  };

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{dashboard.coverage_area}</span>
          <h1>Today&apos;s 3 actions</h1>
          <p>
            Public guidance for Helsinki/Uusimaa. The page leads with actions, then shows supporting evidence across
            commute, outdoor conditions, home air, and energy timing.
          </p>
          <div className="action-grid">
            {dashboard.top_actions.length > 0 ? (
              dashboard.top_actions.map(renderTopAction)
            ) : (
              <article className="empty-state">
                <h3>No top actions yet.</h3>
                <p>Public recommendations will appear once the rule engine has emitted regional guidance.</p>
              </article>
            )}
          </div>
        </div>
        <div className="hero-actions">
          <div className="control-panel">
            <span className="field-label">Dashboard API</span>
            <code>{apiBaseUrl}/dashboard</code>
          </div>
          <div className="status-strip compact-strip">
            <article className="metric">
              <span className="metric-label">Checked</span>
              <strong>{formatTimestamp(dashboard.checked_at)}</strong>
            </article>
            <article className="metric">
              <span className="metric-label">Fresh sources</span>
              <strong>{sourceCounts.healthy}</strong>
            </article>
            <article className="metric">
              <span className="metric-label">Watched sources</span>
              <strong>{sourceCounts.watch}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <span className="section-kicker">Scenario channels</span>
            <h2>Subscribe by scenario</h2>
          </div>
        </div>
        <div className="channel-grid">
          {dashboard.scenario_channels.map(renderScenarioChannel)}
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <span className="section-kicker">Live scenarios</span>
            <h2>Regional guidance by topic</h2>
          </div>
        </div>
        <div className="scenario-grid">
          {dashboard.scenario_sections.map(renderScenario)}
        </div>
      </section>

      <div className="content-grid content-grid-primary">
        <section className="panel">
          <div className="section-header">
            <div>
              <span className="section-kicker">Timeline</span>
              <h2>Today by hour</h2>
            </div>
          </div>
          <div className="timeline-strip">
            {dashboard.timeline.map(renderTimelineItem)}
          </div>
        </section>

        <section className="panel">
          <div className="section-header">
            <div>
              <span className="section-kicker">Broadcasts</span>
              <h2>Latest public messages</h2>
            </div>
          </div>
          <div className="stack">
            {dashboard.broadcasts.length > 0 ? (
              dashboard.broadcasts.map(renderTopAction)
            ) : (
              <article className="empty-state">
                <h3>No broadcast traffic yet.</h3>
                <p>Broadcast-ready recommendations will appear here once a scenario crosses its delivery threshold.</p>
              </article>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-header">
          <div>
            <span className="section-kicker">Source health</span>
            <h2>Freshness and collection status</h2>
          </div>
        </div>
        <div className="source-grid">
          {dashboard.sources.map(renderSource)}
        </div>
      </section>
    </main>
  );
}
