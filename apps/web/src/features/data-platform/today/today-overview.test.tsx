import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { ScenarioLiveSignals } from "../overview/scenario-live-hints";
import type { PersonalDashboardRead } from "../personal/personal-dashboard";
import type { TodayBrief } from "./today-brief";
import { TodayOverview } from "./today-overview";

const emptySignals: ScenarioLiveSignals = {
  weather: null,
  airQuality: null,
  transit: null,
  roadRail: null,
  householdEnergy: null,
  systemEnergy: null,
};

const brief: TodayBrief = {
  checkedAt: "2026-08-11T07:00:00+00:00",
  coverageArea: "Espoo / Uusimaa",
  hasScopedData: true,
  historicalSnapshotAvailable: true,
  timezone: "Europe/Helsinki",
  recommendationCoverageArea: null,
  headline: "A clear day",
  recommendationMode: "live",
  planItems: [],
  scenarioSections: [],
  summaryTiles: [],
  topActions: [],
};

const briefWithSummaryTiles: TodayBrief = {
  ...brief,
  summaryTiles: [
    {
      key: "energy",
      label: "Electricity",
      value: "9.60 c/kWh",
      detail: "Current household price window",
      tone: "good",
      icon: "bolt",
    },
  ],
};

describe("TodayOverview source health notice", () => {
  it("explains when the selected scope has no signal data", () => {
    render(
      <I18nProvider language="en">
        <TodayOverview
          isHistorical={false}
          isScopePending={false}
          language="en"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={vi.fn()}
          onOpenSummaryTile={vi.fn()}
          personalDashboard={null}
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={{ ...brief, hasScopedData: false }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("No usable signal data for this scope.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "No usable signal data for this scope.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sources may be missing, stale, or outside the selected city and date. Open Data to inspect the evidence and timestamps.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps long summary values readable instead of hiding their unit", () => {
    render(
      <I18nProvider language="en">
        <TodayOverview
          isHistorical={false}
          isScopePending={false}
          language="en"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={vi.fn()}
          onOpenSummaryTile={vi.fn()}
          personalDashboard={null}
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={briefWithSummaryTiles}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("9.60 c/kWh")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Overview" })).toBeInTheDocument();
  });

  it("surfaces source issues before the user acts on the brief", () => {
    const onOpenSignals = vi.fn();

    render(
      <I18nProvider language="zh">
        <TodayOverview
          isHistorical={false}
          isScopePending={false}
          language="zh"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={onOpenSignals}
          onOpenSummaryTile={vi.fn()}
          planItems={[]}
          personalDashboard={null}
          sourceIssueCount={2}
          todayBrief={brief}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("有 2 个数据源需要关注")).toBeInTheDocument();
    expect(screen.queryByText("行动前请先查看信号状态。")).not.toBeInTheDocument();
    expect(
      screen.getByText("有 2 个数据源需要关注").closest(".today-source-warning"),
    ).toBeInTheDocument();
  });

  it("keeps public Today visible and exposes a retry when personal context fails", () => {
    const onRetryPersonalDashboard = vi.fn();

    render(
      <I18nProvider language="en">
        <TodayOverview
          isHistorical={false}
          isScopePending={false}
          language="en"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={vi.fn()}
          onOpenSummaryTile={vi.fn()}
          onRetryPersonalDashboard={onRetryPersonalDashboard}
          personalDashboard={null}
          personalDashboardError="Personal dashboard request failed with 503. internal token=secret"
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={brief}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "Scenario overview" })).toBeInTheDocument();
    expect(screen.getByText("Personal guidance is temporarily unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The public-data API could not be reached. Check the service and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/internal token=secret/)).not.toBeInTheDocument();

    screen.getByRole("button", { name: "Retry personal guidance" }).click();
    expect(onRetryPersonalDashboard).toHaveBeenCalledOnce();
  });

  it("hides personal guidance from historical evidence views", () => {
    const personalDashboard = {
      onboarding_completion_percent: 60,
      workflow_steps: [
        {
          key: "location",
          title: "Set default location",
          status: "action_required",
          detail: "Missing",
        },
      ],
    } as PersonalDashboardRead;

    render(
      <I18nProvider language="en">
        <TodayOverview
          isHistorical
          isScopePending={false}
          language="en"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={vi.fn()}
          onOpenSummaryTile={vi.fn()}
          personalDashboardError="Personal dashboard request failed with 503."
          personalDashboard={personalDashboard}
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={{
            ...brief,
            headline: "Historical view",
            recommendationMode: "historical",
          }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("Personal guidance is temporarily unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal dashboard request failed with 503.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Personal assistant context" }),
    ).not.toBeInTheDocument();
  });

  it("keeps stale-snapshot guidance focused instead of repeating the same warning", () => {
    render(
      <I18nProvider language="en">
        <TodayOverview
          isHistorical={false}
          isScopePending={false}
          language="en"
          liveSignals={emptySignals}
          onOpenAssistant={vi.fn()}
          onOpenEvent={vi.fn()}
          onOpenScenario={vi.fn()}
          onOpenSignals={vi.fn()}
          onOpenSummaryTile={vi.fn()}
          personalDashboard={null}
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={{
            ...brief,
            headline: "Public snapshot is stale",
            recommendationMode: "stale",
          }}
        />
      </I18nProvider>,
    );

    expect(document.querySelector(".today-recommendation-limit")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today's plan" })).toBeInTheDocument();
    expect(
      screen.getByText("No current decision moments are available until a fresh snapshot arrives."),
    ).toBeInTheDocument();
  });
});
