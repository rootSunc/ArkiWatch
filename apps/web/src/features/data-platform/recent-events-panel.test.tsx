import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import { RecentEventsPanel } from "./recent-events-panel";
import type { PlatformCategory, PlatformEvent } from "./types";

// jsdom has no top-layer API; browser tests verify native modal behavior.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

const event: PlatformEvent = {
  id: "rain-1",
  category_key: "weather",
  event_type: "heavy_rain",
  title: "Heavy rain",
  title_zh: "强降雨",
  body: "Rain is expected during the morning commute.",
  body_zh: "早高峰期间预计有降雨。",
  severity: "HIGH",
  starts_at: "2026-08-13T08:00:00Z",
  ends_at: "2026-08-13T10:00:00Z",
  source_codes: ["fmi"],
  evidence: ["forecast"],
  attributes: { precipitation_mm: 12 },
};

const categories = [
  {
    key: "weather",
    title: "Weather",
    description: "Weather signals",
    status: "active",
    stage: "connected",
    priority: "high",
    source_codes: ["fmi"],
    summary_metrics: [],
    visualizations: [],
    events: [event],
    sources: [],
  },
] satisfies PlatformCategory[];

function renderPanel(overrides: Partial<ComponentProps<typeof RecentEventsPanel>> = {}) {
  const props: ComponentProps<typeof RecentEventsPanel> = {
    categories,
    checkedAt: "2026-08-13T07:00:00Z",
    city: "helsinki",
    eventDetailCloseRef: { current: null },
    eventReferenceAt: "2026-08-13T07:00:00Z",
    isExpanded: true,
    onCloseEventDetail: vi.fn(),
    onMarkEventRead: vi.fn(),
    onOpenEvent: vi.fn(),
    onSelectEvent: vi.fn(),
    onToggleExpanded: vi.fn(),
    platformTimezone: "Europe/Helsinki",
    readRecentEventIds: new Set(),
    selectedEvent: null,
    timeScope: null,
    visibleEvents: [event],
    ...overrides,
  };

  return render(
    <I18nProvider language="en">
      <RecentEventsPanel {...props} />
    </I18nProvider>,
  );
}

describe("RecentEventsPanel", () => {
  it("renders the timeline and delegates read/detail actions", () => {
    const onMarkEventRead = vi.fn();
    const onSelectEvent = vi.fn();
    renderPanel({ onMarkEventRead, onSelectEvent });

    expect(screen.getByRole("dialog", { name: "Recent events" })).toHaveTextContent(
      "Heavy rain",
    );
    fireEvent.click(screen.getByRole("button", { name: /Open event detail/ }));

    expect(onMarkEventRead).toHaveBeenCalledWith("rain-1");
    expect(onSelectEvent).toHaveBeenCalledWith(event, expect.anything());
  });

  it("mounts outside the workspace and restores body scrolling on unmount", () => {
    const { container, unmount } = renderPanel();
    const dialog = screen.getByRole("dialog", { name: "Recent events" });
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("filters read events with a useful empty state", () => {
    renderPanel({ readRecentEventIds: new Set([event.id]) });
    fireEvent.click(screen.getByRole("button", { name: /Unread/ }));
    expect(screen.queryByRole("button", { name: /Open event detail/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You’re all caught up");
    fireEvent.click(screen.getByRole("button", { name: /All events/ }));
    expect(screen.getByRole("button", { name: /Open event detail/ })).toBeVisible();
  });

  it("shows detail as a separate screen and delegates back and workspace actions", () => {
    const onCloseEventDetail = vi.fn();
    const onOpenEvent = vi.fn();
    renderPanel({ selectedEvent: event, onCloseEventDetail, onOpenEvent });
    expect(screen.queryByRole("button", { name: /Open event detail/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heavy rain" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to events" }));
    expect(onCloseEventDetail).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    expect(onOpenEvent).toHaveBeenCalledWith(event);
  });

  it("handles Escape as back in detail and close in the list", () => {
    const onCloseEventDetail = vi.fn();
    const onToggleExpanded = vi.fn();
    renderPanel({ selectedEvent: event, onCloseEventDetail, onToggleExpanded });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCloseEventDetail).toHaveBeenCalledOnce();
    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it("does not mount the event surface while collapsed", () => {
    renderPanel({ isExpanded: false });

    expect(screen.queryByRole("dialog", { name: "Recent events" })).not.toBeInTheDocument();
  });
});
