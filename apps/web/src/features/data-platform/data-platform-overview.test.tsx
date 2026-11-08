import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataPlatformOverview } from "./data-platform-overview";
import { I18nProvider } from "./i18n";
import type { TodayBrief } from "./today/today-brief";
import type { PlatformOverviewResponse } from "./types";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => vi.unstubAllGlobals());

const overview = {
  checked_at: "2026-08-13T09:30:00Z",
  app_name: "ArkiWatch",
  timezone: "Europe/Helsinki",
  coverage_area: "Helsinki",
  health_status: "healthy",
  categories: [],
  recent_events: [],
  sources: [],
  time_scope: {
    mode: "live",
    is_demo: true,
    date: null,
    timezone: "Europe/Helsinki",
    reference_time: "2026-08-13T09:30:00Z",
    window_start: null,
    window_end: null,
  },
} as PlatformOverviewResponse;

function renderOverview(coreSignalCards: React.ReactNode = null) {
  return render(<I18nProvider language="en"><DataPlatformOverview checkedAt={overview.checked_at} coreSignalCards={coreSignalCards} coreSignalCount={0} onOpenToday={vi.fn()} overview={overview} platformTimezone="Europe/Helsinki" signalSystemTiles={[]} todayBrief={null} /></I18nProvider>);
}

describe("merged Home", () => {
  it("explains missing readings without claiming healthy data", () => {
    renderOverview();
    expect(screen.getByText("No usable signal data for this scope.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your commute to tailor this" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
  });
  it("puts supplied readings directly after the decision and removes the in-page search", () => {
    renderOverview(<span>16 °C</span>);
    expect(screen.getByText("16 °C")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Snapshot checked/)).not.toBeInTheDocument();
  });
  it("shows a clear empty event region and history explanation", () => {
    renderOverview();
    expect(screen.getByText("No open events in this scope")).toBeInTheDocument();
    expect(screen.getByText(/0 of 3 observations/)).toBeInTheDocument();
  });

  it("keeps advice evidence closed until the reader asks for the source and time", () => {
    const onOpenScenario = vi.fn();
    render(
      <I18nProvider language="en">
        <DataPlatformOverview
          checkedAt={overview.checked_at}
          coreSignalCards={<span>16 °C</span>}
          coreSignalCount={1}
          onOpenScenario={onOpenScenario}
          onOpenToday={vi.fn()}
          overview={overview}
          platformTimezone="Europe/Helsinki"
          signalSystemTiles={[]}
          todayBrief={{
            ...liveBrief,
            scenarioSections: [{ key: "commute", source_codes: ["fmi", "hsl"] } as TodayBrief["scenarioSections"][number]],
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Leave ten minutes early" })).toBeInTheDocument();
    expect(screen.getByText("A westbound transit alert overlaps the morning departure.")).toBeInTheDocument();
    expect(screen.getByText("Start here for going out: weather, air, and travel in the selected city. Open a card to see the source and observation time.")).toBeInTheDocument();
    expect(screen.getByText("FMI · HSL · checked 12:30")).toBeInTheDocument();
    const evidence = screen.getByText("Source, time, and area").closest("details");
    expect(evidence).not.toHaveAttribute("open");
    expect(evidence).toHaveTextContent("Digitransit alert for route 9");
    expect(evidence).toHaveTextContent("Helsinki · Helsinki / Uusimaa");
    screen.getByRole("button", { name: "Review action →" }).click();
    expect(onOpenScenario).toHaveBeenCalledWith("commute");
  });

  it("withholds a recommendation when the snapshot cannot support one", () => {
    render(
      <I18nProvider language="en">
        <DataPlatformOverview
          checkedAt={overview.checked_at}
          coreSignalCards={null}
          coreSignalCount={0}
          onOpenToday={vi.fn()}
          overview={overview}
          platformTimezone="Europe/Helsinki"
          signalSystemTiles={[]}
          todayBrief={{ ...liveBrief, recommendationMode: "stale", headline: "Public snapshot is stale" }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("A westbound transit alert overlaps the morning departure.")).not.toBeInTheDocument();
    expect(screen.getByText(/too old for today's advice/)).toBeInTheDocument();
    expect(screen.queryByText("Source, time, and area")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See weather, air, and travel →" })).toBeInTheDocument();
  });

  it("names how many providers back the home summary", () => {
    render(
      <I18nProvider language="en">
        <DataPlatformOverview
          checkedAt={overview.checked_at}
          coreSignalCards={null}
          coreSignalCount={0}
          onOpenToday={vi.fn()}
          overview={{
            ...overview,
            sources: [{ source_code: "fmi" }, { source_code: "hsl" }, { source_code: "hsy" }] as PlatformOverviewResponse["sources"],
            source_health: {
              tracked: 9,
              healthy: 9,
              issues: 0,
              catalog: 0,
              historical: false,
              catalog_source_ids: [],
            },
          }}
          platformTimezone="Europe/Helsinki"
          signalSystemTiles={[]}
          todayBrief={null}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("9/9 collectors healthy · 0 need attention · 3 sources · checked 12:30")).toBeInTheDocument();
    expect(screen.getByText("checked 12:30", { exact: true })).toBeInTheDocument();
  });

  it("keeps reference signals behind All until the reader opens them", () => {
    render(
      <I18nProvider language="en">
        <DataPlatformOverview
          catalogSignalCards={<span>City services</span>}
          catalogSignalCount={1}
          checkedAt={overview.checked_at}
          coreSignalCards={<span>16 °C</span>}
          coreSignalCount={1}
          onOpenToday={vi.fn()}
          overview={overview}
          platformTimezone="Europe/Helsinki"
          signalSystemTiles={[]}
          todayBrief={null}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("City services")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand or collapse data catalog signals" }));
    expect(screen.getByText("City services")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data catalog" })).toBeInTheDocument();
  });
});

const liveBrief: TodayBrief = {
  checkedAt: "2026-08-13T09:30:00Z",
  coverageArea: "Helsinki / Uusimaa",
  hasScopedData: true,
  historicalSnapshotAvailable: true,
  timezone: "Europe/Helsinki",
  recommendationCoverageArea: null,
  headline: "Leave ten minutes early",
  recommendationMode: "live",
  planItems: [],
  scenarioSections: [],
  summaryTiles: [],
  topActions: [
    {
      id: "commute-1",
      scenario_key: "commute",
      title: "Leave ten minutes early",
      body: "A westbound transit alert overlaps the morning departure.",
      severity: "MEDIUM",
      area_scope: "Helsinki",
      freshness_state: "fresh",
      valid_from: "2026-08-13T05:00:00Z",
      valid_to: "2026-08-13T08:00:00Z",
      evidence: ["Digitransit alert for route 9"],
    },
  ],
};
