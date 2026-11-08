import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import { SourcesWorkspace } from "./sources-workspace";
import { demoFixtureForScope } from "./demo/demo-data";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("source execution evidence", () => {
  it("shows an earlier successful run when the latest execution failed", () => {
    const overview = demoFixtureForScope().overview;
    const source = {
      ...overview.sources[0],
      last_run_status: "failed",
      last_run_finished_at: "2026-08-09T12:00:00Z",
      last_successful_run_at: "2026-08-08T04:15:00Z",
      run_history: [
        { date: "2026-08-08", runs: 2, succeeded: 1, failed: 1, running: 0 },
        { date: "2026-08-09", runs: 0, succeeded: 0, failed: 0, running: 0 },
      ],
    };
    render(
      <I18nProvider language="en">
        <SourcesWorkspace overview={{ ...overview, sources: [source] }} />
      </I18nProvider>,
    );
    const row = screen.getByRole("table").querySelector("tbody tr")!;
    expect(
      within(row as HTMLElement).getByText(/08 Aug, 07:15/),
    ).toBeInTheDocument();
    expect(screen.getByText(/last run 07:15/)).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent?.replace("↕", ""))).toEqual([
      "Provider",
      "Domain",
      "Last successful run",
      "Rows returned",
      "Run duration",
      "Status",
      "7-day runs",
    ]);
    expect(
      screen.getByRole("img", {
        name: /2026-08-08: 2 runs · 1 succeeded · 1 failed/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Recorded runs by Helsinki calendar date/),
    ).toBeInTheDocument();
  });
  it("does not label a failed last run as the last success in older payloads", () => {
    const overview = demoFixtureForScope().overview;
    render(
      <I18nProvider language="en">
        <SourcesWorkspace
          overview={{
            ...overview,
            sources: [
              {
                ...overview.sources[0],
                last_run_status: "failed",
                last_run_finished_at: "2026-08-09T12:00:00Z",
              },
            ],
          }}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText(/09 Aug, 15:00/)).not.toBeInTheDocument();
    expect(
      screen.getByText("7-day run history is not recorded in this snapshot."),
    ).toBeInTheDocument();
  });
});
