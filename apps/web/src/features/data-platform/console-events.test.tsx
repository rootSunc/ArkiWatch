import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConsoleEvents } from "./console-events";
import { I18nProvider } from "./i18n";
import type { PlatformEvent, PlatformTimeScope } from "./types";

const event = {
  id: "tram",
  category_key: "transit",
  title: "Westbound tram is slower",
  body: "Leave a few minutes earlier.",
  severity: "HIGH",
  starts_at: "2026-08-09T05:00:00Z",
  ends_at: "2026-08-09T08:00:00Z",
  source_codes: ["digitransit"],
} as PlatformEvent;

const timeScope: PlatformTimeScope = {
  mode: "live",
  date: null,
  timezone: "Europe/Helsinki",
  reference_time: "2026-08-09T06:00:00Z",
  window_start: null,
  window_end: null,
};

describe("ConsoleEvents", () => {
  it("lists the event before the extra filters", () => {
    render(
      <I18nProvider language="en">
        <ConsoleEvents
          categories={[]}
          checkedAt="2026-08-09T06:00:00Z"
          coverage="Helsinki"
          events={[event]}
          onOpenEvent={vi.fn()}
          timeScope={timeScope}
          timezone="Europe/Helsinki"
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Westbound tram is slower").closest("tr")).toHaveAttribute("data-tone", "bad");
    expect(screen.getByText("1 open · 1 today")).toBeInTheDocument();
    expect(screen.getByText(/Helsinki · Linked Events \+ incident feeds ·/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Domain" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Transit" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "08:00" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Opens details" })).toBeInTheDocument();
    expect(screen.getByText("Westbound tram is slower").closest("tr")).toHaveTextContent("›");
    expect(screen.getByRole("button", { name: "All" })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Open" })).toHaveTextContent("1");
    expect(screen.getByRole("combobox", { name: "Severity" }).closest("details")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Provider" }).closest("details")).toBeNull();
    const filters = screen.getByText("More filters").closest("details");
    expect(filters).not.toHaveAttribute("open");
    expect(filters?.querySelector("select")).not.toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search events" })).toBeInTheDocument();
  });

  it("asks about the event without leaving the list", () => {
    const onAsk = vi.fn();
    render(
      <I18nProvider language="en">
        <ConsoleEvents
          categories={[]}
          checkedAt="2026-08-09T06:00:00Z"
          events={[event]}
          onAsk={onAsk}
          onOpenEvent={vi.fn()}
          timeScope={timeScope}
          timezone="Europe/Helsinki"
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Ask about this: Westbound tram is slower" }).click();
    expect(onAsk).toHaveBeenCalledWith("Westbound tram is slower: Leave a few minutes earlier.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
