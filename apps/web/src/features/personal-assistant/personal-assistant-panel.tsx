import {
  Notification,
  PersonalDashboardResponse,
  PersonalScenario,
  Recommendation,
  TodayCard,
  WorkflowStep
} from "@/features/personal-assistant/types";
import { formatTimestamp, severityTone, statusTone } from "@/features/shared/format";

type PersonalAssistantPanelProps = {
  dashboard: PersonalDashboardResponse | null;
  defaultUserId: string;
  error: string | null;
};

function renderTodayCard(card: TodayCard) {
  return (
    <article className="action-card" key={`${card.type}-${card.title}`}>
      <div className="list-card-header">
        <div>
          <span className="card-kicker">{card.type}</span>
          <h3>{card.title}</h3>
        </div>
        <span className={`pill pill-${severityTone(card.severity)}`}>{card.severity}</span>
      </div>
      <p>{card.summary}</p>
      {card.valid_to ? (
        <span className="meta-text">Valid until {formatTimestamp(card.valid_to)}</span>
      ) : null}
    </article>
  );
}

function renderWorkflowStep(step: WorkflowStep) {
  return (
    <article className="list-card compact-card" key={step.key}>
      <div className="list-card-header">
        <h3>{step.title}</h3>
        <span className={`pill pill-${statusTone(step.status)}`}>{step.status}</span>
      </div>
      <p>{step.detail}</p>
    </article>
  );
}

function renderRecommendation(recommendation: Recommendation) {
  return (
    <article className="list-card" key={recommendation.id}>
      <div className="list-card-header">
        <div>
          <span className="card-kicker">{recommendation.recommendation_type.toLowerCase()}</span>
          <h3>{recommendation.advice_title}</h3>
        </div>
        <span className={`pill pill-${severityTone(recommendation.event_severity)}`}>
          {recommendation.status}
        </span>
      </div>
      <p>{recommendation.advice_body}</p>
      <span className="meta-text">
        {formatTimestamp(recommendation.valid_from)} to {formatTimestamp(recommendation.valid_to)}
      </span>
    </article>
  );
}

function renderScenario(section: PersonalScenario) {
  return (
    <article className="scenario-card" key={section.key}>
      <div className="scenario-header">
        <div>
          <span className="card-kicker">{section.key}</span>
          <h3>{section.title}</h3>
        </div>
        <span className={`pill pill-${statusTone(section.readiness)}`}>{section.readiness}</span>
      </div>
      <p>{section.description}</p>
      <div className="scenario-detail">
        <strong>{section.readiness_detail}</strong>
        {section.primary_card ? (
          <p>
            {section.primary_card.title}: {section.primary_card.summary}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function renderNotification(notification: Notification) {
  return (
    <article className="timeline-item" key={notification.id}>
      <div className="list-card-header">
        <strong>{notification.delivery_status}</strong>
        <span className={`pill pill-${statusTone(notification.delivery_status)}`}>
          {notification.sent_at ? "sent" : "queued"}
        </span>
      </div>
      <p>{notification.message_text}</p>
      <span className="meta-text">
        {notification.sent_at
          ? `Sent ${formatTimestamp(notification.sent_at)}`
          : `Queued ${formatTimestamp(notification.created_at)}`}
      </span>
    </article>
  );
}

export function PersonalAssistantPanel({
  dashboard,
  defaultUserId,
  error
}: PersonalAssistantPanelProps) {
  if (!dashboard) {
    return (
      <section className="section-block" id="personal">
        <div className="section-header section-header-large">
          <div>
            <span className="section-kicker">Personal</span>
            <h2>Daily brief unavailable</h2>
            <p>Personal recommendations will appear here when the service is reachable.</p>
          </div>
        </div>
        <div className="empty-panel">
          <strong>Personal dashboard unavailable</strong>
          <p>{error ?? "Unknown personal dashboard error."}</p>
        </div>
      </section>
    );
  }

  const user = dashboard.current_user;
  const todayCards = dashboard.today?.cards ?? [];
  const hasSetupTarget = Boolean(defaultUserId || user);
  const userLabel = user?.name ?? user?.email ?? (hasSetupTarget ? "Pending setup" : "No user");
  const locationLabel = user?.default_location ?? dashboard.today?.location ?? "No location";
  const setupTone =
    dashboard.onboarding_completion_percent >= 100
      ? "good"
      : dashboard.onboarding_completion_percent > 0
        ? "warn"
        : "bad";

  return (
    <section className="section-block section-block-primary" id="personal">
      <div className="section-header section-header-large">
        <div>
          <span className="section-kicker">Personal</span>
          <h2>{user ? "Daily brief" : "Personal setup"}</h2>
          <p>
            {user
              ? `${locationLabel} guidance for ${userLabel}, tuned to ${user.timezone}.`
              : "Create a user context to unlock place-aware guidance and Telegram delivery."}
          </p>
        </div>
        <div className="mini-metrics" aria-label="Personal summary">
          <article className="metric">
            <span className="metric-label">Setup</span>
            <strong className={`metric-tone-${setupTone}`}>
              {dashboard.onboarding_completion_percent}%
            </strong>
          </article>
          <article className="metric">
            <span className="metric-label">User</span>
            <strong>{userLabel}</strong>
          </article>
          <article className="metric">
            <span className="metric-label">Checked</span>
            <strong>{formatTimestamp(dashboard.checked_at)}</strong>
          </article>
        </div>
      </div>

      {dashboard.selection_error ? (
        <div className="inline-alert inline-alert-warn">
          <strong>User selection</strong>
          <p>{dashboard.selection_error}</p>
        </div>
      ) : null}

      <div className="action-grid action-grid-featured" aria-label="Today cards">
        {todayCards.length > 0 ? (
          todayCards.map(renderTodayCard)
        ) : (
          <article className="empty-state">
            <h3>No personal actions yet</h3>
            <p>Fresh weather, air, commute, and energy guidance will appear here.</p>
          </article>
        )}
      </div>

      <div className="content-grid content-grid-primary">
        <section className="subsection">
          <div className="section-header">
            <div>
              <span className="section-kicker">Readiness</span>
              <h2>Assistant status</h2>
            </div>
          </div>
          <div className="stack">{dashboard.workflow_steps.map(renderWorkflowStep)}</div>
        </section>

        <section className="subsection">
          <div className="section-header">
            <div>
              <span className="section-kicker">Actions</span>
              <h2>Recommendation queue</h2>
            </div>
          </div>
          <div className="stack">
            {dashboard.recommendations.length > 0 ? (
              dashboard.recommendations.map(renderRecommendation)
            ) : (
              <article className="empty-state">
                <h3>No queued recommendations</h3>
                <p>New recommendations will appear when conditions change.</p>
              </article>
            )}
          </div>
        </section>
      </div>

      <section className="subsection">
        <div className="section-header">
          <div>
            <span className="section-kicker">Scenarios</span>
            <h2>Personal guidance by topic</h2>
          </div>
        </div>
        <div className="scenario-grid">{dashboard.scenario_sections.map(renderScenario)}</div>
      </section>

      <section className="subsection">
        <div className="section-header">
          <div>
            <span className="section-kicker">Delivery</span>
            <h2>Recent notifications</h2>
          </div>
        </div>
        <div className="timeline-strip">
          {dashboard.notifications.length > 0 ? (
            dashboard.notifications.map(renderNotification)
          ) : (
            <article className="empty-state empty-state-compact">
              <h3>No notification history</h3>
              <p>Telegram deliveries will appear here after the first send.</p>
            </article>
          )}
        </div>
      </section>
    </section>
  );
}
