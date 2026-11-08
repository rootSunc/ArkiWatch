"use client";

import { useState, type ReactNode } from "react";
import { Card, EmptyState, StatusBadge } from "@/features/shared/ui/console";
import { formatScopedClock, formatTimestamp, severityTone } from "@/features/shared/format";
import { useI18n } from "./i18n";
import { localizedContent } from "./content-localization";
import type { SignalSystemTile } from "./signals-console";
import type { TodayBrief } from "./today/today-brief";
import type { PlatformEvent, PlatformOverviewResponse } from "./types";
import type { PersonalDashboardRead } from "./personal-dashboard";
import { TrendChart, type TrendChartPoint } from "./trend-chart";
import { DayPlanTimeline } from "./today/day-plan-timeline";
import { SnapshotDownloadButton } from "./snapshot-download-button";
import { ShareViewLinkButton } from "./share-view-link-button";
import { eventStateAt } from "./event-time-state";
import { scopedReferenceTime } from "./data-time-scope";

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text) {
      continue;
    }
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(text);
  }
  return labels.join(" · ");
}

export type DataPlatformOverviewProps = {
  checkedAt: string;
  catalogSignalCards?: ReactNode;
  catalogSignalCount?: number;
  coreSignalCards: ReactNode;
  coreSignalCount: number;
  isCatalogExpanded?: boolean;
  onCatalogToggle?: (isOpen: boolean) => void;
  onOpenToday: () => void;
  onSearchChange?: (value: string) => void;
  overview: PlatformOverviewResponse;
  platformTimezone: string;
  searchValue?: string;
  signalSystemTiles: SignalSystemTile[];
  todayBrief: TodayBrief | null;
  sourceHealth?: ReactNode;
  secondaryContent?: ReactNode;
  events?: PlatformEvent[];
  onOpenEvent?: (event: PlatformEvent) => void;
  onSelectNav?: (key: string) => void;
  onOpenScenario?: (key: string) => void;
  onOpenAssistant?: (question?: string) => void;
  trendSeries?: {
    key: string;
    label: string;
    unit?: string | null;
    points: TrendChartPoint[];
  }[];
  onEditContext?: () => void;
  personalDashboard?: PersonalDashboardRead | null;
};

export function DataPlatformOverview({
  catalogSignalCards,
  catalogSignalCount = 0,
  coreSignalCards,
  coreSignalCount,
  isCatalogExpanded,
  onCatalogToggle,
  onOpenToday,
  overview,
  platformTimezone,
  signalSystemTiles,
  todayBrief,
  secondaryContent,
  events = [],
  onOpenEvent,
  onSelectNav,
  onOpenScenario,
  onOpenAssistant,
  trendSeries = [],
  personalDashboard,
  onEditContext,
}: DataPlatformOverviewProps) {
  const { language, tKey, enumLabel } = useI18n();
  const [trendKey, setTrendKey] = useState("weather");
  const [catalogOpenState, setCatalogOpenState] = useState(false);
  const catalogOpen = isCatalogExpanded ?? catalogOpenState;
  const activeSeries =
    trendSeries.find((s) => s.key === trendKey) ?? trendSeries[0];
  const adviceIsLive = todayBrief?.recommendationMode === "live";
  const action = adviceIsLive ? todayBrief?.topActions[0] : undefined;
  const hasPersonalContext = Boolean(personalDashboard?.today?.cards.length || (personalDashboard?.onboarding_completion_percent ?? 0) > 0);
  const adviceDetail =
    todayBrief?.recommendationMode === "historical"
      ? tKey("shell.historicalRecommendationsReadOnlyDetail")
      : todayBrief?.recommendationMode === "stale"
        ? tKey("shell.staleRecommendationsDetail")
        : todayBrief?.recommendationMode === "out_of_scope"
          ? tKey("shell.recommendationsUnavailableForScopeDetail")
          : tKey("shell.noCurrentRecommendationDetail");
  const coverageLabel = uniqueLabels([
    action ? enumLabel(action.area_scope) : null,
    todayBrief?.coverageArea,
  ]);
  const referenceAt = scopedReferenceTime(overview.time_scope, overview.checked_at);
  const openEvents = events.filter(
    (event) => eventStateAt(event, referenceAt!) === "active",
  );
  const health = overview.source_health;
  return (
    <div className="console-home overview-page">
      <div className="home-page-tools">
        <h1 className="sr-only">{tKey("shell.navHome")}</h1>
        <details className="page-actions">
          <summary aria-label={tKey("shell.pageActions")}>•••</summary>
          <div>
            <ShareViewLinkButton language={language} />
            <SnapshotDownloadButton overview={overview} />
          </div>
        </details>
      </div>
      <div
        className={`home-lead-grid${hasPersonalContext ? " home-with-day" : ""}`}
      >
        <section
          className="home-decision"
          aria-label={tKey("shell.recommendation")}
        >
          <span className="home-decision-label">
            {tKey(adviceIsLive || !todayBrief ? "shell.recommendation" : "shell.snapshotBrief")}
            {action ? ` · ${enumLabel(action.scenario_key)}` : ""}
          </span>
          <h2>
            {todayBrief?.headline ?? tKey("shell.noCurrentRecommendation")}
          </h2>
          <p>
            {action
              ? localizedContent(language, action.body, action.body_zh)
              : adviceDetail}
          </p>
          <div className="home-decision-actions">
            {action ? (
              <button
                className="console-button console-button-primary"
                onClick={() => onOpenScenario?.(action.scenario_key)}
                type="button"
              >
                {tKey("shell.reviewAction")} →
              </button>
            ) : (
              <button
                className="console-button console-button-primary"
                onClick={() => document.getElementById("home-signals")?.scrollIntoView({ block: "start" })}
                type="button"
              >
                {tKey("shell.seeOutingSignals")} →
              </button>
            )}
            {action ? (
              <button
                className="console-button"
                onClick={() => onOpenAssistant?.(todayBrief?.headline)}
                type="button"
              >
                {tKey("shell.askAboutThis")}
              </button>
            ) : null}
          </div>
          {action ? (
            <p className="home-decision-sources">
              {[
                todayBrief?.scenarioSections
                  .find((section) => section.key === action.scenario_key)
                  ?.source_codes.map((code) => code.toUpperCase())
                  .filter(Boolean)
                  .join(" · "),
                tKey("shell.checkedClock").replace(
                  "{time}",
                  formatTimestamp(todayBrief?.checkedAt || overview.checked_at, "time", language, platformTimezone),
                ),
              ].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {hasPersonalContext ? null : (
            <p className="home-decision-foot">
              <button
                className="console-text-button"
                type="button"
                onClick={onEditContext}
              >
                {tKey("shell.addContext")}
              </button>
            </p>
          )}
          {action ? (
            <details className="home-decision-evidence">
              <summary>{tKey("shell.whyThisAdvice")}</summary>
              <dl>
                <div>
                  <dt>{tKey("shell.coverage")}</dt>
                  <dd>{coverageLabel || tKey("shell.notRecorded")}</dd>
                </div>
                <div>
                  <dt>{tKey("shell.adviceWindow")}</dt>
                  <dd>
                    <time dateTime={action.valid_from}>{formatTimestamp(action.valid_from, "dateTime", language, platformTimezone)}</time>
                    {" – "}
                    <time dateTime={action.valid_to}>{formatTimestamp(action.valid_to, "dateTime", language, platformTimezone)}</time>
                  </dd>
                </div>
                <div>
                  <dt>{tKey("shell.freshnessState")}</dt>
                  <dd>{enumLabel(action.freshness_state)}</dd>
                </div>
                {todayBrief?.checkedAt ? (
                  <div>
                    <dt>{tKey("shell.observationTime")}</dt>
                    <dd>
                      <time dateTime={todayBrief.checkedAt}>{formatTimestamp(todayBrief.checkedAt, "dateTime", language, platformTimezone)}</time>
                    </dd>
                  </div>
                ) : null}
                {action.evidence.length ? (
                  <div>
                    <dt>{tKey("shell.evidence")}</dt>
                    <dd>{action.evidence.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          ) : null}
        </section>
        {hasPersonalContext ? (
          <Card
            title={tKey("shell.navPlan")}
            action={
              <button
                className="console-text-button"
                onClick={onOpenToday}
                type="button"
              >
                {tKey("shell.all")} →
              </button>
            }
            footer={
              <span className="home-day-footer">
                <span>{tKey("shell.savedContext")}</span>
                <button
                  className="console-text-button"
                  type="button"
                  onClick={onEditContext}
                >
                  {tKey("shell.editContext")}
                </button>
              </span>
            }
          >
            <DayPlanTimeline
              embedded
              items={todayBrief?.planItems.slice(0, 3) ?? []}
              language={language}
              timezone={platformTimezone}
              onOpenEvent={onOpenEvent}
              onOpenScenario={onOpenScenario}
            />
          </Card>
        ) : null}
      </div>
      <section
        className="home-signals"
        id="home-signals"
        aria-label={`${tKey("shell.signalStatusArray")}: ${coreSignalCount} ${tKey("shell.tracked")}`}
      >
        <div className="console-section-heading">
          <h2>{tKey("shell.coreSignals")}</h2>
          <span>
            {overview.checked_at
              ? tKey("shell.checkedClock").replace(
                  "{time}",
                  formatTimestamp(overview.checked_at, "time", language, platformTimezone),
                )
              : `${coreSignalCount} ${tKey("shell.tracked")}`}
            {catalogSignalCount > 0 ? (
              <button
                className="console-text-button"
                type="button"
                aria-expanded={catalogOpen}
                aria-label={tKey("shell.toggleCatalogSignals")}
                onClick={() => {
                  const next = !catalogOpen;
                  setCatalogOpenState(next);
                  onCatalogToggle?.(next);
                }}
              >
                {tKey("shell.all")} <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </span>
        </div>
        <p className="home-signals-lead">
          {tKey(todayBrief?.recommendationMode === "historical" ? "shell.historicalCoreSignalsLead" : "shell.coreSignalsLead")}
        </p>
        <div className="home-metrics">
          {coreSignalCards || (
            <EmptyState title={tKey("shell.noSignalDataForScope")} />
          )}
        </div>
        {catalogOpen && catalogSignalCount > 0 ? (
          <div className="home-catalog">
            <h3>{tKey("shell.catalogSignals")}</h3>
            <p className="home-signals-lead">{tKey("shell.catalogSignalsLead")}</p>
            <div className="home-metrics">{catalogSignalCards}</div>
          </div>
        ) : null}
      </section>
      <div className="home-bottom-grid">
        <Card
          title={`${tKey("shell.openEvents")} (${openEvents.length})`}
          action={
            <button
              className="console-text-button"
              onClick={() => onSelectNav?.("events")}
              type="button"
            >
              {tKey("shell.allEvents")} →
            </button>
          }
        >
          {openEvents.length ? (
            <ul className="home-event-list">
              {openEvents.slice(0, 4).map((event) => (
                <li key={event.id} data-tone={severityTone(event.severity)}>
                  <button onClick={() => onOpenEvent?.(event)} type="button">
                    <StatusBadge tone={severityTone(event.severity)}>
                      {enumLabel(event.severity)}
                    </StatusBadge>
                    <span>
                      {localizedContent(language, event.title, event.title_zh)}
                    </span>
                    <time dateTime={event.starts_at}>
                      {formatScopedClock(event.starts_at, referenceAt, language, platformTimezone)}
                    </time>
                  </button>
                  {onOpenAssistant ? (
                    <button
                      className="console-text-button home-event-ask"
                      type="button"
                      aria-label={`${tKey("shell.askAboutThis")}: ${localizedContent(language, event.title, event.title_zh)}`}
                      onClick={() =>
                        onOpenAssistant(
                          `${localizedContent(language, event.title, event.title_zh)}: ${localizedContent(language, event.body, event.body_zh)}`,
                        )
                      }
                    >
                      {tKey("shell.ask")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={tKey("shell.noOpenEvents")}
              description={tKey("shell.noEventsRemedy")}
            />
          )}
        </Card>
        <section className="home-trend">
          <div
            className="console-chart-controls"
            role="group"
            aria-label={tKey("shell.trend24h")}
          >
            {trendSeries.map((series) => (
              <button
                type="button"
                key={series.key}
                aria-pressed={series.key === activeSeries?.key}
                onClick={() => setTrendKey(series.key)}
              >
                {series.label}
              </button>
            ))}
          </div>
          <TrendChart
            eyebrow={tKey(
              activeSeries?.key === "air"
                ? "shell.availableHistory"
                : "shell.trend24h",
            )}
            referenceAt={overview.checked_at}
            title={activeSeries?.label ?? tKey("shell.trend24h")}
            points={activeSeries?.points ?? []}
            unit={activeSeries?.unit}
          />
        </section>
      </div>
      <footer className="home-source-footer">
        <span>
          {health
            ? [
                tKey("shell.sourceSummary")
                  .replace("{healthy}", String(health.healthy))
                  .replace("{tracked}", String(health.tracked))
                  .replace("{issues}", String(health.issues)),
                overview.sources.length === 1
                  ? tKey("shell.oneSource")
                  : tKey("shell.manySources").replace("{count}", String(overview.sources.length)),
                overview.checked_at
                  ? tKey("shell.checkedClock").replace(
                      "{time}",
                      formatTimestamp(overview.checked_at, "time", language, platformTimezone),
                    )
                  : null,
              ].filter(Boolean).join(" · ")
            : signalSystemTiles.find((t) => t.key === "source_health")?.detail}
        </span>
        <button
          className="console-text-button"
          type="button"
          onClick={() => onSelectNav?.("sources")}
        >
          {tKey("shell.navSources")} →
        </button>
      </footer>
      {secondaryContent}
    </div>
  );
}
