import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "./i18n";
import { SignalObservatoryOverview } from "./signal-observatory-overview";
import type { SignalSystemTile } from "./signals-console";
import type { PlatformOverviewResponse } from "./types";

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

const tiles: SignalSystemTile[] = [
  {
    key: "signal_categories",
    label: "Signal categories",
    value: "9",
    detail: "4 active · 2 empty · 3 catalog",
    tone: "good",
    icon: "hub",
    valueStyle: "emphasis",
  },
];

describe("SignalObservatoryOverview", () => {
  it("keeps freshness metadata and system summaries together", () => {
    render(
      <I18nProvider language="en">
        <SignalObservatoryOverview
          overview={overview}
          platformTimezone="Europe/Helsinki"
          tiles={tiles}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "Signal observatory" })).toHaveTextContent(
      "Signal observatory",
    );
    expect(screen.getByText("Signal categories")).toBeInTheDocument();
    expect(screen.getByText("4 active · 2 empty · 3 catalog")).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });
});
