"use client";

import { useState, type ReactNode } from "react";
import { Card, EmptyState, StatusBadge } from "@/features/shared/ui/console";
import { formatTimestamp, severityTone } from "@/features/shared/format";
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
  coreSignalCards,
  coreSignalCount,
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
  const activeSeries =
    trendSeries.find((s) => s.key === trendKey) ?? trendSeries[0];
  const action = todayBrief?.topActions[0];
  const hasPersonalContext = Boolean(personalDashboard?.today?.cards.length || (personalDashboard?.onboarding_completion_percent ?? 0) > 0);
  const openEvents = events.filter(
    (event) => eventStateAt(event, scopedReferenceTime(overview.time_scope, overview.checked_at)!) === "active",
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
            {tKey(
              todayBrief?.recommendationMode === "live"
                ? "shell.recommendation"
                : "shell.snapshotBrief",
            )}
            {action ? ` · ${action.scenario_key}` : ""}
          </span>
          <h2>
            {todayBrief?.headline ?? tKey("shell.noCurrentRecommendation")}
          </h2>
          {action ? (
            <p>{localizedContent(language, action.body, action.body_zh)}</p>
          ) : null}
          <div className="home-decision-actions">
            <button
              className="console-button console-button-primary"
              onClick={() =>
                action
                  ? onOpenScenario?.(action.scenario_key)
                  : onSelectNav?.("sources")
              }
              type="button"
            >
              {tKey("shell.viewEvidence")} →
            </button>
            <button
              className="console-button"
              onClick={() => onOpenAssistant?.(todayBrief?.headline)}
              type="button"
            >
              {tKey("shell.askAboutThis")}
            </button>
          </div>
          <div className="home-decision-foot">
            {action?.evidence.slice(0, 2).join(" · ") ||
              tKey("shell.addContext")}
            <button
              className="console-text-button"
              type="button"
              aria-label={tKey("shell.editContext")}
              onClick={onEditContext}
            >
              {tKey("shell.editContext")} →
            </button>
          </div>
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
            footer={tKey("shell.savedContext")}
          >
            <DayPlanTimeline
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
        aria-label={tKey("shell.signalStatusArray")}
      >
        <div className="console-section-heading">
          <h2>{tKey("shell.coreSignals")}</h2>
          <span>
            {coreSignalCount} {tKey("shell.tracked")}
          </span>
        </div>
        <div className="home-metrics">
          {coreSignalCards || (
            <EmptyState title={tKey("shell.noSignalDataForScope")} />
          )}
        </div>
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
                <li key={event.id}>
                  <button onClick={() => onOpenEvent?.(event)} type="button">
                    <StatusBadge tone={severityTone(event.severity)}>
                      {enumLabel(event.severity)}
                    </StatusBadge>
                    <span>
                      {localizedContent(language, event.title, event.title_zh)}
                    </span>
                    <time dateTime={event.starts_at}>
                      {formatTimestamp(
                        event.starts_at,
                        "time",
                        language,
                        platformTimezone,
                      )}
                    </time>
                  </button>
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
            ? tKey("shell.sourceSummary")
                .replace("{healthy}", String(health.healthy))
                .replace("{tracked}", String(health.tracked))
                .replace("{issues}", String(health.issues))
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
