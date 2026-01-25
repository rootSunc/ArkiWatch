import { PersonalDashboardResponse } from "@/features/personal-assistant/types";
import { PersonalAssistantPanel } from "@/features/personal-assistant/personal-assistant-panel";
import { PublicDashboardPanel } from "@/features/public-dashboard/public-dashboard-panel";
import { PublicDashboardResponse } from "@/features/public-dashboard/types";
import { formatTimestamp } from "@/features/shared/format";

type HomePageProps = {
  apiBaseUrl: string;
  defaultUserId: string;
  personalDashboard: PersonalDashboardResponse | null;
  personalError: string | null;
  publicDashboard: PublicDashboardResponse | null;
  publicError: string | null;
};

function getSystemState(
  personalDashboard: PersonalDashboardResponse | null,
  publicDashboard: PublicDashboardResponse | null
): { label: string; tone: string } {
  if (personalDashboard && publicDashboard) {
    return { label: "Live", tone: "good" };
  }

  if (personalDashboard || publicDashboard) {
    return { label: "Partial", tone: "warn" };
  }

  return { label: "Offline", tone: "bad" };
}

export function HomePage({
  apiBaseUrl,
  defaultUserId,
  personalDashboard,
  personalError,
  publicDashboard,
  publicError
}: HomePageProps) {
  const systemState = getSystemState(personalDashboard, publicDashboard);
  const latestCheckedAt = personalDashboard?.checked_at ?? publicDashboard?.checked_at ?? null;
  const actionCount =
    (personalDashboard?.today?.cards.length ?? 0) + (publicDashboard?.top_actions.length ?? 0);
  const coverageArea = publicDashboard?.coverage_area ?? "Coverage unavailable";
  const sourceCount = publicDashboard?.sources.length ?? personalDashboard?.sources.length ?? 0;
  const hasErrors = Boolean(personalError || publicError);

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Product status">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <strong>ArkiWatch</strong>
            <span>Daily guidance platform</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span className={`status-badge status-badge-${systemState.tone}`}>
            {systemState.label}
          </span>
          <span>{coverageArea}</span>
          <span>{formatTimestamp(latestCheckedAt)}</span>
        </div>
      </header>

      <section className="page-titlebar" aria-labelledby="page-title">
        <div>
          <span className="section-kicker">Operations brief</span>
          <h1 id="page-title">Today&apos;s guidance</h1>
          <p>Personal actions, regional conditions, and delivery state in one clean view.</p>
        </div>
        <div className="summary-grid" aria-label="Dashboard summary">
          <article className="summary-card">
            <span>Actions</span>
            <strong>{actionCount}</strong>
          </article>
          <article className="summary-card">
            <span>Setup</span>
            <strong>{personalDashboard?.onboarding_completion_percent ?? 0}%</strong>
          </article>
          <article className="summary-card">
            <span>Sources</span>
            <strong>{sourceCount}</strong>
          </article>
        </div>
      </section>

      {hasErrors ? (
        <section className="alert-grid" aria-label="Dashboard notices">
          {personalError ? (
            <div className="inline-alert inline-alert-bad">
              <strong>Personal dashboard</strong>
              <p>{personalError}</p>
            </div>
          ) : null}
          {publicError ? (
            <div className="inline-alert inline-alert-bad">
              <strong>Regional dashboard</strong>
              <p>{publicError}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <PersonalAssistantPanel
        dashboard={personalDashboard}
        defaultUserId={defaultUserId}
        error={personalError}
      />

      <PublicDashboardPanel
        apiBaseUrl={apiBaseUrl}
        dashboard={publicDashboard}
        defaultUserId={defaultUserId}
        error={publicError}
      />
    </main>
  );
}
