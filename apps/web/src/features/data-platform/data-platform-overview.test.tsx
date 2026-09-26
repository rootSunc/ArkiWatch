import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataPlatformOverview } from "./data-platform-overview";
import { I18nProvider } from "./i18n";
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

function renderOverview(searchValue = "") {
  return render(
    <I18nProvider language="en">
      <DataPlatformOverview
        checkedAt={overview.checked_at}
        catalogSignalCards={null}
        catalogSignalCount={0}
        coreSignalCards={null}
        coreSignalCount={0}
        isCatalogExpanded={false}
        isHistorical={false}
        onCatalogToggle={() => undefined}
        onOpenToday={() => undefined}
        onSearchChange={() => undefined}
        overview={overview}
        platformTimezone="Europe/Helsinki"
        searchValue={searchValue}
        signalSystemTiles={[]}
        sourceHealth={null}
        secondaryContent={null}
        todayBrief={null}
      />
    </I18nProvider>,
  );
}

describe("DataPlatformOverview", () => {
  it("explains an empty scope instead of leaving a single-line placeholder", () => {
    renderOverview();

    expect(screen.getByRole("status")).toHaveTextContent(
      "No usable signal data for this scope.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sources may be missing, stale, or outside the selected city and date. Open Data to inspect the evidence and timestamps.",
    );
    expect(screen.getByRole("status").querySelector(".material-symbols-outlined")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps search misses concise and separate from a missing data scope", () => {
    renderOverview("does-not-match");

    expect(screen.getByText("No signal cards match the current search.")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Sources may be missing, stale, or outside the selected city and date. Open Data to inspect the evidence and timestamps.",
      ),
    ).not.toBeInTheDocument();
  });

  it("returns focus to the search field after clearing a query", () => {
    renderOverview("weather");

    const input = screen.getByRole("textbox", { name: "Search signals, events..." });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveFocus();
  });
});
