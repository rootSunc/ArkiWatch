import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n";
import { RecentEventsPanel } from "./recent-events-panel";
import type { PlatformCategory, PlatformEvent } from "./types";

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
    latestEventTone: "bad",
    latestUnreadEvent: event,
    onCloseEventDetail: vi.fn(),
    onMarkEventRead: vi.fn(),
    onOpenEvent: vi.fn(),
    onSelectEvent: vi.fn(),
    onToggleExpanded: vi.fn(),
    platformTimezone: "Europe/Helsinki",
    readRecentEventIds: new Set(),
    selectedEvent: null,
    selectedEventId: null,
    timeScope: null,
    unreadVisibleEvents: [event],
    visibleEvents: [event],
    visibleNotificationEvents: [event],
    overallNotification: {
      body: "Rain may affect the commute.",
      detail: "Source-level evidence remains available below.",
      title: "Weather · 1 notification",
    },
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

    expect(screen.getByRole("complementary", { name: "Recent events" })).toHaveTextContent(
      "Heavy rain",
    );
    fireEvent.click(screen.getByRole("button", { name: /Open event detail/ }));

    expect(onMarkEventRead).toHaveBeenCalledWith("rain-1");
    expect(onSelectEvent).toHaveBeenCalledWith(event, expect.anything());
  });

  it("keeps decorative notification ligatures out of the accessibility tree", () => {
    const { container } = renderPanel();

    const notificationIcons = Array.from(container.querySelectorAll(".material-symbols-outlined")).filter(
      (icon) => icon.textContent?.trim() === "notifications",
    );

    expect(notificationIcons).toHaveLength(2);
    for (const icon of notificationIcons) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("does not mount the event surface while collapsed", () => {
    renderPanel({ isExpanded: false });

    expect(screen.queryByRole("complementary", { name: "Recent events" })).not.toBeInTheDocument();
  });
});
