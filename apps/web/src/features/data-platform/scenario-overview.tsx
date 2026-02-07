"use client";

import { formatTimestamp } from "@/features/shared/format";

import { LanguageMode, translateEnumLabel, useI18n } from "./i18n";
import {
  buildScenarioLiveHint,
  formatScenarioHintAge,
  type ScenarioLiveSignals,
} from "./scenario-live-hints";
import { TODAY_QUICK_LINKS } from "./scenario-navigation";
import type { PublicDashboardRead, PublicScenarioSectionRead } from "./types";

export { SCENARIO_NAV_KEYS } from "./scenario-navigation";

const SCENARIO_ICONS: Record<string, string> = {
  outdoor: "wb_sunny",
  commute: "commute",
  home_air: "air",
  energy: "bolt",
};

type ScenarioOverviewProps = {
  publicDashboard: PublicDashboardRead | null;
  liveSignals: ScenarioLiveSignals;
  isHistorical: boolean;
  language: LanguageMode;
  onOpenSignals: () => void;
  onOpenScenario: (scenarioKey: string) => void;
  onOpenTopAction?: (scenarioKey: string) => void;
};

function isPlaceholderRecommendation(id: string, body: string): boolean {
  if (id.startsWith("placeholder-")) {
    return true;
  }
  return /data will appear here after|no active regional recommendation/i.test(body);
}

function cardToneClass(severity: string, isPlaceholder: boolean): string {
  if (isPlaceholder) {
    return "scenario-card-neutral";
  }
  switch (severity.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return "scenario-card-bad";
    case "MEDIUM":
      return "scenario-card-warn";
    case "LOW":
    case "INFO":
      return "scenario-card-good";
    default:
      return "scenario-card-neutral";
  }
}

function ScenarioCard({
  section,
  liveSignals,
  language,
  onOpen,
  t,
}: {
  section: PublicScenarioSectionRead;
  liveSignals: ScenarioLiveSignals;
  language: LanguageMode;
  onOpen: () => void;
  t: (value: string) => string;
}) {
  const rec = section.recommendation;
  const placeholder = isPlaceholderRecommendation(rec.id, rec.body);
  const liveHint = buildScenarioLiveHint(section.key, liveSignals, language);
  const toneClass = cardToneClass(rec.severity, placeholder && !liveHint);
  const icon = SCENARIO_ICONS[section.key] ?? "insights";
  const title = placeholder && liveHint ? liveHint.headline : section.status_label;
  const body =
    placeholder && liveHint
      ? liveHint.detail
      : rec.body || section.description;
  const sourcesLabel =
    placeholder && liveHint ? liveHint.sources : section.source_codes.map((c) => c.toUpperCase()).join(" · ");
  const updatedLine = formatScenarioHintAge(
    placeholder && liveHint ? liveHint.updatedAt : rec.valid_from,
    language,
    t,
  );

  return (
    <button className={`scenario-card ${toneClass}`} onClick={onOpen} type="button">
      <div className="scenario-card-kicker">
        <span>{section.title}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      </div>
      {placeholder && liveHint ? (
        <span className="scenario-card-live-badge">{t("Live signal")}</span>
      ) : null}
      <h3 className="scenario-card-title">{title}</h3>
      <p className="scenario-card-body">{body}</p>
      <div className="scenario-card-meta">
        {placeholder && liveHint ? (
          updatedLine ? <span>{updatedLine}</span> : null
        ) : (
          <>
            <span>
              {t("Valid")}{" "}
              {formatTimestamp(rec.valid_from, "dateTime", language)} –{" "}
              {formatTimestamp(rec.valid_to, "dateTime", language)}
            </span>
            <span>
              {translateEnumLabel(language, rec.freshness_state)}{" · "}
              {translateEnumLabel(language, rec.area_scope)}
            </span>
          </>
        )}
      </div>
      <div className="scenario-card-sources">
        {t("Sources")}: {sourcesLabel}
      </div>
      <span className="scenario-card-cta">{t("View details")} →</span>
    </button>
  );
}

export function ScenarioOverview({
  publicDashboard,
  liveSignals,
  isHistorical,
  language,
  onOpenSignals,
  onOpenScenario,
  onOpenTopAction,
}: ScenarioOverviewProps) {
  const { t } = useI18n();

  if (!publicDashboard) {
    return (
      <section className="scenario-overview-page" aria-label={t("Today")}>
        <div className="scenario-empty">
          <strong>{t("Scenario overview unavailable")}</strong>
          <p>{t("Public recommendations could not be loaded. Try again or open all signals.")}</p>
          <div className="scenario-overview-actions" style={{ marginTop: "0.75rem", justifyContent: "center" }}>
            <button onClick={onOpenSignals} type="button">
              {t("Open all signals")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const sections = publicDashboard.scenario_sections;
  const topActions = publicDashboard.top_actions.filter(
    (action) => !isPlaceholderRecommendation(action.id, action.body),
  );

  return (
    <section className="scenario-overview-page" aria-label={t("Scenario overview")}>
      <header className="scenario-overview-header">
        <div>
          <h2>{t("Today")}</h2>
          <p>
            {t("Scenario overview lead")}{" "}
            <strong>{publicDashboard.coverage_area}</strong>
            {publicDashboard.checked_at ? (
              <>
                {" "}
                · {t("Updated")}{" "}
                {formatTimestamp(publicDashboard.checked_at, "dateTime", language)}
              </>
            ) : null}
          </p>
        </div>
        <div className="scenario-overview-actions">
          <button onClick={onOpenSignals} type="button">
            {t("Open all signals")}
          </button>
        </div>
      </header>

      {isHistorical ? (
        <div className="scenario-historical-banner" role="status">
          {t("Scenario overview historical note")}
        </div>
      ) : null}

      <nav className="scenario-quick-links" aria-label={t("Quick links")}>
        {TODAY_QUICK_LINKS.map((link) => {
          const hint = buildScenarioLiveHint(link.scenarioKey, liveSignals, language);
          return (
            <button
              className="scenario-quick-link"
              key={link.scenarioKey}
              onClick={() => onOpenScenario(link.scenarioKey)}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {link.icon}
              </span>
              <span className="scenario-quick-link-copy">
                <strong>{t(link.label)}</strong>
                <em>{hint?.headline ?? t("Open details")}</em>
              </span>
            </button>
          );
        })}
      </nav>

      {topActions.length > 0 ? (
        <section className="scenario-top-actions" aria-label={t("Top actions")}>
          {topActions.slice(0, 3).map((action) => (
            <button
              className={`scenario-top-action scenario-top-action-${action.severity.toLowerCase()}`}
              key={action.id}
              onClick={() => onOpenTopAction?.(action.scenario_key)}
              type="button"
            >
              <strong>{action.title}</strong>
              <p>{action.body}</p>
              <span className="scenario-card-cta">{t("View details")} →</span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="scenario-card-grid">
        {sections.map((section) => (
          <ScenarioCard
            key={section.key}
            language={language}
            liveSignals={liveSignals}
            section={section}
            t={t}
            onOpen={() => onOpenScenario(section.key)}
          />
        ))}
      </div>
    </section>
  );
}
