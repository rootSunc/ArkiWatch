import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import { I18nProvider } from "../../i18n";
import { LinkedEventsWorkspace } from "./linked-events-workspace";
import type { PlatformCategory, PlatformEvent } from "../../types";

const events: PlatformEvent[] = [
  {
    id: "event-1",
    category_key: "events",
    event_type: "public_event",
    title: "Design workshop",
    body: "A public workshop at the library.",
    severity: "LOW",
    starts_at: "2026-08-13T10:00:00Z",
    ends_at: "2026-08-13T12:00:00Z",
    source_codes: ["linkedevents"],
    evidence: ["fixture"],
    attributes: {
      activity_type: "Culture",
      address: "Central Street 1",
      event_status: "EventScheduled",
      is_free: true,
      keywords: ["culture", "library"],
      latitude: 60.17,
      longitude: 24.94,
      place_name: "Central Library",
      provider: "City events",
    },
  },
  {
    id: "event-2",
    category_key: "events",
    event_type: "public_event",
    title: "Morning run club",
    body: "A guided run in the park.",
    severity: "LOW",
    starts_at: "2026-08-13T13:00:00Z",
    ends_at: "2026-08-13T14:00:00Z",
    source_codes: ["linkedevents"],
    evidence: ["fixture"],
    attributes: {
      activity_type: "Sports",
      address: "Park Road 2",
      event_status: "EventScheduled",
      is_free: true,
      keywords: ["sports", "outdoors"],
      latitude: 60.18,
      longitude: 24.95,
      place_name: "Central Park",
      provider: "City events",
    },
  },
];

const category: PlatformCategory = {
  key: "events",
  title: "Linked Events",
  description: "Public events and activities.",
  status: "healthy",
  stage: "connected",
  priority: "P1",
  source_codes: ["linkedevents"],
  summary_metrics: [],
  visualizations: [],
  events,
  sources: [],
};

function renderWorkspace(
  workspaceCategory: PlatformCategory = category,
  checkedAt = "2026-08-13T07:00:00Z",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider language="en">
        <LinkedEventsWorkspace category={workspaceCategory} checkedAt={checkedAt} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("LinkedEventsWorkspace selection semantics", () => {
  it("exposes venue, tag, event, and inspector selection state", () => {
    renderWorkspace();

    const venues = screen.getByRole("group", { name: "Top venues" });
    const centralLibrary = within(venues).getByRole("button", { name: /Central Library/ });
    expect(centralLibrary).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(centralLibrary);
    expect(centralLibrary).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Filters/ }));
    expect(centralLibrary).toHaveAttribute("aria-pressed", "false");

    const tags = screen.getByRole("group", { name: "Activity tags" });
    const culture = within(tags).getByRole("button", { name: /culture/ });
    expect(culture).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(culture);
    expect(culture).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Filters/ }));
    expect(culture).toHaveAttribute("aria-pressed", "false");

    const activityList = screen.getByRole("group", { name: "Activity list" });
    const firstEvent = within(activityList).getByRole("button", { name: /Design workshop/ });
    const secondEvent = within(activityList).getByRole("button", { name: /Morning run club/ });
    expect(firstEvent).toHaveAttribute("aria-pressed", "true");
    expect(secondEvent).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(secondEvent);
    expect(firstEvent).toHaveAttribute("aria-pressed", "false");
    expect(secondEvent).toHaveAttribute("aria-pressed", "true");

    const inspectorVenueFilter = screen.getByRole("button", { name: "Filter by this venue" });
    expect(inspectorVenueFilter).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(inspectorVenueFilter);
    expect(inspectorVenueFilter).toHaveAttribute("aria-pressed", "true");
  });

  it("does not keep an out-of-filter event in the inspector when no results remain", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /Learning: 0/ }));

    expect(screen.getByRole("status")).toHaveTextContent("No activities match the current filters.");
    expect(screen.getByText("No upcoming activities")).toBeVisible();
    expect(screen.getByText("No selected event")).toBeVisible();
    expect(screen.queryByText("Design workshop")).not.toBeInTheDocument();
    expect(screen.queryByText("Morning run club")).not.toBeInTheDocument();
  });

  it("gives the zero-result empty state a headline and a separate detail line", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /Learning: 0/ }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No matching activities");
    expect(status).toHaveTextContent("No activities match the current filters.");
    expect(status.textContent).not.toMatch(
      /No activities match the current filters\..*No activities match the current filters\./,
    );
  });

  it("explains when the city feed has no activities instead of blaming filters", () => {
    renderWorkspace({ ...category, status: "empty", events: [] });

    expect(screen.getByRole("status")).toHaveTextContent(
      "No activities are available for the selected city yet. The city-specific feed may need a fresh collection.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("No activities match the current filters.");
  });

  it("clears an active time filter from a zero-result state", () => {
    renderWorkspace(category, "2026-08-20T07:00:00Z");

    fireEvent.click(screen.getByRole("button", { name: "Today: 0" }));

    const clearFilterButtons = screen.getAllByRole("button", { name: /^Clear Filters/ });
    expect(clearFilterButtons).toHaveLength(2);
    expect(clearFilterButtons[0]).toBeVisible();
    fireEvent.click(clearFilterButtons[0]);

    expect(screen.queryByRole("button", { name: /^Clear Filters/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All: 0" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not include the decorative clear icon in the filter button name", () => {
    renderWorkspace(category, "2026-08-20T07:00:00Z");

    fireEvent.click(screen.getByRole("button", { name: "Today: 0" }));

    expect(screen.getAllByRole("button", { name: "Clear Filters" })[0]).toBeVisible();
  });
});
