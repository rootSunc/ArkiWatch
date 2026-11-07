import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataPlatformOverview } from "./data-platform-overview";
import { I18nProvider } from "./i18n";
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
});
