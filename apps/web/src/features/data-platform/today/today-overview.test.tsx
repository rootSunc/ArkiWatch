import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { ScenarioLiveSignals } from "../scenario-live-hints";
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
  timezone: "Europe/Helsinki",
  recommendationCoverageArea: null,
  headline: "A clear day",
  recommendationMode: "live",
  planItems: [],
  scenarioSections: [],
  summaryTiles: [],
  topActions: [],
};

describe("TodayOverview source health notice", () => {
  it("surfaces source issues before the user acts on the brief", () => {
    const onOpenSignals = vi.fn();

    render(
      <I18nProvider language="zh">
        <TodayOverview
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
    expect(screen.getByText("行动前请先查看信号状态。")).toBeInTheDocument();
    expect(
      screen.getByText("有 2 个数据源需要关注").closest(".today-source-warning"),
    ).toBeInTheDocument();
  });

  it("keeps public Today visible and exposes a retry when personal context fails", () => {
    const onRetryPersonalDashboard = vi.fn();

    render(
      <I18nProvider language="en">
        <TodayOverview
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
          personalDashboardError="Personal dashboard request failed with 503."
          planItems={[]}
          sourceIssueCount={0}
          todayBrief={brief}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "Scenario overview" })).toBeInTheDocument();
    expect(screen.getByText("Personal guidance is temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText("Personal dashboard request failed with 503.")).toBeInTheDocument();

    screen.getByRole("button", { name: "Retry personal guidance" }).click();
    expect(onRetryPersonalDashboard).toHaveBeenCalledOnce();
  });
});
