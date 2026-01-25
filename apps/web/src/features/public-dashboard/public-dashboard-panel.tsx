"use client";

import { useEffect, useMemo, useState } from "react";

import {
  PublicAction,
  PublicDashboardResponse,
  PublicScenarioSection,
  PublicTimelineItem,
  ScenarioChannel
} from "@/features/public-dashboard/types";
import {
  formatLabel,
  formatTimestamp,
  severityTone,
  statusTone
} from "@/features/shared/format";
import { SourceCard } from "@/features/shared/source-card";

type PublicDashboardPanelProps = {
  apiBaseUrl: string;
  dashboard: PublicDashboardResponse | null;
  defaultUserId: string;
  error: string | null;
};

type SubscriptionStatus = "idle" | "loading" | "subscribed" | "setup_required" | "error";

type SubscriptionState = Record<
  string,
  {
    status: SubscriptionStatus;
    message: string;
  }
>;

type ScenarioSubscriptionResponse = {
  scenario_key: string;
};

function buttonLabel(status: SubscriptionStatus, canSubscribe: boolean): string {
  if (!canSubscribe) {
    return "Unavailable";
  }

  switch (status) {
    case "loading":
      return "Subscribing";
    case "subscribed":
      return "Subscribed";
    case "setup_required":
      return "Connect Telegram";
    case "error":
      return "Retry";
    default:
      return "Subscribe";
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // Response bodies are optional for failed API calls.
  }

  return `Request failed with ${response.status}.`;
}

function renderTopAction(action: PublicAction) {
  return (
    <article className="action-card" key={action.id}>
      <div className="list-card-header">
        <div>
          <span className="card-kicker">{formatLabel(action.scenario_key)}</span>
          <h3>{action.title}</h3>
        </div>
        <span className={`pill pill-${severityTone(action.severity)}`}>{action.severity}</span>
      </div>
      <p>{action.body}</p>
      <span className="meta-text">
        {formatLabel(action.area_scope)} · until {formatTimestamp(action.valid_to)}
      </span>
    </article>
  );
}

function renderScenarioChannel(
  channel: ScenarioChannel,
  state: SubscriptionState[string] | undefined,
  canSubscribe: boolean,
  onSubscribe: (scenarioKey: string) => void
) {
  const status = state?.status ?? "idle";
  const message = state?.message;

  return (
    <article className="channel-card" key={channel.scenario_key}>
      <div className="list-card-header">
        <div>
          <span className="card-kicker">{channel.scenario_key}</span>
          <h3>{channel.title}</h3>
        </div>
        <span className={`pill pill-${statusTone(status)}`}>{status.replaceAll("_", " ")}</span>
      </div>
      <p>{channel.description}</p>
      <button
        className={`channel-button channel-button-${status}`}
        disabled={!canSubscribe || status === "loading" || status === "subscribed"}
        onClick={() => onSubscribe(channel.scenario_key)}
        type="button"
      >
        {buttonLabel(status, canSubscribe)}
      </button>
      {message ? <p className="channel-state">{message}</p> : null}
    </article>
  );
}

function renderScenario(section: PublicScenarioSection) {
  return (
    <article className="scenario-card" key={section.key}>
      <div className="scenario-header">
        <div>
          <span className="card-kicker">{section.key}</span>
          <h3>{section.title}</h3>
        </div>
        <span className={`pill pill-${statusTone(section.freshness_state)}`}>
          {formatLabel(section.freshness_state)}
        </span>
      </div>
      <p>{section.description}</p>
      <div className="scenario-detail">
        <strong>{section.recommendation.title}</strong>
        <p>{section.recommendation.body}</p>
        <span className="meta-text">
          {formatLabel(section.area_scope)} · {formatTimestamp(section.valid_from)} to{" "}
          {formatTimestamp(section.valid_to)}
        </span>
      </div>
      {section.evidence.length > 0 ? (
        <ul className="evidence-list">
          {section.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function renderTimelineItem(item: PublicTimelineItem) {
  return (
    <article className="timeline-item" key={`${item.scenario_key}-${item.starts_at}`}>
      <div className="list-card-header">
        <strong>{item.label}</strong>
        <span className={`pill pill-${severityTone(item.severity)}`}>{item.scenario_key}</span>
      </div>
      <p className="meta-text">
        {formatTimestamp(item.starts_at)} to {formatTimestamp(item.ends_at)}
      </p>
    </article>
  );
}

export function PublicDashboardPanel({
  apiBaseUrl,
  dashboard,
  defaultUserId,
  error
}: PublicDashboardPanelProps) {
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({});
  const canSubscribe = Boolean(defaultUserId);
  const scenarioKeys = useMemo(
    () => dashboard?.scenario_channels.map((channel) => channel.scenario_key).join(",") ?? "",
    [dashboard]
  );

  useEffect(() => {
    if (!dashboard || !defaultUserId) {
      return;
    }

    const controller = new AbortController();
    const loadSubscriptions = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/public/subscriptions?user_id=${encodeURIComponent(defaultUserId)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          return;
        }
        const subscriptions = (await response.json()) as ScenarioSubscriptionResponse[];
        const subscribed = new Set(subscriptions.map((item) => item.scenario_key));
        setSubscriptionState((currentState) => {
          const nextState = { ...currentState };
          for (const scenarioKey of subscribed) {
            nextState[scenarioKey] = {
              status: "subscribed",
              message: "Telegram broadcast is active."
            };
          }
          return nextState;
        });
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
      }
    };

    void loadSubscriptions();

    return () => controller.abort();
  }, [apiBaseUrl, dashboard, defaultUserId, scenarioKeys]);

  const subscribeToScenario = async (scenarioKey: string) => {
    if (!defaultUserId) {
      setSubscriptionState((currentState) => ({
        ...currentState,
        [scenarioKey]: {
          status: "setup_required",
          message: "Telegram subscription is not configured for this dashboard."
        }
      }));
      return;
    }

    setSubscriptionState((currentState) => ({
      ...currentState,
      [scenarioKey]: { status: "loading", message: "" }
    }));

    try {
      const response = await fetch(`${apiBaseUrl}/public/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: defaultUserId,
          scenario_key: scenarioKey
        })
      });

      if (!response.ok) {
        const message = await readApiError(response);
        setSubscriptionState((currentState) => ({
          ...currentState,
          [scenarioKey]: {
            status: response.status === 400 ? "setup_required" : "error",
            message
          }
        }));
        return;
      }

      setSubscriptionState((currentState) => ({
        ...currentState,
        [scenarioKey]: {
          status: "subscribed",
          message: "Telegram broadcast is active."
        }
      }));
    } catch (requestError) {
      setSubscriptionState((currentState) => ({
        ...currentState,
        [scenarioKey]: {
          status: "error",
          message:
            requestError instanceof Error ? requestError.message : "Subscription request failed."
        }
      }));
    }
  };

  if (!dashboard) {
    return (
      <section className="section-block" id="regional">
        <div className="section-header section-header-large">
          <div>
            <span className="section-kicker">Regional</span>
            <h2>Regional guidance unavailable</h2>
            <p>Public actions will appear here when the regional feed is reachable.</p>
          </div>
        </div>
        <div className="empty-panel">
          <strong>Regional dashboard unavailable</strong>
          <p>{error ?? "Unknown dashboard error."}</p>
        </div>
      </section>
    );
  }

  const sourceCounts = {
    healthy: dashboard.sources.filter((source) => source.operational_status === "healthy").length,
    watch: dashboard.sources.filter((source) => source.operational_status !== "healthy").length
  };

  return (
    <section className="section-block" id="regional">
      <div className="section-header section-header-large">
        <div>
          <span className="section-kicker">Regional</span>
          <h2>Public guidance</h2>
          <p>
            {dashboard.coverage_area} signals for commute, outdoor conditions, home air, and
            flexible electricity timing.
          </p>
        </div>
        <div className="mini-metrics" aria-label="Regional summary">
          <article className="metric">
            <span className="metric-label">Checked</span>
            <strong>{formatTimestamp(dashboard.checked_at)}</strong>
          </article>
          <article className="metric">
            <span className="metric-label">Fresh</span>
            <strong className="metric-tone-good">{sourceCounts.healthy}</strong>
          </article>
          <article className="metric">
            <span className="metric-label">Watch</span>
            <strong className={sourceCounts.watch > 0 ? "metric-tone-warn" : "metric-tone-good"}>
              {sourceCounts.watch}
            </strong>
          </article>
        </div>
      </div>

      <div className="action-grid action-grid-featured" aria-label="Top public actions">
        {dashboard.top_actions.length > 0 ? (
          dashboard.top_actions.map(renderTopAction)
        ) : (
          <article className="empty-state">
            <h3>No public actions yet</h3>
            <p>Regional recommendations will appear when a scenario needs attention.</p>
          </article>
        )}
      </div>

      <div className="content-grid content-grid-primary">
        <section className="subsection">
          <div className="section-header">
            <div>
              <span className="section-kicker">Channels</span>
              <h2>Subscribe by scenario</h2>
            </div>
          </div>
          <div className="channel-grid">
            {dashboard.scenario_channels.map((channel) =>
              renderScenarioChannel(
                channel,
                subscriptionState[channel.scenario_key],
                canSubscribe,
                subscribeToScenario
              )
            )}
          </div>
        </section>

        <section className="subsection">
          <div className="section-header">
            <div>
              <span className="section-kicker">Timeline</span>
              <h2>Today by hour</h2>
            </div>
          </div>
          <div className="timeline-strip">{dashboard.timeline.map(renderTimelineItem)}</div>
        </section>
      </div>

      <section className="subsection">
        <div className="section-header">
          <div>
            <span className="section-kicker">Scenarios</span>
            <h2>Regional guidance by topic</h2>
          </div>
        </div>
        <div className="scenario-grid">{dashboard.scenario_sections.map(renderScenario)}</div>
      </section>

      <section className="subsection">
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
              <h3>No broadcast traffic</h3>
              <p>Broadcast-ready recommendations will appear here after delivery.</p>
            </article>
          )}
        </div>
      </section>

      <details className="subsection ops-panel">
        <summary>
          <span>
            <span className="section-kicker">Data freshness</span>
            <strong>Source collection status</strong>
          </span>
          <span className="pill pill-neutral">{dashboard.sources.length} sources</span>
        </summary>
        <div className="source-grid">
          {dashboard.sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </details>
    </section>
  );
}
